import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.36.3";
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

Retorne APENAS JSON válido, sem texto antes ou depois.
Campos: posicionamento_final, publico_alvo, nivel_mercado, diferenciais_chave (array), tom_comunicacao, gatilhos_emocionais (array)

ENTREVISTA:
{{CLIENTE}}`;

const PROMPT_ROTEIRO = `Crie roteiro de vídeo de 5 cenas para o profissional abaixo.
{{FOCO}}

Regras:
- Linguagem falada, jamais narrada ou corporativa
- Cite nome, número, lugar ou história real da entrevista em ao menos 3 cenas
- Proibido expressões genéricas ou frases motivacionais
- "texto": 2 a 3 parágrafos curtos separados por \\n\\n
- "legenda_sugerida": 1 frase
- "orientacao_captacao": 1 frase objetiva

Cenas: 1-Hook emocional, 2-Apresentação+autoridade, 3-Diferenciais reais, 4-Forma de trabalho, 5-Encerramento+CTA

Retorne APENAS JSON válido neste formato:
{ "roteiro": [ { "cena": 1, "titulo": "...", "texto": "...", "legenda_sugerida": "...", "orientacao_captacao": "..." }, ... ] }

DADOS:
{{DADOS}}`;

const PROMPT_ADS = `Crie 3 anúncios Meta Ads para o profissional abaixo.

Regras:
- Ancore cada anúncio em um dado concreto da análise (número, diferencial real, história)
- Proibido linguagem genérica ou corporativa
- "headline": 1 frase impactante
- "copy": 3 a 4 linhas de texto corrido, sem bullets
- "cta": até 5 palavras

Variações: emocional, direto, premium

Retorne APENAS JSON válido neste formato:
{ "anuncios": [ { "tipo": "emocional", "headline": "...", "copy": "...", "cta": "..." }, { "tipo": "direto", "headline": "...", "copy": "...", "cta": "..." }, { "tipo": "premium", "headline": "...", "copy": "...", "cta": "..." } ] }

DADOS:
{{DADOS}}`;

const PROMPT_DIRECAO = `Crie 3 sugestões de direção criativa para vídeos do profissional abaixo.
{{FOCO}}

Regras:
- Cada sugestão deve ser específica para o perfil real — sem cenas genéricas de casamento
- Cada campo (ambientacao, enquadramento, estilo_edicao, legenda_sugerida): 1 a 2 frases

Retorne APENAS JSON válido neste formato:
{ "direcao": [ { "tipo_cena": "...", "ambientacao": "...", "enquadramento": "...", "estilo_edicao": "...", "legenda_sugerida": "..." }, { ... }, { ... } ] }

DADOS:
{{DADOS}}`;

// ─── max_tokens calibrado por prompt ─────────────────────────────────────────
const MAX_TOKENS: Record<Secao, number> = {
  analise_estrategica: 1600,
  roteiro_sugerido:    2200,
  copy_anuncios:       1400,
  direcao_criativa:    1000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrai JSON de uma resposta do Claude — suporta fences ```json e texto puro */
function extrairJSON(texto: string): unknown {
  let json = texto.trim();

  if (json.startsWith("```json")) {
    json = json.slice(7);
    const end = json.lastIndexOf("```");
    if (end !== -1) json = json.slice(0, end);
  } else if (json.startsWith("```")) {
    json = json.slice(3);
    const end = json.lastIndexOf("```");
    if (end !== -1) json = json.slice(0, end);
  }

  json = json.trim();

  try {
    return JSON.parse(json);
  } catch {
    console.error("JSON inválido. Primeiros 400 chars:", texto.substring(0, 400));
    throw new Error(`JSON inválido retornado pelo modelo: ${texto.substring(0, 200)}`);
  }
}

/**
 * Normaliza saídas das seções garantindo os wrappers esperados pelo frontend.
 * Defesa contra Claude retornar array solto em vez do objeto com chave.
 */
