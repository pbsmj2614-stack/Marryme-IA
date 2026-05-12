"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, RefreshCw, X, ChevronDown, ChevronUp } from "lucide-react";
import Header from "@/components/Header";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDashboardRaw, useInvalidateDashboard } from "@/hooks/useClientes";
import { PageLoading } from "@/components/ui";
import { Button } from "@/components/ui/button";
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

import type { KPIsCampanha, CampanhaInsight, DadosRelatorio, ContaMeta } from "@/lib/types";
import { fmt, fmtBRL, fmtPct } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusMeta = "Saudável" | "Em atenção" | "Em risco" | "Sem dados";
type FiltroStatus =
  | "Todos"
  | "Em risco"
  | "Em atenção"
  | "Saudáveis"
  | "Sem dados"
  | "Pausados"
  | "Encerrados";
type SortKey = "nome" | "plano" | "health_score" | "ctr" | "cpm" | "frequency" | "spend";

interface RelatorioRow {
  id: string;
  health_score: number | null;
  dados_json: DadosRelatorio | null;
  periodo_inicio: string;
  periodo_fim: string;
  gerado_em: string;
}

interface PrestadorRow {
  // chave única = id_cliente do mm_clientes (ex: MM001)
  id_cliente: string;
  nome: string; // nome_empresa (mm_clientes)
  plano: string | null;
  fase_projeto: string | null;
  status_cliente: string; // Ativo / Pausado / Encerrado
  // campos do prestador (nullable — nem todo mm_cliente tem prestador)
  id: string | null; // prestador uuid
  categoria: string | null;
  meta_ad_account_id: string | null;
  meta_sync_status: string | null;
  meta_ultima_sync: string | null;
  relatorio: RelatorioRow | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

const PLANO_COLORS: Record<string, string> = {
  essencial: "bg-pink-900 text-pink-300",
  growth: "bg-violet-900 text-violet-300",
  enterprise: "bg-amber-900 text-amber-300",
  premium: "bg-purple-900 text-purple-300",
  trial: "bg-gray-700 text-gray-300",
};

function planoBadgeClass(plano: string | null) {
  return PLANO_COLORS[plano?.toLowerCase() ?? ""] ?? "bg-gray-700 text-gray-200";
}

function planoLabel(plano: string | null) {
  if (!plano) return "—";
  const map: Record<string, string> = {
    essencial: "Essencial",
    growth: "Growth",
    enterprise: "Enterprise",
    premium: "Premium",
    trial: "Trial",
  };
  return map[plano.toLowerCase()] ?? plano;
}

function statusMeta(score: number | null): StatusMeta {
  if (score === null) return "Sem dados";
  if (score >= 70) return "Saudável";
  if (score >= 40) return "Em atenção";
  return "Em risco";
}

function scoreColor(score: number | null): string {
  if (score === null) return "#6b7280";
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  valueColor = "text-white",
}: {
  title: string;
  value: string;
  subtitle: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-[#242424] border border-[#333] rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <p className={`text-3xl font-bold mb-1 ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}

function StatusBadge({ score }: { score: number | null }) {
  const s = statusMeta(score);
  const styles: Record<StatusMeta, string> = {
    "Em risco": "bg-red-900 text-red-300",
    "Em atenção": "bg-yellow-900 text-yellow-300",
    Saudável: "bg-green-900 text-green-300",
    "Sem dados": "bg-gray-700 text-gray-400",
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[s]}`}>{s}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`ml-1 ${active ? "text-gray-200" : "text-gray-600"}`}>
      {active ? (dir === "asc" ? "↑" : "↓") : "⇅"}
    </span>
  );
}

// ─── Health gauge inline (smaller) ────────────────────────────────────────────

function MiniGauge({ score }: { score: number | null }) {
  const color = scoreColor(score);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = score ?? 0;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#333" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>
          {score !== null ? score : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── KPI inline row ───────────────────────────────────────────────────────────

function KpiGrid({ kpis, conta }: { kpis: KPIsCampanha; conta?: ContaMeta | null }) {
  const items = [
    { label: "Impressões", value: fmt(kpis.impressions) },
    { label: "Alcance", value: fmt(kpis.reach) },
    { label: "CTR Link", value: fmtPct(kpis.link_ctr) },
    { label: "CPC", value: kpis.cpc > 0 ? fmtBRL(kpis.cpc) : "—" },
    { label: "CPM", value: fmtBRL(kpis.cpm) },
    { label: "Frequência", value: fmt(kpis.frequency, 1) },
    { label: "Gasto", value: fmtBRL(kpis.spend) },
    { label: "Mensagens", value: fmt(kpis.results) },
    { label: "Hook Rate", value: kpis.hook_rate > 0 ? fmtPct(kpis.hook_rate) : "—" },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-5 gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-[#2a2a2a] rounded-lg px-3 py-2.5 border border-[#333]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-sm font-bold text-white">{value}</p>
        </div>
      ))}
      {conta?.metodo != null || conta?.saldo != null ? (
        <div className="bg-[#1a2540] rounded-lg px-3 py-2.5 border border-blue-800">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Saldo</p>
          {conta?.metodo === "cartao" ? (
            <p className="text-sm font-bold text-blue-300">Cartão</p>
          ) : (
            <p className="text-sm font-bold text-blue-300">
              {conta?.saldo != null ? fmtBRL(conta.saldo) : "—"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Mini campaigns table ──────────────────────────────────────────────────────

function MiniCampanhasTable({ campanhas }: { campanhas: CampanhaInsight[] }) {
  if (campanhas.length === 0)
    return <p className="text-xs text-gray-500 py-2">Nenhuma campanha no período.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-[#333]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#2a2a2a] text-gray-500 uppercase tracking-wider">
            <th className="px-3 py-2 text-left">Campanha</th>
            <th className="px-3 py-2 text-right">Impressões</th>
            <th className="px-3 py-2 text-right">CTR Link</th>
            <th className="px-3 py-2 text-right">CPM</th>
            <th className="px-3 py-2 text-right">Gasto</th>
            <th className="px-3 py-2 text-right">Mensagens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#333]">
          {campanhas.map((c) => (
            <tr key={c.campaign_id} className="hover:bg-[#2c2c2c] transition">
              <td
                className="px-3 py-2 text-gray-300 max-w-[200px] truncate"
                title={c.campaign_name}
              >
                {c.campaign_name}
              </td>
              <td className="px-3 py-2 text-right text-gray-400">{fmt(c.impressions)}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={
                    c.link_ctr >= 1
                      ? "text-green-400"
                      : c.link_ctr >= 0.5
                        ? "text-yellow-400"
                        : "text-red-400"
                  }
                >
                  {fmtPct(c.link_ctr)}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-gray-400">{fmtBRL(c.cpm)}</td>
              <td className="px-3 py-2 text-right text-white font-medium">{fmtBRL(c.spend)}</td>
              <td className="px-3 py-2 text-right">
                <span className="bg-brand-900 text-brand-300 text-xs px-1.5 py-0.5 rounded-full">
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

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({
  prestador,
  onSincronizar,
  sincronizando,
}: {
  prestador: PrestadorRow;
  onSincronizar: (id: string) => void;
  sincronizando: boolean;
}) {
  const rel = prestador.relatorio;
  const kpis = rel?.dados_json?.kpis ?? null;
  const camps = rel?.dados_json?.campanhas ?? [];
  const conta = rel?.dados_json?.conta ?? null;

  if (!prestador.id) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-gray-500">Cliente não cadastrado no sistema de roteiros.</p>
        <Link
          href="/novo"
          className="text-xs px-3 py-1.5 rounded-lg bg-[#333] text-gray-300 hover:bg-[#444] transition"
        >
          + Cadastrar prestador
        </Link>
      </div>
    );
  }

  if (!prestador.meta_ad_account_id) {
    return (
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">Conta Meta Ads não configurada para este cliente.</p>
        <Link
          href={`/prestador/${prestador.id}/configurar`}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-900 text-blue-300 hover:bg-blue-800 transition"
        >
          Configurar conta
        </Link>
      </div>
    );
  }

  if (!rel || !kpis) {
    return (
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">Nenhum relatório gerado ainda.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSincronizar(prestador.id!)}
          disabled={sincronizando}
          className="text-xs bg-[#333] text-gray-300 hover:bg-[#444] hover:text-gray-300 flex items-center gap-1.5"
        >
          {sincronizando ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              Buscar dados
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: gauge + período + botões */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <MiniGauge score={rel.health_score} />
          <div>
            <p className="text-sm font-semibold text-white">
              Health Score: {rel.health_score ?? "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Período: {fmtDate(rel.periodo_inicio)} → {fmtDate(rel.periodo_fim)}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              Última sync: {rel.gerado_em ? new Date(rel.gerado_em).toLocaleString("pt-BR") : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSincronizar(prestador.id!)}
            disabled={sincronizando}
            title="Sincroniza com a Meta usando o período padrão (30 dias). Para escolher o período, use 'Ver relatório completo'"
            className="text-xs bg-[#333] text-gray-300 hover:bg-[#444] hover:text-gray-300 flex items-center gap-1.5"
          >
            {sincronizando ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Atualizar
              </>
            )}
          </Button>
          <Link
            href={`/prestador/${prestador.id}?tab=campanha#campanha`}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-800 text-brand-300 hover:bg-brand-700 transition"
          >
            Ver relatório completo →
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <KpiGrid kpis={kpis} conta={conta} />

      {/* Campanhas */}
      {camps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Campanhas ({camps.length})
          </p>
          <MiniCampanhasTable campanhas={camps} />
        </div>
      )}
    </div>
  );
}

// ─── Atualizar todos button ────────────────────────────────────────────────────

function AtualizarTodosBtn({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await fetch("/api/meta/sincronizar-todos", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        sincronizados?: number;
        erros?: number;
        error?: string;
      };
      if (data.ok) {
        setResultado(
          `✓ ${data.sincronizados} atualizados${data.erros ? ` · ${data.erros} erro(s)` : ""}`
        );
        onDone();
      } else {
        setResultado(`✕ ${data.error ?? "Erro"}`);
      }
    } catch {
      setResultado("✕ Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:border-[#666] hover:text-white hover:bg-[#2a2a2a]"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sincronizando...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Atualizar todos
          </>
        )}
      </Button>
      {resultado && (
        <p className={`text-xs ${resultado.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
          {resultado}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTROS: FiltroStatus[] = [
  "Todos",
  "Em risco",
  "Em atenção",
  "Saudáveis",
  "Sem dados",
  "Pausados",
  "Encerrados",
];

const TABLE_COLS: { key: SortKey | null; label: string }[] = [
  { key: "nome", label: "Cliente" },
  { key: "plano", label: "Plano" },
  { key: "health_score", label: "Health Score" },
  { key: "ctr", label: "CTR Link" },
  { key: "frequency", label: "Frequência" },
  { key: "cpm", label: "CPM" },
  { key: "spend", label: "Gasto Total" },
  { key: null, label: "Status" },
  { key: null, label: "" },
];

function buildDashboardRows(raw: import("@/lib/queries").DashboardRaw): PrestadorRow[] {
  const mmIdMap = new Map<string, import("@/lib/queries").DashboardPrestadorRaw>();
  const nomeMap = new Map<string, import("@/lib/queries").DashboardPrestadorRaw>();
  for (const p of raw.prestadores) {
    const ents = (p.entrevistas ?? []).sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    );
    const mmId = ents[0]?.dados_json?.mm_id;
    if (mmId) mmIdMap.set(mmId.toUpperCase().trim(), p);
    const nomeKey = p.nome_artistico.toLowerCase().trim();
    if (!nomeMap.has(nomeKey)) nomeMap.set(nomeKey, p);
  }

  const seenNomes = new Map<string, import("@/lib/queries").DashboardClienteRaw>();
  for (const c of raw.clientes) {
    const key = c.nome_empresa.toLowerCase().trim();
    const existing = seenNomes.get(key);
    if (!existing) {
      seenNomes.set(key, c);
    } else {
      const existNum = parseInt(existing.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      const newNum = parseInt(c.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      if (newNum < existNum) seenNomes.set(key, c);
    }
  }

  return Array.from(seenNomes.values()).map((c) => {
    const prest =
      mmIdMap.get(c.id_cliente.toUpperCase().trim()) ??
      nomeMap.get(c.nome_empresa.toLowerCase().trim()) ??
      null;
    const relatorios = (prest?.relatorios_campanha ?? []) as RelatorioRow[];
    const ultimoRel =
      relatorios.sort(
        (a, b) => new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
      )[0] ?? null;
    const ents = (prest?.entrevistas ?? []).sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    );
    return {
      id_cliente: c.id_cliente,
      nome: c.nome_empresa,
      plano: c.plano ?? ents[0]?.dados_json?.plano ?? null,
      fase_projeto: c.fase_projeto ?? ents[0]?.dados_json?.fase_projeto ?? null,
      status_cliente: c.status ?? "Ativo",
      id: prest?.id ?? null,
      categoria: prest?.categoria ?? null,
      meta_ad_account_id: prest?.meta_ad_account_id ?? null,
      meta_sync_status: prest?.meta_sync_status ?? null,
      meta_ultima_sync: prest?.meta_ultima_sync ?? null,
      relatorio: ultimoRel,
    };
  });
}

export default function DashboardBIPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const { data: rawData, isLoading: dataLoading } = useDashboardRaw(!!user);
  const invalidateDashboard = useInvalidateDashboard();

  const [prestadores, setPrestadores] = useState<PrestadorRow[]>([]);
  const loading = userLoading || dataLoading;
  const [filtro, setFiltro] = useState<FiltroStatus>("Todos");
  const [sortKey, setSortKey] = useState<SortKey | null>("health_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sincronizandoId, setSincronizandoId] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const TABLE_LIMIT = 8;

  useEffect(() => {
    if (rawData) setPrestadores(buildDashboardRows(rawData));
  }, [rawData]);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [user, userLoading, router]);

  // ── Sincronizar individual (recebe prestador uuid, não id_cliente) ──
  async function handleSincronizar(prestadorId: string) {
    if (!prestadorId) return;
    setSincronizandoId(prestadorId);
    setToast(null);
    try {
      const res = await fetch("/api/meta/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestador_id: prestadorId }),
      });
      const data = (await res
        .json()
        .catch(() => ({}) as { ok?: boolean; error?: string; health_score?: number })) as {
        ok?: boolean;
        error?: string;
        health_score?: number;
      };
      if (!res.ok || !data.ok) {
        const msg = data.error ?? `Erro HTTP ${res.status}`;
        setToast({ type: "error", msg: `Falha na sincronização: ${msg}` });
      } else {
        setToast({
          type: "success",
          msg: `Dados atualizados · Health Score: ${data.health_score ?? "—"}`,
        });
        await invalidateDashboard();
      }
    } catch (e) {
      setToast({
        type: "error",
        msg: e instanceof Error ? e.message : "Erro de rede ao sincronizar",
      });
    } finally {
      setSincronizandoId(null);
    }
  }

  // ── Métricas agregadas (apenas clientes Ativos) ──
  const metrics = useMemo(() => {
    const ativos = prestadores.filter((p) => !/paus|encerr/i.test(p.status_cliente));
    const comDados = ativos.filter((p) => p.relatorio != null && p.relatorio.health_score != null);
    const semDados = ativos.filter((p) => p.relatorio == null || p.relatorio.health_score == null);
    const emRisco = comDados.filter((p) => (p.relatorio?.health_score ?? 0) < 40);
    const emAtencao = comDados.filter((p) => {
      const s = p.relatorio?.health_score ?? 0;
      return s >= 40 && s < 70;
    });
    const saudaveis = comDados.filter((p) => (p.relatorio?.health_score ?? 0) >= 70);
    const avgScore =
      comDados.length > 0
        ? Math.round(
            comDados.reduce((s, p) => s + (p.relatorio?.health_score ?? 0), 0) / comDados.length
          )
        : 0;
    const configurados = ativos.filter((p) => p.meta_ad_account_id).length;
    const pausados = prestadores.filter((p) => /paus/i.test(p.status_cliente)).length;
    const encerrados = prestadores.filter((p) => /encerr/i.test(p.status_cliente)).length;
    return {
      avgScore,
      emRisco: emRisco.length,
      emAtencao: emAtencao.length,
      saudaveis: saudaveis.length,
      semDados: semDados.length,
      configurados,
      total: ativos.length,
      pausados,
      encerrados,
    };
  }, [prestadores]);

  // ── Filtrado + ordenado ──
  const filtrados = useMemo(() => {
    let lista = prestadores.filter((p) => {
      const score = p.relatorio?.health_score ?? null;
      if (filtro === "Pausados") return /paus/i.test(p.status_cliente);
      if (filtro === "Encerrados") return /encerr/i.test(p.status_cliente);
      // Para todos os outros filtros, Pausados/Encerrados ficam ocultos
      if (/paus|encerr/i.test(p.status_cliente)) return false;
      if (filtro === "Em risco") return score !== null && score < 40;
      if (filtro === "Em atenção") return score !== null && score >= 40 && score < 70;
      if (filtro === "Saudáveis") return score !== null && score >= 70;
      if (filtro === "Sem dados") return score === null;
      return true;
    });

    if (sortKey) {
      lista = [...lista].sort((a, b) => {
        let av: number | string = 0,
          bv: number | string = 0;
        if (sortKey === "nome") {
          av = a.nome;
          bv = b.nome;
        } else if (sortKey === "plano") {
          av = a.plano ?? "";
          bv = b.plano ?? "";
        } else if (sortKey === "health_score") {
          av = a.relatorio?.health_score ?? -1;
          bv = b.relatorio?.health_score ?? -1;
        } else if (sortKey === "ctr") {
          av = a.relatorio?.dados_json?.kpis?.link_ctr ?? -1;
          bv = b.relatorio?.dados_json?.kpis?.link_ctr ?? -1;
        } else if (sortKey === "cpm") {
          av = a.relatorio?.dados_json?.kpis?.cpm ?? 999999;
          bv = b.relatorio?.dados_json?.kpis?.cpm ?? 999999;
        } else if (sortKey === "frequency") {
          av = a.relatorio?.dados_json?.kpis?.frequency ?? 999999;
          bv = b.relatorio?.dados_json?.kpis?.frequency ?? 999999;
        } else if (sortKey === "spend") {
          av = a.relatorio?.dados_json?.kpis?.spend ?? -1;
          bv = b.relatorio?.dados_json?.kpis?.spend ?? -1;
        }

        if (typeof av === "number" && typeof bv === "number")
          return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv), "pt-BR")
          : String(bv).localeCompare(String(av), "pt-BR");
      });
    }

    return lista;
  }, [prestadores, filtro, sortKey, sortDir]);

  // ── Chart (apenas Ativos) ──
  const chartData = useMemo(
    () =>
      prestadores
        .filter(
          (p) =>
            !/paus|encerr/i.test(p.status_cliente) &&
            p.relatorio != null &&
            p.relatorio.health_score != null
        )
        .sort((a, b) => (a.relatorio?.health_score ?? 0) - (b.relatorio?.health_score ?? 0))
        .map((p) => ({
          nome: p.nome.length > 18 ? p.nome.slice(0, 18) + "…" : p.nome,
          score: p.relatorio?.health_score ?? 0,
          color: scoreColor(p.relatorio?.health_score ?? null),
        })),
    [prestadores]
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) return <PageLoading />;

  const visiveis = tableExpanded ? filtrados : filtrados.slice(0, TABLE_LIMIT);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <Header user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* ── Título ── */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Dashboard BI — Meta Ads</h1>
            <p className="text-xs text-gray-500 mt-1">
              Health score calculado por CTR Link, Frequência, CPM e Hook Rate das campanhas
            </p>
          </div>
          <AtualizarTodosBtn onDone={invalidateDashboard} />
        </div>

        {/* ── Cards de métricas ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <MetricCard
            title="Health Score Médio"
            value={metrics.configurados > 0 ? `${metrics.avgScore}` : "—"}
            subtitle={`${metrics.configurados} contas configuradas`}
            valueColor={
              metrics.avgScore >= 70
                ? "text-green-400"
                : metrics.avgScore >= 40
                  ? "text-yellow-400"
                  : "text-red-400"
            }
          />
          <MetricCard
            title="Em Risco"
            value={String(metrics.emRisco)}
            subtitle="health score abaixo de 40"
            valueColor={metrics.emRisco > 0 ? "text-red-400" : "text-white"}
          />
          <MetricCard
            title="Em Atenção"
            value={String(metrics.emAtencao)}
            subtitle="score entre 40 e 69"
            valueColor={metrics.emAtencao > 0 ? "text-yellow-400" : "text-white"}
          />
          <MetricCard
            title="Sem Dados"
            value={String(metrics.semDados)}
            subtitle={`de ${metrics.total} ativos`}
            valueColor={metrics.semDados > 0 ? "text-gray-400" : "text-white"}
          />
        </div>

        {/* ── Pausados / Encerrados (info discreta) ── */}
        {(metrics.pausados > 0 || metrics.encerrados > 0) && (
          <div className="flex gap-3 mb-4">
            {metrics.pausados > 0 && (
              <button
                onClick={() => {
                  setFiltro("Pausados");
                  setTableExpanded(false);
                }}
                className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 transition"
              >
                {metrics.pausados} pausado{metrics.pausados > 1 ? "s" : ""}
              </button>
            )}
            {metrics.encerrados > 0 && (
              <button
                onClick={() => {
                  setFiltro("Encerrados");
                  setTableExpanded(false);
                }}
                className="text-xs px-3 py-1 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 transition"
              >
                {metrics.encerrados} encerrado{metrics.encerrados > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTROS.map((f) => (
            <Button
              key={f}
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiltro(f);
                setTableExpanded(false);
              }}
              className={`rounded-full text-sm font-medium border ${
                filtro === f
                  ? "border-white text-white bg-white/10 hover:bg-white/15 hover:text-white"
                  : "border-[#444] text-gray-400 hover:border-[#666] hover:text-gray-200 hover:bg-transparent"
              }`}
            >
              {f}
            </Button>
          ))}
        </div>

        {/* ── Tabela ── */}
        <div className="rounded-xl border border-[#333] overflow-hidden mb-8">
          <div className="bg-[#2a2a2a] border-b border-[#333] px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Clique no cabeçalho para ordenar · Clique na linha para ver o relatório
            </p>
            <p className="text-xs text-gray-600">{filtrados.length} clientes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#2a2a2a]">
                <tr>
                  {TABLE_COLS.map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={() => key && handleSort(key)}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${key ? "cursor-pointer hover:text-white select-none" : ""}`}
                    >
                      {label}
                      {key && <SortIcon active={sortKey === key} dir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      Nenhum cliente neste filtro
                    </td>
                  </tr>
                ) : (
                  visiveis.map((p, i) => {
                    const rel = p.relatorio;
                    const kpis = rel?.dados_json?.kpis ?? null;
                    const score = rel?.health_score ?? null;

                    return (
                      <React.Fragment key={p.id_cliente}>
                        <tr
                          onClick={() =>
                            setExpandedId(expandedId === p.id_cliente ? null : p.id_cliente)
                          }
                          className={`cursor-pointer border-t border-[#2a2a2a] transition-colors ${
                            i % 2 === 0 ? "bg-[#1e1e1e]" : "bg-[#222]"
                          } hover:bg-[#2c2c2c]`}
                        >
                          {/* Cliente */}
                          <td className="px-4 py-3">
                            <p className="font-semibold text-white whitespace-nowrap">{p.nome}</p>
                            <p className="text-xs text-gray-500">
                              {p.id_cliente}
                              {p.categoria
                                ? ` · ${CATEGORIA_LABEL[p.categoria] ?? p.categoria}`
                                : ""}
                            </p>
                          </td>
                          {/* Plano */}
                          <td className="px-4 py-3">
                            {p.plano ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${planoBadgeClass(p.plano)}`}
                              >
                                {planoLabel(p.plano)}
                              </span>
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </td>
                          {/* Health Score */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-[#333] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${score ?? 0}%`,
                                    backgroundColor: scoreColor(score),
                                  }}
                                />
                              </div>
                              <span
                                className="text-sm font-bold w-8 text-right"
                                style={{ color: scoreColor(score) }}
                              >
                                {score ?? "—"}
                              </span>
                            </div>
                          </td>
                          {/* CTR Link */}
                          <td className="px-4 py-3 text-right">
                            {kpis ? (
                              <span
                                className={`text-sm font-medium ${kpis.link_ctr >= 1 ? "text-green-400" : kpis.link_ctr >= 0.5 ? "text-yellow-400" : "text-red-400"}`}
                              >
                                {fmtPct(kpis.link_ctr)}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          {/* Frequência */}
                          <td className="px-4 py-3 text-right">
                            {kpis ? (
                              <span
                                className={`text-sm font-medium ${kpis.frequency <= 1.5 ? "text-green-400" : kpis.frequency <= 3 ? "text-yellow-400" : "text-red-400"}`}
                              >
                                {fmt(kpis.frequency, 1)}x
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          {/* CPM */}
                          <td className="px-4 py-3 text-right text-gray-300">
                            {kpis ? fmtBRL(kpis.cpm) : <span className="text-gray-600">—</span>}
                          </td>
                          {/* Gasto */}
                          <td className="px-4 py-3 text-right text-white font-medium">
                            {kpis ? fmtBRL(kpis.spend) : <span className="text-gray-600">—</span>}
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3">
                            <StatusBadge score={score} />
                          </td>
                          {/* Expand icon */}
                          <td className="px-4 py-3 text-gray-500 text-center">
                            {expandedId === p.id_cliente ? "▲" : "▼"}
                          </td>
                        </tr>

                        {/* Expanded */}
                        {expandedId === p.id_cliente && (
                          <tr>
                            <td
                              colSpan={9}
                              className="px-6 py-5 bg-[#161620] border-t border-[#1a1a1a]"
                            >
                              <div className="flex items-center justify-between mb-4">
                                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                  Campanha Meta Ads · {p.nome}
                                </p>
                                {p.fase_projeto && (
                                  <span className="text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded-full">
                                    {p.fase_projeto}
                                  </span>
                                )}
                              </div>
                              <ExpandedRow
                                prestador={p}
                                onSincronizar={handleSincronizar}
                                sincronizando={sincronizandoId === p.id}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtrados.length > TABLE_LIMIT && (
            <Button
              variant="ghost"
              onClick={() => setTableExpanded(!tableExpanded)}
              className="w-full rounded-none py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2a] border-t border-[#333] gap-2"
            >
              {tableExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Minimizar
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Ver todos os {filtrados.length} clientes
                </>
              )}
            </Button>
          )}
        </div>

        {/* ── Gráfico de health scores ── */}
        {chartData.length > 0 && (
          <div className="bg-[#242424] border border-[#333] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#2a2a2a]">
              <div>
                <h2 className="text-base font-semibold text-white">Health Score por cliente</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {chartData.length} clientes com dados · CTR Link 40% + Frequência 20% + CPM 20% +
                  Hook Rate 20%
                </p>
              </div>
              <div className="flex gap-4">
                {[
                  { color: "bg-red-500", label: "< 40 (risco)" },
                  { color: "bg-yellow-500", label: "40–69 (atenção)" },
                  { color: "bg-green-500", label: "≥ 70 (saudável)" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-sm ${color} inline-block`} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4">
              <ResponsiveContainer width="100%" height={Math.max(chartData.length * 40 + 40, 120)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#333" }}
                    tickFormatter={(v) => `${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fill: "#d1d5db", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { score: number; color: string };
                      return (
                        <div className="bg-[#1a1a1a] border border-[#444] rounded-lg px-3 py-2 shadow-xl text-xs">
                          <p className="font-semibold text-white mb-1">{label}</p>
                          <p className="font-bold text-lg" style={{ color: d.color }}>
                            {d.score}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-950 border-green-700 text-green-300"
              : "bg-red-950 border-red-700 text-red-300"
          }`}
        >
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          <span>{toast.msg}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setToast(null)}
            className="ml-2 h-5 w-5 opacity-60 hover:opacity-100 hover:bg-transparent"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
