/**
 * importSheets.ts — Importação Google Sheets → Supabase
 *
 * Fluxo:
 * 1. Busca todas as abas da planilha
 * 2. Lê Cadastro_Clientes → upsert em mm_clientes
 * 3. Para cada cliente, acha a aba correspondente e importa tarefas
 * 4. Marca como 'Atrasado' se prazo < hoje e status ≠ 'Finalizado'
 */

import { createClient } from "@/lib/supabase";
import {
  fetchTodasAbas,
  fetchCadastroClientes,
  fetchTodasTarefasBatch,
} from "@/lib/sheets";

export interface ImportResult {
  clientes: number;
  tarefas: number;
  erros: string[];
  semAbas: string[];      // clientes sem aba no Sheets
  semTarefas: string[];   // clientes com aba mas 0 tarefas importadas
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Converte D/M/YYYY, DD/MM/YYYY, DD/MM/YY ou YYYY-MM-DD para YYYY-MM-DD.
 * Retorna null se não reconhecer o formato.
 */
function parseDateBR(str: string): string | null {
  if (!str || str.trim() === "") return null;
  const s = str.trim();

  // D/M/YYYY ou DD/MM/YYYY (aceita 1 ou 2 dígitos no dia e mês)
  const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, "0");
    const m = brMatch[2].padStart(2, "0");
    return `${brMatch[3]}-${m}-${d}`;
  }

  // D/M/YY (ano com 2 dígitos)
  const brShort = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (brShort) {
    const d = brShort[1].padStart(2, "0");
    const m = brShort[2].padStart(2, "0");
    const y = parseInt(brShort[3]) < 50 ? `20${brShort[3]}` : `19${brShort[3]}`;
    return `${y}-${m}-${d}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

const TODAY = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

function isAtrasado(prazoStr: string, status: string): boolean {
  if (/finaliz|cancelad/i.test(status)) return false; // já finalizado ou cancelado
  const prazo = parseDateBR(prazoStr);
  if (!prazo) return false;
  return prazo < TODAY;
}

// Normaliza status do cliente para "Ativo" ou "Pausado"
function normalizeClientStatus(s: string): "Ativo" | "Pausado" {
  if (!s?.trim()) return "Ativo";
  if (/paus/i.test(s)) return "Pausado";
  return "Ativo";
}

// Normaliza status da tarefa para valor canônico
function normalizeTaskStatus(s: string, checkFeito: boolean): string {
  if (checkFeito) return "Finalizado";
  if (!s?.trim()) return "Não iniciado";
  if (/finaliz|conclu|feito|done/i.test(s)) return "Finalizado";
  if (/andamento|progress|em curso/i.test(s)) return "Em andamento";
  if (/atras|vencid/i.test(s)) return "Atrasado";
  if (/cancelad/i.test(s)) return "Cancelado";
  if (/não inici|nao inici|pendente|aberto/i.test(s)) return "Não iniciado";
  return s.trim(); // preserva valor original se não reconhecer
}

// ─── Tab matching ─────────────────────────────────────────────────────────────

/**
 * Casa o id_cliente com o nome da aba no padrão "MM039_NomeCliente".
 * Prioridade:
 *  1. Aba começa com ID + "_"  → MM039_AlexandrePissarro  ✓
 *  2. Aba é exatamente o ID    → MM039                    ✓
 *  3. Nome da empresa na aba   → fallback fuzzy            ✓
 */
function encontrarAba(
  abasDisponiveis: string[],
  idCliente: string,
  nomeEmpresa: string
): string | null {
  const idLower  = idCliente.toLowerCase();
  const nomeLower = nomeEmpresa.toLowerCase().replace(/\s+/g, "");

  return (
    // 1ª prioridade: ID como prefixo (MM039_NomeQualquer)
    abasDisponiveis.find((a) =>
      a.toLowerCase().startsWith(idLower + "_") ||
      a.toLowerCase() === idLower
    ) ??
    // 2ª prioridade: nome da empresa na aba (sem espaços)
    abasDisponiveis.find((a) => {
      const aLower = a.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
      return aLower.includes(nomeLower) || nomeLower.includes(aLower);
    }) ??
    null
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function importarPlanilha(): Promise<ImportResult> {
  const supabase = createClient();
  const erros: string[] = [];
  const semAbas: string[] = [];
  const semTarefas: string[] = [];
  let totalClientes = 0;
  let totalTarefas = 0;

  const vazio = (extra?: Partial<ImportResult>): ImportResult =>
    ({ clientes: 0, tarefas: 0, erros, semAbas, semTarefas, ...extra });

  // ── 1. Busca todas as abas ──
  let todasAbas: string[] = [];
  try {
    todasAbas = await fetchTodasAbas();
  } catch (err) {
    erros.push(`Erro ao buscar abas: ${String(err)}`);
    return vazio();
  }

  // ── 2. Busca e valida Cadastro_Clientes ──
  let clientesSheet;
  try {
    clientesSheet = await fetchCadastroClientes();
  } catch (err) {
    erros.push(String(err));
    return vazio();
  }

  // Apenas abas no formato MM039_NomeCliente (ou MM039)
  const abasClientes = todasAbas.filter((a) => /^MM\d+/i.test(a.trim()));

  // ── 3. Limpa todos os clientes antigos ──
  const { error: errLimpar } = await supabase
    .from("mm_clientes")
    .delete()
    .neq("id_cliente", "__never__");

  if (errLimpar) {
    erros.push(`Erro ao limpar clientes antigos: ${errLimpar.message}`);
    return vazio();
  }

  // ── 4. Monta payload de clientes ──
  const clientesPayload = clientesSheet.map((c) => {
    const aba = encontrarAba(abasClientes, c.id_cliente, c.nome_empresa);
    if (!aba) semAbas.push(`${c.id_cliente} (${c.nome_empresa})`);
    return {
      id_cliente:      c.id_cliente,
      nome_empresa:    c.nome_empresa,
      segmento:        c.segmento       || null,
      cidade:          c.cidade         || null,
      whatsapp:        c.whatsapp       || null,
      email:           c.email          || null,
      inicio_contrato: parseDateBR(c.inicio_contrato),
      plano:           c.plano          || null,
      fase_projeto:    c.fase_projeto   || null,
      status:          normalizeClientStatus(c.status),
      responsavel_mm:  c.responsavel_mm || null,
      observacoes:     c.observacoes    || null,
      sheets_aba:      aba,
      atualizado_em:   new Date().toISOString(),
    };
  });

  // ── 5. Insere clientes frescos ──
  const { error: errClientes } = await supabase
    .from("mm_clientes")
    .insert(clientesPayload);

  if (errClientes) {
    erros.push(`Erro ao salvar clientes: ${errClientes.message}`);
    return vazio();
  }
  totalClientes = clientesPayload.length;

  // ── 6. Busca TODAS as tarefas em batchGet ──
  const abasComCliente = clientesPayload
    .filter((c) => c.sheets_aba)
    .map((c) => ({ id_cliente: c.id_cliente, sheets_aba: c.sheets_aba as string, nome_empresa: c.nome_empresa }));

  let todasTarefasLote: Record<string, import("@/lib/sheets").TarefaSheet[]> = {};
  try {
    todasTarefasLote = await fetchTodasTarefasBatch(abasComCliente.map((c) => c.sheets_aba));
  } catch (err) {
    erros.push(`Erro ao buscar tarefas (batchGet): ${String(err)}`);
  }

  // ── 7. Monta e insere tarefas ──
  for (const cliente of abasComCliente) {
    const tarefas = todasTarefasLote[cliente.sheets_aba] ?? [];

    if (tarefas.length === 0) {
      semTarefas.push(`${cliente.id_cliente} (${cliente.nome_empresa})`);
      continue;
    }

    const tarefasPayload = tarefas.map((t: import("@/lib/sheets").TarefaSheet) => {
      const prazoISO   = parseDateBR(t.prazo);
      const statusNorm = normalizeTaskStatus(t.status, t.check_feito);
      const statusFinal = t.check_feito ? "Finalizado"
        : isAtrasado(t.prazo, statusNorm) ? "Atrasado"
        : statusNorm;
      return {
        cliente_id:    cliente.id_cliente,
        check_feito:   t.check_feito,
        etapa:         t.etapa       || null,
        o_que:         t.o_que,
        tipo:          t.tipo        || null,
        quem:          t.quem        || null,
        prazo:         prazoISO,
        status:        statusFinal,
        observacoes:   t.observacoes || null,
        atualizado_em: new Date().toISOString(),
      };
    });

    const { error: errInsert } = await supabase
      .from("mm_tarefas")
      .insert(tarefasPayload);

    if (errInsert) {
      erros.push(`Erro ao salvar tarefas de ${cliente.nome_empresa}: ${errInsert.message}`);
    } else {
      totalTarefas += tarefasPayload.length;
    }
  }

  return { clientes: totalClientes, tarefas: totalTarefas, erros, semAbas, semTarefas };
}
