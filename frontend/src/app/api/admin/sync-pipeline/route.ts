/**
 * POST /api/admin/sync-pipeline
 *
 * Varre todos os prestadores ativos (fase_projeto ≠ Pausado/Churn)
 * e cria entradas no pipeline para os que ainda não têm mm_clientes:
 *  1. Detecta gap por mm_id da entrevista ou por nome_empresa
 *  2. Atribui próximo ID sequencial (MM001, MM002…)
 *  3. Adiciona linha ao Cadastro_Clientes no Sheets
 *  4. Tenta duplicar PlanilhaModelo como aba individual (opcional)
 *  5. Insere no mm_clientes
 *  6. Atualiza mm_id na entrevista
 *
 * Retorna: { ok, created: [{id, nome, aba}], skipped, erros }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const FASES_INATIVAS = ["Pausado", "Churn"];

const CATEGORIA_LABELS: Record<string, string> = {
  musico: "Músico / Banda",
  fotografo: "Fotógrafo / Cinegrafista",
  celebrante: "Celebrante / Cerimonialista",
  dj: "DJ",
  outro: "Outro",
};

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

async function sAppend(token: string, range: string, values: string[][]): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${range}: ${res.status} — ${await res.text()}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 35);
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

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntrevistaRow {
  id: string;
  dados_json: Record<string, string> | null;
  criado_em: string;
}

interface PrestadorRow {
  id: string;
  nome_artistico: string;
  categoria: string;
  cidade_base: string | null;
  whatsapp: string | null;
  email: string | null;
  entrevistas: EntrevistaRow[];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const auth = await requireRole("cs_senior");
    if (auth instanceof NextResponse) return auth;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Lê todos os prestadores com entrevistas ────────────────────────────
    const { data: prestadoresRaw, error: errP } = await supabase
      .from("prestadores")
      .select(
        "id, nome_artistico, categoria, cidade_base, whatsapp, email, entrevistas(id, dados_json, criado_em)"
      )
      .order("nome_artistico");
    if (errP) throw new Error(`Supabase prestadores: ${errP.message}`);

    const prestadores = (prestadoresRaw ?? []) as PrestadorRow[];

    // ── 2. Lê todos os mm_clientes ────────────────────────────────────────────
    const { data: mmClientesRaw, error: errM } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa");
    if (errM) throw new Error(`Supabase mm_clientes: ${errM.message}`);

    const mmById = new Set(
      (mmClientesRaw ?? []).map((c: { id_cliente: string }) => c.id_cliente.toUpperCase())
    );
    const mmByNome = new Map(
      (mmClientesRaw ?? []).map((c: { id_cliente: string; nome_empresa: string }) => [
        c.nome_empresa.toLowerCase().trim(),
        c.id_cliente,
      ])
    );

    // ── 3. Identifica prestadores sem mm_cliente ──────────────────────────────
    const missing: Array<{
      prestador: PrestadorRow;
      dados: Record<string, string>;
      entrevistaId: string;
    }> = [];

    for (const p of prestadores) {
      const ultimaEntrevista = [...(p.entrevistas ?? [])].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      )[0];
      const dados = (ultimaEntrevista?.dados_json ?? {}) as Record<string, string>;
      const faseProjeto = dados.fase_projeto ?? "";
      if (FASES_INATIVAS.includes(faseProjeto)) continue;

      const mmId = (dados.mm_id ?? "").toUpperCase();
      const nomeLower = p.nome_artistico.toLowerCase().trim();

      const jaExiste = (mmId && mmById.has(mmId)) || mmByNome.has(nomeLower);
      if (!jaExiste) {
        missing.push({
          prestador: p,
          dados,
          entrevistaId: ultimaEntrevista?.id ?? "",
        });
      }
    }

    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        created: [],
        skipped: prestadores.length,
        erros: [],
        msg: "Todos os prestadores ativos já têm entrada na pipeline.",
      });
    }

    // ── 4. Google Sheets: token e metadados ───────────────────────────────────
    const token = await googleToken();

    type SheetMeta = { properties: { sheetId: number; title: string; index: number } };
    const meta = (await sGet(token, "?fields=sheets.properties")) as { sheets: SheetMeta[] };
    const abas = meta.sheets ?? [];

    const nomeAbaCadastro = abas
      .map((s) => s.properties.title)
      .find((t) => /cadastro.?clientes|^clientes$|^cadastro$/i.test(t.trim()));
    if (!nomeAbaCadastro) throw new Error("Aba Cadastro_Clientes não encontrada.");

    const modeloSheet = abas.find((s) =>
      /planilha.?modelo|^modelo$/i.test(s.properties.title.trim())
    );

    // ── 5. Lê Cadastro_Clientes para calcular próximo ID ──────────────────────
    const cadastroData = (await sGet(token, `/values/${encodeURIComponent(nomeAbaCadastro)}`)) as {
      values?: string[][];
    };
    const cadastroRows = cadastroData.values ?? [];

    const sheetNums = cadastroRows
      .flat()
      .map((c) => {
        const m = String(c ?? "").match(/^MM(\d+)$/i);
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter((n) => !isNaN(n));

    const supabaseNums = Array.from(mmById)
      .map((id) => {
        const m = id.match(/^MM(\d+)$/i);
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter((n) => !isNaN(n));

    let nextNum = Math.max(...[...sheetNums, ...supabaseNums, 0]) + 1;

    // ── 6. Cria entradas para cada prestador faltando ─────────────────────────
    const created: Array<{ id: string; nome: string; aba: string | null }> = [];
    const erros: Array<{ nome: string; erro: string }> = [];

    const hoje = new Date();
    const hojeStr = dateBR(hoje);
    const d7 = new Date(hoje);
    d7.setDate(d7.getDate() + 7);

    for (const { prestador, dados, entrevistaId } of missing) {
      try {
        const newId = `MM${String(nextNum).padStart(3, "0")}`;
        nextNum++;

        const nome = prestador.nome_artistico.trim();
        const segmento = CATEGORIA_LABELS[prestador.categoria] ?? prestador.categoria;
        const cidade = prestador.cidade_base?.trim() ?? "";
        const whatsapp = normalizePhone(prestador.whatsapp ?? "");
        const email = prestador.email?.trim() ?? "";
        const plano = dados.plano ?? "Essencial";
        const faseProjeto = dados.fase_projeto ?? "Onboarding";
        const responsavelMm = dados.responsavel_mm ?? "";
        const observacoes = dados.informacoes_adicionais ?? "";
        const novaAba = `${newId}_${slugify(nome)}`;

        // ─ 6a. Append no Cadastro_Clientes ────────────────────────────────────
        await sAppend(token, `${nomeAbaCadastro}!A:L`, [
          [
            newId,
            nome,
            segmento,
            cidade,
            whatsapp,
            email,
            hojeStr,
            plano,
            faseProjeto,
            "Ativo",
            responsavelMm,
            observacoes,
          ],
        ]);

        // ─ 6b. Tenta criar aba individual (PlanilhaModelo) ────────────────────
        let abaFinal: string | null = novaAba;
        if (modeloSheet) {
          try {
            await sPost(token, ":batchUpdate", {
              requests: [
                {
                  duplicateSheet: {
                    sourceSheetId: modeloSheet.properties.sheetId,
                    insertSheetIndex: abas.length + created.length,
                    newSheetName: novaAba,
                  },
                },
              ],
            });

            // Substitui "contratante" pelo nome do cliente nas primeiras 3 linhas
            const novaData = (await sGet(token, `/values/${encodeURIComponent(novaAba)}`)) as {
              values?: string[][];
            };
            const novaRows = novaData.values ?? [];
            const updates: Array<{ range: string; values: string[][] }> = [];

            for (let r = 0; r < Math.min(novaRows.length, 3); r++) {
              for (let c = 0; c < (novaRows[r]?.length ?? 0); c++) {
                const cell = novaRows[r][c] ?? "";
                if (/contratante/i.test(cell)) {
                  updates.push({
                    range: `${novaAba}!${colLetter(c)}${r + 1}`,
                    values: [[cell.replace(/contratante/gi, nome)]],
                  });
                }
              }
            }

            // Preenche prazo = hoje+7d em linhas com tarefa mas sem prazo
            let hRowIdx = -1,
              prazoCol = -1,
              oQueCol = -1;
            for (let i = 0; i < Math.min(novaRows.length, 6); i++) {
              const row = novaRows[i] ?? [];
              const pIdx = row.findIndex((h) => /prazo|data/i.test(h ?? ""));
              const oIdx = row.findIndex((h) =>
                /o[\s._]?que|tarefa|atividade|descri/i.test(h ?? "")
              );
              if (pIdx >= 0 && oIdx >= 0) {
                hRowIdx = i;
                prazoCol = pIdx;
                oQueCol = oIdx;
                break;
              }
            }
            if (hRowIdx >= 0) {
              for (let i = hRowIdx + 1; i < novaRows.length; i++) {
                const row = novaRows[i] ?? [];
                if ((row[oQueCol] ?? "").trim() && !(row[prazoCol] ?? "").trim()) {
                  updates.push({
                    range: `${novaAba}!${colLetter(prazoCol)}${i + 1}`,
                    values: [[dateBR(d7)]],
                  });
                }
              }
            }

            if (updates.length > 0) await sBatchUpdate(token, updates);
          } catch (tabErr) {
            // Aba já existe ou criação falhou — registra o nome mas não bloqueia
            console.warn(`[sync-pipeline] aba ${novaAba}:`, tabErr);
            abaFinal = novaAba; // nome esperado, mesmo sem criação
          }
        } else {
          abaFinal = null; // sem PlanilhaModelo disponível
        }

        // ─ 6c. Insere no Supabase ──────────────────────────────────────────────
        const { error: dbErr } = await supabase.from("mm_clientes").insert({
          id_cliente: newId,
          nome_empresa: nome,
          segmento: segmento || null,
          cidade: cidade || null,
          whatsapp: whatsapp || null,
          email: email || null,
          plano: plano || null,
          status: "Ativo",
          fase_projeto: faseProjeto || "Onboarding",
          responsavel_mm: responsavelMm || null,
          observacoes: observacoes || null,
          inicio_contrato: hojeStr.split("/").reverse().join("-"),
          valor_contrato: 0,
          sheets_aba: abaFinal,
          atualizado_em: new Date().toISOString(),
        });
        if (dbErr) throw new Error(`Supabase insert: ${dbErr.message}`);

        // ─ 6d. Atualiza mm_id na entrevista ───────────────────────────────────
        if (entrevistaId) {
          await supabase
            .from("entrevistas")
            .update({ dados_json: { ...dados, mm_id: newId } })
            .eq("id", entrevistaId);
        }

        created.push({ id: newId, nome, aba: abaFinal });
      } catch (err) {
        erros.push({ nome: prestador.nome_artistico, erro: String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped: prestadores.length - missing.length,
      erros,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-pipeline]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
