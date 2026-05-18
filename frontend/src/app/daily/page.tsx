"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Header from "@/components/Header";
import { importarPlanilha } from "@/lib/importSheets";
import { getScoreColor } from "@/lib/healthScore";
import { formatDate, formatDateFull, isStatusAtivo, dedupClientesByNome } from "@/lib/client-utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePipelineRaw, useInvalidatePipeline } from "@/hooks/useClientes";
import { PageLoading } from "@/components/ui";
import { useUIStore } from "@/store/uiStore";
import { Loader2, RefreshCw, X } from "lucide-react";

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
  const [mostrarFeitas, setMostrarFeitas] = React.useState(false);
  const pendentes = tarefas.filter((t) => !t.check_feito && t.status !== "Finalizado");
  const finalizadas = tarefas.filter((t) => t.check_feito || t.status === "Finalizado");
  const lista = mostrarFeitas ? tarefas : pendentes;
  return (
    <div
      className="fixed inset-0 z-50 bg-brand-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl shadow-brand-900/20 border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do modal — faixa brand */}
        <div className="bg-gradient-to-r from-brand-700 to-brand-800 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-white text-base">{cliente.nome_empresa}</p>
            <p className="text-xs text-brand-200 mt-0.5">
              {cliente.id_cliente} · Score {cliente.score}% · {cliente.finalizadas}/{tarefas.length}{" "}
              concluídas
            </p>
          </div>
          <div className="flex items-center gap-2">
            {finalizadas.length > 0 && (
              <button
                onClick={() => setMostrarFeitas((v) => !v)}
                className="text-xs px-3 py-1 rounded-lg bg-white/15 text-white hover:bg-white/25 transition border border-white/20"
              >
                {mostrarFeitas
                  ? "Ocultar concluídas"
                  : `+ ${finalizadas.length} concluída${finalizadas.length > 1 ? "s" : ""}`}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-brand-200 hover:text-white p-1.5 rounded-lg hover:bg-white/15 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lista de tarefas */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2 bg-white">
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Nenhuma tarefa pendente.
            </p>
          ) : (
            lista.map((t) => {
              const vencida = t.prazo && t.prazo < TODAY && t.status !== "Finalizado";
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    vencida
                      ? "border-red-200 bg-red-50"
                      : "border-border bg-white hover:bg-rose-50/30"
                  } transition-colors`}
                >
                  <input
                    type="checkbox"
                    checked={t.check_feito}
                    onChange={(e) => onCheckChange(t.id, e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-brand-600 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${t.check_feito ? "line-through text-muted-foreground" : "text-brand-900"}`}
                    >
                      {t.o_que}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.etapa && <span className="text-xs text-muted-foreground">{t.etapa}</span>}
                      {t.quem && (
                        <span className="text-xs text-brand-600 font-medium bg-brand-50 px-1.5 py-0.5 rounded">
                          {t.quem}
                        </span>
                      )}
                      {t.prazo && (
                        <span
                          className={`text-xs font-medium ${vencida ? "text-red-600" : "text-muted-foreground"}`}
                        >
                          {formatDate(t.prazo)}
                          {vencida ? " ⚠" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                      t.status === "Finalizado"
                        ? "bg-green-100 text-green-700"
                        : t.status === "Atrasado"
                          ? "bg-red-100 text-red-700"
                          : t.status === "Em andamento"
                            ? "bg-brand-100 text-brand-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
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
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-0.5 h-4 rounded-full bg-brand-400 flex-shrink-0" />
        <h2 className="text-xs font-bold text-brand-800 uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ─── Card de situação ─────────────────────────────────────────────────────────

type CardAccent = "red" | "amber" | "violet";

const CARD_ACCENT: Record<
  CardAccent,
  { header: string; headerText: string; border: string; badge: string }
> = {
  red: {
    header: "bg-red-50 border-b border-red-200",
    headerText: "text-red-800",
    border: "border-red-300",
    badge: "bg-red-500 text-white",
  },
  amber: {
    header: "bg-amber-50 border-b border-amber-200",
    headerText: "text-amber-800",
    border: "border-amber-300",
    badge: "bg-amber-500 text-white",
  },
  violet: {
    header: "bg-brand-50 border-b border-brand-200",
    headerText: "text-brand-800",
    border: "border-brand-300",
    badge: "bg-brand-600 text-white",
  },
};

function SituacaoCard({
  title,
  count,
  accent,
  children,
  empty,
  emptyMsg,
  expanded,
  footer,
}: {
  title: string;
  count: number;
  accent: CardAccent;
  children: React.ReactNode;
  empty: boolean;
  emptyMsg: string;
  expanded?: boolean;
  footer?: React.ReactNode;
}) {
  const ac = CARD_ACCENT[accent];
  return (
    <div
      className={`bg-white border ${ac.border} rounded-xl flex flex-col h-full shadow-sm overflow-hidden`}
    >
      <div className={`px-4 py-3 flex items-center justify-between ${ac.header}`}>
        <h3 className={`font-bold text-sm ${ac.headerText}`}>{title}</h3>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${ac.badge}`}>{count}</span>
      </div>
      <div
        className={`px-4 py-3 flex-1 overflow-y-auto ${expanded ? "max-h-[460px]" : "max-h-72"}`}
      >
        {empty ? <p className="text-muted-foreground text-sm py-2">{emptyMsg}</p> : children}
      </div>
      {footer && <div className="border-t border-border">{footer}</div>}
    </div>
  );
}

// ─── Progresso bar inline ─────────────────────────────────────────────────────

function ProgressBar({ score, height = "h-2" }: { score: number; height?: string }) {
  return (
    <div className={`flex-1 ${height} bg-border rounded-full overflow-hidden`}>
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
  const isOverdue = !tarefa.check_feito && !!tarefa.prazo && tarefa.prazo < TODAY;
  return (
    <div
      className={`flex items-start gap-2.5 py-2.5 border-b border-border last:border-0 ${
        isOverdue ? "bg-red-50/60 -mx-1 px-1 rounded-lg" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={tarefa.check_feito}
        onChange={(e) => onCheckChange(tarefa.id, e.target.checked)}
        className="mt-0.5 w-3.5 h-3.5 accent-brand-600 cursor-pointer flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug font-medium ${
            tarefa.check_feito ? "line-through text-muted-foreground" : "text-brand-900"
          }`}
        >
          {label}
        </p>
        {sub && (
          <p
            className={`text-xs mt-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const { data: rawData, isLoading: dataLoading } = usePipelineRaw(!!user);
  const invalidatePipeline = useInvalidatePipeline();

  const {
    filtroResponsavel: filtroResp,
    setFiltroResponsavel: setFiltroResp,
    dailyBusca: busca,
    setDailyBusca: setBusca,
  } = useUIStore();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const loading = userLoading || dataLoading;
  const [syncing, setSyncing] = useState(false);
  const [modalCliente, setModalCliente] = useState<ClienteComMetricas | null>(null);
  const [atrasadosOpen, setAtrasadosOpen] = useState<Set<string>>(new Set());
  const [buscaDelay, setBuscaDelay] = useState("");
  const [atrasadosExp, setAtrasadosExp] = useState(false);
  const [hojeExp, setHojeExp] = useState(false);
  const [semanaExp, setSemanaExp] = useState(false);
  const CARD_LIMIT = 10;

  useEffect(() => {
    const t = setTimeout(() => setBuscaDelay(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (rawData) {
      setClientes(dedupClientesByNome(rawData.clientes as Cliente[]));
      setTarefas(rawData.tarefas as Tarefa[]);
    }
  }, [rawData]);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [user, userLoading, router]);

  const handleCheckChange = useCallback(
    async (id: string, val: boolean) => {
      const tarefa = tarefas.find((t) => t.id === id);
      if (!tarefa) return;
      const newStatus = val
        ? "Finalizado"
        : tarefa.prazo && tarefa.prazo < TODAY
          ? "Atrasado"
          : "Não iniciado";

      setTarefas((prev) =>
        prev.map((t) => (t.id === id ? { ...t, check_feito: val, status: newStatus } : t))
      );

      try {
        const res = await fetch("/api/sheets/update-tarefa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            id_cliente: tarefa.cliente_id,
            o_que_original: tarefa.o_que,
            prazo_original: tarefa.prazo,
            etapa_original: tarefa.etapa,
            check_feito: val,
            status: newStatus,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro");
      } catch (err) {
        setTarefas((prev) =>
          prev.map((t) => (t.id === id ? { ...t, check_feito: !val, status: tarefa.status } : t))
        );
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    },
    [tarefas]
  );

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await importarPlanilha();
      const parts: string[] = [`${r.clientes} clientes · ${r.tarefas} tarefas`];
      if (r.semAbas.length > 0) parts.push(`sem aba: ${r.semAbas.join(", ")}`);
      if (r.semTarefas.length > 0) parts.push(`sem tarefas: ${r.semTarefas.join(", ")}`);
      if (r.erros.length > 0) parts.push(`erros: ${r.erros.join(" | ")}`);
      const msg = parts.join(" · ");
      if (r.erros.length > 0 || r.semAbas.length > 0) {
        toast.warning(msg, { duration: 10000 });
      } else {
        toast.success(msg);
      }
      await invalidatePipeline();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSyncing(false);
    }
  }

  const clienteMap = useMemo(() => {
    const m: Record<string, Cliente> = {};
    clientes.forEach((c) => {
      m[c.id_cliente] = c;
    });
    return m;
  }, [clientes]);

  const isAtivo = isStatusAtivo;
  const isFinalizado = (t: Tarefa) => t.check_feito || t.status === "Finalizado";
  const isAtrasado = (t: Tarefa) => !isFinalizado(t) && !!t.prazo && t.prazo < TODAY;

  const normStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const getPrioridade = (t: Tarefa): number => {
    if (isAtrasado(t)) return 0;
    if (t.status === "Em andamento") return 1;
    if (t.status === "Não iniciado") return 2;
    return 3;
  };

  const matchesResp = (t: TarefaComCliente): boolean =>
    filtroResp === "Todos" || (t.quem ?? "").trim().toLowerCase() === filtroResp.toLowerCase();

  const tarefasComCliente = useMemo<TarefaComCliente[]>(() => {
    const seen = new Set<string>();
    const result: TarefaComCliente[] = [];
    for (const t of tarefas) {
      if (!clienteMap[t.cliente_id]) continue;
      if (/paus|encerr/i.test(clienteMap[t.cliente_id].status ?? "")) continue;
      const key = `${t.cliente_id}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...t, cliente: clienteMap[t.cliente_id] });
    }
    return result;
  }, [tarefas, clienteMap]);

  const currentUserName = useMemo(() => {
    if (!user?.email) return null;
    const prefix = normStr(user.email.split("@")[0]);
    const nomes = Array.from(
      new Set(tarefasComCliente.map((t) => t.quem?.trim()).filter(Boolean) as string[])
    );
    return nomes.find((nome) => prefix.startsWith(normStr(nome))) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tarefasComCliente]);

  const respOptions = useMemo(() => {
    const nomes = new Set<string>();
    tarefasComCliente.forEach((t) => {
      if (t.quem?.trim()) nomes.add(t.quem.trim());
    });
    return ["Todos", ...Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [tarefasComCliente]);

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

  const prioHoje = useMemo(
    () =>
      tarefasComCliente
        .filter((t) => t.prazo === TODAY && !isFinalizado(t) && matchesResp(t))
        .sort((a, b) => {
          const myNorm = currentUserName ? normStr(currentUserName) : null;
          const aIsMe = myNorm ? normStr(a.quem ?? "") === myNorm : false;
          const bIsMe = myNorm ? normStr(b.quem ?? "") === myNorm : false;
          if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
          const diff = getPrioridade(a) - getPrioridade(b);
          if (diff !== 0) return diff;
          return a.cliente.nome_empresa.localeCompare(b.cliente.nome_empresa, "pt-BR");
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarefasComCliente, filtroResp, currentUserName]
  );

  const prioSemana = useMemo(() => {
    const list = tarefasComCliente.filter(
      (t) =>
        t.prazo && t.prazo >= TOMORROW && t.prazo <= WEEK_END && !isFinalizado(t) && matchesResp(t)
    );
    const grupos: Record<string, TarefaComCliente[]> = {};
    list.forEach((t) => {
      const k = t.prazo!;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(t);
    });
    const myNorm = currentUserName ? normStr(currentUserName) : null;
    Object.values(grupos).forEach((arr) =>
      arr.sort((a, b) => {
        const aIsMe = myNorm ? normStr(a.quem ?? "") === myNorm : false;
        const bIsMe = myNorm ? normStr(b.quem ?? "") === myNorm : false;
        if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
        return getPrioridade(a) - getPrioridade(b);
      })
    );
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasComCliente, filtroResp, currentUserName]);

  const clientesComMetricas = useMemo<ClienteComMetricas[]>(
    () => {
      const q = buscaDelay.trim().toLowerCase();
      return clientes
        .filter((c) => isAtivo(c.status) && (!q || c.nome_empresa.toLowerCase().includes(q)))
        .map((c) => {
          const t = tarefasComCliente.filter((t) => t.cliente_id === c.id_cliente);
          const fin = t.filter(isFinalizado).length;
          const atr = t.filter(isAtrasado).length;
          const totalAtivo = t.filter((t) => t.status !== "Cancelado").length;
          const score = totalAtivo > 0 ? Math.round((fin / totalAtivo) * 100) : 0;
          return { ...c, tarefas: t, finalizadas: fin, atrasadas: atr, score };
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, tarefasComCliente, buscaDelay]
  );

  const ranking = useMemo(
    () =>
      clientesComMetricas
        .filter((c) => isAtivo(c.status))
        .sort((a, b) => a.score - b.score)
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientesComMetricas]
  );

  const resumoResponsavel = useMemo(() => {
    const nomes = new Set<string>();
    tarefasComCliente.forEach((t) => {
      if (t.quem?.trim()) nomes.add(t.quem.trim());
      if (t.cliente.responsavel_mm?.trim()) nomes.add(t.cliente.responsavel_mm.trim());
    });
    return Array.from(nomes)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((resp) => {
        const meus = tarefasComCliente.filter(
          (t) =>
            t.quem?.toLowerCase().includes(resp.toLowerCase()) ||
            t.cliente.responsavel_mm?.toLowerCase().includes(resp.toLowerCase())
        );
        const total = meus.length;
        const finalizadas = meus.filter(isFinalizado).length;
        const atrasadas = meus.filter(isAtrasado).length;
        const totalAtivo = meus.filter((t) => t.status !== "Cancelado").length;
        const score = totalAtivo > 0 ? Math.round((finalizadas / totalAtivo) * 100) : 0;
        return { resp, total, finalizadas, atrasadas, score };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasComCliente]);

  if (loading) return <PageLoading />;

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const totalAtrasadas = atrasados.reduce((s, g) => s + g.tarefas.length, 0);
  const totalSemana = prioSemana.reduce((s, [, l]) => s + l.length, 0);

  return (
    <div className="min-h-screen pb-24">
      <Header user={user} />

      {/* Modal */}
      {modalCliente && (
        <ModalTarefas
          cliente={modalCliente}
          tarefas={modalCliente.tarefas}
          onClose={() => setModalCliente(null)}
          onCheckChange={handleCheckChange}
        />
      )}

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* ── Título + Filtros ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-brand-900">Daily Interativo</h1>
            <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Busca por cliente */}
            <div className="relative flex items-center">
              <svg
                className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente..."
                className="pl-8 pr-7 py-2 text-sm bg-white border border-border text-foreground rounded-lg placeholder-muted-foreground focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/20 transition w-44"
              />
              {busca && (
                <button
                  onClick={() => setBusca("")}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filtro por responsável */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ver de:</span>
              <div className="relative">
                <select
                  value={filtroResp}
                  onChange={(e) => setFiltroResp(e.target.value)}
                  className="appearance-none bg-white border border-border text-sm text-foreground rounded-lg pl-3 pr-8 py-2 cursor-pointer hover:border-brand-400 focus:outline-none focus:border-brand-400 transition"
                >
                  {respOptions.map((resp) => (
                    <option key={resp} value={resp}>
                      {resp}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                  ▼
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 1 — Cards de situação                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section title="Situação do dia">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ── Atrasados ── */}
            <SituacaoCard
              title="Atrasados"
              count={totalAtrasadas}
              accent="red"
              empty={atrasados.length === 0}
              emptyMsg="Nenhum item atrasado ✓"
              expanded={atrasadosExp}
              footer={
                atrasados.length > CARD_LIMIT ? (
                  <button
                    onClick={() => setAtrasadosExp(!atrasadosExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-brand-700 transition"
                  >
                    {atrasadosExp ? (
                      <>
                        <span>▲</span> Minimizar
                      </>
                    ) : (
                      <>
                        <span>▼</span> Ver todos ({atrasados.length} clientes)
                      </>
                    )}
                  </button>
                ) : undefined
              }
            >
              <div className="space-y-0.5">
                {(atrasadosExp ? atrasados : atrasados.slice(0, CARD_LIMIT)).map(
                  ({ cliente, tarefas: tList }) => {
                    const open = atrasadosOpen.has(cliente.id_cliente);
                    return (
                      <div key={cliente.id_cliente}>
                        {/* Linha do cliente */}
                        <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-red-50 transition-colors group">
                          <Link
                            href="/pipeline"
                            className="text-sm font-semibold text-brand-800 hover:text-brand-600 hover:underline truncate flex-1 mr-2"
                          >
                            {cliente.nome_empresa}
                          </Link>
                          <button
                            onClick={() =>
                              setAtrasadosOpen((prev) => {
                                const next = new Set(prev);
                                open
                                  ? next.delete(cliente.id_cliente)
                                  : next.add(cliente.id_cliente);
                                return next;
                              })
                            }
                            className="flex items-center gap-1.5 flex-shrink-0"
                          >
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
                              {tList.length}
                            </span>
                            <span className="text-muted-foreground text-xs group-hover:text-foreground">
                              {open ? "▲" : "▼"}
                            </span>
                          </button>
                        </div>

                        {/* Tarefas expandidas */}
                        {open && (
                          <div className="pl-3 border-l-2 border-red-200 ml-2 mb-1.5 space-y-0.5">
                            {tList.map((t) => (
                              <div
                                key={t.id}
                                className="text-xs text-foreground py-0.5 flex items-start gap-1.5"
                              >
                                <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                                <span>
                                  {t.o_que}
                                  {t.prazo && (
                                    <span className="text-red-500 ml-1 font-medium">
                                      ({formatDate(t.prazo)})
                                    </span>
                                  )}
                                  {t.quem && (
                                    <span className="text-brand-500 ml-1">· {t.quem}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </SituacaoCard>

            {/* ── Hoje ── */}
            <SituacaoCard
              title="Hoje"
              count={prioHoje.length}
              accent="amber"
              empty={prioHoje.length === 0}
              emptyMsg="Nada para hoje ✓"
              expanded={hojeExp}
              footer={
                prioHoje.length > CARD_LIMIT ? (
                  <button
                    onClick={() => setHojeExp(!hojeExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-brand-700 transition"
                  >
                    {hojeExp ? (
                      <>
                        <span>▲</span> Minimizar
                      </>
                    ) : (
                      <>
                        <span>▼</span> Ver todos ({prioHoje.length} tarefas)
                      </>
                    )}
                  </button>
                ) : undefined
              }
            >
              {(hojeExp ? prioHoje : prioHoje.slice(0, CARD_LIMIT)).map((t) => (
                <TarefaCheck
                  key={t.id}
                  tarefa={t}
                  label={`${t.cliente.nome_empresa} — ${t.o_que}`}
                  sub={`${t.cliente.id_cliente}${t.quem ? ` · ${t.quem}` : ""}${
                    isAtrasado(t)
                      ? " · ⚠ atrasado"
                      : t.status === "Em andamento"
                        ? " · em andamento"
                        : ""
                  }`}
                  onCheckChange={handleCheckChange}
                />
              ))}
            </SituacaoCard>

            {/* ── Esta Semana ── */}
            <SituacaoCard
              title="Esta semana"
              count={totalSemana}
              accent="violet"
              empty={prioSemana.length === 0}
              emptyMsg="Semana tranquila ✓"
              expanded={semanaExp}
              footer={
                prioSemana.length > CARD_LIMIT ? (
                  <button
                    onClick={() => setSemanaExp(!semanaExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-brand-700 transition"
                  >
                    {semanaExp ? (
                      <>
                        <span>▲</span> Minimizar
                      </>
                    ) : (
                      <>
                        <span>▼</span> Ver todos ({prioSemana.length} dias)
                      </>
                    )}
                  </button>
                ) : undefined
              }
            >
              <div className="space-y-3">
                {(semanaExp ? prioSemana : prioSemana.slice(0, CARD_LIMIT)).map(([data, tList]) => (
                  <div key={data}>
                    <p className="text-xs text-brand-700 font-bold mb-1 capitalize flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-brand-400 inline-block" />
                      {formatDateFull(data)}
                    </p>
                    {tList.map((t) => (
                      <div key={t.id} className="text-xs py-0.5 flex items-start gap-1.5 pl-3">
                        <span
                          className={`mt-0.5 flex-shrink-0 ${
                            t.status === "Em andamento"
                              ? "text-brand-400"
                              : t.status === "Atrasado"
                                ? "text-red-500"
                                : "text-muted-foreground"
                          }`}
                        >
                          •
                        </span>
                        <span>
                          <span className="text-muted-foreground">{t.cliente.nome_empresa}</span>
                          {" — "}
                          <span className="text-foreground font-medium">{t.o_que}</span>
                          {t.quem && <span className="text-brand-500 ml-1">· {t.quem}</span>}
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
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            {ranking.length === 0 ? (
              <p className="text-muted-foreground text-sm px-5 py-6">Nenhum cliente ativo.</p>
            ) : (
              ranking.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-rose-50/40 ${
                    i !== 0 ? "border-t border-border" : ""
                  }`}
                >
                  {/* Posição */}
                  <span className="text-base font-bold text-brand-200 w-6 flex-shrink-0 text-center">
                    {i + 1}
                  </span>

                  {/* Nome + ID */}
                  <div className="w-44 flex-shrink-0">
                    <p className="font-semibold text-brand-900 text-sm leading-tight">
                      {c.nome_empresa}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.id_cliente}</p>
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
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {c.atrasadas} atrasada{c.atrasadas > 1 ? "s" : ""}
                    </span>
                  )}

                  {/* Botão ver tarefas */}
                  <button
                    onClick={() => setModalCliente(c)}
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition font-medium"
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
            {resumoResponsavel
              .filter(({ total }) => total > 0)
              .map(({ resp, total, finalizadas, atrasadas, score }) => (
                <div
                  key={resp}
                  className="bg-white border border-border rounded-xl overflow-hidden shadow-sm"
                >
                  {/* Faixa superior gradiente */}
                  <div className="h-1.5 bg-gradient-to-r from-brand-400 via-mm-fuchsia to-mm-warm" />
                  <div className="p-5">
                    {/* Nome + Score */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-bold text-brand-900">{resp}</p>
                      <span className="text-sm font-bold" style={{ color: getScoreColor(score) }}>
                        {score}%
                      </span>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center bg-background rounded-lg py-2">
                        <p className="text-xl font-bold text-foreground">{total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center bg-green-50 rounded-lg py-2">
                        <p className="text-xl font-bold text-green-600">{finalizadas}</p>
                        <p className="text-xs text-muted-foreground">Feitas</p>
                      </div>
                      <div
                        className={`text-center rounded-lg py-2 ${atrasadas > 0 ? "bg-red-50" : "bg-background"}`}
                      >
                        <p
                          className={`text-xl font-bold ${atrasadas > 0 ? "text-red-600" : "text-muted-foreground"}`}
                        >
                          {atrasadas}
                        </p>
                        <p className="text-xs text-muted-foreground">Atrasadas</p>
                      </div>
                    </div>

                    {/* Barra */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-muted-foreground">Progresso</p>
                        <p className="text-xs font-medium text-muted-foreground">
                          {finalizadas}/{total}
                        </p>
                      </div>
                      <ProgressBar score={score} height="h-2" />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Section>
      </main>

      {/* ── Botão flutuante de sync ── */}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 shadow-xl shadow-brand-900/25 transition disabled:opacity-50"
      >
        {syncing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Atualizando...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Atualizar dados
          </>
        )}
      </button>
    </div>
  );
}
