export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthUser, UNAUTHORIZED } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser();
    if (!user) return UNAUTHORIZED();

    const { id } = params;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const admin = supabaseAdmin();

    // Deleta na ordem correta (FK cascade cobre, mas explícito é mais seguro)
    await admin.from("chat_sessoes").delete().eq("prestador_id", id);
    await admin.from("analises_ia").delete().eq("prestador_id", id);
    await admin.from("relatorios_campanha").delete().eq("prestador_id", id);
    await admin.from("roteiros").delete().eq("prestador_id", id);
    await admin.from("entrevistas").delete().eq("prestador_id", id);

    const { error } = await admin.from("prestadores").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/prestadores]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
