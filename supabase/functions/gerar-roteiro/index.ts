import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Prompts ────────────────────────────────────────────────────────────────

const PROMPT_ESTRATEGIA = `Você é um estrategista de marketing especializado no mercado de casamentos no Brasil.

Analise profundamente o profissional abaixo.

Considere:
- coerência entre preço, experiência e posicionamento
- tipo de cliente que ele atrai ou deveria atrair
- diferenciais reais (não genéricos)
- contexto emocional de casamentos

Evite respostas vagas ou genéricas.

Retorne SOMENTE em JSON válido. NÃO escreva nenhum texto fora do JSON.
{
  "posicionamento_final": "",
  "publico_alvo": "",
  "nivel_mercado": "",
  "diferenciais_chave": [],
  "tom_comunicacao": "",
  "gatilhos_emocionais": []
}

CLIENTE:
{{JSON_CLIENTE}}`;

const PROMPT_ROTEIRO = `Crie um roteiro de vídeo para um profissional do mercado de casamentos.

Baseie-se em:
- storytelling emocional
- conexão com noivos
- construção de autoridade
- diferenciação clara

Estrutura obrigatória:
1. Hook emocional (chamada forte)
2. Apresentação + autoridade
3. Diferenciais reais
4. Forma de trabalho
5. Encerramento + CTA

O tom deve ser humano, envolvente e elegante.

Retorne SOMENTE em JSON válido. NÃO escreva nenhum texto fora do JSON.
{
  "roteiro": [
    {"cena": 1, "titulo": "Hook emocional", "texto": "", "legenda_sugerida": "", "orientacao_captacao": ""},
    {"cena": 2, "titulo": "Apresentação + autoridade", "texto": "", "legenda_sugerida": "", "orientacao_captacao": ""},
    {"cena": 3, "titulo": "Diferenciais reais", "texto": "", "legenda_sugerida": "", "orientacao_captacao": ""},
    {"cena": 4, "titulo": "Forma de trabalho", "texto": "", "legenda_sugerida": "", "orientacao_captacao": ""},
    {"cena": 5, "titulo": "Encerramento + CTA", "texto": "", "legenda_sugerida": "", "orientacao_captacao": ""}
  ]
}

DADOS ESTRATÉGICOS:
{{JSON_ESTRATEGICO}}`;

const PROMPT_ADS = `Crie 3 anúncios para campanhas no Meta Ads para um profissional de casamentos.

Objetivo:
- gerar leads qualificados
- atrair noivos
- destacar diferenciais

Cada anúncio deve ter: copy persuasiva, headline forte e CTA claro.

Crie 3 variações:
1. Emocional
2. Direto
3. Premium

Retorne SOMENTE em JSON válido. NÃO escreva nenhum texto fora do JSON.
{
  "anuncios": [
    {"tipo": "emocional", "copy": "", "headline": "", "cta": ""},
    {"tipo": "direto", "copy": "", "headline": "", "cta": ""},
    {"tipo": "premium", "copy": "", "headline": "", "cta": ""}
  ]
}

DADOS ESTRATÉGICOS:
{{JSON_ESTRATEGICO}}`;

const PROMPT_DIRECAO = `Sugira direção criativa para vídeos de um profissional de casamentos.

Inclua para cada sugestão:
- tipo de cena
- ambientação
- enquadramento
- estilo de edição
- sugestão de legenda

Evite respostas genéricas. Seja específico para o perfil do profissional.

Retorne SOMENTE em JSON válido. NÃO escreva nenhum texto fora do JSON.
{
  "direcao": [
    {
      "tipo_cena": "",
      "ambientacao": "",
      "enquadramento": "",
      "estilo_edicao": "",
      "legenda_sugerida": ""
    }
  ]
}

DADOS:
{{JSON_ESTRATEGICO}}`;

// ─── Helper: chama Claude e retorna JSON parseado ────────────────────────────

