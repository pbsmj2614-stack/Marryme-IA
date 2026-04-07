-- ============================================================
-- MarryMe — Schema Supabase
-- ============================================================

-- Habilitar extensão UUID
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELA: prestadores
-- ============================================================
create table if not exists prestadores (
  id             uuid primary key default gen_random_uuid(),
  nome_artistico text not null,
  categoria      text not null check (categoria in ('musico', 'fotografo', 'celebrante', 'dj', 'outro')),
  whatsapp       text,
  email          text,
  cidade_base    text,
  instagram      text,
  criado_em      timestamp with time zone default now()
);

-- RLS
alter table prestadores enable row level security;

create policy "Usuários autenticados podem ler prestadores"
  on prestadores for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir prestadores"
  on prestadores for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar prestadores"
  on prestadores for update
  using (auth.role() = 'authenticated');

-- ============================================================
-- TABELA: entrevistas
-- ============================================================
create table if not exists entrevistas (
  id            uuid primary key default gen_random_uuid(),
  prestador_id  uuid not null references prestadores(id) on delete cascade,
  dados_json    jsonb not null,
  criado_em     timestamp with time zone default now()
);

alter table entrevistas enable row level security;

create policy "Usuários autenticados podem ler entrevistas"
  on entrevistas for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir entrevistas"
  on entrevistas for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- TABELA: roteiros
-- ============================================================
create table if not exists roteiros (
  id                     uuid primary key default gen_random_uuid(),
  prestador_id           uuid not null references prestadores(id) on delete cascade,
  entrevista_id          uuid not null references entrevistas(id) on delete cascade,
  categoria              text not null,
  aprovado               boolean not null default false,
  analise_estrategica    jsonb,
  roteiro_sugerido       jsonb,
  copy_anuncios          jsonb,
  direcao_criativa       jsonb,
  modelo_usado           text,
  exemplos_fewshot_usados int default 0,
  criado_em              timestamp with time zone default now()
);

alter table roteiros enable row level security;

create policy "Usuários autenticados podem ler roteiros"
  on roteiros for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir roteiros"
  on roteiros for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar roteiros"
  on roteiros for update
  using (auth.role() = 'authenticated');

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_entrevistas_prestador on entrevistas(prestador_id);
create index if not exists idx_roteiros_prestador    on roteiros(prestador_id);
create index if not exists idx_roteiros_categoria    on roteiros(categoria);
create index if not exists idx_roteiros_aprovado     on roteiros(aprovado) where aprovado = true;

-- ============================================================
-- META ADS — Colunas em prestadores
-- ============================================================
alter table prestadores add column if not exists meta_ad_account_id text;
alter table prestadores add column if not exists meta_ultima_sync    timestamp with time zone;
alter table prestadores add column if not exists meta_sync_status    text default 'pendente';

-- ============================================================
-- TABELA: relatorios_campanha
-- ============================================================
create table if not exists relatorios_campanha (
  id             uuid primary key default gen_random_uuid(),
  prestador_id   uuid not null references prestadores(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim    date not null,
  dados_json     jsonb not null,
  health_score   int,
  status         text default 'gerado',
  pdf_url        text,
  gerado_em      timestamp with time zone default now()
);

alter table relatorios_campanha enable row level security;

create policy "Usuários autenticados podem ler relatórios"
  on relatorios_campanha for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir relatórios"
  on relatorios_campanha for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar relatórios"
  on relatorios_campanha for update
  using (auth.role() = 'authenticated');

create index if not exists idx_relatorios_prestador on relatorios_campanha(prestador_id, gerado_em desc);
