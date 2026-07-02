export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePipelineMaintainer } from "@/lib/api-auth";
import { fetchCadastroClientes, fetchTodasAbas } from "@/lib/sheets";
import { extractMmNum, getAbaIdPrefixFromTitle, normalizeMmId } from "@/lib/sheets-cadastro";

type ClienteDb = {
  id_cliente: string;
  nome_empresa: string;
  sheets_aba: string | null;
};

function normalizeNome(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function duplicates<T>(items: T[], keyFn: (item: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
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

    const [todasAbas, cadastro] = await Promise.all([fetchTodasAbas(), fetchCadastroClientes()]);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: clientesDb, error } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, sheets_aba")
      .order("id_cliente");

    if (error) throw new Error(error.message);

    const db = ((clientesDb ?? []) as ClienteDb[]).map((c) => ({
      ...c,
      id_cliente: normalizeMmId(c.id_cliente) ?? c.id_cliente,
    }));
    const cadastroRows = cadastro.map((c) => ({
      ...c,
      id_cliente: normalizeMmId(c.id_cliente) ?? c.id_cliente,
    }));
    const abasComPrefixo = todasAbas
      .map((aba) => ({ aba, id_cliente: getAbaIdPrefixFromTitle(aba) }))
      .filter((x): x is { aba: string; id_cliente: string } => !!x.id_cliente);

    const cadastroById = new Map(cadastroRows.map((c) => [c.id_cliente, c]));
    const dbById = new Map(db.map((c) => [c.id_cliente, c]));
    const abasById = new Map<string, string[]>();
    for (const item of abasComPrefixo) {
      abasById.set(item.id_cliente, [...(abasById.get(item.id_cliente) ?? []), item.aba]);
    }

    const ids = Array.from(
      new Set([
        ...cadastroRows.map((c) => c.id_cliente),
        ...db.map((c) => c.id_cliente),
        ...abasComPrefixo.map((a) => a.id_cliente),
      ])
    )
      .filter((id) => {
        const n = extractMmNum(id);
        return n >= fromNum && n <= toNum;
      })
      .sort((a, b) => extractMmNum(a) - extractMmNum(b));

    const rows = ids.map((id) => {
      const cSheet = cadastroById.get(id) ?? null;
      const cDb = dbById.get(id) ?? null;
      const abas = abasById.get(id) ?? [];
      const sheetsAbaExiste = !!cDb?.sheets_aba && todasAbas.includes(cDb.sheets_aba);
      const prefixoSheetsAba = getAbaIdPrefixFromTitle(cDb?.sheets_aba);
      const problemas = [
        !cSheet ? "sem_linha_cadastro" : null,
        !cDb ? "sem_mm_clientes" : null,
        abas.length === 0 ? "sem_aba_prefixo" : null,
        abas.length > 1 ? "abas_duplicadas_prefixo" : null,
        cDb?.sheets_aba && !sheetsAbaExiste ? "sheets_aba_inexistente" : null,
        prefixoSheetsAba && prefixoSheetsAba !== id ? "sheets_aba_prefixo_divergente" : null,
        cDb && !cDb.sheets_aba ? "mm_clientes_sem_sheets_aba" : null,
      ].filter((p): p is string => !!p);

      return {
        id_cliente: id,
        nome_cadastro: cSheet?.nome_empresa ?? null,
        nome_db: cDb?.nome_empresa ?? null,
        sheets_aba: cDb?.sheets_aba ?? null,
        prefixo_sheets_aba: prefixoSheetsAba,
        sheets_aba_existe: sheetsAbaExiste,
        abas_por_prefixo: abas,
        status: problemas.length === 0 ? "ok" : "inconsistente",
        problemas,
      };
    });

    const abasSemCliente = abasComPrefixo
      .filter((a) => !dbById.has(a.id_cliente) && extractMmNum(a.id_cliente) >= fromNum && extractMmNum(a.id_cliente) <= toNum)
      .map((a) => a.aba);

    return NextResponse.json({
      ok: true,
      from: fromNum,
      to: toNum,
      total: rows.length,
      resumo: {
        ok: rows.filter((r) => r.status === "ok").length,
        inconsistentes: rows.filter((r) => r.status === "inconsistente").length,
        abas_sem_cliente: abasSemCliente.length,
      },
      duplicatas: {
        cadastro_por_id: duplicates(cadastroRows, (c) => c.id_cliente),
        db_por_id: duplicates(db, (c) => c.id_cliente),
        cadastro_por_nome: duplicates(cadastroRows, (c) => normalizeNome(c.nome_empresa)),
        db_por_nome: duplicates(db, (c) => normalizeNome(c.nome_empresa)),
        abas_por_prefixo: duplicates(abasComPrefixo, (a) => a.id_cliente),
      },
      abas_sem_cliente: abasSemCliente,
      rows,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[diagnostico-cadastro]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
