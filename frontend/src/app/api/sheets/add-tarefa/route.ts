/**
 * POST /api/sheets/add-tarefa
 *
 * Adiciona uma nova tarefa:
 *  1. Busca a aba do cliente em mm_clientes.sheets_aba
 *  2. Faz append da linha na aba do cliente no Google Sheets
 *  3. Insere a tarefa em mm_tarefas no Supabase
 *
 * Requer env: GOOGLE_SERVICE_ACCOUNT_JSON, NEXT_PUBLIC_SHEETS_ID,
 *             SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { addTarefaSchema } from "@/lib/schemas";
import {
  buildSheetRowFromLayout,
  detectTaskColumnLayout,
  sheetAppendRange,
  sheetRowValuesForLayout,
} from "@/lib/sheets";

const SHEET_ID = process.env.NEXT_PUBLIC_SHEETS_ID ?? "";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── Google Auth ──────────────────────────────────────────────────────────────

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
  const data = await res.json();
  if (!data.access_token)
    throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

async function sAppend(token: string, range: string, values: string[][]): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${range}: ${res.status} — ${await res.text()}`);
}

async function sRead(token: string, range: string): Promise<string[][]> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets READ ${range}: ${res.status} — ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD/MM/YYYY para o Sheets */
function toDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const parsed = addTarefaSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    const { id_cliente, etapa, o_que, tipo, quem, prazo, status, observacoes } = parsed.data;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey)
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Busca aba do cliente ──
    const { data: cliente, error: errCliente } = await supabase
      .from("mm_clientes")
      .select("sheets_aba, nome_empresa")
      .eq("id_cliente", id_cliente)
      .maybeSingle();

    if (errCliente || !cliente)
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    if (!cliente.sheets_aba)
      return NextResponse.json(
        { error: `Cliente ${id_cliente} não tem aba configurada` },
        { status: 422 }
      );

    // ── 2. Monta linha para o Sheets com layout detectado (B:I ou A:H) ──
    const prazoBR = prazo ? toDateBR(prazo) : "";
    const statusFinal = status?.trim() || "Não iniciado";

    // ── 3. Insert no Supabase primeiro (fonte imediata no app) ──
    const prazoISO = prazo || null;

    const { data: novaTarefa, error: errInsert } = await supabase
      .from("mm_tarefas")
      .insert({
        cliente_id: id_cliente,
        check_feito: false,
        etapa: etapa?.trim() || null,
        o_que: o_que.trim(),
        tipo: tipo?.trim() || null,
        quem: quem?.trim() || null,
        prazo: prazoISO,
        status: statusFinal,
        observacoes: observacoes?.trim() || null,
        atualizado_em: new Date().toISOString(),
      })
      .select()
      .single();

    if (errInsert) {
      throw new Error(`Falha ao salvar tarefa no sistema: ${errInsert.message}`);
    }

    // ── 4. Append no Sheets ──
    let sheetWarning: string | undefined;
    try {
      const token = await googleToken();
      const rows = await sRead(token, `${cliente.sheets_aba}!A:I`);
      const layout = detectTaskColumnLayout(rows);
      const novaLinha = buildSheetRowFromLayout(layout, {
        check_feito: false,
        etapa: etapa?.trim() ?? null,
        o_que: o_que.trim(),
        tipo: tipo?.trim() || "Marry Me",
        quem: quem?.trim() ?? null,
        prazo: prazoBR,
        status: statusFinal,
        observacoes: observacoes?.trim() ?? null,
      });
      await sAppend(token, sheetAppendRange(cliente.sheets_aba, layout), [
        sheetRowValuesForLayout(layout, novaLinha),
      ]);
    } catch (sheetErr) {
      const sheetMsg = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
      console.error("[add-tarefa] Tarefa salva no Supabase, falhou no Sheets:", sheetMsg);
      sheetWarning = `Tarefa salva no sistema, mas falhou na planilha: ${sheetMsg}`;
    }

    return NextResponse.json({ ok: true, tarefa: novaTarefa, warning: sheetWarning });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[add-tarefa]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
