/**
 * sheets.ts — Google Sheets API v4 (REST + API Key)
 */

import { normalizeMmId } from "@/lib/sheets-cadastro";
import { getGoogleSheetsAccessTokenOptional } from "@/lib/sheets-google-auth";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ?? "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";

function apiKey(): string {
  const key = process.env.NEXT_PUBLIC_SHEETS_API_KEY;
  if (!key || key === "sua_chave_aqui") {
    throw new Error("NEXT_PUBLIC_SHEETS_API_KEY não configurada. Veja README para obter a chave.");
  }
  return key;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClienteSheet {
  id_cliente: string; // col B
  nome_empresa: string; // col C
  segmento: string; // col D
  cidade: string; // col E
  whatsapp: string; // col F
  email: string; // col G
  inicio_contrato: string; // col H  (DD/MM/YYYY)
  plano: string; // col I
  // col J: Valor — não importado
  fase_projeto: string; // col K
  status: string; // col L
  // col M: Último Check-in — não importado
  // col N: URL Planilha de Controle — não importado
  responsavel_mm: string; // col O
  observacoes: string; // col P
}

export interface TarefaSheet {
  check_feito: boolean; // col A
  etapa: string; // col B
  o_que: string; // col C
  tipo: string; // col D  (Marry Me | Cliente)
  quem: string; // col E
  prazo: string; // col F  (DD/MM/YYYY)
  status: string; // col G  (Finalizado | Atrasado | Em andamento | Não iniciado)
  observacoes: string; // col H
}

export interface TarefaComCliente extends TarefaSheet {
  id_cliente: string;
  aba: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCheckbox(value: string): boolean {
  const v = (value ?? "").toLowerCase().trim();
  // Google Sheets retorna "TRUE"/"FALSE" em EN e "VERDADEIRO"/"FALSO" em PT-BR
  return (
    v === "true" ||
    v === "verdadeiro" ||
    v === "sim" ||
    v === "1" ||
    v === "x" ||
    v === "✓" ||
    v === "checked"
  );
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function sheetsApiGet(suffix: string, retries = 5): Promise<Response> {
  const token = await getGoogleSheetsAccessTokenOptional();
  for (let attempt = 0; attempt < retries; attempt++) {
    const base = `${SHEETS_BASE}/${SHEET_ID}${suffix}`;
    const url = token
      ? base
      : `${base}${suffix.includes("?") ? "&" : "?"}key=${apiKey()}`;
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(url, { cache: "no-store", headers });
    if (res.status === 429 && attempt < retries - 1) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    return res;
  }
  throw new Error("Sheets API: falha após retries");
}

/**
 * Retorna nomes de todas as abas da planilha.
 */
export async function fetchTodasAbas(): Promise<string[]> {
  const res = await sheetsApiGet("?fields=sheets.properties.title");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
}

/**
 * Resolve o nome real da aba de cadastro — tolerante a variações como
 * "Cadastro_Clientes", "Cadastro Clientes", "cadastro_clientes", etc.
 */
export async function resolverAbaCadastro(): Promise<string> {
  const abas = await fetchTodasAbas();
  const candidatos = ["cadastro_clientes", "cadastro clientes", "clientes", "cadastro"];
  const encontrada = abas.find((a) => candidatos.includes(a.toLowerCase().trim()));
  if (!encontrada) {
    throw new Error(
      `Aba de cadastro não encontrada. Abas disponíveis: ${abas.join(", ")}. ` +
        `Renomeie a aba de clientes para "Cadastro_Clientes".`
    );
  }
  return encontrada;
}

// ─── Header-based column mapping ─────────────────────────────────────────────

/**
 * Normaliza nome de cabeçalho para uma chave comparável.
 * "Nome / Empresa" → "nome_empresa", "Início Contrato" → "inicio_contrato"
 */
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_") // não-alfanum → _
    .replace(/^_+|_+$/g, ""); // remove _ das bordas
}

/**
 * Dado um array de cabeçalhos, retorna um map nome→índice.
 */
function buildHeaderMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    if (h?.trim()) map[normalizeKey(h.trim())] = i;
  });
  return map;
}

/**
 * Lê a aba de cadastro de clientes e retorna todos os registros.
 * Tolera variações no nome da aba, colunas extras e ordens diferentes.
 * Usa mapeamento por nome de cabeçalho quando disponível.
 */
