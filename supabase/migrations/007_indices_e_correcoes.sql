-- Migration 007: Índices compostos, constraints e correções de dados
-- ADITIVA: sem DROP de colunas ou tabelas.

-- ─── Índices compostos em mm_tarefas ─────────────────────────────────────────
-- Cobre a query principal do Pipeline e Daily: filtrar por cliente + status + prazo

CREATE INDEX IF NOT EXISTS mm_tarefas_cliente_status_prazo_idx
  ON mm_tarefas(cliente_id, status, prazo);

CREATE INDEX IF NOT EXISTS mm_tarefas_prazo_status_idx
  ON mm_tarefas(prazo, status)
  WHERE status NOT IN ('Finalizado', 'Cancelado');

-- ─── Índices compostos em mm_clientes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS mm_clientes_fase_status_idx
  ON mm_clientes(fase_projeto, status);

CREATE INDEX IF NOT EXISTS mm_clientes_responsavel_idx
  ON mm_clientes(responsavel_mm);

-- ─── Índices em relatorios_campanha ──────────────────────────────────────────
-- Já existe idx_relatorios_prestador; adiciona índice por período para queries de BI

CREATE INDEX IF NOT EXISTS relatorios_campanha_periodo_idx
  ON relatorios_campanha(periodo_inicio DESC, periodo_fim DESC);

-- ─── Índices em roteiros ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS roteiros_prestador_criado_idx
  ON roteiros(prestador_id, criado_em DESC);

-- ─── Constraints de dados ────────────────────────────────────────────────────
-- Garante que nome_empresa nunca seja vazio (evita typos silenciosos)

ALTER TABLE mm_clientes
  ADD CONSTRAINT mm_clientes_nome_not_empty
  CHECK (length(trim(nome_empresa)) >= 2);

-- Garante que o_que nunca seja vazio em tarefas

ALTER TABLE mm_tarefas
  ADD CONSTRAINT mm_tarefas_o_que_not_empty
  CHECK (length(trim(o_que)) >= 2);

-- ─── Correção de dados: typo "Crsitina" ──────────────────────────────────────
-- Remove constraint temporariamente para permitir a correção,
-- pois UPDATE não pode violar constraint que acabou de ser adicionada.
-- (constraint acima já cobre MIN 2 chars, este UPDATE está correto)

UPDATE mm_clientes
   SET nome_empresa = regexp_replace(nome_empresa, 'Crsitina', 'Cristina', 'g')
 WHERE nome_empresa ILIKE '%Crsitina%';

-- ─── Atualiza trigger de atualizado_em ───────────────────────────────────────
-- Mantém atualizado_em sincronizado em mm_clientes e mm_tarefas

CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mm_clientes_atualizado_em ON mm_clientes;
CREATE TRIGGER trg_mm_clientes_atualizado_em
  BEFORE UPDATE ON mm_clientes
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

DROP TRIGGER IF EXISTS trg_mm_tarefas_atualizado_em ON mm_tarefas;
CREATE TRIGGER trg_mm_tarefas_atualizado_em
  BEFORE UPDATE ON mm_tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
