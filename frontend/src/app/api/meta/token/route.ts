/**
 * POST /api/meta/token
 * Body: { token: string }
 *
 * Recebe um token curto (1h do Graph API Explorer),
 * troca por um de longa duração (~60 dias) e salva no Supabase.
 * Retorna informações do token resultante.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const META_VERSION    = process.env.META_API_VERSION  ?? "v18.0";
const META_APP_ID     = process.env.META_APP_ID       ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET   ?? "";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({})) as { token?: string };

  if (!token?.trim()) {
    return NextResponse.json({ ok: false, erro: "Token não informado." }, { status: 400 });
  }

  if (!META_APP_ID || !META_APP_SECRET) {
    return NextResponse.json({ ok: false, erro: "META_APP_ID / META_APP_SECRET não configurados no servidor." }, { status: 500 });
  }

  // 1. Verifica se o token de entrada é válido
  try {
    const meRes  = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const meJson = await meRes.json() as { id?: string; name?: string; error?: { message: string } };
    if (meJson.error) {
      return NextResponse.json({ ok: false, erro: `Token inválido: ${meJson.error.message}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, erro: `Erro ao validar token: ${String(e)}` }, { status: 500 });
  }

  // 2. Troca por token de longa duração (60 dias)
  let longToken: string;
  try {
    const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(token)}`;
    const res  = await fetch(url);
    const json = await res.json() as { access_token?: string; expires_in?: number; error?: { message: string } };
    if (!json.access_token) {
      throw new Error(json.error?.message ?? "Resposta sem access_token");
    }
    longToken = json.access_token;
  } catch (e) {
    return NextResponse.json({ ok: false, erro: `Falha ao converter para token longo: ${String(e)}` }, { status: 500 });
  }

  // 3. Verifica expiração do token longo
  let expiraEm = "desconhecido";
  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const dbgRes   = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(longToken)}&access_token=${encodeURIComponent(appToken)}`);
    const dbgJson  = await dbgRes.json() as { data?: { expires_at?: number; is_valid?: boolean } };
    const expiresAt = dbgJson.data?.expires_at;
    if (expiresAt && expiresAt !== 0) {
      expiraEm = new Date(expiresAt * 1000).toLocaleString("pt-BR");
    } else if (expiresAt === 0) {
      expiraEm = "nunca (token permanente)";
    }
  } catch { /* não bloqueia */ }

  // 4. Salva no Supabase
  try {
    await supabaseAdmin().from("configuracoes").upsert(
      { chave: "meta_access_token", valor: longToken, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, erro: `Falha ao salvar no banco: ${String(e)}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expira_em: expiraEm });
}
