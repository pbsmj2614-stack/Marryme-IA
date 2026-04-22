"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export type UserRole = "admin" | "cs_senior" | "cs_junior" | "viewer";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  cs_senior: 3,
  cs_junior: 2,
  viewer: 1,
};

/**
 * Retorna o role do usuário autenticado.
 * Usa a RPC fn_get_my_role() criada em migration 006.
 * Padrão enquanto carrega: null. Padrão se sem role cadastrado: 'cs_junior'.
 */
export function useRole(): { role: UserRole | null; loading: boolean } {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("fn_get_my_role")
      .single()
      .then(({ data }) => {
        setRole((data as UserRole) ?? "cs_junior");
        setLoading(false);
      });
  }, []);

  return { role, loading };
}

/** Retorna true se o role atual tem pelo menos o nível mínimo exigido. */
export function hasMinRole(current: UserRole | null, min: UserRole): boolean {
  if (!current) return false;
  return ROLE_HIERARCHY[current] >= ROLE_HIERARCHY[min];
}
