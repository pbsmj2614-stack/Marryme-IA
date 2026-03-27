-- Migration 001: Pipeline de clientes (MarryMe CS)
-- Execute no SQL Editor do Supabase
-- ATENÇÃO: dropa e recria mm_clientes e mm_tarefas se já existirem

DROP TABLE IF EXISTS mm_tarefas CASCADE;
DROP TABLE IF EXISTS mm_clientes CASCADE;

CREATE TABLE mm_clientes (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  id_cliente       text UNIQUE NOT NULL,        -- ex: MM001
  nome_empresa     text NOT NULL,
  segmento         text,
  cidade           text,
  whatsapp         text,
  email            text,
  inicio_contrato  date,
  plano            text,
  valor_contrato   numeric DEFAULT 0,
  fase_projeto     text,
  status           text DEFAULT 'Ativo',
  responsavel_mm   text,
  observacoes      text,
  sheets_aba       text,                        -- nome da aba no Google Sheets
  importado_em     timestamptz DEFAULT now(),
  atualizado_em    timestamptz DEFAULT now()
);

CREATE TABLE mm_tarefas (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id   text REFERENCES mm_clientes(id_cliente) ON DELETE CASCADE,
  check_feito  boolean DEFAULT false,
  etapa        text,
  o_que        text NOT NULL,
  tipo         text,                            -- 'Marry Me' ou 'Cliente'
  quem         text,
  prazo        date,
  status       text DEFAULT 'Não iniciado',    -- Finalizado | Atrasado | Em andamento | Não iniciado
  observacoes  text,
  importado_em  timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX mm_tarefas_cliente_id_idx ON mm_tarefas(cliente_id);
CREATE INDEX mm_tarefas_status_idx     ON mm_tarefas(status);
CREATE INDEX mm_clientes_status_idx    ON mm_clientes(status);

-- RLS
ALTER TABLE mm_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mm_tarefas  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_clientes" ON mm_clientes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_tarefas"  ON mm_tarefas  FOR ALL USING (auth.role() = 'authenticated');
