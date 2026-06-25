import { redirect, notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { PrestadorMeta, RelatorioCampanha, CampanhaInsight, ContaMeta } from "@/lib/types";
import PrintButton from "./PrintButton";
import { fmt, fmtBRL, fmtPct } from "@/lib/formatters";

// ─── Tipos locais ──────────────────────────────────────────────────────────────

interface KpiAnalise {
  valor: number | null;
  avaliacao: "bom" | "atencao" | "critico" | "sem_dados";
  comentario: string;
}
interface CampanhaAnalise {
  nome: string;
  status: "destaque" | "ok" | "problema";
  comentario: string;
  acao_sugerida: "manter" | "otimizar" | "pausar" | "escalar";
}
interface Recomendacao {
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  descricao: string;
  impacto_esperado: string;
}
interface AnaliseData {
  resumo_executivo: string;
  nota_geral: number;
  analise_kpis: {
    ctr: KpiAnalise;
    cpm: KpiAnalise;
    frequencia: KpiAnalise;
    custo_por_resultado: KpiAnalise;
    hook_rate: KpiAnalise;
  };
  analise_campanhas: CampanhaAnalise[];
  diagnostico: {
    pontos_fortes: string[];
    pontos_fracos: string[];
    oportunidades: string[];
    riscos: string[];
  };
  recomendacoes: Recomendacao[];
  pauta_reuniao: string[];
  proximos_passos: { prazo: "imediato" | "esta_semana" | "este_mes"; acao: string }[];
  mensagem_para_cliente: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreLabel(s: number) {
  if (s >= 70) return { label: "Saudável", color: "#16a34a" };
  if (s >= 40) return { label: "Atenção", color: "#ca8a04" };
  return { label: "Em Risco", color: "#dc2626" };
}

function avalColor(av: string) {
  if (av === "bom") return { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", label: "Bom" };
  if (av === "atencao")
    return { bg: "#fefce8", border: "#fef08a", text: "#a16207", label: "Atenção" };
  if (av === "critico")
    return { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", label: "Crítico" };
  return { bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280", label: "Sem dados" };
}

function priorColor(p: string) {
  if (p === "alta") return { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", label: "Alta" };
  if (p === "media") return { bg: "#fefce8", border: "#fef08a", text: "#a16207", label: "Média" };
  return { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", label: "Baixa" };
}

function prazoLabel(p: string) {
  if (p === "imediato") return "Imediato";
  if (p === "esta_semana") return "Esta semana";
  return "Este mês";
}

function statusCampLabel(s: string) {
  if (s === "destaque") return { label: "Destaque", color: "#15803d" };
  if (s === "problema") return { label: "Problema", color: "#b91c1c" };
  return { label: "OK", color: "#374151" };
}

function acaoLabel(a: string) {
  if (a === "escalar") return "↑ Escalar";
  if (a === "pausar") return "⏸ Pausar";
  if (a === "otimizar") return "⚙ Otimizar";
  return "✓ Manter";
}

// ─── Componentes de seção ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">
      {children}
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RelatorioPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relatorio_id?: string }>;
}) {
  const { id } = await params;
  const { relatorio_id: relatorioIdParam } = await searchParams;
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prestador } = await supabase.from("prestadores").select("*").eq("id", id).single();
  if (!prestador) notFound();

  let relQuery = supabase.from("relatorios_campanha").select("*").eq("prestador_id", id);
  if (relatorioIdParam) {
    relQuery = relQuery.eq("id", relatorioIdParam);
  } else {
    relQuery = relQuery.order("gerado_em", { ascending: false }).limit(1);
  }
  const { data: relatorioRow } = await relQuery.maybeSingle();

  const rel = (relatorioRow ?? null) as RelatorioCampanha | null;

  let analiseQuery = supabase
    .from("analises_ia")
    .select("dados_json, gerado_em")
    .eq("prestador_id", id);

  if (rel?.id) {
    analiseQuery = analiseQuery.eq("relatorio_id", rel.id).order("gerado_em", { ascending: false }).limit(1);
  } else {
    analiseQuery = analiseQuery.order("gerado_em", { ascending: false }).limit(1);
  }

  const { data: analiseRow } = await analiseQuery.maybeSingle();

  const p = prestador as PrestadorMeta;
  const analise = (analiseRow?.dados_json ?? null) as AnaliseData | null;
  const analiseEm = analiseRow?.gerado_em ?? null;

  const kpis = rel?.dados_json.kpis;
  const campanhas = rel?.dados_json.campanhas ?? [];
  const conta = rel?.dados_json.conta as ContaMeta | undefined;
  const score = rel?.health_score ?? null;
  const sc = score !== null ? scoreLabel(score) : null;
  const semAnaliseParaRelatorio = !!rel && !analise;

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const KPI_LABELS: [keyof AnaliseData["analise_kpis"], string][] = [
    ["ctr", "CTR do link"],
    ["cpm", "CPM"],
    ["frequencia", "Frequência"],
    ["custo_por_resultado", "Custo / mensagem"],
    ["hook_rate", "Hook Rate"],
  ];

  return (
    <>
      {/* Controles — ocultos na impressão */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <PrintButton />
        <a
          href={`/prestador/${id}?tab=campanha#campanha`}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
        >
          ← Voltar
        </a>
      </div>

      <style>{`
        @media print {
          @page { margin: 18mm 16mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Parte 1: Dados Meta Ads ──────────────────────────────────────── */}
      <div className="max-w-[800px] mx-auto px-8 py-10 font-sans text-gray-900">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">
              Relatório de Campanha
            </p>
            <h1 className="text-3xl font-bold text-gray-900">{p.nome_artistico}</h1>
            {p.cidade_base && <p className="text-sm text-gray-500 mt-1">{p.cidade_base}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Gerado em</p>
            <p className="text-sm font-semibold text-gray-700">{hoje}</p>
            {rel && (
              <>
                <p className="text-xs text-gray-400 mt-2">Período</p>
                <p className="text-xs text-gray-600">
                  {new Date(rel.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                  {" a "}
                  {new Date(rel.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
              </>
            )}
          </div>
        </div>

        {!rel && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Nenhum relatório gerado ainda.</p>
            <p className="text-sm mt-2">
              Acesse a aba Campanha e clique em &quot;Atualizar dados&quot;.
            </p>
          </div>
        )}

        {rel && kpis && (
          <>
            {/* Health Score */}
            {sc && score !== null && (
              <div
                className="rounded-2xl p-6 mb-6 flex items-center gap-6"
                style={{ backgroundColor: `${sc.color}15`, border: `2px solid ${sc.color}30` }}
              >
                <div
                  className="w-20 h-20 rounded-full flex flex-col items-center justify-center shrink-0"
                  style={{ border: `4px solid ${sc.color}` }}
                >
                  <span className="text-3xl font-bold" style={{ color: sc.color }}>
                    {score}
                  </span>
                  <span className="text-[9px] text-gray-400">/ 100</span>
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: sc.color }}>
                    {sc.label}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Health Score calculado com base em CTR, frequência e CPM das campanhas ativas no
                    período.
                  </p>
                </div>
              </div>
            )}

            {conta && (conta.metodo || conta.saldo != null) && (
              <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <span className="font-semibold text-gray-700">Conta Meta: </span>
                {conta.metodo === "cartao"
                  ? "Cartão de crédito"
                  : conta.metodo === "prepago"
                    ? "Pré-pago"
                    : conta.metodo ?? "—"}
                {conta.saldo != null && <> · Saldo/teto restante: {fmtBRL(conta.saldo)}</>}
              </div>
            )}

            {/* KPIs */}
            <SectionTitle>Métricas do período</SectionTitle>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: "Impressões", value: fmt(kpis.impressions) },
                { label: "Alcance", value: fmt(kpis.reach) },
                { label: "Cliques", value: fmt(kpis.clicks) },
                { label: "CTR", value: fmtPct(kpis.ctr) },
                { label: "CPM", value: fmtBRL(kpis.cpm) },
                { label: "Frequência", value: fmt(kpis.frequency, 2) },
                { label: "Gasto total", value: fmtBRL(kpis.spend) },
                { label: "Resultados", value: fmt(kpis.results) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Campanhas */}
            {campanhas.length > 0 && (
              <>
                <SectionTitle>Campanhas ({campanhas.length})</SectionTitle>
                <table className="w-full text-sm mb-6" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      {[
                        "Campanha",
                        "Impressões",
                        "Cliques",
                        "CTR",
                        "CPM",
                        "Gasto",
                        "Resultados",
                      ].map((h) => (
                        <th
                          key={h}
                          className={`py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide ${h === "Campanha" ? "text-left pr-3" : "text-right px-2"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(campanhas as CampanhaInsight[]).map((c, i) => (
                      <tr
                        key={c.campaign_id}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          backgroundColor: i % 2 ? "#fafafa" : "white",
                        }}
                      >
                        <td
                          className="py-2 pr-3 text-gray-800 font-medium"
                          style={{ maxWidth: 200 }}
                        >
                          <div>{c.campaign_name}</div>
                          {(c.effective_status ?? c.status) && (
                            <div className="text-[10px] text-gray-400 font-normal">
                              {c.effective_status ?? c.status}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmt(c.impressions)}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmt(c.clicks)}</td>
                        <td
                          className="py-2 px-2 text-right font-medium"
                          style={{
                            color: c.ctr >= 1 ? "#16a34a" : c.ctr >= 0.5 ? "#ca8a04" : "#dc2626",
                          }}
                        >
                          {fmtPct(c.ctr)}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(c.cpm)}</td>
                        <td className="py-2 px-2 text-right text-gray-700 font-medium">
                          {fmtBRL(c.spend)}
                        </td>
                        <td className="py-2 pl-2 text-right font-bold text-gray-900">
                          {fmt(c.results)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Interpretação do score */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Interpretação do Health Score
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-green-700 mb-1">70–100 · Saudável</p>
                  <p className="text-gray-600 text-xs">
                    CTR alto, frequência baixa e CPM eficiente. Campanha performando bem.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-yellow-700 mb-1">40–69 · Atenção</p>
                  <p className="text-gray-600 text-xs">
                    Pontos de melhoria identificados. Revisão de segmentação ou criativo
                    recomendada.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-red-700 mb-1">0–39 · Em Risco</p>
                  <p className="text-gray-600 text-xs">
                    CTR baixo e/ou frequência alta. Ação imediata necessária para evitar
                    desperdício.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Rodapé parte 1 */}
        <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <span>MarryMe · Dados via Meta Marketing API</span>
          <span>act_{p.meta_ad_account_id ?? "—"}</span>
        </div>
      </div>

      {semAnaliseParaRelatorio && (
        <div className="max-w-[800px] mx-auto px-8 pb-10 font-sans">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Nenhuma análise IA vinculada a este relatório. Gere a análise na aba Campanha ou use
            &quot;Relatório de reunião&quot; antes de imprimir.
          </div>
        </div>
      )}

      {/* ── Parte 2: Análise IA (renderiza só se existir) ────────────────── */}
      {analise && (
        <div
          className="max-w-[800px] mx-auto px-8 py-10 font-sans text-gray-900"
          style={{ breakBefore: "page" }}
        >
          {/* Cabeçalho da análise */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
            <div>
              <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">
                Análise Inteligente · MarryMe IA
              </p>
              <h1 className="text-3xl font-bold text-gray-900">{p.nome_artistico}</h1>
            </div>
            <div className="text-right">
              {analiseEm && (
                <>
                  <p className="text-xs text-gray-400">Análise gerada em</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {new Date(analiseEm).toLocaleDateString("pt-BR")}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Nota geral + resumo */}
          <div className="flex gap-5 mb-6 items-start">
            {/* Nota */}
            <div
              className="shrink-0 w-24 h-24 rounded-2xl flex flex-col items-center justify-center border-2"
              style={{
                borderColor:
                  analise.nota_geral >= 7
                    ? "#16a34a"
                    : analise.nota_geral >= 5
                      ? "#ca8a04"
                      : "#dc2626",
                backgroundColor:
                  analise.nota_geral >= 7
                    ? "#f0fdf4"
                    : analise.nota_geral >= 5
                      ? "#fefce8"
                      : "#fef2f2",
              }}
            >
              <span
                className="text-4xl font-bold"
                style={{
                  color:
                    analise.nota_geral >= 7
                      ? "#15803d"
                      : analise.nota_geral >= 5
                        ? "#a16207"
                        : "#b91c1c",
                }}
              >
                {analise.nota_geral}
              </span>
              <span className="text-[9px] text-gray-400">/ 10</span>
            </div>

            {/* Resumo executivo */}
            <div className="flex-1">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">
                Resumo Executivo
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{analise.resumo_executivo}</p>
            </div>
          </div>

          {/* Análise de KPIs */}
          <SectionTitle>Diagnóstico de KPIs</SectionTitle>
          <div className="grid grid-cols-1 gap-2 mb-6">
            {KPI_LABELS.map(([key, label]) => {
              const kpi = analise.analise_kpis[key];
              const c = avalColor(kpi.avaliacao);
              return (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-lg px-4 py-3 border"
                  style={{ backgroundColor: c.bg, borderColor: c.border }}
                >
                  <div className="shrink-0 w-28">
                    <p className="text-xs font-semibold text-gray-500">{label}</p>
                    <p className="text-[10px] font-bold uppercase mt-0.5" style={{ color: c.text }}>
                      {c.label}
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed flex-1">{kpi.comentario}</p>
                </div>
              );
            })}
          </div>

          {/* Análise por campanha */}
          {analise.analise_campanhas?.length > 0 && (
            <>
              <SectionTitle>Análise por campanha</SectionTitle>
              <div className="space-y-2 mb-6">
                {analise.analise_campanhas.map((c, i) => {
                  const sc2 = statusCampLabel(c.status);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                    >
                      <div className="shrink-0 w-36">
                        <p
                          className="text-xs font-bold truncate"
                          style={{ color: sc2.color }}
                          title={c.nome}
                        >
                          {c.nome}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-semibold" style={{ color: sc2.color }}>
                            {sc2.label}
                          </span>
                          <span className="text-[10px] text-gray-400">·</span>
                          <span className="text-[10px] text-gray-500">
                            {acaoLabel(c.acao_sugerida)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed flex-1">{c.comentario}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* SWOT */}
          {analise.diagnostico && (
            <>
              <SectionTitle>Diagnóstico estratégico</SectionTitle>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  {
                    label: "Pontos fortes",
                    items: analise.diagnostico.pontos_fortes,
                    color: "#15803d",
                    bg: "#f0fdf4",
                    border: "#bbf7d0",
                  },
                  {
                    label: "Pontos fracos",
                    items: analise.diagnostico.pontos_fracos,
                    color: "#b91c1c",
                    bg: "#fef2f2",
                    border: "#fecaca",
                  },
                  {
                    label: "Oportunidades",
                    items: analise.diagnostico.oportunidades,
                    color: "#0369a1",
                    bg: "#f0f9ff",
                    border: "#bae6fd",
                  },
                  {
                    label: "Riscos",
                    items: analise.diagnostico.riscos,
                    color: "#a16207",
                    bg: "#fefce8",
                    border: "#fef08a",
                  },
                ].map(({ label, items, color, bg, border }) => (
                  <div
                    key={label}
                    className="rounded-xl p-4 border"
                    style={{ backgroundColor: bg, borderColor: border }}
                  >
                    <p
                      className="text-[10px] font-bold uppercase tracking-wide mb-2"
                      style={{ color }}
                    >
                      {label}
                    </p>
                    <ul className="space-y-1">
                      {(items ?? []).map((item, i) => (
                        <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                          <span style={{ color }}>•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recomendações */}
          {analise.recomendacoes?.length > 0 && (
            <>
              <SectionTitle>Recomendações</SectionTitle>
              <div className="space-y-3 mb-6">
                {analise.recomendacoes.map((r, i) => {
                  const pc = priorColor(r.prioridade);
                  return (
                    <div
                      key={i}
                      className="rounded-xl border p-4"
                      style={{ borderColor: pc.border, backgroundColor: pc.bg }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: pc.border, color: pc.text }}
                        >
                          {pc.label}
                        </span>
                        <p className="text-sm font-semibold text-gray-800">{r.titulo}</p>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">{r.descricao}</p>
                      {r.impacto_esperado && (
                        <p className="text-[11px] text-gray-400 italic">
                          Impacto: {r.impacto_esperado}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Próximos passos + Pauta — lado a lado */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            {analise.proximos_passos?.length > 0 && (
              <div>
                <SectionTitle>Próximos passos</SectionTitle>
                <div className="space-y-2">
                  {analise.proximos_passos.map((p2, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="shrink-0 text-[10px] font-bold text-gray-400 mt-0.5 w-20 text-right">
                        {prazoLabel(p2.prazo)}
                      </span>
                      <p className="text-xs text-gray-700 leading-relaxed">{p2.acao}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analise.pauta_reuniao?.length > 0 && (
              <div>
                <SectionTitle>Pauta de reunião</SectionTitle>
                <ol className="space-y-1.5 list-none">
                  {analise.pauta_reuniao.map((item, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-gray-700 leading-relaxed">{item}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Mensagem para o cliente */}
          {analise.mensagem_para_cliente && (
            <div className="rounded-xl border-2 border-gray-900 bg-gray-50 px-6 py-5 mb-6">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">
                Mensagem para o cliente
              </p>
              <p className="text-sm text-gray-800 leading-relaxed italic">
                &ldquo;{analise.mensagem_para_cliente}&rdquo;
              </p>
            </div>
          )}

          {/* Rodapé parte 2 */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>MarryMe · Análise gerada via Claude IA</span>
            <span>{p.nome_artistico}</span>
          </div>
        </div>
      )}
    </>
  );
}
