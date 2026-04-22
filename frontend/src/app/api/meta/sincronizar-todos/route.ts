/**
 * POST /api/meta/sincronizar-todos
 *
 * Itera todos os prestadores com meta_ad_account_id configurado
 * e chama /api/meta/sincronizar para cada um.
 *
 * Retorna um resumo de sucesso/erro por prestador.
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Vercel Pro/Team

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    // Buscar todos os prestadores com conta Meta configurada
    const { data: prestadores, error } = await supabase
      .from("prestadores")
      .select("id, nome_artistico, meta_ad_account_id")
      .not("meta_ad_account_id", "is", null);

    if (error) throw new Error(error.message);
    if (!prestadores || prestadores.length === 0) {
      return NextResponse.json({
        ok: true,
        sincronizados: 0,
        mensagem: "Nenhum prestador com conta Meta configurada.",
      });
    }

    const baseUrl = req.nextUrl.origin;
    const resultados: Array<{ nome: string; ok: boolean; erro?: string; health_score?: number }> =
      [];

    // Processar em série para não exceder rate limits da Meta API
    for (const p of prestadores) {
      try {
        const res = await fetch(`${baseUrl}/api/meta/sincronizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prestador_id: p.id }),
        });
        const data = (await res.json()) as { ok?: boolean; health_score?: number; error?: string };
        if (!res.ok || !data.ok) {
          resultados.push({
            nome: p.nome_artistico,
            ok: false,
            erro: data.error ?? "Erro desconhecido",
          });
        } else {
          resultados.push({ nome: p.nome_artistico, ok: true, health_score: data.health_score });
        }
      } catch (e) {
        resultados.push({
          nome: p.nome_artistico,
          ok: false,
          erro: e instanceof Error ? e.message : String(e),
        });
      }

      // Pequeno delay entre chamadas para respeitar rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    const sucessos = resultados.filter((r) => r.ok).length;
    const erros = resultados.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      total: prestadores.length,
      sincronizados: sucessos,
      erros,
      resultados,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta/sincronizar-todos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
