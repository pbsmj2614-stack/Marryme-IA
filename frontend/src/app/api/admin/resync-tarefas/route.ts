/**
 * POST /api/admin/resync-tarefas?from=51
 *
 * Reimporta tarefas da planilha para clientes MM### >= from (fetch direto por aba).
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePipelineMaintainer } from "@/lib/api-auth";
import { resyncTarefasCohort } from "@/lib/importSheets";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePipelineMaintainer();
    if (auth.response) return auth.response;

    const fromParam = req.nextUrl.searchParams.get("from");
    const fromNum = fromParam ? parseInt(fromParam, 10) : 51;
    if (!Number.isFinite(fromNum) || fromNum < 1) {
      return NextResponse.json({ error: "Parâmetro from inválido" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const result = await resyncTarefasCohort(supabase, fromNum);

    return NextResponse.json({ ok: true, from: fromNum, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[resync-tarefas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
