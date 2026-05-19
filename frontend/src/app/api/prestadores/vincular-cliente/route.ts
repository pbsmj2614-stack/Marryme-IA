/**
 * POST /api/prestadores/vincular-cliente
 *
 * Vincula um prestador existente a um cliente mm_clientes definindo
 * dados_json.mm_id na entrevista mais recente do prestador.
 *
 * Body: { prestador_id: string, id_cliente: string }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const body = (await req.json().catch(() => null)) as {
      prestador_id?: string;
      id_cliente?: string;
    } | null;

    const prestadorId = body?.prestador_id?.trim();
    const idCliente = body?.id_cliente?.trim().toUpperCase();

    if (!prestadorId || !idCliente) {
      return NextResponse.json(
        { error: "prestador_id e id_cliente são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Verifica que o prestador existe
    const { data: prestador, error: errPrest } = await supabase
      .from("prestadores")
      .select("id")
      .eq("id", prestadorId)
      .maybeSingle();

    if (errPrest || !prestador) {
      return NextResponse.json({ error: "Prestador não encontrado" }, { status: 404 });
    }

    // Verifica que o mm_cliente existe
    const { data: cliente, error: errCliente } = await supabase
      .from("mm_clientes")
      .select("id_cliente")
      .eq("id_cliente", idCliente)
      .maybeSingle();

    if (errCliente || !cliente) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // Busca a entrevista mais recente do prestador
    const { data: entrevistas, error: errEnt } = await supabase
      .from("entrevistas")
      .select("id, dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1);

    if (errEnt) throw new Error(errEnt.message);

    if (!entrevistas || entrevistas.length === 0) {
      return NextResponse.json(
        { error: "Prestador não possui entrevista cadastrada" },
        { status: 422 }
      );
    }

    const entrevista = entrevistas[0];
    const dadosAtual = (entrevista.dados_json as Record<string, unknown>) ?? {};

    const { error: errUpdate } = await supabase
      .from("entrevistas")
      .update({ dados_json: { ...dadosAtual, mm_id: idCliente } })
      .eq("id", entrevista.id);

    if (errUpdate) throw new Error(errUpdate.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vincular-cliente]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
