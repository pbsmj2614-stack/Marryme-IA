/**
 * importSheets.ts — Importação Google Sheets → Supabase
 *
 * Fluxo:
 * 1. Busca todas as abas da planilha
 * 2. Lê Cadastro_Clientes → upsert em mm_clientes
 * 3. Para cada cliente, acha a aba correspondente e importa tarefas
 * 4. Marca como 'Atrasado' se prazo < hoje e status ≠ 'Finalizado'
 */

import { createClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTodasAbas, fetchCadastroClientes, fetchTodasTarefasBatch, fetchAndParseTarefasAba, parseLooksSuspicious, scoreTarefasParse } from "@/lib/sheets";
import {
  getAbaIdPrefixFromTitle,
  normalizeMmId,
} from "@/lib/sheets-cadastro";
import {
  collectAbaCandidates,
  resolveSheetsAba,
  abaMatchesNomeEmpresa,
} from "@/lib/sheets-aba-resolve";
import { clienteIdsForTarefas } from "@/lib/client-utils";

export interface ImportResult {
  clientes: number;
  tarefas: number;
  erros: string[];
  semAbas: string[]; // clientes sem aba no Sheets
  semTarefas: string[]; // clientes com aba mas 0 tarefas importadas
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Converte D/M/YYYY, DD/MM/YYYY, DD/MM/YY ou YYYY-MM-DD para YYYY-MM-DD.
 * Retorna null se não reconhecer o formato.
 */
function parseDateBR(str: string): string | null {
  if (!str || str.trim() === "") return null;
  const s = str.trim();

  // D/M/YYYY ou DD/MM/YYYY (aceita 1 ou 2 dígitos no dia e mês)
  const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, "0");
    const m = brMatch[2].padStart(2, "0");
    return `${brMatch[3]}-${m}-${d}`;
  }

  // D/M/YY (ano com 2 dígitos)
  const brShort = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (brShort) {
    const d = brShort[1].padStart(2, "0");
    const m = brShort[2].padStart(2, "0");
    const y = parseInt(brShort[3]) < 50 ? `20${brShort[3]}` : `19${brShort[3]}`;
    return `${y}-${m}-${d}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

function isAtrasado(prazoStr: string, status: string): boolean {
  if (/finaliz|cancelad/i.test(status)) return false; // já finalizado ou cancelado
  const prazo = parseDateBR(prazoStr);
  if (!prazo) return false;
  return prazo < new Date().toISOString().split("T")[0];
}

// Normaliza status do cliente para "Ativo", "Pausado" ou "Encerrado"
function normalizeClientStatus(s: string): "Ativo" | "Pausado" | "Encerrado" {
  if (!s?.trim()) return "Ativo";
  if (/paus/i.test(s)) return "Pausado";
  if (/encerr/i.test(s)) return "Encerrado";
  return "Ativo";
}

// Normaliza status da tarefa para valor canônico
function normalizeTaskStatus(s: string, checkFeito: boolean): string {
  if (checkFeito) return "Finalizado";
  if (!s?.trim()) return "Não iniciado";
  if (/finaliz|conclu|feito|done/i.test(s)) return "Finalizado";
  if (/andamento|progress|em curso/i.test(s)) return "Em andamento";
  if (/atras|vencid/i.test(s)) return "Atrasado";
  if (/cancelad/i.test(s)) return "Cancelado";
  if (/não inici|nao inici|pendente|aberto/i.test(s)) return "Não iniciado";
  return s.trim(); // preserva valor original se não reconhecer
}

// ─── Tab matching ─────────────────────────────────────────────────────────────

/**
 * Casa o id_cliente com o nome da aba no padrão "MM039_NomeCliente".
 * Prioridade:
 *  1. Aba começa com ID + "_"  → MM039_AlexandrePissarro  ✓
 *  2. Aba é exatamente o ID    → MM039                    ✓
 *  3. Nome da empresa na aba   → fallback fuzzy            ✓
 */
function encontrarAba(
  abasDisponiveis: string[],
  idCliente: string,
  nomeEmpresa: string,
  todasAbas: string[] = []
): string | null {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const idLower = idNorm.toLowerCase();
  const nomeLower = nomeEmpresa.toLowerCase().replace(/\s+/g, "");

  const porId = abasDisponiveis.find((a) => {
    const al = a.toLowerCase();
    return al.startsWith(idLower + "_") || al.startsWith(idLower + " ") || al === idLower;
  });
  if (porId) return porId;

  const porPrefixo = abasDisponiveis.find((a) => getAbaIdPrefixFromTitle(a) === idNorm);
  if (porPrefixo) return porPrefixo;

  // 2ª: nome da empresa nas abas MM
  const porNomeMM = abasDisponiveis.find((a) => {
    const aLower = a.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
    return aLower.includes(nomeLower) || nomeLower.includes(aLower);
  });
  if (porNomeMM) return porNomeMM;

  // 3ª: busca em TODAS as abas pelo nome (para abas sem prefixo MM)
  const porNomeTodas = todasAbas.find((a) => {
    const aLower = a.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
    return aLower.includes(nomeLower) || nomeLower.includes(aLower);
  });
  return porNomeTodas ?? null;
}

/** Escolhe aba + tarefas parseadas entre candidatos (refetch só quando lote vazio/suspeito). */
async function pickBestTarefasFromAbas(
  abas: string[],
  lote: Record<string, import("@/lib/sheets").TarefaSheet[]>
): Promise<{ aba: string; tarefas: import("@/lib/sheets").TarefaSheet[] }> {
  let bestAba = abas[0] ?? "";
  let bestTarefas: import("@/lib/sheets").TarefaSheet[] = [];
  let bestScore = -1;

  for (const aba of abas) {
    let parsed = lote[aba] ?? [];
    const needsRefetch =
      parsed.length === 0 || parseLooksSuspicious(parsed);
    if (needsRefetch) {
      try {
        const refetched = await fetchAndParseTarefasAba(aba);
        if (scoreTarefasParse(refetched) > scoreTarefasParse(parsed)) {
          parsed = refetched;
          lote[aba] = refetched;
        }
      } catch {
        // mantém lote
      }
    }

    const score = scoreTarefasParse(parsed);
    if (score > bestScore) {
      bestScore = score;
      bestAba = aba;
      bestTarefas = parsed;
    }
  }

  if (parseLooksSuspicious(bestTarefas)) {
    return { aba: bestAba, tarefas: [] };
  }
  return { aba: bestAba, tarefas: bestTarefas };
}

/** Sincroniza tarefas de um cliente a partir da planilha (merge seguro — nunca apaga em massa). */
export function taskSyncKey(
  o_que: string,
  prazo: string | null,
  etapa: string | null
): string {
  return `${o_que.trim()}|${prazo ?? ""}|${(etapa ?? "").trim()}`;
}

export interface SyncTarefasResult {
  ok: boolean;
  count: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export async function syncTarefasClienteFromSheet(
  supabase: SupabaseClient,
  cliente: { id_cliente: string; sheets_aba: string; nome_empresa: string },
  tarefas: import("@/lib/sheets").TarefaSheet[]
): Promise<SyncTarefasResult> {
  const emptySkip = (skipReason: string): SyncTarefasResult => ({
    ok: true,
    count: 0,
    inserted: 0,
    updated: 0,
    deleted: 0,
    skipped: true,
    skipReason,
  });

  if (tarefas.length === 0) return emptySkip("planilha_vazia");

  const taskClienteId = normalizeMmId(cliente.id_cliente) ?? cliente.id_cliente;
  const idsRelacionados = clienteIdsForTarefas(taskClienteId, cliente.sheets_aba);

  for (const altId of idsRelacionados) {
    if (altId === taskClienteId) continue;
    await supabase
      .from("mm_tarefas")
      .update({ cliente_id: taskClienteId, atualizado_em: new Date().toISOString() })
      .eq("cliente_id", altId);
  }

  const { data: existingRows, error: errLoad } = await supabase
    .from("mm_tarefas")
    .select("id, o_que, prazo, etapa, check_feito")
    .eq("cliente_id", taskClienteId);

  if (errLoad) {
    return {
      ok: false,
      count: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: errLoad.message,
    };
  }

  const existing = existingRows ?? [];
  const existingCount = existing.length;

  if (parseLooksSuspicious(tarefas)) {
    return emptySkip("parse_suspeito");
  }

  const payloads = tarefas.map((t) => {
    const prazoISO = parseDateBR(t.prazo);
    const statusNorm = normalizeTaskStatus(t.status, t.check_feito);
    const statusFinal = t.check_feito
      ? "Finalizado"
      : isAtrasado(t.prazo, statusNorm)
        ? "Atrasado"
        : statusNorm;
    return {
      cliente_id: taskClienteId,
      check_feito: t.check_feito,
      etapa: t.etapa || null,
      o_que: t.o_que,
      tipo: t.tipo || null,
      quem: t.quem || null,
      prazo: prazoISO,
      status: statusFinal,
      observacoes: t.observacoes || null,
      atualizado_em: new Date().toISOString(),
    };
  });

  // Insert-first: nunca apaga antes de gravar — evita zerar cliente se insert falhar
  const { data: insertedRows, error: errInsert } = await supabase
    .from("mm_tarefas")
    .insert(payloads)
    .select("id");

  if (errInsert) {
    return {
      ok: false,
      count: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: errInsert.message,
    };
  }

  const newIds = (insertedRows ?? []).map((r: { id: string }) => r.id);
  let deleted = 0;

  if (existingCount > 0 && newIds.length > 0) {
    const idsToRemove = existing
      .map((r: { id: string }) => r.id)
      .filter((id: string) => !newIds.includes(id));

    if (idsToRemove.length > 0) {
      const { error: errDelete } = await supabase
        .from("mm_tarefas")
        .delete()
        .in("id", idsToRemove);

      if (errDelete) {
        return {
          ok: false,
          count: newIds.length,
          inserted: newIds.length,
          updated: 0,
          deleted: 0,
          error: `Tarefas inseridas mas falha ao substituir antigas: ${errDelete.message}`,
        };
      }
      deleted = idsToRemove.length;
    }
  }

  return {
    ok: true,
    count: payloads.length,
    inserted: payloads.length,
    updated: 0,
    deleted,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function importarPlanilha(
  supabaseClient?: SupabaseClient
): Promise<ImportResult> {
  const supabase = supabaseClient ?? createClient();
  const erros: string[] = [];
  const semAbas: string[] = [];
  const semTarefas: string[] = [];
  let totalClientes = 0;
  let totalTarefas = 0;

  const vazio = (extra?: Partial<ImportResult>): ImportResult => ({
    clientes: 0,
    tarefas: 0,
    erros,
    semAbas,
    semTarefas,
    ...extra,
  });

  // ── 1. Busca todas as abas ──
  let todasAbas: string[] = [];
  try {
    todasAbas = await fetchTodasAbas();
  } catch (err) {
    erros.push(`Erro ao buscar abas: ${String(err)}`);
    return vazio();
  }

  // ── 2. Busca e valida Cadastro_Clientes ──
  let clientesSheet;
  try {
    clientesSheet = await fetchCadastroClientes();
  } catch (err) {
    erros.push(String(err));
    return vazio();
  }

  // Apenas abas no formato MM039_NomeCliente (ou MM039)
  const abasClientes = todasAbas.filter((a) => /^MM\d+/i.test(a.trim()));

  // ── 3a. Snapshots manuais (preservar após sync) ──

  // Clientes já no Supabase — preservar sheets_aba quando a aba ainda existir
  const { data: existingClientesData } = await supabase
    .from("mm_clientes")
    .select("id_cliente, sheets_aba");
  const existingSheetsAba = new Map<string, string | null>(
    (existingClientesData ?? []).map((c: { id_cliente: string; sheets_aba: string | null }) => [
      c.id_cliente,
      c.sheets_aba,
    ])
  );

  // Status manual (Pausado / Encerrado) definido pelo app — prevalece sobre "Ativo" da planilha
  const { data: statusOverrideData } = await supabase
    .from("mm_clientes")
    .select("id_cliente, status")
    .in("status", ["Pausado", "Encerrado"]);
  const statusOverrides = new Map<string, string>(
    (statusOverrideData ?? []).map((c: { id_cliente: string; status: string }) => [
      c.id_cliente,
      c.status,
    ])
  );

  // Checks manuais feitos no app (check_feito=true que a planilha ainda não reflete)
  const { data: checksExistentes } = await supabase
    .from("mm_tarefas")
    .select("cliente_id, o_que, prazo, etapa")
    .eq("check_feito", true);
  const checksSet = new Set(
    (checksExistentes ?? []).map(
      (t: { cliente_id: string; o_que: string; prazo: string | null; etapa: string | null }) => {
        const idNorm = normalizeMmId(t.cliente_id) ?? t.cliente_id;
        return `${idNorm}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`;
      }
    )
  );

  // ── 3. Monta payload preliminar de clientes ──
  const clientesPreliminar = clientesSheet.map((c) => {
    const idNorm = normalizeMmId(c.id_cliente) ?? c.id_cliente;
    const aba = encontrarAba(abasClientes, idNorm, c.nome_empresa, todasAbas);
    return {
      raw: c,
      id_cliente: idNorm,
      abaEncontrada: aba,
    };
  });

  const abasParaFetch = abasClientes;

  let todasTarefasLote: Record<string, import("@/lib/sheets").TarefaSheet[]> = {};
  try {
    todasTarefasLote = await fetchTodasTarefasBatch(abasParaFetch);
  } catch (err) {
    erros.push(`Erro ao buscar tarefas (batchGet): ${String(err)}`);
  }

  // ── 4. Monta payload final com sheets_aba reconciliada ──
  const clientesPayload = clientesPreliminar.map(({ raw: c, id_cliente, abaEncontrada }) => {
    const existente = existingSheetsAba.get(id_cliente);
    const resolved = resolveSheetsAba(
      id_cliente,
      abaEncontrada,
      existente,
      todasAbas,
      abasClientes,
      todasTarefasLote,
      c.nome_empresa
    );
    // Não zera sheets_aba no upsert se resolve falhou mas aba anterior ainda existe
    const sheets_aba =
      resolved ??
      (existente && todasAbas.includes(existente) ? existente : null);
    if (!sheets_aba) semAbas.push(`${id_cliente} (${c.nome_empresa})`);
    return {
      id_cliente,
      nome_empresa: c.nome_empresa,
      segmento: c.segmento || null,
      cidade: c.cidade || null,
      whatsapp: c.whatsapp || null,
      email: c.email || null,
      inicio_contrato: parseDateBR(c.inicio_contrato),
      plano: c.plano || null,
      fase_projeto: c.fase_projeto || null,
      status: (() => {
        const sheetStatus = normalizeClientStatus(c.status);
        const override = statusOverrides.get(id_cliente);
        return override && sheetStatus === "Ativo" ? override : sheetStatus;
      })(),
      responsavel_mm: c.responsavel_mm || null,
      observacoes: c.observacoes || null,
      sheets_aba,
      atualizado_em: new Date().toISOString(),
    };
  });

  // ── 4b. Aviso sobre duplicatas por nome (UI deduplica; import mantém todos os IDs) ──
  const seenNomes = new Map<string, string>();
  for (const c of clientesPayload) {
    const key = c.nome_empresa.toLowerCase().trim();
    const existingId = seenNomes.get(key);
    if (!existingId) {
      seenNomes.set(key, c.id_cliente);
    } else {
      const existNum = parseInt(existingId.replace(/^MM/i, ""), 10) || 999999;
      const newNum = parseInt(c.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      if (newNum < existNum) seenNomes.set(key, c.id_cliente);
    }
  }
  const duplicatasNomes = clientesPayload.length - seenNomes.size;
  if (duplicatasNomes > 0) {
    erros.push(
      `Aviso: ${duplicatasNomes} empresa(s) com mais de um ID MM no cadastro (exibido o menor ID no app).`
    );
  }

  // ── 5. Upsert TODOS os clientes da planilha (não descarta IDs duplicados por nome) ──
  const { error: errClientes } = await supabase
    .from("mm_clientes")
    .upsert(clientesPayload, { onConflict: "id_cliente" });

  if (errClientes) {
    erros.push(`Erro ao salvar clientes: ${errClientes.message}`);
    return vazio();
  }
  totalClientes = clientesPayload.length;

  // ── 6. Busca TODAS as tarefas em batchGet (todos os IDs com aba) ──
  const abasComCliente = clientesPayload
    .filter((c) => c.sheets_aba)
    .map((c) => ({
      id_cliente: c.id_cliente,
      sheets_aba: c.sheets_aba as string,
      nome_empresa: c.nome_empresa,
    }));

  // ── 7. Sincroniza tarefas por cliente (planilha = fonte de verdade) ──
  for (const cliente of abasComCliente) {
    const abaEncontrada = encontrarAba(
      abasClientes,
      cliente.id_cliente,
      cliente.nome_empresa,
      todasAbas
    );
    const candidatos = collectAbaCandidates(
      cliente.id_cliente,
      abaEncontrada,
      cliente.sheets_aba,
      todasAbas,
      abasClientes,
      cliente.nome_empresa
    );
    const abasTry =
      candidatos.length > 0 ? candidatos : [cliente.sheets_aba];

    let { aba: bestAba, tarefas } = await pickBestTarefasFromAbas(abasTry, todasTarefasLote);

    if (tarefas.length === 0) {
      const porNome = abasClientes.filter((a) =>
        abaMatchesNomeEmpresa(a, cliente.nome_empresa)
      );
      const extra = await pickBestTarefasFromAbas(porNome, todasTarefasLote);
      if (extra.tarefas.length > tarefas.length) {
        bestAba = extra.aba;
        tarefas = extra.tarefas;
      }
    }

    if (bestAba !== cliente.sheets_aba && tarefas.length > 0) {
      await supabase
        .from("mm_clientes")
        .update({ sheets_aba: bestAba, atualizado_em: new Date().toISOString() })
        .eq("id_cliente", cliente.id_cliente);
      cliente.sheets_aba = bestAba;
    }

    if (tarefas.length === 0) {
      semTarefas.push(`${cliente.id_cliente} (${cliente.nome_empresa})`);
      continue;
    }

    const synced = await syncTarefasClienteFromSheet(supabase, cliente, tarefas);
    if (synced.skipped) {
      erros.push(
        `Aviso: ${cliente.nome_empresa} — sync ignorado (${synced.skipReason ?? "desconhecido"})`
      );
      continue;
    }
    if (!synced.ok) {
      erros.push(`Erro ao salvar tarefas de ${cliente.nome_empresa}: ${synced.error}`);
    } else {
      totalTarefas += synced.count;
    }
  }

  // ── 8. Re-aplica checks manuais que a planilha ainda não reflete ──
  if (checksSet.size > 0) {
    const { data: tarefasInseridas } = await supabase
      .from("mm_tarefas")
      .select("id, cliente_id, o_que, prazo, etapa")
      .eq("check_feito", false);

    const idsParaMarcar = (tarefasInseridas ?? [])
      .filter(
        (t: {
          id: string;
          cliente_id: string;
          o_que: string;
          prazo: string | null;
          etapa: string | null;
        }) => {
          const idNorm = normalizeMmId(t.cliente_id) ?? t.cliente_id;
          return checksSet.has(`${idNorm}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`);
        }
      )
      .map((t: { id: string }) => t.id);

    if (idsParaMarcar.length > 0) {
      await supabase
        .from("mm_tarefas")
        .update({
          check_feito: true,
          status: "Finalizado",
          atualizado_em: new Date().toISOString(),
        })
        .in("id", idsParaMarcar);
    }
  }

  return { clientes: totalClientes, tarefas: totalTarefas, erros, semAbas, semTarefas };
}
