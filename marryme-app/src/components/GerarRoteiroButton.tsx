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

    const supabase = createClient();
    const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-roteiro", {
      body: { entrevista_id: entrevistaId },
    });

    if (fnError || !fnData?.roteiro) {
      setErro(fnError?.message ?? "Erro ao gerar roteiro");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleGerar}
        disabled={loading}
        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-60"
      >
        {loading ? "Gerando roteiro..." : "Gerar roteiro com IA"}
      </button>
      {loading && (
        <p className="text-xs text-gray-400">Isso pode levar ~30 segundos...</p>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
