/**
 * GET /api/admin/diagnostico-tarefas?from=1&to=80
 *
 * Compara match cliente ↔ aba ↔ tarefas parseadas ↔ tarefas no Supabase.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requirePipelineMaintainer } from "@/lib/api-auth";
import { fetchAndParseTarefasAbaWithRetry, fetchTodasAbas, scoreTarefasParse } from "@/lib/sheets";
import { extractMmNum, getAbaIdPrefixFromTitle, normalizeMmId } from "@/lib/sheets-cadastro";

type ClienteDb = {
  id_cliente: string;
  nome_empresa: string;
  sheets_aba: string | null;
};

function normalizeMatchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^mm[\s_-]*\d{1,4}[\s_-]*/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function addCandidate(candidates: string[], aba: string | null | undefined): void {
  if (!aba || candidates.includes(aba)) return;
  candidates.push(aba);
}

function buildCandidates(cliente: ClienteDb, todasAbas: string[]): string[] {
  const id = normalizeMmId(cliente.id_cliente) ?? cliente.id_cliente;
  const nomeKey = normalizeMatchKey(cliente.nome_empresa);
  const candidates: string[] = [];

  for (const aba of todasAbas) {
    if (getAbaIdPrefixFromTitle(aba) === id) addCandidate(candidates, aba);
  }

  const savedPrefix = getAbaIdPrefixFromTitle(cliente.sheets_aba);
  if (
    cliente.sheets_aba &&
    todasAbas.includes(cliente.sheets_aba) &&
    (!savedPrefix || savedPrefix === id)
  ) {
    addCandidate(candidates, cliente.sheets_aba);
  }

  for (const aba of todasAbas) {
    if (getAbaIdPrefixFromTitle(aba)) continue;
    const abaKey = normalizeMatchKey(aba);
    if (abaKey.length >= 4 && nomeKey.length >= 4 && (abaKey.includes(nomeKey) || nomeKey.includes(abaKey))) {
      addCandidate(candidates, aba);
    }
  }

  return candidates;
}

async function countDbTarefas(supabase: SupabaseClient, idCliente: string): Promise<number> {
  const { count, error } = await supabase
    .from("mm_tarefas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", idCliente);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePipelineMaintainer();
    if (auth.response) return auth.response;

    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const fromNum = fromParam ? parseInt(fromParam, 10) : 1;
    const toNum = toParam ? parseInt(toParam, 10) : 999;

    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || fromNum < 1 || toNum < fromNum) {
      return NextResponse.json({ error: "Parâmetros from/to inválidos" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const todasAbas = await fetchTodasAbas();
    const { data: clientes, error } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, sheets_aba")
      .order("id_cliente");

    if (error) throw new Error(error.message);

    const rows = [];
    for (const cliente of (clientes ?? []) as ClienteDb[]) {
      const id = normalizeMmId(cliente.id_cliente) ?? cliente.id_cliente;
      const num = extractMmNum(id);
      if (num < fromNum || num > toNum) continue;

      const candidates = buildCandidates({ ...cliente, id_cliente: id }, todasAbas);
      const parsed = [];

      for (const aba of candidates) {
        try {
          const tarefas = await fetchAndParseTarefasAbaWithRetry(aba, 3);
          parsed.push({
            aba,
            tarefas: tarefas.length,
            checks: tarefas.filter((t) => t.check_feito).length,
            score: scoreTarefasParse(tarefas),
            primeira_tarefa: tarefas[0]?.o_que ?? null,
          });
        } catch (err) {
          parsed.push({
            aba,
            tarefas: 0,
            checks: 0,
            score: 0,
            primeira_tarefa: null,
            erro: err instanceof Error ? err.message : String(err),
          });
        }
      }

      parsed.sort((a, b) => b.score - a.score);
      const dbTarefas = await countDbTarefas(supabase, id);

      rows.push({
        id_cliente: id,
        nome_empresa: cliente.nome_empresa,
        sheets_aba: cliente.sheets_aba,
        tarefas_db: dbTarefas,
        candidatos: candidates.length,
        melhor_aba: parsed[0]?.aba ?? null,
        tarefas_sheet: parsed[0]?.tarefas ?? 0,
        checks_sheet: parsed[0]?.checks ?? 0,
        status:
          dbTarefas > 0
            ? "ok_db"
            : parsed[0] && parsed[0].tarefas > 0
              ? "sheet_ok_db_zero"
              : candidates.length > 0
                ? "aba_sem_parse"
                : "sem_aba",
        parsed,
      });
    }

    return NextResponse.json({
      ok: true,
      from: fromNum,
      to: toNum,
      total: rows.length,
      resumo: {
        ok_db: rows.filter((r) => r.status === "ok_db").length,
        sheet_ok_db_zero: rows.filter((r) => r.status === "sheet_ok_db_zero").length,
        aba_sem_parse: rows.filter((r) => r.status === "aba_sem_parse").length,
        sem_aba: rows.filter((r) => r.status === "sem_aba").length,
      },
      rows,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[diagnostico-tarefas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
