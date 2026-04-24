/**
 * GET  /api/chat/sessoes?prestador_id=  — lista sessões do prestador
 * POST /api/chat/sessoes                — cria nova sessão
 * PATCH /api/chat/sessoes               — atualiza título/status/roteiro_final
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ChatTipo } from "@/lib/types";

export async function GET(req: NextRequest) {
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
  const body = (await req.json()) as {
    prestador_id: string;
    titulo?: string;
    tipo?: ChatTipo;
  };

  if (!body.prestador_id)
    return NextResponse.json({ error: "prestador_id obrigatório" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessoes")
    .insert({
      prestador_id: body.prestador_id,
      titulo: body.titulo ?? "Nova conversa",
      tipo: body.tipo ?? "geral",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessao: data });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id: string;
    titulo?: string;
    status?: "ativa" | "finalizada" | "arquivada" | "aprovada";
    roteiro_final?: Record<string, unknown>;
    tokens_usados?: number;
  };

  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const supabase = supabaseAdmin();
  const updates: Record<string, unknown> = {};
  if (body.titulo !== undefined) updates.titulo = body.titulo;
  if (body.status !== undefined) updates.status = body.status;
  if (body.roteiro_final !== undefined) updates.roteiro_final = body.roteiro_final;
  if (body.tokens_usados !== undefined) updates.tokens_usados = body.tokens_usados;

  const { data, error } = await supabase
    .from("chat_sessoes")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessao: data });
}
