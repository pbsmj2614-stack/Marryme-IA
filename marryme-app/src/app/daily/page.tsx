"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase";
import { importarPlanilha } from "@/lib/importSheets";
import { getScoreColor } from "@/lib/healthScore";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cliente {
  id: string;
  id_cliente: string;
  nome_empresa: string;
  plano: string | null;
  status: string;
  responsavel_mm: string | null;
  valor_contrato: number;
}

interface Tarefa {
  id: string;
  cliente_id: string;
  check_feito: boolean;
  etapa: string | null;
  o_que: string;
  tipo: string | null;
  quem: string | null;
  prazo: string | null; // YYYY-MM-DD
  status: string;
  observacoes: string | null;
}

interface TarefaComCliente extends Tarefa {
  cliente: Cliente;
}

interface ClienteComMetricas extends Cliente {
  tarefas: Tarefa[];
  score: number;
  finalizadas: number;
  atrasadas: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const RESPONSAVEIS = ["Paulo", "Murilo", "Kauê"];

const TODAY = new Date().toISOString().split("T")[0];
const WEEK_END = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
})();
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { msg: string; type: "success" | "error" }

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose, toast]);
  return (
    <div className={`fixed bottom-24 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium ${
      toast.type === "success"
        ? "bg-green-950 border-green-700 text-green-300"
        : "bg-red-950 border-red-700 text-red-300"
    }`}>
      <span>{toast.type === "success" ? "✓" : "✕"}</span>
      <span>{toast.msg}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Modal de tarefas ─────────────────────────────────────────────────────────

function ModalTarefas({
  cliente,
  tarefas,
  onClose,
  onCheckChange,
}: {
  cliente: ClienteComMetricas;
  tarefas: Tarefa[];
  onClose: () => void;
  onCheckChange: (id: string, val: boolean) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#242424] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
          <div>
            <p className="font-bold text-white text-base">{cliente.nome_empresa}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {cliente.id_cliente} · Score {cliente.score}% · {cliente.finalizadas}/{tarefas.length} concluídas
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Lista de tarefas */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {tarefas.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Nenhuma tarefa cadastrada.</p>
          ) : (
            tarefas.map((t) => {
              const vencida = t.prazo && t.prazo < TODAY && t.status !== "Finalizado";
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    vencida ? "border-red-900 bg-red-950/30" : "border-[#2a2a2a] bg-[#1e1e1e]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={t.check_feito}
                    onChange={(e) => onCheckChange(t.id, e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-green-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${t.check_feito ? "line-through text-gray-500" : "text-gray-200"}`}>
                      {t.o_que}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.etapa && <span className="text-xs text-gray-600">{t.etapa}</span>}
                      {t.quem && <span className="text-xs text-blue-400">{t.quem}</span>}
                      {t.prazo && (
                        <span className={`text-xs ${vencida ? "text-red-400 font-bold" : "text-gray-500"}`}>
                          {formatDate(t.prazo)}{vencida ? " !" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    t.status === "Finalizado"     ? "bg-green-900 text-green-300"  :
                    t.status === "Atrasado"       ? "bg-red-900 text-red-300"      :
                    t.status === "Em andamento"   ? "bg-blue-900 text-blue-300"    :
                                                    "bg-gray-700 text-gray-400"
                  }`}>
                    {t.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-300 mb-3 uppercase tracking-wider text-xs">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Card de situação ─────────────────────────────────────────────────────────

function SituacaoCard({
  title, borderColor, children, empty, emptyMsg,
}: {
  title: string;
  borderColor: string;
  children: React.ReactNode;
  empty: boolean;
  emptyMsg: string;
}) {
  return (
    <div className={`bg-[#242424] border ${borderColor} rounded-xl flex flex-col h-full`}>
      <div className="px-4 py-3 border-b border-[#333]">
        <h3 className="font-semibold text-sm text-white">{title}</h3>
      </div>
      <div className="px-4 py-3 flex-1 overflow-y-auto max-h-80">
        {empty ? (
          <p className="text-gray-500 text-sm py-2">{emptyMsg}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ─── Progresso bar inline ─────────────────────────────────────────────────────

function ProgressBar({ score, height = "h-2" }: { score: number; height?: string }) {
  return (
    <div className={`flex-1 ${height} bg-[#333] rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
      />
    </div>
  );
}

// ─── Checkbox inline com optimistic update ────────────────────────────────────

function TarefaCheck({
  tarefa,
  label,
  sub,
  onCheckChange,
}: {
  tarefa: TarefaComCliente;
  label: string;
  sub?: string;
  onCheckChange: (id: string, val: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[#2a2a2a] last:border-0">
      <input
        type="checkbox"
        checked={tarefa.check_feito}
        onChange={(e) => onCheckChange(tarefa.id, e.target.checked)}
        className="mt-0.5 w-3.5 h-3.5 accent-green-500 cursor-pointer flex-shrink-0"
      />
      <div className="min-w-0">
        <p className={`text-sm leading-snug ${tarefa.check_feito ? "line-through text-gray-500" : "text-gray-200"}`}>
          {label}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<User | null>(null);
  const [clientes,       setClientes]       = useState<Cliente[]>([]);
  const [tarefas,        setTarefas]        = useState<Tarefa[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [syncing,        setSyncing]        = useState(false);
  const [toast,          setToast]          = useState<ToastState | null>(null);
  const [modalCliente,   setModalCliente]   = useState<ClienteComMetricas | null>(null);
  // Atrasados: controla qual grupo está expandido
  const [atrasadosOpen,  setAtrasadosOpen]  = useState<Set<string>>(new Set());
  const [filtroResp,     setFiltroResp]     = useState("Todos");

  // ── Load ──
  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from("mm_clientes").select("*"),
      supabase.from("mm_tarefas").select("*"),
    ]);
    setClientes((c ?? []) as Cliente[]);
    setTarefas((t ?? []) as Tarefa[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/login"); return; }
      setUser(u);
      await loadData();
    }
    init();
  }, [router, loadData]);

  // ── Check toggle (optimistic) ──
  const handleCheckChange = useCallback(async (id: string, val: boolean) => {
    setTarefas((prev) => prev.map((t) => t.id === id ? { ...t, check_feito: val } : t));
    const supabase = createClient();
    const { error } = await supabase
      .from("mm_tarefas")
      .update({ check_feito: val, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setTarefas((prev) => prev.map((t) => t.id === id ? { ...t, check_feito: !val } : t));
      setToast({ type: "error", msg: `Erro: ${error.message}` });
    }
  }, []);

  // ── Sync ──
  async function handleSync() {
    setSyncing(true);
    try {
      const r = await importarPlanilha();
      setToast({
        type: r.erros.length === 0 ? "success" : "error",
        msg: r.erros.length === 0
          ? `${r.clientes} clientes e ${r.tarefas} tarefas importados`
          : `${r.clientes} clientes · ${r.tarefas} tarefas · ${r.erros[0]}`,
      });
      await loadData();
    } catch (err) {
      setToast({ type: "error", msg: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  // ── Mapa cliente por id ──
  const clienteMap = useMemo(() => {
    const m: Record<string, Cliente> = {};
    clientes.forEach((c) => { m[c.id_cliente] = c; });
    return m;
  }, [clientes]);

  // ── Helpers de status (declarados antes dos useMemo que os usam) ──
  const isAtivo      = (s: string) => !/paus/i.test(s ?? "");
  const isFinalizado = (t: Tarefa) => t.check_feito || t.status === "Finalizado";
  const isAtrasado   = (t: Tarefa) => !isFinalizado(t) && !!t.prazo && t.prazo < TODAY;

  // Ordem de prioridade: Atrasado(0) > Em andamento(1) > Não iniciado(2) > outros(3)
  const getPrioridade = (t: Tarefa): number => {
    if (isAtrasado(t)) return 0;
    if (t.status === "Em andamento") return 1;
    if (t.status === "Não iniciado") return 2;
    return 3;
  };

  // Filtro por quem está fazendo a tarefa
  const matchesResp = (t: TarefaComCliente): boolean =>
    filtroResp === "Todos" ||
    (t.quem ?? "").trim().toLowerCase() === filtroResp.toLowerCase();

  // ── Tarefas com cliente ──
  const tarefasComCliente = useMemo<TarefaComCliente[]>(() =>
    tarefas
      .filter((t) => clienteMap[t.cliente_id])
      .map((t) => ({ ...t, cliente: clienteMap[t.cliente_id] })),
  [tarefas, clienteMap]);

  // ── Opções de responsável (derivadas dos dados reais) ──
  const respOptions = useMemo(() => {
    const nomes = new Set<string>();
    tarefasComCliente.forEach((t) => { if (t.quem?.trim()) nomes.add(t.quem.trim()); });
    return ["Todos", ...Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [tarefasComCliente]);

  // ── Atrasados agrupados por cliente ──
  const atrasados = useMemo(() => {
    const list = tarefasComCliente.filter((t) => isAtrasado(t) && matchesResp(t));
    const grupos: Record<string, { cliente: Cliente; tarefas: TarefaComCliente[] }> = {};
    list.forEach((t) => {
      if (!grupos[t.cliente_id]) grupos[t.cliente_id] = { cliente: t.cliente, tarefas: [] };
      grupos[t.cliente_id].tarefas.push(t);
    });
    return Object.values(grupos).sort((a, b) => b.tarefas.length - a.tarefas.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasComCliente, filtroResp]);

  // ── Prioridades de hoje — ordenadas por prioridade ──
  const prioHoje = useMemo(() =>
    tarefasComCliente
      .filter((t) => t.prazo === TODAY && !isFinalizado(t) && matchesResp(t))
      .sort((a, b) => {
        const diff = getPrioridade(a) - getPrioridade(b);
        if (diff !== 0) return diff;
        return a.cliente.nome_empresa.localeCompare(b.cliente.nome_empresa, "pt-BR");
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tarefasComCliente, filtroResp]);

  // ── Esta semana (hoje → +7 dias) agrupada por data, ordenada por prioridade ──
  const prioSemana = useMemo(() => {
    const list = tarefasComCliente.filter(
      (t) => t.prazo && t.prazo >= TOMORROW && t.prazo <= WEEK_END &&
             !isFinalizado(t) && matchesResp(t)
    );
    const grupos: Record<string, TarefaComCliente[]> = {};
    list.forEach((t) => {
      const k = t.prazo!;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(t);
    });
    // Ordena tarefas dentro de cada dia por prioridade
    Object.values(grupos).forEach((arr) =>
      arr.sort((a, b) => getPrioridade(a) - getPrioridade(b))
    );
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasComCliente, filtroResp]);

  // ── Clientes com métricas ──
  const clientesComMetricas = useMemo<ClienteComMetricas[]>(() =>
    clientes.map((c) => {
      const t = tarefas.filter((t) => t.cliente_id === c.id_cliente);
      const fin        = t.filter(isFinalizado).length;
      const atr        = t.filter(isAtrasado).length;
      const totalAtivo = t.filter((t) => t.status !== "Cancelado").length;
      const score      = totalAtivo > 0 ? Math.round((fin / totalAtivo) * 100) : 0;
      return { ...c, tarefas: t, finalizadas: fin, atrasadas: atr, score };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [clientes, tarefas]);

  // ── Ranking: 5 piores scores (ativos) ──
  const ranking = useMemo(() =>
    clientesComMetricas
      .filter((c) => isAtivo(c.status))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [clientesComMetricas]);

  // ── Resumo por responsável ──
  const resumoResponsavel = useMemo(() =>
    RESPONSAVEIS.map((resp) => {
      const meus = tarefasComCliente.filter((t) =>
        t.quem?.toLowerCase().includes(resp.toLowerCase()) ||
        t.cliente.responsavel_mm?.toLowerCase().includes(resp.toLowerCase())
      );
      const total       = meus.length;
      const finalizadas = meus.filter(isFinalizado).length;
      const atrasadas   = meus.filter(isAtrasado).length;
      const totalAtivo  = meus.filter((t) => t.status !== "Cancelado").length;
      const score       = totalAtivo > 0 ? Math.round((finalizadas / totalAtivo) * 100) : 0;
      return { resp, total, finalizadas, atrasadas, score };
    }),
  [tarefasComCliente]);

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando daily...</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white pb-24">
      <Header user={user} />

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      {/* Modal */}
      {modalCliente && (
        <ModalTarefas
          cliente={modalCliente}
          tarefas={modalCliente.tarefas}
          onClose={() => setModalCliente(null)}
          onCheckChange={handleCheckChange}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">

        {/* ── Título + Filtro ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Daily Interativo</h1>
            <p className="text-sm text-gray-500 mt-1 capitalize">{today}</p>
          </div>

          {/* Filtro por responsável */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-600 mr-1">Ver tarefas de:</span>
            {respOptions.map((resp) => (
              <button
                key={resp}
                onClick={() => setFiltroResp(resp)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  filtroResp === resp
                    ? "border-white text-white bg-white/10"
                    : "border-[#444] text-gray-400 hover:border-[#666] hover:text-gray-200"
                }`}
              >
                {resp}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 1 — Cards de situação                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section title="Situação do dia">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* ── Card Atrasados ── */}
            <SituacaoCard
              title={`⚠ Atrasados (${atrasados.reduce((s, g) => s + g.tarefas.length, 0)})`}
              borderColor="border-red-800"
              empty={atrasados.length === 0}
              emptyMsg="Nenhum item atrasado hoje"
            >
              <div className="space-y-1">
                {atrasados.map(({ cliente, tarefas: tList }) => {
                  const open = atrasadosOpen.has(cliente.id_cliente);
                  return (
                    <div key={cliente.id_cliente}>
                      {/* Cabeçalho do grupo */}
                      <button
                        className="w-full flex items-center justify-between py-2 text-left hover:text-white transition-colors"
                        onClick={() =>
                          setAtrasadosOpen((prev) => {
                            const next = new Set(prev);
                            open ? next.delete(cliente.id_cliente) : next.add(cliente.id_cliente);
                            return next;
                          })
                        }
                      >
                        <Link
                          href="/pipeline"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-red-300 hover:underline"
                        >
                          {cliente.nome_empresa}
                        </Link>
                        <span className="text-xs text-gray-500 flex items-center gap-1.5 flex-shrink-0">
                          <span className="bg-red-900 text-red-300 px-1.5 py-0.5 rounded-full">
                            {tList.length}
                          </span>
                          <span>{open ? "▲" : "▼"}</span>
                        </span>
                      </button>

                      {/* Tarefas expandidas */}
                      {open && (
                        <div className="pl-3 border-l border-red-900 mb-2 space-y-1">
                          {tList.map((t) => (
                            <div key={t.id} className="text-xs text-gray-400 py-0.5 flex items-start gap-1.5">
                              <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                              <span>
                                {t.o_que}
                                {t.prazo && (
                                  <span className="text-red-500 ml-1">({formatDate(t.prazo)})</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SituacaoCard>

            {/* ── Card Prioridades de Hoje ── */}
            <SituacaoCard
              title={`Hoje (${prioHoje.length})`}
              borderColor="border-yellow-700"
              empty={prioHoje.length === 0}
              emptyMsg="Nada para hoje"
            >
              {prioHoje.map((t) => (
                <TarefaCheck
                  key={t.id}
                  tarefa={t}
                  label={`${t.cliente.nome_empresa} — ${t.o_que}`}
                  sub={`${t.cliente.id_cliente}${t.quem ? ` · ${t.quem}` : ""}${
                    isAtrasado(t) ? " · ⚠ atrasado" : t.status === "Em andamento" ? " · em andamento" : ""
                  }`}
                  onCheckChange={handleCheckChange}
                />
              ))}
            </SituacaoCard>

            {/* ── Card Esta Semana ── */}
            <SituacaoCard
              title={`Esta semana (${prioSemana.reduce((s, [, l]) => s + l.length, 0)})`}
              borderColor="border-blue-800"
              empty={prioSemana.length === 0}
              emptyMsg="Semana tranquila"
            >
              <div className="space-y-3">
                {prioSemana.map(([data, tList]) => (
                  <div key={data}>
                    <p className="text-xs text-blue-400 font-semibold mb-1 capitalize">
                      {formatDateFull(data)}
                    </p>
                    {tList.map((t) => (
                      <div key={t.id} className="text-xs text-gray-300 py-0.5 flex items-start gap-1.5 pl-2">
                        <span className={`mt-0.5 flex-shrink-0 ${
                          t.status === "Em andamento" ? "text-blue-500" :
                          t.status === "Atrasado"     ? "text-red-500"  : "text-gray-600"
                        }`}>•</span>
                        <span>
                          <span className="text-gray-500">{t.cliente.nome_empresa}</span>
                          {" — "}
                          <span className="text-gray-200">{t.o_que}</span>
                          {t.quem && <span className="text-gray-500 ml-1">· {t.quem}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </SituacaoCard>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 2 — Ranking de saúde                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section title="Clientes que precisam de atenção">
          <div className="bg-[#242424] border border-[#333] rounded-xl overflow-hidden">
            {ranking.length === 0 ? (
              <p className="text-gray-500 text-sm px-5 py-6">Nenhum cliente ativo.</p>
            ) : (
              ranking.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${
                    i !== 0 ? "border-t border-[#2a2a2a]" : ""
                  }`}
                >
                  {/* Posição */}
                  <span className="text-lg font-bold text-gray-600 w-6 flex-shrink-0 text-center">
                    {i + 1}
                  </span>

                  {/* Nome + ID */}
                  <div className="w-44 flex-shrink-0">
                    <p className="font-semibold text-white text-sm leading-tight">{c.nome_empresa}</p>
                    <p className="text-xs text-gray-500">{c.id_cliente}</p>
                  </div>

                  {/* Barra + score */}
                  <div className="flex-1 flex items-center gap-3">
                    <ProgressBar score={c.score} />
                    <span
                      className="text-base font-bold w-10 text-right flex-shrink-0"
                      style={{ color: getScoreColor(c.score) }}
                    >
                      {c.score}
                    </span>
                  </div>

                  {/* Atrasadas */}
                  {c.atrasadas > 0 && (
                    <span className="bg-red-900 text-red-300 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                      {c.atrasadas} atrasada{c.atrasadas > 1 ? "s" : ""}
                    </span>
                  )}

                  {/* Botão ver tarefas */}
                  <button
                    onClick={() => setModalCliente(c)}
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#2a2a2a] border border-[#444] text-gray-300 hover:border-[#666] hover:text-white transition"
                  >
                    Ver tarefas
                  </button>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 3 — Resumo por responsável                                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section title="Resumo por responsável">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {resumoResponsavel.map(({ resp, total, finalizadas, atrasadas, score }) => (
              <div
                key={resp}
                className="bg-[#242424] border border-[#333] rounded-xl p-5"
              >
                {/* Nome */}
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-white">{resp}</p>
                  <span
                    className="text-sm font-bold"
                    style={{ color: getScoreColor(score) }}
                  >
                    {score}%
                  </span>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-200">{total}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-400">{finalizadas}</p>
                    <p className="text-xs text-gray-500">Finaliz.</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${atrasadas > 0 ? "text-red-400" : "text-gray-400"}`}>
                      {atrasadas}
                    </p>
                    <p className="text-xs text-gray-500">Atrasadas</p>
                  </div>
                </div>

                {/* Barra semanal */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500">Progresso geral</p>
                    <p className="text-xs text-gray-400">{finalizadas}/{total}</p>
                  </div>
                  <ProgressBar score={score} height="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>

      {/* ── Botão flutuante ── */}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-[#2a2a2a] border border-[#555] text-sm font-medium text-gray-200 hover:border-[#888] hover:text-white shadow-xl transition disabled:opacity-50"
      >
        {syncing ? (
          <>
            <span className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
            Atualizando...
          </>
        ) : (
          <>
            <span className="text-base">↻</span>
            Atualizar dados
          </>
        )}
      </button>
    </div>
  );
}
