/**
 * POST /api/sheets/update-tarefa
 *
 * Atualiza uma tarefa existente:
 *  1. Atualiza mm_tarefas no Supabase
 *  2. Localiza a linha correspondente na aba do cliente no Google Sheets
 *     (por correspondência de o_que + etapa + prazo)
 *  3. Atualiza os campos na linha encontrada
 *
 * Body: {
 *   id              — UUID da tarefa no Supabase (obrigatório)
 *   id_cliente      — ex: "MM001" (obrigatório)
 *   o_que_original  — usado para localizar a linha no Sheets (obrigatório)
 *   prazo_original? — YYYY-MM-DD, restringe a busca
 *   etapa_original? — restringe a busca
 *   // Campos a atualizar (envie apenas os que mudaram):
 *   check_feito?    — boolean
 *   status?         — string
 *   quem?           — string
 *   prazo?          — YYYY-MM-DD
 *   etapa?          — string
 *   tipo?           — string
 *   observacoes?    — string
 * }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { updateTarefaSchema } from "@/lib/schemas";
import {
  buildSheetRowFromLayout,
  detectTaskColumnLayout,
  findTaskRowByOQue,
  sheetRowUpdateRange,
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
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token)
    throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Sheets helpers ───────────────────────────────────────────────────────────

async function sRead(token: string, range: string): Promise<string[][]> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets READ ${range}: ${res.status} — ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function sUpdate(token: string, range: string, values: string[][]): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets UPDATE ${range}: ${res.status} — ${await res.text()}`);
}

/** YYYY-MM-DD → DD/MM/YYYY */
function toDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const parsed = updateTarefaSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    const { id, id_cliente, o_que_original, prazo_original, etapa_original, ...campos } =
      parsed.data;
    const oQueOrigStr = o_que_original?.trim() ?? "";
    let sheetWarning: string | undefined;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Busca aba do cliente ──────────────────────────────────────────────────
    const { data: cliente } = await supabase
      .from("mm_clientes")
      .select("sheets_aba")
      .eq("id_cliente", id_cliente)
      .maybeSingle();

    // ── 2. Atualiza Supabase ─────────────────────────────────────────────────────
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (campos.check_feito !== undefined) patch.check_feito = campos.check_feito;
    if (campos.status !== undefined) patch.status = campos.status?.trim();
    if (campos.quem !== undefined) patch.quem = campos.quem?.trim() || null;
    if (campos.prazo !== undefined) patch.prazo = campos.prazo?.trim() || null;
    if (campos.etapa !== undefined) patch.etapa = campos.etapa?.trim() || null;
    if (campos.tipo !== undefined) patch.tipo = campos.tipo?.trim() || null;
    if (campos.observacoes !== undefined) patch.observacoes = campos.observacoes?.trim() || null;

    const { error: errUpdate } = await supabase.from("mm_tarefas").update(patch).eq("id", id);

    if (errUpdate) throw new Error(`Supabase update falhou: ${errUpdate.message}`);

    const { data: tarefaAtual } = await supabase.from("mm_tarefas").select("*").eq("id", id).single();

    // ── 3. Atualiza linha no Sheets ──────────────────────────────────────────────
    if (cliente?.sheets_aba && oQueOrigStr && tarefaAtual) {
      const token = await googleToken();
      const rows = await sRead(token, `${cliente.sheets_aba}!A:I`);
      const layout = detectTaskColumnLayout(rows);

      const prazoOrigBR = prazo_original ? toDateBR(prazo_original) : null;
      const rowIndex = findTaskRowByOQue(rows, layout, oQueOrigStr, etapa_original, prazoOrigBR);

      const prazoBR = tarefaAtual.prazo ? toDateBR(tarefaAtual.prazo) : "";
      const sheetRow = buildSheetRowFromLayout(
        layout,
        {
          check_feito: tarefaAtual.check_feito,
          etapa: tarefaAtual.etapa,
          o_que: tarefaAtual.o_que,
          tipo: tarefaAtual.tipo,
          quem: tarefaAtual.quem,
          prazo: prazoBR,
          status: tarefaAtual.status?.trim() || "Não iniciado",
          observacoes: tarefaAtual.observacoes,
        },
        rowIndex >= 0 ? rows[rowIndex] : undefined
      );

      const rowValues = sheetRowValuesForLayout(layout, sheetRow);

      if (rowIndex >= 0) {
        await sUpdate(token, sheetRowUpdateRange(cliente.sheets_aba, rowIndex, layout), [rowValues]);
      } else {
        sheetWarning = `Tarefa atualizada no sistema, mas a linha original não foi localizada na aba "${cliente.sheets_aba}". Nenhuma linha nova foi criada para evitar duplicidade.`;
        console.warn("[update-tarefa]", sheetWarning, {
          id,
          id_cliente,
          sheets_aba: cliente.sheets_aba,
          o_que_original: oQueOrigStr,
          etapa_original,
          prazo_original,
        });
      }
    }

    return NextResponse.json({ ok: true, warning: sheetWarning });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-tarefa]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
