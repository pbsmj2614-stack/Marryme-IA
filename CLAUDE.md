# MarryMe — Sistema de Roteiros

## O que é
App interno da MarryMe para geração automática de roteiros de vídeo e CTAs para Meta Ads, com base em entrevistas com prestadores de serviços de casamento (músicos, fotógrafos, celebrantes, DJs, etc).

## Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS — pasta `marryme-app/`
- **Banco:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **IA:** API Anthropic Claude (`claude-sonnet-4-6`)
- **Deploy:** Vercel (frontend) + Supabase (backend/Edge Functions)
- **Desenvolvimento:** Claude Code + VSCode

## Estrutura de pastas
```
MarryMeIA_claude/
├── MarryMeIA.py          # Script Python legado (Gemini → migrar para Claude se necessário)
├── requirements.txt       # anthropic, python-dotenv, supabase
├── prompts/               # Prompts dos 4 passos do agente
│   ├── prompt_estrategia.txt
│   ├── prompt_roteiro.txt
│   ├── prompt_ads.txt
│   └── prompt_direcao.txt
├── supabase/
│   ├── schema.sql                          # Schema completo do banco
│   └── functions/gerar-roteiro/index.ts   # Edge Function principal
└── marryme-app/           # App Next.js
    └── src/
        ├── app/
        │   ├── page.tsx              # Dashboard — lista de prestadores
        │   ├── login/page.tsx        # Auth via Supabase
        │   ├── novo/page.tsx         # Formulário de entrevista
        │   └── prestador/[id]/page.tsx  # Visualização/edição de roteiros
        ├── lib/
        │   ├── supabase.ts           # Clientes Supabase (browser + server)
        │   └── types.ts              # Tipos TypeScript
        └── components/
            └── Header.tsx
```

## Fluxo do agente (4 passos)
1. **Análise estratégica** — posicionamento, público-alvo, diferenciais, tom
2. **Roteiro de vídeo** — 5 cenas com hook, autoridade, diferenciais, CTA
3. **Copy de anúncios** — 3 variações Meta Ads (emocional, direto, premium)
4. **Direção criativa** — tipos de cena, ambientação, enquadramento, edição

## Few-shot automático
Roteiros aprovados ficam salvos no Supabase com `aprovado = true` e `categoria`.
Antes de gerar novo roteiro, a Edge Function busca até 3 exemplos aprovados da mesma categoria e injeta no system prompt como exemplos.

## Tabelas Supabase
| Tabela | Descrição |
|---|---|
| `prestadores` | Dados cadastrais do prestador |
| `entrevistas` | JSON completo do formulário de entrevista |
| `roteiros` | Output do agente IA (4 campos jsonb) + flag `aprovado` |

## Variáveis de ambiente
Estão no arquivo `.env` na raiz do projeto e em `marryme-app/.env.local`.

| Variável | Onde usar |
|---|---|
| `ANTHROPIC_API_KEY` | Edge Function (server-side only) |
| `SUPABASE_URL` | Backend + frontend |
| `SUPABASE_ANON_KEY` | Frontend (público) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only — **NUNCA expor no frontend** |

## Regras
- **Nunca** expor `SUPABASE_SERVICE_ROLE_KEY` no frontend
- Sempre usar `SUPABASE_ANON_KEY` no lado do cliente Next.js
- Respostas da API Claude sempre em português
- Modelo fixo: `claude-sonnet-4-6`
- Auth obrigatória em todas as páginas exceto `/login`