function normalizarSaida(secao: Secao, dado: unknown): unknown {
  if (!dado || typeof dado !== "object") return dado;

  if (secao === "roteiro_sugerido" && Array.isArray(dado)) return { roteiro: dado };
  if (secao === "copy_anuncios" && Array.isArray(dado)) return { anuncios: dado };
  if (secao === "direcao_criativa" && Array.isArray(dado)) return { direcao: dado };

  const obj = dado as Record<string, unknown>;
  if (secao === "roteiro_sugerido" && !obj.roteiro) {
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return { roteiro: arr };
  }
  if (secao === "copy_anuncios" && !obj.anuncios) {
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return { anuncios: arr };
  }
  if (secao === "direcao_criativa" && !obj.direcao) {
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return { direcao: arr };
  }

  return dado;
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

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(params);
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    throw new Error(`Anthropic API: ${msg}`);
  }

  if (!response.content || response.content.length === 0) {
    throw new Error(`Anthropic retornou resposta vazia (stop_reason: ${response.stop_reason})`);
  }

  // Detecta truncamento antes de tentar parsear
  if (response.stop_reason === "max_tokens") {
    throw new Error(`Resposta truncada pelo modelo no prompt: ${prompt.substring(0, 80)}...`);
  }

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Anthropic retornou bloco de tipo inesperado: ${block.type}`);
  }

  return extrairJSON(block.text);
}

/** Retry com backoff exponencial para sobrecarga (529) e rate limit (429) */
async function chamarClaudeComRetry(
  client: Anthropic,
  prompt: string,
  maxTokens: number,
  system?: string,
  tentativas = 3,
): Promise<unknown> {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await chamarClaude(client, prompt, maxTokens, system);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const retentar =
        e?.message?.includes("overloaded") ||
        e?.message?.includes("529") ||
        e?.message?.includes("429") ||
        e?.status === 529 ||
        e?.status === 429;
      if (!retentar || i === tentativas - 1) throw err;
      const espera = 1000 * Math.pow(2, i + 1);
      console.log(`Tentativa ${i + 1} falhou (${e?.status ?? e?.message}). Aguardando ${espera}ms...`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw new Error("Número máximo de tentativas atingido");
}

/** Monta system prompt compacto com resumo dos exemplos aprovados */
function buildSystemPrompt(
  exemplos: Record<string, unknown>[],
  categoria: string,
): string {
  if (exemplos.length === 0) return INSTRUCOES_MARRYME;

  const exemplosStr = exemplos
    .map((e, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analise = e.analise_estrategica as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roteiro = e.roteiro_sugerido as any;
      const resumo = {
        posicionamento: analise?.posicionamento_final,
        tom: analise?.tom_comunicacao,
        diferenciais: analise?.diferenciais_chave?.slice(0, 3),
        cenas_exemplo: roteiro?.roteiro?.slice(0, 2)?.map((c: Record<string, string>) => ({
          titulo: c.titulo,
          texto: c.texto?.substring(0, 200),
        })),
      };
      return `--- EXEMPLO ${i + 1} APROVADO ---\n${JSON.stringify(resumo)}`;
    })
    .join("\n\n");

  return `${INSTRUCOES_MARRYME}

---

Especialista em marketing para casamentos no Brasil — MarryMe.

Referências aprovadas para categoria "${categoria}":
${exemplosStr}

Mantenha o mesmo nível de qualidade e especificidade. Adapte ao perfil do novo cliente.`;
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
    const systemPrompt = buildSystemPrompt(listaExemplos, categoria);

    // ── 3A. Geração de seção única ────────────────────────────────────────────
    if (secao) {
      const secaoTyped = secao as Secao;
      console.log(`Gerando seção: ${secaoTyped}`);

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
          analiseBase = await chamarClaudeComRetry(
            anthropic,
            PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
            MAX_TOKENS.analise_estrategica,
            systemPrompt,
          );
        }
      }

      const dadosStr = analiseBase ? JSON.stringify(analiseBase) : "";

      let resultado: unknown;
      switch (secaoTyped) {
        case "analise_estrategica":
          resultado = await chamarClaudeComRetry(
            anthropic,
            PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
            MAX_TOKENS.analise_estrategica,
            systemPrompt,
          );
          break;
        case "roteiro_sugerido":
          resultado = normalizarSaida("roteiro_sugerido", await chamarClaudeComRetry(
            anthropic,
            PROMPT_ROTEIRO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.roteiro_sugerido,
            systemPrompt,
          ));
          break;
        case "copy_anuncios":
          resultado = normalizarSaida("copy_anuncios", await chamarClaudeComRetry(
            anthropic,
            PROMPT_ADS.replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.copy_anuncios,
            systemPrompt,
          ));
          break;
        case "direcao_criativa":
          resultado = normalizarSaida("direcao_criativa", await chamarClaudeComRetry(
            anthropic,
            PROMPT_DIRECAO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
            MAX_TOKENS.direcao_criativa,
            systemPrompt,
          ));
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

    // ── 3B. Geração completa (4 passos sequenciais com delay) ────────────────
    console.log("Passo 1/4: Análise estratégica...");
    const analise = await chamarClaudeComRetry(
      anthropic,
      PROMPT_ESTRATEGIA.replace("{{FOCO}}", foco).replace("{{CLIENTE}}", JSON.stringify(dadosCliente, null, 2)),
      MAX_TOKENS.analise_estrategica,
      systemPrompt,
    );
    const dadosStr = JSON.stringify(analise);

    console.log("Passo 2/4: Roteiro sugerido...");
    const roteiroRaw = await chamarClaudeComRetry(
      anthropic,
      PROMPT_ROTEIRO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
      MAX_TOKENS.roteiro_sugerido,
      systemPrompt,
    );
    await new Promise((r) => setTimeout(r, 800));

    console.log("Passo 3/4: Copy de anúncios...");
    const adsRaw = await chamarClaudeComRetry(
      anthropic,
      PROMPT_ADS.replace("{{DADOS}}", dadosStr),
      MAX_TOKENS.copy_anuncios,
      systemPrompt,
    );
    await new Promise((r) => setTimeout(r, 800));

    console.log("Passo 4/4: Direção criativa...");
    const direcaoRaw = await chamarClaudeComRetry(
      anthropic,
      PROMPT_DIRECAO.replace("{{FOCO}}", foco).replace("{{DADOS}}", dadosStr),
      MAX_TOKENS.direcao_criativa,
      systemPrompt,
    );

    const roteiro = normalizarSaida("roteiro_sugerido", roteiroRaw);
    const ads     = normalizarSaida("copy_anuncios",    adsRaw);
    const direcao = normalizarSaida("direcao_criativa", direcaoRaw);

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
