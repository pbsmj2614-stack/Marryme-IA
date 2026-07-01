/**
 * Helpers compartilhados para Cadastro_Clientes (layout B:P) e IDs MM.
 */

export const CATEGORIA_LABELS: Record<string, string> = {
  musico: "Músico / Banda",
  fotografo: "Fotógrafo / Cinegrafista",
  celebrante: "Celebrante / Cerimonialista",
  dj: "DJ",
  outro: "Outro",
};

export function formatMmId(num: number): string {
  return `MM${String(num).padStart(3, "0")}`;
}

/** Normaliza MM51, mm051 → MM051. Retorna null se inválido. */
export function normalizeMmId(raw: string): string | null {
  const m = String(raw ?? "")
    .trim()
    .match(/^MM(\d+)$/i);
  if (!m) return null;
  return formatMmId(parseInt(m[1], 10));
}

export function extractMmNum(id: string): number {
  const m = String(id ?? "").match(/^MM(\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

export function slugifyAba(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 35);
}

export function colLetter(col: number): string {
  let s = "";
  let c = col + 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export function dateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface CadastroRowInput {
  id_cliente: string;
  nome_empresa: string;
  segmento?: string | null;
  cidade?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  inicio_contrato: string;
  plano?: string | null;
  fase_projeto?: string | null;
  responsavel_mm?: string | null;
  observacoes?: string | null;
}

/** Linha B:P — ordem idêntica ao layout cadastro_clientes. */
export function buildCadastroRow(input: CadastroRowInput): string[] {
  return [
    normalizeMmId(input.id_cliente) ?? input.id_cliente,
    input.nome_empresa.trim(),
    input.segmento?.trim() ?? "",
    input.cidade?.trim() ?? "",
    String(input.whatsapp ?? "").replace(/\D/g, ""),
    input.email?.trim() ?? "",
    input.inicio_contrato,
    input.plano?.trim() ?? "",
    "",
    input.fase_projeto?.trim() ?? "Onboarding",
    "Ativo",
    "",
    "",
    input.responsavel_mm?.trim() ?? "",
    input.observacoes?.trim() ?? "",
  ];
}

export interface CadastroLayout {
  idColIdx: number;
  lastMMRowIdx: number;
  insertRow: number;
  startCol: string;
}

/** Detecta coluna do ID MM e próxima linha livre na aba de cadastro. */
export function detectCadastroLayout(cadRows: string[][]): CadastroLayout {
  let lastMMRowIdx = -1;
  let idColIdx = 1;
  for (let i = 0; i < cadRows.length; i++) {
    const col = cadRows[i]?.findIndex((c) => /^MM\d+/i.test((c ?? "").trim())) ?? -1;
    if (col >= 0) {
      lastMMRowIdx = i;
      idColIdx = col;
    }
  }
  return {
    idColIdx,
    lastMMRowIdx,
    insertRow: Math.max(2, lastMMRowIdx + 2),
    startCol: colLetter(idColIdx),
  };
}

/** Encontra índice de linha (0-based) pelo id_cliente na coluna detectada. */
export function findCadastroRowIndex(
  cadRows: string[][],
  idCliente: string,
  idColIdx?: number
): number {
  const col = idColIdx ?? detectCadastroLayout(cadRows).idColIdx;
  const target = (normalizeMmId(idCliente) ?? idCliente).toUpperCase();
  for (let i = 0; i < cadRows.length; i++) {
    const cell = (cadRows[i]?.[col] ?? "").trim().toUpperCase();
    if (cell === target) return i;
  }
  return -1;
}

export function nextMmId(sources: {
  cadastroFlat?: string[];
  supabaseIds?: string[];
  tabTitles?: string[];
}): string {
  const nums: number[] = [];
  const collect = (cells: string[]) => {
    for (const c of cells) {
      const n = extractMmNum(c);
      if (n > 0) nums.push(n);
    }
  };
  if (sources.cadastroFlat) collect(sources.cadastroFlat);
  if (sources.supabaseIds) collect(sources.supabaseIds);
  if (sources.tabTitles) {
    for (const t of sources.tabTitles) {
      const m = t.match(/^MM(\d+)/i);
      if (m) nums.push(parseInt(m[1], 10));
    }
  }
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return formatMmId(next);
}

export interface AppendCadastroParams {
  token: string;
  sheetId: string;
  cadastroTabTitle: string;
  row: string[];
  sheetsBatchUpdate: (
    token: string,
    data: Array<{ range: string; values: string[][] }>
  ) => Promise<void>;
  sheetsGet: (token: string, path: string) => Promise<{ values?: string[][] }>;
}

/** Insere linha no cadastro detectando coluna e linha corretas. */
export async function appendCadastroRow(params: AppendCadastroParams): Promise<void> {
  const { token, sheetId, cadastroTabTitle, row, sheetsBatchUpdate, sheetsGet } = params;
  const cadRowsData = await sheetsGet(
    token,
    `/values/${encodeURIComponent(`${cadastroTabTitle}!A1:P500`)}`
  );
  const cadRows: string[][] = cadRowsData.values ?? [];
  const layout = detectCadastroLayout(cadRows);
  const tabQuoted = `'${cadastroTabTitle.replace(/'/g, "''")}'`;
  await sheetsBatchUpdate(token, [
    {
      range: `${tabQuoted}!${layout.startCol}${layout.insertRow}`,
      values: [row],
    },
  ]);
  void sheetId;
}

/** Prefixo MM### da aba (ex: MM051_Nome → MM051). */
export function getAbaIdPrefixFromTitle(sheetsAba: string | null | undefined): string | null {
  if (!sheetsAba) return null;
  const m = sheetsAba.trim().match(/^MM[\s_-]*(\d{1,4})/i);
  if (!m) return null;
  return normalizeMmId(`MM${m[1]}`);
}
