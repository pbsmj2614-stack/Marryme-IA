/**
 * POST /api/sheets/novo-cliente
 *
 * Cadastra um novo cliente:
 *  1. Determina o próximo ID sequencial (MM001, MM002…)
 *  2. Duplica a aba "PlanilhaModelo" no Sheets
 *  3. Renomeia para "MMXXX_NomeLimpo"
 *  4. Substitui "contratante" no título da aba pelo nome do cliente
 *  5. Preenche prazo = hoje + 7 dias em linhas com tarefa mas sem prazo
 *  6. Adiciona linha ao Cadastro_Clientes
 *  7. Insere o cliente no Supabase (mm_clientes)
 *
 * Requer env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON   (conteúdo do JSON da Service Account)
 *   NEXT_PUBLIC_SHEETS_ID         (ID da planilha)
 *   SUPABASE_URL                  (ou NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SHEET_ID = process.env.NEXT_PUBLIC_SHEETS_ID ?? "";
const BASE     = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── Google Service Account Auth ──────────────────────────────────────────────

function makeJWT(email: string, key: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss:   email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  })).toString("base64url");

  const msg  = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(msg);
  return `${msg}.${sign.sign(key, "base64url")}`;
}

async function googleToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado nas variáveis de ambiente.");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const jwt = makeJWT(sa.client_email, sa.private_key);

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Sheets helpers ────────────────────────────────────────────────────────────

async function sGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${SHEET_ID}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets GET ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function sPost(token: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/${SHEET_ID}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sheets POST ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function sPut(token: string, range: string, values: string[][]): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets PUT ${range}: ${res.status} — ${await res.text()}`);
}

async function sBatchUpdate(token: string, data: Array<{ range: string; values: string[][] }>): Promise<void> {
  if (data.length === 0) return;
  const url = `${BASE}/${SHEET_ID}/values:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!res.ok) throw new Error(`Sheets batchUpdate: ${res.status} — ${await res.text()}`);
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dateBR(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, "0");
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function colLetter(col: number): string {
  let s = "";
  let c = col + 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

/** Remove acentos, caracteres especiais e espaços (→ _) para nome de aba. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 35);
}

/** Valida e normaliza número de telefone (remove tudo que não for dígito). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

    const {
      nome_empresa,
      segmento,
      cidade,
      whatsapp,
      email,
      plano,
      fase_projeto,
      responsavel_mm,
      observacoes,
    } = body as Record<string, string>;

    // ── Validações ──
    if (!nome_empresa?.trim() || nome_empresa.trim().length < 2) {
      return NextResponse.json({ error: "Nome da empresa é obrigatório (mínimo 2 caracteres)." }, { status: 400 });
    }
    if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const token = await googleToken();

    // ── 1. Metadados da planilha ──
    type SheetMeta = { properties: { sheetId: number; title: string; index: number } };
    const meta  = await sGet(token, "?fields=sheets.properties") as { sheets: SheetMeta[] };
    const abas  = meta.sheets ?? [];

    // ── 2. Encontrar PlanilhaModelo ──
    const modeloSheet = abas.find((s) =>
      /planilha.?modelo|^modelo$/i.test(s.properties.title.trim())
    );
    if (!modeloSheet) {
      return NextResponse.json(
        { error: 'Aba "PlanilhaModelo" não encontrada. Crie uma aba com esse nome como template.' },
        { status: 404 }
      );
    }

    // ── 3. Encontrar Cadastro_Clientes ──
    const cadastroSheet = abas.find((s) =>
      /cadastro.?clientes|^clientes$|^cadastro$/i.test(s.properties.title.trim())
    );
    if (!cadastroSheet) {
      return NextResponse.json(
        { error: 'Aba "Cadastro_Clientes" não encontrada.' },
        { status: 404 }
      );
    }

    // ── 4. Determinar próximo ID ──
    const cadastroData = await sGet(
      token,
      `/values/${encodeURIComponent(cadastroSheet.properties.title)}`
    ) as { values?: string[][] };
    const cadastroRows: string[][] = cadastroData.values ?? [];

    const existingNums = cadastroRows
      .flat()
      .map((c) => { const m = String(c ?? "").match(/^MM(\d+)$/i); return m ? parseInt(m[1], 10) : NaN; })
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const newId   = `MM${String(nextNum).padStart(3, "0")}`;

    // ── 5. Verificar duplicata pelo nome ──
    const nomeTrimmed = nome_empresa.trim();
    const nomeSlug    = nomeTrimmed.toLowerCase().replace(/\s+/g, "");
    const jaExiste    = abas.some((s) => {
      const al = s.properties.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      return al.includes(nomeSlug) || nomeSlug.includes(al);
    });
    // Não bloqueia — apenas avisa no response

    // ── 6. Nome da nova aba ──
    const novaAba = `${newId}_${slugify(nomeTrimmed)}`;

    // ── 7. Duplicar PlanilhaModelo ──
    const dupRes = await sPost(token, ":batchUpdate", {
      requests: [{
        duplicateSheet: {
          sourceSheetId:   modeloSheet.properties.sheetId,
          insertSheetIndex: abas.length,
          newSheetName:    novaAba,
        },
      }],
    }) as { replies: Array<{ duplicateSheet?: { properties: { sheetId: number } } }> };

    // sheetId da nova aba (reservado para uso futuro)
    // dupRes.replies?.[0]?.duplicateSheet?.properties?.sheetId

    // ── 8. Ler conteúdo da nova aba ──
    const novaData = await sGet(
      token,
      `/values/${encodeURIComponent(novaAba)}`
    ) as { values?: string[][] };
    const novaRows: string[][] = novaData.values ?? [];

    // ── 9. Substituir "contratante" no título ──
    const tituloUpdates: Array<{ range: string; values: string[][] }> = [];
    for (let r = 0; r < Math.min(novaRows.length, 3); r++) {
      for (let c = 0; c < novaRows[r].length; c++) {
        const cell = novaRows[r][c] ?? "";
        if (/contratante/i.test(cell)) {
          tituloUpdates.push({
            range:  `${novaAba}!${colLetter(c)}${r + 1}`,
            values: [[cell.replace(/contratante/gi, nomeTrimmed)]],
          });
        }
      }
    }
    if (tituloUpdates.length > 0) await sBatchUpdate(token, tituloUpdates);

    // ── 10. Preencher prazo = hoje + 7 dias em linhas com tarefa sem prazo ──
    const hoje = new Date();
    const d7   = new Date(hoje);
    d7.setDate(d7.getDate() + 7);
    const prazoD7 = dateBR(d7);

    // Localiza cabeçalho (procura colunas prazo e o_que)
    let hRowIdx = -1, prazoCol = -1, oQueCol = -1;
    for (let i = 0; i < Math.min(novaRows.length, 6); i++) {
      const row      = novaRows[i];
      const pIdx     = row.findIndex((h) => /prazo|data/i.test(h ?? ""));
      const oIdx     = row.findIndex((h) => /o[\s._]?que|tarefa|atividade|descri/i.test(h ?? ""));
      if (pIdx >= 0 && oIdx >= 0) { hRowIdx = i; prazoCol = pIdx; oQueCol = oIdx; break; }
    }

    const prazoUpdates: Array<{ range: string; values: string[][] }> = [];
    if (hRowIdx >= 0) {
      for (let i = hRowIdx + 1; i < novaRows.length; i++) {
        const row     = novaRows[i];
        const oQueVal = (row[oQueCol] ?? "").trim();
        const prazoVal = (row[prazoCol] ?? "").trim();
        if (oQueVal && !prazoVal) {
          prazoUpdates.push({
            range:  `${novaAba}!${colLetter(prazoCol)}${i + 1}`,
            values: [[prazoD7]],
          });
        }
      }
    }
    if (prazoUpdates.length > 0) await sBatchUpdate(token, prazoUpdates);

    // ── 11. Adicionar linha no Cadastro_Clientes ──
    const hojeStr = dateBR(hoje);
    const novaLinha = [
      newId,
      nomeTrimmed,
      segmento?.trim() ?? "",
      cidade?.trim()   ?? "",
      normalizePhone(whatsapp ?? ""),
      email?.trim()    ?? "",
      hojeStr,
      plano?.trim()    ?? "",
      fase_projeto?.trim()   ?? "Onboarding",
      "Ativo",
      responsavel_mm?.trim() ?? "",
      observacoes?.trim()    ?? "",
    ];
    await sAppend(token, `${cadastroSheet.properties.title}!A:L`, [novaLinha]);

    // ── 12. Inserir no Supabase ──
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error: dbErr } = await supabase.from("mm_clientes").insert({
        id_cliente:      newId,
        nome_empresa:    nomeTrimmed,
        segmento:        segmento?.trim()       || null,
        cidade:          cidade?.trim()         || null,
        whatsapp:        whatsapp?.trim()       || null,
        email:           email?.trim()          || null,
        plano:           plano?.trim()          || null,
        status:          "Ativo",
        fase_projeto:    fase_projeto?.trim()   || "Onboarding",
        responsavel_mm:  responsavel_mm?.trim() || null,
        observacoes:     observacoes?.trim()    || null,
        inicio_contrato: hojeStr.split("/").reverse().join("-"), // DD/MM/YYYY → YYYY-MM-DD
        valor_contrato:  0,
        sheets_aba:      novaAba,
        atualizado_em:   new Date().toISOString(),
      });
      if (dbErr) console.error("Supabase insert:", dbErr.message);
    }

    return NextResponse.json({
      ok:       true,
      id:       newId,
      aba:      novaAba,
      aviso:    jaExiste ? `Já existe uma aba com nome similar a "${nomeTrimmed}". Verifique se não é duplicata.` : null,
      tarefas:  prazoUpdates.length,
      message:  `${nomeTrimmed} cadastrado como ${newId} · aba "${novaAba}" criada com ${prazoUpdates.length} tarefa(s) com prazo em ${prazoD7}.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[novo-cliente]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
