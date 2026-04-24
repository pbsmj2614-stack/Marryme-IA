/**
 * POST /api/meta/sincronizar
 * Body: { prestador_id: string, periodo_inicio?: string, periodo_fim?: string }
 *
 * Busca dados de campanha da Meta Marketing API para um prestador,
 * calcula o health score e salva em relatorios_campanha.
 *
 * Token management:
 *   1. Lê META_ACCESS_TOKEN do Supabase (tabela configuracoes, chave "meta_access_token")
 *   2. Fallback para variável de ambiente META_ACCESS_TOKEN
 *   3. Antes de cada sync verifica expiração via /debug_token
 *   4. Se faltam < 7 dias OU token expirado, renova automaticamente com app credentials
 *   5. Salva novo token no Supabase para próximas chamadas
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { CampanhaInsight, KPIsCampanha, DadosRelatorio, ContaMeta } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

const META_VERSION = process.env.META_API_VERSION ?? "v18.0";
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;
const META_APP_ID = process.env.META_APP_ID ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

// ─── Token dinâmico (Supabase → env fallback) ─────────────────────────────────

async function getTokenFromDB(supabase: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "meta_access_token")
      .maybeSingle();
    return data?.valor ?? null;
  } catch {
    return null;
  }
}

async function saveTokenToDB(
  supabase: ReturnType<typeof supabaseAdmin>,
  token: string
): Promise<void> {
  try {
    await supabase
      .from("configuracoes")
      .upsert(
        { chave: "meta_access_token", valor: token, atualizado_em: new Date().toISOString() },
        { onConflict: "chave" }
      );
  } catch {
    /* non-fatal */
  }
}

/**
 * Verifica expiração via /debug_token.
 * - expiresAt === 0  → token permanente (Usuário do Sistema)
 * - expiresAt > 0    → token com prazo definido
 * - expiresAt === null → não foi possível verificar (assume válido)
 * - isValid === false → somente quando Meta explicitamente retorna is_valid: false
 */
async function checkTokenExpiry(
  token: string
): Promise<{ expiresAt: number | null; isValid: boolean }> {
  if (!META_APP_ID || !META_APP_SECRET) return { expiresAt: null, isValid: true };
  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: { is_valid?: boolean; expires_at?: number };
      error?: unknown;
    };

    // Se a própria chamada de debug retornou erro, não sabemos — assume válido
    if (json.error || !json.data) return { expiresAt: null, isValid: true };

    const data = json.data;
    return {
      // Só marca inválido se Meta EXPLICITAMENTE disse is_valid: false
      isValid: data.is_valid !== false,
      expiresAt: data.expires_at ?? null, // 0 = nunca expira (token de sistema)
    };
  } catch {
    return { expiresAt: null, isValid: true };
  }
}

/** Troca o token atual por um de longa duração (~60 dias) via fb_exchange_token.
 *  Só funciona com tokens de usuário pessoal — NÃO com tokens de Usuário do Sistema. */
async function refreshLongLivedToken(currentToken: string): Promise<string> {
  if (!META_APP_ID || !META_APP_SECRET)
    throw new Error("META_APP_ID / META_APP_SECRET não configurados.");
  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const res = await fetch(url);
  const json = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!res.ok || !json.access_token) {
    throw new Error(`Falha ao renovar token: ${json.error?.message ?? res.status}`);
  }
  return json.access_token;
}

/**
 * Obtém o token ativo, renovando automaticamente apenas quando necessário.
 * - Token permanente (expires_at=0): nunca renova
 * - Token com prazo: renova só se expirado ou < 7 dias para expirar
 * - Se não conseguiu verificar: usa o token como está
 */
