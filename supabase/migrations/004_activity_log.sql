-- Migration 004: Activity Log
-- Registra todas as ações relevantes para auditoria e timeline por prestador/cliente.
-- entity_id é text para suportar tanto UUIDs (prestadores) quanto IDs textuais (mm_clientes.id_cliente)

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  text,                               -- snapshot do email no momento da ação
  entity_type text        NOT NULL,               -- 'prestador' | 'cliente' | 'tarefa' | 'roteiro' | 'campanha'
  entity_id   text        NOT NULL,               -- uuid ou id_cliente textual
  entity_nome text,                               -- snapshot do nome para exibição na timeline
  action      text        NOT NULL,               -- 'create' | 'update' | 'delete' | 'phase_change' | 'approve' | 'generate'
  old_value   jsonb,
  new_value   jsonb,
  metadata    jsonb,                              -- ex: {"motivo": "Cliente solicitou pausa"}
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices para as queries mais comuns
CREATE INDEX IF NOT EXISTS activity_log_entity_idx  ON activity_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_idx    ON activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem inserir seus próprios logs
CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Usuários autenticados podem ler todos os logs (visibilidade interna total)
-- Ajustar para filtrar por role quando migration 006 estiver em produção
CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT TO authenticated
  USING (true);

-- Service role pode fazer tudo (usado por Edge Functions)
CREATE POLICY "activity_log_service" ON activity_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
