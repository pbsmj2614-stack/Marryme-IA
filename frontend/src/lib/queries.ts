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

const TAREFAS_PAGE_SIZE = 1000;
const CLIENTES_PAGE_SIZE = 1000;
const TAREFAS_SELECT = "id,cliente_id,check_feito,etapa,o_que,tipo,quem,prazo,status,observacoes";
const CLIENTES_SELECT =
  "id,id_cliente,nome_empresa,segmento,plano,valor_contrato,status,fase_projeto,responsavel_mm,sheets_aba";

async function fetchAllPipelineTarefas(): Promise<TarefaRow[]> {
  const supabase = createClient();
  const all: TarefaRow[] = [];

  for (let from = 0; ; from += TAREFAS_PAGE_SIZE) {
    const to = from + TAREFAS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("mm_tarefas")
      .select(TAREFAS_SELECT)
      .order("cliente_id", { ascending: true })
      .order("prazo", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as TarefaRow[];
    all.push(...page);
    if (page.length < TAREFAS_PAGE_SIZE) break;
  }

  return all;
}

async function fetchAllPipelineClientes(): Promise<ClienteRow[]> {
  const supabase = createClient();
  const all: ClienteRow[] = [];

  for (let from = 0; ; from += CLIENTES_PAGE_SIZE) {
    const to = from + CLIENTES_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("mm_clientes")
      .select(CLIENTES_SELECT)
      .order("id_cliente")
      .range(from, to);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as ClienteRow[];
    all.push(...page);
    if (page.length < CLIENTES_PAGE_SIZE) break;
  }

  return all;
}

export async function fetchPipelineRaw(): Promise<PipelineRaw> {
  const [clientes, tarefas] = await Promise.all([
    fetchAllPipelineClientes(),
    fetchAllPipelineTarefas(),
  ]);
  return {
    clientes,
    tarefas,
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardClienteRaw {
  id_cliente: string;
  nome_empresa: string;
  plano: string | null;
  fase_projeto: string | null;
  status: string | null;
}

export interface DashboardRelatorioRaw {
  id: string;
  health_score: number | null;
  dados_json: Record<string, unknown> | null;
  periodo_inicio: string;
  periodo_fim: string;
  gerado_em: string;
}

export interface DashboardPrestadorRaw {
  id: string;
  nome_artistico: string;
  categoria: string;
  meta_ad_account_id: string | null;
  meta_sync_status: string | null;
  meta_ultima_sync: string | null;
  entrevistas: Array<{
    dados_json: { plano?: string; fase_projeto?: string; mm_id?: string } | null;
    criado_em: string;
  }>;
  relatorios_campanha: DashboardRelatorioRaw[];
}

export interface DashboardRaw {
  clientes: DashboardClienteRaw[];
  prestadores: DashboardPrestadorRaw[];
}

export async function fetchDashboardRaw(): Promise<DashboardRaw> {
  const supabase = createClient();
  const [{ data: clientes, error: e1 }, { data: prestadores, error: e2 }] = await Promise.all([
    supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, plano, fase_projeto, status")
      .order("id_cliente"),
    supabase.from("prestadores").select(
      `id, nome_artistico, categoria, meta_ad_account_id, meta_sync_status, meta_ultima_sync,
       entrevistas(dados_json, criado_em),
       relatorios_campanha(id, health_score, dados_json, periodo_inicio, periodo_fim, gerado_em)`
    ),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return {
    clientes: (clientes ?? []) as DashboardClienteRaw[],
    prestadores: (prestadores ?? []) as DashboardPrestadorRaw[],
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
