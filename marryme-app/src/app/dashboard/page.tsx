"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase";
import { importarPlanilha, type ImportResult } from "@/lib/importSheets";
import { getStatusFromScore, getScoreColor } from "@/lib/healthScore";
import type { User } from "@supabase/supabase-js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusCliente = "Ativo" | "Pausado";
type StatusScore = "Em risco" | "Em atenção" | "Saudável" | "Concluído";
type FiltroStatus = "Todos" | "Em risco" | "Em atenção" | "Saudáveis" | "Pausados";
type SortKey =
  | "id_cliente"
  | "nome_empresa"
  | "plano"
  | "valor_contrato"
  | "total_tarefas"
  | "finalizadas"
  | "atrasadas"
  | "score"
  | "statusScore";

interface Cliente {
  id: string;
  id_cliente: string;        // MM001
  nome_empresa: string;
  segmento: string | null;
  plano: string | null;
  valor_contrato: number;
  status: StatusCliente;
  fase_projeto: string | null;
  responsavel_mm: string | null;
  sheets_aba: string | null;
}

interface Tarefa {
  id: string;
  cliente_id: string;
  check_feito: boolean;
  etapa: string | null;
  o_que: string;
  tipo: string | null;
  quem: string | null;
  prazo: string | null;
  status: string;
  observacoes: string | null;
}

