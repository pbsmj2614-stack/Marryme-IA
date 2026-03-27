-- Schema para o Dashboard BI (MarryMe CS)
-- Execute no SQL Editor do Supabase

create table if not exists mm_clientes (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,          -- MM001, MM002 ...
  nome            text not null,
  plano           text not null check (plano in ('Essencial', 'Growth', 'Premium')),
  valor_contrato  numeric(10,2) not null default 0,
  status          text not null default 'Ativo' check (status in ('Ativo', 'Pausado')),
  criado_em       timestamptz not null default now()
);

create table if not exists mm_tarefas (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references mm_clientes(id) on delete cascade,
  titulo      text not null,
  status      text not null default 'Pendente' check (status in ('Pendente', 'Finalizado', 'Atrasado')),
  criado_em   timestamptz not null default now()
);

-- Índices
create index if not exists mm_tarefas_cliente_id_idx on mm_tarefas(cliente_id);

-- RLS (ajuste as políticas conforme sua configuração de auth)
alter table mm_clientes enable row level security;
alter table mm_tarefas  enable row level security;

-- Política permissiva para usuários autenticados (ajuste se necessário)
create policy "Authenticated users can read mm_clientes"
  on mm_clientes for select
  to authenticated using (true);

create policy "Authenticated users can insert mm_clientes"
  on mm_clientes for insert
  to authenticated with check (true);

create policy "Authenticated users can read mm_tarefas"
  on mm_tarefas for select
  to authenticated using (true);

create policy "Authenticated users can insert mm_tarefas"
  on mm_tarefas for insert
  to authenticated with check (true);
