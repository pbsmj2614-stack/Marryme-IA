"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

interface Prestador {
  id: string;
  nome_artistico: string;
  categoria: string;
}

interface Props {
  atual: Prestador;
  todos: Prestador[];
}

export default function PrestadorSwitcher({ atual, todos }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [aberto]);

  const filtrados = todos
    .filter((p) => p.id !== atual.id)
    .filter((p) => busca === "" || p.nome_artistico.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div ref={ref} className="relative flex items-center gap-1 min-w-0">
      <span className="text-[17px] font-bold text-gray-900 truncate leading-tight">
        {atual.nome_artistico}
      </span>
      <button
        onClick={() => {
          setAberto((v) => !v);
          setBusca("");
        }}
        title="Trocar prestador"
        className={`shrink-0 p-0.5 rounded transition ${
          aberto
            ? "bg-gray-200 text-gray-700"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        }`}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-150 ${aberto ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar prestador…"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtrados.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                {busca ? "Nenhum prestador encontrado" : "Nenhum outro prestador"}
              </p>
            ) : (
              filtrados.map((p) => (
                <Link
                  key={p.id}
                  href={`/prestador/${p.id}?tab=roteiro`}
                  onClick={() => {
                    setAberto(false);
                    setBusca("");
                  }}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition"
                >
                  <span className="text-sm font-medium text-gray-800">{p.nome_artistico}</span>
                  <span className="text-[11px] text-gray-400 ml-2 shrink-0">
                    {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
