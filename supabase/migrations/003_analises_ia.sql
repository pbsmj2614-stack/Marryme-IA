-- Tabela para armazenar análises de IA geradas sobre relatórios de campanha Meta Ads

CREATE TABLE IF NOT EXISTS analises_ia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id    uuid NOT NULL REFERENCES prestadores(id) ON DELETE CASCADE,
  relatorio_id    uuid REFERENCES relatorios_campanha(id) ON DELETE SET NULL,
  dados_json      jsonb NOT NULL DEFAULT '{}',
  modelo_usado    text,
  gerado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analises_ia_prestador_idx ON analises_ia(prestador_id, gerado_em DESC);

ALTER TABLE analises_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_analises_ia" ON analises_ia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
