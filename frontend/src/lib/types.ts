export type Categoria = "musico" | "fotografo" | "celebrante" | "dj" | "outro";

// DadosEntrevista é derivada do schema Zod — não editar manualmente.
// Fonte de verdade: src/lib/schemas.ts → entrevistaSchema
import type { EntrevistaFormData } from "./schemas";
export type DadosEntrevista = EntrevistaFormData;

// ─── Chat conversacional ───────────────────────────────────────────────────────

export type ChatTipo =
  | "geral"
  | "video_apresentacao"
  | "cta_anuncio"
  | "direcao_criativa"
  | "analise";
export type ChatStatus = "ativa" | "finalizada" | "arquivada" | "aprovada";

export interface ChatArquivo {
  nome: string;
  url: string;
  tipo: string;
  tamanho: number;
}

export interface ChatMensagem {
  id: string;
  sessao_id: string;
  role: "user" | "assistant";
  content: string;
  arquivos: ChatArquivo[];
  criado_em: string;
}

export interface ChatSessao {
  id: string;
  prestador_id: string;
  titulo: string;
  tipo: ChatTipo;
  status: ChatStatus;
  roteiro_final: Record<string, unknown> | null;
  tokens_usados: number;
  criado_em: string;
  atualizado_em: string;
}

export interface Prestador {
  id: string;
  nome_artistico: string;
  categoria: Categoria;
  whatsapp: string | null;
  email: string | null;
  cidade_base: string | null;
  instagram: string | null;
  criado_em: string;
}

export interface Entrevista {
  id: string;
  prestador_id: string;
  dados_json: DadosEntrevista;
  criado_em: string;
}

export interface AnaliseEstrategica {
  posicionamento_final: string;
  publico_alvo: string;
  nivel_mercado: string;
  diferenciais_chave: string[];
  tom_comunicacao: string;
  gatilhos_emocionais: string[];
}

export interface CenaRoteiro {
  cena: number;
  titulo: string;
  texto: string;
  legenda_sugerida: string;
  orientacao_captacao: string;
}

export interface RoteiroSugerido {
  roteiro: CenaRoteiro[];
}

export interface Anuncio {
  tipo: "emocional" | "direto" | "premium";
  copy: string;
  headline: string;
  cta: string;
}

export interface CopyAnuncios {
  anuncios: Anuncio[];
}

export interface DirecaoCena {
  tipo_cena: string;
  ambientacao: string;
  enquadramento: string;
  estilo_edicao: string;
  legenda_sugerida: string;
}

export interface DirecaoCriativa {
  direcao: DirecaoCena[];
}

export interface Roteiro {
  id: string;
  prestador_id: string;
  entrevista_id: string;
  categoria: Categoria;
  aprovado: boolean;
  analise_estrategica: AnaliseEstrategica | null;
  roteiro_sugerido: RoteiroSugerido | null;
  copy_anuncios: CopyAnuncios | null;
  direcao_criativa: DirecaoCriativa | null;
  modelo_usado: string | null;
  exemplos_fewshot_usados: number;
  criado_em: string;
}

export interface PrestadorComRoteiro extends Prestador {
  roteiros: Roteiro[];
}

// ─── Meta Ads ────────────────────────────────────────────────────────────────

export interface PrestadorMeta extends Prestador {
  meta_ad_account_id: string | null;
  meta_ultima_sync: string | null;
  meta_sync_status: "pendente" | "ok" | "erro" | null;
}

export interface CampanhaInsight {
  campaign_id: string;
  campaign_name: string;
  status: string;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  link_clicks: number;
  spend: number;
  ctr: number;
  link_ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  cost_per_result: number;
  thruplay: number;
  cost_per_thruplay: number;
  video_3s: number;
  hook_rate: number;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p100: number;
}

export interface KPIsCampanha {
  // Alcance e entrega
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number; // custo por mil impressões (R$)

  // Clique
  link_clicks: number; // inline_link_clicks — cliques no link
  link_ctr: number; // inline_link_click_ctr — CTR do link (%)
  cpc: number; // cost_per_inline_link_click (R$)

  // Resultado principal (mensagens iniciadas)
  results: number; // mensagens iniciadas
  cost_per_result: number; // custo por mensagem (R$)

  // Gasto
  spend: number; // valor gasto total (R$)

  // Vídeo
  thruplay: number; // quem assistiu 15s ou 100% do vídeo
  cost_per_thruplay: number; // R$
  video_3s: number; // visualizações de 3 segundos
  hook_rate: number; // video_3s / impressions * 100 (%)
  video_p25: number; // retenção em 25%
  video_p50: number; // retenção em 50%
  video_p75: number; // retenção em 75%
  video_p100: number; // retenção em 100%

  // Compat (mantidos para não quebrar código existente)
  clicks: number;
  ctr: number;
}

export interface ContaMeta {
  saldo: number | null;
  metodo: "cartao" | "prepago" | "outro" | null;
}

export interface DadosRelatorio {
  kpis: KPIsCampanha;
  campanhas: CampanhaInsight[];
  periodo_inicio: string;
  periodo_fim: string;
  conta?: ContaMeta;
}

export interface RelatorioCampanha {
  id: string;
  prestador_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  dados_json: DadosRelatorio;
  health_score: number | null;
  status: string;
  pdf_url: string | null;
  gerado_em: string;
}