async function chamarClaude(
  client: Anthropic,
  prompt: string,
  systemPrompt?: string
): Promise<unknown> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages,
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await client.messages.create(params);
  const texto = (response.content[0] as Anthropic.TextBlock).text;

  // Limpar markdown code fences se presentes
  let json = texto;
  if (json.includes("```json")) {
    json = json.split("```json")[1].split("```")[0].trim();
  } else if (json.includes("```")) {
    json = json.split("```")[1].split("```")[0].trim();
  }

  return JSON.parse(json);
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { entrevista_id } = await req.json();

    if (!entrevista_id) {
      return new Response(JSON.stringify({ error: "entrevista_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clientes
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    // ── 1. Buscar entrevista ──────────────────────────────────────────────────
    const { data: entrevista, error: errEntrevista } = await supabase
      .from("entrevistas")
      .select("*, prestadores(*)")
      .eq("id", entrevista_id)
      .single();

    if (errEntrevista || !entrevista) {
      return new Response(JSON.stringify({ error: "Entrevista não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dadosCliente = entrevista.dados_json;
    const prestador = entrevista.prestadores;
    const categoria = prestador.categoria as string;

    // ── 2. Buscar few-shot (até 3 roteiros aprovados da mesma categoria) ──────
    const { data: exemplos } = await supabase
      .from("roteiros")
      .select("analise_estrategica, roteiro_sugerido, copy_anuncios, direcao_criativa")
      .eq("categoria", categoria)
      .eq("aprovado", true)
      .order("criado_em", { ascending: false })
      .limit(3);

    const exemplosUsados = exemplos?.length ?? 0;

    let systemPrompt: string | undefined;
    if (exemplos && exemplos.length > 0) {
      const exemplosStr = exemplos
        .map(
          (e, i) =>
            `--- EXEMPLO ${i + 1} APROVADO ---\n${JSON.stringify(
              {
                analise_estrategica: e.analise_estrategica,
                roteiro_sugerido: e.roteiro_sugerido,
                copy_anuncios: e.copy_anuncios,
                direcao_criativa: e.direcao_criativa,
              },
              null,
              2
            )}`
        )
        .join("\n\n");

      systemPrompt = `Você é um especialista em marketing para o mercado de casamentos no Brasil, trabalhando para a agência MarryMe.

A seguir estão ${exemplos.length} roteiro(s) aprovados pela equipe MarryMe para prestadores da categoria "${categoria}". Use-os como referência de qualidade, tom e estrutura:

${exemplosStr}

Siga o mesmo nível de qualidade e especificidade. Adapte para o perfil do novo prestador, não copie os exemplos.`;
    }

    // ── 3. Passo 1 — Análise estratégica (obrigatório primeiro) ──────────────
    console.log("Passo 1/4: Análise estratégica...");
    const promptEstrategia = PROMPT_ESTRATEGIA.replace(
      "{{JSON_CLIENTE}}",
      JSON.stringify(dadosCliente, null, 2)
    );
    const analiseEstrategica = await chamarClaude(anthropic, promptEstrategia, systemPrompt);
    const estStr = JSON.stringify(analiseEstrategica);

    // ── 4-6. Passos 2, 3, 4 em paralelo (todos dependem só do passo 1) ───────
    console.log("Passos 2-4/4: Roteiro, anúncios e direção criativa em paralelo...");
    const [roteiroSugerido, copyAnuncios, direcaoCriativa] = await Promise.all([
      chamarClaude(anthropic, PROMPT_ROTEIRO.replace("{{JSON_ESTRATEGICO}}", estStr), systemPrompt),
      chamarClaude(anthropic, PROMPT_ADS.replace("{{JSON_ESTRATEGICO}}", estStr), systemPrompt),
      chamarClaude(anthropic, PROMPT_DIRECAO.replace("{{JSON_ESTRATEGICO}}", estStr), systemPrompt),
    ]);

    // ── 7. Salvar no banco ───────────────────────────────────────────────────
    const { data: roteiro, error: errInsert } = await supabase
      .from("roteiros")
      .insert({
        prestador_id: prestador.id,
        entrevista_id,
        categoria,
        aprovado: false,
        analise_estrategica: analiseEstrategica,
        roteiro_sugerido: roteiroSugerido,
        copy_anuncios: copyAnuncios,
        direcao_criativa: direcaoCriativa,
        modelo_usado: "claude-sonnet-4-6",
        exemplos_fewshot_usados: exemplosUsados,
      })
      .select()
      .single();

    if (errInsert) {
      console.error("Erro ao salvar roteiro:", errInsert);
      return new Response(JSON.stringify({ error: "Erro ao salvar roteiro" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ roteiro }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
