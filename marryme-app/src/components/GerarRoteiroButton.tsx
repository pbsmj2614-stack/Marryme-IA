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
      const { data: { session } } = await supabase.auth.getSession();

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gerar-roteiro`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({ entrevista_id: entrevistaId }),
      });

      const resBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(resBody.error ?? `Erro ${res.status} ao gerar roteiro`);
        setLoading(false);
        return;
      }

      if (!resBody?.roteiro) {
        setErro(resBody?.error ?? "Roteiro não retornado. Tente novamente.");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
    }

    setLoading(false);
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
