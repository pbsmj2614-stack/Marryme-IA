-- Tabela de configurações globais do sistema
-- Usada para armazenar tokens dinâmicos (ex: Meta Access Token)
-- que precisam ser atualizados sem redeploy.

CREATE TABLE IF NOT EXISTS configuracoes (
  chave        text PRIMARY KEY,
  valor        text,
  atualizado_em timestamptz DEFAULT now()
);

-- Seed: insere o token inicial (será sobrescrito pelo auto-refresh)
-- Deixe em branco — o sistema usará META_ACCESS_TOKEN do .env como fallback
-- INSERT INTO configuracoes (chave, valor) VALUES ('meta_access_token', '');

-- RLS: apenas service role pode ler/escrever
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON configuracoes
  USING (true)
  WITH CHECK (true);
