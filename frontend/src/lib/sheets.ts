/**
 * sheets.ts — Google Sheets API v4 (REST + API Key)
 */

import { normalizeMmId } from "@/lib/sheets-cadastro";

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

/**
 * Retorna nomes de todas as abas da planilha.
 */
export async function fetchTodasAbas(): Promise<string[]> {
  const url = `${SHEETS_BASE}/${SHEET_ID}?key=${apiKey()}&fields=sheets.properties.title`;
  const res = await fetch(url, { cache: "no-store" });
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
  const range = encodeURIComponent(nomeAba);
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${range}?key=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
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

/** Detecta layout de colunas de tarefas (suporta offset B:I ou A:H). */
export function detectTaskColumnLayout(values: string[][]): TaskColumnLayout {
  let headerRowIdx = -1;
  let hMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(values.length, 8); i++) {
    const candidate = buildHeaderMap(values[i]);
    if (TASK_HEADER_KEYS.some((k) => candidate[k] !== undefined)) {
      headerRowIdx = i;
      hMap = candidate;
      break;
    }
  }

  const dataStartRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const checkColFromMap = colIndex(hMap, ["check_feito", "check", "feito", "concluido"], -1);
  const hasCheckHeader = checkColFromMap >= 0;

  const oQueCol = colIndex(hMap, ["o_que", "tarefa", "descricao", "atividade"], hasCheckHeader ? checkColFromMap + 2 : 2);
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
      if (dataRows.slice(0, 20).some((r) => STATUS_RE.test(r[col]?.trim() ?? ""))) {
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
  const trimmed = oQue.trim();
  if (!trimmed) return false;
  const key = normalizeKey(trimmed);
  return !HEADER_LABEL_KEYS.has(key);
}

/**
 * A API do Sheets omite células vazias à esquerda em algumas linhas (col A vazia).
 * Se o cabeçalho tem col A vazia e "Check" em B, linhas de dados podem vir sem o
 * padding inicial — deslocando O que? e zerando o parse.
 */
export function alignTaskSheetRows(values: string[][]): string[][] {
  if (values.length === 0) return values;

  let headerRowIdx = -1;
  let hMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(values.length, 12); i++) {
    const candidate = buildHeaderMap(values[i]);
    if (TASK_HEADER_KEYS.some((k) => candidate[k] !== undefined)) {
      headerRowIdx = i;
      hMap = candidate;
      break;
    }
  }
  if (headerRowIdx < 0) return values;

  const header = values[headerRowIdx];
  const headerHasLeadingEmpty = (header[0]?.trim() ?? "") === "";
  const checkCol = hMap.check ?? hMap.check_feito ?? hMap.feito;
  if (!headerHasLeadingEmpty || checkCol === undefined || checkCol === 0) return values;

  return values.map((row, i) => {
    if (i <= headerRowIdx) return row;
    const first = row[0]?.trim() ?? "";
    if (first === "") return row;
    if (checkCol === 1 && parseCheckbox(first)) return ["", ...row];
    if (row.length + 1 <= header.length) return ["", ...row];
    return row;
  });
}

