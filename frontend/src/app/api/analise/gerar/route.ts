/**
 * POST /api/analise/gerar
 * Body: { prestador_id: string }
 *
 * Gera análise inteligente do último relatório de campanha Meta Ads via Claude API.
 * Retorna Server-Sent Events (stream) com o JSON da análise sendo gerado.
 * Ao final, salva em analises_ia no Supabase.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { KPIsCampanha, CampanhaInsight } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtN(n: number, dec = 0) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function buildPrompt(
  prestadorNome: string,
  categoria: string,
  kpis: KPIsCampanha,
  campanhas: CampanhaInsight[],
  periodo: string,
  faseProjeto: string | null,
  plano: string | null,
  objetivo: string | null,
): string {
  const campanhasTexto = campanhas.map((c) => `
  - "${c.campaign_name}" (${c.status})
    Impressões: ${fmtN(c.impressions)} | Alcance: ${fmtN(c.reach)} | Freq: ${fmtN(c.frequency, 2)}x
    CTR: ${fmtN(c.link_ctr || c.ctr, 2)}% | CPC: ${c.cpc > 0 ? fmtBRL(c.cpc) : "—"} | CPM: ${fmtBRL(c.cpm)}
    Mensagens: ${fmtN(c.results)} | Custo/mensagem: ${c.cost_per_result > 0 ? fmtBRL(c.cost_per_result) : "—"}
    Hook Rate: ${c.hook_rate > 0 ? fmtN(c.hook_rate, 1) + "%" : "—"} | ThruPlay: ${c.thruplay > 0 ? fmtN(c.thruplay) : "—"}
    Gasto: ${fmtBRL(c.spend)}`).join("\n");

  return `Você é analista sênior de tráfego pago especializado no mercado de casamentos no Brasil.
Analise os dados abaixo e gere um diagnóstico completo e recomendações práticas.

# Cliente
Nome: ${prestadorNome}
Categoria: ${categoria}
Fase do projeto: ${faseProjeto ?? "não informado"}
Plano: ${plano ?? "não informado"}
Objetivo de campanha: ${objetivo ?? "mensagens via WhatsApp"}

# Período Analisado
${periodo}

# KPIs Consolidados
- Impressões: ${fmtN(kpis.impressions)}
- Alcance: ${fmtN(kpis.reach)}
- Frequência: ${fmtN(kpis.frequency, 2)}x
- CPM: ${fmtBRL(kpis.cpm)}
- CTR do link: ${fmtN((kpis.link_ctr || kpis.ctr), 2)}%
- Cliques no link: ${fmtN(kpis.link_clicks || kpis.clicks)}
- CPC: ${kpis.cpc > 0 ? fmtBRL(kpis.cpc) : "—"}
- Mensagens iniciadas: ${fmtN(kpis.results)}
- Custo por mensagem: ${kpis.cost_per_result > 0 ? fmtBRL(kpis.cost_per_result) : "—"}
- Gasto total: ${fmtBRL(kpis.spend)}
- ThruPlay: ${kpis.thruplay > 0 ? fmtN(kpis.thruplay) : "—"}
- Hook Rate: ${kpis.hook_rate > 0 ? fmtN(kpis.hook_rate, 1) + "%" : "—"}

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
    const body = await req.json() as { prestador_id?: string };
    const { prestador_id } = body;
    if (!prestador_id) {
      return NextResponse.json({ error: "prestador_id obrigatório" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Busca dados do prestador
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("nome_artistico, categoria")
      .eq("id", prestador_id)
      .single();

    if (!prestador) {
      return NextResponse.json({ error: "Prestador não encontrado" }, { status: 404 });
    }

    // Busca último relatório
    const { data: relatorio } = await supabase
      .from("relatorios_campanha")
      .select("*")
      .eq("prestador_id", prestador_id)
      .order("gerado_em", { ascending: false })
      .limit(1)
      .single();

    if (!relatorio) {
      return NextResponse.json({ error: "Nenhum relatório de campanha encontrado. Sincronize os dados primeiro." }, { status: 404 });
    }

    // Busca dados da entrevista (fase, plano)
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

    const kpis = relatorio.dados_json?.kpis as KPIsCampanha;
    const campanhas = (relatorio.dados_json?.campanhas ?? []) as CampanhaInsight[];
    const periodo = `${new Date(relatorio.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(relatorio.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}`;

    const prompt = buildPrompt(
      prestador.nome_artistico,
      prestador.categoria,
      kpis,
      campanhas,
      periodo,
      faseProjeto,
      plano,
      null,
    );

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Stream de volta para o cliente
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        try {
          const claudeStream = await anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of claudeStream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              fullText += chunk.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
            }
          }

          // Tenta parsear — remove markdown code fences se existirem
          let analiseJson: Record<string, unknown> = {};
          try {
            const stripped = fullText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```\s*$/, "")
              .trim();
            const jsonMatch = stripped.match(/\{[\s\S]*\}/);
            if (jsonMatch) analiseJson = JSON.parse(jsonMatch[0]);
          } catch { /* ignora parse error */ }

          if (Object.keys(analiseJson).length > 0) {
            await supabase.from("analises_ia").insert({
              prestador_id,
              relatorio_id: relatorio.id,
              dados_json: analiseJson,
              modelo_usado: "claude-sonnet-4-6",
            });
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, analise: analiseJson })}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
