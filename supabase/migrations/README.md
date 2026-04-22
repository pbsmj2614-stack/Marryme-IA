# Migrations — MarryMe Supabase

Execute cada arquivo **em ordem numérica** no **SQL Editor do Supabase Studio**.
Todas as migrations são **aditivas** (sem DROP de tabelas ou colunas sem flag `--destructive`).

## Ordem de execução

| Arquivo | O que faz | Executado? |
|---|---|---|
| `001_pipeline.sql` | Cria `mm_clientes` e `mm_tarefas` | ✅ |
| `002_configuracoes.sql` | Cria `configuracoes` (tokens dinâmicos) | ✅ |
| `003_analises_ia.sql` | Cria `analises_ia` | ✅ |
| `004_activity_log.sql` | Cria `activity_log` com RLS e índices | ⬜ |
| `005_roteiro_versoes.sql` | Cria `roteiro_versoes` + trigger de versionamento | ⬜ |
| `006_user_roles.sql` | Cria `user_roles`, helpers `fn_get_my_role` e `fn_has_role` | ⬜ |
| `007_indices_e_correcoes.sql` | Índices compostos, constraints, correção typo "Crsitina" | ⬜ |
| `008_views_e_rpcs.sql` | View `vw_pipeline_overview` + RPCs `fn_pipeline_overview`, `fn_daily_overview`, `fn_meta_health_summary` | ⬜ |

## Como executar

1. Abra [Supabase Studio](https://app.supabase.com)
2. Selecione o projeto MarryMe
3. Vá em **SQL Editor** → **New Query**
4. Cole o conteúdo do arquivo e clique em **Run**
5. Marque como ✅ na tabela acima

## Após executar 008

Ativar Realtime nas tabelas (ver `docs/adr/001-realtime-strategy.md`):
- Database → Replication → supabase_realtime → Add: `mm_tarefas`, `mm_clientes`

## Notas

- As migrations **não usam** Supabase CLI local (sem `supabase db push`) — são executadas diretamente no Studio
- Para usar as RPCs no frontend: `supabase.rpc('fn_pipeline_overview', { p_status: 'Ativo' })`
- `fn_daily_overview` aceita `p_user` (nome do responsável) e `p_date` (data base, default hoje)
