/**
 * POST /api/sheets/write-back-status
 *
 * Lê todos os clientes do Supabase e escreve o status atual de volta
 * na coluna Status do Cadastro_Clientes. Corrige clientes que estão
 * Pausado/Encerrado no app mas ainda aparecem como Ativo na planilha.
 *
 * Retorna: { ok, atualizados, total }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";

const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

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

async function sRead(token: string, range: string): Promise<string[][]> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets READ ${range}: ${res.status} — ${await res.text()}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

async function sBatchUpdate(
  token: string,
  data: Array<{ range: string; values: string[][] }>
): Promise<void> {
  if (data.length === 0) return;
  const url = `${BASE}/${SHEET_ID}/values:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!res.ok) throw new Error(`Sheets batchUpdate: ${res.status} — ${await res.text()}`);
}

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Lê todos os clientes do Supabase ──────────────────────────────────
    const { data: clientes, error: errDb } = await supabase
      .from("mm_clientes")
      .select("id_cliente, status");

    if (errDb) throw new Error(`Supabase: ${errDb.message}`);
    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ ok: true, atualizados: 0, total: 0 });
    }

    const statusMap = new Map<string, string>(
      clientes.map((c: { id_cliente: string; status: string }) => [
        c.id_cliente.toUpperCase(),
        c.status ?? "Ativo",
      ])
    );

    // ── 2. Lê Cadastro_Clientes ───────────────────────────────────────────────
    if (!SHEET_ID) return NextResponse.json({ ok: true, atualizados: 0, total: 0 });

    const token = await googleToken();

    const metaData = (await (
      await fetch(`${BASE}/${SHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()) as { sheets: { properties: { title: string } }[] };

    const nomeAba = (metaData.sheets ?? [])
      .map((s) => s.properties.title)
      .find((t) => /cadastro.?clientes|^clientes$|^cadastro$/i.test(t.trim()));

    if (!nomeAba) throw new Error("Aba Cadastro_Clientes não encontrada.");

    const rows = await sRead(token, `${nomeAba}!A:P`);
    if (rows.length < 2) return NextResponse.json({ ok: true, atualizados: 0, total: 0 });

    // ── 3. Detecta linha de cabeçalho e coluna Status ────────────────────────
    let dataStartRow = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.some((c) => /^MM\d+/i.test(c?.trim() ?? ""))) {
        dataStartRow = i;
        break;
      }
    }
    if (dataStartRow === -1) throw new Error("Nenhuma linha com ID MM encontrada.");

    const headerRow = dataStartRow > 0 ? (rows[dataStartRow - 1] ?? []) : [];

    const normalizeHeader = (s: string) =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "_")
        .replace(/^_+|_+$/g, "");

    // Detecta a coluna do ID a partir da primeira linha de dados
    const idColIdx = (rows[dataStartRow] ?? []).findIndex((c) => /^MM\d+/i.test(c?.trim() ?? ""));
    const idCol = idColIdx >= 0 ? idColIdx : 0;

    // Detecta coluna Status pelo cabeçalho; fallback = col L (11) ou col após ID
    let statusColIdx = idCol + 9; // fallback relativo ao ID
    for (let i = 0; i < headerRow.length; i++) {
      if (normalizeHeader(headerRow[i] ?? "") === "status") {
        statusColIdx = i;
        break;
      }
    }

    const colLetter = String.fromCharCode(65 + statusColIdx);

    // ── 4. Monta batch de atualizações para linhas que divergem ──────────────
    const updates: Array<{ range: string; values: string[][] }> = [];

    for (let i = dataStartRow; i < rows.length; i++) {
      const rowId = (rows[i]?.[idCol] ?? "").trim().toUpperCase();
      if (!/^MM\d+$/i.test(rowId)) continue;

      const supabaseStatus = statusMap.get(rowId);
      if (!supabaseStatus) continue;

      const sheetStatus = (rows[i]?.[statusColIdx] ?? "").trim();
      if (sheetStatus === supabaseStatus) continue; // já está correto

      const sheetRow = i + 1; // 1-indexed
      updates.push({
        range: `${nomeAba}!${colLetter}${sheetRow}`,
        values: [[supabaseStatus]],
      });
    }

    if (updates.length > 0) {
      await sBatchUpdate(token, updates);
    }

    return NextResponse.json({ ok: true, atualizados: updates.length, total: clientes.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[write-back-status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
