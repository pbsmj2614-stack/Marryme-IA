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
import type { KPIsCampanha, CampanhaInsight, AnuncioInsight, ContaMeta, ConfigCampanha } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { analiseGerarSchema } from "@/lib/schemas";

const SYSTEM_PROMPT = `Você é analista sênior de tráfego pago da MarryMe, agência especializada em prestadores de casamento no Brasil.

REGRAS OBRIGATÓRIAS:
1. O objetivo operacional padrão da MarryMe é gerar leads/conversas qualificadas no WhatsApp. NÃO trate "usar WhatsApp", "mudar para Mensagens/Leads", "verificar botão WhatsApp" ou "auditar objetivo" como recomendação, exceto se setup_whatsapp_confirmado=false e houver zero leads/conversas com gasto relevante.
2. A análise deve ser um RELATÓRIO DE DECISÃO SEMANAL, não checklist genérico. Priorize funil, criativos, CPL/conversa, volume, CTR, retenção de vídeo, concentração de verba e velocidade comercial no WhatsApp.
3. Sempre identifique o gargalo do funil: impressões → cliques → leads/conversas. Se CTR baixo e conversão clique→lead boa, o problema é topo do funil/gancho, não formulário/WhatsApp.
4. Cada recomendação e item de pauta_reuniao DEVE citar um KPI ou dado concreto (CPL, leads, CTR, cliques, conversão clique→lead, verba por criativo, retenção, frequência).
5. Hook rate/retenção zerados em campanhas de Mensagens pode ser limitação da API Meta; use "sem_dados" quando aplicável.
6. A nota_geral (0-10) deve ser coerente com o health score automático do sistema quando fornecido.
7. pauta_reuniao: máximo 5 itens, sem repetir recomendações. Deve virar agenda operacional para CS.
8. Responda APENAS em português do Brasil.

Benchmarks nicho casamentos (referência):
- CPL/conversa WhatsApp: <= R$ 8 ótimo | R$ 8-15 bom | R$ 15-28 atenção | > R$ 28 crítico
- CTR link: >= 1,5% bom | 0,8-1,5% atenção | < 0,8% gargalo de topo
- Conversão clique→lead: >= 15% forte | 8-15% ok | < 8% gargalo pós-clique
- Frequência: <= 2,0x saudável | 2,0-3,0x atenção | > 3,0x saturação`;

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtN(n: number, dec = 0) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pct(n: number): string {
  return `${fmtN(n, 1)}%`;
}

function clickToLeadRate(clicks: number, results: number): number {
  return clicks > 0 ? (results / clicks) * 100 : 0;
}

function isWhatsappLeadsSetup(config: ConfigCampanha | undefined, campanhas: CampanhaInsight[]): boolean {
  if (config?.setup_whatsapp_confirmado || config?.objetivo_operacional === "whatsapp_leads") return true;
  return campanhas.some((c) => {
    const haystack = `${c.campaign_name} ${c.objective ?? ""}`.toUpperCase();
    return c.results > 0 || /(MSG|MENSAGEM|WHATS|WHATSAPP|FORM|LEAD|CADASTRO)/.test(haystack);
  });
}

