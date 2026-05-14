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

import { type NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";

const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const FASES_INATIVAS = new Set(["Pausado", "Churn"]);

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

async function sheetsGet(token: string, path: string): Promise<unknown> {
  const url = `${BASE}/${SHEET_ID}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets GET ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function sheetsPost(token: string, path: string, body: unknown): Promise<unknown> {
  const url = `${BASE}/${SHEET_ID}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sheets POST ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function sheetsAppend(token: string, range: string, values: string[][]): Promise<void> {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${range}: ${res.status} — ${await res.text()}`);
}

async function sheetsBatchUpdate(
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
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

function cleanPhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function extractMMNum(id: string): number {
  const m = String(id ?? "").match(/^MM(\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Variáveis Supabase não configuradas." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Lê prestadores ─────────────────────────────────────────────────────
    const { data: prestadoresRaw, error: errP } = await supabase
      .from("prestadores")
      .select("id, nome_artistico, categoria, cidade_base, whatsapp, email")
      .order("nome_artistico");

    if (errP) throw new Error(`Erro ao buscar prestadores: ${errP.message}`);
    const prestadores = prestadoresRaw ?? [];

    // ── 2. Lê entrevistas (separado para evitar nested select no service role) ─
    const { data: entrevistasRaw, error: errE } = await supabase
      .from("entrevistas")
      .select("id, prestador_id, dados_json, criado_em")
      .order("criado_em", { ascending: false });

    if (errE) throw new Error(`Erro ao buscar entrevistas: ${errE.message}`);

    // Agrupa entrevistas por prestador_id — mantém apenas a mais recente
    const latestEntrevista = new Map<
      string,
      { id: string; prestador_id: string; dados_json: Record<string, string>; criado_em: string }
    >();
    for (const e of entrevistasRaw ?? []) {
      if (!latestEntrevista.has(e.prestador_id)) {
        latestEntrevista.set(e.prestador_id, {
          id: String(e.id),
          prestador_id: String(e.prestador_id),
          dados_json: (e.dados_json ?? {}) as Record<string, string>,
          criado_em: String(e.criado_em),
        });
      }
    }

    // ── 3. Lê mm_clientes ─────────────────────────────────────────────────────
    const { data: mmRaw, error: errM } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa");

    if (errM) throw new Error(`Erro ao buscar mm_clientes: ${errM.message}`);

    const mmByIdSet = new Set((mmRaw ?? []).map((c) => String(c.id_cliente).toUpperCase()));
    const mmByNomeMap = new Map(
      (mmRaw ?? []).map((c) => [String(c.nome_empresa).toLowerCase().trim(), String(c.id_cliente)])
    );

    // ── 4. Identifica prestadores sem mm_cliente ──────────────────────────────
    const missing: Array<{
      prestadorId: string;
      nome: string;
      categoria: string;
      cidade: string;
      whatsapp: string;
      email: string;
      dados: Record<string, string>;
      entrevistaId: string;
    }> = [];

    for (const p of prestadores) {
      const entrevista = latestEntrevista.get(String(p.id));
      const dados = entrevista?.dados_json ?? {};
      const faseProjeto = String(dados.fase_projeto ?? "");

      if (FASES_INATIVAS.has(faseProjeto)) continue;

      const mmId = String(dados.mm_id ?? "").toUpperCase();
      const nomeLower = String(p.nome_artistico ?? "")
        .toLowerCase()
        .trim();

      const jaExiste = (mmId.length > 0 && mmByIdSet.has(mmId)) || mmByNomeMap.has(nomeLower);
      if (!jaExiste) {
        missing.push({
          prestadorId: String(p.id),
          nome: String(p.nome_artistico ?? "").trim(),
          categoria: String(p.categoria ?? "outro"),
          cidade: String(p.cidade_base ?? "").trim(),
          whatsapp: cleanPhone(String(p.whatsapp ?? "")),
          email: String(p.email ?? "").trim(),
          dados,
          entrevistaId: entrevista?.id ?? "",
        });
      }
    }

    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        created: [],
        skipped: prestadores.length,
        erros: [],
      });
    }

    // ── 5. Google Sheets: token e metadados ───────────────────────────────────
    const token = await googleToken();

    type SheetProps = { properties: { sheetId: number; title: string; index: number } };
    const meta = (await sheetsGet(token, "?fields=sheets.properties")) as { sheets: SheetProps[] };
    const abas: SheetProps[] = Array.isArray(meta.sheets) ? meta.sheets : [];

    const nomeAbaCadastro = abas
      .map((s) => s.properties.title)
      .find((t) => /cadastro.?clientes|^clientes$|^cadastro$/i.test(String(t).trim()));

    if (!nomeAbaCadastro) throw new Error("Aba Cadastro_Clientes não encontrada na planilha.");

    const modeloSheet = abas.find((s) =>
      /planilha.?modelo|^modelo$/i.test(String(s.properties.title).trim())
    );

    // ── 6. Calcula próximo ID ─────────────────────────────────────────────────
    const cadastroData = (await sheetsGet(
      token,
      `/values/${encodeURIComponent(nomeAbaCadastro)}`
    )) as { values?: string[][] };

    const cadastroRows: string[][] = Array.isArray(cadastroData.values) ? cadastroData.values : [];

    const allNums = [
      ...cadastroRows
        .flat()
        .map(extractMMNum)
        .filter((x) => x > 0),
      ...Array.from(mmByIdSet)
        .map(extractMMNum)
        .filter((x) => x > 0),
      0,
    ];

    let nextNum = Math.max(...allNums) + 1;

    // ── 7. Cria entradas ──────────────────────────────────────────────────────
    const created: Array<{ id: string; nome: string; aba: string | null }> = [];
    const erros: Array<{ nome: string; erro: string }> = [];

    const hoje = new Date();
    const hojeStr = dateBR(hoje);
    const d7 = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const item of missing) {
      const stepName = item.nome;
      try {
        const newId = `MM${String(nextNum).padStart(3, "0")}`;
        nextNum++;

        const segmento = CATEGORIA_LABELS[item.categoria] ?? item.categoria;
        const plano = String(item.dados.plano ?? "Essencial");
        const faseProjeto = String(item.dados.fase_projeto ?? "Onboarding");
        const responsavelMm = String(item.dados.responsavel_mm ?? "");
        const observacoes = String(item.dados.informacoes_adicionais ?? "");
        const novaAba = `${newId}_${slugify(item.nome)}`;

        // 7a. Append no Cadastro_Clientes
        await sheetsAppend(token, `${nomeAbaCadastro}!A:L`, [
          [
            newId,
            item.nome,
            segmento,
            item.cidade,
            item.whatsapp,
            item.email,
            hojeStr,
            plano,
            faseProjeto,
            "Ativo",
            responsavelMm,
            observacoes,
          ],
        ]);

        // 7b. Tenta criar aba individual (PlanilhaModelo) — falha silenciosa
        let abaFinal: string | null = novaAba;
        if (modeloSheet) {
          try {
            await sheetsPost(token, ":batchUpdate", {
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

            const novaData = (await sheetsGet(token, `/values/${encodeURIComponent(novaAba)}`)) as {
              values?: string[][];
            };
            const novaRows: string[][] = Array.isArray(novaData.values) ? novaData.values : [];

            const updates: Array<{ range: string; values: string[][] }> = [];

            for (let r = 0; r < Math.min(novaRows.length, 3); r++) {
              const row = novaRows[r] ?? [];
              for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] ?? "");
                if (/contratante/i.test(cell)) {
                  updates.push({
                    range: `${novaAba}!${colLetter(c)}${r + 1}`,
                    values: [[cell.replace(/contratante/gi, item.nome)]],
                  });
                }
              }
            }

            // Preenche prazo em linhas com tarefa mas sem prazo
            let hRowIdx = -1,
              prazoCol = -1,
              oQueCol = -1;
            for (let i = 0; i < Math.min(novaRows.length, 6); i++) {
              const row = novaRows[i] ?? [];
              const pi = row.findIndex((h) => /prazo|data/i.test(String(h ?? "")));
              const oi = row.findIndex((h) =>
                /o[\s._]?que|tarefa|atividade|descri/i.test(String(h ?? ""))
              );
              if (pi >= 0 && oi >= 0) {
                hRowIdx = i;
                prazoCol = pi;
                oQueCol = oi;
                break;
              }
            }
            if (hRowIdx >= 0) {
              for (let i = hRowIdx + 1; i < novaRows.length; i++) {
                const row = novaRows[i] ?? [];
                if (String(row[oQueCol] ?? "").trim() && !String(row[prazoCol] ?? "").trim()) {
                  updates.push({
                    range: `${novaAba}!${colLetter(prazoCol)}${i + 1}`,
                    values: [[dateBR(d7)]],
                  });
                }
              }
            }

            if (updates.length > 0) await sheetsBatchUpdate(token, updates);
          } catch {
            // Aba pode já existir ou PlanilhaModelo sem permissão — não bloqueia
            abaFinal = novaAba;
          }
        } else {
          abaFinal = null;
        }

        // 7c. Insere no mm_clientes
        const { error: dbErr } = await supabase.from("mm_clientes").insert({
          id_cliente: newId,
          nome_empresa: item.nome,
          segmento: segmento || null,
          cidade: item.cidade || null,
          whatsapp: item.whatsapp || null,
          email: item.email || null,
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

        // 7d. Atualiza mm_id na entrevista
        if (item.entrevistaId) {
          await supabase
            .from("entrevistas")
            .update({ dados_json: { ...item.dados, mm_id: newId } })
            .eq("id", item.entrevistaId);
        }

        created.push({ id: newId, nome: item.nome, aba: abaFinal });
      } catch (err) {
        erros.push({ nome: stepName, erro: err instanceof Error ? err.message : String(err) });
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

// ─── DELETE /api/admin/sync-pipeline?from=MM046 ───────────────────────────────
// Remove entradas de mm_clientes, linhas no Sheets e abas individuais
// para todos os IDs com número >= fromNum. Limpa mm_id nas entrevistas.

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const fromParam = new URL(req.url).searchParams.get("from") ?? "";
    const fromNum = extractMMNum(fromParam);
    if (fromNum <= 0) {
      return NextResponse.json(
        { error: 'Parâmetro "from" inválido. Use ex: ?from=MM046' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Busca todos os mm_clientes e filtra >= fromNum em JS
    const { data: allMM, error: errF } = await supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, sheets_aba");

    if (errF) throw new Error(`Erro ao buscar mm_clientes: ${errF.message}`);

    const targets = (allMM ?? []).filter((c) => extractMMNum(String(c.id_cliente)) >= fromNum);

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        deleted: [],
        message: `Nenhum registro encontrado a partir de ${fromParam}`,
      });
    }

    const targetIds = new Set(targets.map((c) => String(c.id_cliente).toUpperCase()));
    const targetAbas = new Set(targets.map((c) => String(c.sheets_aba ?? "")).filter(Boolean));

    // 2. Google Sheets: remove linhas e abas
    const token = await googleToken();

    type SheetProps = { properties: { sheetId: number; title: string } };
    const meta = (await sheetsGet(token, "?fields=sheets.properties")) as {
      sheets: SheetProps[];
    };
    const abas: SheetProps[] = Array.isArray(meta.sheets) ? meta.sheets : [];

    const nomeAbaCadastro = abas
      .map((s) => s.properties.title)
      .find((t) => /cadastro.?clientes|^clientes$|^cadastro$/i.test(String(t).trim()));

    const sheetRequests: unknown[] = [];

    // 2a. Deleta linhas do Cadastro_Clientes (de baixo pra cima para índices estáveis)
    if (nomeAbaCadastro) {
      const cadastroSheetId = abas.find((s) => s.properties.title === nomeAbaCadastro)?.properties
        .sheetId;

      const cadastroData = (await sheetsGet(
        token,
        `/values/${encodeURIComponent(nomeAbaCadastro)}`
      )) as { values?: string[][] };
      const rows: string[][] = Array.isArray(cadastroData.values) ? cadastroData.values : [];

      // Índices das linhas de dados que correspondem a um dos IDs alvo (pula cabeçalho i=0)
      const rowsToDelete: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const cellId = String(rows[i]?.[0] ?? "").toUpperCase();
        if (targetIds.has(cellId)) rowsToDelete.push(i);
      }

      // Ordem decrescente para índices não se deslocarem
      rowsToDelete.sort((a, b) => b - a);

      for (const idx of rowsToDelete) {
        sheetRequests.push({
          deleteDimension: {
            range: {
              sheetId: cadastroSheetId,
              dimension: "ROWS",
              startIndex: idx,
              endIndex: idx + 1,
            },
          },
        });
      }
    }

    // 2b. Deleta abas individuais
    for (const aba of abas) {
      if (targetAbas.has(aba.properties.title)) {
        sheetRequests.push({ deleteSheet: { sheetId: aba.properties.sheetId } });
      }
    }

    if (sheetRequests.length > 0) {
      await sheetsPost(token, ":batchUpdate", { requests: sheetRequests });
    }

    // 3. Deleta do mm_clientes
    const { error: errD } = await supabase
      .from("mm_clientes")
      .delete()
      .in("id_cliente", Array.from(targetIds));

    if (errD) throw new Error(`Erro ao deletar mm_clientes: ${errD.message}`);

    // 4. Limpa mm_id nas entrevistas afetadas
    const { data: entrevistas } = await supabase.from("entrevistas").select("id, dados_json");

    for (const e of entrevistas ?? []) {
      const dados = (e.dados_json ?? {}) as Record<string, string>;
      const mmId = String(dados.mm_id ?? "").toUpperCase();
      if (targetIds.has(mmId)) {
        const { mm_id: _removed, ...rest } = dados;
        void _removed;
        await supabase.from("entrevistas").update({ dados_json: rest }).eq("id", e.id);
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: Array.from(targetIds).sort(),
      sheetsRequests: sheetRequests.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-pipeline DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
