"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MoreVertical,
  Check,
  Pencil,
  Copy,
  Trash2,
  LayoutDashboard,
  Phone,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import ExportarButton from "@/components/ExportarButton";
import { ConfirmDialog } from "@/components/ui";
import type { Categoria } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";
// Destaca termo de busca no texto
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLANO_COLORS: Record<string, string> = {
  essencial: "bg-pink-50 text-pink-700 border-pink-100",
  growth: "bg-violet-50 text-violet-700 border-violet-100",
  enterprise: "bg-amber-50 text-amber-700 border-amber-100",
  premium: "bg-purple-50 text-purple-700 border-purple-100",
  trial: "bg-gray-100 text-gray-500 border-gray-200",
};

const PLANO_LABEL: Record<string, string> = {
  essencial: "Essencial",
  growth: "Growth",
  enterprise: "Enterprise",
  premium: "Premium",
  trial: "Trial",
};

const FASE_TEXT_COLORS: Record<string, string> = {
  Onboarding: "text-green-700",
  "Planejamento de Metas": "text-sky-700",
  "Voo de Cruzeiro": "text-violet-700",
  Renovação: "text-amber-700",
  Pausado: "text-pink-600",
  Churn: "text-zinc-500",
};

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

// ─── Health Score pill ────────────────────────────────────────────────────────

