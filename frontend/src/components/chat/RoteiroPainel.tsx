"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Roteiro } from "@/lib/types";

interface SecaoAprovada {
  titulo: string;
  conteudo: string;
  aprovada_em: string;
}

interface Props {
  secoes: SecaoAprovada[];
  roteirosAntigos: Roteiro[];
  onCopiarTudo: () => void;
  onFinalizar: () => void;
  onUsarComoBase: (conteudo: string) => void;
}

const ICONES_ANTIGOS: Record<string, string> = {
  analise_estrategica: "📊",
  roteiro_sugerido: "🎬",
  copy_anuncios: "📢",
  direcao_criativa: "🎨",
};

const LABELS_ANTIGOS: Record<string, string> = {
  analise_estrategica: "Análise Estratégica",
  roteiro_sugerido: "Roteiro de Vídeo",
  copy_anuncios: "CTAs Anúncios",
  direcao_criativa: "Direção Criativa",
};

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function SecaoCard({ secao }: { secao: SecaoAprovada }) {
  const [aberta, setAberta] = useState(true);
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(secao.conteudo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setAberta(!aberta)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <span className="text-xs font-semibold text-gray-700">{secao.titulo}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{fmtData(secao.aprovada_em)}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${aberta ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {aberta && (
        <div className="px-4 py-3">
          <div className="prose prose-sm max-w-none text-gray-700 prose-p:my-1 prose-headings:mb-2 prose-headings:mt-3 prose-li:my-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{secao.conteudo}</ReactMarkdown>
          </div>
          <button
            onClick={copiar}
            className="mt-3 text-xs text-gray-400 hover:text-gray-700 transition"
          >
            {copiado ? "✓ Copiado" : "Copiar seção"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function RoteiroPainel({
  secoes,
  roteirosAntigos,
  onCopiarTudo,
  onFinalizar,
  onUsarComoBase,
}: Props) {
  const [antigoAberto, setAntigoAberto] = useState(false);
  const [copiouTudo, setCopiouTudo] = useState(false);

  function handleCopiarTudo() {
    onCopiarTudo();
    setCopiouTudo(true);
    setTimeout(() => setCopiouTudo(false), 1500);
  }

  // Roteiros antigos com pelo menos 1 seção preenchida
  const temAntigos = roteirosAntigos.some(
    (r) => r.analise_estrategica || r.roteiro_sugerido || r.copy_anuncios || r.direcao_criativa
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {secoes.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
            Roteiro ({secoes.length} seção{secoes.length !== 1 ? "ões" : ""})
          </span>
          <button
            onClick={handleCopiarTudo}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            {copiouTudo ? "✓ Copiado" : "Copiar tudo"}
          </button>
          <button
            onClick={onFinalizar}
            className="text-xs px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
          >
            ✓ Finalizar
          </button>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {secoes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <p className="text-xs font-medium text-gray-500">Roteiro vazio</p>
            <p className="text-[11px] text-gray-400 mt-0.5">As seções aprovadas aparecerão aqui</p>
          </div>
        )}

        {/* Seções aprovadas */}
        <div className="p-3 space-y-2">
          {secoes.map((s, i) => (
            <SecaoCard key={i} secao={s} />
          ))}
        </div>

        {/* Roteiros anteriores */}
        {temAntigos && (
          <div className="mx-3 mb-3 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setAntigoAberto(!antigoAberto)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Roteiros gerados anteriormente
              </span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${antigoAberto ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {antigoAberto && (
              <div className="divide-y divide-gray-100">
                {roteirosAntigos.map((r) =>
                  (
                    [
                      "analise_estrategica",
                      "roteiro_sugerido",
                      "copy_anuncios",
                      "direcao_criativa",
                    ] as const
                  )
                    .filter((campo) => r[campo])
                    .map((campo) => {
                      const conteudo = JSON.stringify(r[campo], null, 2);
                      return (
                        <div
                          key={`${r.id}-${campo}`}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <span>{ICONES_ANTIGOS[campo]}</span>
                            <div>
                              <p className="text-xs font-medium text-gray-700">
                                {LABELS_ANTIGOS[campo]}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {fmtData(r.criado_em)}
                                {r.aprovado ? " · ✓ Aprovado" : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              onUsarComoBase(
                                `Aqui está o conteúdo anterior de "${LABELS_ANTIGOS[campo]}" para usar como base:\n\n\`\`\`json\n${conteudo}\n\`\`\`\n\nPor favor, revise e sugira melhorias.`
                              )
                            }
                            className="text-[10px] px-2 py-1 border border-brand-200 text-brand-700 rounded-md hover:bg-brand-50 transition"
                          >
                            Usar como base
                          </button>
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
