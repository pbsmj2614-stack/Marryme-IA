"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function RefazerRoteiroButton({ entrevistaId }: { entrevistaId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleRefazer() {
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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefazer}
        disabled={loading}
        className="text-sm font-medium px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-brand-100 hover:text-brand-700 transition disabled:opacity-60"
      >
        {loading ? "Gerando..." : "↺ Refazer roteiro"}
      </button>
      {loading && <p className="text-xs text-gray-400">Aguarde ~30 segundos...</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
