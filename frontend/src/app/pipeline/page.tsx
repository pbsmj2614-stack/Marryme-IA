"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase";
import { importarPlanilha } from "@/lib/importSheets";
import { getStatusFromScore, getScoreColor } from "@/lib/healthScore";
import {
  isPrazoVencido,
  formatDate,
  planoBadgeClass,
  planoLabel,
  dedupClientesByNome,
  dedupTarefas,
} from "@/lib/client-utils";
import { RESPONSAVEIS as RESPONSAVEIS_BASE } from "@/lib/constants";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusCliente = "Ativo" | "Pausado" | "Encerrado";
type StatusScore = "Em risco" | "Em atenção" | "Saudável" | "Concluído";
type FiltroStatus = "Todos" | "Em risco" | "Em atenção" | "Saudáveis" | "Pausados" | "Encerrados";
type SortKey =
  | "id_cliente"
  | "nome_empresa"
  | "plano"
  | "total_tarefas"
  | "finalizadas"
  | "atrasadas"
  | "score"
  | "statusScore";

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
  prazo: string | null; // YYYY-MM-DD
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

const FILTROS: FiltroStatus[] = [
  "Todos",
  "Em risco",
  "Em atenção",
  "Saudáveis",
  "Pausados",
  "Encerrados",
];
const RESPONSAVEIS = ["Todos", ...RESPONSAVEIS_BASE] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 text-xs">
        ✕
      </button>
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────

function ClienteStatusBadge({
  score,
  clienteStatus,
}: {
  score: number;
  clienteStatus: StatusCliente;
}) {
  if (clienteStatus === "Encerrado")
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 line-through">
        Encerrado
      </span>
    );
  if (clienteStatus === "Pausado")
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
        Pausado
      </span>
    );

  const status = getStatusFromScore(score);
  const styles: Record<string, string> = {
    "Em risco": "bg-red-900 text-red-300",
    "Em atenção": "bg-yellow-900 text-yellow-300",
    Saudável: "bg-green-900 text-green-300",
    Concluído: "bg-emerald-900 text-emerald-300",
  };
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] ?? styles["Em risco"]}`}
    >
      {status}
    </span>
  );
}

function TarefaStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Finalizado: "bg-green-900 text-green-300",
    Atrasado: "bg-red-900 text-red-300",
    "Em andamento": "bg-blue-900 text-blue-300",
    "Não iniciado": "bg-gray-700 text-gray-400",
    Cancelado: "bg-gray-800 text-gray-600 line-through",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-700 text-gray-400"}`}
    >
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

type EditForm = { etapa: string; quem: string; prazo: string; status: string; observacoes: string };

