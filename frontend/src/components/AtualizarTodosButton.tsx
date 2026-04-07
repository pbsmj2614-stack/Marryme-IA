"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AtualizarTodosButton() {
  const router = useRouter();
  const [loading,    setLoading]    = useState(false);
  const [resultado,  setResultado]  = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await fetch("/api/meta/sincronizar-todos", { method: "POST" });
      const data = await res.json() as {
        ok?: boolean;
        sincronizados?: number;
        total?: number;
        erros?: number;
        mensagem?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setResultado(`Erro: ${data.error ?? "falha desconhecida"}`);
      } else if (data.sincronizados === 0 && data.mensagem) {
        setResultado(data.mensagem);
      } else {
        setResultado(`${data.sincronizados}/${data.total} contas atualizadas${data.erros ? ` · ${data.erros} erro(s)` : ""}`);
        router.refresh();
      }
    } catch (e) {
      setResultado(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      // Limpa a mensagem após 5s
      setTimeout(() => setResultado(null), 5000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={loading}
        title="Atualizar dados Meta Ads de todos os prestadores"
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
      >
        <svg
          className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {loading ? "Atualizando…" : "Atualizar Meta Ads"}
      </button>

      {resultado && (
        <div className={`absolute right-0 top-10 z-20 text-xs px-3 py-2 rounded-lg shadow-md whitespace-nowrap ${
          resultado.startsWith("Erro") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"
        }`}>
          {resultado}
        </div>
      )}
    </div>
  );
}
