-- Migration 006: Roles de usuário
-- Sistema de papéis: admin > cs_senior > cs_junior > viewer
-- Um usuário tem exatamente um role. Padrão: cs_junior para contas novas.

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text  NOT NULL DEFAULT 'cs_junior'
                   CHECK (role IN ('admin', 'cs_senior', 'cs_junior', 'viewer')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Usuários podem ler o próprio role
CREATE POLICY "user_roles_self_select" ON user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role pode fazer tudo (necessário para o middleware e Edge Functions)
CREATE POLICY "user_roles_service" ON user_roles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── Helper: retorna o role do usuário atual ──────────────────────────────────

CREATE OR REPLACE FUNCTION fn_get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM user_roles WHERE user_id = auth.uid()),
    'cs_junior'
  );
$$;

-- ─── Helper: verifica se o usuário atual tem pelo menos o role informado ──────
-- Hierarquia: admin(4) > cs_senior(3) > cs_junior(2) > viewer(1)

CREATE OR REPLACE FUNCTION fn_has_role(p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE fn_get_my_role()
    WHEN 'admin'     THEN ARRAY['admin','cs_senior','cs_junior','viewer']
    WHEN 'cs_senior' THEN ARRAY['cs_senior','cs_junior','viewer']
    WHEN 'cs_junior' THEN ARRAY['cs_junior','viewer']
    ELSE             ARRAY['viewer']
  END @> ARRAY[p_min_role];
$$;

-- ─── Atualiza activity_log: permite admin ver todos os logs ──────────────────
-- Substitui a política permissiva criada em 004 por uma baseada em role

DROP POLICY IF EXISTS "activity_log_select" ON activity_log;

CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()           -- vê seus próprios logs
    OR fn_has_role('cs_senior')    -- cs_senior e admin veem tudo
  );
