"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function GerarRoteiroButton({ entrevistaId }: { entrevistaId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleGerar() {
    setErro("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-roteiro", {
        body: { entrevista_id: entrevistaId },
      });

      if (fnError) {
        let detalhe = fnError.message ?? "Erro ao gerar roteiro";
        // Lê o body real da resposta HTTP (context é o Response object, ainda não consumido)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (fnError as any).context;
        if (ctx instanceof Response) {
          try {
            const body = await ctx.clone().json();
            if (body?.error) detalhe = body.error;
            else if (body?.message) detalhe = body.message;
          } catch {
            try { detalhe = (await ctx.clone().text()) || detalhe; } catch { /* ignora */ }
          }
        }
        setErro(detalhe);
        setLoading(false);
        return;
      }

      if (!fnData?.roteiro) {
        setErro(fnData?.error ?? "Roteiro não retornado. Tente novamente.");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado ao chamar Edge Function");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleGerar}
        disabled={loading}
        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-60"
      >
        {loading ? "Gerando roteiro..." : "Gerar roteiro completo"}
      </button>
      {loading && (
        <p className="text-xs text-gray-400">Isso pode levar ~30 segundos...</p>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
