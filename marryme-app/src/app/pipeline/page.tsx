"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase";
import { importarPlanilha } from "@/lib/importSheets";
import { getStatusFromScore, getScoreColor } from "@/lib/healthScore";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusCliente = "Ativo" | "Pausado";
type StatusScore   = "Em risco" | "Em atenção" | "Saudável" | "Concluído";
type FiltroStatus  = "Todos" | "Em risco" | "Em atenção" | "Saudáveis" | "Pausados";
type SortKey =
  | "id_cliente" | "nome_empresa" | "plano"
  | "total_tarefas" | "finalizadas" | "atrasadas" | "score" | "statusScore";

interface Cliente {
  id: string;
  id_cliente: string;
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
  prazo: string | null;       // YYYY-MM-DD
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const FILTROS: FiltroStatus[]   = ["Todos", "Em risco", "Em atenção", "Saudáveis", "Pausados"];
const RESPONSAVEIS               = ["Todos", "Paulo", "Murilo", "Kauê"];
const TODAY                      = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

// ─── Helpers ──────────────────────────────────────────────────────────────────


function isPrazoVencido(prazo: string | null, status: string) {
  if (!prazo || status === "Finalizado") return false;
  return prazo < TODAY;
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  // Add noon to avoid timezone shift
  return new Date(isoDate + "T12:00:00").toLocaleDateString("pt-BR");
}

function planoBadgeClass(plano: string | null) {
  switch (plano?.toLowerCase()) {
    case "premium": return "bg-purple-900 text-purple-300";
    case "growth":  return "bg-green-900 text-green-300";
    default:        return "bg-gray-700 text-gray-200";
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  msg: string;
  type: "success" | "error";
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose, toast]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium transition-all ${
        toast.type === "success"
          ? "bg-green-950 border-green-700 text-green-300"
          : "bg-red-950 border-red-700 text-red-300"
      }`}
    >
      <span>{toast.type === "success" ? "✓" : "✕"}</span>
      <span>{toast.msg}</span>
      <button
        onClick={onClose}
        className="ml-2 opacity-60 hover:opacity-100 text-xs"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────

function ClienteStatusBadge({
  score, clienteStatus,
}: {
  score: number; clienteStatus: StatusCliente;
}) {
  if (clienteStatus === "Pausado")
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">Pausado</span>;

  const status = getStatusFromScore(score);
  const styles: Record<string, string> = {
    "Em risco":   "bg-red-900 text-red-300",
    "Em atenção": "bg-yellow-900 text-yellow-300",
    Saudável:     "bg-green-900 text-green-300",
    Concluído:    "bg-emerald-900 text-emerald-300",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] ?? styles["Em risco"]}`}>
      {status}
    </span>
  );
}

function TarefaStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Finalizado:      "bg-green-900 text-green-300",
    Atrasado:        "bg-red-900 text-red-300",
    "Em andamento":  "bg-blue-900 text-blue-300",
    "Não iniciado":  "bg-gray-700 text-gray-400",
    Cancelado:       "bg-gray-800 text-gray-600 line-through",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-700 text-gray-400"}`}>
      {status}
    </span>
  );
}

// ─── Progresso bar ────────────────────────────────────────────────────────────

function ProgressBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
        />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{score}%</span>
    </div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`ml-1 text-xs ${active ? "text-gray-200" : "text-gray-600"}`}>
      {active ? (dir === "asc" ? "↑" : "↓") : "⇅"}
    </span>
  );
}

// ─── Expanded task table ──────────────────────────────────────────────────────