function TabelaTarefas({
  tarefas,
  clienteId: _clienteId,
  onCheckChange,
  onUpdate,
}: {
  tarefas: Tarefa[];
  clienteId: string;
  onCheckChange: (tarefa: Tarefa, checked: boolean) => void;
  onUpdate: (tarefa: Tarefa, updates: EditForm) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    etapa: "",
    quem: "",
    prazo: "",
    status: "",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  function startEdit(t: Tarefa) {
    setEditingId(t.id);
    setEditForm({
      etapa: t.etapa ?? "",
      quem: t.quem ?? "",
      prazo: t.prazo ?? "", // YYYY-MM-DD
      status: t.status ?? "Não iniciado",
      observacoes: t.observacoes ?? "",
    });
  }

  async function saveEdit(t: Tarefa) {
    setSaving(true);
    await onUpdate(t, editForm);
    setSaving(false);
    setEditingId(null);
  }

  if (tarefas.length === 0)
    return (
      <p className="text-gray-500 text-sm py-2">Nenhuma tarefa importada para este cliente.</p>
    );

  const inputCls =
    "bg-[#111] border border-[#444] rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-[#666] w-full";
  const selectCls = inputCls + " cursor-pointer";

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
            <th className="px-2 py-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {tarefas.map((t) => {
            const vencida = isPrazoVencido(t.prazo, t.status);
            const isEdit = editingId === t.id;
            const rowClass = t.check_feito
              ? "border-t border-[#2a2a2a] opacity-50"
              : `border-t border-[#2a2a2a] ${isEdit ? "bg-[#1a1a2e]" : "hover:bg-[#1e1e2e] transition-colors"}`;
            return (
              <React.Fragment key={t.id}>
                <tr className={rowClass}>
                  {/* Check */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={t.check_feito}
                      onChange={(e) => {
                        if (!isEdit) onCheckChange(t, e.target.checked);
                      }}
                      className="w-3.5 h-3.5 accent-green-500 cursor-pointer"
                      title="Marcar como concluído"
                    />
                  </td>
                  {/* Etapa */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.etapa ?? "—"}</td>
                  {/* O que */}
                  <td className="px-3 py-2 text-gray-200">{t.o_que}</td>
                  {/* Tipo */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.tipo ?? "—"}</td>
                  {/* Quem */}
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{t.quem ?? "—"}</td>
                  {/* Prazo */}
                  <td
                    className={`px-3 py-2 whitespace-nowrap font-medium ${vencida ? "text-red-400" : "text-gray-400"}`}
                  >
                    {formatDate(t.prazo)}
                    {vencida && <span className="ml-1 text-red-500">!</span>}
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2">
                    <TarefaStatusBadge status={t.status} />
                  </td>
                  {/* Ações */}
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {isEdit ? (
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-500 hover:text-gray-300 px-1"
                        title="Cancelar"
                      >
                        ✕
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(t)}
                        className="text-gray-600 hover:text-gray-300 px-1 transition"
                        title="Editar tarefa"
                      >
                        ✎
                      </button>
                    )}
                  </td>
                </tr>

                {/* Linha de edição inline */}
                {isEdit && (
                  <tr className="bg-[#131325] border-t border-[#333]">
                    <td />
                    <td className="px-2 py-2">
                      <input
                        className={inputCls}
                        placeholder="Etapa"
                        value={editForm.etapa}
                        onChange={(e) => setEditForm((f) => ({ ...f, etapa: e.target.value }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-gray-600 text-xs italic">{t.o_que}</td>
                    <td />
                    <td className="px-2 py-2">
                      <select
                        className={selectCls}
                        value={editForm.quem}
                        onChange={(e) => setEditForm((f) => ({ ...f, quem: e.target.value }))}
                      >
                        <option value="">—</option>
                        {RESPONSAVEIS.filter((r) => r !== "Todos").map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                        <option>Cliente</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        className={inputCls}
                        value={editForm.prazo}
                        onChange={(e) => setEditForm((f) => ({ ...f, prazo: e.target.value }))}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={selectCls}
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        <option>Não iniciado</option>
                        <option>Em andamento</option>
                        <option>Finalizado</option>
                        <option>Atrasado</option>
                        <option>Cancelado</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => saveEdit(t)}
                        disabled={saving}
                        className="text-xs px-3 py-1 rounded bg-brand-700 hover:bg-brand-600 text-white disabled:opacity-40 transition whitespace-nowrap"
                      >
                        {saving ? "…" : "Salvar"}
                      </button>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Badge de resumo ──────────────────────────────────────────────────────────

function SummaryBadge({
  label,
  value,
  color = "text-gray-200",
}: {
  label: string;
  value: number | string;
  color?: string;
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
  { key: "id_cliente", label: "ID" },
  { key: "nome_empresa", label: "Cliente" },
  { key: "plano", label: "Plano" },
  { key: "total_tarefas", label: "Tarefas", center: true },
  { key: "finalizadas", label: "Finaliz.", center: true },
  { key: "atrasadas", label: "Atrasadas", center: true },
  { key: "score", label: "Progresso" },
  { key: null, label: "Score", center: true },
  { key: "statusScore", label: "Status" },
];

export default function PipelinePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [clientes, setClientes] = useState<ClienteComMetricas[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filtro, setFiltro] = useState<FiltroStatus>("Todos");
  const [busca, setBusca] = useState("");
  const [responsavel, setResponsavel] = useState("Todos");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mostrarFinalizadas, setMostrarFinalizadas] = useState(false);
  const [addTarefaFor, setAddTarefaFor] = useState<string | null>(null);
  const [addTarefaForm, setAddTarefaForm] = useState({
    etapa: "",
    o_que: "",
    tipo: "Marry Me",
    quem: "",
    prazo: "",
    status: "Não iniciado",
    observacoes: "",
  });
  const [savingTarefa, setSavingTarefa] = useState(false);

  // ── Load data ──
  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [{ data: clientesData }, { data: tarefasData }] = await Promise.all([
      supabase
        .from("mm_clientes")
        .select(
          "id,id_cliente,nome_empresa,segmento,plano,valor_contrato,status,fase_projeto,responsavel_mm,sheets_aba"
        )
        .order("id_cliente")
        .limit(500),
      supabase
        .from("mm_tarefas")
        .select("id,cliente_id,check_feito,etapa,o_que,tipo,quem,prazo,status,observacoes")
        .limit(2000),
    ]);

    const tarefas = dedupTarefas((tarefasData ?? []) as Tarefa[]);
    const clientesDedup = dedupClientesByNome((clientesData ?? []) as Cliente[]);

    const resultado: ClienteComMetricas[] = clientesDedup.map((c: Cliente) => {
      const tCliente = tarefas.filter((t) => t.cliente_id === c.id_cliente);
      const hoje = new Date().toISOString().split("T")[0];
      const finalizadas = tCliente.filter((t) => t.check_feito || t.status === "Finalizado").length;
      const atrasadas = tCliente.filter(
        (t) =>
          !t.check_feito &&
          t.status !== "Finalizado" &&
          t.status !== "Cancelado" &&
          (t.status === "Atrasado" || (t.prazo != null && t.prazo < hoje))
      ).length;
      const total = tCliente.length;
      const totalAtivo = tCliente.filter((t) => t.status !== "Cancelado").length;
      const score = totalAtivo > 0 ? Math.round((finalizadas / totalAtivo) * 100) : 0;
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
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
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

  // ── Check toggle — atualiza Supabase + Sheets ──
  async function handleCheckChange(tarefa: Tarefa, checked: boolean) {
    const hoje = new Date().toISOString().split("T")[0];
    const newStatus = checked
      ? "Finalizado"
      : tarefa.prazo && tarefa.prazo < hoje
        ? "Atrasado"
        : "Não iniciado";

    // Optimistic update (check + status)
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        tarefas: c.tarefas.map((t) =>
          t.id === tarefa.id ? { ...t, check_feito: checked, status: newStatus } : t
        ),
      }))
    );

    try {
      const res = await fetch("/api/sheets/update-tarefa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tarefa.id,
          id_cliente: tarefa.cliente_id,
          o_que_original: tarefa.o_que,
          prazo_original: tarefa.prazo,
          etapa_original: tarefa.etapa,
          check_feito: checked,
          status: newStatus,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao salvar");
    } catch (err) {
      // Revert
      setClientes((prev) =>
        prev.map((c) => ({
          ...c,
          tarefas: c.tarefas.map((t) =>
            t.id === tarefa.id ? { ...t, check_feito: !checked, status: tarefa.status } : t
          ),
        }))
      );
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Erro ao salvar" });
    }
  }

  // ── Atualizar campos de tarefa — atualiza Supabase + Sheets ──
  async function handleUpdateTarefa(tarefa: Tarefa, updates: EditForm): Promise<void> {
    // Optimistic update
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        tarefas: c.tarefas.map((t) =>
          t.id === tarefa.id
            ? {
                ...t,
                etapa: updates.etapa || null,
                quem: updates.quem || null,
                prazo: updates.prazo || null,
                status: updates.status,
                observacoes: updates.observacoes || null,
              }
            : t
        ),
      }))
    );

    try {
      const res = await fetch("/api/sheets/update-tarefa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tarefa.id,
          id_cliente: tarefa.cliente_id,
          o_que_original: tarefa.o_que,
          prazo_original: tarefa.prazo,
          etapa_original: tarefa.etapa,
          etapa: updates.etapa,
          quem: updates.quem,
          prazo: updates.prazo,
          status: updates.status,
          observacoes: updates.observacoes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao atualizar");
      setToast({ type: "success", msg: "Tarefa atualizada na planilha" });
    } catch (err) {
      // Revert
      setClientes((prev) =>
        prev.map((c) => ({
          ...c,
          tarefas: c.tarefas.map((t) => (t.id === tarefa.id ? tarefa : t)),
        }))
      );
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Erro ao atualizar" });
    }
  }

  async function handleStatusChange(idCliente: string, novoStatus: StatusCliente) {
    const supabase = createClient();
    const { error } = await supabase
      .from("mm_clientes")
      .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
      .eq("id_cliente", idCliente);
    if (error) {
      setToast({ type: "error", msg: `Erro: ${error.message}` });
    } else {
      const labels: Record<StatusCliente, string> = {
        Ativo: "reativado",
        Pausado: "pausado",
        Encerrado: "encerrado",
      };
      setToast({ type: "success", msg: `Cliente ${labels[novoStatus]}` });
      setExpandedId(null);
      await loadData();
    }
  }

  async function handleAddTarefa(idCliente: string) {
    if (!addTarefaForm.o_que.trim()) return;
    setSavingTarefa(true);
    try {
      const res = await fetch("/api/sheets/add-tarefa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: idCliente, ...addTarefaForm }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erro ao salvar");
      setToast({ type: "success", msg: "Tarefa adicionada na planilha e no sistema" });
      setAddTarefaFor(null);
      setAddTarefaForm({
        etapa: "",
        o_que: "",
        tipo: "Marry Me",
        quem: "",
        prazo: "",
        status: "Não iniciado",
        observacoes: "",
      });
      await loadData();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Erro ao salvar tarefa",
      });
    } finally {
      setSavingTarefa(false);
    }
  }

  // ── Summary metrics ──
  const metrics = useMemo(() => {
    const ativos = clientes.filter((c) => !/paus|encerr/i.test(c.status ?? ""));
    const pausados = clientes.filter((c) => /paus/i.test(c.status ?? "")).length;
    const encerrados = clientes.filter((c) => /encerr/i.test(c.status ?? "")).length;
    const atrasadasTotal = ativos.reduce((s, c) => s + c.atrasadas, 0);
    const emRisco = ativos.filter((c) => c.score < 50).length;
    return { ativos: ativos.length, pausados, encerrados, atrasadasTotal, emRisco };
  }, [clientes]);

  // ── Filtered + sorted ──
  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter((c) => {
      if (filtro === "Encerrados") return /encerr/i.test(c.status ?? "");
      if (filtro === "Pausados") return /paus/i.test(c.status ?? "");
      if (/paus|encerr/i.test(c.status ?? "")) return false;
      if (filtro === "Em risco") return c.statusScore === "Em risco";
      if (filtro === "Em atenção") return c.statusScore === "Em atenção";
      if (filtro === "Saudáveis")
        return c.statusScore === "Saudável" || c.statusScore === "Concluído";
      return true;
    });

    // Filtro busca
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(
        (c) => c.nome_empresa.toLowerCase().includes(q) || c.id_cliente.toLowerCase().includes(q)
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
    else {
      setSortKey(key);
      setSortDir("asc");
    }
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

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-3">Pipeline de clientes</h1>
            <div className="flex flex-wrap gap-2">
              <SummaryBadge label="clientes ativos" value={metrics.ativos} />
              <SummaryBadge
                label="tarefas atrasadas"
                value={metrics.atrasadasTotal}
                color={metrics.atrasadasTotal > 0 ? "text-red-400" : "text-gray-200"}
              />
              <SummaryBadge
                label="em risco"
                value={metrics.emRisco}
                color={metrics.emRisco > 0 ? "text-red-400" : "text-gray-200"}
              />
              <SummaryBadge label="pausados" value={metrics.pausados} color="text-gray-400" />
              <SummaryBadge label="encerrados" value={metrics.encerrados} color="text-zinc-500" />
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
          <div className="relative flex items-center">
            <svg
              className="absolute left-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none"
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
              placeholder="Buscar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-sm bg-[#1a1a1a] border border-[#444] rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#666] w-48"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-2 text-gray-500 hover:text-gray-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

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
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
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
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium ${planoBadgeClass(c.plano)}`}
                            >
                              {planoLabel(c.plano)}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        {/* Total */}
                        <td className="px-4 py-3 text-center text-gray-300">{c.total_tarefas}</td>
                        {/* Finalizadas */}
                        <td className="px-4 py-3 text-center text-green-400 font-medium">
                          {c.finalizadas}
                        </td>
                        {/* Atrasadas */}
                        <td
                          className={`px-4 py-3 text-center font-medium ${
                            c.atrasadas > 0 ? "text-red-400" : "text-green-400"
                          }`}
                        >
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
                          <ClienteStatusBadge score={c.score} clienteStatus={c.status} />
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
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.fase_projeto && (
                                  <span className="text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded-full">
                                    {c.fase_projeto}
                                  </span>
                                )}
                                <span className="text-xs text-gray-600">
                                  {c.finalizadas}/{c.total_tarefas} concluídas
                                </span>
                                {c.finalizadas > 0 && (
                                  <button
                                    onClick={() => setMostrarFinalizadas((v) => !v)}
                                    className="text-xs px-2 py-0.5 rounded-lg bg-[#2a2a2a] border border-[#333] text-gray-500 hover:text-gray-300 transition"
                                  >
                                    {mostrarFinalizadas
                                      ? "Ocultar concluídas"
                                      : `+ ${c.finalizadas} concluída${c.finalizadas > 1 ? "s" : ""}`}
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    setAddTarefaFor(
                                      addTarefaFor === c.id_cliente ? null : c.id_cliente
                                    )
                                  }
                                  className="text-xs px-2.5 py-1 rounded-lg bg-[#2a2a2a] border border-[#444] text-gray-300 hover:border-[#666] hover:text-white transition"
                                >
                                  + Tarefa
                                </button>
                              </div>
                            </div>
                            <TabelaTarefas
                              tarefas={
                                mostrarFinalizadas
                                  ? c.tarefas
                                  : c.tarefas.filter(
                                      (t) => !t.check_feito && t.status !== "Finalizado"
                                    )
                              }
                              clienteId={c.id_cliente}
                              onCheckChange={handleCheckChange}
                              onUpdate={handleUpdateTarefa}
                            />

                            {/* ── Formulário de nova tarefa ── */}
                            {addTarefaFor === c.id_cliente && (
                              <div
                                className="mt-3 p-4 rounded-xl bg-[#1a1a2e] border border-[#333] space-y-3"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                                  Nova tarefa
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <input
                                    placeholder="Etapa"
                                    value={addTarefaForm.etapa}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, etapa: e.target.value }))
                                    }
                                    className="bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#666]"
                                  />
                                  <input
                                    placeholder="O que fazer? *"
                                    value={addTarefaForm.o_que}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, o_que: e.target.value }))
                                    }
                                    className="col-span-2 bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#666]"
                                  />
                                  <select
                                    value={addTarefaForm.tipo}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, tipo: e.target.value }))
                                    }
                                    className="bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#666] cursor-pointer"
                                  >
                                    <option>Marry Me</option>
                                    <option>Cliente</option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <select
                                    value={addTarefaForm.quem}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, quem: e.target.value }))
                                    }
                                    className="bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#666] cursor-pointer"
                                  >
                                    <option value="">Quem?</option>
                                    {RESPONSAVEIS.filter((r) => r !== "Todos").map((r) => (
                                      <option key={r}>{r}</option>
                                    ))}
                                    <option>Cliente</option>
                                  </select>
                                  <input
                                    type="date"
                                    value={addTarefaForm.prazo}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, prazo: e.target.value }))
                                    }
                                    className="bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#666]"
                                  />
                                  <select
                                    value={addTarefaForm.status}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, status: e.target.value }))
                                    }
                                    className="bg-[#1e1e1e] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#666] cursor-pointer"
                                  >
                                    <option>Não iniciado</option>
                                    <option>Em andamento</option>
                                    <option>Finalizado</option>
                                  </select>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleAddTarefa(c.id_cliente)}
                                      disabled={savingTarefa || !addTarefaForm.o_que.trim()}
                                      className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition font-medium"
                                    >
                                      {savingTarefa ? "Salvando…" : "Salvar"}
                                    </button>
                                    <button
                                      onClick={() => setAddTarefaFor(null)}
                                      className="text-xs px-3 py-1.5 rounded-lg border border-[#444] text-gray-500 hover:text-gray-300 transition"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div
                              className="mt-4 pt-3 border-t border-[#2a2a2a] flex items-center gap-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-gray-500">Status do contrato:</span>
                              {(["Ativo", "Pausado", "Encerrado"] as StatusCliente[]).map((s) => (
                                <button
                                  key={s}
                                  onClick={() =>
                                    c.status !== s && handleStatusChange(c.id_cliente, s)
                                  }
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                                    c.status === s
                                      ? s === "Ativo"
                                        ? "bg-green-950 border-green-700 text-green-300 cursor-default"
                                        : s === "Pausado"
                                          ? "bg-gray-800 border-gray-600 text-gray-300 cursor-default"
                                          : "bg-zinc-900 border-zinc-600 text-zinc-300 cursor-default"
                                      : "bg-transparent border-[#444] text-gray-500 hover:border-[#666] hover:text-gray-300"
                                  }`}
                                >
                                  {s === c.status ? `● ${s}` : s}
                                </button>
                              ))}
                            </div>
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
