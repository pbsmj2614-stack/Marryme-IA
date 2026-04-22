/**
 * Query functions para TanStack Query.
 * Cada função retorna os dados brutos — os hooks em /hooks aplicam os queryKeys.
 */

import { createClient } from "@/lib/supabase";

// ─── Tipos compartilhados ─────────────────────────────────────────────────────

export interface ClienteRow {
  id: string;
  id_cliente: string;
  nome_empresa: string;
  segmento: string | null;
  plano: string | null;
  valor_contrato: number;
  status: string;
  fase_projeto: string | null;
  responsavel_mm: string | null;
  sheets_aba: string | null;
}

export interface TarefaRow {
  id: string;
  cliente_id: string;
  check_feito: boolean;
  etapa: string | null;
  o_que: string;
  tipo: string | null;
  quem: string | null;
  prazo: string | null;
  status: string;
  observacoes: string | null;
}

export interface ClienteComTarefas extends ClienteRow {
  mm_tarefas: TarefaRow[];
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export async function fetchClientes(): Promise<ClienteComTarefas[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mm_clientes")
    .select(
      `id, id_cliente, nome_empresa, segmento, plano, valor_contrato,
       status, fase_projeto, responsavel_mm, sheets_aba,
       mm_tarefas(id, cliente_id, check_feito, etapa, o_que, tipo, quem, prazo, status, observacoes)`
    )
    .order("id_cliente");

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteComTarefas[];
}

export async function fetchClientesAtivos(): Promise<ClienteComTarefas[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mm_clientes")
    .select(
      `id, id_cliente, nome_empresa, segmento, plano, valor_contrato,
       status, fase_projeto, responsavel_mm, sheets_aba,
       mm_tarefas(id, cliente_id, check_feito, etapa, o_que, tipo, quem, prazo, status, observacoes)`
    )
    .eq("status", "Ativo")
    .order("id_cliente");

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteComTarefas[];
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export interface PipelineRaw {
  clientes: ClienteRow[];
  tarefas: TarefaRow[];
}

export async function fetchPipelineRaw(): Promise<PipelineRaw> {
  const supabase = createClient();
  const [{ data: clientes, error: e1 }, { data: tarefas, error: e2 }] = await Promise.all([
    supabase
      .from("mm_clientes")
      .select(
        "id,id_cliente,nome_empresa,segmento,plano,valor_contrato,status,fase_projeto,responsavel_mm,sheets_aba"
      )
      .order("id_cliente")
      .limit(500),
    supabase
      .from("mm_tarefas")
      .select("id,cliente_id,check_feito,etapa,o_que,tipo,quem,prazo,status,observacoes")
      .limit(2000),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return {
    clientes: (clientes ?? []) as ClienteRow[],
    tarefas: (tarefas ?? []) as TarefaRow[],
  };
}

export async function fetchTarefasByCliente(clienteId: string): Promise<TarefaRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mm_tarefas")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("prazo", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as TarefaRow[];
}