async function getActiveToken(supabase: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const tokenDB = await getTokenFromDB(supabase);
  const tokenEnv = process.env.META_ACCESS_TOKEN ?? "";
  const token = tokenDB || tokenEnv;

  if (!token) throw new Error("META_ACCESS_TOKEN não configurado.");

  const { isValid, expiresAt } = await checkTokenExpiry(token);
  const now = Math.floor(Date.now() / 1000);
  const SETE_DIAS = 7 * 86400;

  // Token permanente (Usuário do Sistema) — nunca precisa renovar
  if (expiresAt === 0) return token;

  // Só renova se temos data de expiração concreta e ela está próxima/passada
  const estaExpirado = !isValid && expiresAt !== null; // Meta disse explicitamente que é inválido
  const estaExpirando = expiresAt !== null && expiresAt > 0 && expiresAt - now < SETE_DIAS;

  if (estaExpirado || estaExpirando) {
    console.warn(
      `[meta/token] Token ${estaExpirado ? "expirado" : "expirando em breve"} — renovando...`
    );
    try {
      const novoToken = await refreshLongLivedToken(token);
      await saveTokenToDB(supabase, novoToken);
      console.warn("[meta/token] Token renovado e salvo no Supabase.");
      return novoToken;
    } catch (err) {
      if (estaExpirado) throw err;
      console.warn("[meta/token] Falha ao renovar (token ainda válido):", err);
      return token;
    }
  }

  return token;
}

// ─── Health score (0–100) ─────────────────────────────────────────────────────

