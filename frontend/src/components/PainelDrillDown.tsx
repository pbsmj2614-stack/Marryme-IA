"use client";

import { useState } from "react";
import Link from "next/link";
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

const CATEGORIA_LABEL: Record<Categoria, string> = {
  musico: "Músico/Banda",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

const CATEGORIAS: Categoria[] = ["musico", "fotografo", "celebrante", "dj", "outro"];

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; pill: string }> = {
  "Em risco": {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    pill: "bg-red-100 text-red-700 border-red-200",
  },
  "Em atenção": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-700 border-amber-200",
  },
  Saudável: {
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
    pill: "bg-green-100 text-green-700 border-green-200",
  },
  Concluído: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
        />
      </div>
      <span
        className="text-xs font-bold w-9 text-right flex-shrink-0"
        style={{ color: getScoreColor(score) }}
      >
        {score}%
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PainelDrillDown({ prestadores }: { prestadores: PrestadorDrillDown[] }) {
  const [segmento, setSegmento] = useState<"todos" | Categoria>("todos");

  const filtrados =
    segmento === "todos" ? prestadores : prestadores.filter((p) => p.categoria === segmento);

  const comScore = filtrados.filter((p) => p.healthScore !== null) as (PrestadorDrillDown & {
    healthScore: number;
  })[];
  const semScore = filtrados.filter((p) => p.healthScore === null);

  const piores = [...comScore].sort((a, b) => a.healthScore - b.healthScore).slice(0, 5);
  const melhores = [...comScore].sort((a, b) => b.healthScore - a.healthScore).slice(0, 5);

  // Pills de status calculadas sobre TODOS os prestadores (não filtrados por segmento)
  const allComScore = prestadores.filter((p) => p.healthScore !== null) as (PrestadorDrillDown & {
    healthScore: number;
  })[];
  const statusCounts = allComScore.reduce<Record<string, number>>((acc, p) => {
    const s = getStatusFromScore(p.healthScore);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const countBySegmento = (cat: Categoria) => prestadores.filter((p) => p.categoria === cat).length;

  const statusOrder = ["Em risco", "Em atenção", "Saudável", "Concluído"] as const;

  return (
    <div className="mb-6 bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      {/* ── Cabeçalho sempre visível com 3 pills de status ── */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-brand-800 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
          <span className="w-0.5 h-3.5 rounded-full bg-brand-400" />
          Health Score · Prestadores
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {allComScore.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhum relatório gerado ainda</span>
          ) : (
            statusOrder
              .filter((s) => (statusCounts[s] ?? 0) > 0)
              .map((status) => {
                const cfg = STATUS_CONFIG[status];
                return (
                  <span
                    key={status}
                    className={`flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium border ${cfg.pill}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {statusCounts[status]} {status}
                  </span>
                );
              })
          )}
          {prestadores.filter((p) => p.healthScore === null).length > 0 && (
            <span className="text-xs text-muted-foreground">
              · {prestadores.filter((p) => p.healthScore === null).length} sem dados
            </span>
          )}
        </div>
      </div>

      {/* ── Corpo sempre exposto ── */}
      <div className="px-4 pb-4 pt-3 space-y-4">
        {/* Filtro de segmento */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Segmento:</span>
          <button
            onClick={() => setSegmento("todos")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              segmento === "todos"
                ? "bg-brand-700 text-white"
                : "border border-border text-muted-foreground hover:border-brand-400 hover:text-brand-700"
            }`}
          >
            Todos ({prestadores.length})
          </button>
          {CATEGORIAS.map((cat) => {
            const n = countBySegmento(cat);
            if (n === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setSegmento(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  segmento === cat
                    ? "bg-brand-700 text-white"
                    : "border border-border text-muted-foreground hover:border-brand-400 hover:text-brand-700"
                }`}
              >
                {CATEGORIA_LABEL[cat]} ({n})
              </button>
            );
          })}
        </div>

        {/* Stat rápida */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{filtrados.length}</span> prestadores
            {segmento !== "todos" && ` em ${CATEGORIA_LABEL[segmento]}`}
          </span>
          <span>·</span>
          <span>
            <span className="font-semibold text-foreground">{comScore.length}</span> com relatório
          </span>
          {semScore.length > 0 && (
            <>
              <span>·</span>
              <span>
                <span className="font-semibold text-amber-600">{semScore.length}</span> sem dados
              </span>
            </>
          )}
        </div>

        {comScore.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum relatório de campanha gerado
            {segmento !== "todos" ? ` para ${CATEGORIA_LABEL[segmento]}` : ""}.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 5 piores */}
            <div className="rounded-xl border border-red-200 overflow-hidden">
              <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider">
                  Precisam de atenção
                </span>
                <span className="text-xs text-red-600 font-semibold bg-red-100 px-2 py-0.5 rounded-full">
                  Piores scores
                </span>
              </div>
              <div className="divide-y divide-border">
                {piores.map((p, i) => {
                  const status = getStatusFromScore(p.healthScore);
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <Link
                      key={p.id}
                      href={`/prestador/${p.id}`}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-rose-50/50 transition-colors group"
                    >
                      <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0 text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-900 truncate group-hover:text-brand-600">
                          {p.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {CATEGORIA_LABEL[p.categoria]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ScoreBar score={p.healthScore} />
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.bg} ${cfg.text}`}
                        >
                          {status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 5 melhores */}
            <div className="rounded-xl border border-green-200 overflow-hidden">
              <div className="bg-green-50 border-b border-green-200 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-green-800 uppercase tracking-wider">
                  Mais saudáveis
                </span>
                <span className="text-xs text-green-700 font-semibold bg-green-100 px-2 py-0.5 rounded-full">
                  Melhores scores
                </span>
              </div>
              <div className="divide-y divide-border">
                {melhores.map((p, i) => {
                  const status = getStatusFromScore(p.healthScore);
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <Link
                      key={p.id}
                      href={`/prestador/${p.id}`}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-green-50/50 transition-colors group"
                    >
                      <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0 text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-900 truncate group-hover:text-brand-600">
                          {p.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {CATEGORIA_LABEL[p.categoria]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ScoreBar score={p.healthScore} />
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.bg} ${cfg.text}`}
                        >
                          {status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Distribuição por segmento */}
        {segmento === "todos" && (
          <div>
            <p className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-2">
              Distribuição por segmento
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {CATEGORIAS.map((cat) => {
                const tot = prestadores.filter((p) => p.categoria === cat).length;
                if (tot === 0) return null;
                const comScoreCat = prestadores.filter(
                  (p) => p.categoria === cat && p.healthScore !== null
                ) as (PrestadorDrillDown & { healthScore: number })[];
                const avgScore =
                  comScoreCat.length > 0
                    ? Math.round(
                        comScoreCat.reduce((s, p) => s + p.healthScore, 0) / comScoreCat.length
                      )
                    : null;
                return (
                  <button
                    key={cat}
                    onClick={() => setSegmento(cat)}
                    className="bg-background border border-border rounded-xl p-3 text-left hover:border-brand-300 hover:bg-brand-50/40 transition-colors group"
                  >
                    <p className="text-xs font-semibold text-foreground group-hover:text-brand-700">
                      {CATEGORIA_LABEL[cat]}
                    </p>
                    <p className="text-xl font-bold text-brand-900 mt-1">{tot}</p>
                    <p className="text-xs text-muted-foreground">
                      {comScoreCat.length > 0 ? (
                        <span style={{ color: getScoreColor(avgScore!) }}>⌀ {avgScore}%</span>
                      ) : (
                        "sem dados"
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
