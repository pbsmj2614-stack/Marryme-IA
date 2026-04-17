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
import type { CampanhaInsight, KPIsCampanha, DadosRelatorio } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

const META_VERSION  = process.env.META_API_VERSION  ?? "v18.0";
const META_BASE     = `https://graph.facebook.com/${META_VERSION}`;
const META_APP_ID   = process.env.META_APP_ID       ?? "";
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
  } catch { return null; }
}

async function saveTokenToDB(supabase: ReturnType<typeof supabaseAdmin>, token: string): Promise<void> {
  try {
    await supabase.from("configuracoes").upsert(
      { chave: "meta_access_token", valor: token, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );
  } catch { /* non-fatal */ }
}

/**
 * Verifica expiração via /debug_token.
 * - expiresAt === 0  → token permanente (Usuário do Sistema)
 * - expiresAt > 0    → token com prazo definido
 * - expiresAt === null → não foi possível verificar (assume válido)
 * - isValid === false → somente quando Meta explicitamente retorna is_valid: false
 */
async function checkTokenExpiry(token: string): Promise<{ expiresAt: number | null; isValid: boolean }> {
  if (!META_APP_ID || !META_APP_SECRET) return { expiresAt: null, isValid: true };
  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
    const res  = await fetch(url);
    const json = await res.json() as { data?: { is_valid?: boolean; expires_at?: number }; error?: unknown };

    // Se a própria chamada de debug retornou erro, não sabemos — assume válido
    if (json.error || !json.data) return { expiresAt: null, isValid: true };

    const data = json.data;
    return {
      // Só marca inválido se Meta EXPLICITAMENTE disse is_valid: false
      isValid:   data.is_valid !== false,
      expiresAt: data.expires_at ?? null, // 0 = nunca expira (token de sistema)
    };
  } catch { return { expiresAt: null, isValid: true }; }
}

/** Troca o token atual por um de longa duração (~60 dias) via fb_exchange_token.
 *  Só funciona com tokens de usuário pessoal — NÃO com tokens de Usuário do Sistema. */