function HsPill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-200">
        Sem dados
      </span>
    );
  }
  if (score >= 70) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
        HS {score} · Saudável
      </span>
    );
  }
  if (score >= 50) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
        HS {score} · Em atenção
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
      HS {score} · Em risco
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  prestadorId: string;
  nome: string;
  categoria: string;
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
  healthScore?: number | null;
  highlightQuery?: string;
  onOpenModal?: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PrestadorCard({
  prestadorId,
  nome,
  categoria,
  cidadeBase,
  whatsapp,
  nivelMercado,
  plano,
  faseProjeto,
  mmId,
  total,
  aprovados,
  ultimoRoteiroId,
  ultimoRoteiroAprovado,
  healthScore,
  highlightQuery = "",
  onOpenModal,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingAcao, setLoadingAcao] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  type DialogState = { type: "none" } | { type: "rename" } | { type: "delete" };
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });

  const temRoteiro = total > 0;
  const cidadeCurta = cidadeBase ? cidadeBase.split(/\s*[\(\-,]/)[0].trim() : null;
  const nivelCurto = nivelMercado ? nivelMercado.split(/[.,]|\s+com\s/)[0].trim() : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleAprovar() {
    if (!ultimoRoteiroId) return;
    setMenuOpen(false);
    setLoadingAcao("aprovar");
    const supabase = createClient();
    await supabase
      .from("roteiros")
      .update({ aprovado: !ultimoRoteiroAprovado })
      .eq("id", ultimoRoteiroId);
    router.refresh();
    setLoadingAcao(null);
  }

  function handleRenomear() {
    setMenuOpen(false);
    setDialog({ type: "rename" });
  }

  async function confirmRenomear(novoNome: string) {
    setDialog({ type: "none" });
    if (!novoNome.trim() || novoNome.trim() === nome) return;
    setLoadingAcao("renomear");
    const supabase = createClient();
    await supabase
      .from("prestadores")
      .update({ nome_artistico: novoNome.trim() })
      .eq("id", prestadorId);
    router.refresh();
    setLoadingAcao(null);
  }

  async function handleDuplicar() {
    setMenuOpen(false);
    setLoadingAcao("duplicar");
    const supabase = createClient();
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("*")
      .eq("id", prestadorId)
      .single();
    const { data: entrevista } = await supabase
      .from("entrevistas")
      .select("dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!prestador) {
      setLoadingAcao(null);
      return;
    }
    const { data: novo } = await supabase
      .from("prestadores")
      .insert({
        nome_artistico: `${prestador.nome_artistico} (cópia)`,
        categoria: prestador.categoria,
        whatsapp: prestador.whatsapp,
        email: prestador.email,
        cidade_base: prestador.cidade_base,
        instagram: prestador.instagram,
      })
      .select()
      .single();
    if (!novo) {
      setLoadingAcao(null);
      return;
    }
    if (entrevista?.dados_json) {
      await supabase
        .from("entrevistas")
        .insert({ prestador_id: novo.id, dados_json: entrevista.dados_json });
    }
    router.push(`/prestador/${novo.id}`);
  }

  function handleExcluir() {
    setMenuOpen(false);
    setDialog({ type: "delete" });
  }

  async function confirmExcluir() {
    setDialog({ type: "none" });
    setLoadingAcao("excluir");
    const supabase = createClient();
    await supabase.from("prestadores").delete().eq("id", prestadorId);
    router.refresh();
    setLoadingAcao(null);
  }

  function handleCopiarWhatsApp() {
    if (!whatsapp) return;
    setMenuOpen(false);
    navigator.clipboard.writeText(whatsapp).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  const carregando = loadingAcao !== null;
  const faseColor = FASE_TEXT_COLORS[faseProjeto ?? "Onboarding"] ?? "text-gray-500";

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-brand-300 transition group cursor-pointer ${carregando ? "opacity-60 pointer-events-none" : ""}`}
      onClick={() => (onOpenModal ? onOpenModal() : router.push(`/prestador/${prestadorId}`))}
    >
      {/* Linha 1: nome + badge status roteiro */}
      <div className="flex items-start justify-between gap-2 pr-6">
        <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition leading-snug">
          <HighlightText text={nome} query={highlightQuery} />
        </h3>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
            temRoteiro
              ? aprovados > 0
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {temRoteiro
            ? aprovados > 0
              ? `${aprovados} aprovado${aprovados > 1 ? "s" : ""}`
              : "Aguardando"
            : "Sem roteiro"}
        </span>
      </div>

      {/* Linha 2: categoria, plano, nível, mmId */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
          {CATEGORIA_LABEL[categoria] ?? categoria}
        </span>
        {plano &&
          (() => {
            const k = plano.trim().toLowerCase();
            const cls = PLANO_COLORS[k] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const label =
              PLANO_LABEL[k] ?? plano.charAt(0).toUpperCase() + plano.slice(1).toLowerCase();
            return (
              <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${cls}`}>
                {label}
              </span>
            );
          })()}
        {nivelCurto && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
            {nivelCurto}
          </span>
        )}
        {mmId && (
          <span className="text-xs font-mono bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
            {mmId}
          </span>
        )}
      </div>

      {/* Fase como texto simples (editável só no modal) */}
      <div className="mt-2">
        <span className="text-xs text-gray-400">Fase: </span>
        <span className={`text-xs font-medium ${faseColor}`}>{faseProjeto ?? "Onboarding"}</span>
      </div>

      {/* Contatos */}
      <div className="mt-3 space-y-1.5">
        {whatsapp && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <svg
              className="w-3.5 h-3.5 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate">{formatarTelefone(whatsapp)}</span>
          </div>
        )}
        {cidadeCurta && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg
              className="w-3.5 h-3.5 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{cidadeCurta}</span>
          </div>
        )}
      </div>

      {/* Footer: roteiros + health score + export */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">
            {total === 0 ? "Sem roteiro" : `${total} roteiro${total !== 1 ? "s" : ""}`}
          </span>
          <span onClick={(e) => e.stopPropagation()}>
            <HsPill score={healthScore} />
          </span>
        </div>
        {ultimoRoteiroAprovado && ultimoRoteiroId && (
          <span onClick={(e) => e.stopPropagation()}>
            <ExportarButton
              tipo="completo"
              variant="icon"
              prestador={{ nome_artistico: nome, categoria: categoria as Categoria }}
              roteiroId={ultimoRoteiroId}
            />
          </span>
        )}
      </div>

      {/* Feedback de cópia */}
      {copyFeedback && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 bg-brand-800 text-white text-xs px-3 py-1 rounded-full shadow whitespace-nowrap">
          WhatsApp copiado!
        </div>
      )}

      {/* Botão 3 pontos */}
      <div ref={menuRef} className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          title="Opções"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
            {/* Ver dashboard */}
            {onOpenModal && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 transition rounded-none"
              >
                <LayoutDashboard className="w-4 h-4 text-brand-500" />
                Ver dashboard
              </button>
            )}

            {/* Editar cadastro */}
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push(`/prestador/${prestadorId}/editar`);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Pencil className="w-4 h-4 text-blue-500" />
              Editar cadastro
            </button>

            {/* Ver no pipeline */}
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/pipeline");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <ArrowRight className="w-4 h-4 text-violet-500" />
              Ver no pipeline
            </button>

            {/* Copiar WhatsApp */}
            {whatsapp && (
              <button
                onClick={handleCopiarWhatsApp}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                <Phone className="w-4 h-4 text-green-500" />
                Copiar WhatsApp
              </button>
            )}

            <div className="my-1 border-t border-gray-100" />

            {/* Aprovar roteiro */}
            <button
              onClick={handleAprovar}
              disabled={!ultimoRoteiroId}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
            >
              <Check className="w-4 h-4 text-green-500" />
              {ultimoRoteiroAprovado ? "Desaprovar roteiro" : "Aprovar roteiro"}
            </button>

            {/* Renomear */}
            <button
              onClick={handleRenomear}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Copy className="w-4 h-4 text-brand-500" />
              Renomear
            </button>

            {/* Duplicar */}
            <button
              onClick={handleDuplicar}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Copy className="w-4 h-4 text-brand-500" />
              Duplicar
            </button>

            <div className="my-1 border-t border-gray-100" />

            {/* Excluir */}
            <button
              onClick={handleExcluir}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span className="text-red-600 font-medium">Excluir</span>
            </button>
          </div>
        )}
      </div>

      {/* Indicador de loading */}
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
          <Loader2 className="animate-spin h-5 w-5 text-brand-500" />
        </div>
      )}

      <ConfirmDialog
        kind="prompt"
        open={dialog.type === "rename"}
        title="Renomear prestador"
        defaultValue={nome}
        confirmLabel="Renomear"
        onConfirm={confirmRenomear}
        onCancel={() => setDialog({ type: "none" })}
      />

      <ConfirmDialog
        kind="confirm"
        open={dialog.type === "delete"}
        title={`Excluir "${nome}"?`}
        message="Esta ação remove o prestador e todos os roteiros permanentemente."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={confirmExcluir}
        onCancel={() => setDialog({ type: "none" })}
      />
    </div>
  );
}
