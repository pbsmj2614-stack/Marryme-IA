"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Header from "@/components/Header";
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
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRole } from "@/hooks/useRole";
import { usePipelineRaw, useInvalidatePipeline } from "@/hooks/useClientes";
import { PageLoading } from "@/components/ui";
import { useUIStore } from "@/store/uiStore";
import { Loader2, RefreshCw, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 line-through">
        Encerrado
      </span>
    );
  if (clienteStatus === "Pausado")
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        Pausado
      </span>
    );

  const status = getStatusFromScore(score);
  const styles: Record<string, string> = {
    "Em risco": "bg-red-100 text-red-700",
    "Em atenção": "bg-amber-100 text-amber-700",
    Saudável: "bg-green-100 text-green-700",
    Concluído: "bg-emerald-100 text-emerald-700",
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
    Finalizado: "bg-green-100 text-green-700",
    Atrasado: "bg-red-100 text-red-700",
    "Em andamento": "bg-brand-100 text-brand-700",
    "Não iniciado": "bg-gray-100 text-gray-500",
    Cancelado: "bg-gray-100 text-gray-400 line-through",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-500"}`}
    >
      {status}
    </span>
  );
}

// ─── Progresso bar ────────────────────────────────────────────────────────────

function ProgressBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{score}%</span>
    </div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`ml-1 text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
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
  locked = false,
}: {
  tarefas: Tarefa[];
  clienteId: string;
  onCheckChange: (tarefa: Tarefa, checked: boolean) => void;
  onUpdate: (tarefa: Tarefa, updates: EditForm) => Promise<void>;
  locked?: boolean;
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
      <p className="text-muted-foreground text-sm py-2">
        Nenhuma tarefa importada para este cliente.
      </p>
    );

  const inputCls =
    "bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-ring w-full";
  const selectCls = inputCls + " cursor-pointer";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-secondary/30 text-muted-foreground uppercase tracking-wider">
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
              ? "border-t border-border opacity-50"
              : `border-t border-border ${isEdit ? "bg-secondary/40" : "hover:bg-accent transition-colors"}`;
            return (
              <React.Fragment key={t.id}>
                <tr className={rowClass}>
                  {/* Check */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={t.check_feito}
                      onChange={(e) => {
                        if (!isEdit && !locked) onCheckChange(t, e.target.checked);
                      }}
                      disabled={locked}
                      className="w-3.5 h-3.5 accent-green-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      title={locked ? "Cliente pausado/encerrado" : "Marcar como concluído"}
                    />
                  </td>
                  {/* Etapa */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {t.etapa ?? "—"}
                  </td>
                  {/* O que */}
                  <td className="px-3 py-2 text-foreground">{t.o_que}</td>
                  {/* Tipo */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {t.tipo ?? "—"}
                  </td>
                  {/* Quem */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {t.quem ?? "—"}
                  </td>
                  {/* Prazo */}
                  <td
                    className={`px-3 py-2 whitespace-nowrap font-medium ${vencida ? "text-red-600" : "text-muted-foreground"}`}
                  >
                    {formatDate(t.prazo)}
                    {vencida && <span className="ml-1 text-red-600">!</span>}
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2">
                    <TarefaStatusBadge status={t.status} />
                  </td>
                  {/* Ações */}
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {!locked &&
                      (isEdit ? (
                        <Button
                          onClick={() => setEditingId(null)}
                          className="text-muted-foreground hover:text-foreground px-1"
                          title="Cancelar"
                        >
                          ✕
                        </Button>
                      ) : (
                        <Button
                          onClick={() => startEdit(t)}
                          className="text-muted-foreground hover:text-foreground px-1 transition"
                          title="Editar tarefa"
                        >
                          ✎
                        </Button>
                      ))}
                  </td>
                </tr>

                {/* Linha de edição inline */}
                {isEdit && (
                  <tr className="bg-secondary/20 border-t border-border">
                    <td />
                    <td className="px-2 py-2">
                      <input
                        className={inputCls}
                        placeholder="Etapa"
                        value={editForm.etapa}
                        onChange={(e) => setEditForm((f) => ({ ...f, etapa: e.target.value }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground text-xs italic">{t.o_que}</td>
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
                      <Button
                        onClick={() => saveEdit(t)}
                        disabled={saving}
                        className="text-xs px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 transition whitespace-nowrap"
                      >
                        {saving ? "…" : "Salvar"}
                      </Button>
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
  color = "text-foreground",
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
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

function buildClientes(rawClientes: Cliente[], rawTarefas: Tarefa[]): ClienteComMetricas[] {
  const tarefas = dedupTarefas(rawTarefas);
  const clientesDedup = dedupClientesByNome(rawClientes);
  const hoje = new Date().toISOString().split("T")[0];
  return clientesDedup.map((c) => {
    const tCliente = tarefas.filter((t) => t.cliente_id === c.id_cliente);
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
}

export default function PipelinePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const { role } = useRole();
  const { data: rawData, isLoading: dataLoading } = usePipelineRaw(!!user);
  const invalidatePipeline = useInvalidatePipeline();

  const {
    filtroResponsavel: responsavel,
    setFiltroResponsavel: setResponsavel,
    pipelineFiltroStatus: filtro,
    pipelineBusca: busca,
    pipelineSortKey: sortKey,
    pipelineSortDir: sortDir,
    setPipelineFiltroStatus: setFiltro,
    setPipelineBusca: setBusca,
    setPipelineSortKey: setSortKey,
    setPipelineSortDir: setSortDir,
  } = useUIStore();

  const [clientes, setClientes] = useState<ClienteComMetricas[]>([]);
  const loading = userLoading || dataLoading;
  const [syncing, setSyncing] = useState(false);
  const [syncingGaps, setSyncingGaps] = useState(false);
  const [cleaningGaps, setCleaningGaps] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mostrarFinalizadasIds, setMostrarFinalizadasIds] = useState<Set<string>>(new Set());
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

  // Sync query data → local state (preserva optimistic updates entre fetches)
  useEffect(() => {
    if (rawData)
      setClientes(buildClientes(rawData.clientes as Cliente[], rawData.tarefas as Tarefa[]));
  }, [rawData]);

  // Redirect se não autenticado
  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [user, userLoading, router]);

  // ── Sync ──
  async function handleSync() {
    setSyncing(true);
    try {
      // Sync primeiro (apaga e reinsere mm_clientes); write-back lê depois
      const result = await importarPlanilha();
      const wb = await fetch("/api/sheets/write-back-status", { method: "POST" }).catch(() => null);

      // ── monta mensagem de sync ──
      const parts: string[] = [`${result.clientes} clientes · ${result.tarefas} tarefas`];
      if (result.semAbas.length > 0) parts.push(`sem aba: ${result.semAbas.join(", ")}`);
      if (result.semTarefas.length > 0) parts.push(`sem tarefas: ${result.semTarefas.join(", ")}`);
      if (result.erros.length > 0) parts.push(`erros: ${result.erros.join(" | ")}`);

      // ── sufixo do write-back (só mostra se corrigiu algo ou deu erro) ──
      let wbErro = "";
      if (!wb) {
        wbErro = "planilha: erro de rede";
      } else {
        try {
          const wbData = (await wb.json()) as {
            ok?: boolean;
            atualizados?: number;
            error?: string;
          };
          if (!wb.ok || !wbData.ok) {
            wbErro = `planilha: ${wbData.error ?? `Erro ${wb.status}`}`;
          } else if ((wbData.atualizados ?? 0) > 0) {
            parts.push(`${wbData.atualizados} status atualizado(s) na planilha`);
          }
        } catch {
          wbErro = "planilha: resposta inválida";
        }
      }

      if (wbErro) parts.push(wbErro);

      const msg = parts.join(" · ");
      const temProblema = result.erros.length > 0 || result.semAbas.length > 0 || !!wbErro;
      if (temProblema) {
        toast.warning(msg, { duration: 12000 });
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

  // ── Corrigir Gaps: cria pipeline para prestadores sem mm_clientes ──
  async function handleSyncGaps() {
    setSyncingGaps(true);
    try {
      const res = await fetch("/api/admin/sync-pipeline", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: Array<{ id: string; nome: string; aba: string | null }>;
        skipped?: number;
        erros?: Array<{ nome: string; erro: string }>;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Erro ${res.status}`);

      const { created = [], erros = [] } = data;
      if (created.length === 0 && erros.length === 0) {
        toast.success("Nenhum gap encontrado — todos os prestadores já têm pipeline.");
      } else {
        const parts: string[] = [];
        if (created.length > 0)
          parts.push(
            `${created.length} criado(s): ${created.map((c) => `${c.id} ${c.nome}`).join(", ")}`
          );
        if (erros.length > 0)
          parts.push(`${erros.length} erro(s): ${erros.map((e) => e.nome).join(", ")}`);
        if (erros.length > 0) toast.warning(parts.join(" · "), { duration: 15000 });
        else toast.success(parts.join(" · "), { duration: 10000 });
      }
      await invalidatePipeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao corrigir gaps");
    } finally {
      setSyncingGaps(false);
    }
  }

  // ── Limpar Gaps: remove mm_clientes a partir de um ID ──
  async function handleCleanGaps(fromId: string) {
    const confirm = window.confirm(
      `Isso vai APAGAR permanentemente todos os registros de pipeline a partir de ${fromId} (Supabase + Sheets). Continuar?`
    );
    if (!confirm) return;
    setCleaningGaps(true);
    try {
      const res = await fetch(`/api/admin/sync-pipeline?from=${encodeURIComponent(fromId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deleted?: string[];
        sheetsRequests?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Erro ${res.status}`);

      if ((data.deleted ?? []).length === 0) {
        toast.info(data.message ?? "Nenhum registro encontrado.");
      } else {
        toast.success(
          `${data.deleted!.length} registro(s) removido(s): ${data.deleted!.join(", ")}`,
          { duration: 12000 }
        );
      }
      await invalidatePipeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao limpar gaps");
    } finally {
      setCleaningGaps(false);
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
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
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
      toast.success("Tarefa atualizada na planilha");
    } catch (err) {
      // Revert
      setClientes((prev) =>
        prev.map((c) => ({
          ...c,
          tarefas: c.tarefas.map((t) => (t.id === tarefa.id ? tarefa : t)),
        }))
      );
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function handleStatusChange(idCliente: string, novoStatus: StatusCliente) {
    try {
      const res = await fetch("/api/sheets/update-cliente-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: idCliente, status: novoStatus }),
      });
      const data = (await res.json()) as { ok?: boolean; rowFound?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      const labels: Record<StatusCliente, string> = {
        Ativo: "reativado",
        Pausado: "pausado",
        Encerrado: "encerrado",
      };
      if (data.rowFound === false) {
        toast.warning(`Cliente ${labels[novoStatus]} (Supabase OK, planilha: ID não encontrado)`);
      } else {
        toast.success(`Cliente ${labels[novoStatus]}`);
      }
      setExpandedId(null);
      await invalidatePipeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status");
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
      toast.success("Tarefa adicionada na planilha e no sistema");
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
      await invalidatePipeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar tarefa");
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
        const av = a[sortKey as SortKey];
        const bv = b[sortKey as SortKey];
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
      setSortKey(key as string);
      setSortDir("asc");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-3 text-foreground">Pipeline de clientes</h1>
            <div className="flex flex-wrap gap-2">
              <SummaryBadge label="clientes ativos" value={metrics.ativos} />
              <SummaryBadge
                label="tarefas atrasadas"
                value={metrics.atrasadasTotal}
                color={metrics.atrasadasTotal > 0 ? "text-red-600" : "text-foreground"}
              />
              <SummaryBadge
                label="em risco"
                value={metrics.emRisco}
                color={metrics.emRisco > 0 ? "text-red-600" : "text-foreground"}
              />
              <SummaryBadge
                label="pausados"
                value={metrics.pausados}
                color="text-muted-foreground"
              />
              <SummaryBadge
                label="encerrados"
                value={metrics.encerrados}
                color="text-muted-foreground"
              />
            </div>
          </div>

          <Button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition disabled:opacity-50 whitespace-nowrap"
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Sincronizar Sheets
              </>
            )}
          </Button>

          {role === "admin" && (
            <>
              <Button
                onClick={handleSyncGaps}
                disabled={syncingGaps || syncing || cleaningGaps}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-100 border border-green-300 text-sm text-green-700 hover:bg-green-200 transition disabled:opacity-50 whitespace-nowrap"
              >
                {syncingGaps ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando gaps...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Corrigir Gaps
                  </>
                )}
              </Button>

              <Button
                onClick={() => {
                  const id = window.prompt("Apagar a partir de qual ID? (ex: MM046)");
                  if (id) handleCleanGaps(id.trim().toUpperCase());
                }}
                disabled={cleaningGaps || syncing || syncingGaps}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-100 border border-red-300 text-sm text-red-700 hover:bg-red-200 transition disabled:opacity-50 whitespace-nowrap"
              >
                {cleaningGaps ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Limpando...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" /> Limpar Gaps
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        {/* ── Filtros ── */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center shadow-sm">
          {/* Pills de status */}
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  filtro === f
                    ? "border-primary text-primary bg-primary/10 hover:bg-primary/15"
                    : "border-border text-muted-foreground hover:border-ring hover:text-foreground hover:bg-accent"
                }`}
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="h-5 border-l border-border hidden sm:block" />

          {/* Busca */}
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
              placeholder="Buscar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-sm bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring w-48"
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

          {/* Responsável */}
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring cursor-pointer"
          >
            {RESPONSAVEIS.map((r) => (
              <option key={r} value={r}>
                {r === "Todos" ? "Todos os responsáveis" : r}
              </option>
            ))}
          </select>
        </div>

        {/* ── Tabela ── */}
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="bg-secondary/30 border-b border-border px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Clique no cabeçalho para ordenar · Clique na linha para ver tarefas
            </p>
            <p className="text-xs text-muted-foreground">{clientesFiltrados.length} clientes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  {TABLE_COLS.map(({ key, label, center }) => (
                    <th
                      key={label}
                      onClick={() => key && handleSort(key)}
                      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${
                        center ? "text-center" : "text-left"
                      } ${key ? "cursor-pointer hover:text-foreground select-none" : ""}`}
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
                    <td colSpan={9} className="text-center py-16 text-muted-foreground">
                      Nenhum cliente encontrado
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((c, i) => (
                    <React.Fragment key={c.id}>
                      {/* ── Linha do cliente ── */}
                      <tr
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        className={`cursor-pointer border-t border-border transition-colors ${
                          i % 2 === 0 ? "bg-card" : "bg-background"
                        } hover:bg-accent`}
                      >
                        {/* ID */}
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                          {c.id_cliente}
                        </td>
                        {/* Cliente */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-foreground">{c.nome_empresa}</p>
                          {c.responsavel_mm && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {c.responsavel_mm}
                            </p>
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
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        {/* Total */}
                        <td className="px-4 py-3 text-center text-foreground">{c.total_tarefas}</td>
                        {/* Finalizadas */}
                        <td className="px-4 py-3 text-center text-green-600 font-medium">
                          {c.finalizadas}
                        </td>
                        {/* Atrasadas */}
                        <td
                          className={`px-4 py-3 text-center font-medium ${
                            c.atrasadas > 0 ? "text-red-600" : "text-green-600"
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
                            className="px-5 py-4 bg-secondary/20 border-t border-border"
                          >
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                                Tarefas · {c.nome_empresa}
                              </p>
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.fase_projeto && (
                                  <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                    {c.fase_projeto}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {c.finalizadas}/{c.total_tarefas} concluídas
                                </span>
                                {c.finalizadas > 0 && (
                                  <Button
                                    onClick={() =>
                                      setMostrarFinalizadasIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(c.id)) next.delete(c.id);
                                        else next.add(c.id);
                                        return next;
                                      })
                                    }
                                    className="text-xs px-2 py-0.5 rounded-lg bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80 transition"
                                  >
                                    {mostrarFinalizadasIds.has(c.id)
                                      ? "Ocultar concluídas"
                                      : `+ ${c.finalizadas} concluída${c.finalizadas > 1 ? "s" : ""}`}
                                  </Button>
                                )}
                                {c.status === "Ativo" && (
                                  <Button
                                    onClick={() =>
                                      setAddTarefaFor(
                                        addTarefaFor === c.id_cliente ? null : c.id_cliente
                                      )
                                    }
                                    className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80 transition"
                                  >
                                    <Plus className="w-3 h-3" /> Tarefa
                                  </Button>
                                )}
                              </div>
                            </div>
                            {c.status !== "Ativo" && (
                              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                                <span>🔒</span>
                                <span>
                                  Cliente {c.status.toLowerCase()} — tarefas somente leitura.
                                  Reative para editar.
                                </span>
                              </p>
                            )}
                            <TabelaTarefas
                              tarefas={
                                mostrarFinalizadasIds.has(c.id)
                                  ? c.tarefas
                                  : c.tarefas.filter(
                                      (t) => !t.check_feito && t.status !== "Finalizado"
                                    )
                              }
                              clienteId={c.id_cliente}
                              onCheckChange={handleCheckChange}
                              onUpdate={handleUpdateTarefa}
                              locked={c.status !== "Ativo"}
                            />

                            {/* ── Formulário de nova tarefa (apenas Ativos) ── */}
                            {addTarefaFor === c.id_cliente && c.status === "Ativo" && (
                              <div
                                className="mt-3 p-4 rounded-xl bg-secondary/30 border border-border space-y-3"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                                  Nova tarefa
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <input
                                    placeholder="Etapa"
                                    value={addTarefaForm.etapa}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, etapa: e.target.value }))
                                    }
                                    className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                                  />
                                  <input
                                    placeholder="O que fazer? *"
                                    value={addTarefaForm.o_que}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, o_que: e.target.value }))
                                    }
                                    className="col-span-2 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                                  />
                                  <select
                                    value={addTarefaForm.tipo}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, tipo: e.target.value }))
                                    }
                                    className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
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
                                    className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
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
                                    className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
                                  />
                                  <select
                                    value={addTarefaForm.status}
                                    onChange={(e) =>
                                      setAddTarefaForm((f) => ({ ...f, status: e.target.value }))
                                    }
                                    className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
                                  >
                                    <option>Não iniciado</option>
                                    <option>Em andamento</option>
                                    <option>Finalizado</option>
                                  </select>
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => handleAddTarefa(c.id_cliente)}
                                      disabled={savingTarefa || !addTarefaForm.o_que.trim()}
                                      className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition font-medium"
                                    >
                                      {savingTarefa ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
                                        </>
                                      ) : (
                                        "Salvar"
                                      )}
                                    </Button>
                                    <Button
                                      onClick={() => setAddTarefaFor(null)}
                                      className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div
                              className="mt-4 pt-3 border-t border-border flex items-center gap-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-muted-foreground">
                                Status do contrato:
                              </span>
                              {(["Ativo", "Pausado", "Encerrado"] as StatusCliente[]).map((s) => (
                                <Button
                                  key={s}
                                  onClick={() =>
                                    c.status !== s && handleStatusChange(c.id_cliente, s)
                                  }
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                                    c.status === s
                                      ? s === "Ativo"
                                        ? "bg-green-100 border-green-300 text-green-700 cursor-default"
                                        : s === "Pausado"
                                          ? "bg-amber-100 border-amber-300 text-amber-700 cursor-default"
                                          : "bg-gray-100 border-gray-300 text-gray-600 cursor-default"
                                      : "bg-transparent border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700"
                                  }`}
                                >
                                  {s === c.status ? `● ${s}` : s}
                                </Button>
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