async function refreshLongLivedToken(currentToken: string): Promise<string> {
  if (!META_APP_ID || !META_APP_SECRET) throw new Error("META_APP_ID / META_APP_SECRET não configurados.");
  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const res  = await fetch(url);
  const json = await res.json() as { access_token?: string; error?: { message: string } };
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
  const tokenDB  = await getTokenFromDB(supabase);
  const tokenEnv = process.env.META_ACCESS_TOKEN ?? "";
  const token    = tokenDB || tokenEnv;

  if (!token) throw new Error("META_ACCESS_TOKEN não configurado.");

  const { isValid, expiresAt } = await checkTokenExpiry(token);
  const now      = Math.floor(Date.now() / 1000);
  const SETE_DIAS = 7 * 86400;

  // Token permanente (Usuário do Sistema) — nunca precisa renovar
  if (expiresAt === 0) return token;

  // Só renova se temos data de expiração concreta e ela está próxima/passada
  const estaExpirado  = !isValid && expiresAt !== null; // Meta disse explicitamente que é inválido
  const estaExpirando = expiresAt !== null && expiresAt > 0 && (expiresAt - now) < SETE_DIAS;

  if (estaExpirado || estaExpirando) {
    console.log(`[meta/token] Token ${estaExpirado ? "expirado" : "expirando em breve"} — renovando...`);
    try {
      const novoToken = await refreshLongLivedToken(token);
      await saveTokenToDB(supabase, novoToken);
      console.log("[meta/token] Token renovado e salvo no Supabase.");
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
  if (ctr >= 2.0)      score += 40;
  else if (ctr >= 1.0) score += 30;
  else if (ctr >= 0.5) score += 18;
  else if (ctr >= 0.2) score += 8;

  // ── Frequência (20 pts) — requer impressões reais (freq > 0)
  const freq = kpis.frequency ?? 0;
  if (freq > 0 && freq <= 1.5)      score += 20;
  else if (freq > 0 && freq <= 2.5) score += 15;
  else if (freq > 0 && freq <= 3.5) score += 9;
  else if (freq > 0 && freq <= 5.0) score += 4;

  // ── CPM (20 pts) — requer gasto real (cpm > 0)
  const cpm = kpis.cpm ?? 0;
  if (cpm > 0 && cpm <= 10)  score += 20;
  else if (cpm > 0 && cpm <= 20) score += 15;
  else if (cpm > 0 && cpm <= 35) score += 9;
  else if (cpm > 0 && cpm <= 50) score += 4;

  // ── Hook Rate (20 pts) — se vídeo disponível; senão redistribui para CPM
  const hookRate = kpis.hook_rate ?? 0;
  if (hookRate > 0) {
    if (hookRate >= 20)      score += 20;
    else if (hookRate >= 12) score += 15;
    else if (hookRate >= 6)  score += 9;
    else if (hookRate >= 3)  score += 4;
  } else {
    // Campanha de imagem: CPM recebe os 20pts extras (requer cpm > 0)
    if (cpm > 0 && cpm <= 10)      score += 20;
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
  if (msg.includes("session has expired") || msg.includes("access token") || msg.includes("invalid oauth")) {
    return "TOKEN_EXPIRADO";
  }
  if (msg.includes("(#200)") || msg.includes("permission")) {
    return "TOKEN_SEM_PERMISSAO";
  }
  if (msg.includes("(#100)") || msg.includes("does not exist") || msg.includes("no such ad account")) {
    return "CONTA_NAO_ENCONTRADA";
  }
  if (msg.includes("rate limit") || msg.includes("too many calls")) {
    return "RATE_LIMIT";
  }
  return rawMessage;
}

async function metaGet(token: string, path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res  = await fetch(url.toString());
  const json = await res.json() as { error?: { message: string; code?: number }; data?: unknown };
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
    const inicio = periodo_inicio ?? new Date(hoje.getTime() - 30 * 86400_000)
      .toISOString().slice(0, 10);
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
      "impressions", "reach", "frequency", "spend", "cpm",
      "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
      "clicks", "ctr",
      "actions", "cost_per_action_type",
      "video_thruplay_watched_actions",
    ].join(",");

    // ── 1. KPIs consolidados da conta ──────────────────────────────────────────
    let kpisRaw = await metaGet(activeToken, `/act_${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      time_range: timeRange,
    }) as { data?: Array<Record<string, unknown>>; paging?: unknown };

    // Se time_range não retornou dados, tenta date_preset (fallback)
    const usouDatePreset = !kpisRaw.data?.length;
    if (usouDatePreset) {
      console.log("[meta/sincronizar] time_range sem dados, tentando date_preset=last_30d");
      kpisRaw = await metaGet(activeToken, `/act_${accountId}/insights`, {
        fields: INSIGHT_FIELDS,
        date_preset: "last_30d",
      }) as { data?: Array<Record<string, unknown>>; paging?: unknown };
    }

    const kpisData = kpisRaw.data?.[0] ?? {};
    console.log("[meta/sincronizar] kpisRaw.data length:", kpisRaw.data?.length ?? 0);
    console.log("[meta/sincronizar] kpisData impressions:", kpisData.impressions);

    const impressions     = parseFloat(String(kpisData.impressions ?? "0"));
    const spend           = parseFloat(String(kpisData.spend       ?? "0"));
    const thruplay        = extractVideoAction(kpisData.video_thruplay_watched_actions);
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
      video_3s:          0,
      hook_rate:         0, // video_3_sec depreciado no v18+
      video_p25:         0,
      video_p50:         0,
      video_p75:         0,
      video_p100:        0,
      // Compat
      clicks:            parseFloat(String(kpisData.clicks ?? "0")),
      ctr:               parseFloat(String(kpisData.ctr   ?? "0")),
    };

    // ── 2. Insights por campanha ───────────────────────────────────────────────
    let campanhasRaw = await metaGet(activeToken, `/act_${accountId}/insights`, {
      fields: "campaign_id,campaign_name," + INSIGHT_FIELDS,
      level: "campaign",
      time_range: timeRange,
    }) as { data?: Array<Record<string, unknown>> };

    if (!campanhasRaw.data?.length) {
      campanhasRaw = await metaGet(activeToken, `/act_${accountId}/insights`, {
        fields: "campaign_id,campaign_name," + INSIGHT_FIELDS,
        level: "campaign",
        date_preset: "last_30d",
      }) as { data?: Array<Record<string, unknown>> };
    }

    const campanhas: CampanhaInsight[] = (campanhasRaw.data ?? []).map((c) => {
      const cImpressions   = parseFloat(String(c.impressions ?? "0"));
      const cSpend         = parseFloat(String(c.spend       ?? "0"));
      const cThruplay      = extractVideoAction(c.video_thruplay_watched_actions);
      const cVideo3s       = 0; // video_3_sec_watched_actions depreciado no Meta API v18+
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

    if (rErr || !relatorio) throw new Error(`Erro ao salvar relatório: ${rErr?.message ?? "sem dados retornados"}`);

    // ── 5. Atualizar prestador ─────────────────────────────────────────────────
    await supabase
      .from("prestadores")
      .update({
        meta_ultima_sync:  new Date().toISOString(),
        meta_sync_status:  "ok",
      })
      .eq("id", prestador_id);

    // ── Debug: lista campanhas da conta para diagnóstico ─────────────────────
    let debugCampanhasList: unknown[] = [];
    try {
      const listRaw = await metaGet(activeToken, `/act_${accountId}/campaigns`, {
        fields: "id,name,status,effective_status,daily_budget,lifetime_budget",
        limit: "10",
      }) as { data?: unknown[] };
      debugCampanhasList = listRaw.data ?? [];
    } catch { /* não bloqueia */ }

    return NextResponse.json({
      ok:           true,
      relatorio_id: relatorio.id,
      health_score: healthScore,
      periodo:      { inicio, fim },
      kpis,
      campanhas:    campanhas.length,
      debug: {
        usou_date_preset:     usouDatePreset,
        meta_data_count:      kpisRaw.data?.length ?? 0,
        meta_campanhas_count: campanhasRaw.data?.length ?? 0,
        meta_raw_kpis:        kpisData,
        account_id:           accountId,
        time_range:           timeRange,
        campanhas_na_conta:   debugCampanhasList,
      },
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Extrai erro original da Meta (prefixo RAW:) ou usa o erro direto
    const rawMeta = errMsg.startsWith("RAW:") ? errMsg.slice(4) : errMsg;
    const codigo  = friendlyMetaError(rawMeta);
    console.error("[meta/sincronizar] erro raw:", rawMeta);

    const MENSAGENS: Record<string, string> = {
      TOKEN_EXPIRADO:       "Token da Meta API expirado. Gere um novo token permanente em business.facebook.com → Configurações → Usuários do sistema.",
      TOKEN_SEM_PERMISSAO:  "Token sem permissão de leitura de anúncios (ads_read). Verifique as permissões do token no Meta Business.",
      CONTA_NAO_ENCONTRADA: "Conta não encontrada ou sem acesso. O token não tem permissão para esta conta de anúncios — verifique se o usuário que gerou o token é administrador desta conta no Meta Business Manager.",
      RATE_LIMIT:           "Limite de requisições da Meta API atingido. Aguarde alguns minutos e tente novamente.",
    };
    const msg = MENSAGENS[codigo] ?? rawMeta;

    // Marca como erro no prestador (usa prestador_id_global — req.json() já foi consumido)
    if (prestador_id_global) {
      try {
        await supabaseAdmin()
          .from("prestadores")
          .update({ meta_sync_status: "erro" })
          .eq("id", prestador_id_global);
      } catch { /* silencia erro secundário */ }
    }

    return NextResponse.json({ error: msg, debug_erro_raw: rawMeta }, { status: 500 });
  }
}
