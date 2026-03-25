import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";
import { INSTRUCOES_MARRYME } from "./instrucoes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Secao = "analise_estrategica" | "roteiro_sugerido" | "copy_anuncios" | "direcao_criativa";

const SECOES_VALIDAS: Secao[] = [
  "analise_estrategica",
  "roteiro_sugerido",
  "copy_anuncios",
  "direcao_criativa",
];

// ─── Foco por categoria ──────────────────────────────────────────────────────

const FOCO_CATEGORIA: Record<string, string> = {
  musico:         "Foco: atmosfera sonora, emoção ao vivo, memória afetiva que a música cria.",
  fotografo:      "Foco: olhar único, eternizar detalhes efêmeros, narrativa visual que o cliente não viu na hora.",
  celebrante:     "Foco: presença, condução personalizada, como a cerimônia refletiu a personalidade do casal.",
  dj:             "Foco: energia, leitura de pista, transições que definem o ritmo emocional da festa.",
  cerimonialista: "Foco: organização invisível, experiência dos convidados, o que aconteceu nos bastidores.",
};

function getFocoCategoria(categoria: string): string {
  return FOCO_CATEGORIA[categoria] ?? "Foco: autoridade construída na prática e conexão emocional genuína com os noivos.";
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const PROMPT_ESTRATEGIA = `Você é estrategista de marketing de casamentos no Brasil.
{{FOCO}}

Analise o profissional e retorne JSON com os campos abaixo.

Regras:
- Use dados reais da entrevista — cite números, lugares ou histórias concretas
- Proibido: "profissional dedicado", "amor pelo que faz", "comprometido com excelência" e similares
- Campos de texto: máximo 2 frases diretas
- diferenciais_chave e gatilhos_emocionais: máximo 4 itens de 1 frase cada

Retorne JSON válido. Nenhum texto fora do JSON.
Campos: posicionamento_final, publico_alvo, nivel_mercado, diferenciais_chave (array), tom_comunicacao, gatilhos_emocionais (array)

ENTREVISTA:
{{CLIENTE}}`;

const PROMPT_ROTEIRO = `Crie roteiro de vídeo de 5 cenas para o profissional abaixo.
{{FOCO}}

Regras:
- Linguagem falada, jamais narrada ou corporativa
- Cite nome, número, lugar ou história real da entrevista em ao menos 3 cenas
- Proibido expressões genéricas ou frases motivacionais
- "texto": máximo 3 parágrafos curtos separados por \\n\\n
- "legenda_sugerida": 1 frase
- "orientacao_captacao": 1 frase objetiva

Cenas: 1-Hook emocional, 2-Apresentação+autoridade, 3-Diferenciais reais, 4-Forma de trabalho, 5-Encerramento+CTA

Retorne JSON válido. Nenhum texto fora do JSON.
Campos por cena: cena (int), titulo, texto, legenda_sugerida, orientacao_captacao

DADOS:
{{DADOS}}`;

const PROMPT_ADS = `Crie 3 anúncios Meta Ads para o profissional abaixo.

Regras:
- Ancore cada anúncio em um dado concreto da análise (número, diferencial real, história)
- Proibido linguagem genérica ou corporativa
- "headline": 1 frase impactante
- "copy": máximo 4 linhas de texto corrido, sem bullets
- "cta": máximo 5 palavras

Variações: emocional, direto, premium

Retorne JSON válido. Nenhum texto fora do JSON.
Campos por anúncio: tipo, headline, copy, cta

DADOS:
{{DADOS}}`;

const PROMPT_DIRECAO = `Crie exatamente 3 sugestões de direção criativa para vídeos do profissional abaixo.
{{FOCO}}

Regras:
- Cada sugestão deve ser específica para o perfil real — sem cenas genéricas de casamento
- Cada campo (ambientacao, enquadramento, estilo_edicao, legenda_sugerida): máximo 2 linhas
- Array "direcao" com exatamente 3 itens

Retorne JSON válido. Nenhum texto fora do JSON.
Campos por sugestão: tipo_cena, ambientacao, enquadramento, estilo_edicao, legenda_sugerida

DADOS:
{{DADOS}}`;

// max_tokens por seção — evita desperdício
const MAX_TOKENS: Record<Secao, number> = {
  analise_estrategica: 700,
  roteiro_sugerido:    2048,
  copy_anuncios:       900,
  direcao_criativa:    700,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrai JSON de uma resposta do Claude — suporta fences e texto puro */
function extrairJSON(texto: string): unknown {
  const match = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = match ? match[1].trim() : texto.trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON inválido retornado pelo modelo:\n${raw.slice(0, 300)}`);
  }
}

async function chamarClaude(
  client: Anthropic,
  prompt: string,
  maxTokens: number,
  system?: string,
): Promise<unknown> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) params.system = system;

  const response = await client.messages.create(params);
  const texto = (response.content[0] as Anthropic.TextBlock).text;
  return extrairJSON(texto);
}

/** Monta system prompt combinando instruções fixas + few-shot da categoria */
function buildSystemPrompt(
  exemplos: Record<string, unknown>[],
  categoria: string,
  campo: Secao | "completo",
): string {
  const blocos: string[] = [INSTRUCOES_MARRYME];

  if (exemplos.length > 0) {
    const exemplosStr = exemplos
      .map((e, i) => {
        const dados =
          campo === "completo"
            ? {
                analise_estrategica: e.analise_estrategica,
                roteiro_sugerido: e.roteiro_sugerido,
                copy_anuncios: e.copy_anuncios,
                direcao_criativa: e.direcao_criativa,
              }
            : { [campo]: e[campo] };
        return `--- EXEMPLO APROVADO ${i + 1} ---\n${JSON.stringify(dados, null, 2)}`;
      })
      .join("\n\n");

    blocos.push(
      `\n${exemplos.length} roteiro(s) aprovado(s) pela equipe MarryMe para categoria "${categoria}":\n\n${exemplosStr}\n\nSiga o mesmo nível de qualidade e especificidade. Adapte para o novo perfil — não copie.`,
    );
  }

  return blocos.join("\n\n---\n\n");
}

function errResponse(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { entrevista_id, secao, roteiro_id } = await req.json() as {
      entrevista_id?: string;
      secao?: string;
      roteiro_id?: string;
    };

    if (!entrevista_id) return errResponse("entrevista_id é obrigatório", 400);
    if (secao && !SECOES_VALIDAS.includes(secao as Secao)) return errResponse("Seção inválida", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    // ── 1. Buscar entrevista + prestador ─────────────────────────────────────
    const { data: entrevista, error: errEntrevista } = await supabase
      .from("entrevistas")
      .select("*, prestadores(*)")
      .eq("id", entrevista_id)
      .single();

    if (errEntrevista || !entrevista) return errResponse("Entrevista não encontrada", 404);

    const dadosCliente = entrevista.dados_json;
    const prestador = entrevista.prestadores;
    const categoria = prestador.categoria as string;
    const foco = getFocoCategoria(categoria);

    // ── 2. Few-shot: roteiros aprovados da mesma categoria ───────────────────
    const { data: exemplos } = await supabase
      .from("roteiros")
      .select("analise_estrategica, roteiro_sugerido, copy_anuncios, direcao_criativa")
      .eq("categoria", categoria)
      .eq("aprovado", true)
      .order("criado_em", { ascending: false })
      .limit(3);

    const listaExemplos = (exemplos ?? []) as Record<string, unknown>[];
    const exemplosUsados = listaExemplos.length;

    // ── 3A. Geração de seção única ────────────────────────────────────────────
    if (secao) {
      const secaoTyped = secao as Secao;
      console.log(`Gerando seção: ${secaoTyped}`);

      // Para seções 2-4, precisamos da análise como base
      let analiseBase: unknown = null;
      if (secaoTyped !== "analise_estrategica") {
        if (roteiro_id) {
          const { data: r } = await supabase
            .from("roteiros")
            .select("analise_estrategica")
            .eq("id", roteiro_id)
            .single();
          analiseBase = r?.analise_estrategica ?? null;
        }
        if (!analiseBase) {
          console.log("Gerando análise estratégica como base...");
          const system = buildSystemPrompt(listaExemplos, categoria, "analise_estrategica");
          analiseBase = await chamarClaude(
            anthropic,
            PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
            MAX_TOKENS.analise_estrategica,
            system,
          );
        }
      }

      const dadosStr = analiseBase ? JSON.stringify(analiseBase) : "";
      const system = buildSystemPrompt(listaExemplos, categoria, secaoTyped);

      let resultado: unknown;
      switch (secaoTyped) {
        case "analise_estrategica":
          resultado = await chamarClaude(
            anthropic,
            PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
            MAX_TOKENS.analise_estrategica,
            system,
          );
          break;
        case "roteiro_sugerido":
          resultado = await chamarClaude(
            anthropic,
            PROMPT_ROTEIRO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.roteiro_sugerido,
            system,
          );
          break;
        case "copy_anuncios":
          resultado = await chamarClaude(
            anthropic,
            PROMPT_ADS.replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.copy_anuncios,
            system,
          );
          break;
        case "direcao_criativa":
          resultado = await chamarClaude(
            anthropic,
            PROMPT_DIRECAO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.direcao_criativa,
            system,
          );
          break;
        default:
          return errResponse("Seção inválida", 400);
      }

      if (roteiro_id) {
        const { error } = await supabase
          .from("roteiros")
          .update({ [secaoTyped]: resultado })
          .eq("id", roteiro_id);
        if (error) return errResponse("Erro ao atualizar seção");
      } else {
        const insert: Record<string, unknown> = {
          prestador_id: prestador.id,
          entrevista_id,
          categoria,
          aprovado: false,
          modelo_usado: "claude-sonnet-4-6",
          exemplos_fewshot_usados: exemplosUsados,
          [secaoTyped]: resultado,
        };
        if (secaoTyped !== "analise_estrategica" && analiseBase) {
          insert.analise_estrategica = analiseBase;
        }
        const { error } = await supabase.from("roteiros").insert(insert);
        if (error) return errResponse("Erro ao salvar roteiro");
      }

      return okResponse({ ok: true });
    }

    // ── 3B. Geração completa (4 passos) ──────────────────────────────────────
    console.log("Passo 1/4: Análise estratégica...");
    const systemCompleto = buildSystemPrompt(listaExemplos, categoria, "completo");

    const analise = await chamarClaude(
      anthropic,
      PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
      MAX_TOKENS.analise_estrategica,
      systemCompleto,
    );
    const dadosStr = JSON.stringify(analise);

    console.log("Passos 2-4/4: Roteiro, anúncios e direção em paralelo...");
    const [roteiro, ads, direcao] = await Promise.all([
      chamarClaude(anthropic, PROMPT_ROTEIRO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr), MAX_TOKENS.roteiro_sugerido, systemCompleto),
      chamarClaude(anthropic, PROMPT_ADS.replace("{{DADOS}}", dadosStr), MAX_TOKENS.copy_anuncios, systemCompleto),
      chamarClaude(anthropic, PROMPT_DIRECAO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr), MAX_TOKENS.direcao_criativa, systemCompleto),
    ]);

    const { data: novoRoteiro, error: errInsert } = await supabase
      .from("roteiros")
      .insert({
        prestador_id: prestador.id,
        entrevista_id,
        categoria,
        aprovado: false,
        analise_estrategica: analise,
        roteiro_sugerido: roteiro,
        copy_anuncios: ads,
        direcao_criativa: direcao,
        modelo_usado: "claude-sonnet-4-6",
        exemplos_fewshot_usados: exemplosUsados,
      })
      .select()
      .single();

    if (errInsert) {
      console.error("Erro ao salvar roteiro:", errInsert);
      return errResponse("Erro ao salvar roteiro");
    }

    return okResponse({ roteiro: novoRoteiro });

  } catch (err) {
    console.error("Erro inesperado:", err);
    return errResponse(String(err));
  }
});
