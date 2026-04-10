/**
 * POST /api/meta/sincronizar
 * Body: { prestador_id: string, periodo_inicio?: string, periodo_fim?: string }
 *
 * Busca dados de campanha da Meta Marketing API para um prestador,
 * calcula o health score e salva em relatorios_campanha.
 *
 * Env necessárias:
 *   META_ACCESS_TOKEN           — User/System token com ads_read
 *   META_API_VERSION            — ex: "v18.0" (default)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CampanhaInsight, KPIsCampanha, DadosRelatorio } from "@/lib/types";

const META_VERSION = process.env.META_API_VERSION ?? "v18.0";
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`;
const META_TOKEN   = process.env.META_ACCESS_TOKEN ?? "";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.");
  return createClient(url, key);
}

// ─── Health score (0–100) ─────────────────────────────────────────────────────

function calcHealthScore(kpis: KPIsCampanha): number {
  let score = 0;

  // ── CTR do link (40 pts) ── clique efetivo no link, não apenas impressão
  const ctr = kpis.link_ctr > 0 ? kpis.link_ctr : kpis.ctr; // fallback para ctr geral
  if (ctr >= 2.0)      score += 40;
  else if (ctr >= 1.0) score += 30;
  else if (ctr >= 0.5) score += 18;
  else if (ctr >= 0.2) score += 8;
  // else 0

  // ── Frequência (20 pts) — menor é melhor (fadiga de anúncio)
  const freq = kpis.frequency ?? 0;
  if (freq <= 1.5)      score += 20;
  else if (freq <= 2.5) score += 15;
  else if (freq <= 3.5) score += 9;
  else if (freq <= 5.0) score += 4;
  // else 0

  // ── CPM (20 pts) — menor é melhor (R$, referência para casamentos BR)
  const cpm = kpis.cpm ?? 0;
  if (cpm > 0 && cpm <= 10)  score += 20;
  else if (cpm <= 20)         score += 15;
  else if (cpm <= 35)         score += 9;
  else if (cpm <= 50)         score += 4;
  // else 0

  // ── Hook Rate (20 pts) — % que assistiu 3s; só conta se houver dados de vídeo
  const hookRate = kpis.hook_rate ?? 0;
  if (hookRate > 0) {
    if (hookRate >= 20)      score += 20;
    else if (hookRate >= 12) score += 15;
    else if (hookRate >= 6)  score += 9;
    else if (hookRate >= 3)  score += 4;
    // else 0 pontos — hook rate muito baixo penaliza
  } else {
    // Sem dados de vídeo: redistribui os 20pts para CPM (campanhas de imagem)
    if (cpm > 0 && cpm <= 10)  score += 20;
    else if (cpm <= 20)         score += 15;
    else if (cpm <= 35)         score += 9;
    else if (cpm <= 50)         score += 4;
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Meta API helpers ─────────────────────────────────────────────────────────

async function metaGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", META_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = await res.json() as { error?: { message: string }; data?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`Meta API ${path}: ${json.error?.message ?? res.status}`);
  }
  return json;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!META_TOKEN) {
      return NextResponse.json({ error: "META_ACCESS_TOKEN não configurado." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.prestador_id) {
      return NextResponse.json({ error: "prestador_id obrigatório." }, { status: 400 });
    }

    const { prestador_id, periodo_inicio, periodo_fim } = body as {
      prestador_id: string;
      periodo_inicio?: string;
      periodo_fim?: string;
    };

    // Período padrão: últimos 30 dias
    const hoje = new Date();
    const inicio = periodo_inicio ?? new Date(hoje.getTime() - 30 * 86400_000)
      .toISOString().slice(0, 10);
    const fim = periodo_fim ?? hoje.toISOString().slice(0, 10);

    const supabase = supabaseAdmin();

    // Buscar ad_account_id do prestador
    const { data: prestador, error: pErr } = await supabase
      .from("prestadores")
      .select("id, nome_artistico, meta_ad_account_id")
      .eq("id", prestador_id)
      .single();

    if (pErr || !prestador) {
      return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
    }
    if (!prestador.meta_ad_account_id) {
      return NextResponse.json(
        { error: "Conta de anúncios Meta não configurada para este prestador." },
        { status: 400 }
      );
    }

    const accountId = prestador.meta_ad_account_id.replace(/^act_/, "");
    const timeRange = JSON.stringify({ since: inicio, until: fim });

    // Marca como "sincronizando"
    await supabase
      .from("prestadores")
      .update({ meta_sync_status: "sincronizando" })
      .eq("id", prestador_id);

    // Campos a buscar (conta + campanha)
    const INSIGHT_FIELDS = [
      "impressions", "reach", "frequency", "spend", "cpm",
      "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
      // Compat
      "clicks", "ctr",
      // Ações (mensagens iniciadas + conversões)
      "actions", "cost_per_action_type",
      // Vídeo
      "video_thruplay_watched_actions",
      "video_3_sec_watched_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p100_watched_actions",
    ].join(",");

    // ── 1. KPIs consolidados da conta ──────────────────────────────────────────
    const kpisRaw = await metaGet(`/act_${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      time_range: timeRange,
    }) as { data?: Array<Record<string, unknown>> };

    const kpisData = kpisRaw.data?.[0] ?? {};

    // Extrai valor de arrays de ações: [{action_type, value}]
    type ActionArr = Array<{ action_type: string; value: string }>;

    function extractAction(arr: unknown, types: string[]): number {
      const actions = arr as ActionArr | undefined;
      if (!actions?.length) return 0;
      for (const t of types) {
        const found = actions.find((a) => a.action_type === t);
        if (found) return parseFloat(found.value) || 0;
      }
      return 0;
    }

    function extractVideoAction(arr: unknown): number {
      const actions = arr as ActionArr | undefined;
      if (!actions?.length) return 0;
      return parseFloat(actions[0]?.value ?? "0") || 0;
    }

    // Mensagens iniciadas (resultado principal para casamentos com WhatsApp)
    const MESSAGE_TYPES = [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ];

    const impressions     = parseFloat(String(kpisData.impressions ?? "0"));
    const spend           = parseFloat(String(kpisData.spend       ?? "0"));
    const thruplay        = extractVideoAction(kpisData.video_thruplay_watched_actions);
    const video3s         = extractVideoAction(kpisData.video_3_sec_watched_actions);
    const results         = extractAction(kpisData.actions, MESSAGE_TYPES);
    const costPerResult   = extractAction(kpisData.cost_per_action_type, MESSAGE_TYPES);

    const kpis: KPIsCampanha = {
      // Entrega
      impressions,
      reach:             parseFloat(String(kpisData.reach       ?? "0")),
      frequency:         parseFloat(String(kpisData.frequency   ?? "0")),
      cpm:               parseFloat(String(kpisData.cpm         ?? "0")),
      // Clique
      link_clicks:       parseFloat(String(kpisData.inline_link_clicks     ?? "0")),
      link_ctr:          parseFloat(String(kpisData.inline_link_click_ctr  ?? "0")),
      cpc:               parseFloat(String(kpisData.cost_per_inline_link_click ?? "0")),
      // Resultado
      results,
      cost_per_result:   costPerResult > 0 ? costPerResult : (results > 0 ? spend / results : 0),
      // Gasto
      spend,
      // Vídeo
      thruplay,
      cost_per_thruplay: thruplay > 0 ? spend / thruplay : 0,
      video_3s:          video3s,
      hook_rate:         impressions > 0 ? (video3s / impressions) * 100 : 0,
      video_p25:         extractVideoAction(kpisData.video_p25_watched_actions),
      video_p50:         extractVideoAction(kpisData.video_p50_watched_actions),
      video_p75:         extractVideoAction(kpisData.video_p75_watched_actions),
      video_p100:        extractVideoAction(kpisData.video_p100_watched_actions),
      // Compat
      clicks:            parseFloat(String(kpisData.clicks ?? "0")),
      ctr:               parseFloat(String(kpisData.ctr   ?? "0")),
    };

    // ── 2. Insights por campanha ───────────────────────────────────────────────
    const campanhasRaw = await metaGet(`/act_${accountId}/insights`, {
      fields: "campaign_id,campaign_name," + INSIGHT_FIELDS,
      level: "campaign",
      time_range: timeRange,
    }) as { data?: Array<Record<string, unknown>> };

    const campanhas: CampanhaInsight[] = (campanhasRaw.data ?? []).map((c) => {
      const cImpressions   = parseFloat(String(c.impressions ?? "0"));
      const cSpend         = parseFloat(String(c.spend       ?? "0"));
      const cThruplay      = extractVideoAction(c.video_thruplay_watched_actions);
      const cVideo3s       = extractVideoAction(c.video_3_sec_watched_actions);
      const cResults       = extractAction(c.actions, MESSAGE_TYPES);
      const cCostPerResult = extractAction(c.cost_per_action_type, MESSAGE_TYPES);
      return {
        campaign_id:       String(c.campaign_id   ?? ""),
        campaign_name:     String(c.campaign_name ?? ""),
        status:            "ACTIVE",
        impressions:       cImpressions,
        reach:             parseFloat(String(c.reach      ?? "0")),
        frequency:         parseFloat(String(c.frequency  ?? "0")),
        clicks:            parseFloat(String(c.clicks     ?? "0")),
        link_clicks:       parseFloat(String(c.inline_link_clicks    ?? "0")),
        spend:             cSpend,
        ctr:               parseFloat(String(c.ctr        ?? "0")),
        link_ctr:          parseFloat(String(c.inline_link_click_ctr ?? "0")),
        cpc:               parseFloat(String(c.cost_per_inline_link_click ?? "0")),
        cpm:               parseFloat(String(c.cpm        ?? "0")),
        results:           cResults,
        cost_per_result:   cCostPerResult > 0 ? cCostPerResult : (cResults > 0 ? cSpend / cResults : 0),
        thruplay:          cThruplay,
        cost_per_thruplay: cThruplay > 0 ? cSpend / cThruplay : 0,
        video_3s:          cVideo3s,
        hook_rate:         cImpressions > 0 ? (cVideo3s / cImpressions) * 100 : 0,
        video_p25:         extractVideoAction(c.video_p25_watched_actions),
        video_p50:         extractVideoAction(c.video_p50_watched_actions),
        video_p75:         extractVideoAction(c.video_p75_watched_actions),
        video_p100:        extractVideoAction(c.video_p100_watched_actions),
      };
    });

    // ── 3. Calcular health score ───────────────────────────────────────────────
    const healthScore = calcHealthScore(kpis);

    const dadosJson: DadosRelatorio = {
      kpis,
      campanhas,
      periodo_inicio: inicio,
      periodo_fim: fim,
    };

    // ── 4. Salvar relatório ───────────────────────────────────────────────────
    const { data: relatorio, error: rErr } = await supabase
      .from("relatorios_campanha")
      .insert({
        prestador_id,
        periodo_inicio: inicio,
        periodo_fim:    fim,
        dados_json:     dadosJson,
        health_score:   healthScore,
        status:         "gerado",
      })
      .select()
      .single();

    if (rErr) throw new Error(`Erro ao salvar relatório: ${rErr.message}`);

    // ── 5. Atualizar prestador ─────────────────────────────────────────────────
    await supabase
      .from("prestadores")
      .update({
        meta_ultima_sync:  new Date().toISOString(),
        meta_sync_status:  "ok",
      })
      .eq("id", prestador_id);

    return NextResponse.json({
      ok:           true,
      relatorio_id: relatorio.id,
      health_score: healthScore,
      periodo:      { inicio, fim },
      kpis,
      campanhas:    campanhas.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta/sincronizar]", msg);

    // Marca como erro no prestador
    try {
      const body = await (req as NextRequest).json().catch(() => null);
      if (body?.prestador_id) {
        const supabase = supabaseAdmin();
        await supabase
          .from("prestadores")
          .update({ meta_sync_status: "erro" })
          .eq("id", body.prestador_id);
      }
    } catch { /* silencia erro secundário */ }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
