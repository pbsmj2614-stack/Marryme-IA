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

/**
 * Lê a aba de cadastro de clientes e retorna todos os registros.
 * Tolera variações no nome da aba e linhas com ID vazio.
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

  if (values.length <= 1) {
    throw new Error(
      `A aba "${nomeAba}" está vazia ou tem apenas o cabeçalho — adicione os dados dos clientes.`
    );
  }

  const rows = values
    .slice(1) // skip header
    .map((r) => ({
      id_cliente:      r[0]?.trim()  ?? "",
      nome_empresa:    r[1]?.trim()  ?? "",
      segmento:        r[2]?.trim()  ?? "",
      cidade:          r[3]?.trim()  ?? "",
      whatsapp:        r[4]?.trim()  ?? "",
      email:           r[5]?.trim()  ?? "",
      inicio_contrato: r[6]?.trim()  ?? "",
      plano:           r[7]?.trim()  ?? "",
      fase_projeto:    r[8]?.trim()  ?? "",
      status:          r[9]?.trim()  ?? "",
      responsavel_mm:  r[10]?.trim() ?? "",
      observacoes:     r[11]?.trim() ?? "",
    }))
    .filter((c) => c.id_cliente !== "" || c.nome_empresa !== "");

  if (rows.length === 0) {
    throw new Error(
      `A aba "${nomeAba}" tem ${values.length - 1} linha(s) mas todas têm ` +
      `as colunas ID e Nome vazias — verifique se os dados estão nas colunas corretas (A e B).`
    );
  }

  // Garante id_cliente: usa nome se ID estiver vazio
  return rows.map((r, i) => ({
    ...r,
    id_cliente: r.id_cliente || `AUTO${String(i + 1).padStart(3, "0")}`,
  }));
}

/**
 * Lê a aba de um cliente e retorna suas tarefas.
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

  return values
    .slice(1) // skip header
    .map((r) => ({
      check_feito:  parseCheckbox(r[0] ?? ""),
      etapa:        r[1]?.trim() ?? "",
      o_que:        r[2]?.trim() ?? "",
      tipo:         r[3]?.trim() ?? "",
      quem:         r[4]?.trim() ?? "",
      prazo:        r[5]?.trim() ?? "",
      status:       r[6]?.trim() || "Não iniciado",
      observacoes:  r[7]?.trim() ?? "",
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
