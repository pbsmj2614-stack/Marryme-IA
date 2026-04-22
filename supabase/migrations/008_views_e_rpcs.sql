-- Migration 008: Views e RPCs para Pipeline e Daily
-- Agrega dados no Postgres, eliminando N queries e cálculos no cliente.

-- ─── View: vw_pipeline_overview ──────────────────────────────────────────────
-- Score = finalizadas / (total - canceladas) * 100, arredondado
-- Usado pelo Pipeline para renderizar a tabela sem precisar de JOIN no cliente

CREATE OR REPLACE VIEW vw_pipeline_overview AS
SELECT
  c.id,
  c.id_cliente,
  c.nome_empresa,
  c.segmento,
  c.plano,
  c.valor_contrato,
  c.status,
  c.fase_projeto,
  c.responsavel_mm,
  c.sheets_aba,
  c.importado_em,
  c.atualizado_em,
  COUNT(t.id)                                                                       AS total_tarefas,
  COUNT(t.id) FILTER (WHERE t.status = 'Finalizado')                               AS finalizadas,
  COUNT(t.id) FILTER (WHERE t.status = 'Cancelado')                                AS canceladas,
  COUNT(t.id) FILTER (
    WHERE t.prazo < CURRENT_DATE
      AND t.status NOT IN ('Finalizado', 'Cancelado')
  )                                                                                 AS atrasadas,
  CASE
    WHEN COUNT(t.id) FILTER (WHERE t.status != 'Cancelado') = 0 THEN 0
    ELSE ROUND(
      COUNT(t.id) FILTER (WHERE t.status = 'Finalizado')::numeric
      / NULLIF(COUNT(t.id) FILTER (WHERE t.status != 'Cancelado'), 0)
      * 100
    )::int
  END                                                                               AS score
FROM mm_clientes c
LEFT JOIN mm_tarefas t ON t.cliente_id = c.id_cliente
GROUP BY
  c.id, c.id_cliente, c.nome_empresa, c.segmento, c.plano,
  c.valor_contrato, c.status, c.fase_projeto, c.responsavel_mm,
  c.sheets_aba, c.importado_em, c.atualizado_em;

-- RLS na view herda das tabelas base (mm_clientes + mm_tarefas)
-- Nenhuma policy adicional necessária

-- ─── RPC: fn_pipeline_overview ───────────────────────────────────────────────
-- Retorna todos os clientes com métricas, ordenados por score ASC (mais críticos primeiro)

CREATE OR REPLACE FUNCTION fn_pipeline_overview(
  p_status      text DEFAULT NULL,    -- filtra por mm_clientes.status ('Ativo','Pausado','Encerrado')
  p_responsavel text DEFAULT NULL     -- filtra por responsavel_mm
)
RETURNS SETOF vw_pipeline_overview
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM vw_pipeline_overview
   WHERE (p_status      IS NULL OR status        = p_status)
     AND (p_responsavel IS NULL OR responsavel_mm ILIKE '%' || p_responsavel || '%')
   ORDER BY
     CASE WHEN status = 'Ativo' THEN 0
          WHEN status = 'Pausado' THEN 1
          ELSE 2
     END,
     score ASC,
     nome_empresa ASC;
$$;

-- ─── RPC: fn_daily_overview ───────────────────────────────────────────────────
-- Retorna tarefas pendentes com agrupamento de situação temporal.
-- situacao: 'atrasado' | 'hoje' | 'semana' | 'futuro'
-- p_user filtra por responsavel_mm do cliente OU quem da tarefa

CREATE OR REPLACE FUNCTION fn_daily_overview(
  p_user text DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  tarefa_id    uuid,
  cliente_id   text,
  cliente_uuid uuid,
  nome_empresa text,
  responsavel_mm text,
  plano        text,
  o_que        text,
  prazo        date,
  status       text,
  quem         text,
  etapa        text,
  check_feito  boolean,
  observacoes  text,
  situacao     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id                                                    AS tarefa_id,
    c.id_cliente                                            AS cliente_id,
    c.id                                                    AS cliente_uuid,
    c.nome_empresa,
    c.responsavel_mm,
    c.plano,
    t.o_que,
    t.prazo,
    t.status,
    t.quem,
    t.etapa,
    t.check_feito,
    t.observacoes,
    CASE
      WHEN t.prazo <  p_date                          THEN 'atrasado'
      WHEN t.prazo =  p_date                          THEN 'hoje'
      WHEN t.prazo <= p_date + INTERVAL '7 days'      THEN 'semana'
      ELSE                                                 'futuro'
    END                                                     AS situacao
  FROM mm_tarefas t
  JOIN mm_clientes c ON c.id_cliente = t.cliente_id
  WHERE
    t.status   NOT IN ('Finalizado', 'Cancelado')
    AND c.status = 'Ativo'
    AND t.prazo IS NOT NULL
    AND (
      p_user IS NULL
      OR c.responsavel_mm ILIKE '%' || p_user || '%'
      OR t.quem           ILIKE '%' || p_user || '%'
    )
  ORDER BY t.prazo ASC, c.nome_empresa ASC;
$$;

-- ─── RPC: fn_meta_health_summary ─────────────────────────────────────────────
-- Resumo de health scores para o Dashboard BI — uma row por prestador com Meta configurado

CREATE OR REPLACE FUNCTION fn_meta_health_summary()
RETURNS TABLE (
  prestador_id   uuid,
  nome_artistico text,
  categoria      text,
  health_score   int,
  status_saude   text,
  ultima_sync    timestamptz,
  sync_status    text,
  ad_account_id  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id                                                          AS prestador_id,
    p.nome_artistico,
    p.categoria,
    r.health_score,
    CASE
      WHEN r.health_score IS NULL          THEN 'Sem dados'
      WHEN r.health_score = 100            THEN 'Concluído'
      WHEN r.health_score >= 70            THEN 'Saudável'
      WHEN r.health_score >= 50            THEN 'Em atenção'
      ELSE                                      'Em risco'
    END                                                           AS status_saude,
    p.meta_ultima_sync                                            AS ultima_sync,
    p.meta_sync_status                                            AS sync_status,
    p.meta_ad_account_id                                          AS ad_account_id
  FROM prestadores p
  LEFT JOIN LATERAL (
    SELECT health_score
      FROM relatorios_campanha
     WHERE prestador_id = p.id
     ORDER BY gerado_em DESC
     LIMIT 1
  ) r ON true
  WHERE p.meta_ad_account_id IS NOT NULL
  ORDER BY
    CASE WHEN r.health_score IS NULL THEN 999 ELSE r.health_score END ASC,
    p.nome_artistico ASC;
$$;
