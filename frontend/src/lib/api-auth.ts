import { createSupabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/roles";
import { hasMinRole } from "@/lib/roles";
import { isSuperAdminEmail } from "@/lib/constants";

export async function getAuthUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Busca o role do usuário na tabela user_roles. Padrão: 'cs_junior'. */
export async function getAuthRole(userId: string): Promise<UserRole> {
  const { data } = await supabaseAdmin()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as UserRole) ?? "cs_junior";
}

/**
 * Verifica auth + role mínimo de uma vez.
 * Retorna { user, role } se autorizado, ou uma NextResponse de erro.
 *
 * Uso:
 *   const auth = await requireRole(req, "cs_senior");
 *   if (auth instanceof NextResponse) return auth;
 *   const { user, role } = auth;
 */
export async function requireRole(minRole: UserRole) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHORIZED();

  const role = await getAuthRole(user.id);
  if (!hasMinRole(role, minRole)) return FORBIDDEN();

  return { user, role };
}

export const UNAUTHORIZED = () => NextResponse.json({ error: "Não autorizado" }, { status: 401 });

export const FORBIDDEN = () =>
  NextResponse.json({ error: "Sem permissão para esta ação" }, { status: 403 });

/** Admin + (opcional) lista de e-mails quando SUPER_ADMIN_EMAILS está no env. */
export async function requirePipelineMaintainer() {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return { response: auth, user: null };

  const restricted =
    (process.env.SUPER_ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean).length > 0;

  if (restricted && !isSuperAdminEmail(auth.user.email)) {
    return { response: FORBIDDEN() as NextResponse, user: null };
  }
  return { response: null, user: auth.user };
}

/** @deprecated use requirePipelineMaintainer */
export async function requireSuperAdmin() {
  return requirePipelineMaintainer();
}
