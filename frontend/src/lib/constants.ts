/** Constantes compartilhadas entre páginas e componentes. */

import type { UserRole } from "@/lib/roles";

// ─── Equipe ───────────────────────────────────────────────────────────────────

export const RESPONSAVEIS = ["Paulo", "Murilo", "Kauê", "Giovanni", "Isabella"] as const;
export type Responsavel = (typeof RESPONSAVEIS)[number];

/** Cores do gráfico de produtividade no Daily. */
export const RESP_CHART_COLORS: Record<Responsavel, string> = {
  Paulo: "#f43f5e",
  Murilo: "#8b5cf6",
  Kauê: "#06b6d4",
  Giovanni: "#10b981",
  Isabella: "#ec4899",
};

/** Prefixo do e-mail (antes do @) → nome do responsável no pipeline. */
export const EMAIL_RESPONSAVEIS_ALIASES: Record<string, Responsavel> = {
  pauloguimaraes: "Paulo",
  paulo: "Paulo",
  murilo: "Murilo",
  kaue: "Kauê",
  giovanni: "Giovanni",
  isabella: "Isabella",
};

export function normalizePersonName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Resolve o responsável do usuário logado a partir do e-mail. */
export function resolveResponsavelFromEmail(
  email: string | null | undefined,
  taskNames?: string[]
): string | null {
  if (!email) return null;
  const prefix = normalizePersonName(email.split("@")[0]);

  for (const [alias, name] of Object.entries(EMAIL_RESPONSAVEIS_ALIASES)) {
    if (prefix === alias || prefix.startsWith(alias) || alias.startsWith(prefix)) {
      return name;
    }
  }

  const respMatch = RESPONSAVEIS.find((r) => prefix.startsWith(normalizePersonName(r)));
  if (respMatch) return respMatch;

  if (taskNames?.length) {
    return taskNames.find((nome) => prefix.startsWith(normalizePersonName(nome))) ?? null;
  }

  return null;
}

export interface RespChartDef {
  key: string;
  label: string;
  color: string;
  match: (quem: string) => boolean;
}

/** Time ativo + aliases legados da planilha (Paulo M, Consolo, Cristal). */
export function buildRespChartDefs(): RespChartDef[] {
  const legacy: RespChartDef[] = [
    {
      key: "PauloM",
      label: "Paulo M",
      color: "#a78bfa",
      match: (q) => /paulo\s*m/i.test(q.trim()),
    },
    {
      key: "Consolo",
      label: "Consolo",
      color: "#f59e0b",
      match: (q) => /consolo/i.test(q.trim()),
    },
    {
      key: "Cristal",
      label: "Cristal",
      color: "#14b8a6",
      match: (q) => /cristal/i.test(q.trim()),
    },
  ];

  const team: RespChartDef[] = RESPONSAVEIS.map((name) => ({
    key: name,
    label: name,
    color: RESP_CHART_COLORS[name],
    match: (q) => normalizePersonName(q) === normalizePersonName(name),
  }));

  return [
    ...legacy,
    ...team,
    { key: "Outros", label: "Outros", color: "#cbd5e1", match: () => true },
  ];
}

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

// ─── Super admin (Corrigir Gaps / Reparar pipeline) ─────────────────────────

const DEFAULT_SUPER_ADMIN_EMAILS = ["pauloguimaraes@marryme.com.br"];

function superAdminEmailsFromEnv(): string[] | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? process.env.SUPER_ADMIN_EMAILS ?? "";
  const parsed = fromEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

/** E-mails autorizados quando SUPER_ADMIN_EMAILS está definido no env. */
export function getSuperAdminEmails(): string[] {
  return superAdminEmailsFromEnv() ?? DEFAULT_SUPER_ADMIN_EMAILS;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.toLowerCase().trim());
}

/**
 * Corrigir Gaps / Reparar pipeline:
 * - Sem env SUPER_ADMIN_EMAILS → qualquer admin (comportamento legado)
 * - Com env → só e-mails listados
 */
export function isPipelineMaintainer(
  email: string | null | undefined,
  role: UserRole | null
): boolean {
  if (role !== "admin") return false;
  const restricted = superAdminEmailsFromEnv();
  if (!restricted) return true;
  return isSuperAdminEmail(email);
}
