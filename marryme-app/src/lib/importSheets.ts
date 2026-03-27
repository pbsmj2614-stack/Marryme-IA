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
  fetchTarefasCliente,
} from "@/lib/sheets";

export interface ImportResult {
  clientes: number;
  tarefas: number;
  erros: string[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Converte DD/MM/YYYY ou YYYY-MM-DD para YYYY-MM-DD.
 * Retorna null se não reconhecer o formato.
 */
function parseDateBR(str: string): string | null {
  if (!str || str.trim() === "") return null;

  // DD/MM/YYYY
  const brMatch = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) return str.trim();

  return null;
}

const TODAY = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

function isAtrasado(prazoStr: string, status: string): boolean {
  if (status === "Finalizado") return false;
  const prazo = parseDateBR(prazoStr);
  if (!prazo) return false;
  return prazo < TODAY;
}

// ─── Tab matching ─────────────────────────────────────────────────────────────

/**
 * Tenta casar nome da aba com nome da empresa (case-insensitive, substring).
 * Aceita também correspondência direta pelo id_cliente.
 */
function encontrarAba(
  abasDisponiveis: string[],
  idCliente: string,
  nomeEmpresa: string
): string | null {
  const nLower = nomeEmpresa.toLowerCase();

  return (
    abasDisponiveis.find(
      (a) =>
        a === idCliente ||
        a.toLowerCase() === nLower ||
        a.toLowerCase().includes(nLower) ||
        nLower.includes(a.toLowerCase())
    ) ?? null
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function importarPlanilha(): Promise<ImportResult> {
  const supabase = createClient();
  const erros: string[] = [];
  let totalClientes = 0;
  let totalTarefas = 0;

  // ── 1. Busca todas as abas ──
  let todasAbas: string[] = [];
  try {
    todasAbas = await fetchTodasAbas();
  } catch (err) {
    erros.push(`Erro ao buscar abas: ${String(err)}`);
    return { clientes: 0, tarefas: 0, erros };
  }

  // ── 2. Busca e valida Cadastro_Clientes (tolerante a variações de nome) ──
  let clientesSheet;
  try {
    clientesSheet = await fetchCadastroClientes();
  } catch (err) {
    erros.push(String(err));
    return { clientes: 0, tarefas: 0, erros };
  }

  // Exclui a aba de cadastro da lista de abas de clientes
  const NOMES_SISTEMA = ["cadastro_clientes", "cadastro clientes", "clientes", "cadastro"];
  const abasClientes = todasAbas.filter(
    (a) => !NOMES_SISTEMA.includes(a.toLowerCase().trim())
  );

  // ── 3. Monta payload de clientes ──
  const clientesPayload = clientesSheet.map((c) => ({
    id_cliente:      c.id_cliente,
    nome_empresa:    c.nome_empresa,
    segmento:        c.segmento       || null,
    cidade:          c.cidade         || null,
    whatsapp:        c.whatsapp       || null,
    email:           c.email          || null,
    inicio_contrato: parseDateBR(c.inicio_contrato),
    plano:           c.plano          || null,
    fase_projeto:    c.fase_projeto   || null,
    status:          c.status         || "Ativo",
    responsavel_mm:  c.responsavel_mm || null,
    observacoes:     c.observacoes    || null,
    sheets_aba:      encontrarAba(abasClientes, c.id_cliente, c.nome_empresa),
    atualizado_em:   new Date().toISOString(),
  }));

  // ── 4. Upsert clientes ──
  const { error: errClientes } = await supabase
    .from("mm_clientes")
    .upsert(clientesPayload, { onConflict: "id_cliente" });

  if (errClientes) {
    erros.push(`Erro ao salvar clientes: ${errClientes.message}`);
    // Continua mesmo com erro parcial
  } else {
    totalClientes = clientesPayload.length;
  }

  // ── 5. Importa tarefas de cada cliente ──
  for (const cliente of clientesPayload) {
    if (!cliente.sheets_aba) {
      // Aba não encontrada — não é erro crítico
      continue;
    }

    let tarefas;
    try {
      tarefas = await fetchTarefasCliente(cliente.sheets_aba);
    } catch (err) {
      erros.push(
        `Erro ao buscar tarefas de ${cliente.nome_empresa} (${cliente.sheets_aba}): ${String(err)}`
      );
      continue;
    }

    // Determina status final (marca atrasado se necessário)
    const tarefasPayload = tarefas.map((t) => ({
      cliente_id:   cliente.id_cliente,
      check_feito:  t.check_feito,
      etapa:        t.etapa       || null,
      o_que:        t.o_que,
      tipo:         t.tipo        || null,
      quem:         t.quem        || null,
      prazo:        parseDateBR(t.prazo),
      status:       isAtrasado(t.prazo, t.status) ? "Atrasado" : (t.status || "Não iniciado"),
      observacoes:  t.observacoes || null,
      atualizado_em: new Date().toISOString(),
    }));

    // Estratégia: delete + insert (sem chave natural estável por linha)
    const { error: errDelete } = await supabase
      .from("mm_tarefas")
      .delete()
      .eq("cliente_id", cliente.id_cliente);

    if (errDelete) {
      erros.push(
        `Erro ao limpar tarefas de ${cliente.nome_empresa}: ${errDelete.message}`
      );
      continue;
    }

    if (tarefasPayload.length === 0) continue;

    const { error: errInsert } = await supabase
      .from("mm_tarefas")
      .insert(tarefasPayload);

    if (errInsert) {
      erros.push(
        `Erro ao salvar tarefas de ${cliente.nome_empresa}: ${errInsert.message}`
      );
    } else {
      totalTarefas += tarefasPayload.length;
    }
  }

  return { clientes: totalClientes, tarefas: totalTarefas, erros };
}
