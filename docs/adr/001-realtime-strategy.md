# ADR 001 — Estratégia de Realtime (Supabase)

**Status:** Accepted  
**Data:** 2026-04-22

## Contexto

O Pipeline e o Daily exibem tarefas e clientes que múltiplos usuários (Paulo, Murilo, Kauê, Giovanni) podem atualizar simultaneamente. Atualmente cada página faz um fetch completo ao montar o componente; mudanças feitas por outro usuário só aparecem após refresh manual.

## Decisão

Ativar **Supabase Realtime** nas tabelas `mm_tarefas` e `mm_clientes` via Supabase Dashboard:

1. No Supabase Studio → Database → Replication → **supabase_realtime** publication
2. Adicionar `mm_tarefas` e `mm_clientes` à publication

No frontend, as páginas que precisam de atualização em tempo real (Daily, Pipeline) devem subscrever via `supabase.channel()` e chamar `router.refresh()` (RSC) ou invalidar a query TanStack (client) ao receber eventos `INSERT | UPDATE | DELETE`.

## Alternativas consideradas

| Opção | Pro | Contra |
|---|---|---|
| Polling a cada 30s | Simples | Latência alta, carga desnecessária |
| Realtime Supabase | Baixa latência, nativo | Custo de conexões WebSocket em planos free |
| Webhook externo | Flexível | Infraestrutura adicional (Inngest/QStash) |

## Consequências

- **Tabelas afetadas:** `mm_tarefas`, `mm_clientes`
- **Não incluídas neste momento:** `roteiros`, `analises_ia` (baixa frequência de atualização)
- **Configuração:** feita manualmente no Supabase Dashboard (não é código — não entra em migration)
- **Custo:** conexões WebSocket contam no plano Supabase. Monitorar se ultrapassar limite do free tier.
- **Fallback:** se Realtime estiver desabilitado, o comportamento atual (fetch na montagem) continua funcionando

## Como ativar

```
Supabase Studio
  → Database
  → Replication
  → supabase_realtime (publication)
  → Add tables: mm_tarefas, mm_clientes
```

A integração no cliente (Fase 3) usará:

```typescript
supabase
  .channel('pipeline-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'mm_tarefas' }, () => {
    router.refresh(); // RSC: re-fetch server-side
  })
  .subscribe();
```
