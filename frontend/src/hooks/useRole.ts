"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { hasMinRole, type UserRole } from "@/lib/roles";

export type { UserRole } from "@/lib/roles";
export { hasMinRole };

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
