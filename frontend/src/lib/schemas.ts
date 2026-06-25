import { z } from "zod";

const CATEGORIAS = ["musico", "fotografo", "celebrante", "dj", "outro"] as const;

export const entrevistaSchema = z.object({
  // Básicos
  nome_artistico: z.string().min(2, "Nome artístico é obrigatório (mínimo 2 caracteres)."),
  categoria: z.enum(CATEGORIAS),
  segmento: z.string().optional(), // label exato da planilha (ex: "Músico/Banda", "Filmmaker")
  whatsapp: z.string(),
  email: z.string().refine((v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), {
    message: "E-mail inválido.",
  }),
  cidade_base: z.string(),
  instagram: z.string(),

  // Gestão interna (opcionais)
  plano: z.string().optional(),
  fase_projeto: z.string().optional(),
  responsavel_mm: z.string().optional(),
  mm_id: z.string().optional(),

  // Entrevista — campos obrigatórios
  especialidade: z.string().min(1, "Especialidade é obrigatória."),
  diferenciais: z.string().min(1, "Diferenciais são obrigatórios."),
  estilo_trabalho: z.string().min(1, "Estilo de trabalho é obrigatório."),

  // Entrevista — campos livres
  anos_experiencia: z.string(),
  preco_medio: z.string(),
  numero_casamentos: z.string(),
  formacao: z.string(),
  equipamentos: z.string(),
  depoimento_favorito: z.string(),
  momentos_especiais: z.string(),
  como_conheceu_noivos: z.string(),
  informacoes_adicionais: z.string(),
});

export type EntrevistaFormData = z.infer<typeof entrevistaSchema>;

/** Valida e retorna um mapa campo → mensagem (ou null se válido). */
export function validarEntrevista(dados: unknown): Record<string, string> | null {
  const result = entrevistaSchema.safeParse(dados);
  if (result.success) return null;
  const erros: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const campo = issue.path[0] as string;
    if (!erros[campo]) erros[campo] = issue.message;
  }
  return erros;
}

// ─── Schemas de API routes ────────────────────────────────────────────────────

export const analiseGerarSchema = z.object({
  prestador_id: z.string().min(1, "prestador_id obrigatório"),
  relatorio_id: z.string().uuid("relatorio_id inválido").optional(),
});

export const metaTokenSchema = z.object({
  token: z.string().min(1, "Token não informado."),
});

export const metaSincronizarSchema = z.object({
  prestador_id: z.string().min(1, "prestador_id obrigatório"),
  periodo_inicio: z.string().optional(),
  periodo_fim: z.string().optional(),
});

export const addTarefaSchema = z.object({
  id_cliente: z.string().min(1, "id_cliente obrigatório"),
  o_que: z.string().min(1, "O que? é obrigatório"),
  etapa: z.string().optional(),
  tipo: z.string().optional(),
  quem: z.string().optional(),
  prazo: z.string().optional(),
  status: z.string().optional(),
  observacoes: z.string().optional(),
});

export const updateTarefaSchema = z.object({
  id: z.string().min(1, "id obrigatório"),
  id_cliente: z.string().min(1, "id_cliente obrigatório"),
  o_que_original: z.string().optional(),
  prazo_original: z.string().optional(),
  etapa_original: z.string().optional(),
  check_feito: z.boolean().optional(),
  status: z.string().optional(),
  quem: z.string().optional(),
  prazo: z.string().optional(),
  etapa: z.string().optional(),
  tipo: z.string().optional(),
  observacoes: z.string().optional(),
});

export const novoClienteSchema = z.object({
  nome_empresa: z.string().min(2, "Nome da empresa é obrigatório (mínimo 2 caracteres)."),
  segmento: z.string().optional(),
  cidade: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), {
      message: "E-mail inválido.",
    }),
  plano: z.string().optional(),
  fase_projeto: z.string().optional(),
  responsavel_mm: z.string().optional(),
  observacoes: z.string().optional(),
});

const CHAT_TIPOS = [
  "geral",
  "video_apresentacao",
  "cta_anuncio",
  "direcao_criativa",
  "analise",
  "proposta_comercial",
] as const;
const CHAT_STATUS = ["ativa", "finalizada", "arquivada", "aprovada"] as const;

export const chatSessaoPostSchema = z.object({
  prestador_id: z.string().min(1, "prestador_id obrigatório"),
  titulo: z.string().optional(),
  tipo: z.enum(CHAT_TIPOS).optional(),
});

export const chatSessaoPatchSchema = z.object({
  id: z.string().min(1, "id obrigatório"),
  titulo: z.string().optional(),
  status: z.enum(CHAT_STATUS).optional(),
  roteiro_final: z.record(z.string(), z.unknown()).optional(),
  tokens_usados: z.number().optional(),
});

export const chatMensagemSchema = z.object({
  sessao_id: z.string().min(1, "sessao_id obrigatório"),
  prestador_id: z.string().min(1, "prestador_id obrigatório"),
  content: z.string().min(1, "content obrigatório"),
  arquivos: z
    .array(
      z.object({
        nome: z.string(),
        url: z.string(),
        tipo: z.string(),
        tamanho: z.number(),
      })
    )
    .optional(),
});
