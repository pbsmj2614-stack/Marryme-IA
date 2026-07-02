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
import { fetchTodasAbas, fetchCadastroClientes, fetchTodasTarefasBatch, fetchAndParseTarefasAbaWithRetry, parseLooksSuspicious, scoreTarefasParse } from "@/lib/sheets";
import {
  getAbaIdPrefixFromTitle,
  normalizeMmId,
  extractMmNum,
} from "@/lib/sheets-cadastro";
import {
  collectAbaCandidates,
  resolveSheetsAba,
  abaMatchesNomeEmpresa,
  MM_ABA_STRICT_PREFIX_MIN,
} from "@/lib/sheets-aba-resolve";
import { clienteIdsForTarefas } from "@/lib/client-utils";

/** Cohort MM044+ — fetch direto da aba (não confia no batch lote). */
export const MM_COHORT_DIRECT_MIN = 44;
const COHORT_FETCH_DELAY_MS = 280;

function cohortFetchDelay(fromNum: number, idCliente: string): Promise<void> {
  if (extractMmNum(idCliente) < fromNum) return Promise.resolve();
  return new Promise((r) => setTimeout(r, COHORT_FETCH_DELAY_MS));
}

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

  const strictPrefix = extractMmNum(idNorm) >= MM_ABA_STRICT_PREFIX_MIN;
  if (strictPrefix) return null;

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

/** Todas abas plausíveis para um cliente (prefixo MM, nome, sheets_aba, resolve). */
function expandAbaCandidates(
  idCliente: string,
  nomeEmpresa: string,
  sheetsAba: string | null,
  candidatos: string[],
  abasClientes: string[],
  todasAbas: string[]
): string[] {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const raw = [
    ...candidatos,
    sheetsAba,
    ...abasClientes.filter((a) => getAbaIdPrefixFromTitle(a) === idNorm),
    ...abasClientes.filter(
      (a) =>
        abaMatchesNomeEmpresa(a, nomeEmpresa) &&
        getAbaIdPrefixFromTitle(a) === idNorm
    ),
  ];
  return Array.from(new Set(raw.filter((a): a is string => !!a && todasAbas.includes(a))));
}

function abaPrefixOk(aba: string, idCliente: string): boolean {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  if (extractMmNum(idNorm) < MM_ABA_STRICT_PREFIX_MIN) return true;
  const prefix = getAbaIdPrefixFromTitle(aba);
  return !prefix || prefix === idNorm;
}

function normalizeAbaMatchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^mm[\s_-]*\d{1,4}[\s_-]*/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function abaMatchesClienteSemPrefixo(aba: string, nomeEmpresa: string): boolean {
  if (getAbaIdPrefixFromTitle(aba)) return false;
  const abaKey = normalizeAbaMatchKey(aba);
  const nomeKey = normalizeAbaMatchKey(nomeEmpresa);
  if (abaKey.length < 4 || nomeKey.length < 4) return false;
  return abaKey.includes(nomeKey) || nomeKey.includes(abaKey);
}

function addCandidateAba(candidates: string[], aba: string | null | undefined): void {
  if (!aba || candidates.includes(aba)) return;
  candidates.push(aba);
}

