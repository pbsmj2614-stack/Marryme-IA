"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { RelatorioCampanha, CampanhaInsight } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(n: number) {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function scoreColor(score: number): { ring: string; text: string; bg: string; label: string } {
  if (score >= 70) return { ring: "stroke-green-500",  text: "text-green-600",  bg: "bg-green-100",  label: "Saudável" };
  if (score >= 40) return { ring: "stroke-yellow-400", text: "text-yellow-600", bg: "bg-yellow-100", label: "Atenção" };
  return              { ring: "stroke-red-500",    text: "text-red-600",    bg: "bg-red-100",    label: "Em Risco" };
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
            cx="50" cy="50" r={r}
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
      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${bg} ${text}`}>{label}</span>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Campaigns table ──────────────────────────────────────────────────────────

function CampanhasTable({ campanhas }: { campanhas: CampanhaInsight[] }) {
  if (campanhas.length === 0) {
    return <p className="text-sm text-gray-400 py-4">Nenhuma campanha encontrada no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Campanha</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Impressões</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Cliques</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">CTR</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">CPM</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Gasto</th>
            <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultados</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {campanhas.map((c) => (
            <tr key={c.campaign_id} className="hover:bg-gray-50 transition">
              <td className="py-2.5 pr-4 text-gray-800 font-medium max-w-[200px] truncate" title={c.campaign_name}>
                {c.campaign_name}
              </td>
              <td className="py-2.5 px-2 text-right text-gray-600">{fmt(c.impressions)}</td>
              <td className="py-2.5 px-2 text-right text-gray-600">{fmt(c.clicks)}</td>
              <td className="py-2.5 px-2 text-right">
                <span className={`font-medium ${c.ctr >= 1 ? "text-green-600" : c.ctr >= 0.5 ? "text-yellow-600" : "text-red-500"}`}>
                  {fmtPct(c.ctr)}
                </span>
              </td>
              <td className="py-2.5 px-2 text-right text-gray-600">{fmtBRL(c.cpm)}</td>
              <td className="py-2.5 px-2 text-right text-gray-700 font-medium">{fmtBRL(c.spend)}</td>
              <td className="py-2.5 pl-2 text-right">
                <span className="bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {fmt(c.results)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function GastoChart({ campanhas }: { campanhas: CampanhaInsight[] }) {
  if (campanhas.length === 0) return null;
  const data = [...campanhas]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map((c) => ({
      name: c.campaign_name.length > 18 ? c.campaign_name.slice(0, 18) + "…" : c.campaign_name,
      gasto: parseFloat(c.spend.toFixed(2)),
      ctr: parseFloat(c.ctr.toFixed(2)),
    }));

  return (
    <div className="mt-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Gasto por campanha (R$)</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={28} margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v) => `R$${v}`} width={50} />
          <Tooltip
            formatter={(value: number) => [fmtBRL(value), "Gasto"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="gasto" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.ctr >= 1 ? "#8b5cf6" : entry.ctr >= 0.5 ? "#f59e0b" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-300 mt-1 text-center">Cor: roxo = CTR &ge;1% · amarelo = CTR 0.5-1% · vermelho = CTR &lt;0.5%</p>
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
}

export default function CampanhaTab({
  prestadorId,
  prestadorNome,
  metaAccountId,
  metaSyncStatus,
  metaUltimaSync,
  ultimoRelatorio,
  historico,
}: Props) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSync,     setErroSync]       = useState<string | null>(null);

  async function handleSincronizar() {
    setSincronizando(true);
    setErroSync(null);
    try {
      const res = await fetch("/api/meta/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestador_id: prestadorId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
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
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Meta Ads não configurado</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          Conecte a conta de anúncios do Meta para visualizar relatórios de campanha automaticamente.
        </p>
        <Link
          href={`/prestador/${prestadorId}/configurar`}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Configurar Meta Ads
        </Link>
      </div>
    );
  }

  const rel = ultimoRelatorio;
  const kpis = rel?.dados_json.kpis;
  const campanhas = rel?.dados_json.campanhas ?? [];
  const score = rel?.health_score ?? null;

  return (
    <div className="space-y-4">

      {/* ── Header: status + botões ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-gray-900">Relatório de Campanha</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                metaSyncStatus === "ok"            ? "bg-green-100 text-green-700" :
                metaSyncStatus === "erro"          ? "bg-red-100 text-red-700" :
                metaSyncStatus === "sincronizando" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                {metaSyncStatus === "ok"            ? "Sincronizado" :
                 metaSyncStatus === "erro"          ? "Erro na sync" :
                 metaSyncStatus === "sincronizando" ? "Sincronizando…" :
                 "Pendente"}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Conta: <span className="font-mono">act_{metaAccountId}</span>
              {metaUltimaSync && (
                <> · Atualizado em {new Date(metaUltimaSync).toLocaleString("pt-BR")}</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
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
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Exportar PDF
              </Link>
            )}
            <button
              onClick={handleSincronizar}
              disabled={sincronizando}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            >
              {sincronizando ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" strokeLinecap="round" strokeLinejoin="round" />
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

      {/* ── Sem dados ainda ─────────────────────────────────────────────────── */}
      {!rel && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm mb-4">Nenhum relatório gerado ainda. Clique em "Atualizar dados" para buscar as métricas.</p>
        </div>
      )}

      {rel && kpis && (
        <>
          {/* ── Bloco 1: Health Score ──────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-6 flex-wrap">
              {score !== null && <HealthGauge score={score} />}
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Período analisado</p>
                <p className="text-sm text-gray-700 font-medium">
                  {new Date(rel.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                  {" → "}
                  {new Date(rel.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
                <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                  <p>• <strong className="text-gray-700">CTR alto</strong> (&ge;1%) e frequência baixa (&le;2) = campanha saudável</p>
                  <p>• <strong className="text-gray-700">CPM baixo</strong> (&le;R$20) indica segmentação eficiente</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bloco 2: KPIs ─────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Métricas do período</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Impressões"    value={fmt(kpis.impressions)}        />
              <KpiCard label="Alcance"       value={fmt(kpis.reach)}              />
              <KpiCard label="Cliques"       value={fmt(kpis.clicks)}             />
              <KpiCard label="CTR"           value={fmtPct(kpis.ctr)}            sub="cliques / impressões" />
              <KpiCard label="CPM"           value={fmtBRL(kpis.cpm)}            sub="custo por mil impressões" />
              <KpiCard label="Frequência"    value={fmt(kpis.frequency, 2)}       sub="impressões por pessoa" />
              <KpiCard label="Gasto total"   value={fmtBRL(kpis.spend)}          />
              <KpiCard
                label="Resultados"
                value={fmt(kpis.results)}
                sub={kpis.results > 0 ? `CPA: ${fmtBRL(kpis.cost_per_result)}` : undefined}
              />
            </div>
          </div>

          {/* ── Bloco 3: Tabela de campanhas ──────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
              Campanhas ({campanhas.length})
            </p>
            <CampanhasTable campanhas={campanhas} />
          </div>

          {/* ── Bloco 4: Gráfico ──────────────────────────────────────────── */}
          {campanhas.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <GastoChart campanhas={campanhas} />
            </div>
          )}
        </>
      )}

      {/* ── Bloco 5: Histórico ──────────────────────────────────────────────── */}
      {historico.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Histórico de relatórios</p>
          <div className="space-y-2">
            {historico.map((h, i) => {
              const sc = h.health_score;
              const colors = sc !== null ? scoreColor(sc) : null;
              return (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                    <span className="text-sm text-gray-700">
                      {new Date(h.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                      {" — "}
                      {new Date(h.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {sc !== null && colors && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {sc}/100
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(h.gerado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
