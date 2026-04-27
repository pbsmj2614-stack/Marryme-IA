import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Roteiro } from "@/lib/types";
import { INSTRUCOES_MARRYME } from "./instrucoes-base";

export async function montarSystemPrompt(prestadorId: string): Promise<string> {
  const supabase = supabaseAdmin();

  const [{ data: prestador }, { data: entrevistaRow }, { data: roteiros }] = await Promise.all([
    supabase.from("prestadores").select("*").eq("id", prestadorId).single(),
    supabase
      .from("entrevistas")
      .select("dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("roteiros")
      .select("analise_estrategica, roteiro_sugerido, copy_anuncios, aprovado, criado_em")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(10),
  ]);

  if (!prestador) throw new Error("Prestador não encontrado");

  const entrevista = (entrevistaRow?.dados_json ?? {}) as Record<string, unknown>;

  const analiseAprovada =
    ((roteiros ?? []) as Roteiro[])
      .filter((r) => r.aprovado && r.analise_estrategica)
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())[0]
      ?.analise_estrategica ?? null;

  const entrevistaTexto =
    Object.keys(entrevista).length > 0
      ? Object.entries(entrevista)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join("\n")
      : "Entrevista ainda não preenchida.";

  const contextoDinamico = `

## PRESTADOR ATIVO NESTA CONVERSA

Nome artístico: ${prestador.nome_artistico}
Categoria: ${prestador.categoria}
Cidade: ${prestador.cidade_base ?? "não informada"}
Instagram: ${prestador.instagram ?? "não informado"}
WhatsApp: ${prestador.whatsapp ?? "não informado"}

## DADOS DA ENTREVISTA
${entrevistaTexto}

${
  analiseAprovada
    ? `## ANÁLISE ESTRATÉGICA APROVADA (use como referência)
Posicionamento: ${analiseAprovada.posicionamento_final}
Público-alvo: ${analiseAprovada.publico_alvo}
Nível de mercado: ${analiseAprovada.nivel_mercado}
Diferenciais: ${analiseAprovada.diferenciais_chave?.join(", ")}
Tom: ${analiseAprovada.tom_comunicacao}
Gatilhos: ${analiseAprovada.gatilhos_emocionais?.join(", ")}`
    : "## ANÁLISE ESTRATÉGICA: ainda não gerada — pode propor uma na conversa."
}

## INSTRUÇÕES DESTA SESSÃO
- Construa o material em diálogo, seção por seção
- Pergunte e valide antes de avançar para o próximo passo
- Use os dados reais do prestador acima — nunca invente informações
- Responda sempre em português brasileiro
- Se receber arquivos ou imagens, analise-os antes de prosseguir
- Ao finalizar uma seção, sinalize claramente para o usuário aprovar antes de continuar
`;

  return `${INSTRUCOES_MARRYME}\n\n${contextoDinamico}`.trim();
}
