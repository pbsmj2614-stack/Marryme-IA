"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { exportarDocumento, type TipoExport } from "@/lib/exportDocx";
import type { Prestador, Roteiro } from "@/lib/types";

interface Props {
  tipo: TipoExport;
  variant?: "primary" | "outline" | "icon";
  prestador: Pick<Prestador, "nome_artistico" | "categoria">;
  // Passar dados diretos (página do prestador) OU buscar por ID (dashboard)
  roteiro?: Roteiro;
  roteiroId?: string;
}

const LABEL: Record<TipoExport, string> = {
  completo:  "Exportar .docx",
  analise:   "Exportar análise",
  roteiro:   "Exportar roteiro",
  anuncios:  "Exportar anúncios",
  direcao:   "Exportar direção",
};

// Ícone de download SVG inline
function IconDownload({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ExportarButton({
  tipo,
  variant = "outline",
  prestador,
  roteiro,
  roteiroId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setErro("");
    setLoading(true);

    try {
      let roteiroFinal = roteiro;

      // Buscar roteiro no Supabase se não foi passado diretamente
      if (!roteiroFinal) {
        if (!roteiroId) throw new Error("Nenhum roteiro disponível.");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("roteiros")
          .select("*")
          .eq("id", roteiroId)
          .single();
        if (error || !data) throw new Error("Roteiro não encontrado.");
        roteiroFinal = data as Roteiro;
      }

      await exportarDocumento(tipo, prestador, roteiroFinal);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao exportar.");
      setTimeout(() => setErro(""), 4000);
    } finally {
      setLoading(false);
    }
  }

  // ── Variante ícone (dashboard) ─────────────────────────────────────────────
  if (variant === "icon") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        title={erro || LABEL[tipo]}
        className={`p-1.5 rounded-lg transition ${
          erro
            ? "text-red-500 bg-red-50"
            : loading
            ? "text-gray-300 cursor-wait"
            : "text-gray-400 hover:text-brand-600 hover:bg-brand-50"
        }`}
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <IconDownload />
        )}
      </button>
    );
  }

  // ── Variante outline (dentro das seções) ───────────────────────────────────
  if (variant === "outline") {
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          onClick={handleClick}
          disabled={loading}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition ${
            loading
              ? "border-gray-200 text-gray-400 cursor-wait"
              : "border-brand-200 text-brand-600 hover:bg-brand-50"
          }`}
        >
          {loading ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <IconDownload className="w-3.5 h-3.5" />
          )}
          {loading ? "Gerando..." : LABEL[tipo]}
        </button>
        {erro && <span className="text-xs text-red-500">{erro}</span>}
      </span>
    );
  }

  // ── Variante primary (botão verde, cabeçalho da página) ────────────────────
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition ${
          loading
            ? "bg-gray-100 text-gray-400 cursor-wait"
            : "bg-emerald-600 hover:bg-emerald-700 text-white"
        }`}
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <IconDownload />
        )}
        {loading ? "Gerando..." : LABEL[tipo]}
      </button>
      {erro && <span className="text-xs text-red-500 text-right">{erro}</span>}
    </span>
  );
}
