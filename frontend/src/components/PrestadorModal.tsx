"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, ArrowRight, Loader2, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { clienteIdsForTarefas } from "@/lib/client-utils";
import { getScoreColor, getStatusFromScore } from "@/lib/healthScore";
import { fmtBRL, fmtPct } from "@/lib/formatters";
import type { KPIsCampanha } from "@/lib/types";

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico/Banda",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

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

const FASES = [
  "Onboarding",
  "Planejamento de Metas",
  "Voo de Cruzeiro",
  "Renovação",
  "Pausado",
  "Churn",
];

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function HealthDonut({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = getScoreColor(score);
  const label = getStatusFromScore(score);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold leading-none" style={{ color }}>
            {score}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
        </div>
      </div>
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full border"
        style={{ color, backgroundColor: color + "18", borderColor: color + "40" }}
      >
        {label}
      </span>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "red" | "green" | "neutral";
}) {
  const containerCls =
    highlight === "red"
      ? "border-red-100 bg-red-50"
      : highlight === "green"
        ? "border-green-100 bg-green-50"
        : "border-border bg-white";
  const textCls =
    highlight === "red"
      ? "text-red-700"
      : highlight === "green"
        ? "text-green-700"
        : "text-foreground";
  return (
    <div className={`rounded-xl border p-3 ${containerCls}`}>
      <p className={`text-xl font-bold leading-none ${textCls}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}

function SkeletonKpis() {
  return (
    <div className="grid grid-cols-2 gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-100" />
      ))}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TarefaResumo {
  total: number;
  finalizadas: number;
  atrasadas: number;
  score: number;
}

interface RelatorioCampanhaDetalhe {
  health_score: number | null;
  gerado_em: string;
  dados_json: { kpis?: KPIsCampanha } | null;
}

export interface PrestadorModalProps {
  prestadorId: string;
  nome: string;
  categoria: string;
  plano: string | null;
  faseProjeto: string | null;
  mmId: string | null;
  total: number;
  aprovados: number;
  healthScore: number | null;
  onClose: () => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PrestadorModal({
  prestadorId,
  nome,
  categoria,
  plano,
  faseProjeto,
  mmId,
  total,
  aprovados,
  healthScore: healthScoreProp,
  onClose,
}: PrestadorModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [tarefas, setTarefas] = useState<TarefaResumo | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioCampanhaDetalhe | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [fase, setFase] = useState(faseProjeto ?? "Onboarding");
  const [savingFase, setSavingFase] = useState(false);

  // Anima entrada
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // ESC fecha
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca dados extras ao abrir
  useEffect(() => {
    setRelatorio(null);
    setTarefas(null);
    setLoadingData(true);
    setFase(faseProjeto ?? "Onboarding");

    async function fetchData() {
      const supabase = createClient();

      async function fetchTarefasResumo() {
        if (!mmId) return null;
        const { data: clienteMm } = await supabase
          .from("mm_clientes")
          .select("sheets_aba")
          .eq("id_cliente", mmId)
          .maybeSingle();
        const ids = clienteIdsForTarefas(mmId, clienteMm?.sheets_aba ?? null);
        const { data } = await supabase
          .from("mm_tarefas")
          .select("check_feito, status, prazo")
          .in("cliente_id", ids);
        return data;
      }

      const [tarefasData, relatorioResult] = await Promise.all([
        fetchTarefasResumo(),
        supabase
          .from("relatorios_campanha")
          .select("health_score, gerado_em, dados_json")
          .eq("prestador_id", prestadorId)
          .order("gerado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (tarefasData) {
        const hoje = new Date().toISOString().split("T")[0];
        const list = tarefasData as {
          check_feito: boolean;
          status: string;
          prazo: string | null;
        }[];
        const fin = list.filter((t) => t.check_feito || t.status === "Finalizado").length;
        const atr = list.filter(
          (t) =>
            !t.check_feito &&
            t.status !== "Finalizado" &&
            t.status !== "Cancelado" &&
            (t.status === "Atrasado" || (t.prazo != null && t.prazo < hoje))
        ).length;
        const totalAtivo = list.filter((t) => t.status !== "Cancelado").length;
        setTarefas({
          total: list.length,
          finalizadas: fin,
          atrasadas: atr,
          score: totalAtivo > 0 ? Math.round((fin / totalAtivo) * 100) : 0,
        });
      } else {
        setTarefas(null);
      }

      if (relatorioResult.data) {
        setRelatorio(relatorioResult.data as RelatorioCampanhaDetalhe);
      } else {
        setRelatorio(null);
      }

      setLoadingData(false);
    }

    void fetchData();
  }, [prestadorId, mmId, faseProjeto]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) handleClose();
  }

  async function handleFaseChange(novaFase: string) {
    setFase(novaFase);
    setSavingFase(true);
    const supabase = createClient();
    const { data: ent } = await supabase
      .from("entrevistas")
      .select("id, dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ent) {
      await supabase
        .from("entrevistas")
        .update({ dados_json: { ...(ent.dados_json as object), fase_projeto: novaFase } })
        .eq("id", ent.id);
    }
    setSavingFase(false);
  }

  const hs = relatorio?.health_score ?? healthScoreProp ?? 0;
  const kpis = relatorio?.dados_json?.kpis;

  const planoKey = plano?.trim().toLowerCase() ?? "";
  const planoCls = PLANO_COLORS[planoKey] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const planoLbl = PLANO_LABEL[planoKey] ?? (plano ? plano : null);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
    >
      <div
        className={`relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Header fixo ── */}
        <div className="bg-gradient-to-r from-brand-700 to-brand-800 text-white px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight truncate">{nome}</h2>
              <p className="text-brand-300 text-sm mt-0.5">
                {CATEGORIA_LABEL[categoria] ?? categoria}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            className="flex items-center gap-2 mt-3 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {planoLbl && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${planoCls}`}>
                {planoLbl}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-brand-300 text-xs">Fase:</span>
              <div className="relative">
                <select
                  value={fase}
                  onChange={(e) => handleFaseChange(e.target.value)}
                  disabled={savingFase}
                  className="text-xs bg-white/10 border border-white/30 rounded-md pl-2 pr-5 py-0.5 text-white focus:outline-none cursor-pointer disabled:opacity-50 appearance-none"
                >
                  {FASES.map((f) => (
                    <option key={f} className="text-foreground bg-white">
                      {f}
                    </option>
                  ))}
                </select>
                {savingFase ? (
                  <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-white/70 pointer-events-none" />
                ) : (
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-white/70 text-[9px] pointer-events-none">
                    ▼
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Corpo rolável ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Health Score */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-4">
              Health Score
            </p>
            {hs > 0 ? (
              <div className="flex items-center gap-6">
                <HealthDonut score={hs} />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Score de saúde da campanha</p>
                  {mmId && <p className="font-mono text-brand-600 font-semibold">{mmId}</p>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum relatório de campanha gerado ainda.
              </p>
            )}
          </div>

          {/* Pipeline CS */}
          {mmId && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-3">
                Pipeline CS
              </p>
              {loadingData ? (
                <SkeletonKpis />
              ) : tarefas && tarefas.total > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <MiniKpi label="Tarefas totais" value={String(tarefas.total)} />
                  <MiniKpi
                    label="Concluídas"
                    value={String(tarefas.finalizadas)}
                    highlight="green"
                  />
                  <MiniKpi
                    label="Atrasadas"
                    value={String(tarefas.atrasadas)}
                    highlight={tarefas.atrasadas > 0 ? "red" : "neutral"}
                  />
                  <MiniKpi label="Progresso" value={`${tarefas.score}%`} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhuma tarefa registrada para {mmId}.
                </p>
              )}
            </div>
          )}

          {/* Roteiros */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-3">
              Roteiros
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MiniKpi label="Total gerados" value={String(total)} />
              <MiniKpi
                label="Aprovados"
                value={String(aprovados)}
                highlight={aprovados > 0 ? "green" : "neutral"}
              />
            </div>
          </div>

          {/* Meta Ads */}
          {kpis && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-3">
                Meta Ads
              </p>
              <div className="grid grid-cols-2 gap-2">
                <MiniKpi label="CTR" value={fmtPct(kpis.link_ctr ?? kpis.ctr)} />
                <MiniKpi label="CPM" value={fmtBRL(kpis.cpm)} />
                <MiniKpi label="Hook Rate" value={fmtPct(kpis.hook_rate)} />
                <MiniKpi label="Gasto total" value={fmtBRL(kpis.spend)} />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer fixo ── */}
        <div className="border-t border-border p-4 flex gap-2 flex-shrink-0">
          <Link
            href={`/prestador/${prestadorId}?tab=roteiro`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-3 py-2.5 rounded-xl transition"
          >
            <MessageSquare className="w-4 h-4" /> Chat IA
          </Link>
          <Link
            href={`/prestador/${prestadorId}/editar`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-rose-50 text-brand-700 border border-brand-200 text-sm font-medium px-3 py-2.5 rounded-xl transition"
          >
            Editar
          </Link>
          <Link
            href={mmId ? `/pipeline?cliente=${encodeURIComponent(mmId)}` : "/pipeline"}
            className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-brand-700 border border-brand-200 text-sm font-medium px-3 py-2.5 rounded-xl transition whitespace-nowrap"
          >
            Pipeline <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
