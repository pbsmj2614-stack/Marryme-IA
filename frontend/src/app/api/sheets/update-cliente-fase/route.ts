/**
 * POST /api/sheets/update-cliente-fase
 *
 * Atualiza o campo fase_projeto de um cliente em dois lugares:
 *  1. mm_clientes.fase_projeto no Supabase
 *  2. Coluna "Fase do Projeto" na aba Cadastro_Clientes no Google Sheets
 *
 * Body: { id_cliente: string, fase_projeto: string }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";

const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const VALID_FASES = [
  "Onboarding",
  "Planejamento de Metas",
  "Voo de Cruzeiro",
  "Renovação",
  "Pausado",
  "Churn",
] as const;

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

async function sUpdate(token: string, range: string, value: string): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!res.ok) throw new Error(`Sheets UPDATE ${range}: ${res.status} — ${await res.text()}`);
}

const normalizeHeader = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const body = (await req.json().catch(() => null)) as {
      id_cliente?: string;
      fase_projeto?: string;
    } | null;

    const idCliente = body?.id_cliente?.trim().toUpperCase();
    const novaFase = body?.fase_projeto?.trim();

    if (!idCliente || !novaFase || !(VALID_FASES as readonly string[]).includes(novaFase)) {
      return NextResponse.json(
        {
          error: `id_cliente e fase_projeto válida são obrigatórios. Valores aceitos: ${VALID_FASES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Atualiza Supabase ──────────────────────────────────────────────────
    const { error: errDb } = await supabase
      .from("mm_clientes")
      .update({ fase_projeto: novaFase, atualizado_em: new Date().toISOString() })
      .eq("id_cliente", idCliente);

    if (errDb) throw new Error(`Supabase: ${errDb.message}`);

    // ── 2. Atualiza Cadastro_Clientes no Sheets ───────────────────────────────
    if (!SHEET_ID) return NextResponse.json({ ok: true, sheets: false });

    const token = await googleToken();

    const metaData = (await (
      await fetch(`${BASE}/${SHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()) as { sheets: { properties: { title: string } }[] };

    const nomeAba = (metaData.sheets ?? [])
      .map((s) => s.properties.title)
      .find((t) => /cadastro.?clientes|^clientes$|^cadastro$/i.test(t.trim()));

    if (!nomeAba) {
      console.warn("[update-cliente-fase] aba Cadastro_Clientes não encontrada");
      return NextResponse.json({ ok: true, sheets: false });
    }

    const rows = await sRead(token, `${nomeAba}!A:P`);
    if (rows.length < 2) return NextResponse.json({ ok: true, sheets: false });

    let dataStartRow = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.some((c) => /^MM\d+/i.test(c?.trim() ?? ""))) {
        dataStartRow = i;
        break;
      }
    }
    if (dataStartRow === -1) return NextResponse.json({ ok: true, sheets: false });

    const headerRow = dataStartRow > 0 ? (rows[dataStartRow - 1] ?? []) : [];

    const idColIdx = (rows[dataStartRow] ?? []).findIndex((c) => /^MM\d+/i.test(c?.trim() ?? ""));
    const idCol = idColIdx >= 0 ? idColIdx : 0;

    // Detecta coluna Fase pelo cabeçalho; fallback posição relativa ao ID
    let faseColIdx = idCol + 8;
    for (let i = 0; i < headerRow.length; i++) {
      const h = normalizeHeader(headerRow[i] ?? "");
      if (h === "fase_projeto" || h === "fase" || h === "fase_do_projeto") {
        faseColIdx = i;
        break;
      }
    }

    let rowFound = false;
    for (let i = dataStartRow; i < rows.length; i++) {
      const rowId = (rows[i]?.[idCol] ?? "").trim().toUpperCase();
      if (rowId !== idCliente) continue;

      const colLetter = String.fromCharCode(65 + faseColIdx);
      const sheetRow = i + 1;
      await sUpdate(token, `${nomeAba}!${colLetter}${sheetRow}`, novaFase);
      rowFound = true;
      break;
    }

    if (!rowFound) {
      console.warn(`[update-cliente-fase] ${idCliente} não encontrado em ${nomeAba}`);
    }

    return NextResponse.json({ ok: true, rowFound });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-cliente-fase]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