export async function fetchCadastroClientes(): Promise<ClienteSheet[]> {
  const nomeAba = await resolverAbaCadastro();
  const res = await sheetsApiGet(`/values/${encodeURIComponent(nomeAba)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${nomeAba}) ${res.status}: ${body}`);
  }
  const data = await res.json();
  const values: string[][] = data.values ?? [];

  if (values.length === 0) {
    throw new Error(`A aba "${nomeAba}" está completamente vazia.`);
  }

  // 1. Localiza a primeira linha de dados reais (padrão MM\d+)
  let dataStartRow = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i].some((c) => /^MM\d+/i.test(c?.trim() ?? ""))) {
      dataStartRow = i;
      break;
    }
  }

  if (dataStartRow === -1) {
    throw new Error(`Nenhuma linha com ID no padrão "MM001" encontrada na aba "${nomeAba}".`);
  }

  // 2. Usa a linha imediatamente anterior como cabeçalho
  const headerRow = dataStartRow > 0 ? (values[dataStartRow - 1] ?? []) : [];
  const hMap = buildHeaderMap(headerRow);

  // 3. Helper: lê uma célula pelo nome do cabeçalho (vários sinônimos),
  //    com fallback para posição fixa se o cabeçalho não for encontrado.
  function col(r: string[], fallbackIdx: number, ...names: string[]): string {
    for (const name of names) {
      const idx = hMap[name];
      if (idx !== undefined) return r[idx]?.trim() ?? "";
    }
    // Detecta o colOffset a partir do ID (pode estar na col 0 ou 1)
    const idCol = r.findIndex((c) => /^MM\d+/i.test(c?.trim() ?? ""));
    const co = idCol >= 0 ? idCol : 0;
    return r[fallbackIdx + co]?.trim() ?? "";
  }

  const rows = values
    .slice(dataStartRow)
    .map((r) => {
      const rawId = col(r, 0, "id_cliente", "id", "codigo", "codigo_cliente");
      return {
        id_cliente: normalizeMmId(rawId) ?? rawId,
        nome_empresa: col(r, 1, "nome_empresa", "nome", "empresa"),
        segmento: col(r, 2, "segmento"),
        cidade: col(r, 3, "cidade"),
        whatsapp: col(r, 4, "whatsapp", "telefone", "celular"),
        email: col(r, 5, "email", "e_mail"),
        inicio_contrato: col(r, 6, "inicio_contrato", "inicio", "data_inicio"),
        plano: col(r, 7, "plano"),
        fase_projeto: col(r, 9, "fase_projeto", "fase", "fase_do_projeto"),
        status: col(r, 10, "status"),
        responsavel_mm: col(r, 13, "responsavel_mm", "responsavel"),
        observacoes: col(r, 14, "observacoes", "observacao", "obs"),
      };
    })
    .filter((c) => /^MM\d+/i.test(c.id_cliente));

  if (rows.length === 0) {
    throw new Error(`Nenhum cliente com ID válido encontrado na aba "${nomeAba}".`);
  }

  return rows;
}

// ─── Task parsing (shared) ────────────────────────────────────────────────────

const TASK_HEADER_KEYS = [
  "check",
  "check_feito",
  "o_que",
  "etapa",
  "prazo",
  "status",
  "tarefa",
  "descricao",
  "atividade",
];

const HEADER_LABEL_KEYS = new Set([
  "check",
  "check_feito",
  "feito",
  "concluido",
  "etapa",
  "o_que",
  "tipo",
  "quem",
  "responsavel",
  "prazo",
  "status",
  "situacao",
  "observacoes",
  "observacao",
  "obs",
  "tarefa",
  "descricao",
  "atividade",
]);

/** Valores típicos da coluna Tipo — nunca são "O que?" real. */
const TIPO_COLUMN_VALUES = new Set(["marry me", "cliente", "marryme"]);

const HEADER_SCAN_ROWS = 30;

export interface TaskColumnLayout {
  headerRowIdx: number;
  hMap: Record<string, number>;
  dataStartRow: number;
  checkCol: number | null;
  hasCheckHeader: boolean;
  oQueCol: number;
  etapaCol: number;
  tipoCol: number;
  quemCol: number;
  prazoCol: number;
  statusCol: number;
  obsCol: number;
}

function colIndex(hMap: Record<string, number>, names: string[], fallback: number): number {
  for (const name of names) {
    const idx = hMap[name];
    if (idx !== undefined) return idx;
  }
  return fallback;
}

function cleanCell(value: string | undefined | null): string {
  return (value ?? "").replace(/\u00a0/g, " ").trim();
}

function readCell(row: string[], col: number): string {
  return cleanCell(row[col]);
}

