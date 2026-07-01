/** Papéis de usuário — módulo compartilhado (server + client). */

export type UserRole = "admin" | "cs_senior" | "cs_junior" | "viewer";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  cs_senior: 3,
  cs_junior: 2,
  viewer: 1,
};

/** Retorna true se o role atual tem pelo menos o nível mínimo exigido. */
export function hasMinRole(current: UserRole | null, min: UserRole): boolean {
  if (!current) return false;
  return ROLE_HIERARCHY[current] >= ROLE_HIERARCHY[min];
}
