"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Secao = "analise_estrategica" | "roteiro_sugerido" | "copy_anuncios" | "direcao_criativa";

interface Props {
  entrevistaId: string;
  roteiroId?: string;
  secao: Secao;
  /** "gerar" = seção vazia, "refazer" = seção já existe */
  modo: "gerar" | "refazer";
}

const LABEL: Record<Secao, string> = {
  analise_estrategica: "Análise Estratégica",
  roteiro_sugerido: "Roteiro de Vídeo",
  copy_anuncios: "Roteiro Para Anúncios",
  direcao_criativa: "Direção Criativa",
};

export default function GerarSecaoButton({ entrevistaId, roteiroId, secao, modo }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setErro("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("gerar-roteiro", {
        body: {
          entrevista_id: entrevistaId,
          secao,
          roteiro_id: roteiroId,
        },
      });

      if (error) {
        let detalhe = error.message ?? "Erro ao gerar seção";
        // Lê o body real da resposta HTTP (context é o Response object, ainda não consumido)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
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

      void data;
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado ao chamar Edge Function");
    } finally {
      setLoading(false);
    }
  }

  if (modo === "refazer") {
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-end gap-1">
        <button
          onClick={handleClick}
          disabled={loading}
          className="text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition disabled:opacity-50"
        >
          {loading ? "Gerando..." : "↺ Refazer"}
        </button>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
      </div>
    );
  }

  // modo === "gerar" — estado vazio, botão primário
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-gray-400">Esta seção ainda não foi gerada.</p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-60"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Gerando (~30s)...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Gerar {LABEL[secao]}
          </>
        )}
      </button>
      {erro && <p className="text-sm text-red-500">{erro}</p>}
    </div>
  );
}
