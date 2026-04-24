"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ChatSessao, ChatTipo } from "@/lib/types";

const TIPO_LABEL: Record<ChatTipo, string> = {
  geral: "Geral",
  video_apresentacao: "Vídeo",
  cta_anuncio: "CTA",
  direcao_criativa: "Direção",
  analise: "Análise",
};

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

interface Props {
  sessoes: ChatSessao[];
  prestadorId: string;
}

interface CardProps {
  sessao: ChatSessao;
  prestadorId: string;
  loadingId: string | null;
  onAprovar?: () => void;
  onReabrir: () => void;
}

function SessaoCard({ sessao, prestadorId, loadingId, onAprovar, onReabrir }: CardProps) {
  const carregando = loadingId === sessao.id;
  const isAprovado = sessao.status === "aprovada";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-sm font-medium text-gray-800 truncate">{sessao.titulo}</p>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              isAprovado ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {isAprovado ? "✓ Aprovado" : "Aguardando revisão"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>{TIPO_LABEL[sessao.tipo]}</span>
          <span>·</span>
          <span>{fmtData(sessao.atualizado_em)}</span>
          {sessao.tokens_usados > 0 && (
            <>
              <span>·</span>
              <span>{sessao.tokens_usados.toLocaleString("pt-BR")} tokens</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          href={`/prestador/${prestadorId}?tab=roteiro&sessao=${sessao.id}`}
          className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
        >
          Ver chat
        </Link>
        {!isAprovado && onAprovar && (
          <button
            onClick={onAprovar}
            disabled={carregando}
            className="text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50"
          >
            {carregando ? "..." : "Aprovar"}
          </button>
        )}
        <button
          onClick={onReabrir}
          disabled={carregando}
          className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          title={isAprovado ? "Reabrir para edição" : "Reabrir no chat"}
        >
          {carregando ? "..." : "Reabrir"}
        </button>
      </div>
    </div>
  );
}

export default function RoteirosFinalizados({ sessoes, prestadorId }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const paraRevisar = sessoes.filter((s) => s.status === "finalizada");
  const aprovados = sessoes.filter((s) => s.status === "aprovada");

  async function atualizarStatus(id: string, status: "aprovada" | "ativa") {
    setLoadingId(id);
    await fetch("/api/chat/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    router.refresh();
    setLoadingId(null);
  }

  if (sessoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">Nenhum roteiro finalizado</p>
        <p className="text-xs text-gray-400 mt-1">
          Quando uma conversa for finalizada no chat, ela aparecerá aqui para revisão.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {paraRevisar.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Aguardando aprovação ({paraRevisar.length})
            </h3>
          </div>
          <div className="space-y-2">
            {paraRevisar.map((s) => (
              <SessaoCard
                key={s.id}
                sessao={s}
                prestadorId={prestadorId}
                loadingId={loadingId}
                onAprovar={() => atualizarStatus(s.id, "aprovada")}
                onReabrir={() => atualizarStatus(s.id, "ativa")}
              />
            ))}
          </div>
        </section>
      )}

      {aprovados.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Aprovados ({aprovados.length})
            </h3>
          </div>
          <div className="space-y-2">
            {aprovados.map((s) => (
              <SessaoCard
                key={s.id}
                sessao={s}
                prestadorId={prestadorId}
                loadingId={loadingId}
                onReabrir={() => atualizarStatus(s.id, "ativa")}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
