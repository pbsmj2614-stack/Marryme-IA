-- ============================================================
-- MIGRATION 010: Políticas de Storage para bucket chat-arquivos
-- ============================================================
-- Execute no Supabase SQL Editor

-- Usuários autenticados podem fazer upload
CREATE POLICY "Authenticated upload chat-arquivos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-arquivos');

-- Usuários autenticados podem ler seus próprios arquivos
CREATE POLICY "Authenticated read chat-arquivos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-arquivos');

-- Leitura pública (bucket é PUBLIC — necessário para URLs diretas funcionarem)
CREATE POLICY "Public read chat-arquivos"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'chat-arquivos');

-- Usuários autenticados podem deletar arquivos do próprio prestador
CREATE POLICY "Authenticated delete chat-arquivos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-arquivos');
