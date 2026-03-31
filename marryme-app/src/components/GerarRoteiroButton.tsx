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
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      // Usa token do usuário se estiver logado, senão anon key (mesmo comportamento do SDK)
      const bearerToken = session?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/gerar-roteiro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${bearerToken}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ entrevista_id: entrevistaId }),
      });

      const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        setErro((resBody.error as string) ?? `Erro ${res.status} ao gerar roteiro`);
        setLoading(false);
        return;
      }

      if (!resBody?.roteiro) {
        setErro((resBody?.error as string) ?? "Roteiro não retornado. Tente novamente.");
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
