/** Constantes compartilhadas entre páginas e componentes. */

// ─── Equipe ───────────────────────────────────────────────────────────────────

export const RESPONSAVEIS = ["Paulo", "Murilo", "Kauê", "Giovanni"] as const;
export type Responsavel = typeof RESPONSAVEIS[number];

// ─── Status de cliente (mm_clientes) ─────────────────────────────────────────

export const STATUS_CLIENTE = ["Ativo", "Pausado", "Encerrado"] as const;
export type StatusCliente = typeof STATUS_CLIENTE[number];

// ─── Status de tarefa (mm_tarefas) ────────────────────────────────────────────

export const STATUS_TAREFA_FINALIZADO = "Finalizado";
export const STATUS_TAREFA_CANCELADO  = "Cancelado";

// ─── Fases inativas de prestadores ───────────────────────────────────────────

export const FASES_INATIVAS_PRESTADOR = ["Pausado", "Churn"] as const;

// ─── Tabelas Supabase ─────────────────────────────────────────────────────────

export const DB = {
  CLIENTES:           "mm_clientes",
  TAREFAS:            "mm_tarefas",
  PRESTADORES:        "prestadores",
  ROTEIROS:           "roteiros",
  ENTREVISTAS:        "entrevistas",
  RELATORIOS:         "relatorios_campanha",
  ANALISES_IA:        "analises_ia",
  CONFIGURACOES:      "configuracoes",
} as const;
