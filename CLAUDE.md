# MarryMe — Sistema Interno de Customer Success

## O que é
App interno da MarryMe para gestão de prestadores de serviços de casamento (músicos, fotógrafos, celebrantes, DJs, cerimonialistas), geração automática de roteiros de vídeo e CTAs para Meta Ads, pipeline de tarefas, Daily operacional e Dashboard BI de Meta Ads.

## Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS — pasta `frontend/`
- **Banco:** Supabase (PostgreSQL + Auth + Edge Functions)
- **IA:** API Anthropic Claude (`claude-sonnet-4-6`)
- **Deploy:** Vercel (frontend) + Supabase (backend/Edge Functions)
- **Desenvolvimento:** Claude Code + VSCode

## Estrutura de pastas
```
MarryMeIA_claude/
├── backend/
│   ├── MarryMeIA.py          # Script Python legado (integração Gemini)
│   ├── requirements.txt
│   └── prompts/              # Prompts dos 4 passos do agente
├── supabase/
│   ├── schema.sql            # Schema completo do banco
│   ├── migrations/           # 001_pipeline, 002_configuracoes, 003_analises_ia
│   └── functions/
│       └── gerar-roteiro/index.ts   # Edge Function principal (Claude API)
└── frontend/                 # App Next.js
    └── src/
        ├── app/
        │   ├── page.tsx              # Lista de prestadores (dashboard principal)
        │   ├── login/page.tsx        # Auth via Supabase
        │   ├── novo/page.tsx         # Wizard de cadastro + geração de roteiro
        │   ├── novo-cliente/page.tsx # Redirect permanente → /novo
        │   ├── dashboard/page.tsx    # Dashboard BI Meta Ads
        │   ├── pipeline/page.tsx     # Pipeline de clientes e tarefas
        │   ├── daily/page.tsx        # Daily operacional por responsável
        │   ├── prestador/[id]/       # Perfil: roteiro, campanha, editar, configurar, pdf
        │   └── api/                  # Routes: analise/gerar, meta/*, sheets/*
        ├── middleware.ts             # Auth guard global (@supabase/ssr)
        ├── lib/
        │   ├── supabase.ts           # Cliente browser
        │   ├── supabase-server.ts    # Cliente SSR (Server Components)
        │   ├── supabase-admin.ts     # Service Role (API routes only)
        │   ├── types.ts              # Tipos TypeScript core
        │   ├── constants.ts          # RESPONSAVEIS, STATUS_CLIENTE, DB (fonte única)
        │   ├── client-utils.ts       # isPrazoVencido, formatDate, dedup helpers
        │   ├── error-utils.ts        # extractFunctionError (Edge Function errors)
        │   ├── formatters.ts         # fmt, fmtBRL, fmtPct
        │   ├── healthScore.ts        # getStatusFromScore, getScoreColor
        │   ├── utils.ts              # formatarTelefone
        │   ├── sheets.ts             # Google Sheets API client
        │   ├── importSheets.ts       # Sincronização Sheets → Supabase
        │   ├── exportDocx.ts         # Geração de relatório DOCX
        │   └── seedDashboard.ts      # Seed de dados de exemplo (dev only)
        └── components/
            ├── Header.tsx
            ├── PrestadorCard.tsx
            ├── AnaliseIA.tsx
            ├── CampanhaTab.tsx
            ├── RoteiroCard.tsx
            ├── SearchInput.tsx
            ├── GerarRoteiroButton.tsx
            ├── GerarSecaoButton.tsx
            ├── RefazerRoteiroButton.tsx
            ├── AprovarButton.tsx
            ├── EditarEntrevistaForm.tsx
            ├── ExportarButton.tsx
            ├── ExcluirPrestadorButton.tsx
            ├── AtualizarTodosButton.tsx
            └── CopiarButton.tsx
```

## Scripts disponíveis (frontend/)
```bash
npm run dev          # dev server
npm run build        # build de produção
npm run lint         # ESLint
npm run lint:fix     # ESLint com auto-fix
npm run typecheck    # tsc --noEmit
npm run format       # Prettier --write
npm run format:check # Prettier --check
```

## Fluxo do agente IA (4 passos)
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
| `mm_clientes` | Clientes CS com plano, status, fase, responsável |
| `mm_tarefas` | Tarefas por cliente — etapa, prazo, status, responsável |
| `relatorios_campanha` | Health score + KPIs Meta Ads por período |
| `analises_ia` | Análises IA sobre relatórios Meta Ads |
| `configuracoes` | Key-value global (ex: meta_access_token) |

## Variáveis de ambiente
`frontend/.env.local` (dev) e Vercel env vars (produção):

| Variável | Onde usar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend (público) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend (público) |
| `SUPABASE_URL` | API routes server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes server-side — **NUNCA expor no client** |
| `ANTHROPIC_API_KEY` | Edge Function Supabase (server-side only) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | API routes de Sheets (server-side only) |
| `META_ACCESS_TOKEN` | API routes de Meta Ads |
| `META_APP_ID` / `META_APP_SECRET` | API routes de Meta Ads |

## Regras
- **Nunca** expor `SUPABASE_SERVICE_ROLE_KEY` ou `ANTHROPIC_API_KEY` no frontend
- Sempre usar `NEXT_PUBLIC_SUPABASE_ANON_KEY` no lado do cliente Next.js
- Respostas da API Claude sempre em português
- Modelo fixo: `claude-sonnet-4-6`
- Auth obrigatória em todas as páginas exceto `/login`
- Constantes compartilhadas (RESPONSAVEIS, STATUS, DB) vivem em `lib/constants.ts` — **nunca redefinir localmente**
- `no-explicit-any` é **error** no ESLint — use `extractFunctionError` de `lib/error-utils.ts` para erros de Edge Function