export function normalizeTaskText(value: string | null | undefined): string {
  return cleanCell(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeTaskDateToISO(value: string | null | undefined): string | null {
  const s = cleanCell(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!br) return null;

  const day = br[1].padStart(2, "0");
  const month = br[2].padStart(2, "0");
  const year =
    br[3].length === 2 ? (parseInt(br[3], 10) < 50 ? `20${br[3]}` : `19${br[3]}`) : br[3];
  return `${year}-${month}-${day}`;
}

/** Iguala largura das linhas — a API omite células vazias no fim e às vezes no início. */
function normalizeSheetGrid(values: string[][]): string[][] {
  if (values.length === 0) return values;
  const maxLen = Math.max(...values.map((r) => r.length), 0);
  return values.map((row) => {
    if (row.length >= maxLen) return row.map((c) => (c ?? "").replace(/\u00a0/g, " "));
    return [
      ...row.map((c) => (c ?? "").replace(/\u00a0/g, " ")),
      ...Array(maxLen - row.length).fill(""),
    ];
  });
}

/** Mapa de cabeçalho de tarefas com sinônimos tolerantes (O que?, O Que, etc.). */
function buildTaskHeaderMap(headerRow: string[]): Record<string, number> {
  const map = buildHeaderMap(headerRow);
  headerRow.forEach((raw, i) => {
    const k = normalizeKey(cleanCell(raw));
    if (!k) return;
    if (k === "o_que" || k === "oque" || k.startsWith("o_que") || k === "tarefa_a_realizar") {
      map.o_que ??= i;
    }
    if (k === "tarefa" || k === "atividade" || k === "descricao" || k === "acao") {
      map.o_que ??= i;
    }
    if (k === "check" || k === "check_feito" || k === "feito" || k.startsWith("check")) {
      map.check ??= i;
      map.check_feito ??= i;
    }
    if (k === "etapa" || k.startsWith("etapa")) map.etapa ??= i;
    if (k === "quem" || k === "responsavel" || k.startsWith("responsavel")) map.quem ??= i;
    if (k === "prazo" || k.includes("prazo") || k.includes("entrega")) map.prazo ??= i;
    if (k === "status" || k === "situacao" || k === "estado") map.status ??= i;
    if (k === "tipo") map.tipo ??= i;
    if (k.startsWith("obs")) map.observacoes ??= i;
  });
  return map;
}

function findTaskHeaderRow(values: string[][]): { headerRowIdx: number; hMap: Record<string, number> } {
  for (let i = 0; i < Math.min(values.length, HEADER_SCAN_ROWS); i++) {
    const hMap = buildTaskHeaderMap(values[i] ?? []);
    if (TASK_HEADER_KEYS.some((k) => hMap[k] !== undefined)) {
      return { headerRowIdx: i, hMap };
    }
    if (hMap.o_que !== undefined) {
      return { headerRowIdx: i, hMap };
    }
  }
  return { headerRowIdx: -1, hMap: {} };
}

/** Detecta layout de colunas de tarefas (suporta offset B:I ou A:H). */
export function detectTaskColumnLayout(values: string[][]): TaskColumnLayout {
  const { headerRowIdx, hMap } = findTaskHeaderRow(values);

  const dataStartRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const checkColFromMap = colIndex(hMap, ["check_feito", "check", "feito", "concluido"], -1);
  const hasCheckHeader = checkColFromMap >= 0;

  const oQueCol = colIndex(
    hMap,
    ["o_que", "tarefa", "descricao", "atividade"],
    hasCheckHeader ? checkColFromMap + 2 : 2
  );
  const etapaCol = colIndex(hMap, ["etapa"], hasCheckHeader ? checkColFromMap + 1 : 1);
  const tipoCol = colIndex(hMap, ["tipo"], oQueCol + 1);
  const quemCol = colIndex(hMap, ["quem", "responsavel", "responsavel_tarefa"], tipoCol + 1);
  const prazoCol = colIndex(
    hMap,
    ["prazo", "data_prazo", "data_entrega", "prazo_entrega"],
    quemCol + 1
  );

  const STATUS_RE = /(finaliz|atrasad|em andamento|n[aã]o.inici|cancelad)/i;
  let statusCol = colIndex(hMap, ["status", "situacao", "estado"], -1);
  if (statusCol < 0) {
    const dataRows = headerRowIdx >= 0 ? values.slice(dataStartRow) : values;
    for (const col of [prazoCol + 1, prazoCol + 2, prazoCol, prazoCol + 3]) {
      if (dataRows.slice(0, 25).some((r) => STATUS_RE.test(readCell(r, col)))) {
        statusCol = col;
        break;
      }
    }
    if (statusCol < 0) statusCol = hasCheckHeader ? checkColFromMap + 6 : 6;
  }

  const obsCol = colIndex(hMap, ["observacoes", "observacao", "obs"], statusCol + 1);

  return {
    headerRowIdx,
    hMap,
    dataStartRow,
    checkCol: hasCheckHeader ? checkColFromMap : null,
    hasCheckHeader,
    oQueCol,
    etapaCol,
    tipoCol,
    quemCol,
    prazoCol,
    statusCol,
    obsCol,
  };
}

function isValidTaskRow(oQue: string): boolean {
  const trimmed = cleanCell(oQue);
  if (!trimmed || trimmed.length < 2) return false;
  const lower = trimmed.toLowerCase();
  if (TIPO_COLUMN_VALUES.has(lower)) return false;
  const key = normalizeKey(trimmed);
  if (HEADER_LABEL_KEYS.has(key)) return false;
  return true;
}

interface FixedLayoutCols {
  dataStartRow: number;
  checkCol: number | null;
  etapaCol: number;
  oQueCol: number;
  tipoCol: number;
  quemCol: number;
  prazoCol: number;
  statusCol: number;
  obsCol: number;
}

function parseWithLayout(values: string[][], layout: FixedLayoutCols): TarefaSheet[] {
  const dataRows = values.slice(layout.dataStartRow);

  function getCheck(r: string[]): boolean {
    if (layout.checkCol !== null) {
      return parseCheckbox(readCell(r, layout.checkCol));
    }
    return parseCheckbox(readCell(r, 0));
  }

  return dataRows
    .map((r) => {
      const oQue = readCell(r, layout.oQueCol);
      return {
        check_feito: getCheck(r),
        etapa: readCell(r, layout.etapaCol),
        o_que: oQue,
        tipo: readCell(r, layout.tipoCol),
        quem: readCell(r, layout.quemCol),
        prazo: readCell(r, layout.prazoCol),
        status: readCell(r, layout.statusCol) || "Não iniciado",
        observacoes: readCell(r, layout.obsCol),
      };
    })
    .filter((t) => isValidTaskRow(t.o_que));
}

function inferOQueColumnFromData(values: string[][], startRow: number): number | null {
  const rows = values.slice(startRow).filter((r) => r.some((c) => cleanCell(c)));
  if (rows.length < 2) return null;

  const maxCols = Math.max(...rows.map((r) => r.length), 0);
  let bestCol = -1;
  let bestScore = 0;

  for (let col = 0; col < maxCols; col++) {
    const cells = rows.map((r) => readCell(r, col)).filter((c) => c.length >= 4);
    if (cells.length < 2) continue;

    const checkLike = cells.filter((c) => parseCheckbox(c)).length;
    const dateLike = cells.filter((c) => /\d{1,2}[\/\-.]\d{1,2}/.test(c)).length;
    if (checkLike > cells.length * 0.4) continue;
    if (dateLike > cells.length * 0.4) continue;

    const avgLen = cells.reduce((s, c) => s + c.length, 0) / cells.length;
    const score = cells.length * avgLen;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestCol >= 0 ? bestCol : null;
}

function parseWithInferredLayout(values: string[][]): TarefaSheet[] {
  const { headerRowIdx } = findTaskHeaderRow(values);
  const start = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const oQueCol = inferOQueColumnFromData(values, start);
  if (oQueCol === null) return [];

  const hMap = headerRowIdx >= 0 ? buildTaskHeaderMap(values[headerRowIdx] ?? []) : {};
  const checkCol =
    hMap.check ?? hMap.check_feito ?? (oQueCol >= 2 ? oQueCol - 2 : oQueCol > 0 ? 0 : null);

  return parseWithLayout(values, {
    dataStartRow: start,
    checkCol: checkCol ?? null,
    etapaCol: Math.max(0, oQueCol - 1),
    oQueCol,
    tipoCol: oQueCol + 1,
    quemCol: oQueCol + 2,
    prazoCol: oQueCol + 3,
    statusCol: oQueCol + 4,
    obsCol: oQueCol + 5,
  });
}

function layoutFromHeaderMap(
  headerRowIdx: number,
  hMap: Record<string, number>
): FixedLayoutCols {
  const oQue = hMap.o_que!;
  return {
    dataStartRow: headerRowIdx + 1,
    checkCol: hMap.check ?? hMap.check_feito ?? null,
    etapaCol: hMap.etapa ?? Math.max(0, oQue - 1),
    oQueCol: oQue,
    tipoCol: hMap.tipo ?? oQue + 1,
    quemCol: hMap.quem ?? oQue + 2,
    prazoCol: hMap.prazo ?? oQue + 3,
    statusCol: hMap.status ?? oQue + 4,
    obsCol: hMap.observacoes ?? oQue + 5,
  };
}

/** Pontua qualidade do parse (maior = melhor). */
export function scoreTarefasParse(tasks: TarefaSheet[]): number {
  if (tasks.length === 0) return 0;
  if (parseLooksSuspicious(tasks)) return Math.max(1, tasks.length);
  let score = tasks.length * 1000;
  for (const t of tasks) {
    const o = t.o_que.toLowerCase();
    if (TIPO_COLUMN_VALUES.has(o)) score -= 500;
    if (HEADER_LABEL_KEYS.has(normalizeKey(t.o_que))) score -= 500;
    if (o.length >= 8) score += 5;
  }
  return score;
}

function layoutFromDetected(values: string[][]): FixedLayoutCols {
  const det = detectTaskColumnLayout(values);
  return {
    dataStartRow: det.dataStartRow,
    checkCol: det.hasCheckHeader ? det.checkCol : null,
    etapaCol: det.etapaCol,
    oQueCol: det.oQueCol,
    tipoCol: det.tipoCol,
    quemCol: det.quemCol,
    prazoCol: det.prazoCol,
    statusCol: det.statusCol,
    obsCol: det.obsCol,
  };
}

function fixedLayoutCandidates(values: string[][]): FixedLayoutCols[] {
  const { headerRowIdx } = findTaskHeaderRow(values);
  const start = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  return [
    // B:I sem col A — Check em B (idx 0)
    {
      dataStartRow: start,
      checkCol: 0,
      etapaCol: 1,
      oQueCol: 2,
      tipoCol: 3,
      quemCol: 4,
      prazoCol: 5,
      statusCol: 6,
      obsCol: 7,
    },
    // B:I com col A vazia no range A:I — Check em B (idx 1)
    {
      dataStartRow: start,
      checkCol: 1,
      etapaCol: 2,
      oQueCol: 3,
      tipoCol: 4,
      quemCol: 5,
      prazoCol: 6,
      statusCol: 7,
      obsCol: 8,
    },
    // Sem checkbox explícito — O que? começa cedo
    {
      dataStartRow: start,
      checkCol: null,
      etapaCol: 0,
      oQueCol: 1,
      tipoCol: 2,
      quemCol: 3,
      prazoCol: 4,
      statusCol: 5,
      obsCol: 6,
    },
  ];
}

function withLeadingPad(values: string[][], pad: number, headerRowIdx: number): string[][] {
  if (pad <= 0) return values;
  return values.map((row, i) => (i <= headerRowIdx ? row : [...Array(pad).fill(""), ...row]));
}

function pickBestParse(candidates: TarefaSheet[][]): TarefaSheet[] {
  return candidates.reduce((best, cur) => {
    return scoreTarefasParse(cur) > scoreTarefasParse(best) ? cur : best;
  }, [] as TarefaSheet[]);
}

function layoutSummary(layout: FixedLayoutCols | TaskColumnLayout): Record<string, number | null> {
  return {
    dataStartRow: layout.dataStartRow,
    checkCol: layout.checkCol,
    etapaCol: layout.etapaCol,
    oQueCol: layout.oQueCol,
    tipoCol: layout.tipoCol,
    quemCol: layout.quemCol,
    prazoCol: layout.prazoCol,
    statusCol: layout.statusCol,
    obsCol: layout.obsCol,
  };
}

/** Parse com coluna O que? lendo Tipo (Marry Me) indica layout errado. */
export function parseLooksSuspicious(tasks: TarefaSheet[]): boolean {
  if (tasks.length === 0) return true;
  const noise = tasks.filter((t) => TIPO_COLUMN_VALUES.has(t.o_que.toLowerCase())).length;
  return noise / tasks.length >= 0.5;
}

export interface TarefasParseCandidateMeta {
  source: string;
  count: number;
  checks: number;
  score: number;
  suspicious: boolean;
  firstTask: string | null;
  layout: Record<string, number | null>;
}

export interface TarefasParseMeta {
  tasks: TarefaSheet[];
  headerRowIdx: number;
  bestSource: string | null;
  score: number;
  suspicious: boolean;
  discarded: boolean;
  discardReason: string | null;
  candidates: TarefasParseCandidateMeta[];
}

/**
 * A API do Sheets omite células vazias à esquerda em algumas linhas (col A vazia).
 * Se o cabeçalho tem col A vazia e "Check" em B, linhas de dados podem vir sem o
 * padding inicial — deslocando O que? e zerando o parse.
 */
export function alignTaskSheetRows(values: string[][]): string[][] {
  if (values.length === 0) return values;

  const normalized = normalizeSheetGrid(values);
  const { headerRowIdx, hMap } = findTaskHeaderRow(normalized);
  if (headerRowIdx < 0) return normalized;

  const header = normalized[headerRowIdx];
  const checkCol = hMap.check ?? hMap.check_feito ?? hMap.feito;
  if (checkCol === undefined || checkCol === 0) return normalized;

  return normalized.map((row, i) => {
    if (i <= headerRowIdx) return row;
    const first = readCell(row, 0);
    if (first === "") return row;

    const firstLower = first.toLowerCase();
    const looksLikeCheckCol =
      parseCheckbox(first) || firstLower === "false" || firstLower === "falso";

    // Check em B (col A vazia omitida): TRUE/FALSE na col 0 → desloca tudo
    if (looksLikeCheckCol) return [...Array(checkCol).fill(""), ...row];

    // Col A + Check vazios omitidos: linha começa na Etapa (Organização, Preparação…)
    const looksLikeEtapa =
      /^(organiza|prepara|planej|execu|lanc|campanha|pos)/i.test(first) ||
      (hMap.etapa !== undefined &&
        normalizeKey(first) === normalizeKey(readCell(header, hMap.etapa)));
    if (looksLikeEtapa && checkCol > 0) {
      return [...Array(checkCol + 1).fill(""), ...row];
    }

    if (row.length + checkCol <= header.length) return [...Array(checkCol).fill(""), ...row];
    return row;
  });
}

/** A1 notation com escape correto do nome da aba (espaços, acentos, etc.). */
export function formatSheetRange(sheetName: string, a1Suffix: string): string {
  const safe = sheetName.replace(/'/g, "''");
  if (/^[A-Za-z0-9_]+$/.test(sheetName)) {
    return `${sheetName}!${a1Suffix}`;
  }
  return `'${safe}'!${a1Suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSheetValues(aba: string, rangeSuffix: string): Promise<string[][]> {
  const range = encodeURIComponent(formatSheetRange(aba, rangeSuffix));
  const res = await sheetsApiGet(`/values/${range}`);
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`Sheets API error (${aba}!${rangeSuffix}) ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/** Lê valores da aba e parseia tarefas — compara A:I e B:I e fica com a maior contagem válida. */
export async function fetchAndParseTarefasAba(aba: string): Promise<TarefaSheet[]> {
  let best: TarefaSheet[] = [];
  for (const suffix of ["A:I", "B:I"] as const) {
    try {
      const values = await fetchSheetValues(aba, suffix);
      if (values.length === 0) continue;
      const parsed = parseTarefasValues(values);
      if (scoreTarefasParse(parsed) > scoreTarefasParse(best)) best = parsed;
    } catch {
      // tenta próximo range
    }
  }
  return best;
}

/** fetchAndParseTarefasAba com retry (429 / falha transitória). */
export async function fetchAndParseTarefasAbaWithRetry(
  aba: string,
  maxAttempts = 6
): Promise<TarefaSheet[]> {
  let best: TarefaSheet[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const parsed = await fetchAndParseTarefasAba(aba);
      if (scoreTarefasParse(parsed) > scoreTarefasParse(best)) best = parsed;
      if (best.length > 0 && !parseLooksSuspicious(best)) return best;
    } catch {
      // retry
    }
    if (attempt < maxAttempts - 1) await sleep(500 * (attempt + 1));
  }
  return best;
}

/** Converte índice 0-based para letra de coluna (0=A, 1=B…). */
export function columnIndexToLetter(index: number): string {
  let n = index;
  let result = "";
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/** Monta linha completa para escrita no Sheets respeitando layout detectado. */
export function buildSheetRowFromLayout(
  layout: TaskColumnLayout,
  task: {
    check_feito: boolean;
    etapa: string | null;
    o_que: string;
    tipo: string | null;
    quem: string | null;
    prazo: string;
    status: string;
    observacoes: string | null;
  },
  existing?: string[]
): string[] {
  const cols = [
    layout.checkCol ?? 0,
    layout.etapaCol,
    layout.oQueCol,
    layout.tipoCol,
    layout.quemCol,
    layout.prazoCol,
    layout.statusCol,
    layout.obsCol,
  ];
  const maxCol = Math.max(...cols);
  const row = existing ? [...existing] : Array<string>(maxCol + 1).fill("");
  while (row.length <= maxCol) row.push("");

  if (layout.checkCol !== null) {
    row[layout.checkCol] = task.check_feito ? "TRUE" : "FALSE";
  }
  row[layout.etapaCol] = task.etapa?.trim() ?? row[layout.etapaCol] ?? "";
  row[layout.oQueCol] = task.o_que;
  row[layout.tipoCol] = task.tipo?.trim() || row[layout.tipoCol] || "Marry Me";
  row[layout.quemCol] = task.quem?.trim() ?? row[layout.quemCol] ?? "";
  row[layout.prazoCol] = task.prazo || (row[layout.prazoCol] ?? "");
  row[layout.statusCol] = task.status?.trim() || row[layout.statusCol] || "Não iniciado";
  row[layout.obsCol] = task.observacoes?.trim() ?? row[layout.obsCol] ?? "";
  return row;
}

/** Range de colunas para append (ex: Sheet!B:I). */
export function sheetAppendRange(sheetName: string, layout: TaskColumnLayout): string {
  const cols = [
    layout.checkCol ?? 0,
    layout.etapaCol,
    layout.oQueCol,
    layout.tipoCol,
    layout.quemCol,
    layout.prazoCol,
    layout.statusCol,
    layout.obsCol,
  ];
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return `${sheetName}!${columnIndexToLetter(minCol)}:${columnIndexToLetter(maxCol)}`;
}

/** Valores da linha recortados para o range do layout. */
export function sheetRowValuesForLayout(
  layout: TaskColumnLayout,
  row: string[]
): string[] {
  const cols = [
    layout.checkCol ?? 0,
    layout.etapaCol,
    layout.oQueCol,
    layout.tipoCol,
    layout.quemCol,
    layout.prazoCol,
    layout.statusCol,
    layout.obsCol,
  ];
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return row.slice(minCol, maxCol + 1);
}

/** Range A1 para uma linha inteira cobrindo todas as colunas do layout. */
export function sheetRowUpdateRange(
  sheetName: string,
  rowIndex0: number,
  layout: TaskColumnLayout
): string {
  const cols = [
    layout.checkCol ?? 0,
    layout.etapaCol,
    layout.oQueCol,
    layout.tipoCol,
    layout.quemCol,
    layout.prazoCol,
    layout.statusCol,
    layout.obsCol,
  ];
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const rowNum = rowIndex0 + 1;
  return `${sheetName}!${columnIndexToLetter(minCol)}${rowNum}:${columnIndexToLetter(maxCol)}${rowNum}`;
}

/** Localiza linha de tarefa pelo o_que (busca de baixo para cima). */
export function findTaskRowByOQue(
  rows: string[][],
  layout: TaskColumnLayout,
  oQue: string,
  etapa?: string | null,
  prazoBR?: string | null
): number {
  const oQueNorm = normalizeTaskText(oQue);
  const etapaNorm = etapa ? normalizeTaskText(etapa) : null;
  const prazoNorm = normalizeTaskDateToISO(prazoBR);

  for (let i = rows.length - 1; i >= layout.dataStartRow; i--) {
    const row = rows[i] ?? [];
    if (normalizeTaskText(readCell(row, layout.oQueCol)) !== oQueNorm) continue;
    if (etapaNorm && normalizeTaskText(readCell(row, layout.etapaCol)) !== etapaNorm) continue;
    if (prazoNorm && normalizeTaskDateToISO(readCell(row, layout.prazoCol)) !== prazoNorm) continue;
    return i;
  }

  if (oQueNorm) {
    for (let i = rows.length - 1; i >= layout.dataStartRow; i--) {
      const row = rows[i] ?? [];
      if (normalizeTaskText(readCell(row, layout.oQueCol)) === oQueNorm) return i;
    }
  }
  return -1;
}

export function taskSheetKey(
  oQue: string,
  prazo: string | null | undefined,
  etapa: string | null | undefined
): string {
  return `${normalizeTaskText(oQue)}|${normalizeTaskDateToISO(prazo) ?? ""}|${normalizeTaskText(etapa)}`;
}

export function getDuplicateTaskKeys(tasks: TarefaSheet[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const key = taskSheetKey(t.o_que, t.prazo, t.etapa);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Parseia tarefas da aba — prioriza colunas mapeadas pelo cabeçalho (Check / O que?).
 */
export function parseTarefasValuesWithMeta(values: string[][]): TarefasParseMeta {
  const empty = (discardReason: string | null = null): TarefasParseMeta => ({
    tasks: [],
    headerRowIdx: -1,
    bestSource: null,
    score: 0,
    suspicious: true,
    discarded: !!discardReason,
    discardReason,
    candidates: [],
  });

  if (values.length === 0) return empty("range_vazio");

  const normalized = normalizeSheetGrid(values);
  const aligned = normalizeSheetGrid(alignTaskSheetRows(normalized));
  const { headerRowIdx, hMap } = findTaskHeaderRow(aligned);

  const candidates: Array<{
    source: string;
    tasks: TarefaSheet[];
    layout: FixedLayoutCols | TaskColumnLayout;
  }> = [];

  function pushCandidate(source: string, layout: FixedLayoutCols | TaskColumnLayout, grid = aligned) {
    candidates.push({ source, layout, tasks: parseWithLayout(grid, layout) });
  }

  // Cabeçalho com "O que?" → usa colunas exatas (layout padrão B:I / A:I)
  if (headerRowIdx >= 0 && hMap.o_que !== undefined) {
    const layout = layoutFromHeaderMap(headerRowIdx, hMap);
    pushCandidate("header_map", layout);
    const fromHeader = candidates[candidates.length - 1].tasks;
    if (fromHeader.length > 0 && !parseLooksSuspicious(fromHeader)) {
      return {
        tasks: fromHeader,
        headerRowIdx,
        bestSource: "header_map",
        score: scoreTarefasParse(fromHeader),
        suspicious: false,
        discarded: false,
        discardReason: null,
        candidates: candidates.map((c) => ({
          source: c.source,
          count: c.tasks.length,
          checks: c.tasks.filter((t) => t.check_feito).length,
          score: scoreTarefasParse(c.tasks),
          suspicious: parseLooksSuspicious(c.tasks),
          firstTask: c.tasks[0]?.o_que ?? null,
          layout: layoutSummary(c.layout),
        })),
      };
    }
  }

  pushCandidate("detected", layoutFromDetected(aligned));

  const grids = [aligned];
  if (headerRowIdx >= 0) {
    grids.push(withLeadingPad(aligned, 1, headerRowIdx));
    if (hMap.o_que !== undefined) {
      pushCandidate("header_map_with_pad", layoutFromHeaderMap(headerRowIdx, hMap), grids[1]);
    }
  }

  for (let idx = 0; idx < grids.length; idx++) {
    const grid = grids[idx];
    for (const fixed of fixedLayoutCandidates(grid)) {
      pushCandidate(`fixed_${idx}_${fixed.oQueCol}`, fixed, grid);
    }
    const inferred = parseWithInferredLayout(grid);
    candidates.push({
      source: `inferred_${idx}`,
      tasks: inferred,
      layout: inferred.length > 0 ? layoutFromDetected(grid) : layoutFromDetected(aligned),
    });
  }

  const bestCandidate = candidates.reduce(
    (best, cur) => (scoreTarefasParse(cur.tasks) > scoreTarefasParse(best.tasks) ? cur : best),
    { source: "", tasks: [] as TarefaSheet[], layout: layoutFromDetected(aligned) }
  );
  const best = bestCandidate.tasks;
  const suspicious = parseLooksSuspicious(best);
  const discardReason =
    best.length === 0 ? "sem_tarefas_parseadas" : suspicious && best.length < 3 ? "parse_suspeito" : null;

  return {
    tasks: discardReason ? [] : best,
    headerRowIdx,
    bestSource: bestCandidate.source || null,
    score: scoreTarefasParse(best),
    suspicious,
    discarded: !!discardReason,
    discardReason,
    candidates: candidates.map((c) => ({
      source: c.source,
      count: c.tasks.length,
      checks: c.tasks.filter((t) => t.check_feito).length,
      score: scoreTarefasParse(c.tasks),
      suspicious: parseLooksSuspicious(c.tasks),
      firstTask: c.tasks[0]?.o_que ?? null,
      layout: layoutSummary(c.layout),
    })),
  };
}

export function parseTarefasValues(values: string[][]): TarefaSheet[] {
  return parseTarefasValuesWithMeta(values).tasks;
}

export interface FetchTarefasAbaDiagnostics {
  aba: string;
  bestRange: "A:I" | "B:I" | null;
  tasks: TarefaSheet[];
  score: number;
  suspicious: boolean;
  discarded: boolean;
  discardReason: string | null;
  ranges: Array<TarefasParseMeta & { range: "A:I" | "B:I"; valuesRows: number }>;
}

export async function fetchAndDiagnoseTarefasAba(
  aba: string
): Promise<FetchTarefasAbaDiagnostics> {
  const ranges: Array<TarefasParseMeta & { range: "A:I" | "B:I"; valuesRows: number }> = [];

  for (const suffix of ["A:I", "B:I"] as const) {
    try {
      const values = await fetchSheetValues(aba, suffix);
      const meta = parseTarefasValuesWithMeta(values);
      ranges.push({ ...meta, range: suffix, valuesRows: values.length });
    } catch {
      ranges.push({ ...parseTarefasValuesWithMeta([]), range: suffix, valuesRows: 0 });
    }
  }

  const best = ranges.reduce(
    (acc, cur) => (cur.score > acc.score ? cur : acc),
    ranges[0] ?? { ...parseTarefasValuesWithMeta([]), range: null as "A:I" | "B:I" | null, valuesRows: 0 }
  );

  return {
    aba,
    bestRange: best.range,
    tasks: best.tasks,
    score: best.score,
    suspicious: best.suspicious,
    discarded: best.discarded,
    discardReason: best.discardReason,
    ranges,
  };
}

/**
 * Lê a aba de um único cliente (fallback — prefira fetchTodasTarefasBatch).
 * Retorna [] se a aba não existir (HTTP 400).
 */
export async function fetchTarefasCliente(nomeAba: string): Promise<TarefaSheet[]> {
  return fetchAndParseTarefasAba(nomeAba);
}

/**
 * Busca tarefas de várias abas via batchGet (A:I + B:I por aba).
 * Evita centenas de chamadas individuais que causam 429/timeout no sync.
 */
export async function fetchTodasTarefasBatch(
  abas: string[]
): Promise<Record<string, TarefaSheet[]>> {
  if (abas.length === 0) return {};

  /** 10 abas × 2 ranges = 20 ranges por batchGet (limite da API). */
  const ABAS_PER_BATCH = 10;
  const result: Record<string, TarefaSheet[]> = {};

  for (let i = 0; i < abas.length; i += ABAS_PER_BATCH) {
    const lote = abas.slice(i, i + ABAS_PER_BATCH);
    const rangePaths: string[] = [];
    for (const a of lote) {
      rangePaths.push(formatSheetRange(a, "A:I"));
      rangePaths.push(formatSheetRange(a, "B:I"));
    }
    const rangesParam = rangePaths
      .map((r) => `ranges=${encodeURIComponent(r)}`)
      .join("&");
    const res = await sheetsApiGet(`/values:batchGet?${rangesParam}`);

    if (i + ABAS_PER_BATCH < abas.length) await sleep(450);

    if (!res.ok) {
      for (const aba of lote) {
        try {
          result[aba] = await fetchAndParseTarefasAba(aba);
        } catch {
          result[aba] = [];
        }
      }
      continue;
    }

    const data = await res.json();
    const valueRanges: Array<{ values?: string[][] }> = data.valueRanges ?? [];

    for (let j = 0; j < lote.length; j++) {
      const aiValues = valueRanges[j * 2]?.values ?? [];
      const biValues = valueRanges[j * 2 + 1]?.values ?? [];
      const fromAi = aiValues.length > 0 ? parseTarefasValues(aiValues) : [];
      const fromBi = biValues.length > 0 ? parseTarefasValues(biValues) : [];
      result[lote[j]] = pickBestParse([fromAi, fromBi]);
    }
  }

  return result;
}

/** Re-fetch individual para abas que o batchGet parseou vazio (rate limit throttle). */
export async function refillTarefasLoteVazias(
  lote: Record<string, TarefaSheet[]>,
  abas: string[]
): Promise<void> {
  const vazias = abas.filter((a) => (lote[a]?.length ?? 0) === 0);
  for (let i = 0; i < vazias.length; i++) {
    const aba = vazias[i];
    try {
      const parsed = await fetchAndParseTarefasAba(aba);
      if (parsed.length > 0) lote[aba] = parsed;
    } catch {
      // mantém vazio
    }
    if (i > 0 && i % 3 === 0) await sleep(500);
  }
}

/**
 * Lê todas as abas de uma lista de clientes (wrapper mantido por compatibilidade).
 */
export async function fetchTodasTarefas(
  clientes: Array<{ id_cliente: string; sheets_aba: string | null }>
): Promise<TarefaComCliente[]> {
  const abas = clientes.filter((c) => c.sheets_aba).map((c) => c.sheets_aba as string);
  const lote = await fetchTodasTarefasBatch(abas);
  return clientes.flatMap((c) =>
    c.sheets_aba
      ? (lote[c.sheets_aba] ?? []).map((t) => ({
          ...t,
          id_cliente: c.id_cliente,
          aba: c.sheets_aba!,
        }))
      : []
  );
}
