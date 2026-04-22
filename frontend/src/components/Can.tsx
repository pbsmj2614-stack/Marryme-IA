"use client";

import { useRole, hasMinRole } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";

interface CanProps {
  /** Role mínimo necessário para renderizar o children. */
  role: UserRole;
  /** Renderizado quando o usuário NÃO tem o role. Opcional. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Gate de UI baseado em role.
 * Enquanto o role carrega, não renderiza nada (evita flash de conteúdo restrito).
 *
 * Uso:
 *   <Can role="admin">
 *     <BotaoDestruir />
 *   </Can>
 *
 *   <Can role="cs_senior" fallback={<p>Sem permissão</p>}>
 *     <TabelaCompleta />
 *   </Can>
 */
export function Can({ role: minRole, fallback = null, children }: CanProps) {
  const { role, loading } = useRole();

  if (loading) return null;
  if (!hasMinRole(role, minRole)) return <>{fallback}</>;
  return <>{children}</>;
}
