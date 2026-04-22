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
import { fetchTodasAbas, fetchCadastroClientes, fetchTodasTarefasBatch } from "@/lib/sheets";

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

const TODAY = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

function isAtrasado(prazoStr: string, status: string): boolean {
  if (/finaliz|cancelad/i.test(status)) return false; // já finalizado ou cancelado
  const prazo = parseDateBR(prazoStr);
  if (!prazo) return false;
  return prazo < TODAY;
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
  abasDisponiveis: string[], // abas filtradas MM\d+
  idCliente: string,
  nomeEmpresa: string,
  todasAbas: string[] = [] // todas as abas (fallback para abas sem prefixo MM)
): string | null {
  const idLower = idCliente.toLowerCase();
  const nomeLower = nomeEmpresa.toLowerCase().replace(/\s+/g, "");

  // 1ª: ID como prefixo (MM039_Nome ou MM039 Nome ou exatamente MM039)
  const porId = abasDisponiveis.find((a) => {
    const al = a.toLowerCase();
    return al.startsWith(idLower + "_") || al.startsWith(idLower + " ") || al === idLower;
  });
  if (porId) return porId;

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

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function importarPlanilha(): Promise<ImportResult> {
  const supabase = createClient();
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

  // ── 3a. Snapshots manuais (preservar após delete) ──

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
      (t: { cliente_id: string; o_que: string; prazo: string | null; etapa: string | null }) =>
        `${t.cliente_id}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`
    )
  );

  // ── 3. Limpa tarefas e clientes antigos ──
  // Tarefas primeiro (referência a mm_clientes via cliente_id)
  const { error: errLimparTarefas } = await supabase
    .from("mm_tarefas")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (errLimparTarefas) {
    erros.push(`Erro ao limpar tarefas antigas: ${errLimparTarefas.message}`);
    return vazio();
  }

  const { error: errLimpar } = await supabase
    .from("mm_clientes")
    .delete()
    .neq("id_cliente", "__never__");

  if (errLimpar) {
    erros.push(`Erro ao limpar clientes antigos: ${errLimpar.message}`);
    return vazio();
  }

  // ── 4. Monta payload de clientes ──
  const clientesPayload = clientesSheet.map((c) => {
    const aba = encontrarAba(abasClientes, c.id_cliente, c.nome_empresa, todasAbas);
    if (!aba) semAbas.push(`${c.id_cliente} (${c.nome_empresa})`);
    return {
      id_cliente: c.id_cliente,
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
        const override = statusOverrides.get(c.id_cliente);
        // Override manual (Pausado/Encerrado) prevalece quando a planilha diz "Ativo"
        return override && sheetStatus === "Ativo" ? override : sheetStatus;
      })(),
      responsavel_mm: c.responsavel_mm || null,
      observacoes: c.observacoes || null,
      sheets_aba: aba,
      atualizado_em: new Date().toISOString(),
    };
  });

  // ── 4b. Desduplicar por nome_empresa (mantém o menor ID MM) ──
  // Evita duplicatas quando a planilha tem a mesma empresa com IDs diferentes
  const seenNomes = new Map<string, (typeof clientesPayload)[0]>();
  for (const c of clientesPayload) {
    const key = c.nome_empresa.toLowerCase().trim();
    const existing = seenNomes.get(key);
    if (!existing) {
      seenNomes.set(key, c);
    } else {
      const existNum = parseInt(existing.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      const newNum = parseInt(c.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      if (newNum < existNum) seenNomes.set(key, c); // mantém o ID mais antigo (menor número)
    }
  }
  const clientesPayloadDedup = Array.from(seenNomes.values());

  const duplicatasRemovidas = clientesPayload.length - clientesPayloadDedup.length;
  if (duplicatasRemovidas > 0) {
    erros.push(
      `Aviso: ${duplicatasRemovidas} entrada(s) duplicada(s) por nome_empresa removida(s) da importação (mantido o menor ID).`
    );
  }

  // ── 5. Insere clientes frescos ──
  const { error: errClientes } = await supabase.from("mm_clientes").insert(clientesPayloadDedup);

  if (errClientes) {
    erros.push(`Erro ao salvar clientes: ${errClientes.message}`);
    return vazio();
  }
  totalClientes = clientesPayloadDedup.length;

  // ── 6. Busca TODAS as tarefas em batchGet ──
  const abasComCliente = clientesPayloadDedup
    .filter((c) => c.sheets_aba)
    .map((c) => ({
      id_cliente: c.id_cliente,
      sheets_aba: c.sheets_aba as string,
      nome_empresa: c.nome_empresa,
    }));

  let todasTarefasLote: Record<string, import("@/lib/sheets").TarefaSheet[]> = {};
  try {
    todasTarefasLote = await fetchTodasTarefasBatch(abasComCliente.map((c) => c.sheets_aba));
  } catch (err) {
    erros.push(`Erro ao buscar tarefas (batchGet): ${String(err)}`);
  }

  // ── 7. Monta e insere tarefas ──
  for (const cliente of abasComCliente) {
    const tarefas = todasTarefasLote[cliente.sheets_aba] ?? [];

    if (tarefas.length === 0) {
      semTarefas.push(`${cliente.id_cliente} (${cliente.nome_empresa})`);
      continue;
    }

    const tarefasPayload = tarefas.map((t: import("@/lib/sheets").TarefaSheet) => {
      const prazoISO = parseDateBR(t.prazo);
      const statusNorm = normalizeTaskStatus(t.status, t.check_feito);
      const statusFinal = t.check_feito
        ? "Finalizado"
        : isAtrasado(t.prazo, statusNorm)
          ? "Atrasado"
          : statusNorm;
      return {
        cliente_id: cliente.id_cliente,
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

    const { error: errInsert } = await supabase.from("mm_tarefas").insert(tarefasPayload);

    if (errInsert) {
      erros.push(`Erro ao salvar tarefas de ${cliente.nome_empresa}: ${errInsert.message}`);
    } else {
      totalTarefas += tarefasPayload.length;
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
        }) => checksSet.has(`${t.cliente_id}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`)
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
