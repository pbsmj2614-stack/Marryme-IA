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

  // CTR component (max 40 pts)
  const ctr = kpis.ctr ?? 0;
  if (ctr >= 2.0)      score += 40;
  else if (ctr >= 1.0) score += 30;
  else if (ctr >= 0.5) score += 18;
  else if (ctr >= 0.2) score += 8;
  // else 0

  // Frequency component (max 30 pts) — menor é melhor
  const freq = kpis.frequency ?? 0;
  if (freq <= 1.5)      score += 30;
  else if (freq <= 2.5) score += 22;
  else if (freq <= 3.5) score += 14;
  else if (freq <= 5.0) score += 6;
  // else 0

  // CPM component (max 30 pts) — menor é melhor (R$)
  const cpm = kpis.cpm ?? 0;
  if (cpm > 0 && cpm <= 10)       score += 30;
  else if (cpm <= 20)              score += 22;
  else if (cpm <= 35)              score += 14;
  else if (cpm <= 50)              score += 6;
  // else 0

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

    // ── 1. KPIs consolidados da conta ──────────────────────────────────────────
    const kpisRaw = await metaGet(`/act_${accountId}/insights`, {
      fields: "impressions,reach,clicks,spend,actions,ctr,cpm,frequency,cost_per_result",
      time_range: timeRange,
    }) as { data?: Array<Record<string, string>> };

    const kpisData = kpisRaw.data?.[0] ?? {};

    function extractResults(actions?: Array<{ action_type: string; value: string }>): number {
      if (!actions) return 0;
      const resultTypes = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
      for (const t of resultTypes) {
        const found = actions.find((a) => a.action_type === t);
        if (found) return parseFloat(found.value) || 0;
      }
      // Fallback: soma de todas as conversões
      return actions
        .filter((a) => a.action_type.includes("conversion") || a.action_type.includes("lead"))
        .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
    }

    const kpis: KPIsCampanha = {
      impressions:       parseFloat(kpisData.impressions ?? "0"),
      reach:             parseFloat(kpisData.reach ?? "0"),
      clicks:            parseFloat(kpisData.clicks ?? "0"),
      spend:             parseFloat(kpisData.spend ?? "0"),
      ctr:               parseFloat(kpisData.ctr ?? "0"),
      cpm:               parseFloat(kpisData.cpm ?? "0"),
      frequency:         parseFloat(kpisData.frequency ?? "0"),
      results:           extractResults(kpisData.actions as unknown as Array<{ action_type: string; value: string }>),
      cost_per_result:   parseFloat(kpisData.cost_per_result ?? "0"),
    };

    // ── 2. Insights por campanha ───────────────────────────────────────────────
    const campanhasRaw = await metaGet(`/act_${accountId}/insights`, {
      fields: "campaign_id,campaign_name,impressions,reach,clicks,spend,actions,ctr,cpm,frequency,cost_per_result",
      level: "campaign",
      time_range: timeRange,
    }) as { data?: Array<Record<string, string>> };

    const campanhas: CampanhaInsight[] = (campanhasRaw.data ?? []).map((c) => ({
      campaign_id:      c.campaign_id ?? "",
      campaign_name:    c.campaign_name ?? "",
      status:           "ACTIVE",
      impressions:      parseFloat(c.impressions ?? "0"),
      reach:            parseFloat(c.reach ?? "0"),
      clicks:           parseFloat(c.clicks ?? "0"),
      spend:            parseFloat(c.spend ?? "0"),
      ctr:              parseFloat(c.ctr ?? "0"),
      cpm:              parseFloat(c.cpm ?? "0"),
      frequency:        parseFloat(c.frequency ?? "0"),
      results:          extractResults(c.actions as unknown as Array<{ action_type: string; value: string }>),
      cost_per_result:  parseFloat(c.cost_per_result ?? "0"),
    }));

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
