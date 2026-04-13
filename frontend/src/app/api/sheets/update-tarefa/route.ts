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

const SHEET_ID = process.env.NEXT_PUBLIC_SHEETS_ID ?? "";
const BASE     = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── Google Auth ──────────────────────────────────────────────────────────────

function makeJWT(email: string, key: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })).toString("base64url");
  const msg  = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(msg);
  return `${msg}.${sign.sign(key, "base64url")}`;
}

async function googleToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado.");
  const sa  = JSON.parse(raw) as { client_email: string; private_key: string };
  const jwt = makeJWT(sa.client_email, sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error_description?: string };
  if (!data.access_token)
    throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Sheets helpers ───────────────────────────────────────────────────────────

async function sRead(token: string, range: string): Promise<string[][]> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets READ ${range}: ${res.status} — ${await res.text()}`);
  const data = await res.json() as { values?: string[][] };
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
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

    const id             = String(body.id             ?? "");
    const id_cliente     = String(body.id_cliente     ?? "");
    const o_que_original = body.o_que_original != null ? String(body.o_que_original).trim() : "";

    if (!id)         return NextResponse.json({ error: "id obrigatório"         }, { status: 400 });
    if (!id_cliente) return NextResponse.json({ error: "id_cliente obrigatório" }, { status: 400 });

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // ── 1. Busca aba do cliente ──────────────────────────────────────────────────
    const { data: cliente } = await supabase
      .from("mm_clientes")
      .select("sheets_aba")
      .eq("id_cliente", id_cliente)
      .maybeSingle();

    // ── 2. Atualiza Supabase ─────────────────────────────────────────────────────
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (body.check_feito  !== undefined) patch.check_feito  = body.check_feito;
    if (body.status       !== undefined) patch.status       = String(body.status).trim();
    if (body.quem         !== undefined) patch.quem         = String(body.quem).trim()        || null;
    if (body.prazo        !== undefined) patch.prazo        = String(body.prazo).trim()        || null;
    if (body.etapa        !== undefined) patch.etapa        = String(body.etapa).trim()        || null;
    if (body.tipo         !== undefined) patch.tipo         = String(body.tipo).trim()         || null;
    if (body.observacoes  !== undefined) patch.observacoes  = String(body.observacoes).trim()  || null;

    const { error: errUpdate } = await supabase
      .from("mm_tarefas")
      .update(patch)
      .eq("id", id);

    if (errUpdate) throw new Error(`Supabase update falhou: ${errUpdate.message}`);

    // ── 3. Atualiza linha no Sheets ──────────────────────────────────────────────
    if (cliente?.sheets_aba && o_que_original) {
      const token = await googleToken();
      const rows  = await sRead(token, `${cliente.sheets_aba}!A:H`);

      // Identifica a linha pela correspondência: col C (o_que) é obrigatória,
      // col B (etapa) e col F (prazo DD/MM/YYYY) são restrições adicionais se fornecidas.
      const oQueNorm      = o_que_original.toLowerCase();
      const prazoOrigBR   = body.prazo_original  ? toDateBR(String(body.prazo_original))  : null;
      const etapaOrigNorm = body.etapa_original  ? String(body.etapa_original).trim().toLowerCase() : null;

      let rowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const row      = rows[i] ?? [];
        const rowOQue  = (row[2] ?? "").trim().toLowerCase();
        if (rowOQue !== oQueNorm) continue;

        if (etapaOrigNorm !== null) {
          const rowEtapa = (row[1] ?? "").trim().toLowerCase();
          if (rowEtapa !== etapaOrigNorm) continue;
        }
        if (prazoOrigBR !== null) {
          const rowPrazo = (row[5] ?? "").trim();
          if (rowPrazo !== prazoOrigBR) continue;
        }

        rowIndex = i;
        break;
      }

      if (rowIndex >= 0) {
        const existing = rows[rowIndex] ?? [];

        // Mescla: usa novo valor se fornecido, senão mantém o existente
        const newRow = [
          body.check_feito !== undefined
            ? (body.check_feito ? "TRUE" : "FALSE")
            : (existing[0] ?? "FALSE"),
          body.etapa    !== undefined ? String(body.etapa).trim()        : (existing[1] ?? ""),
          existing[2] ?? "",   // o_que — não alterar (é a chave de busca)
          body.tipo     !== undefined ? String(body.tipo).trim()         : (existing[3] ?? "Marry Me"),
          body.quem     !== undefined ? String(body.quem).trim()         : (existing[4] ?? ""),
          body.prazo    !== undefined ? toDateBR(String(body.prazo))     : (existing[5] ?? ""),
          body.status   !== undefined ? String(body.status).trim()       : (existing[6] ?? ""),
          body.observacoes !== undefined ? String(body.observacoes).trim() : (existing[7] ?? ""),
        ];

        const sheetRow = rowIndex + 1; // 1-indexed
        await sUpdate(token, `${cliente.sheets_aba}!A${sheetRow}:H${sheetRow}`, [newRow]);
      }
      // Se a linha não foi encontrada: Supabase já foi atualizado — degradação graciosa
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-tarefa]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
