"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function excluirPrestadorAction(
  prestadorId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Não autorizado" };

    const admin = supabaseAdmin();

    await admin.from("chat_sessoes").delete().eq("prestador_id", prestadorId);
    await admin.from("analises_ia").delete().eq("prestador_id", prestadorId);
    await admin.from("relatorios_campanha").delete().eq("prestador_id", prestadorId);
    await admin.from("roteiros").delete().eq("prestador_id", prestadorId);
    await admin.from("entrevistas").delete().eq("prestador_id", prestadorId);

    const { error } = await admin.from("prestadores").delete().eq("id", prestadorId);
    if (error) return { ok: false, error: error.message };

    // Invalida cache da home — NÃO invalida a página atual pois isso dispara
    // um re-render imediato que chama notFound() antes da navegação completar
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
