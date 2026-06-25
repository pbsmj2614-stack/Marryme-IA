/* eslint-disable no-console */
/**
 * POST /api/analise/gerar
 * Body: { prestador_id: string, relatorio_id?: string }
 *
 * Gera análise inteligente do relatório de campanha Meta Ads via Claude API.
 * Retorna Server-Sent Events (stream) com o JSON da análise sendo gerado.
 * Ao final, salva em analises_ia no Supabase.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { KPIsCampanha, CampanhaInsight, ContaMeta, ConfigCampanha } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { analiseGerarSchema } from "@/lib/schemas";

const SYSTEM_PROMPT = `Você é analista sênior de tráfego pago da MarryMe, agência especializada em prestadores de casamento no Brasil.

REGRAS OBRIGATÓRIAS:
1. Clientes MarryMe usam campanhas de Mensagens com CTA WhatsApp por padrão — isso já está configurado.
2. NÃO recomende auditar objetivo da campanha, mudar para Mensagens, ou verificar botão WhatsApp UNLESS os dados indicarem claramente problema (ex: zero conversas com gasto relevante E configuração marcada como incorreta).
3. Hook rate zerado em campanha de Mensagens é LIMITAÇÃO da API Meta (ThruPlay), não necessariamente problema de criativo — use avaliacao "sem_dados" no hook_rate quando aplicável.
4. Cada recomendação e item de pauta_reuniao DEVE citar qual KPI ou dado concreto justifica a ação (CTR, CPM, frequência, CPL/mensagem, volume de conversas, campanha pausada).
5. NÃO inclua checklist genérico de setup (objetivo, WhatsApp, pixel) se a configuração já estiver correta nos dados.
6. A nota_geral (0-10) deve ser coerente com o health score automático do sistema quando fornecido.
7. pauta_reuniao: foco em mudanças acionáveis baseadas nos KPIs — máximo 6 itens, sem repetir verificações de setup já confirmadas.
8. Responda APENAS em português do Brasil.

Benchmarks nicho casamentos (referência):
- CTR link: >= 1% bom | 0,5-1% atenção | < 0,5% crítico
- CPM: <= R$ 15 bom | R$ 15-30 atenção | > R$ 30 crítico
- Frequência: <= 1,5x bom | 1,5-3x atenção | > 3x crítico
- Custo por mensagem: <= R$ 8 bom | R$ 8-15 atenção | > R$ 15 crítico`;

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtN(n: number, dec = 0) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function deriveObjetivoLabel(
  config: ConfigCampanha | undefined,
  campanhas: CampanhaInsight[]
): string {
  if (config?.todas_mensagens) {
    return "Mensagens / WhatsApp (configuração padrão MarryMe — já ativa)";
  }
  if (config?.objetivo_principal && config.objetivo_principal !== "desconhecido") {
    return config.objetivo_principal;
  }
  const first = campanhas.find((c) => c.objective)?.objective;
  return first ?? "não identificado na Meta API";
}

function buildPrompt(
  prestadorNome: string,
  categoria: string,
  kpis: KPIsCampanha,
  campanhas: CampanhaInsight[],
  periodo: string,
  faseProjeto: string | null,
  plano: string | null,
  objetivo: string,
  healthScore: number | null,
  conta: ContaMeta | undefined,
  config: ConfigCampanha | undefined
): string {
  const resultLabel =
    config?.todas_mensagens || kpis.results > 0 ? "Conversas/mensagens iniciadas" : "Resultados";
  const costLabel = config?.todas_mensagens ? "Custo por conversa" : "Custo por resultado";

  const configBlock = config
    ? `- Objetivo principal detectado: ${config.objetivo_principal}
- Todas campanhas em objetivo Mensagens/Engajamento: ${config.todas_mensagens ? "Sim" : "Não"}
- Campanhas pausadas/inativas: ${config.campanhas_pausadas.length > 0 ? config.campanhas_pausadas.join(", ") : "Nenhuma"}`
    : "- Configuração de campanha: não disponível (sync antigo)";

  const contaBlock = conta
    ? `- Método pagamento: ${conta.metodo ?? "—"}${conta.saldo != null ? ` | Saldo/teto restante: ${fmtBRL(conta.saldo)}` : ""}`
    : "- Conta Meta: saldo não disponível";

  const campanhasTexto = campanhas
    .map(
      (c) => `
  - "${c.campaign_name}" (status: ${c.effective_status ?? c.status}${c.objective ? ` | objetivo: ${c.objective}` : ""})
    Impressões: ${fmtN(c.impressions)} | Alcance: ${fmtN(c.reach)} | Freq: ${fmtN(c.frequency, 2)}x
    CTR: ${fmtN(c.link_ctr || c.ctr, 2)}% | CPC: ${c.cpc > 0 ? fmtBRL(c.cpc) : "—"} | CPM: ${fmtBRL(c.cpm)}
    ${resultLabel}: ${fmtN(c.results)} | ${costLabel}: ${c.cost_per_result > 0 ? fmtBRL(c.cost_per_result) : "—"}
    Hook Rate: ${c.hook_rate > 0 ? fmtN(c.hook_rate, 1) + "%" : "sem dados (normal em Mensagens)"} | ThruPlay: ${c.thruplay > 0 ? fmtN(c.thruplay) : "—"}
    Gasto: ${fmtBRL(c.spend)}`
    )
    .join("\n");

  return `Analise os dados abaixo e gere um diagnóstico completo e recomendações práticas.

# Cliente
Nome: ${prestadorNome}
Categoria: ${categoria}
Fase do projeto: ${faseProjeto ?? "não informado"}
Plano: ${plano ?? "não informado"}
Objetivo de campanha: ${objetivo}

# Health Score automático do sistema
${healthScore != null ? `${healthScore}/100 (use como referência para nota_geral)` : "Não calculado"}

# Configuração real da campanha (Meta API)
${configBlock}

# Conta Meta
${contaBlock}

# Período Analisado
${periodo}

# KPIs Consolidados
- Impressões: ${fmtN(kpis.impressions)}
- Alcance: ${fmtN(kpis.reach)}
- Frequência: ${fmtN(kpis.frequency, 2)}x
- CPM: ${fmtBRL(kpis.cpm)}
- CTR do link: ${fmtN(kpis.link_ctr || kpis.ctr, 2)}%
- Cliques no link: ${fmtN(kpis.link_clicks || kpis.clicks)}
- CPC: ${kpis.cpc > 0 ? fmtBRL(kpis.cpc) : "—"}
- ${resultLabel}: ${fmtN(kpis.results)}
- ${costLabel}: ${kpis.cost_per_result > 0 ? fmtBRL(kpis.cost_per_result) : "—"}
- Gasto total: ${fmtBRL(kpis.spend)}
- ThruPlay: ${kpis.thruplay > 0 ? fmtN(kpis.thruplay) : "—"}
- Hook Rate: ${kpis.hook_rate > 0 ? fmtN(kpis.hook_rate, 1) + "%" : "sem dados (normal em campanhas de Mensagens)"}

# Campanhas Individuais (${campanhas.length} campanha${campanhas.length !== 1 ? "s" : ""})
${campanhasTexto || "Nenhum dado por campanha disponível."}

---
Responda APENAS com um JSON válido (sem markdown, sem explicação fora do JSON) com a seguinte estrutura:

{
  "resumo_executivo": "2-3 parágrafos com diagnóstico geral, principais pontos positivos e alertas críticos",
  "nota_geral": <número de 0 a 10>,
  "analise_kpis": {
    "ctr": { "valor": <número>, "avaliacao": "bom|atencao|critico", "comentario": "..." },
    "cpm": { "valor": <número>, "avaliacao": "bom|atencao|critico", "comentario": "..." },
    "frequencia": { "valor": <número>, "avaliacao": "bom|atencao|critico", "comentario": "..." },
    "custo_por_resultado": { "valor": <número ou null>, "avaliacao": "bom|atencao|critico", "comentario": "..." },
    "hook_rate": { "valor": <número ou null>, "avaliacao": "bom|atencao|critico|sem_dados", "comentario": "..." }
  },
  "analise_campanhas": [
    {
      "nome": "...",
      "status": "destaque|ok|problema",
      "comentario": "...",
      "acao_sugerida": "manter|otimizar|pausar|escalar"
    }
  ],
  "diagnostico": {
    "pontos_fortes": ["...", "..."],
    "pontos_fracos": ["...", "..."],
    "oportunidades": ["...", "..."],
    "riscos": ["...", "..."]
  },
  "recomendacoes": [
    {
      "prioridade": "alta|media|baixa",
      "titulo": "...",
      "descricao": "...",
      "impacto_esperado": "..."
    }
  ],
  "pauta_reuniao": [
    "Ponto 1: ...",
    "Ponto 2: ..."
  ],
  "proximos_passos": [
    { "prazo": "imediato|esta_semana|este_mes", "acao": "..." }
  ],
  "mensagem_para_cliente": "Mensagem curta e motivadora (2-3 frases) para compartilhar com o cliente sobre os resultados"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const parsed = analiseGerarSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    const { prestador_id, relatorio_id: relatorioIdParam } = parsed.data;

    const supabase = supabaseAdmin();

    const { data: prestador } = await supabase
      .from("prestadores")
      .select("nome_artistico, categoria")
      .eq("id", prestador_id)
      .single();

    if (!prestador) {
      return NextResponse.json({ error: "Prestador não encontrado" }, { status: 404 });
    }

    let relatorioQuery = supabase
      .from("relatorios_campanha")
      .select("*")
      .eq("prestador_id", prestador_id);

    if (relatorioIdParam) {
      relatorioQuery = relatorioQuery.eq("id", relatorioIdParam);
    } else {
      relatorioQuery = relatorioQuery.order("gerado_em", { ascending: false }).limit(1);
    }

    const { data: relatorio } = await relatorioQuery.single();

    if (!relatorio) {
      return NextResponse.json(
        {
          error: relatorioIdParam
            ? "Relatório não encontrado para este prestador."
            : "Nenhum relatório de campanha encontrado. Sincronize os dados primeiro.",
        },
        { status: 404 }
      );
    }

    const { data: entrevista } = await supabase
      .from("entrevistas")
      .select("dados_json")
      .eq("prestador_id", prestador_id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();

    const dadosEntrevista = entrevista?.dados_json as Record<string, string> | null;
    const faseProjeto = dadosEntrevista?.fase_projeto ?? null;
    const plano = dadosEntrevista?.plano ?? null;

    const dadosJson = relatorio.dados_json as {
      kpis?: KPIsCampanha;
      campanhas?: CampanhaInsight[];
      conta?: ContaMeta;
      config_campanha?: ConfigCampanha;
    };
    const kpis = dadosJson?.kpis as KPIsCampanha;
    const campanhas = (dadosJson?.campanhas ?? []) as CampanhaInsight[];
    const conta = dadosJson?.conta;
    const config = dadosJson?.config_campanha;
    const objetivo = deriveObjetivoLabel(config, campanhas);
    const periodo = `${new Date(relatorio.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(relatorio.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}`;

    const prompt = buildPrompt(
      prestador.nome_artistico,
      prestador.categoria,
      kpis,
      campanhas,
      periodo,
      faseProjeto,
      plano,
      objetivo,
      relatorio.health_score,
      conta,
      config
    );

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        const heartbeatId = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            /* stream já fechado */
          }
        }, 20_000);

        try {
          const claudeStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of claudeStream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              fullText += chunk.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
              );
            }
          }

          console.log(
            `[analise/gerar] fullText length: ${fullText.length}, preview: ${fullText.slice(0, 120)}`
          );
          let analiseJson: Record<string, unknown> = {};
          let parseError: string | null = null;
          try {
            const stripped = fullText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```\s*$/, "")
              .trim();
            const jsonMatch = stripped.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analiseJson = JSON.parse(jsonMatch[0]);
            } else {
              parseError = `Nenhum JSON encontrado na resposta (${fullText.length} chars). Início: ${fullText.slice(0, 80)}`;
            }
          } catch (e) {
            parseError = `Erro ao parsear JSON: ${e instanceof Error ? e.message : String(e)}`;
          }

          if (parseError) {
            console.error("[analise/gerar] parse error:", parseError);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: parseError })}\n\n`)
            );
            return;
          }

          if (Object.keys(analiseJson).length > 0) {
            await supabase.from("analises_ia").insert({
              prestador_id,
              relatorio_id: relatorio.id,
              dados_json: analiseJson,
              modelo_usado: "claude-sonnet-4-6",
            });
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, analise: analiseJson })}\n\n`)
          );
        } catch (err) {
          console.error("[analise/gerar] erro durante stream:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        } finally {
          clearInterval(heartbeatId);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[analise/gerar] erro pré-stream:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
