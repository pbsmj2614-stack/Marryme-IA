/**
 * GET  /api/chat/sessoes?prestador_id=  — lista sessões do prestador
 * POST /api/chat/sessoes                — cria nova sessão
 * PATCH /api/chat/sessoes               — atualiza título/status/roteiro_final
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { chatSessaoPostSchema, chatSessaoPatchSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return UNAUTHORIZED();

  const prestadorId = req.nextUrl.searchParams.get("prestador_id");
  if (!prestadorId)
    return NextResponse.json({ error: "prestador_id obrigatório" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessoes")
    .select("*")
    .eq("prestador_id", prestadorId)
    .neq("status", "arquivada")
    .order("atualizado_em", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessoes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return UNAUTHORIZED();

  const parsed = chatSessaoPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  const { prestador_id, titulo, tipo } = parsed.data;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessoes")
    .insert({
      prestador_id,
      titulo: titulo ?? "Nova conversa",
      tipo: tipo ?? "geral",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessao: data });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return UNAUTHORIZED();

  const parsed = chatSessaoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  const { id, titulo, status, roteiro_final, tokens_usados } = parsed.data;

  const supabase = supabaseAdmin();
  const updates: Record<string, unknown> = {};
  if (titulo !== undefined) updates.titulo = titulo;
  if (status !== undefined) updates.status = status;
  if (roteiro_final !== undefined) updates.roteiro_final = roteiro_final;
  if (tokens_usados !== undefined) updates.tokens_usados = tokens_usados;

  const { data, error } = await supabase
    .from("chat_sessoes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessao: data });
}
