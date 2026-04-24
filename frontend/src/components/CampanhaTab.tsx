"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import type { RelatorioCampanha, CampanhaInsight, KPIsCampanha, ContaMeta } from "@/lib/types";
import AnaliseIA from "@/components/AnaliseIA";
import { fmt, fmtBRL, fmtPct } from "@/lib/formatters";

function scoreColor(score: number): { ring: string; text: string; bg: string; label: string } {
  if (score >= 70)
    return {
      ring: "stroke-green-500",
      text: "text-green-600",
      bg: "bg-green-100",
      label: "Saudável",
    };
  if (score >= 40)
    return {
      ring: "stroke-yellow-400",
      text: "text-yellow-600",
      bg: "bg-yellow-100",
      label: "Atenção",
    };
  return { ring: "stroke-red-500", text: "text-red-600", bg: "bg-red-100", label: "Em Risco" };
}

function HealthGauge({ score }: { score: number }) {
  const { ring, text, bg, label } = scoreColor(score);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            className={ring}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${text}`}>{score}</span>
          <span className="text-xs text-gray-400">/ 100</span>
        </div>
      </div>
      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${bg} ${text}`}>
        {label}
      </span>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "good" | "warn" | "bad" | null;
}) {
  const hlCls =
    highlight === "good"
      ? "border-green-200 bg-green-50"
      : highlight === "warn"
        ? "border-yellow-200 bg-yellow-50"
        : highlight === "bad"
          ? "border-red-200 bg-red-50"
          : "border-gray-100 bg-gray-50";
  const valCls =
    highlight === "good"
      ? "text-green-700"
      : highlight === "warn"
        ? "text-yellow-700"
        : highlight === "bad"
          ? "text-red-700"
          : "text-gray-900";
  return (
    <div className={`border rounded-xl px-4 py-3 ${hlCls}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valCls}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{children}</p>;
}

// ─── Tabela de campanhas ──────────────────────────────────────────────────────

function CampanhasTable({ campanhas }: { campanhas: CampanhaInsight[] }) {
  if (campanhas.length === 0) {
    return <p className="text-sm text-gray-400 py-4">Nenhuma campanha encontrada no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {[
              "Campanha",
              "Impressões",
              "Alcance",
              "CTR Link",
              "CPC",
              "CPM",
              "Freq.",
              "Mensagens",
              "Custo/Msg",
              "Hook Rate",
              "ThruPlay",
              "Gasto",
            ].map((h) => (
              <th
                key={h}
                className="text-left py-2 pr-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {campanhas.map((c) => (
            <tr key={c.campaign_id} className="hover:bg-gray-50 transition">
              <td
                className="py-2.5 pr-3 text-gray-800 font-medium max-w-[180px] truncate"
                title={c.campaign_name}
              >
                {c.campaign_name}
              </td>
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{fmt(c.impressions)}</td>
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{fmt(c.reach)}</td>
              {/* CTR link */}
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <span
                  className={`font-medium ${((c.link_ctr ?? 0) || (c.ctr ?? 0)) >= 1 ? "text-green-600" : ((c.link_ctr ?? 0) || (c.ctr ?? 0)) >= 0.5 ? "text-yellow-600" : "text-red-500"}`}
                >
                  {fmtPct((c.link_ctr ?? 0) || (c.ctr ?? 0))}
                </span>
              </td>
              {/* CPC */}
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">
                {c.cpc > 0 ? fmtBRL(c.cpc) : "—"}
              </td>
              {/* CPM */}
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{fmtBRL(c.cpm)}</td>
              {/* Frequência */}
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <span
                  className={
                    c.frequency <= 2
                      ? "text-green-600"
                      : c.frequency <= 3.5
                        ? "text-yellow-600"
                        : "text-red-500"
                  }
                >
                  {fmt(c.frequency, 1)}x
                </span>
              </td>
              {/* Mensagens */}
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <span className="bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {fmt(c.results)}
                </span>
              </td>
              {/* Custo/mensagem */}
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">
                {c.cost_per_result > 0 ? fmtBRL(c.cost_per_result) : "—"}
              </td>
              {/* Hook Rate */}
              <td className="py-2.5 pr-3 whitespace-nowrap">
                {c.hook_rate > 0 ? (
                  <span
                    className={
                      c.hook_rate >= 12
                        ? "text-green-600 font-medium"
                        : c.hook_rate >= 6
                          ? "text-yellow-600"
                          : "text-red-500"
                    }
                  >
                    {fmtPct(c.hook_rate)}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              {/* ThruPlay */}
              <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">
                {c.thruplay > 0 ? fmt(c.thruplay) : <span className="text-gray-300">—</span>}
              </td>
              {/* Gasto */}
              <td className="py-2.5 pr-3 text-gray-700 font-medium whitespace-nowrap">
                {fmtBRL(c.spend)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Gráfico retenção de audiência (horizontal stacked) ──────────────────────

const RETENTION_COLORS = {
  seg_95: "#7c3aed", // 95%+ completou — roxo brand
  seg_75_95: "#059669", // 75–95% — verde
  seg_50_75: "#d97706", // 50–75% — âmbar
  seg_25_50: "#dc2626", // 25–50% — vermelho (saiu cedo)
};

function VideoRetentionChart({
  campanhas,
  hasThruplay,
}: {
  campanhas: CampanhaInsight[];
  hasThruplay: boolean;
}) {
  const comVideo = campanhas.filter((c) => c.video_p25 > 0);

  if (comVideo.length === 0) {
    if (!hasThruplay) return null;
    return (
      <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Retenção de audiência (25 / 50 / 75 / 95%)
        </p>
        <p className="text-sm text-gray-500">
          Dados de retenção detalhados não retornados pela Meta API para este tipo de campanha.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Para campanhas com objetivo <strong>Mensagens</strong>, a Meta geralmente só reporta
          ThruPlay. Para ver o funil completo, configure as colunas no Gerenciador de Anúncios ou
          use campanhas com objetivo <strong>Visualizações de vídeo</strong>.
        </p>
      </div>
    );
  }

  const data = comVideo
    .sort((a, b) => b.video_p25 - a.video_p25)
    .slice(0, 8)
    .map((c) => {
      const p95 = c.video_p100 ?? 0;
      const p75 = Math.max(0, c.video_p75 - p95);
      const p50 = Math.max(0, c.video_p50 - c.video_p75);
      const p25 = Math.max(0, c.video_p25 - c.video_p50);
      return {
        name: c.campaign_name.length > 22 ? c.campaign_name.slice(0, 22) + "…" : c.campaign_name,
        seg_25_50: p25,
        seg_50_75: p50,
        seg_75_95: p75,
        seg_95: p95,
        _total: c.video_p25,
      };
    });

  const barHeight = 36;
  const chartHeight = data.length * barHeight + 60;

  const RETENTION_LABELS: Record<string, string> = {
    seg_25_50: "Saiu em 25–50%",
    seg_50_75: "Saiu em 50–75%",
    seg_75_95: "Saiu em 75–95%",
    seg_95: "Completou 95%+",
  };

  return (
    <div className="mt-6">
      <SectionTitle>Retenção de audiência do vídeo por campanha</SectionTitle>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          barSize={22}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v) => fmt(v)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            width={140}
          />
          <Tooltip
            formatter={(value, name, entry) => {
              const n = Number(value ?? 0);
              const total = (entry.payload as { _total: number })?._total ?? 1;
              const pct = total > 0 ? ` (${((n / total) * 100).toFixed(1)}%)` : "";
              return [`${fmt(n)}${pct}`, RETENTION_LABELS[String(name)] ?? String(name)];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Legend
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                seg_25_50: "Saiu 25–50%",
                seg_50_75: "Saiu 50–75%",
                seg_75_95: "Saiu 75–95%",
                seg_95: "Completou 95%+",
              };
              return labels[value] ?? value;
            }}
          />
          <Bar dataKey="seg_25_50" stackId="r" fill={RETENTION_COLORS.seg_25_50} name="seg_25_50" />
          <Bar dataKey="seg_50_75" stackId="r" fill={RETENTION_COLORS.seg_50_75} name="seg_50_75" />
          <Bar dataKey="seg_75_95" stackId="r" fill={RETENTION_COLORS.seg_75_95} name="seg_75_95" />
          <Bar
            dataKey="seg_95"
            stackId="r"
            fill={RETENTION_COLORS.seg_95}
            name="seg_95"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-300 mt-1 text-center">
        Cor: vermelho = saiu cedo · âmbar · verde · roxo = completou 95%+
      </p>
    </div>
  );
}

// ─── Gráfico gasto por campanha ───────────────────────────────────────────────

function GastoChart({ campanhas }: { campanhas: CampanhaInsight[] }) {
  if (campanhas.length === 0) return null;
  const data = [...campanhas]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map((c) => ({
      name: c.campaign_name.length > 18 ? c.campaign_name.slice(0, 18) + "…" : c.campaign_name,
      gasto: parseFloat(c.spend.toFixed(2)),
      ctr: parseFloat(((c.link_ctr ?? 0) || (c.ctr ?? 0)).toFixed(2)),
    }));

  return (
    <div className="mt-4">
      <SectionTitle>Gasto por campanha (R$)</SectionTitle>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={28} margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v) => `R$${v}`}
            width={50}
          />
          <Tooltip
            formatter={(value) => [fmtBRL(Number(value)), "Gasto"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="gasto" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.ctr >= 1 ? "#8b5cf6" : entry.ctr >= 0.5 ? "#f59e0b" : "#f87171"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-300 mt-1 text-center">
        Cor: roxo = CTR ≥1% · amarelo = 0.5–1% · vermelho = &lt;0.5%
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  prestadorId: string;
  prestadorNome: string;
  metaAccountId: string | null;
  metaSyncStatus: string | null;
  metaUltimaSync: string | null;
  ultimoRelatorio: RelatorioCampanha | null;
  historico: RelatorioCampanha[];
  ultimaAnalise?: Record<string, unknown> | null;
  ultimaAnaliseEm?: string | null;
}

export default function CampanhaTab({
  prestadorId,
  metaAccountId,
  metaSyncStatus,
  metaUltimaSync,
  ultimoRelatorio,
  historico,
  ultimaAnalise,
  ultimaAnaliseEm,
}: Props) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSync, setErroSync] = useState<string | null>(null);

  // Período padrão: últimos 30 dias
  const hoje = new Date().toISOString().slice(0, 10);
  const trintaDiasAtras = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [periodoInicio, setPeriodoInicio] = useState(trintaDiasAtras);
  const [periodoFim, setPeriodoFim] = useState(hoje);

  async function handleSincronizar() {
    setSincronizando(true);
    setErroSync(null);
    try {
      const res = await fetch("/api/meta/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestador_id: prestadorId,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Erro ao sincronizar");
      router.refresh();
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }

  // ── Sem conta configurada ──────────────────────────────────────────────────
  if (!metaAccountId) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Meta Ads não configurado</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          Conecte a conta de anúncios do Meta para visualizar relatórios de campanha
          automaticamente.
        </p>
        <Link
          href={`/prestador/${prestadorId}/configurar`}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          Configurar Meta Ads
        </Link>
      </div>
    );
  }

  const rel = ultimoRelatorio;
  const kpis = rel?.dados_json?.kpis as KPIsCampanha | undefined;
  const campanhas = rel?.dados_json?.campanhas ?? [];
  const conta = rel?.dados_json?.conta as ContaMeta | undefined;
  const score = rel?.health_score ?? null;

  // helpers de highlight
  function ctrHL(v: number | null | undefined): "good" | "warn" | "bad" | null {
    if (!v) return null;
    return v >= 1 ? "good" : v >= 0.5 ? "warn" : "bad";
  }
  function freqHL(v: number | null | undefined): "good" | "warn" | "bad" | null {
    if (!v) return null;
    return v <= 1.5 ? "good" : v <= 3 ? "warn" : "bad";
  }
  function cpmHL(v: number | null | undefined): "good" | "warn" | "bad" | null {
    if (!v) return null;
    return v <= 15 ? "good" : v <= 30 ? "warn" : "bad";
  }
  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-gray-900">
                Relatório de Campanha · Meta Ads
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  metaSyncStatus === "ok"
                    ? "bg-green-100 text-green-700"
                    : metaSyncStatus === "erro"
                      ? "bg-red-100 text-red-700"
                      : metaSyncStatus === "sincronizando"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                }`}
              >
                {metaSyncStatus === "ok"
                  ? "Sincronizado"
                  : metaSyncStatus === "erro"
                    ? "Erro na sync"
                    : metaSyncStatus === "sincronizando"
                      ? "Sincronizando…"
                      : "Pendente"}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Conta: <span className="font-mono">act_{metaAccountId}</span>
              {metaUltimaSync && <> · {new Date(metaUltimaSync).toLocaleString("pt-BR")}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/prestador/${prestadorId}/configurar`}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
            >
              Alterar conta
            </Link>
            {rel && (
              <Link
                href={`/prestador/${prestadorId}/relatorio-pdf`}
                target="_blank"
                className="text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                PDF
              </Link>
            )}
            {/* Seletor de período */}
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="text-xs text-gray-600 bg-transparent outline-none"
              />
              <span className="text-gray-300 text-xs">→</span>
              <input
                type="date"
                value={periodoFim}
                onChange={(e) => setPeriodoFim(e.target.value)}
                className="text-xs text-gray-600 bg-transparent outline-none"
              />
            </div>
            <button
              onClick={handleSincronizar}
              disabled={sincronizando}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            >
              {sincronizando ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline
                    points="23 4 23 10 17 10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20.49 15a9 9 0 11-2.12-9.36L23 10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {sincronizando ? "Sincronizando…" : "Atualizar dados"}
            </button>
          </div>
        </div>
        {erroSync && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            {erroSync}
          </div>
        )}
      </div>

      {/* ── Sem dados ─────────────────────────────────────────────────────── */}
      {!rel && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">
            Nenhum relatório gerado. Clique em &quot;Atualizar dados&quot;.
          </p>
        </div>
      )}

      {rel && kpis && (
        <>
          {/* ── Bloco 1: Health Score ──────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-6 flex-wrap">
              {score !== null && <HealthGauge score={score} />}
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                  Período
                </p>
                <p className="text-sm text-gray-700 font-medium">
                  {new Date(rel.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                  {" → "}
                  {new Date(rel.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>
                    <strong className="text-gray-600">CTR link ≥ 1%</strong> · frequência ≤ 2 · CPM
                    ≤ R$15 = saudável
                  </p>
                  <p>
                    <strong className="text-gray-600">Score:</strong> CTR (40%) · Frequência (20%) ·
                    CPM (40%)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bloco 2: Entrega + Clique ──────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionTitle>Entrega e clique</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Impressões" value={fmt(kpis.impressions)} />
              <KpiCard label="Alcance" value={fmt(kpis.reach)} />
              <KpiCard
                label="Frequência"
                value={fmt(kpis.frequency, 2)}
                sub="impressões / pessoa"
                highlight={freqHL(kpis.frequency)}
              />
              <KpiCard
                label="CPM"
                value={fmtBRL(kpis.cpm)}
                sub="custo por mil impressões"
                highlight={cpmHL(kpis.cpm)}
              />
              <KpiCard
                label="CTR do link"
                value={fmtPct((kpis.link_ctr ?? 0) || (kpis.ctr ?? 0))}
                sub="cliques no link / impressões"
                highlight={ctrHL((kpis.link_ctr ?? 0) || (kpis.ctr ?? 0))}
              />
              <KpiCard
                label="Cliques link"
                value={fmt((kpis.link_clicks ?? 0) || (kpis.clicks ?? 0))}
              />
              <KpiCard
                label="CPC"
                value={kpis.cpc > 0 ? fmtBRL(kpis.cpc) : "—"}
                sub="custo por clique no link"
              />
              <KpiCard label="Gasto total" value={fmtBRL(kpis.spend)} />
              {conta?.saldo != null && (
                <KpiCard
                  label="Saldo"
                  value={fmtBRL(conta.saldo)}
                  sub={conta.metodo === "cartao" ? "Cartão" : undefined}
                />
              )}
            </div>
          </div>

          {/* ── Bloco 3: Resultados ───────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionTitle>Resultado principal (mensagens iniciadas)</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label="Mensagens iniciadas"
                value={fmt(kpis.results)}
                highlight={kpis.results > 0 ? "good" : null}
              />
              <KpiCard
                label="Custo por mensagem"
                value={kpis.cost_per_result > 0 ? fmtBRL(kpis.cost_per_result) : "—"}
              />
              <KpiCard label="Gasto total" value={fmtBRL(kpis.spend)} />
            </div>
          </div>

          {/* ── Bloco 4: Vídeo — só exibe se há ThruPlay real ─────────────── */}
          {kpis.thruplay > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle>Métricas de vídeo</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  label="ThruPlay"
                  value={fmt(kpis.thruplay)}
                  sub="visualizações completas (15s ou 100%)"
                />
                <KpiCard
                  label="Custo / ThruPlay"
                  value={kpis.cost_per_thruplay > 0 ? fmtBRL(kpis.cost_per_thruplay) : "—"}
                />
                {kpis.video_p25 > 0 && (
                  <>
                    <KpiCard
                      label="Chegou a 50%"
                      value={fmt(kpis.video_p50)}
                      sub={
                        kpis.video_p25 > 0
                          ? `${fmtPct((kpis.video_p50 / kpis.video_p25) * 100)} dos que viram 25%`
                          : undefined
                      }
                    />
                    <KpiCard
                      label="Completou 95%+"
                      value={fmt(kpis.video_p100)}
                      sub={
                        kpis.video_p25 > 0
                          ? `${fmtPct((kpis.video_p100 / kpis.video_p25) * 100)} dos que viram 25%`
                          : undefined
                      }
                      highlight={
                        kpis.video_p25 > 0
                          ? kpis.video_p100 / kpis.video_p25 >= 0.5
                            ? "good"
                            : kpis.video_p100 / kpis.video_p25 >= 0.25
                              ? "warn"
                              : "bad"
                          : null
                      }
                    />
                  </>
                )}
              </div>
              <VideoRetentionChart campanhas={campanhas} hasThruplay={kpis.thruplay > 0} />
            </div>
          )}

          {/* ── Bloco 5: Campanhas ────────────────────────────────────────── */}
          {campanhas.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
                Campanhas ({campanhas.length})
              </p>
              <CampanhasTable campanhas={campanhas} />
              <GastoChart campanhas={campanhas} />
            </div>
          )}

          {/* ── Bloco 6: Histórico ────────────────────────────────────────── */}
          {historico.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                Histórico de relatórios
              </p>
              <div className="space-y-2">
                {historico.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-gray-500 text-xs">
                      {new Date(h.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                      {" — "}
                      {new Date(h.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{
                          color:
                            h.health_score !== null && h.health_score >= 70
                              ? "#16a34a"
                              : h.health_score !== null && h.health_score >= 40
                                ? "#d97706"
                                : "#dc2626",
                        }}
                      >
                        HS {h.health_score ?? "—"}
                      </span>
                      {h.dados_json?.kpis && (
                        <span className="text-xs text-gray-400">
                          Gasto: {fmtBRL(h.dados_json.kpis.spend)} · Msgs:{" "}
                          {fmt(h.dados_json.kpis.results)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Bloco 7: Análise IA ───────────────────────────────────────── */}
          <AnaliseIA
            prestadorId={prestadorId}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ultimaAnalise={ultimaAnalise as any}
            ultimaAnaliseEm={ultimaAnaliseEm}
          />
        </>
      )}
    </div>
  );
}