async function fetchSheetValues(aba: string, rangeSuffix: string): Promise<string[][]> {
  const range = encodeURIComponent(`${aba}!${rangeSuffix}`);
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${range}?key=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`Sheets API error (${aba}!${rangeSuffix}) ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/** Lê valores da aba e parseia tarefas — tenta B:I (layout atual) e fallback A:I. */
export async function fetchAndParseTarefasAba(aba: string): Promise<TarefaSheet[]> {
  const attempts = ["B:I", "A:I"] as const;
  let best: TarefaSheet[] = [];
  for (const suffix of attempts) {
    try {
      const values = await fetchSheetValues(aba, suffix);
      if (values.length === 0) continue;
      const parsed = parseTarefasValues(values);
      if (parsed.length > best.length) best = parsed;
      if (parsed.length > 0 && suffix === "B:I") break;
    } catch {
      // tenta próximo range
    }
  }
  return best;
}

function readCell(row: string[], col: number): string {
  return row[col]?.trim() ?? "";
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
  const oQueNorm = oQue.trim().toLowerCase();
  const etapaNorm = etapa?.trim().toLowerCase() ?? null;

  for (let i = rows.length - 1; i >= layout.dataStartRow; i--) {
    const row = rows[i] ?? [];
    if (readCell(row, layout.oQueCol).toLowerCase() !== oQueNorm) continue;
    if (etapaNorm && readCell(row, layout.etapaCol).toLowerCase() !== etapaNorm) continue;
    if (prazoBR && readCell(row, layout.prazoCol) !== prazoBR) continue;
    return i;
  }

  if (oQueNorm) {
    for (let i = rows.length - 1; i >= layout.dataStartRow; i--) {
      const row = rows[i] ?? [];
      if (readCell(row, layout.oQueCol).toLowerCase() === oQueNorm) return i;
    }
  }
  return -1;
}

/**
 * Parseia um array 2D de valores (resposta da Sheets API) para TarefaSheet[].
 * Detecta automaticamente a linha de cabeçalho e o offset de colunas (A:H ou B:I).
 */
export function parseTarefasValues(values: string[][]): TarefaSheet[] {
  if (values.length === 0) return [];

  const aligned = alignTaskSheetRows(values);
  const layout = detectTaskColumnLayout(aligned);
  const dataRows = aligned.slice(layout.dataStartRow);

  function getCheck(r: string[]): boolean {
    if (layout.hasCheckHeader && layout.checkCol !== null) {
      return parseCheckbox(r[layout.checkCol] ?? "");
    }
    return parseCheckbox(r[0] ?? "");
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

/**
 * Lê a aba de um único cliente (fallback — prefira fetchTodasTarefasBatch).
 * Retorna [] se a aba não existir (HTTP 400).
 */
export async function fetchTarefasCliente(nomeAba: string): Promise<TarefaSheet[]> {
  return fetchAndParseTarefasAba(nomeAba);
}

/**
 * Busca as tarefas de TODAS as abas em UMA única chamada batchGet.
 * Evita o erro 429 (Rate Limit) causado por N chamadas individuais.
 * Processa em lotes de 20 ranges por chamada.
 */
export async function fetchTodasTarefasBatch(
  abas: string[]
): Promise<Record<string, TarefaSheet[]>> {
  if (abas.length === 0) return {};

  const BATCH_SIZE = 20;
  const result: Record<string, TarefaSheet[]> = {};

  for (let i = 0; i < abas.length; i += BATCH_SIZE) {
    const lote = abas.slice(i, i + BATCH_SIZE);
    const rangesParam = lote
      .map((a) => `ranges=${encodeURIComponent(`${a}!B:I`)}`)
      .join("&");
    const url = `${SHEETS_BASE}/${SHEET_ID}/values:batchGet?key=${apiKey()}&${rangesParam}`;

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      // Fallback individual se batchGet falhar (ex: range inválido causa 400 no lote todo)
      for (const aba of lote) {
        try {
          result[aba] = await fetchTarefasCliente(aba);
        } catch {
          result[aba] = [];
        }
      }
      continue;
    }

    const data = await res.json();
    const valueRanges: Array<{ values?: string[][] }> = data.valueRanges ?? [];

    for (let j = 0; j < lote.length; j++) {
      const parsed = parseTarefasValues(valueRanges[j]?.values ?? []);
      result[lote[j]] = parsed;
    }

    // Fallback individual A:I quando B:I no batch retornou 0 tarefas
    for (const aba of lote) {
      if ((result[aba]?.length ?? 0) > 0) continue;
      try {
        const fallback = await fetchAndParseTarefasAba(aba);
        if (fallback.length > 0) result[aba] = fallback;
      } catch {
        result[aba] = result[aba] ?? [];
      }
    }
  }

  return result;
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
