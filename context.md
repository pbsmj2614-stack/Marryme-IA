# MarryMe IA — Contexto do Projeto

## Estrutura de Pastas

```
MarryMeIA_claude/
├── backend/                    ← Script Python de processamento com Gemini
│   ├── MarryMeIA.py            ← Pipeline principal (estratégia → roteiro → ads)
│   ├── requirements.txt        ← Dependências Python
│   ├── credenciais.json        ← Service Account Google (não commitar)
│   ├── .env.example            ← Template de variáveis (copie para .env)
│   ├── data/
│   │   └── cliente_exemplo.json ← JSON de entrada do cliente
│   ├── outputs/                ← Resultados gerados (gitignored)
│   └── prompts/                ← Arquivos de prompt para cada etapa
│       ├── INSTRUCOES_MARRYME.md
│       ├── prompt_estrategia.txt
│       ├── prompt_roteiro.txt
│       ├── prompt_ads.txt
│       └── prompt_direcao.txt
│
├── frontend/                   ← Aplicação web Next.js 14 (App Router)
│   ├── src/
│   │   ├── app/                ← Páginas e API Routes
│   │   │   ├── api/sheets/     ← Endpoints de escrita no Google Sheets
│   │   │   │   ├── add-tarefa/     ← POST: adiciona tarefa no Sheets + Supabase
│   │   │   │   └── novo-cliente/   ← POST: cadastra cliente (duplica aba modelo)
│   │   │   ├── dashboard/      ← Dashboard BI com métricas e health score
│   │   │   ├── daily/          ← Visão diária de tarefas
│   │   │   ├── login/          ← Autenticação via Supabase Auth
│   │   │   ├── novo-cliente/   ← Formulário de cadastro de cliente
│   │   │   ├── pipeline/       ← Kanban / pipeline de prestadores
│   │   │   └── prestador/[id]/ ← Perfil + roteiros do prestador
│   │   ├── components/         ← Componentes React reutilizáveis
│   │   └── lib/                ← Utilitários e integrações
│   │       ├── supabase.ts         ← Client-side Supabase
│   │       ├── supabase-server.ts  ← Server-side Supabase
│   │       ├── sheets.ts           ← Leitura do Google Sheets (API Key pública)
│   │       ├── importSheets.ts     ← Importa planilha → Supabase
│   │       ├── healthScore.ts      ← Cálculo do score de saúde do cliente
│   │       ├── exportDocx.ts       ← Exportação de roteiros para .docx
│   │       └── types.ts            ← Tipos TypeScript compartilhados
│   ├── .env.local              ← Variáveis (NEXT_PUBLIC_* e server-side)
│   ├── middleware.ts            ← Proteção de rotas (requer login)
│   └── package.json
│
├── supabase/                   ← Infraestrutura Supabase
│   ├── functions/
│   │   └── gerar-roteiro/      ← Edge Function: chama Claude para gerar conteúdo
│   │       ├── index.ts
│   │       └── instrucoes.ts
│   ├── migrations/
│   │   └── 001_pipeline.sql    ← Schema do banco
│   ├── schema.sql              ← Schema completo
│   ├── mm_dashboard_schema.sql ← Schema do dashboard
│   └── config.toml             ← Config do Supabase CLI
│
├── .env                        ← Chaves raiz (Anthropic + Supabase)
├── .gitignore
└── context.md                  ← Este arquivo
```

## Como Rodar

### Frontend (Next.js)
```bash
cd frontend
npm install          # primeira vez
npm run dev          # http://localhost:3000
```

### Backend Python (processamento Gemini)
```bash
cd backend
pip install -r requirements.txt    # primeira vez
# Edite data/cliente_exemplo.json com os dados do cliente
# Certifique-se que .env existe com GOOGLE_API_KEY
python MarryMeIA.py
# Resultado salvo em: outputs/<nome_cliente>.json
```

### Deploy da Edge Function (Supabase)
```bash
supabase functions deploy gerar-roteiro
```

## Variáveis de Ambiente Necessárias

### frontend/.env.local
| Variável | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + leitura no banco (client-side) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth anon (client-side) |
| `SUPABASE_URL` | API routes server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações admin nas API routes |
| `NEXT_PUBLIC_SHEETS_API_KEY` | Leitura da planilha (pública) |
| `NEXT_PUBLIC_SHEETS_ID` | ID da planilha principal |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Escrita** no Sheets via API routes |

### backend/.env
| Variável | Uso |
|----------|-----|
| `GOOGLE_API_KEY` | Gemini API (obrigatório para MarryMeIA.py) |

## Fluxo de Dados

```
Entrevista do prestador
        ↓
  MarryMeIA.py (Gemini)
        ↓
  outputs/*.json
        ↓
  (ou via web app)
  Supabase Edge Function (Claude)
        ↓
  tabela: roteiros
        ↓
  Dashboard frontend
```

## Banco de Dados (Supabase)

Tabelas principais:
- `prestadores` — cadastro de fotógrafos, músicos, DJs, etc.
- `entrevistas` — dados brutos da entrevista (JSON)
- `roteiros` — output do Claude (análise, roteiro, ads, direção)
- `mm_clientes` — clientes do lado gestão (espelhado do Sheets)
- `mm_tarefas` — tarefas importadas do Google Sheets
