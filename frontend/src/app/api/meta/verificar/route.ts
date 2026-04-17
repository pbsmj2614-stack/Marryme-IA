/**
 * GET /api/meta/verificar?account_id=XXXXXXXXXX
 *
 * Diagnóstico completo do token e acesso à conta de anúncios.
 * Retorna informações sobre o token ativo e se ele tem acesso ao account_id.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const META_VERSION   = process.env.META_API_VERSION ?? "v18.0";
const META_BASE      = `https://graph.facebook.com/${META_VERSION}`;
const META_APP_ID    = process.env.META_APP_ID    ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

async function getTokenFromDB(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from("configuracoes")
      .select("valor")
      .eq("chave", "meta_access_token")
      .maybeSingle();
    return data?.valor ?? null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id")?.replace(/^act_/i, "") ?? "";

  const tokenDB  = await getTokenFromDB();
  const tokenEnv = process.env.META_ACCESS_TOKEN ?? "";
  const token    = tokenDB || tokenEnv;

  if (!token) {
    return NextResponse.json({ ok: false, erro: "Nenhum token configurado (DB nem env)." });
  }

  const resultado: Record<string, unknown> = {
    token_fonte:  tokenDB ? "supabase_db" : "env_var",
    token_inicio: token.slice(0, 12) + "...",
  };

  // 1. Verifica identidade do token (/me)
  try {
    const res  = await fetch(`${META_BASE}/me?fields=id,name&access_token=${token}`);
    const json = await res.json() as { id?: string; name?: string; error?: { message: string } };
    if (json.error) {
      resultado.token_valido = false;
      resultado.token_erro   = json.error.message;
      return NextResponse.json({ ok: false, ...resultado });
    }
    resultado.token_valido    = true;
    resultado.token_usuario   = json.name ?? json.id;
    resultado.token_usuario_id = json.id;
  } catch (e) {
    resultado.token_valido = false;
    resultado.token_erro   = String(e);
    return NextResponse.json({ ok: false, ...resultado });
  }

  // 2. Debug token: validade e permissões
  // Só marca token_tem_ads_read=false quando temos CERTEZA (scopes retornados explicitamente)
  if (META_APP_ID && META_APP_SECRET) {
    try {
      const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
      const res  = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
      const json = await res.json() as { data?: { expires_at?: number; scopes?: string[]; is_valid?: boolean }; error?: unknown };
      const d    = json.data;
      if (d && !json.error) {
        resultado.token_expira_em = d.expires_at !== undefined
          ? (d.expires_at === 0 ? "nunca" : new Date(d.expires_at * 1000).toLocaleString("pt-BR"))
          : "desconhecido";
        resultado.token_permissoes = d.scopes ?? [];
        // Só avisa sobre ads_read se temos a lista de scopes e ads_read não está nela
        if (d.scopes !== undefined) {
          resultado.token_tem_ads_read = d.scopes.includes("ads_read");
        }
        // Se scopes não veio mas token é válido, não assumimos nada
      }
      // Se debug_token falhou (sem data), não exibimos alertas de permissão
    } catch { /* não bloqueia */ }
  }

  // 3. Lista contas de anúncios acessíveis
  try {
    const res  = await fetch(`${META_BASE}/me/adaccounts?fields=id,name,account_status&access_token=${token}`);
    const json = await res.json() as { data?: Array<{ id: string; name: string; account_status: number }>; error?: { message: string } };
    if (json.error) {
      resultado.contas_erro = json.error.message;
    } else {
      resultado.contas_acessiveis = (json.data ?? []).map((c) => ({
        id:     c.id.replace("act_", ""),
        nome:   c.name,
        status: c.account_status === 1 ? "Ativa" : `Inativa (${c.account_status})`,
      }));
    }
  } catch (e) { resultado.contas_erro = String(e); }

  // 4. Verifica conta específica (se account_id foi informado)
  if (accountId) {
    resultado.account_id_testado = accountId;

    // Primeiro: verificar se a conta aparece na lista de acessíveis (mais rápido e informativo)
    const contasAcessiveis = resultado.contas_acessiveis as Array<{ id: string; nome: string; status: string }> | undefined;
    const contaNaLista = contasAcessiveis?.find((c) => c.id === accountId);

    if (contaNaLista) {
      // Conta já confirmada pela lista — marca direto sem nova chamada
      resultado.conta_acessivel = true;
      resultado.conta_nome      = contaNaLista.nome;
      resultado.conta_status    = contaNaLista.status;
    } else {
      // Tenta chamar a conta diretamente
      try {
        const res  = await fetch(`${META_BASE}/act_${accountId}?fields=id,name,account_status&access_token=${token}`);
        const json = await res.json() as { id?: string; name?: string; account_status?: number; error?: { message: string } };
        if (json.error) {
          resultado.conta_acessivel = false;
          resultado.conta_erro      = json.error.message;
          // Se temos a lista, mostrar IDs acessíveis para o usuário poder comparar
          if (contasAcessiveis && contasAcessiveis.length > 0) {
            resultado.conta_sugestao = `O ID ${accountId} não está entre as contas acessíveis por este token. Selecione um dos IDs da lista abaixo ou adicione o usuário "${resultado.token_usuario}" como admin desta conta no Meta Business Manager.`;
          } else {
            resultado.conta_sugestao = `O token não tem acesso a nenhuma conta de anúncios. Certifique-se que o usuário "${resultado.token_usuario}" é administrador de pelo menos uma conta no Meta Business Manager.`;
          }
        } else {
          resultado.conta_acessivel = true;
          resultado.conta_nome      = json.name;
          resultado.conta_status    = json.account_status === 1 ? "Ativa" : `Inativa (${json.account_status})`;
        }
      } catch (e) { resultado.conta_erro = String(e); }
    }
  }

  // ok = token válido + conta acessível
  // Não falha por ads_read ausente — debug_token pode não retornar scopes para tokens de sistema
  const ok = resultado.token_valido === true &&
    (!accountId || resultado.conta_acessivel === true);

  return NextResponse.json({ ok, ...resultado });
}
