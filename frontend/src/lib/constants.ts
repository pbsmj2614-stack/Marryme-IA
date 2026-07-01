/** Constantes compartilhadas entre páginas e componentes. */

// ─── Equipe ───────────────────────────────────────────────────────────────────

export const RESPONSAVEIS = ["Paulo", "Murilo", "Kauê", "Giovanni"] as const;
export type Responsavel = (typeof RESPONSAVEIS)[number];

// ─── Status de cliente (mm_clientes) ─────────────────────────────────────────

export const STATUS_CLIENTE = ["Ativo", "Pausado", "Encerrado"] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

// ─── Status de tarefa (mm_tarefas) ────────────────────────────────────────────

export const STATUS_TAREFA_FINALIZADO = "Finalizado";
export const STATUS_TAREFA_CANCELADO = "Cancelado";

// ─── Fases inativas de prestadores ───────────────────────────────────────────

export const FASES_INATIVAS_PRESTADOR = ["Pausado", "Churn"] as const;

// ─── Tabelas Supabase ─────────────────────────────────────────────────────────

export const DB = {
  CLIENTES: "mm_clientes",
  TAREFAS: "mm_tarefas",
  PRESTADORES: "prestadores",
  ROTEIROS: "roteiros",
  ENTREVISTAS: "entrevistas",
  RELATORIOS: "relatorios_campanha",
  ANALISES_IA: "analises_ia",
  CONFIGURACOES: "configuracoes",
} as const;

// ─── Super admin (ações destrutivas / reparo em lote) ─────────────────────────

const DEFAULT_SUPER_ADMIN_EMAILS = ["pauloguimaraes@marryme.com.br"];

/** E-mails autorizados a Corrigir Gaps / Reparar pipeline (env sobrescreve). */
export function getSuperAdminEmails(): string[] {
  const fromEnv =
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? process.env.SUPER_ADMIN_EMAILS ?? "";
  const parsed = fromEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_SUPER_ADMIN_EMAILS;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.toLowerCase().trim());
}
