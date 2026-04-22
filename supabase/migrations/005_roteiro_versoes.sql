-- Migration 005: Versionamento de Roteiros
-- Cada vez que um roteiro tem suas seções de conteúdo alteradas,
-- a versão anterior é salva automaticamente via trigger.

CREATE TABLE IF NOT EXISTS roteiro_versoes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  roteiro_id uuid        NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
  versao     int         NOT NULL,
  conteudo   jsonb       NOT NULL,   -- snapshot: {analise_estrategica, roteiro_sugerido, copy_anuncios, direcao_criativa}
  criado_por uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roteiro_id, versao)
);

CREATE INDEX IF NOT EXISTS roteiro_versoes_roteiro_idx ON roteiro_versoes(roteiro_id, versao DESC);

ALTER TABLE roteiro_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roteiro_versoes_select" ON roteiro_versoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "roteiro_versoes_service" ON roteiro_versoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Trigger: salva versão anterior ao atualizar conteúdo ────────────────────

CREATE OR REPLACE FUNCTION fn_versionar_roteiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proxima_versao int;
BEGIN
  -- Só versiona se alguma seção de conteúdo mudou
  IF (
    OLD.analise_estrategica  IS DISTINCT FROM NEW.analise_estrategica  OR
    OLD.roteiro_sugerido     IS DISTINCT FROM NEW.roteiro_sugerido     OR
    OLD.copy_anuncios        IS DISTINCT FROM NEW.copy_anuncios        OR
    OLD.direcao_criativa     IS DISTINCT FROM NEW.direcao_criativa
  ) THEN
    SELECT COALESCE(MAX(versao), 0) + 1
      INTO v_proxima_versao
      FROM roteiro_versoes
     WHERE roteiro_id = OLD.id;

    INSERT INTO roteiro_versoes (roteiro_id, versao, conteudo, criado_por, criado_em)
    VALUES (
      OLD.id,
      v_proxima_versao,
      jsonb_build_object(
        'analise_estrategica', OLD.analise_estrategica,
        'roteiro_sugerido',    OLD.roteiro_sugerido,
        'copy_anuncios',       OLD.copy_anuncios,
        'direcao_criativa',    OLD.direcao_criativa
      ),
      auth.uid(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_versionar_roteiro ON roteiros;

CREATE TRIGGER trg_versionar_roteiro
  BEFORE UPDATE ON roteiros
  FOR EACH ROW
  EXECUTE FUNCTION fn_versionar_roteiro();
