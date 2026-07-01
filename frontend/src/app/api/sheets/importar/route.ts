/**
 * POST /api/sheets/importar
 *
 * Importa Cadastro_Clientes + tarefas da planilha para Supabase (service role).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { importarPlanilha } from "@/lib/importSheets";

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const result = await importarPlanilha(supabase);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[importar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
