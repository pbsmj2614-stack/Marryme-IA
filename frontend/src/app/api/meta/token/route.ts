/**
 * POST /api/meta/token
 * Body: { token: string }
 *
 * Valida o token via /me e salva no Supabase.
 * Funciona com qualquer tipo: curto, longo, ou permanente (Usuário do Sistema).
 * NÃO tenta fazer fb_exchange_token — o token é salvo como recebido.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const META_APP_ID = process.env.META_APP_ID ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };

  if (!token?.trim()) {
    return NextResponse.json({ ok: false, erro: "Token não informado." }, { status: 400 });
  }

  // 1. Valida que o token funciona via /me
  let nomeUsuario = "";
  try {
    const res = await fetch(
      `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(token.trim())}`
    );
    const json = (await res.json()) as { id?: string; name?: string; error?: { message: string } };
    if (json.error) {
      return NextResponse.json(
        { ok: false, erro: `Token inválido: ${json.error.message}` },
        { status: 400 }
      );
    }
    nomeUsuario = json.name ?? json.id ?? "";
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Erro ao validar token: ${String(e)}` },
      { status: 500 }
    );
  }

  // 2. Verifica tipo do token (permanente vs prazo) via debug_token
  let expiraEm = "desconhecido";
  if (META_APP_ID && META_APP_SECRET) {
    try {
      const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
      const res = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token.trim())}&access_token=${encodeURIComponent(appToken)}`
      );
      const json = (await res.json()) as {
        data?: { expires_at?: number; is_valid?: boolean };
        error?: unknown;
      };
      if (!json.error && json.data) {
        const expiresAt = json.data.expires_at;
        if (expiresAt === 0) {
          expiraEm = "nunca (token permanente)";
        } else if (expiresAt && expiresAt > 0) {
          expiraEm = new Date(expiresAt * 1000).toLocaleString("pt-BR");
        }
      }
    } catch {
      /* não bloqueia o salvamento */
    }
  }

  // 3. Salva no Supabase diretamente
  try {
    await supabaseAdmin()
      .from("configuracoes")
      .upsert(
        {
          chave: "meta_access_token",
          valor: token.trim(),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "chave" }
      );
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao salvar no banco: ${String(e)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, expira_em: expiraEm, usuario: nomeUsuario });
}
