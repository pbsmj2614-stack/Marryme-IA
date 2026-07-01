/**
 * POST /api/admin/repair-pipeline
 *
 * Repara inconsistências MM044+ entre mm_clientes, abas e tarefas.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requirePipelineMaintainer } from "@/lib/api-auth";
import { fetchTodasTarefasBatch } from "@/lib/sheets";
import {
  collectAbaCandidates,
  resolveSheetsAba,
  shouldUpdateSheetsAba,
} from "@/lib/sheets-aba-resolve";
import {
  extractMmNum,
  getAbaIdPrefixFromTitle,
  normalizeMmId,
} from "@/lib/sheets-cadastro";

const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const MM_COHORT_MIN = 44;

function makeJWT(email: string, key: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const msg = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(msg);
  return `${msg}.${sign.sign(key, "base64url")}`;
}

async function googleToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado.");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const jwt = makeJWT(sa.client_email, sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token)
    throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

function encontrarAbaPorId(
  abas: string[],
  idCliente: string,
  nomeEmpresa: string
): string | null {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const idLower = idNorm.toLowerCase();
  const nomeLower = nomeEmpresa.toLowerCase().replace(/\s+/g, "");

  const porId = abas.find((a) => {
    const al = a.toLowerCase();
    return al.startsWith(idLower + "_") || al.startsWith(idLower + " ") || al === idLower;
  });
  if (porId) return porId;

  const porPrefixo = abas.find((a) => getAbaIdPrefixFromTitle(a) === idNorm);
  if (porPrefixo) return porPrefixo;

  return (
    abas.find((a) => {
      const aLower = a.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
      return aLower.includes(nomeLower) || nomeLower.includes(aLower);
    }) ?? null
  );
}

export async function POST() {
  try {
    const auth = await requirePipelineMaintainer();
    if (auth.response) return auth.response;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const reparados: string[] = [];
    const avisos: string[] = [];
    const erros: string[] = [];
    const semAba: string[] = [];
    const semTarefas: string[] = [];

    const token = await googleToken();

    const meta = (await (
      await fetch(`${BASE}/${SHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()) as { sheets: { properties: { title: string } }[] };
    const todasAbas = (meta.sheets ?? []).map((s) => s.properties.title);
    const abasClientes = todasAbas.filter((a) => /^MM\d+/i.test(a.trim()));

    const { data: clientes, error: errC } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, sheets_aba");

    if (errC) throw new Error(errC.message);

    const cohort = (clientes ?? []).filter((c) => extractMmNum(c.id_cliente) >= MM_COHORT_MIN);

    const abasParaFetch = Array.from(
      new Set(
        cohort.flatMap((c) => {
          const idNorm = normalizeMmId(c.id_cliente) ?? c.id_cliente;
          const abaEncontrada = encontrarAbaPorId(abasClientes, idNorm, c.nome_empresa);
          return collectAbaCandidates(
            idNorm,
            abaEncontrada,
            c.sheets_aba,
            todasAbas,
            abasClientes
          );
        })
      )
    );

    let tarefasPorAba: Awaited<ReturnType<typeof fetchTodasTarefasBatch>> = {};
    try {
      tarefasPorAba = await fetchTodasTarefasBatch(abasParaFetch);
    } catch (err) {
      erros.push(`Erro ao buscar tarefas: ${String(err)}`);
    }

    for (const c of cohort) {
      const idNorm = normalizeMmId(c.id_cliente) ?? c.id_cliente;
      const abaEncontrada = encontrarAbaPorId(abasClientes, idNorm, c.nome_empresa);
      const abaIdeal = resolveSheetsAba(
        idNorm,
        abaEncontrada,
        c.sheets_aba,
        todasAbas,
        abasClientes,
        tarefasPorAba
      );

      if (!abaIdeal) {
        semAba.push(`${idNorm} (${c.nome_empresa})`);
      } else {
        const taskCount = tarefasPorAba[abaIdeal]?.length ?? 0;
        if (taskCount === 0) semTarefas.push(`${idNorm} (${c.nome_empresa})`);

        if (abaIdeal !== c.sheets_aba) {
          const shouldUpdate = shouldUpdateSheetsAba(
            idNorm,
            c.sheets_aba,
            abaIdeal,
            todasAbas,
            tarefasPorAba
          );
          if (shouldUpdate) {
            const { error: errAba } = await supabase
              .from("mm_clientes")
              .update({ sheets_aba: abaIdeal, atualizado_em: new Date().toISOString() })
              .eq("id_cliente", c.id_cliente);
            if (errAba) erros.push(`${idNorm}: falha ao corrigir aba (${errAba.message})`);
            else
              reparados.push(
                `${idNorm}: sheets_aba ${c.sheets_aba ?? "(null)"} → ${abaIdeal} (${taskCount} tarefas)`
              );
          }
        }
      }

      const prefixoAtual = getAbaIdPrefixFromTitle(c.sheets_aba);
      if (prefixoAtual && prefixoAtual !== idNorm) {
        const { data: tarefasOrfa } = await supabase
          .from("mm_tarefas")
          .select("id")
          .eq("cliente_id", prefixoAtual);
        if ((tarefasOrfa ?? []).length > 0) {
          const { error: errT } = await supabase
            .from("mm_tarefas")
            .update({ cliente_id: idNorm, atualizado_em: new Date().toISOString() })
            .eq("cliente_id", prefixoAtual);
          if (errT) erros.push(`${idNorm}: falha ao migrar tarefas de ${prefixoAtual}`);
          else
            reparados.push(
              `${idNorm}: ${tarefasOrfa!.length} tarefa(s) migradas de ${prefixoAtual}`
            );
        }
      }

      if (idNorm !== c.id_cliente) {
        avisos.push(
          `${c.id_cliente}: ID não padronizado (esperado ${idNorm}) — corrija manualmente no cadastro`
        );
      }
    }

    const { data: entrevistas } = await supabase.from("entrevistas").select("id, dados_json");
    for (const e of entrevistas ?? []) {
      const dados = (e.dados_json ?? {}) as Record<string, string>;
      const mmId = normalizeMmId(String(dados.mm_id ?? ""));
      if (!mmId) continue;
      const cliente = (clientes ?? []).find(
        (c) =>
          normalizeMmId(c.id_cliente) === mmId ||
          c.nome_empresa.toLowerCase().trim() ===
            String(dados.nome_artistico ?? "").toLowerCase().trim()
      );
      const idCanonico = cliente ? (normalizeMmId(cliente.id_cliente) ?? cliente.id_cliente) : mmId;
      if (dados.mm_id !== idCanonico) {
        await supabase
          .from("entrevistas")
          .update({ dados_json: { ...dados, mm_id: idCanonico } })
          .eq("id", e.id);
        reparados.push(`entrevista ${e.id}: mm_id → ${idCanonico}`);
      }
    }

    return NextResponse.json({
      ok: true,
      reparados,
      avisos,
      erros,
      semAba,
      semTarefas,
      cohort: cohort.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[repair-pipeline]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
