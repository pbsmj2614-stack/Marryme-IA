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

/**
 * Parseia um array 2D de valores (resposta da Sheets API) para TarefaSheet[].
 * Detecta automaticamente a linha de cabeçalho e o offset de colunas.
 * Quando não há cabeçalho, detecta a coluna de status pelos valores conhecidos.
 */
function parseTarefasValues(values: string[][]): TarefaSheet[] {
  if (values.length === 0) return [];

  const TASK_HEADER_KEYS = [
    "o_que",
    "etapa",
    "prazo",
    "status",
    "tarefa",
    "descricao",
    "atividade", // variantes do campo "o que fazer"
  ];
  let headerRowIdx = -1;
  let hMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(values.length, 6); i++) {
    const candidate = buildHeaderMap(values[i]);
    if (TASK_HEADER_KEYS.some((k) => candidate[k] !== undefined)) {
      headerRowIdx = i;
      hMap = candidate;
      break;
    }
  }

  // Sem cabeçalho detectado: inclui desde a linha 0 (não descarta a primeira tarefa).
  const dataRows = headerRowIdx >= 0 ? values.slice(headerRowIdx + 1) : values;

  function tcol(r: string[], pos: number, ...names: string[]): string {
    for (const name of names) {
      const idx = hMap[name];
      if (idx !== undefined) return r[idx]?.trim() ?? "";
    }
    return r[pos]?.trim() ?? "";
  }

  function getCheck(r: string[]): boolean {
    for (const name of ["check_feito", "check", "feito", "concluido"]) {
      const idx = hMap[name];
      if (idx !== undefined) return parseCheckbox(r[idx] ?? "");
    }
    // Sem cabeçalho: coluna A (index 0) é sempre o checkbox
    return parseCheckbox(r[0] ?? "");
  }

  // Determina qual coluna contém o status:
  // 1. Pelo cabeçalho (hMap)
  // 2. Escaneando as primeiras linhas de dados por valores conhecidos de status
  // 3. Fallback posicional (col G = índice 6)
  // Sem âncora ^ para aceitar emojis prefix: "🚀 Em andamento", "✅ Finalizado", etc.
  const STATUS_RE = /(finaliz|atrasad|em andamento|n[aã]o.inici|cancelad)/i;

  function detectStatusCol(): number {
    const fromMap = hMap["status"] ?? hMap["situacao"] ?? hMap["estado"];
    if (fromMap !== undefined) return fromMap;
    // Escaneia colunas 5–8 nos primeiros 20 registros
    for (const col of [6, 7, 5, 8]) {
      if (dataRows.slice(0, 20).some((r) => STATUS_RE.test(r[col]?.trim() ?? ""))) {
        return col;
      }
    }
    return 6; // fallback posicional
  }

  const statusColIdx = detectStatusCol();

  return dataRows
    .map((r) => {
      const oQueFromMap = tcol(r, 2, "o_que", "tarefa", "descricao", "atividade");
      const oQue = oQueFromMap || r[2]?.trim() || "";
      return {
        check_feito: getCheck(r),
        etapa: tcol(r, 1, "etapa") || r[1]?.trim() || "",
        o_que: oQue,
        tipo: tcol(r, 3, "tipo") || r[3]?.trim() || "",
        quem: tcol(r, 4, "quem", "responsavel", "responsavel_tarefa") || r[4]?.trim() || "",
        prazo: tcol(r, 5, "prazo", "data_prazo", "data_entrega", "prazo_entrega") || r[5]?.trim() || "",
        status: r[statusColIdx]?.trim() || "Não iniciado",
        observacoes: tcol(r, 7, "observacoes", "observacao", "obs") || r[7]?.trim() || "",
      };
    })
    .filter((t) => t.o_que !== "");
}

/**
 * Lê a aba de um único cliente (fallback — prefira fetchTodasTarefasBatch).
 * Retorna [] se a aba não existir (HTTP 400).
 */
export async function fetchTarefasCliente(nomeAba: string): Promise<TarefaSheet[]> {
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(nomeAba)}?key=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`Sheets API error (${nomeAba}) ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseTarefasValues(data.values ?? []);
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
    const rangesParam = lote.map((a) => `ranges=${encodeURIComponent(a)}`).join("&");
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
      result[lote[j]] = parseTarefasValues(valueRanges[j]?.values ?? []);
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