function deriveObjetivoLabel(
  config: ConfigCampanha | undefined,
  campanhas: CampanhaInsight[]
): string {
  if (isWhatsappLeadsSetup(config, campanhas)) {
    return "Leads/conversas no WhatsApp (objetivo operacional padrão MarryMe)";
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
  anuncios: AnuncioInsight[],
  periodo: string,
  faseProjeto: string | null,
  plano: string | null,
  objetivo: string,
  healthScore: number | null,
  conta: ContaMeta | undefined,
  config: ConfigCampanha | undefined
): string {
  const setupWhatsappConfirmado = isWhatsappLeadsSetup(config, campanhas);
  const resultLabel = "Leads/conversas WhatsApp";
  const costLabel = "CPL/custo por conversa";
  const ctr = kpis.link_ctr || kpis.ctr;
  const clicks = kpis.link_clicks || kpis.clicks;
  const clickLeadRate = clickToLeadRate(clicks, kpis.results);

  const configBlock = config
    ? `- Objetivo principal detectado: ${config.objetivo_principal}
- Objetivo operacional MarryMe: ${config.objetivo_operacional ?? "indeterminado"}
- Setup WhatsApp/leads confirmado: ${setupWhatsappConfirmado ? "Sim" : "Não/indeterminado"}
- Todas campanhas compatíveis com leads/conversas: ${config.todas_mensagens ? "Sim" : "Não/indeterminado"}
- Campanhas pausadas/inativas: ${config.campanhas_pausadas.length > 0 ? config.campanhas_pausadas.join(", ") : "Nenhuma"}`
    : `- Configuração de campanha: não disponível (sync antigo)
- Setup WhatsApp/leads inferido por dados: ${setupWhatsappConfirmado ? "Sim" : "Não/indeterminado"}`;

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

  const anunciosOrdenados = [...anuncios]
    .sort((a, b) => b.results - a.results || a.cost_per_result - b.cost_per_result || b.spend - a.spend)
    .slice(0, 8);

  const anunciosTexto = anunciosOrdenados
    .map(
      (a) => `
  - "${a.ad_name || a.ad_id}" | Campanha: "${a.campaign_name}"
    Leads/conversas: ${fmtN(a.results)} | CPL/conversa: ${a.cost_per_result > 0 ? fmtBRL(a.cost_per_result) : "—"} | Gasto: ${fmtBRL(a.spend)}
    Impressões: ${fmtN(a.impressions)} | Cliques: ${fmtN(a.link_clicks || a.clicks)} | CTR: ${pct(a.link_ctr || a.ctr)}
    Conversão clique→lead: ${pct(clickToLeadRate(a.link_clicks || a.clicks, a.results))}
    Retenção: 25% ${fmtN(a.video_p25)} | 50% ${fmtN(a.video_p50)} | 75% ${fmtN(a.video_p75)} | 95% ${fmtN(a.video_p100)} | ThruPlay ${fmtN(a.thruplay)}`
    )
    .join("\n");

  const funilBlock = `- Impressões: ${fmtN(kpis.impressions)}
- Cliques no link: ${fmtN(clicks)}
- CTR do link: ${pct(ctr)}
- Leads/conversas: ${fmtN(kpis.results)}
- Conversão clique→lead/conversa: ${pct(clickLeadRate)}
- CPL/custo por conversa: ${kpis.cost_per_result > 0 ? fmtBRL(kpis.cost_per_result) : "—"}
- Gasto total: ${fmtBRL(kpis.spend)}`;

  return `Analise os dados abaixo e gere um relatório de decisão semanal no padrão MarryMe.
Premissa: o objetivo do trabalho é gerar leads/conversas qualificadas no WhatsApp. Não recomende mudar para WhatsApp/Leads como pauta; isso já é o objetivo operacional.

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
- Alcance: ${fmtN(kpis.reach)}
- Frequência: ${fmtN(kpis.frequency, 2)}x
- CPM: ${fmtBRL(kpis.cpm)}
- CPC: ${kpis.cpc > 0 ? fmtBRL(kpis.cpc) : "—"}
- ThruPlay: ${kpis.thruplay > 0 ? fmtN(kpis.thruplay) : "—"}
- Hook Rate: ${kpis.hook_rate > 0 ? fmtN(kpis.hook_rate, 1) + "%" : "sem dados (normal em campanhas de Mensagens)"}

# Funil Principal
${funilBlock}

# Campanhas Individuais (${campanhas.length} campanha${campanhas.length !== 1 ? "s" : ""})
${campanhasTexto || "Nenhum dado por campanha disponível."}

# Criativos / Anúncios (${anunciosOrdenados.length} anúncio${anunciosOrdenados.length !== 1 ? "s" : ""})
${anunciosTexto || "Nenhum dado por anúncio disponível. Se não houver criativos, não invente nomes de ADs."}

---
Responda APENAS com um JSON válido (sem markdown, sem explicação fora do JSON) com a seguinte estrutura:

{
  "resumo_executivo": "2 parágrafos com diagnóstico geral no estilo relatório semanal: resultado, gargalo e decisão",
  "nota_geral": <número de 0 a 10>,
  "relatorio_decisao": {
    "destaque_semana": {
      "titulo": "...",
      "metrica": "...",
      "leitura": "..."
    },
    "funil": {
      "impressões": <número>,
      "cliques": <número>,
      "leads": <número>,
      "ctr": <número>,
      "conversao_clique_lead": <número>,
      "gargalo": "topo_do_funil|pos_clique|volume|criativo|orcamento|sem_dados",
      "leitura": "..."
    },
    "criativos": [
      {
        "nome": "...",
        "papel": "campeao|menor_custo|baixo_volume|trocar|sem_dados",
        "leads": <número>,
        "custo_por_lead": <número ou null>,
        "investimento": <número>,
        "leitura": "..."
      }
    ],
    "aprendizados": {
      "manter": ["...", "..."],
      "ajustar": ["...", "..."]
    }
  },
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
    "Ponto 1: decisão operacional com KPI concreto...",
    "Ponto 2: ..."
  ],
  "proximos_passos": [
    { "prazo": "imediato|esta_semana|este_mes", "acao": "..." }
  ],
  "mensagem_para_cliente": "Mensagem curta e motivadora (2-3 frases) para compartilhar com o cliente sobre os resultados"
}`;
}

function normalizeIdea(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericSetupIdea(value: string): boolean {
  const v = normalizeIdea(value);
  return (
    /mudar|alterar|trocar|verificar|auditar|configurar|revisar/.test(v) &&
    /(objetivo|mensagens|leads|whatsapp|botao|cta|pixel)/.test(v)
  );
}

function dedupeStrings(items: string[], blockSetup: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalizeIdea(item).slice(0, 90);
    if (!key || seen.has(key)) continue;
    if (blockSetup && isGenericSetupIdea(item)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sanitizeAnalise(
  raw: Record<string, unknown>,
  setupWhatsappConfirmado: boolean
): Record<string, unknown> {
  const analise = { ...raw };

  if (Array.isArray(analise.pauta_reuniao)) {
    analise.pauta_reuniao = dedupeStrings(
      analise.pauta_reuniao.filter((x): x is string => typeof x === "string"),
      setupWhatsappConfirmado
    ).slice(0, 5);
  }

  if (Array.isArray(analise.recomendacoes)) {
    const seen = new Set<string>();
    analise.recomendacoes = analise.recomendacoes.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const rec = item as { titulo?: unknown; descricao?: unknown };
      const text = `${String(rec.titulo ?? "")} ${String(rec.descricao ?? "")}`;
      const key = normalizeIdea(text).slice(0, 90);
      if (!key || seen.has(key)) return false;
      if (setupWhatsappConfirmado && isGenericSetupIdea(text)) return false;
      seen.add(key);
      return true;
    });
  }

  if (Array.isArray(analise.proximos_passos)) {
    const seen = new Set<string>();
    analise.proximos_passos = analise.proximos_passos.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const step = item as { acao?: unknown };
      const text = String(step.acao ?? "");
      const key = normalizeIdea(text).slice(0, 90);
      if (!key || seen.has(key)) return false;
      if (setupWhatsappConfirmado && isGenericSetupIdea(text)) return false;
      seen.add(key);
      return true;
    });
  }

  return analise;
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
      anuncios?: AnuncioInsight[];
      conta?: ContaMeta;
      config_campanha?: ConfigCampanha;
    };
    const kpis = dadosJson?.kpis as KPIsCampanha;
    const campanhas = (dadosJson?.campanhas ?? []) as CampanhaInsight[];
    const anuncios = (dadosJson?.anuncios ?? []) as AnuncioInsight[];
    const conta = dadosJson?.conta;
    const config = dadosJson?.config_campanha;
    const objetivo = deriveObjetivoLabel(config, campanhas);
    const setupWhatsappConfirmado = isWhatsappLeadsSetup(config, campanhas);
    const periodo = `${new Date(relatorio.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(relatorio.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}`;

    const prompt = buildPrompt(
      prestador.nome_artistico,
      prestador.categoria,
      kpis,
      campanhas,
      anuncios,
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
            analiseJson = sanitizeAnalise(analiseJson, setupWhatsappConfirmado);
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
