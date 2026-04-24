-- ============================================================
-- MIGRATION 009: Chat conversacional de roteiros
-- ============================================================

-- Sessões de chat por prestador
CREATE TABLE IF NOT EXISTS chat_sessoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id   uuid REFERENCES prestadores(id) ON DELETE CASCADE,
  titulo         text DEFAULT 'Nova conversa',
  tipo           text DEFAULT 'geral',
  -- geral | video_apresentacao | cta_anuncio | direcao_criativa | analise
  status         text DEFAULT 'ativa',
  -- ativa | finalizada | arquivada
  roteiro_final  jsonb,
  tokens_usados  int DEFAULT 0,
  criado_em      timestamptz DEFAULT now(),
  atualizado_em  timestamptz DEFAULT now()
);

-- Mensagens de cada sessão
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id  uuid REFERENCES chat_sessoes(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  arquivos   jsonb DEFAULT '[]',
  -- [{ nome, url, tipo, tamanho }]
  criado_em  timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chat_sessoes_prestador
  ON chat_sessoes(prestador_id, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_sessao
  ON chat_mensagens(sessao_id, criado_em ASC);

-- Trigger: atualiza timestamp da sessão a cada nova mensagem
CREATE OR REPLACE FUNCTION atualizar_timestamp_sessao()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessoes
  SET atualizado_em = now()
  WHERE id = NEW.sessao_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_chat_sessao_timestamp ON chat_mensagens;
CREATE TRIGGER trigger_chat_sessao_timestamp
  AFTER INSERT ON chat_mensagens
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_sessao();

-- Auto-arquivamento de sessões inativas há mais de 90 dias
CREATE OR REPLACE FUNCTION arquivar_sessoes_inativas()
RETURNS void AS $$
BEGIN
  UPDATE chat_sessoes
  SET status = 'arquivada'
  WHERE status = 'ativa'
  AND atualizado_em < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE chat_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem sessões"
  ON chat_sessoes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados inserem sessões"
  ON chat_sessoes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Autenticados atualizam sessões"
  ON chat_sessoes FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados excluem sessões"
  ON chat_sessoes FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados leem mensagens"
  ON chat_mensagens FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados inserem mensagens"
  ON chat_mensagens FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Autenticados excluem mensagens"
  ON chat_mensagens FOR DELETE USING (auth.role() = 'authenticated');
