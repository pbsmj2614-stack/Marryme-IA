"use client";

import { getScoreColor, getStatusFromScore } from "@/lib/healthScore";
import type { Categoria } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrestadorDrillDown {
  id: string;
  nome: string;
  categoria: Categoria;
  healthScore: number | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIA_SHORT: Record<Categoria, string> = {
  musico: "Música",
  fotografo: "Foto",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

const STATUS_CONFIG = [
  { key: "Em risco", color: "#ef4444" },
  { key: "Em atenção", color: "#f59e0b" },
  { key: "Saudável", color: "#22c55e" },
] as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PainelDrillDown({ prestadores }: { prestadores: PrestadorDrillDown[] }) {
  const comScore = (
    prestadores.filter((p) => p.healthScore !== null) as (PrestadorDrillDown & {
      healthScore: number;
    })[]
  ).sort((a, b) => a.healthScore - b.healthScore); // piores primeiro

  const semScore = prestadores.filter((p) => p.healthScore === null);

  const statusCounts = comScore.reduce<Record<string, number>>((acc, p) => {
    const s = getStatusFromScore(p.healthScore);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // Piores → melhores → sem dados; duplicar para loop sem emenda
  const items = [...comScore, ...semScore];
  const doubled = [...items, ...items];
  const duration = Math.max(items.length * 2.8, 20); // segundos

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-slate-800 shadow-lg">
      <div className="bg-slate-900 flex items-stretch h-11">
        {/* ── Label fixo ── */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-white/10 bg-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
          </span>
          <span className="text-[10px] font-bold text-white tracking-[0.15em] uppercase select-none whitespace-nowrap">
            Health Score
          </span>
        </div>

        {/* ── Contagens de status ── */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 border-r border-white/10">
          {STATUS_CONFIG.map(({ key, color }) => {
            const count = statusCounts[key] ?? 0;
            if (count === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-bold tabular-nums" style={{ color }}>
                  {count}
                </span>
                <span className="text-[10px] text-white/40 hidden sm:inline">{key}</span>
              </span>
            );
          })}
          {semScore.length > 0 && (
            <span className="text-[10px] text-white/25 hidden sm:inline">
              {semScore.length} sem dados
            </span>
          )}
          {items.length === 0 && (
            <span className="text-[10px] text-white/30">Nenhum relatório gerado ainda</span>
          )}
        </div>

        {/* ── Ticker rolante ── */}
        <div className="flex-1 overflow-hidden relative min-w-0">
          {/* Gradiente de fade nas bordas */}
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-slate-900 to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none" />

          {items.length > 0 && (
            <div
              className="flex items-center h-full"
              style={{
                animation: `hs-ticker ${duration}s linear infinite`,
                willChange: "transform",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.animationPlayState = "paused")}
              onMouseLeave={(e) => (e.currentTarget.style.animationPlayState = "running")}
            >
              {doubled.map((p, i) => {
                const color = p.healthScore !== null ? getScoreColor(p.healthScore) : "#475569";
                return (
                  <span
                    key={`${p.id}-${i}`}
                    className="inline-flex items-center gap-1.5 px-3 select-none whitespace-nowrap"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[11px] font-semibold text-white/90 tracking-wide">
                      {p.nome}
                    </span>
                    <span className="text-[10px] text-white/35">
                      {CATEGORIA_SHORT[p.categoria]}
                    </span>
                    {p.healthScore !== null ? (
                      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                        {p.healthScore}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-white/20">—</span>
                    )}
                    <span className="text-white/10 mx-1">│</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
