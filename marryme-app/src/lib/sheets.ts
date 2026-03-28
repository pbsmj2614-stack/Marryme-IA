/**
 * sheets.ts — Google Sheets API v4 (REST + API Key)
 *
 * A planilha deve ser pública ("qualquer pessoa com o link pode ver")
 * OU a API Key deve ter permissão de leitura via domínio autorizado.
 */

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_ID =
  process.env.NEXT_PUBLIC_SHEETS_ID ??
  "1o-r_3RvG7FokLgIjJXWbjn5E9EeiyMb4WZQlBKIABDY";

function apiKey(): string {
  const key = process.env.NEXT_PUBLIC_SHEETS_API_KEY;
  if (!key || key === "sua_chave_aqui") {
    throw new Error(
      "NEXT_PUBLIC_SHEETS_API_KEY não configurada. Veja README para obter a chave."
    );
  }
  return key;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClienteSheet {
  id_cliente: string;       // col A
  nome_empresa: string;     // col B
  segmento: string;         // col C
  cidade: string;           // col D
  whatsapp: string;         // col E
  email: string;            // col F
  inicio_contrato: string;  // col G  (DD/MM/YYYY)
  plano: string;            // col H
  fase_projeto: string;     // col I
  status: string;           // col J
  responsavel_mm: string;   // col K
  observacoes: string;      // col L
}

export interface TarefaSheet {
  check_feito: boolean;  // col A
  etapa: string;         // col B
  o_que: string;         // col C
  tipo: string;          // col D  (Marry Me | Cliente)
  quem: string;          // col E
  prazo: string;         // col F  (DD/MM/YYYY)
  status: string;        // col G  (Finalizado | Atrasado | Em andamento | Não iniciado)
  observacoes: string;   // col H
}

export interface TarefaComCliente extends TarefaSheet {
  id_cliente: string;
  aba: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(values: string[][], index: number): string[] {
  return values[index] ?? [];
}

function cell(values: string[][], rowIdx: number, colIdx: number): string {
  return values[rowIdx]?.[colIdx]?.trim() ?? "";
}

function parseCheckbox(value: string): boolean {
  const v = value.toLowerCase().trim();
  return v === "true" || v === "sim" || v === "1" || v === "x" || v === "✓";
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
  return (data.sheets ?? []).map(
    (s: { properties: { title: string } }) => s.properties.title
  );
}

/**
 * Resolve o nome real da aba de cadastro — tolerante a variações como
 * "Cadastro_Clientes", "Cadastro Clientes", "cadastro_clientes", etc.
 */
export async function resolverAbaCadastro(): Promise<string> {
  const abas = await fetchTodasAbas();
  const candidatos = ["cadastro_clientes", "cadastro clientes", "clientes", "cadastro"];
  const encontrada = abas.find((a) =>
    candidatos.includes(a.toLowerCase().trim())
  );
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
    .replace(/[^a-z0-9]+/g, "_")    // não-alfanum → _
    .replace(/^_+|_+$/g, "");       // remove _ das bordas
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
    throw new Error(
      `Nenhuma linha com ID no padrão "MM001" encontrada na aba "${nomeAba}".`
    );
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
    .map((r) => ({
      id_cliente:      col(r, 0, "id_cliente", "id", "codigo", "codigo_cliente"),
      nome_empresa:    col(r, 1, "nome_empresa", "nome", "empresa"),
      segmento:        col(r, 2, "segmento"),
      cidade:          col(r, 3, "cidade"),
      whatsapp:        col(r, 4, "whatsapp", "telefone", "celular"),
      email:           col(r, 5, "email", "e_mail"),
      inicio_contrato: col(r, 6, "inicio_contrato", "inicio", "data_inicio"),
      plano:           col(r, 7, "plano"),
      fase_projeto:    col(r, 8, "fase_projeto", "fase", "fase_do_projeto"),
      status:          col(r, 9, "status"),
      responsavel_mm:  col(r, 10, "responsavel_mm", "responsavel"),
      observacoes:     col(r, 11, "observacoes", "observacao", "obs"),
    }))
    .filter((c) => /^MM\d+/i.test(c.id_cliente));

  if (rows.length === 0) {
    throw new Error(`Nenhum cliente com ID válido encontrado na aba "${nomeAba}".`);
  }

  return rows;
}

/**
 * Lê a aba de um cliente e retorna suas tarefas.
 * Usa mapeamento por cabeçalho; fallback posicional se não encontrar cabeçalhos.
 * Retorna [] se a aba não existir (HTTP 400).
 */
export async function fetchTarefasCliente(nomeAba: string): Promise<TarefaSheet[]> {
  const range = encodeURIComponent(nomeAba);
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${range}?key=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 400) return []; // aba não existe — não é erro
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${nomeAba}) ${res.status}: ${body}`);
  }

  const data = await res.json();
  const values: string[][] = data.values ?? [];

  if (values.length === 0) return [];

  // 1. Localiza a linha de cabeçalho (contém "o_que" ou "etapa" ou "prazo")
  const TASK_HEADER_KEYS = ["o_que", "etapa", "prazo", "status"];
  let headerRowIdx = -1;
  let hMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(values.length, 5); i++) {
    const candidate = buildHeaderMap(values[i]);
    if (TASK_HEADER_KEYS.some((k) => candidate[k] !== undefined)) {
      headerRowIdx = i;
      hMap = candidate;
      break;
    }
  }

  const dataRows = headerRowIdx >= 0
    ? values.slice(headerRowIdx + 1)
    : values.slice(1); // fallback: pula só a primeira linha

  // 2. Helper com fallback posicional (assume col A = check, B = etapa, etc.)
  function tcol(r: string[], pos: number, ...names: string[]): string {
    for (const name of names) {
      const idx = hMap[name];
      if (idx !== undefined) return r[idx]?.trim() ?? "";
    }
    return r[pos]?.trim() ?? "";
  }

  return dataRows
    .map((r) => ({
      check_feito: parseCheckbox(
        (() => {
          // check pode ser "✓", "TRUE", "SIM", ou a própria col A
          for (const name of ["check_feito", "check", "feito", "concluido"]) {
            const idx = hMap[name];
            if (idx !== undefined) return r[idx] ?? "";
          }
          return r[0] ?? "";
        })()
      ),
      etapa:       tcol(r, 1, "etapa"),
      o_que:       tcol(r, 2, "o_que"),
      tipo:        tcol(r, 3, "tipo"),
      quem:        tcol(r, 4, "quem"),
      prazo:       tcol(r, 5, "prazo"),
      status:      tcol(r, 6, "status") || "Não iniciado",
      observacoes: tcol(r, 7, "observacoes", "observacao", "obs"),
    }))
    .filter((t) => t.o_que !== "");
}

/**
 * Lê todas as abas de uma lista de clientes e retorna tarefas com id_cliente.
 */
export async function fetchTodasTarefas(
  clientes: Array<{ id_cliente: string; sheets_aba: string | null }>
): Promise<TarefaComCliente[]> {
  const results: TarefaComCliente[] = [];

  for (const c of clientes) {
    if (!c.sheets_aba) continue;
    const tarefas = await fetchTarefasCliente(c.sheets_aba);
    for (const t of tarefas) {
      results.push({ ...t, id_cliente: c.id_cliente, aba: c.sheets_aba });
    }
  }

  return results;
}
