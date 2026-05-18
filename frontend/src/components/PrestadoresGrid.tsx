"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PrestadorCard from "./PrestadorCard";
import PrestadorModal from "./PrestadorModal";
import type { Categoria } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrestadorCardData {
  prestadorId: string;
  nome: string;
  categoria: Categoria;
  cidadeBase: string | null;
  whatsapp: string | null;
  nivelMercado: string | null;
  plano: string | null;
  faseProjeto: string | null;
  mmId: string | null;
  total: number;
  aprovados: number;
  ultimoRoteiroId?: string;
  ultimoRoteiroAprovado?: boolean;
  healthScore: number | null;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="h-5 bg-gray-100 rounded w-40" />
        <div className="h-5 bg-gray-100 rounded w-20" />
      </div>
      <div className="flex gap-2">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-20" />
      </div>
      <div className="h-4 bg-gray-100 rounded w-28" />
      <div className="space-y-2 pt-1">
        <div className="h-4 bg-gray-100 rounded w-32" />
        <div className="h-4 bg-gray-100 rounded w-24" />
      </div>
      <div className="border-t border-gray-100 pt-3 flex justify-between">
        <div className="h-4 bg-gray-100 rounded w-20" />
        <div className="h-4 bg-gray-100 rounded-full w-16" />
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  prestadores: PrestadorCardData[];
  searchQuery?: string;
  tab?: string;
  loading?: boolean;
}

export default function PrestadoresGrid({
  prestadores,
  searchQuery = "",
  tab = "todos",
  loading = false,
}: Props) {
  const router = useRouter();
  const [modalData, setModalData] = useState<PrestadorCardData | null>(null);

  const openModal = useCallback((p: PrestadorCardData) => setModalData(p), []);
  const closeModal = useCallback(() => setModalData(null), []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (prestadores.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        {searchQuery.trim() ? (
          <>
            <p className="text-lg">
              Nenhum prestador encontrado para{" "}
              <span className="font-semibold text-gray-600">&ldquo;{searchQuery}&rdquo;</span>
            </p>
            <button
              onClick={() => router.push(`/?tab=${tab}`)}
              className="mt-3 text-brand-600 hover:underline text-sm"
            >
              Limpar busca
            </button>
          </>
        ) : (
          <>
            <p className="text-lg">Nenhum prestador nesta categoria.</p>
            {tab === "todos" && (
              <a href="/novo" className="mt-3 inline-block text-brand-600 hover:underline text-sm">
                Adicionar o primeiro
              </a>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {prestadores.map((p) => (
          <PrestadorCard
            key={p.prestadorId}
            {...p}
            highlightQuery={searchQuery}
            onOpenModal={() => openModal(p)}
          />
        ))}
      </div>

      {modalData && (
        <PrestadorModal
          prestadorId={modalData.prestadorId}
          nome={modalData.nome}
          categoria={modalData.categoria}
          plano={modalData.plano}
          faseProjeto={modalData.faseProjeto}
          mmId={modalData.mmId}
          total={modalData.total}
          aprovados={modalData.aprovados}
          healthScore={modalData.healthScore}
          onClose={closeModal}
        />
      )}
    </>
  );
}
