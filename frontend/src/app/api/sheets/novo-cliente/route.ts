/**
 * POST /api/sheets/novo-cliente
 *
 * Cadastra um novo cliente:
 *  1. Determina o próximo ID sequencial (MM001, MM002…) ou reutiliza ID incompleto
 *  2. Duplica a aba "PlanilhaModelo" no Sheets
 *  3. Renomeia para "MMXXX_NomeLimpo"
 *  4. Substitui "contratante" no título da aba pelo nome do cliente
 *  5. Preenche prazo = hoje + 7 dias em linhas com tarefa mas sem prazo
 *  6. Adiciona linha ao Cadastro_Clientes
 *  7. Insere o cliente no Supabase (mm_clientes)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { novoClienteSchema } from "@/lib/schemas";
import {
  appendCadastroRow,
  buildCadastroRow,
  colLetter,
  dateBR,
  detectCadastroLayout,
  findCadastroRowIndex,
  nextMmId,
  normalizeMmId,
  slugifyAba,
} from "@/lib/sheets-cadastro";

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
  if (!raw)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado nas variáveis de ambiente.");
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

async function sheetsGetValues(token: string, path: string): Promise<{ values?: string[][] }> {
  return (await sGet(token, path)) as { values?: string[][] };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const parsed = novoClienteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
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
    } = parsed.data;

    const supabaseUrlCheck = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKeyCheck = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    let idClienteExistente: string | null = null;

    if (supabaseUrlCheck && supabaseKeyCheck) {
      const sbCheck = createClient(supabaseUrlCheck, supabaseKeyCheck);
      const nomeNorm = nome_empresa.trim();
      const { data: existente } = await sbCheck
        .from("mm_clientes")
        .select("id_cliente, nome_empresa, sheets_aba")
        .ilike("nome_empresa", nomeNorm)
        .limit(1)
        .maybeSingle();

      if (existente) {
        if (existente.sheets_aba) {
          return NextResponse.json(
            {
              error: `Cliente "${existente.nome_empresa}" (${existente.id_cliente}) já está cadastrado. Use a sincronização para atualizar ou edite diretamente no app.`,
              duplicado: true,
              id_existente: existente.id_cliente,
            },
            { status: 409 }
          );
        }
        idClienteExistente = normalizeMmId(existente.id_cliente) ?? existente.id_cliente;
      }
    }

    const token = await googleToken();

    type SheetMeta = { properties: { sheetId: number; title: string; index: number } };
    const meta = (await sGet(token, "?fields=sheets.properties")) as { sheets: SheetMeta[] };
    const abas = meta.sheets ?? [];

    const modeloSheet = abas.find((s) =>
      /planilha.?modelo|^modelo$/i.test(s.properties.title.trim())
    );
    if (!modeloSheet) {
      return NextResponse.json(
        { error: 'Aba "PlanilhaModelo" não encontrada. Crie uma aba com esse nome como template.' },
        { status: 404 }
      );
    }

    const cadastroSheet = abas.find((s) =>
      /cadastro.?clientes|^clientes$|^cadastro$/i.test(s.properties.title.trim())
    );
    if (!cadastroSheet) {
      return NextResponse.json(
        { error: 'Aba "Cadastro_Clientes" não encontrada.' },
        { status: 404 }
      );
    }

    const cadastroData = (await sGet(
      token,
      `/values/${encodeURIComponent(cadastroSheet.properties.title)}`
    )) as { values?: string[][] };
    const cadastroRows: string[][] = cadastroData.values ?? [];

    const supabaseUrl2 = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey2 = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    let supabaseIds: string[] = [];
    if (supabaseUrl2 && supabaseKey2) {
      const sbId = createClient(supabaseUrl2, supabaseKey2);
      const { data: idsData } = await sbId.from("mm_clientes").select("id_cliente");
      supabaseIds = (idsData ?? []).map((r: { id_cliente: string }) => r.id_cliente);
    }

    const newId =
      idClienteExistente ??
      nextMmId({
        cadastroFlat: cadastroRows.flat(),
        supabaseIds,
        tabTitles: abas.map((s) => s.properties.title),
      });

    const nomeTrimmed = nome_empresa.trim();
    const novaAba = `${newId}_${slugifyAba(nomeTrimmed)}`;

    const maxTabIndex = abas.reduce((m, s) => Math.max(m, s.properties.index), 0);
    await sPost(token, ":batchUpdate", {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: modeloSheet.properties.sheetId,
            insertSheetIndex: maxTabIndex + 1,
            newSheetName: novaAba,
          },
        },
      ],
    });

    const novaData = (await sGet(token, `/values/${encodeURIComponent(novaAba)}`)) as {
      values?: string[][];
    };
    const novaRows: string[][] = novaData.values ?? [];

    const tituloUpdates: Array<{ range: string; values: string[][] }> = [];
    for (let r = 0; r < Math.min(novaRows.length, 3); r++) {
      for (let c = 0; c < novaRows[r].length; c++) {
        const cell = novaRows[r][c] ?? "";
        if (/contratante/i.test(cell)) {
          tituloUpdates.push({
            range: `${novaAba}!${colLetter(c)}${r + 1}`,
            values: [[cell.replace(/contratante/gi, nomeTrimmed)]],
          });
        }
      }
    }
    if (tituloUpdates.length > 0) await sBatchUpdate(token, tituloUpdates);

    const hoje = new Date();
    const d7 = new Date(hoje);
    d7.setDate(d7.getDate() + 7);
    const prazoD7 = dateBR(d7);

    let hRowIdx = -1,
      prazoCol = -1,
      oQueCol = -1;
    for (let i = 0; i < Math.min(novaRows.length, 6); i++) {
      const row = novaRows[i];
      const pIdx = row.findIndex((h) => /prazo|data/i.test(h ?? ""));
      const oIdx = row.findIndex((h) => /o[\s._]?que|tarefa|atividade|descri/i.test(h ?? ""));
      if (pIdx >= 0 && oIdx >= 0) {
        hRowIdx = i;
        prazoCol = pIdx;
        oQueCol = oIdx;
        break;
      }
    }

    const prazoUpdates: Array<{ range: string; values: string[][] }> = [];
    if (hRowIdx >= 0) {
      for (let i = hRowIdx + 1; i < novaRows.length; i++) {
        const row = novaRows[i];
        const oQueVal = (row[oQueCol] ?? "").trim();
        const prazoVal = (row[prazoCol] ?? "").trim();
        if (oQueVal && !prazoVal) {
          prazoUpdates.push({
            range: `${novaAba}!${colLetter(prazoCol)}${i + 1}`,
            values: [[prazoD7]],
          });
        }
      }
    }
    if (prazoUpdates.length > 0) await sBatchUpdate(token, prazoUpdates);

    const hojeStr = dateBR(hoje);
    const novaLinha = buildCadastroRow({
      id_cliente: newId,
      nome_empresa: nomeTrimmed,
      segmento,
      cidade,
      whatsapp,
      email,
      inicio_contrato: hojeStr,
      plano,
      fase_projeto,
      responsavel_mm,
      observacoes,
    });

    const cadRowsData = await sheetsGetValues(
      token,
      `/values/${encodeURIComponent(cadastroSheet.properties.title + "!A1:P500")}`
    );
    const cadRows: string[][] = cadRowsData.values ?? [];
    const existingRowIdx = findCadastroRowIndex(cadRows, newId);

    if (existingRowIdx >= 0) {
      const layout = detectCadastroLayout(cadRows);
      const tabQuoted = `'${cadastroSheet.properties.title.replace(/'/g, "''")}'`;
      await sBatchUpdate(token, [
        {
          range: `${tabQuoted}!${layout.startCol}${existingRowIdx + 1}`,
          values: [novaLinha],
        },
      ]);
    } else {
      await appendCadastroRow({
        token,
        sheetId: SHEET_ID,
        cadastroTabTitle: cadastroSheet.properties.title,
        row: novaLinha,
        sheetsBatchUpdate: sBatchUpdate,
        sheetsGet: sheetsGetValues,
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey) throw new Error("Variáveis Supabase não configuradas.");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const clientePayload = {
      nome_empresa: nomeTrimmed,
      segmento: segmento?.trim() || null,
      cidade: cidade?.trim() || null,
      whatsapp: String(whatsapp ?? "").replace(/\D/g, "") || null,
      email: email?.trim() || null,
      plano: plano?.trim() || null,
      status: "Ativo",
      fase_projeto: fase_projeto?.trim() || "Onboarding",
      responsavel_mm: responsavel_mm?.trim() || null,
      observacoes: observacoes?.trim() || null,
      inicio_contrato: hojeStr.split("/").reverse().join("-"),
      sheets_aba: novaAba,
      atualizado_em: new Date().toISOString(),
    };

    let dbErr;
    if (idClienteExistente) {
      ({ error: dbErr } = await supabase
        .from("mm_clientes")
        .update(clientePayload)
        .eq("id_cliente", newId));
    } else {
      ({ error: dbErr } = await supabase.from("mm_clientes").insert({
        id_cliente: newId,
        valor_contrato: 0,
        ...clientePayload,
      }));
    }
    if (dbErr)
      throw new Error(
        `Aba e cadastro criados na planilha (${newId} / "${novaAba}"), mas falha ao registrar na pipeline do app: ${dbErr.message}`
      );

    return NextResponse.json({
      ok: true,
      id: newId,
      aba: novaAba,
      tarefas: prazoUpdates.length,
      message: `${nomeTrimmed} cadastrado como ${newId} · aba "${novaAba}" criada com ${prazoUpdates.length} tarefa(s) com prazo em ${prazoD7}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[novo-cliente]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