function TabelaTarefas({
  tarefas,
  clienteId,
  onCheckChange,
}: {
  tarefas: Tarefa[];
  clienteId: string;
  onCheckChange: (tarefaId: string, checked: boolean) => void;
}) {
  if (tarefas.length === 0)
    return <p className="text-gray-500 text-sm py-2">Nenhuma tarefa importada para este cliente.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#1e1e1e] text-gray-500 uppercase tracking-wider">
            <th className="px-3 py-2 text-center w-8">✓</th>
            <th className="px-3 py-2 text-left">Etapa</th>
            <th className="px-3 py-2 text-left">O que?</th>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-left">Quem</th>
            <th className="px-3 py-2 text-left">Prazo</th>
            <th className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {tarefas.map((t) => {
            const vencida = isPrazoVencido(t.prazo, t.status);
            return (
              <tr
                key={t.id}
                className="border-t border-[#2a2a2a] hover:bg-[#1e1e2e] transition-colors"
              >
                {/* Check */}
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={t.check_feito}
                    onChange={(e) => onCheckChange(t.id, e.target.checked)}
                    className="w-3.5 h-3.5 accent-green-500 cursor-pointer"
                    title="Marcar como concluído"
                  />
                </td>
                {/* Etapa */}
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {t.etapa ?? "—"}
                </td>
                {/* O que */}
                <td className="px-3 py-2 text-gray-200">
                  {t.o_que}
                </td>
                {/* Tipo */}
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {t.tipo ?? "—"}
                </td>
                {/* Quem */}
                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                  {t.quem ?? "—"}
                </td>
                {/* Prazo */}
                <td
                  className={`px-3 py-2 whitespace-nowrap font-medium ${
                    vencida ? "text-red-400" : "text-gray-400"
                  }`}
                >
                  {formatDate(t.prazo)}
                  {vencida && <span className="ml-1 text-red-500">!</span>}
                </td>
                {/* Status */}
                <td className="px-3 py-2">
                  <TarefaStatusBadge status={t.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Badge de resumo ──────────────────────────────────────────────────────────

function SummaryBadge({
  label, value, color = "text-gray-200",
}: {
  label: string; value: number | string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-[#2a2a2a] border border-[#333] rounded-lg px-3 py-1.5">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABLE_COLS: { key: SortKey | null; label: string; center?: boolean }[] = [
  { key: "id_cliente",    label: "ID"          },
  { key: "nome_empresa",  label: "Cliente"     },
  { key: "plano",         label: "Plano"       },
  { key: "total_tarefas", label: "Tarefas",  center: true },
  { key: "finalizadas",   label: "Finaliz.",  center: true },
  { key: "atrasadas",     label: "Atrasadas", center: true },
  { key: "score",         label: "Progresso"   },
  { key: null,            label: "Score",     center: true },
  { key: "statusScore",   label: "Status"      },
];

export default function PipelinePage() {
  const router  = useRouter();
  const [user,            setUser]            = useState<User | null>(null);
  const [clientes,        setClientes]        = useState<ClienteComMetricas[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [syncing,         setSyncing]         = useState(false);
  const [toast,           setToast]           = useState<ToastState | null>(null);
  const [filtro,          setFiltro]          = useState<FiltroStatus>("Todos");
  const [busca,           setBusca]           = useState("");
  const [responsavel,     setResponsavel]     = useState("Todos");
  const [sortKey,         setSortKey]         = useState<SortKey | null>(null);
  const [sortDir,         setSortDir]         = useState<"asc" | "desc">("asc");
  const [expandedId,      setExpandedId]      = useState<string | null>(null);

  // ── Load data ──
  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [{ data: clientesData }, { data: tarefasData }] = await Promise.all([
      supabase.from("mm_clientes").select("*").order("id_cliente"),
      supabase.from("mm_tarefas").select("*"),
    ]);

    const rawTarefas = (tarefasData ?? []) as Tarefa[];
    const seenT = new Set<string>();
    const tarefas = rawTarefas.filter((t) => {
      const key = `${t.cliente_id}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`;
      if (seenT.has(key)) return false;
      seenT.add(key);
      return true;
    });

    const resultado: ClienteComMetricas[] = (clientesData ?? []).map((c: Cliente) => {
      const tCliente    = tarefas.filter((t) => t.cliente_id === c.id_cliente);
      const hoje = new Date().toISOString().split("T")[0];
      const finalizadas = tCliente.filter((t) => t.check_feito || t.status === "Finalizado").length;
      const atrasadas   = tCliente.filter((t) =>
        !t.check_feito && t.status !== "Finalizado" && t.status !== "Cancelado" &&
        (t.status === "Atrasado" || (t.prazo != null && t.prazo < hoje))
      ).length;
      const total       = tCliente.length;
      const totalAtivo  = tCliente.filter((t) => t.status !== "Cancelado").length;
      const score       = totalAtivo > 0 ? Math.round((finalizadas / totalAtivo) * 100) : 0;
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
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }
      setUser(authUser);
      await loadData();
    }
    init();
  }, [router, loadData]);

  // ── Sync ──
  async function handleSync() {
    setSyncing(true);
    try {
      const result = await importarPlanilha();
      if (result.erros.length === 0) {
        setToast({
          type: "success",
          msg: `${result.clientes} clientes e ${result.tarefas} tarefas importados`,
        });
      } else {
        setToast({
          type: "error",
          msg: `${result.clientes} clientes · ${result.tarefas} tarefas · ${result.erros.length} erro(s): ${result.erros[0]}`,
        });
      }
      await loadData();
    } catch (err) {
      setToast({ type: "error", msg: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  // ── Check toggle ──
  async function handleCheckChange(tarefaId: string, checked: boolean) {
    // Optimistic update
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        tarefas: c.tarefas.map((t) =>
          t.id === tarefaId ? { ...t, check_feito: checked } : t
        ),
      }))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("mm_tarefas")
      .update({ check_feito: checked, atualizado_em: new Date().toISOString() })
      .eq("id", tarefaId);

    if (error) {
      // Revert on failure
      setClientes((prev) =>
        prev.map((c) => ({
          ...c,
          tarefas: c.tarefas.map((t) =>
            t.id === tarefaId ? { ...t, check_feito: !checked } : t
          ),
        }))
      );
      setToast({ type: "error", msg: `Erro ao salvar: ${error.message}` });
    }
  }

  // ── Summary metrics ──
  const metrics = useMemo(() => {
    const ativos   = clientes.filter((c) => !/paus/i.test(c.status ?? ""));
    const pausados = clientes.filter((c) => /paus/i.test(c.status ?? "")).length;
    const atrasadasTotal = clientes.reduce((s, c) => s + c.atrasadas, 0);
    const emRisco        = ativos.filter((c) => c.score < 50).length;
    return { ativos: ativos.length, pausados, atrasadasTotal, emRisco };
  }, [clientes]);

  // ── Filtered + sorted ──
  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter((c) => {
      // Filtro status
      if (filtro === "Em risco")   return c.statusScore === "Em risco"  && !/paus/i.test(c.status ?? "");
      if (filtro === "Em atenção") return c.statusScore === "Em atenção";
      if (filtro === "Saudáveis")  return c.statusScore === "Saudável"  || c.statusScore === "Concluído";
      if (filtro === "Pausados")   return /paus/i.test(c.status ?? "");
      return true;
    });

    // Filtro busca
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.nome_empresa.toLowerCase().includes(q) ||
          c.id_cliente.toLowerCase().includes(q)
      );
    }

    // Filtro responsável
    if (responsavel !== "Todos") {
      lista = lista.filter((c) =>
        c.responsavel_mm?.toLowerCase().includes(responsavel.toLowerCase())
      );
    }

    // Ordenação
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
  }, [clientes, filtro, busca, responsavel, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando pipeline...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <Header user={user} />

      {toast && (
        <Toast toast={toast} onClose={() => setToast(null)} />
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-3">Pipeline de clientes</h1>
            <div className="flex flex-wrap gap-2">
              <SummaryBadge label="clientes ativos"   value={metrics.ativos}        />
              <SummaryBadge label="tarefas atrasadas" value={metrics.atrasadasTotal}
                color={metrics.atrasadasTotal > 0 ? "text-red-400" : "text-gray-200"} />
              <SummaryBadge label="em risco"          value={metrics.emRisco}
                color={metrics.emRisco > 0 ? "text-red-400" : "text-gray-200"} />
              <SummaryBadge label="pausados"          value={metrics.pausados}
                color="text-gray-400" />
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:border-[#666] hover:text-white transition disabled:opacity-50 whitespace-nowrap"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>↓ Sincronizar Sheets</>
            )}
          </button>
        </div>

        {/* ── Filtros ── */}
        <div className="bg-[#242424] border border-[#333] rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          {/* Pills de status */}
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  filtro === f
                    ? "border-white text-white bg-white/10"
                    : "border-[#444] text-gray-400 hover:border-[#666] hover:text-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="h-5 border-l border-[#333] hidden sm:block" />

          {/* Busca */}
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="bg-[#1a1a1a] border border-[#444] rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#666] w-48"
          />

          {/* Responsável */}
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="bg-[#1a1a1a] border border-[#444] rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#666] cursor-pointer"
          >
            {RESPONSAVEIS.map((r) => (
              <option key={r} value={r}>
                {r === "Todos" ? "Todos os responsáveis" : r}
              </option>
            ))}
          </select>
        </div>

        {/* ── Tabela ── */}
        <div className="rounded-xl border border-[#333] overflow-hidden">
          <div className="bg-[#2a2a2a] border-b border-[#333] px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Clique no cabeçalho para ordenar · Clique na linha para ver tarefas
            </p>
            <p className="text-xs text-gray-600">{clientesFiltrados.length} clientes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#2a2a2a]">
                <tr>
                  {TABLE_COLS.map(({ key, label, center }) => (
                    <th
                      key={label}
                      onClick={() => key && handleSort(key)}
                      className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                        center ? "text-center" : "text-left"
                      } ${key ? "cursor-pointer hover:text-white select-none" : ""}`}
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
                    <td colSpan={9} className="text-center py-16 text-gray-500">
                      Nenhum cliente encontrado
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((c, i) => (
                    <React.Fragment key={c.id}>
                      {/* ── Linha do cliente ── */}
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-white">{c.nome_empresa}</p>
                          {c.responsavel_mm && (
                            <p className="text-xs text-gray-500 mt-0.5">{c.responsavel_mm}</p>
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
                        {/* Progresso */}
                        <td className="px-4 py-3">
                          <ProgressBar score={c.score} />
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
                          <ClienteStatusBadge
                            score={c.score}
                            clienteStatus={c.status}
                          />
                        </td>
                      </tr>

                      {/* ── Linha expandida — tarefas ── */}
                      {expandedId === c.id && (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-5 py-4 bg-[#161625] border-t border-[#1a1a1a]"
                          >
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                Tarefas · {c.nome_empresa}
                              </p>
                              <div className="flex items-center gap-2">
                                {c.fase_projeto && (
                                  <span className="text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded-full">
                                    {c.fase_projeto}
                                  </span>
                                )}
                                <span className="text-xs text-gray-600">
                                  {c.finalizadas}/{c.total_tarefas} concluídas
                                </span>
                              </div>
                            </div>
                            <TabelaTarefas
                              tarefas={c.tarefas}
                              clienteId={c.id_cliente}
                              onCheckChange={handleCheckChange}
                            />
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
      </main>
    </div>
  );
}
