export type Categoria = "musico" | "fotografo" | "celebrante" | "dj" | "outro";

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

export interface DadosEntrevista {
  // Dados básicos
  nome_artistico: string;
  categoria: Categoria;
  whatsapp: string;
  email: string;
  cidade_base: string;
  instagram: string;

  // Gestão interna (opcionais para compatibilidade retroativa)
  plano?: string;
  fase_projeto?: string;
  responsavel_mm?: string;
  mm_id?: string; // ID gerado na planilha Google Sheets (ex: MM001)

  // Dados da entrevista
  anos_experiencia: string;
  especialidade: string;
  preco_medio: string;
  numero_casamentos: string;
  formacao: string;
  equipamentos: string;
  diferenciais: string;
  estilo_trabalho: string;
  depoimento_favorito: string;
  momentos_especiais: string;
  como_conheceu_noivos: string;
  informacoes_adicionais: string;
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
  clicks: number;
  spend: number;
  ctr: number;        // %
  cpm: number;        // R$
  frequency: number;
  results: number;
  cost_per_result: number;
}

export interface KPIsCampanha {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpm: number;
  frequency: number;
  results: number;
  cost_per_result: number;
}

export interface DadosRelatorio {
  kpis: KPIsCampanha;
  campanhas: CampanhaInsight[];
  periodo_inicio: string;
  periodo_fim: string;
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
