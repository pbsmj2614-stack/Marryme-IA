"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Resultado {
  nome: string;
  ok: boolean;
  erro?: string;
  health_score?: number;
}

export default function AtualizarTodosButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ tipo: "ok" | "erro"; linhas: string[] } | null>(null);

  async function handleClick() {
    setLoading(true);
    setPopup(null);
    try {
      const res = await fetch("/api/meta/sincronizar-todos", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        sincronizados?: number;
        total?: number;
        erros?: number;
        resultados?: Resultado[];
        mensagem?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setPopup({ tipo: "erro", linhas: [data.error ?? "Falha desconhecida"] });
        return;
      }

      if (data.sincronizados === 0 && data.mensagem) {
        setPopup({ tipo: "ok", linhas: [data.mensagem] });
        return;
      }

      const linhas: string[] = [`${data.sincronizados}/${data.total} contas atualizadas`];

      const falhas = (data.resultados ?? []).filter((r) => !r.ok);
      if (falhas.length > 0) {
        linhas.push(...falhas.map((f) => `✕ ${f.nome}: ${f.erro ?? "erro"}`));
      }

      setPopup({ tipo: falhas.length > 0 ? "erro" : "ok", linhas });
      router.refresh();
    } catch (e) {
      setPopup({ tipo: "erro", linhas: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setLoading(false);
      setTimeout(() => setPopup(null), 8000);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        title="Atualizar dados Meta Ads de todos os prestadores"
        className="gap-1.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {loading ? "Atualizando…" : "Atualizar Meta Ads"}
      </Button>

      {popup && (
        <div
          className={`absolute right-0 top-10 z-20 text-xs px-3 py-2 rounded-lg shadow-md min-w-[200px] max-w-xs space-y-0.5 ${
            popup.tipo === "erro"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}
        >
          {popup.linhas.map((l, i) => (
            <p key={i} className={i === 0 ? "font-medium" : "text-[11px] opacity-80"}>
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