function calcHealthScore(kpis: KPIsCampanha): number {
  // Sem impressões = sem dados = score 0
  if (!kpis.impressions || kpis.impressions === 0) return 0;

  let score = 0;

  // ── CTR do link (40 pts)
  const ctr = kpis.link_ctr > 0 ? kpis.link_ctr : kpis.ctr;
  if (ctr >= 2.0) score += 40;
  else if (ctr >= 1.0) score += 30;
  else if (ctr >= 0.5) score += 18;
  else if (ctr >= 0.2) score += 8;

  // ── Frequência (20 pts) — requer impressões reais (freq > 0)
  const freq = kpis.frequency ?? 0;
  if (freq > 0 && freq <= 1.5) score += 20;
  else if (freq > 0 && freq <= 2.5) score += 15;
  else if (freq > 0 && freq <= 3.5) score += 9;
  else if (freq > 0 && freq <= 5.0) score += 4;

  // ── CPM (20 pts) — requer gasto real (cpm > 0)
  const cpm = kpis.cpm ?? 0;
  if (cpm > 0 && cpm <= 10) score += 20;
  else if (cpm > 0 && cpm <= 20) score += 15;
  else if (cpm > 0 && cpm <= 35) score += 9;
  else if (cpm > 0 && cpm <= 50) score += 4;

  // ── Hook Rate (20 pts) — se vídeo disponível; senão redistribui para CPM
  const hookRate = kpis.hook_rate ?? 0;
  if (hookRate > 0) {
    if (hookRate >= 20) score += 20;
    else if (hookRate >= 12) score += 15;
    else if (hookRate >= 6) score += 9;
    else if (hookRate >= 3) score += 4;
  } else {
    // Campanha de imagem: CPM recebe os 20pts extras (requer cpm > 0)
    if (cpm > 0 && cpm <= 10) score += 20;
    else if (cpm > 0 && cpm <= 20) score += 15;
    else if (cpm > 0 && cpm <= 35) score += 9;
    else if (cpm > 0 && cpm <= 50) score += 4;
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Meta API helpers ─────────────────────────────────────────────────────────

/** Classifica erros da Meta API em mensagens amigáveis */
function friendlyMetaError(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();
  if (
    msg.includes("session has expired") ||
    msg.includes("access token") ||
    msg.includes("invalid oauth")
  ) {
    return "TOKEN_EXPIRADO";
  }
  if (msg.includes("(#200)") || msg.includes("permission")) {
    return "TOKEN_SEM_PERMISSAO";
  }
  if (
    msg.includes("(#100)") ||
    msg.includes("does not exist") ||
    msg.includes("no such ad account")
  ) {
    return "CONTA_NAO_ENCONTRADA";
  }
  if (msg.includes("rate limit") || msg.includes("too many calls")) {
    return "RATE_LIMIT";
  }
  return rawMessage;
}

async function metaGet(
  token: string,
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = (await res.json()) as { error?: { message: string; code?: number }; data?: unknown };
  if (!res.ok || json.error) {
    const rawMeta = json.error?.message ?? String(res.status);
    // Lança com prefixo RAW: para preservar o erro original no catch
    throw new Error(`RAW:${rawMeta}`);
  }
  return json;
}

// ─── Action helpers (module-level to avoid strict-mode function-in-block error) ─

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

const MESSAGE_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
];

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let prestador_id_global = "";
  try {
    const body = await req.json().catch(() => null);
    if (!body?.prestador_id) {
      return NextResponse.json({ error: "prestador_id obrigatório." }, { status: 400 });
    }

    const { prestador_id, periodo_inicio, periodo_fim } = body as {
      prestador_id: string;
      periodo_inicio?: string;
      periodo_fim?: string;
    };
    prestador_id_global = prestador_id;

    // Período padrão: últimos 30 dias
    const hoje = new Date();
    const inicio =
      periodo_inicio ?? new Date(hoje.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
    const fim = periodo_fim ?? hoje.toISOString().slice(0, 10);

    const supabase = supabaseAdmin();

    // Obtém token ativo (renova automaticamente se necessário)
    const activeToken = await getActiveToken(supabase);

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
    // Nota: video_3_sec_watched_actions e video_p*_watched_actions depreciados no v18+
    const INSIGHT_FIELDS = [
      "impressions",
      "reach",
      "frequency",
      "spend",
      "cpm",
      "inline_link_clicks",
      "inline_link_click_ctr",
      "cost_per_inline_link_click",
      "clicks",
      "ctr",
      "actions",
      "cost_per_action_type",
      "video_thruplay_watched_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
    ].join(",");

    // ── 1. KPIs consolidados da conta ──────────────────────────────────────────
    let kpisRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      time_range: timeRange,
    })) as { data?: Array<Record<string, unknown>>; paging?: unknown };

    // Se time_range não retornou dados, tenta date_preset (fallback)
    const usouDatePreset = !kpisRaw.data?.length;
    if (usouDatePreset) {
      console.warn("[meta/sincronizar] time_range sem dados, tentando date_preset=last_30d");
      kpisRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
        fields: INSIGHT_FIELDS,
        date_preset: "last_30d",
      })) as { data?: Array<Record<string, unknown>>; paging?: unknown };
    }

    const kpisData = kpisRaw.data?.[0] ?? {};
    console.warn("[meta/sincronizar] kpisRaw.data length:", kpisRaw.data?.length ?? 0);
    console.warn("[meta/sincronizar] kpisData impressions:", kpisData.impressions);

    const impressions = parseFloat(String(kpisData.impressions ?? "0"));
    const spend = parseFloat(String(kpisData.spend ?? "0"));
    const thruplay = extractVideoAction(kpisData.video_thruplay_watched_actions);
    const results = extractAction(kpisData.actions, MESSAGE_TYPES);
    const costPerResult = extractAction(kpisData.cost_per_action_type, MESSAGE_TYPES);
    // video_3_sec_watched_actions foi depreciado no v18+, mas "video_view" dentro de
    // actions[] representa exatamente as visualizações de 3s — usamos como fallback
    const video3s = extractAction(kpisData.actions, ["video_view"]);

    // p25/50/75/95 começam do nível de conta; se zerados, fallback para nível de anúncio
    let videoP25 = extractVideoAction(kpisData.video_p25_watched_actions);
    let videoP50 = extractVideoAction(kpisData.video_p50_watched_actions);
    let videoP75 = extractVideoAction(kpisData.video_p75_watched_actions);
    let videoP95 = extractVideoAction(kpisData.video_p95_watched_actions);

    // ── 2. Insights por campanha ───────────────────────────────────────────────
    let campanhasRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
      fields: "campaign_id,campaign_name," + INSIGHT_FIELDS,
      level: "campaign",
      time_range: timeRange,
    })) as { data?: Array<Record<string, unknown>> };

    if (!campanhasRaw.data?.length) {
      campanhasRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
        fields: "campaign_id,campaign_name," + INSIGHT_FIELDS,
        level: "campaign",
        date_preset: "last_30d",
      })) as { data?: Array<Record<string, unknown>> };
    }

    const campanhas: CampanhaInsight[] = (campanhasRaw.data ?? []).map((c) => {
      const cImpressions = parseFloat(String(c.impressions ?? "0"));
      const cSpend = parseFloat(String(c.spend ?? "0"));
      const cThruplay = extractVideoAction(c.video_thruplay_watched_actions);
      const cVideo3s = extractAction(c.actions, ["video_view"]);
      const cResults = extractAction(c.actions, MESSAGE_TYPES);
      const cCostPerResult = extractAction(c.cost_per_action_type, MESSAGE_TYPES);
      return {
        campaign_id: String(c.campaign_id ?? ""),
        campaign_name: String(c.campaign_name ?? ""),
        status: "ACTIVE",
        impressions: cImpressions,
        reach: parseFloat(String(c.reach ?? "0")),
        frequency: parseFloat(String(c.frequency ?? "0")),
        clicks: parseFloat(String(c.clicks ?? "0")),
        link_clicks: parseFloat(String(c.inline_link_clicks ?? "0")),
        spend: cSpend,
        ctr: parseFloat(String(c.ctr ?? "0")),
        link_ctr: parseFloat(String(c.inline_link_click_ctr ?? "0")),
        cpc: parseFloat(String(c.cost_per_inline_link_click ?? "0")),
        cpm: parseFloat(String(c.cpm ?? "0")),
        results: cResults,
        cost_per_result: cCostPerResult > 0 ? cCostPerResult : cResults > 0 ? cSpend / cResults : 0,
        thruplay: cThruplay,
        cost_per_thruplay: cThruplay > 0 ? cSpend / cThruplay : 0,
        video_3s: cVideo3s,
        hook_rate: cImpressions > 0 ? (cVideo3s / cImpressions) * 100 : 0,
        video_p25: extractVideoAction(c.video_p25_watched_actions),
        video_p50: extractVideoAction(c.video_p50_watched_actions),
        video_p75: extractVideoAction(c.video_p75_watched_actions),
        video_p100: extractVideoAction(c.video_p95_watched_actions),
      };
    });

    // ── 2b. Fallback: busca % de vídeo no nível de anúncio ────────────────────
    // Campanhas de Engajamento/WhatsApp não retornam video_p* no nível de conta
    // ou campanha, mas os dados estão disponíveis no nível de anúncio (ad level).
    if (thruplay > 0 && videoP25 === 0) {
      try {
        const VIDEO_PCT_FIELDS = [
          "campaign_id",
          "video_p25_watched_actions",
          "video_p50_watched_actions",
          "video_p75_watched_actions",
          "video_p95_watched_actions",
        ].join(",");

        let adVideoRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
          fields: VIDEO_PCT_FIELDS,
          level: "ad",
          time_range: timeRange,
        })) as { data?: Array<Record<string, unknown>> };

        if (!adVideoRaw.data?.length) {
          adVideoRaw = (await metaGet(activeToken, `/act_${accountId}/insights`, {
            fields: VIDEO_PCT_FIELDS,
            level: "ad",
            date_preset: "last_30d",
          })) as { data?: Array<Record<string, unknown>> };
        }

        // Agrega totais por conta e por campanha
        type VideoAgg = { p25: number; p50: number; p75: number; p95: number };
        const byCampaign: Record<string, VideoAgg> = {};

        for (const ad of adVideoRaw.data ?? []) {
          const cid = String(ad.campaign_id ?? "");
          if (!byCampaign[cid]) byCampaign[cid] = { p25: 0, p50: 0, p75: 0, p95: 0 };
          byCampaign[cid].p25 += extractVideoAction(ad.video_p25_watched_actions);
          byCampaign[cid].p50 += extractVideoAction(ad.video_p50_watched_actions);
          byCampaign[cid].p75 += extractVideoAction(ad.video_p75_watched_actions);
          byCampaign[cid].p95 += extractVideoAction(ad.video_p95_watched_actions);
        }

        // Atualiza campanhas com dados do nível de anúncio
        for (const c of campanhas) {
          const agg = byCampaign[c.campaign_id];
          if (agg) {
            c.video_p25 = agg.p25;
            c.video_p50 = agg.p50;
            c.video_p75 = agg.p75;
            c.video_p100 = agg.p95;
          }
        }

        // Soma geral para KPIs consolidados
        videoP25 = Object.values(byCampaign).reduce((s, v) => s + v.p25, 0);
        videoP50 = Object.values(byCampaign).reduce((s, v) => s + v.p50, 0);
        videoP75 = Object.values(byCampaign).reduce((s, v) => s + v.p75, 0);
        videoP95 = Object.values(byCampaign).reduce((s, v) => s + v.p95, 0);

        console.warn("[meta/sincronizar] fallback ad-level video_p*:", {
          p25: videoP25,
          p50: videoP50,
          p75: videoP75,
          p95: videoP95,
          ads: adVideoRaw.data?.length ?? 0,
        });
      } catch (videoErr) {
        console.warn("[meta/sincronizar] fallback ad-level falhou (não bloqueia):", videoErr);
      }
    }

    // ── 2c. Fallback: Video Insights API (total_video_retention_graph) ────────
    // Quando ad-level também não retorna p25, busca a curva de retenção real
    // diretamente no objeto do vídeo. Dado é do lifetime do vídeo (não filtrado
    // por período), mas é real e suficiente para um criativo rodando em uma conta.
    if (thruplay > 0 && videoP25 === 0 && video3s > 0) {
      try {
        // Buscar ads da conta para obter os video_ids dos criativos
        type AdRec = { campaign_id?: string; creative?: { video_id?: string } };
        const adsRaw = (await metaGet(activeToken, `/act_${accountId}/ads`, {
          fields: "id,campaign_id,creative{video_id}",
          limit: "25",
        })) as { data?: AdRec[] };

        const videoIds = Array.from(
          new Set(
            (adsRaw.data ?? [])
              .map((a) => a.creative?.video_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        for (const videoId of videoIds) {
          try {
            type RetGraph = Record<string, number>;
            type InsightEntry = {
              name: string;
              values?: Array<{ value?: RetGraph }>;
            };
            const insightsRaw = (await metaGet(activeToken, `/${videoId}/video_insights`, {
              fields: "total_video_retention_graph",
              period: "lifetime",
            })) as { data?: InsightEntry[] };

            const retEntry = (insightsRaw.data ?? []).find(
              (d) => d.name === "total_video_retention_graph"
            );
            const retGraph = retEntry?.values?.[0]?.value;
            if (!retGraph || Object.keys(retGraph).length === 0) continue;
            const graph: RetGraph = retGraph;

            // Detecta se o grafo está indexado por % (0-100) ou por segundos (0-N)
            const keys = Object.keys(graph)
              .map(Number)
              .sort((a, b) => a - b);
            const maxKey = keys[keys.length - 1];

            // Converte marco percentual para índice no grafo
            const indexFor = (pct: number): number =>
              maxKey <= 100 ? pct : Math.round(maxKey * (pct / 100));

            // Interpola valor do grafo para um índice dado
            const retFraction = (pct: number): number => {
              const idx = indexFor(pct);
              const base = graph[String(keys[0])] ?? 100;
              if (base === 0) return 0;
              const exact = graph[String(idx)];
              if (exact !== undefined) return exact / base;
              const lo = [...keys].reverse().find((k) => k < idx);
              const hi = keys.find((k) => k > idx);
              if (lo == null || hi == null) return 0;
              const t = (idx - lo) / (hi - lo);
              const interp = (graph[String(lo)] ?? 0) * (1 - t) + (graph[String(hi)] ?? 0) * t;
              return interp / base;
            };

            videoP25 = Math.round(video3s * retFraction(25));
            videoP50 = Math.round(video3s * retFraction(50));
            videoP75 = Math.round(video3s * retFraction(75));
            videoP95 = Math.round(video3s * retFraction(95));

            for (const c of campanhas) {
              if (c.thruplay > 0) {
                c.video_p25 = videoP25;
                c.video_p50 = videoP50;
                c.video_p75 = videoP75;
                c.video_p100 = videoP95;
              }
            }

            console.warn("[meta/sincronizar] fallback video_insights retenção:", {
              videoId,
              graphKeys: keys.length,
              maxKey,
              p25: videoP25,
              p50: videoP50,
              p75: videoP75,
              p95: videoP95,
            });
            break; // Usa o primeiro vídeo com dados válidos
          } catch {
            // Tenta próximo vídeo se este falhar
          }
        }
      } catch (videoInsightsErr) {
        console.warn("[meta/sincronizar] fallback video_insights falhou:", videoInsightsErr);
      }
    }

    // ── 3. Consolidar KPIs (após fallback de vídeo) ───────────────────────────
    const kpis: KPIsCampanha = {
      // Entrega
      impressions,
      reach: parseFloat(String(kpisData.reach ?? "0")),
      frequency: parseFloat(String(kpisData.frequency ?? "0")),
      cpm: parseFloat(String(kpisData.cpm ?? "0")),
      // Clique
      link_clicks: parseFloat(String(kpisData.inline_link_clicks ?? "0")),
      link_ctr: parseFloat(String(kpisData.inline_link_click_ctr ?? "0")),
      cpc: parseFloat(String(kpisData.cost_per_inline_link_click ?? "0")),
      // Resultado
      results,
      cost_per_result: costPerResult > 0 ? costPerResult : results > 0 ? spend / results : 0,
      // Gasto
      spend,
      // Vídeo
      thruplay,
      cost_per_thruplay: thruplay > 0 ? spend / thruplay : 0,
      video_3s: video3s,
      hook_rate: impressions > 0 ? (video3s / impressions) * 100 : 0,
      video_p25: videoP25,
      video_p50: videoP50,
      video_p75: videoP75,
      video_p100: videoP95,
      // Compat
      clicks: parseFloat(String(kpisData.clicks ?? "0")),
      ctr: parseFloat(String(kpisData.ctr ?? "0")),
    };

    // ── 4. Calcular health score ───────────────────────────────────────────────
    const healthScore = calcHealthScore(kpis);

    // ── 4b. Buscar saldo e método de pagamento da conta ───────────────────────
    let conta: ContaMeta = { saldo: null, metodo: null };
    let debugContaRaw: unknown = null;
    let debugContaErro: string | null = null;
    try {
      const contaRaw = (await metaGet(activeToken, `/act_${accountId}`, {
        fields: "balance,spend_cap,amount_spent,funding_source_details",
      })) as {
        balance?: string;
        spend_cap?: string;
        amount_spent?: string;
        funding_source_details?: { type?: number };
      };
      debugContaRaw = contaRaw;

      // Meta retorna centavos na moeda da conta (ex: "150000" = R$ 1.500,00)
      const spendCap = parseFloat(contaRaw.spend_cap ?? "0") / 100;
      const amountSpent = parseFloat(contaRaw.amount_spent ?? "0") / 100;
      const balance = parseFloat(contaRaw.balance ?? "0") / 100;

      let saldo: number | null =
        spendCap > 0 ? spendCap - amountSpent : balance > 0 ? balance : null;

      const tipo = contaRaw.funding_source_details?.type ?? null;
      const metodo: ContaMeta["metodo"] =
        tipo === 1 ? "cartao" : tipo === 3 ? "prepago" : tipo != null ? "outro" : null;

      // Fallback: conta pós-paga (cartão) sem spend_cap → soma budget_remaining das campanhas ativas
      if (saldo === null) {
        try {
          const campRaw = (await metaGet(activeToken, `/act_${accountId}/campaigns`, {
            fields: "budget_remaining,lifetime_budget,effective_status",
            limit: "50",
          })) as {
            data?: Array<{
              budget_remaining?: string;
              lifetime_budget?: string;
              effective_status?: string;
            }>;
          };
          const totalRestante = (campRaw.data ?? [])
            .filter((c) => c.effective_status === "ACTIVE" && c.lifetime_budget)
            .reduce((acc, c) => acc + parseFloat(c.budget_remaining ?? "0") / 100, 0);
          if (totalRestante > 0) saldo = totalRestante;
        } catch {
          /* não bloqueia */
        }
      }

      conta = { saldo, metodo };
      console.warn("[meta/sincronizar] conta:", { spendCap, amountSpent, balance, saldo, tipo });
    } catch (contaErr) {
      debugContaErro = contaErr instanceof Error ? contaErr.message : String(contaErr);
      console.warn("[meta/sincronizar] conta indisponível:", debugContaErro);
    }

    const dadosJson: DadosRelatorio = {
      kpis,
      campanhas,
      periodo_inicio: inicio,
      periodo_fim: fim,
      conta,
    };

    // ── 5. Salvar relatório ───────────────────────────────────────────────────
    const { data: relatorio, error: rErr } = await supabase
      .from("relatorios_campanha")
      .insert({
        prestador_id,
        periodo_inicio: inicio,
        periodo_fim: fim,
        dados_json: dadosJson,
        health_score: healthScore,
        status: "gerado",
      })
      .select()
      .single();

    if (rErr || !relatorio)
      throw new Error(`Erro ao salvar relatório: ${rErr?.message ?? "sem dados retornados"}`);

    // ── 6. Atualizar prestador ─────────────────────────────────────────────────
    await supabase
      .from("prestadores")
      .update({
        meta_ultima_sync: new Date().toISOString(),
        meta_sync_status: "ok",
      })
      .eq("id", prestador_id);

    // ── 7. Debug: lista campanhas da conta para diagnóstico ──────────────────
    let debugCampanhasList: unknown[] = [];
    try {
      const listRaw = (await metaGet(activeToken, `/act_${accountId}/campaigns`, {
        fields: "id,name,status,effective_status,daily_budget,lifetime_budget",
        limit: "10",
      })) as { data?: unknown[] };
      debugCampanhasList = listRaw.data ?? [];
    } catch {
      /* não bloqueia */
    }

    return NextResponse.json({
      ok: true,
      relatorio_id: relatorio.id,
      health_score: healthScore,
      periodo: { inicio, fim },
      kpis,
      campanhas: campanhas.length,
      debug: {
        usou_date_preset: usouDatePreset,
        meta_data_count: kpisRaw.data?.length ?? 0,
        meta_campanhas_count: campanhasRaw.data?.length ?? 0,
        meta_raw_kpis: kpisData,
        meta_raw_primeira_campanha: campanhasRaw.data?.[0] ?? null,
        video_fields_conta: {
          thruplay: kpisData.video_thruplay_watched_actions ?? null,
          p25: kpisData.video_p25_watched_actions ?? null,
          p50: kpisData.video_p50_watched_actions ?? null,
          p75: kpisData.video_p75_watched_actions ?? null,
          p95: kpisData.video_p95_watched_actions ?? null,
        },
        conta_raw: debugContaRaw,
        conta_erro: debugContaErro,
        conta_parsed: conta,
        account_id: accountId,
        time_range: timeRange,
        campanhas_na_conta: debugCampanhasList,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Extrai erro original da Meta (prefixo RAW:) ou usa o erro direto
    const rawMeta = errMsg.startsWith("RAW:") ? errMsg.slice(4) : errMsg;
    const codigo = friendlyMetaError(rawMeta);
    console.error("[meta/sincronizar] erro raw:", rawMeta);

    const MENSAGENS: Record<string, string> = {
      TOKEN_EXPIRADO:
        "Token da Meta API expirado. Gere um novo token permanente em business.facebook.com → Configurações → Usuários do sistema.",
      TOKEN_SEM_PERMISSAO:
        "Token sem permissão de leitura de anúncios (ads_read). Verifique as permissões do token no Meta Business.",
      CONTA_NAO_ENCONTRADA:
        "Conta não encontrada ou sem acesso. O token não tem permissão para esta conta de anúncios — verifique se o usuário que gerou o token é administrador desta conta no Meta Business Manager.",
      RATE_LIMIT:
        "Limite de requisições da Meta API atingido. Aguarde alguns minutos e tente novamente.",
    };
    const msg = MENSAGENS[codigo] ?? rawMeta;

    // Marca como erro no prestador (usa prestador_id_global — req.json() já foi consumido)
    if (prestador_id_global) {
      try {
        await supabaseAdmin()
          .from("prestadores")
          .update({ meta_sync_status: "erro" })
          .eq("id", prestador_id_global);
      } catch {
        /* silencia erro secundário */
      }
    }

    return NextResponse.json({ error: msg, debug_erro_raw: rawMeta }, { status: 500 });
  }
}