/** Prioriza aba com prefixo MM do cliente, depois sheets_aba salva, depois demais. */
function sortAbasByClientePriority(
  abas: string[],
  idCliente: string,
  sheetsAba?: string | null
): string[] {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  return [...abas].sort((a, b) => {
    const rank = (aba: string) => {
      if (getAbaIdPrefixFromTitle(aba) === idNorm) return 0;
      if (sheetsAba && aba === sheetsAba) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}

async function loadParsedTarefasAba(
  aba: string,
  lote: Record<string, import("@/lib/sheets").TarefaSheet[]>,
  forceDirect: boolean
): Promise<import("@/lib/sheets").TarefaSheet[]> {
  let parsed = forceDirect ? [] : (lote[aba] ?? []);
  if (forceDirect || parsed.length === 0 || parseLooksSuspicious(parsed)) {
    try {
      const refetched = await fetchAndParseTarefasAbaWithRetry(aba);
      if (scoreTarefasParse(refetched) > scoreTarefasParse(parsed)) {
        parsed = refetched;
        lote[aba] = refetched;
      }
    } catch {
      // mantém lote
    }
  }
  return parsed;
}

/** Escolhe aba + tarefas parseadas entre candidatos (refetch só quando lote vazio/suspeito). */
async function pickBestTarefasFromAbas(
  abas: string[],
  lote: Record<string, import("@/lib/sheets").TarefaSheet[]>,
  forceDirect = false,
  idCliente?: string,
  sheetsAba?: string | null
): Promise<{ aba: string; tarefas: import("@/lib/sheets").TarefaSheet[] }> {
  const scoped = idCliente ? abas.filter((a) => abaPrefixOk(a, idCliente)) : abas;
  if (scoped.length === 0) return { aba: abas[0] ?? "", tarefas: [] };

  const ordered = idCliente
    ? sortAbasByClientePriority(scoped, idCliente, sheetsAba)
    : scoped;
  const idNorm = idCliente ? (normalizeMmId(idCliente) ?? idCliente) : null;

  let bestNonSuspicious: { aba: string; tarefas: import("@/lib/sheets").TarefaSheet[] } | null =
    null;
  let bestNonSuspiciousScore = -1;
  let bestFallback: { aba: string; tarefas: import("@/lib/sheets").TarefaSheet[] } | null = null;
  let bestFallbackScore = -1;

  for (const aba of ordered) {
    const parsed = await loadParsedTarefasAba(aba, lote, forceDirect);
    const score = scoreTarefasParse(parsed);
    const prefixBonus =
      idNorm && getAbaIdPrefixFromTitle(aba) === idNorm ? 1_000_000 : 0;
    const totalScore = score + prefixBonus;

    if (parsed.length > 0 && totalScore > bestFallbackScore) {
      bestFallbackScore = totalScore;
      bestFallback = { aba, tarefas: parsed };
    }

    if (
      !parseLooksSuspicious(parsed) &&
      parsed.length > 0 &&
      totalScore > bestNonSuspiciousScore
    ) {
      bestNonSuspiciousScore = totalScore;
      bestNonSuspicious = { aba, tarefas: parsed };
    }

    // Prefixo MM correto + parse válido → não refaz fetch das outras abas (429 no cohort)
    if (
      idNorm &&
      getAbaIdPrefixFromTitle(aba) === idNorm &&
      parsed.length > 0 &&
      !parseLooksSuspicious(parsed)
    ) {
      return { aba, tarefas: parsed };
    }
  }

  if (bestNonSuspicious) return bestNonSuspicious;

  if (bestFallback && bestFallback.tarefas.length >= 3) {
    return bestFallback;
  }

  return { aba: ordered[0], tarefas: [] };
}

async function syncClienteTarefasFromAbas(
  supabase: SupabaseClient,
  cliente: { id_cliente: string; sheets_aba: string; nome_empresa: string },
  abasTry: string[],
  lote: Record<string, import("@/lib/sheets").TarefaSheet[]>,
  forceDirect = false
): Promise<{
  bestAba: string;
  tarefas: import("@/lib/sheets").TarefaSheet[];
  synced: SyncTarefasResult | null;
}> {
  let { aba: bestAba, tarefas } = await pickBestTarefasFromAbas(
    abasTry,
    lote,
    forceDirect,
    cliente.id_cliente,
    cliente.sheets_aba
  );

  if (bestAba !== cliente.sheets_aba && tarefas.length > 0) {
    await supabase
      .from("mm_clientes")
      .update({ sheets_aba: bestAba, atualizado_em: new Date().toISOString() })
      .eq("id_cliente", cliente.id_cliente);
    cliente.sheets_aba = bestAba;
  }

  if (tarefas.length === 0) {
    return { bestAba, tarefas, synced: null };
  }

  const synced = await syncTarefasClienteFromSheet(supabase, cliente, tarefas);
  return { bestAba, tarefas, synced };
}

/** Chave de match tarefa planilha ↔ Supabase (o_que + prazo + etapa). */
export function taskSyncKey(
  o_que: string,
  prazo: string | null,
  etapa: string | null
): string {
  return `${o_que.trim()}|${prazo ?? ""}|${(etapa ?? "").trim()}`;
}

function taskSyncKeyOQue(o_que: string): string {
  return o_que.trim().toLowerCase();
}

type ExistingTarefaRow = {
  id: string;
  o_que: string;
  prazo: string | null;
  etapa: string | null;
  check_feito: boolean;
};

function buildTarefaPayloadFromSheet(
  t: import("@/lib/sheets").TarefaSheet,
  taskClienteId: string
) {
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
    o_que: t.o_que.trim(),
    tipo: t.tipo || null,
    quem: t.quem || null,
    prazo: prazoISO,
    status: statusFinal,
    observacoes: t.observacoes || null,
    atualizado_em: new Date().toISOString(),
  };
}

function findExistingTarefaMatch(
  t: import("@/lib/sheets").TarefaSheet,
  byKey: Map<string, ExistingTarefaRow>,
  byOQue: Map<string, ExistingTarefaRow[]>
): ExistingTarefaRow | null {
  const prazoISO = parseDateBR(t.prazo);
  const exact = byKey.get(taskSyncKey(t.o_que, prazoISO, t.etapa));
  if (exact) return exact;

  const oQueMatches = byOQue.get(taskSyncKeyOQue(t.o_que)) ?? [];
  if (oQueMatches.length === 1) return oQueMatches[0];

  if (oQueMatches.length > 1) {
    const etapaNorm = (t.etapa ?? "").trim().toLowerCase();
    const withEtapa = oQueMatches.filter(
      (row) => (row.etapa ?? "").trim().toLowerCase() === etapaNorm
    );
    if (withEtapa.length === 1) return withEtapa[0];
  }

  return null;
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
  const abaPrefix = getAbaIdPrefixFromTitle(cliente.sheets_aba);
  const idsRelacionados = clienteIdsForTarefas(taskClienteId, cliente.sheets_aba);

  // Só consolida tarefas do prefixo da aba quando aba e cadastro são o mesmo MM (evita roubar MM051→MM052)
  if (abaPrefix === taskClienteId) {
    for (const altId of idsRelacionados) {
      if (altId === taskClienteId) continue;
      await supabase
        .from("mm_tarefas")
        .update({ cliente_id: taskClienteId, atualizado_em: new Date().toISOString() })
        .eq("cliente_id", altId);
    }
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

  const existing = (existingRows ?? []) as ExistingTarefaRow[];
  const existingCount = existing.length;
  const suspicious = parseLooksSuspicious(tarefas);

  if (suspicious && existingCount > 0) {
    return emptySkip("parse_suspeito_com_dados_existentes");
  }
  if (suspicious && tarefas.length < 3) {
    return emptySkip("parse_suspeito");
  }

  const byKey = new Map<string, ExistingTarefaRow>();
  const byOQue = new Map<string, ExistingTarefaRow[]>();
  for (const row of existing) {
    byKey.set(taskSyncKey(row.o_que, row.prazo, row.etapa), row);
    const oQueKey = taskSyncKeyOQue(row.o_que);
    const list = byOQue.get(oQueKey) ?? [];
    list.push(row);
    byOQue.set(oQueKey, list);
  }

  const matchedIds = new Set<string>();
  const toInsert: ReturnType<typeof buildTarefaPayloadFromSheet>[] = [];
  const toUpdate: Array<{ id: string; payload: ReturnType<typeof buildTarefaPayloadFromSheet> }> =
    [];

  for (const t of tarefas) {
    const payload = buildTarefaPayloadFromSheet(t, taskClienteId);
    const match = findExistingTarefaMatch(t, byKey, byOQue);
    if (match) {
      matchedIds.add(match.id);
      toUpdate.push({ id: match.id, payload });
    } else {
      toInsert.push(payload);
    }
  }

  if (toInsert.length > 0) {
    const { error: errInsert } = await supabase.from("mm_tarefas").insert(toInsert);
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
  }

  for (const { id, payload } of toUpdate) {
    const { error: errUpdate } = await supabase.from("mm_tarefas").update(payload).eq("id", id);
    if (errUpdate) {
      return {
        ok: false,
        count: toInsert.length + toUpdate.length,
        inserted: toInsert.length,
        updated: 0,
        deleted: 0,
        error: errUpdate.message,
      };
    }
  }

  const idsToRemove = existing.filter((row) => !matchedIds.has(row.id)).map((row) => row.id);
  let deleted = 0;
  if (idsToRemove.length > 0) {
    const { error: errDelete } = await supabase.from("mm_tarefas").delete().in("id", idsToRemove);
    if (errDelete) {
      return {
        ok: false,
        count: toInsert.length + toUpdate.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
        deleted: 0,
        error: errDelete.message,
      };
    }
    deleted = idsToRemove.length;
  }

  return {
    ok: true,
    count: tarefas.length,
    inserted: toInsert.length,
    updated: toUpdate.length,
    deleted,
  };
}

/** Reimporta tarefas da planilha para clientes MM### >= fromNum (fetch direto por aba). */
export async function resyncTarefasCohort(
  supabase: SupabaseClient,
  fromNum: number,
  shared?: { erros?: string[]; semTarefas?: string[] }
): Promise<{
  clientes: number;
  abas: number;
  tarefas: number;
  semTarefas: string[];
  erros: string[];
}> {
  const erros = shared?.erros ?? [];
  const semTarefasOut: string[] = [];
  let totalTarefas = 0;

  const todasAbas = await fetchTodasAbas();
  const abasClientes = todasAbas.filter((a) => getAbaIdPrefixFromTitle(a));

  const { data: clientesDb, error: errDb } = await supabase
    .from("mm_clientes")
    .select("id_cliente, nome_empresa, sheets_aba")
    .order("id_cliente");

  if (errDb) throw new Error(errDb.message);

  const cohort = (clientesDb ?? [])
    .filter((c) => extractMmNum(c.id_cliente) >= fromNum)
    .map((c) => ({
      id_cliente: normalizeMmId(c.id_cliente) ?? c.id_cliente,
      nome_empresa: c.nome_empresa,
      sheets_aba: c.sheets_aba as string | null,
    }));
  const syncedIds = new Set<string>();
  const abasCohort = abasClientes
    .map((aba) => ({ aba, id_cliente: getAbaIdPrefixFromTitle(aba) }))
    .filter((a): a is { aba: string; id_cliente: string } => {
      if (!a.id_cliente) return false;
      return extractMmNum(a.id_cliente) >= fromNum;
    })
    .sort((a, b) => extractMmNum(a.id_cliente) - extractMmNum(b.id_cliente));
  const abasById = new Map<string, string[]>();
  for (const item of abasCohort) {
    abasById.set(item.id_cliente, [...(abasById.get(item.id_cliente) ?? []), item.aba]);
  }

  const lote: Record<string, import("@/lib/sheets").TarefaSheet[]> = {};

  for (let i = 0; i < cohort.length; i++) {
    const c = cohort[i];
    if (i > 0) await cohortFetchDelay(fromNum, c.id_cliente);

    const abasTry: string[] = [];
    for (const aba of abasById.get(c.id_cliente) ?? []) {
      addCandidateAba(abasTry, aba);
    }
    const savedAbaPrefix = getAbaIdPrefixFromTitle(c.sheets_aba);
    if (
      c.sheets_aba &&
      todasAbas.includes(c.sheets_aba) &&
      (!savedAbaPrefix || savedAbaPrefix === c.id_cliente)
    ) {
      addCandidateAba(abasTry, c.sheets_aba);
    }
    if (abasTry.length === 0) {
      for (const aba of todasAbas) {
        if (abaMatchesClienteSemPrefixo(aba, c.nome_empresa)) addCandidateAba(abasTry, aba);
      }
    }

    if (abasTry.length === 0) {
      semTarefasOut.push(`${c.id_cliente} (${c.nome_empresa})`);
      continue;
    }

    const cliente = {
      id_cliente: c.id_cliente,
      sheets_aba: abasTry[0],
      nome_empresa: c.nome_empresa,
    };

    const { bestAba, tarefas, synced } = await syncClienteTarefasFromAbas(
      supabase,
      cliente,
      abasTry,
      lote,
      true
    );

    if (tarefas.length === 0) {
      semTarefasOut.push(`${c.id_cliente} (${c.nome_empresa})`);
      continue;
    }

    syncedIds.add(c.id_cliente);

    if (c.sheets_aba !== bestAba) {
      await supabase
        .from("mm_clientes")
        .update({ sheets_aba: bestAba, atualizado_em: new Date().toISOString() })
        .eq("id_cliente", c.id_cliente);
    }

    if (synced?.skipped) {
      erros.push(`${c.nome_empresa} — ignorado (${synced.skipReason ?? "?"})`);
    } else if (synced && !synced.ok) {
      erros.push(`${c.nome_empresa}: ${synced.error}`);
    } else if (synced?.ok) {
      totalTarefas += synced.count;
      if (shared?.semTarefas) {
        const idx = shared.semTarefas.findIndex((s) => s.startsWith(`${c.id_cliente} (`));
        if (idx >= 0) shared.semTarefas.splice(idx, 1);
      }
    }
  }

  for (const c of cohort) {
    if (syncedIds.has(c.id_cliente)) continue;
    if (!semTarefasOut.some((s) => s.startsWith(`${c.id_cliente} (`))) {
      semTarefasOut.push(`${c.id_cliente} (${c.nome_empresa})`);
    }
  }

  for (const item of abasCohort) {
    if (!cohort.some((c) => c.id_cliente === item.id_cliente)) {
      erros.push(`${item.id_cliente}: aba existe no Sheets, mas cliente não existe no cadastro`);
    }
  }

  if (shared?.semTarefas) {
    for (const s of semTarefasOut) {
      if (!shared.semTarefas.some((x) => x.startsWith(s.split(" (")[0] + " ("))) {
        shared.semTarefas.push(s);
      }
    }
  }

  return {
    clientes: cohort.length,
    abas: abasCohort.length,
    tarefas: totalTarefas,
    semTarefas: semTarefasOut,
    erros,
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

  // Apenas abas de clientes com prefixo MM no título.
  const abasClientes = todasAbas.filter((a) => getAbaIdPrefixFromTitle(a));

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

  // MM044+ não entra no batchGet — libera quota para fetch direto por aba (evita lote vazio por 429)
  const abasParaFetch = abasClientes.filter((a) => {
    const prefix = getAbaIdPrefixFromTitle(a);
    if (!prefix) return true;
    return extractMmNum(prefix) < MM_COHORT_DIRECT_MIN;
  });

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
    // Nunca zera sheets_aba: resolve → match por ID/nome → valor anterior válido
    const sheets_aba =
      resolved ??
      abaEncontrada ??
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

  // ── 6. Clientes com aba resolvida ──
  const abasComCliente = clientesPayload
    .map((c) => {
      const aba =
        c.sheets_aba ??
        encontrarAba(abasClientes, c.id_cliente, c.nome_empresa, todasAbas);
      if (!aba || !abaPrefixOk(aba, c.id_cliente)) return null;
      return {
        id_cliente: c.id_cliente,
        sheets_aba: aba,
        nome_empresa: c.nome_empresa,
      };
    })
    .filter((c): c is { id_cliente: string; sheets_aba: string; nome_empresa: string } => c !== null);

  const clientesLegacy = abasComCliente
    .filter((c) => extractMmNum(c.id_cliente) < MM_COHORT_DIRECT_MIN)
    .sort((a, b) => extractMmNum(a.id_cliente) - extractMmNum(b.id_cliente));

  // ── 7. Sincroniza MM001–MM043 via batch lote ──
  for (const cliente of clientesLegacy) {
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
    const abasTry = expandAbaCandidates(
      cliente.id_cliente,
      cliente.nome_empresa,
      cliente.sheets_aba,
      candidatos.length > 0 ? candidatos : abaEncontrada ? [abaEncontrada] : [cliente.sheets_aba],
      abasClientes,
      todasAbas
    );

    const { tarefas, synced } = await syncClienteTarefasFromAbas(
      supabase,
      cliente,
      abasTry,
      todasTarefasLote,
      false
    );

    if (tarefas.length === 0) {
      semTarefas.push(`${cliente.id_cliente} (${cliente.nome_empresa})`);
      continue;
    }

    if (synced?.skipped) {
      erros.push(
        `Aviso: ${cliente.nome_empresa} — sync ignorado (${synced.skipReason ?? "desconhecido"})`
      );
      continue;
    }
    if (synced && !synced.ok) {
      erros.push(`Erro ao salvar tarefas de ${cliente.nome_empresa}: ${synced.error}`);
    } else if (synced?.ok) {
      totalTarefas += synced.count;
      const idx = semTarefas.findIndex((s) => s.startsWith(`${cliente.id_cliente} (`));
      if (idx >= 0) semTarefas.splice(idx, 1);
    }
  }

  // ── 7b. MM044+ — uma passada com fetch direto por aba (prefixo estrito) ──
  try {
    const resync = await resyncTarefasCohort(supabase, MM_COHORT_DIRECT_MIN, {
      erros,
      semTarefas,
    });
    totalTarefas += resync.tarefas;
  } catch (err) {
    erros.push(`Resync MM${MM_COHORT_DIRECT_MIN}+ falhou: ${String(err)}`);
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