interface ClienteComMetricas extends Cliente {
  total_tarefas: number;
  finalizadas: number;
  atrasadas: number;
  score: number;
  statusScore: StatusScore;
  tarefas: Tarefa[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMRR(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function planoBadgeClass(plano: string | null): string {
  switch (plano?.toLowerCase()) {
    case "premium": return "bg-purple-900 text-purple-300";
    case "growth":  return "bg-green-900 text-green-300";
    default:        return "bg-gray-700 text-gray-200";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, valueColor = "text-white",
}: {
  title: string; value: string; subtitle: string; valueColor?: string;
}) {
  return (
    <div className="bg-[#242424] border border-[#333] rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <p className={`text-3xl font-bold mb-1 ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}

function StatusBadge({
  status, clienteStatus,
}: {
  status: StatusScore; clienteStatus: StatusCliente;
}) {
  if (clienteStatus === "Pausado")
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">Pausado</span>;
  const styles: Record<StatusScore, string> = {
    "Em risco":   "bg-red-900 text-red-300",
    "Em atenção": "bg-yellow-900 text-yellow-300",
    Saudável:     "bg-green-900 text-green-300",
    Concluído:    "bg-emerald-900 text-emerald-300",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function TarefaStatusDot({ status }: { status: string }) {
  const color =
    status === "Finalizado"   ? "bg-green-400" :
    status === "Atrasado"     ? "bg-red-400"   :
    status === "Em andamento" ? "bg-blue-400"  : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function TarefaStatusBadge({ status }: { status: string }) {
  const style =
    status === "Finalizado"   ? "bg-green-900 text-green-300"   :
    status === "Atrasado"     ? "bg-red-900 text-red-300"       :
    status === "Em andamento" ? "bg-blue-900 text-blue-300"     : "bg-gray-700 text-gray-400";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${style}`}>{status}</span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return <span className={`ml-1 ${active ? "text-gray-200" : "text-gray-600"}`}>{active ? (dir === "asc" ? "↑" : "↓") : "⇅"}</span>;
}

// ─── Import button ────────────────────────────────────────────────────────────

function ImportButton({ onImported }: { onImported: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    setLoading(true);
    setResult(null);
    try {
      const r = await importarPlanilha();
      setResult(r);
      if (r.clientes > 0 || r.tarefas > 0) onImported();
    } catch (err) {
      setResult({ clientes: 0, tarefas: 0, erros: [String(err)] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleImport}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:border-[#666] hover:text-white transition disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <span>↓</span> Importar do Sheets
          </>
        )}
      </button>

      {result && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${
          result.erros.length > 0
            ? "bg-red-950 border-red-800 text-red-300"
            : "bg-green-950 border-green-800 text-green-300"
        }`}>
          {result.erros.length === 0 ? (
            <span>✓ {result.clientes} clientes · {result.tarefas} tarefas importadas</span>
          ) : (
            <div>
              <p className="font-medium mb-1">
                {result.clientes} clientes · {result.tarefas} tarefas · {result.erros.length} erro(s)
              </p>
              {result.erros.map((e, i) => (
                <p key={i} className="opacity-75">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTROS: FiltroStatus[] = ["Todos", "Em risco", "Em atenção", "Saudáveis", "Pausados"];

const TABLE_COLS: { key: SortKey | null; label: string }[] = [
  { key: "id_cliente",    label: "ID"          },
  { key: "nome_empresa",  label: "Cliente"     },
  { key: "plano",         label: "Plano"       },
  { key: "valor_contrato",label: "MRR"         },
  { key: "total_tarefas", label: "Tarefas"     },
  { key: "finalizadas",   label: "Finalizadas" },
  { key: "atrasadas",     label: "Atrasadas"   },
  { key: "score",         label: "Progresso"   },
  { key: null,            label: "Score"       },
  { key: "statusScore",   label: "Status"      },
];

export default function DashboardBIPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [clientes, setClientes] = useState<ClienteComMetricas[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroStatus>("Todos");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    const supabase = createClient();
    const [{ data: clientesData }, { data: tarefasData }] = await Promise.all([
      supabase.from("mm_clientes").select("*").order("id_cliente"),
      supabase.from("mm_tarefas").select("*"),
    ]);

    const tarefas = (tarefasData ?? []) as Tarefa[];

    const resultado: ClienteComMetricas[] = (clientesData ?? []).map((c: Cliente) => {
      const tCliente = tarefas.filter((t) => t.cliente_id === c.id_cliente);
      const finalizadas = tCliente.filter((t) => t.status === "Finalizado").length;
      const atrasadas   = tCliente.filter((t) => t.status === "Atrasado").length;
      const total       = tCliente.length;
      const score       = total > 0 ? Math.round((finalizadas / total) * 100) : 0;

      return {
        ...c,
        total_tarefas: total,
        finalizadas,
        atrasadas,
        score,
        statusScore: getStatusFromScore(score) as StatusScore,
        tarefas: tCliente,
      };
    });

    setClientes(resultado);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }
      setUser(authUser);
      await loadData();
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Metrics ──
  const metrics = useMemo(() => {
    const ativos   = clientes.filter((c) => c.status === "Ativo");
    const pausados = clientes.filter((c) => c.status === "Pausado");
    const mrr      = ativos.reduce((s, c) => s + (c.valor_contrato ?? 0), 0);
    const atrasadasTotal    = clientes.reduce((s, c) => s + c.atrasadas, 0);
    const clientesAtrasados = clientes.filter((c) => c.atrasadas > 0).length;
    const emRisco  = ativos.filter((c) => c.score < 50).length;
    return { mrr, ativos: ativos.length, pausados: pausados.length, atrasadasTotal, clientesAtrasados, emRisco };
  }, [clientes]);

  // ── Filtered + sorted ──
  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter((c) => {
      if (filtro === "Em risco")   return c.statusScore === "Em risco"  && c.status === "Ativo";
      if (filtro === "Em atenção") return c.statusScore === "Em atenção";
      if (filtro === "Saudáveis")  return c.statusScore === "Saudável"  || c.statusScore === "Concluído";
      if (filtro === "Pausados")   return c.status === "Pausado";
      return true;
    });

    if (sortKey) {
      lista = [...lista].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number")
          return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc"
          ? String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR")
          : String(bv ?? "").localeCompare(String(av ?? ""), "pt-BR");
      });
    }

    return lista;
  }, [clientes, filtro, sortKey, sortDir]);

  // ── Chart data ──
  const chartData = useMemo(
    () =>
      clientes
        .filter((c) => c.status === "Ativo")
        .sort((a, b) => a.score - b.score)
        .map((c) => ({ nome: c.nome_empresa, score: c.score, color: getScoreColor(c.score) })),
    [clientes]
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <Header user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* ── Título + Import ── */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Dashboard BI</h1>
          <ImportButton onImported={loadData} />
        </div>

        {/* ── Cards de métricas ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <MetricCard
            title="MRR Ativo"
            value={formatMRR(metrics.mrr)}
            subtitle={`${metrics.ativos} contratos ativos`}
          />
          <MetricCard
            title="Clientes Ativos"
            value={String(metrics.ativos)}
            subtitle={`${metrics.pausados} pausados`}
          />
          <MetricCard
            title="Tarefas Atrasadas"
            value={String(metrics.atrasadasTotal)}
            subtitle={`em ${metrics.clientesAtrasados} clientes`}
            valueColor={metrics.atrasadasTotal > 0 ? "text-red-400" : "text-white"}
          />
          <MetricCard
            title="Em Risco (execução)"
            value={String(metrics.emRisco)}
            subtitle="score abaixo de 50"
            valueColor={metrics.emRisco > 0 ? "text-red-400" : "text-white"}
          />
        </div>

        {/* ── Filtros ── */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                filtro === f
                  ? "border-white text-white bg-white/10"
                  : "border-[#444] text-gray-400 hover:border-[#666] hover:text-gray-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* ── Tabela ── */}
        <div className="rounded-xl border border-[#333] overflow-hidden mb-8">
          <div className="bg-[#2a2a2a] border-b border-[#333] px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Clique no cabeçalho para ordenar · Clique na linha para ver as tarefas
            </p>
            <p className="text-xs text-gray-600">{clientesFiltrados.length} clientes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#2a2a2a]">
                <tr>
                  {TABLE_COLS.map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={() => key && handleSort(key)}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                        key ? "cursor-pointer hover:text-white select-none" : ""
                      }`}
                    >
                      {label}
                      {key && <SortIcon active={sortKey === key} dir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {clientesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500">
                      Nenhum cliente neste filtro
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((c, i) => (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() =>
                          setExpandedId(expandedId === c.id ? null : c.id)
                        }
                        className={`cursor-pointer border-t border-[#2a2a2a] transition-colors ${
                          i % 2 === 0 ? "bg-[#1e1e1e]" : "bg-[#222]"
                        } hover:bg-[#2c2c2c]`}
                      >
                        {/* ID */}
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {c.id_cliente}
                        </td>
                        {/* Cliente */}
                        <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                          {c.nome_empresa}
                          {c.segmento && (
                            <span className="ml-2 text-xs text-gray-500 font-normal">
                              {c.segmento}
                            </span>
                          )}
                        </td>
                        {/* Plano */}
                        <td className="px-4 py-3">
                          {c.plano ? (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${planoBadgeClass(c.plano)}`}>
                              {c.plano}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        {/* MRR */}
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                          {formatMRR(c.valor_contrato ?? 0)}
                        </td>
                        {/* Total */}
                        <td className="px-4 py-3 text-center text-gray-300">
                          {c.total_tarefas}
                        </td>
                        {/* Finalizadas */}
                        <td className="px-4 py-3 text-center text-green-400 font-medium">
                          {c.finalizadas}
                        </td>
                        {/* Atrasadas */}
                        <td className={`px-4 py-3 text-center font-medium ${
                          c.atrasadas > 0 ? "text-red-400" : "text-green-400"
                        }`}>
                          {c.atrasadas}
                        </td>
                        {/* Progresso (barra) */}
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${c.score}%`,
                                  backgroundColor: getScoreColor(c.score),
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">
                              {c.score}%
                            </span>
                          </div>
                        </td>
                        {/* Score */}
                        <td
                          className="px-4 py-3 text-center font-bold text-lg"
                          style={{ color: getScoreColor(c.score) }}
                        >
                          {c.score}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={c.statusScore}
                            clienteStatus={c.status}
                          />
                        </td>
                      </tr>

                      {/* Expanded — tarefas */}
                      {expandedId === c.id && (
                        <tr>
                          <td colSpan={10} className="px-6 py-4 bg-[#161625] border-t border-[#1a1a1a]">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                Tarefas · {c.nome_empresa}
                              </p>
                              {c.fase_projeto && (
                                <span className="text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded-full">
                                  {c.fase_projeto}
                                </span>
                              )}
                            </div>

                            {c.tarefas.length === 0 ? (
                              <p className="text-gray-500 text-sm">
                                Nenhuma tarefa importada
                              </p>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {c.tarefas.map((t) => (
                                  <div
                                    key={t.id}
                                    className="flex items-start gap-3 text-sm"
                                  >
                                    <TarefaStatusDot status={t.status} />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-gray-300">{t.o_que}</span>
                                      {t.etapa && (
                                        <span className="ml-2 text-xs text-gray-600">
                                          [{t.etapa}]
                                        </span>
                                      )}
                                    </div>
                                    {t.prazo && (
                                      <span className="text-xs text-gray-600 whitespace-nowrap">
                                        {new Date(t.prazo + "T12:00:00").toLocaleDateString("pt-BR")}
                                      </span>
                                    )}
                                    <TarefaStatusBadge status={t.status} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Gráfico ── */}
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-6 text-white">
            Progresso de execução por cliente (ativos)
          </h2>

          {chartData.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum cliente ativo para exibir</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(chartData.length * 52 + 60, 120)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 50, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#444" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={{ fill: "#d1d5db", fontSize: 13 }}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#242424", border: "1px solid #444", borderRadius: 8, color: "#fff" }}
                  labelStyle={{ color: "#fff", fontWeight: 600 }}
                  formatter={(value) => [`${value}%`, "Score"]}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          <div className="flex gap-6 mt-4 justify-center">
            {[
              { color: "bg-red-500",    label: "Em risco (<50%)"    },
              { color: "bg-yellow-500", label: "Em atenção (50–69%)" },
              { color: "bg-green-500",  label: "Saudável (≥70%)"    },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`w-3 h-3 rounded-sm ${color} inline-block`} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
