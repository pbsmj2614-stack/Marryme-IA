"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Roteiro, ChatStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface Props {
  sessaoStatus?: ChatStatus;
  onFinalizar?: () => void;
  roteirosAntigos: Roteiro[];
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

interface AntigoCardProps {
  campo: keyof Pick<
    Roteiro,
    "analise_estrategica" | "roteiro_sugerido" | "copy_anuncios" | "direcao_criativa"
  >;
  roteiro: Roteiro;
  onUsarComoBase: (c: string) => void;
}

function AntigoCard({ campo, roteiro, onUsarComoBase }: AntigoCardProps) {
  const [aberto, setAberto] = useState(false);
  const conteudo = JSON.stringify(roteiro[campo], null, 2);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <Button
        variant="ghost"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left h-auto rounded-none"
      >
        <div className="flex items-center gap-2">
          <span>{ICONES_ANTIGOS[campo]}</span>
          <div>
            <p className="text-xs font-medium text-gray-700">{LABELS_ANTIGOS[campo]}</p>
            <p className="text-[10px] text-gray-400">
              {fmtData(roteiro.criado_em)}
              {roteiro.aprovado ? " · ✓ Aprovado" : ""}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${aberto ? "rotate-180" : ""}`}
        />
      </Button>

      {aberto && (
        <div className="px-4 pb-3">
          <div className="prose prose-sm max-w-none text-gray-700 prose-p:my-1 prose-headings:mb-2 prose-headings:mt-3 prose-li:my-0 max-h-48 overflow-y-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{conteudo}</ReactMarkdown>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              onUsarComoBase(
                `Aqui está o conteúdo anterior de "${LABELS_ANTIGOS[campo]}" para usar como base:\n\n\`\`\`json\n${conteudo}\n\`\`\`\n\nPor favor, revise e sugira melhorias.`
              )
            }
            className="mt-2 text-[10px] px-2 py-1 border border-brand-200 text-brand-700 rounded-md hover:bg-brand-50 transition h-auto"
          >
            Usar como base no chat
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RoteiroPainel({
  sessaoStatus,
  onFinalizar,
  roteirosAntigos,
  onUsarComoBase,
}: Props) {
  const [antigoAberto, setAntigoAberto] = useState(false);

  const temAntigos = roteirosAntigos.some(
    (r) => r.analise_estrategica || r.roteiro_sugerido || r.copy_anuncios || r.direcao_criativa
  );

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Painel</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* CTA de finalizar sessão */}
        {onFinalizar && (
          <div className="mx-3 mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs font-semibold text-green-800 mb-1">Roteiro pronto?</p>
            <p className="text-[11px] text-green-700 mb-3">
              Finalize a sessão para enviá-la para a aba Aprovações.
            </p>
            <Button
              onClick={onFinalizar}
              className="w-full text-xs py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium h-auto"
            >
              ✓ Finalizar sessão
            </Button>
          </div>
        )}

        {/* Status da sessão */}
        {sessaoStatus === "finalizada" && (
          <div className="mx-3 mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-800 mb-1">◷ Aguardando revisão</p>
            <p className="text-[11px] text-amber-700">
              Acesse a aba <strong>Aprovações</strong> para revisar e aprovar esta sessão.
            </p>
          </div>
        )}

        {sessaoStatus === "aprovada" && (
          <div className="mx-3 mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs font-semibold text-green-800 mb-1">✓ Sessão aprovada</p>
            <p className="text-[11px] text-green-700">Este roteiro já foi revisado e aprovado.</p>
          </div>
        )}

        {!onFinalizar && !sessaoStatus && (
          <div className="flex flex-col items-center justify-center h-36 px-6 text-center">
            <p className="text-xs font-medium text-gray-500">Sem sessão ativa</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Inicie uma conversa no chat para ver as opções aqui.
            </p>
          </div>
        )}

        {/* Roteiros anteriores */}
        {temAntigos && (
          <div className="mx-3 mt-3 mb-3 border border-gray-200 rounded-xl overflow-hidden">
            <Button
              variant="ghost"
              onClick={() => setAntigoAberto(!antigoAberto)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left h-auto rounded-none"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Roteiros gerados anteriormente
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${antigoAberto ? "rotate-180" : ""}`}
              />
            </Button>

            {antigoAberto && (
              <div>
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
                    .map((campo) => (
                      <AntigoCard
                        key={`${r.id}-${campo}`}
                        campo={campo}
                        roteiro={r}
                        onUsarComoBase={onUsarComoBase}
                      />
                    ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
