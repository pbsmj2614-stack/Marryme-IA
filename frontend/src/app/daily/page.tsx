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
import { Button } from "@/components/ui/button";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-bold text-foreground text-base">{cliente.nome_empresa}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cliente.id_cliente} · Score {cliente.score}% · {cliente.finalizadas}/{tarefas.length}{" "}
              concluídas
            </p>
          </div>
          {finalizadas.length > 0 && (
            <Button
              onClick={() => setMostrarFeitas((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80 transition mr-6"
            >
              {mostrarFeitas
                ? "Ocultar concluídas"
                : `+ ${finalizadas.length} concluída${finalizadas.length > 1 ? "s" : ""}`}
            </Button>
          )}
          <Button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none p-1"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista de tarefas */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Nenhuma tarefa pendente.</p>
          ) : (
            lista.map((t) => {
              const vencida = t.prazo && t.prazo < TODAY && t.status !== "Finalizado";
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    vencida ? "border-red-200 bg-red-50" : "border-border bg-card"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={t.check_feito}
                    onChange={(e) => onCheckChange(t.id, e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-green-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${t.check_feito ? "line-through text-muted-foreground" : "text-foreground"}`}
                    >
                      {t.o_que}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.etapa && <span className="text-xs text-muted-foreground">{t.etapa}</span>}
                      {t.quem && <span className="text-xs text-blue-600">{t.quem}</span>}
                      {t.prazo && (
                        <span
                          className={`text-xs ${vencida ? "text-red-600 font-bold" : "text-muted-foreground"}`}
                        >
                          {formatDate(t.prazo)}
                          {vencida ? " !" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      t.status === "Finalizado"
                        ? "bg-green-100 text-green-700"
                        : t.status === "Atrasado"
                          ? "bg-red-100 text-red-700"
                          : t.status === "Em andamento"
                            ? "bg-blue-100 text-blue-700"
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
      <h2 className="text-base font-semibold text-foreground mb-3 uppercase tracking-wider text-xs">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Card de situação ─────────────────────────────────────────────────────────

function SituacaoCard({
  title,
  borderColor,
  children,
  empty,
  emptyMsg,
  expanded,
  footer,
}: {
  title: string;
  borderColor: string;
  children: React.ReactNode;
  empty: boolean;
  emptyMsg: string;
  expanded?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`bg-card border ${borderColor} rounded-xl flex flex-col h-full shadow-sm`}>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
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
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
      <input
        type="checkbox"
        checked={tarefa.check_feito}
        onChange={(e) => onCheckChange(tarefa.id, e.target.checked)}
        className="mt-0.5 w-3.5 h-3.5 accent-green-500 cursor-pointer flex-shrink-0"
      />
      <div className="min-w-0">
        <p
          className={`text-sm leading-snug ${tarefa.check_feito ? "line-through text-muted-foreground" : "text-foreground"}`}
        >
          {label}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
  // Atrasados: controla qual grupo está expandido
  const [atrasadosOpen, setAtrasadosOpen] = useState<Set<string>>(new Set());
  const [buscaDelay, setBuscaDelay] = useState("");
  const [atrasadosExp, setAtrasadosExp] = useState(false);
  const [hojeExp, setHojeExp] = useState(false);
  const [semanaExp, setSemanaExp] = useState(false);
  const CARD_LIMIT = 10;

  // Debounce busca 300ms
  useEffect(() => {
    const t = setTimeout(() => setBuscaDelay(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Sync query data → local state
  useEffect(() => {
    if (rawData) {
      setClientes(dedupClientesByNome(rawData.clientes as Cliente[]));
      setTarefas(rawData.tarefas as Tarefa[]);
    }
  }, [rawData]);

  // Redirect se não autenticado
  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [user, userLoading, router]);

  // ── Check toggle — atualiza Supabase + Sheets ──
  const handleCheckChange = useCallback(
    async (id: string, val: boolean) => {
      const tarefa = tarefas.find((t) => t.id === id);
      if (!tarefa) return;
      const newStatus = val
        ? "Finalizado"
        : tarefa.prazo && tarefa.prazo < TODAY
          ? "Atrasado"
          : "Não iniciado";

      // Optimistic
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
        // Revert
        setTarefas((prev) =>
          prev.map((t) => (t.id === id ? { ...t, check_feito: !val, status: tarefa.status } : t))
        );
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    },
    [tarefas]
  );

  // ── Sync ──
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

  // ── Mapa cliente por id ──
  const clienteMap = useMemo(() => {
    const m: Record<string, Cliente> = {};
    clientes.forEach((c) => {
      m[c.id_cliente] = c;
    });
    return m;
  }, [clientes]);

  // ── Helpers de status (declarados antes dos useMemo que os usam) ──
  const isAtivo = isStatusAtivo;
  const isFinalizado = (t: Tarefa) => t.check_feito || t.status === "Finalizado";
  const isAtrasado = (t: Tarefa) => !isFinalizado(t) && !!t.prazo && t.prazo < TODAY;

  // Normaliza string para comparação (remove acentos, lowercase)
  const normStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Ordem de prioridade: Atrasado(0) > Em andamento(1) > Não iniciado(2) > outros(3)
  const getPrioridade = (t: Tarefa): number => {
    if (isAtrasado(t)) return 0;
    if (t.status === "Em andamento") return 1;
    if (t.status === "Não iniciado") return 2;
    return 3;
  };

  // Filtro por quem está fazendo a tarefa
  const matchesResp = (t: TarefaComCliente): boolean =>
    filtroResp === "Todos" || (t.quem ?? "").trim().toLowerCase() === filtroResp.toLowerCase();

  // ── Tarefas com cliente (deduplicadas por cliente_id+o_que+prazo) ──
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

  // ── Nome do usuário logado (para priorizar suas tarefas nos cards) ──
  const currentUserName = useMemo(() => {
    if (!user?.email) return null;
    const prefix = normStr(user.email.split("@")[0]);
    const nomes = Array.from(
      new Set(tarefasComCliente.map((t) => t.quem?.trim()).filter(Boolean) as string[])
    );
    return nomes.find((nome) => prefix.startsWith(normStr(nome))) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tarefasComCliente]);

  // ── Opções de responsável (derivadas dos dados reais) ──
  const respOptions = useMemo(() => {
    const nomes = new Set<string>();
    tarefasComCliente.forEach((t) => {
      if (t.quem?.trim()) nomes.add(t.quem.trim());
    });
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

  // ── Prioridades de hoje — usuário logado primeiro, depois por prioridade ──
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

  // ── Esta semana (hoje → +7 dias) agrupada por data, ordenada por prioridade ──
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
    // Ordena tarefas dentro de cada dia: usuário logado primeiro, depois por prioridade
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

  // ── Clientes com métricas (usa tarefasComCliente — já deduplicadas) ──
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

  // ── Ranking: 5 piores scores (ativos) ──
  const ranking = useMemo(
    () =>
      clientesComMetricas
        .filter((c) => isAtivo(c.status))
        .sort((a, b) => a.score - b.score)
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientesComMetricas]
  );

  // ── Resumo por responsável (derivado dos dados reais — novos membros aparecem automaticamente) ──
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

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return <PageLoading />;

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

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
        {/* ── Título + Filtro ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Interativo</h1>
            <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
          </div>

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
              className="pl-8 pr-7 py-2 text-sm bg-input border border-border text-foreground rounded-lg placeholder-muted-foreground focus:outline-none focus:border-ring transition w-44"
            />
            {busca && (
              <Button
                onClick={() => setBusca("")}
                className="absolute right-2 text-muted-foreground hover:text-foreground text-xs"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          {/* Filtro por responsável */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ver tarefas de:</span>
            <div className="relative">
              <select
                value={filtroResp}
                onChange={(e) => setFiltroResp(e.target.value)}
                className="appearance-none bg-input border border-border text-sm text-foreground rounded-lg pl-3 pr-8 py-2 cursor-pointer hover:border-ring focus:outline-none focus:border-ring transition"
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

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 1 — Cards de situação                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section title="Situação do dia">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ── Card Atrasados ── */}
            <SituacaoCard
              title={`⚠ Atrasados (${atrasados.reduce((s, g) => s + g.tarefas.length, 0)})`}
              borderColor="border-red-200"
              empty={atrasados.length === 0}
              emptyMsg="Nenhum item atrasado"
              expanded={atrasadosExp}
              footer={
                atrasados.length > CARD_LIMIT ? (
                  <Button
                    onClick={() => setAtrasadosExp(!atrasadosExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition"
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
                  </Button>
                ) : undefined
              }
            >
              <div className="space-y-1">
                {(atrasadosExp ? atrasados : atrasados.slice(0, CARD_LIMIT)).map(
                  ({ cliente, tarefas: tList }) => {
                    const open = atrasadosOpen.has(cliente.id_cliente);
                    return (
                      <div key={cliente.id_cliente}>
                        {/* Cabeçalho do grupo */}
                        <Button
                          className="w-full flex items-center justify-between py-2 text-left hover:text-foreground transition-colors"
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
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            {cliente.nome_empresa}
                          </Link>
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-shrink-0">
                            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                              {tList.length}
                            </span>
                            <span>{open ? "▲" : "▼"}</span>
                          </span>
                        </Button>

                        {/* Tarefas expandidas */}
                        {open && (
                          <div className="pl-3 border-l border-red-200 mb-2 space-y-1">
                            {tList.map((t) => (
                              <div
                                key={t.id}
                                className="text-xs text-muted-foreground py-0.5 flex items-start gap-1.5"
                              >
                                <span className="text-red-600 mt-0.5 flex-shrink-0">•</span>
                                <span>
                                  {t.o_que}
                                  {t.prazo && (
                                    <span className="text-red-600 ml-1">
                                      ({formatDate(t.prazo)})
                                    </span>
                                  )}
                                  {t.quem && <span className="text-blue-600 ml-1">· {t.quem}</span>}
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

            {/* ── Card Prioridades de Hoje ── */}
            <SituacaoCard
              title={`Hoje (${prioHoje.length})`}
              borderColor="border-amber-200"
              empty={prioHoje.length === 0}
              emptyMsg="Nada para hoje"
              expanded={hojeExp}
              footer={
                prioHoje.length > CARD_LIMIT ? (
                  <Button
                    onClick={() => setHojeExp(!hojeExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition"
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
                  </Button>
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

            {/* ── Card Esta Semana ── */}
            <SituacaoCard
              title={`Esta semana (${prioSemana.reduce((s, [, l]) => s + l.length, 0)})`}
              borderColor="border-blue-200"
              empty={prioSemana.length === 0}
              emptyMsg="Semana tranquila"
              expanded={semanaExp}
              footer={
                prioSemana.length > CARD_LIMIT ? (
                  <Button
                    onClick={() => setSemanaExp(!semanaExp)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition"
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
                  </Button>
                ) : undefined
              }
            >
              <div className="space-y-3">
                {(semanaExp ? prioSemana : prioSemana.slice(0, CARD_LIMIT)).map(([data, tList]) => (
                  <div key={data}>
                    <p className="text-xs text-blue-600 font-semibold mb-1 capitalize">
                      {formatDateFull(data)}
                    </p>
                    {tList.map((t) => (
                      <div
                        key={t.id}
                        className="text-xs text-foreground py-0.5 flex items-start gap-1.5 pl-2"
                      >
                        <span
                          className={`mt-0.5 flex-shrink-0 ${
                            t.status === "Em andamento"
                              ? "text-blue-500"
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
                          <span className="text-foreground">{t.o_que}</span>
                          {t.quem && <span className="text-muted-foreground ml-1">· {t.quem}</span>}
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
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {ranking.length === 0 ? (
              <p className="text-muted-foreground text-sm px-5 py-6">Nenhum cliente ativo.</p>
            ) : (
              ranking.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${
                    i !== 0 ? "border-t border-border" : ""
                  }`}
                >
                  {/* Posição */}
                  <span className="text-lg font-bold text-muted-foreground w-6 flex-shrink-0 text-center">
                    {i + 1}
                  </span>

                  {/* Nome + ID */}
                  <div className="w-44 flex-shrink-0">
                    <p className="font-semibold text-foreground text-sm leading-tight">
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
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                      {c.atrasadas} atrasada{c.atrasadas > 1 ? "s" : ""}
                    </span>
                  )}

                  {/* Botão ver tarefas */}
                  <Button
                    onClick={() => setModalCliente(c)}
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80 transition"
                  >
                    Ver tarefas
                  </Button>
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
                <div key={resp} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  {/* Nome */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-semibold text-foreground">{resp}</p>
                    <span className="text-sm font-bold" style={{ color: getScoreColor(score) }}>
                      {score}%
                    </span>
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">{finalizadas}</p>
                      <p className="text-xs text-muted-foreground">Finaliz.</p>
                    </div>
                    <div className="text-center">
                      <p
                        className={`text-lg font-bold ${atrasadas > 0 ? "text-red-600" : "text-muted-foreground"}`}
                      >
                        {atrasadas}
                      </p>
                      <p className="text-xs text-muted-foreground">Atrasadas</p>
                    </div>
                  </div>

                  {/* Barra semanal */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground">Progresso geral</p>
                      <p className="text-xs text-muted-foreground">
                        {finalizadas}/{total}
                      </p>
                    </div>
                    <ProgressBar score={score} height="h-1.5" />
                  </div>
                </div>
              ))}
          </div>
        </Section>
      </main>

      {/* ── Botão flutuante ── */}
      <Button
        onClick={handleSync}
        disabled={syncing}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-accent shadow-xl transition disabled:opacity-50"
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
      </Button>
    </div>
  );
}
