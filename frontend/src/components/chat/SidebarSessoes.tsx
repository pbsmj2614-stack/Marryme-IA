"use client";

import { useState, useCallback } from "react";
import type { ChatSessao, ChatTipo } from "@/lib/types";

const TIPO_LABEL: Record<ChatTipo, string> = {
  geral: "Geral",
  video_apresentacao: "Vídeo",
  cta_anuncio: "CTA",
  direcao_criativa: "Direção",
  analise: "Análise",
};

const TIPO_COR: Record<ChatTipo, string> = {
  geral: "bg-slate-600 text-slate-200",
  video_apresentacao: "bg-purple-800/60 text-purple-200",
  cta_anuncio: "bg-blue-800/60 text-blue-200",
  direcao_criativa: "bg-amber-800/60 text-amber-200",
  analise: "bg-green-800/60 text-green-200",
};

interface Props {
  sessoes: ChatSessao[];
  sessaoAtiva: string | null;
  onSelecionar: (id: string) => void;
  onNova: () => void;
  onRenomear: (id: string, titulo: string) => void;
  onArquivar: (id: string) => void;
}

function fmtData(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const diff = hoje.getTime() - d.getTime();
  if (diff < 86400_000)
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86400_000) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function SidebarSessoes({
  sessoes,
  sessaoAtiva,
  onSelecionar,
  onNova,
  onRenomear,
  onArquivar,
}: Props) {
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");

  const filtradas = sessoes.filter(
    (s) => busca === "" || s.titulo.toLowerCase().includes(busca.toLowerCase())
  );

  const iniciarRenomear = useCallback((s: ChatSessao) => {
    setRenomeandoId(s.id);
    setNovoTitulo(s.titulo);
    setMenuAberto(null);
  }, []);

  function confirmarRenomear(id: string) {
    if (novoTitulo.trim()) onRenomear(id, novoTitulo.trim());
    setRenomeandoId(null);
  }

  return (
    <div className="flex flex-col h-full bg-slate-800">
      {/* Botão nova conversa */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNova}
          className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nova conversa
        </button>
      </div>

      {/* Busca */}
      <div className="px-3 pb-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-700 border border-slate-600 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-slate-100 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
        {filtradas.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6 px-3">
            {busca ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
          </p>
        )}

        {filtradas.map((s) => (
          <div
            key={s.id}
            className={`group relative flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition ${
              s.id === sessaoAtiva
                ? "bg-indigo-600/30 border border-indigo-500/40"
                : "hover:bg-slate-700/60"
            }`}
            onClick={() => {
              if (renomeandoId !== s.id) onSelecionar(s.id);
            }}
          >
            <div className="flex-1 min-w-0">
              {renomeandoId === s.id ? (
                <input
                  autoFocus
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  onBlur={() => confirmarRenomear(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmarRenomear(s.id);
                    if (e.key === "Escape") setRenomeandoId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-xs font-medium border border-indigo-400 rounded px-1 py-0.5 outline-none bg-slate-700 text-slate-100"
                />
              ) : (
                <p className="text-xs font-medium text-slate-100 truncate">{s.titulo}</p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TIPO_COR[s.tipo]}`}
                >
                  {TIPO_LABEL[s.tipo]}
                </span>
                <span className="text-[10px] text-slate-400">{fmtData(s.atualizado_em)}</span>
                {s.status === "ativa" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-700/50 text-green-300 font-medium">
                    Em aberto
                  </span>
                )}
                {s.status === "finalizada" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-700/50 text-amber-300 font-medium">
                    Finalizado
                  </span>
                )}
                {s.status === "aprovada" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-700/50 text-blue-300 font-medium">
                    Aprovado
                  </span>
                )}
              </div>
            </div>

            {/* Menu ⋯ */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuAberto(menuAberto === s.id ? null : s.id);
              }}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {menuAberto === s.id && (
              <div
                className="absolute right-1 top-6 z-10 bg-slate-700 border border-slate-600 rounded-lg shadow-lg py-1 min-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => iniciarRenomear(s)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
                >
                  Renomear
                </button>
                <button
                  onClick={() => {
                    onArquivar(s.id);
                    setMenuAberto(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-slate-600"
                >
                  Arquivar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
