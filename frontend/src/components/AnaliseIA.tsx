"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Zap, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

interface ProximoPasso {
  prazo: "imediato" | "esta_semana" | "este_mes";
  acao: string;
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
  proximos_passos: ProximoPasso[];
  mensagem_para_cliente: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOADING_MSGS = [
  "Lendo os dados da campanha…",
  "Analisando KPIs com o modelo…",
  "Identificando pontos de melhoria…",
  "Gerando recomendações estratégicas…",
  "Montando a pauta de reunião…",
  "Finalizando análise…",
];

function avaliacaoCls(av: string) {
  if (av === "bom") return "bg-green-100 text-green-700";
  if (av === "atencao") return "bg-yellow-100 text-yellow-700";
  if (av === "critico") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-500";
}
function avaliacaoLabel(av: string) {
  if (av === "bom") return "Bom";
  if (av === "atencao") return "Atenção";
  if (av === "critico") return "Crítico";
  return "Sem dados";
}
function statusCampanhaCls(s: string) {
  if (s === "destaque") return "bg-green-100 text-green-700";
  if (s === "problema") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-500";
}
function statusCampanhaLabel(s: string) {
  if (s === "destaque") return "Destaque";
  if (s === "problema") return "Problema";
  return "OK";
}
function prioridadeCls(p: string) {
  if (p === "alta") return "bg-red-100 text-red-700";
  if (p === "media") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}
function prazoCls(p: string) {
  if (p === "imediato") return "bg-red-100 text-red-700";
  if (p === "esta_semana") return "bg-yellow-100 text-yellow-700";
  return "bg-blue-100 text-blue-700";
}
function prazoLabel(p: string) {
  if (p === "imediato") return "Imediato";
  if (p === "esta_semana") return "Esta semana";
  return "Este mês";
}

function NotaGeral({ nota }: { nota: number }) {
  const color = nota >= 7 ? "text-green-600" : nota >= 5 ? "text-yellow-600" : "text-red-600";
  const bg =
    nota >= 7
      ? "bg-green-50 border-green-200"
      : nota >= 5
        ? "bg-yellow-50 border-yellow-200"
        : "bg-red-50 border-red-200";
  const label =
    nota >= 7 ? "Boa performance" : nota >= 5 ? "Precisa melhorar" : "Performance crítica";
  return (
    <div className={`flex items-center gap-3 border rounded-xl px-5 py-3 ${bg}`}>
      <span className={`text-4xl font-bold ${color}`}>{nota}</span>
      <div>
        <p className="text-xs text-gray-400 leading-none">Nota geral</p>
        <p className={`text-sm font-semibold mt-0.5 ${color}`}>{label}</p>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "resumo", label: "Resumo" },
  { id: "kpis", label: "KPIs" },
  { id: "campanhas", label: "Campanhas" },
  { id: "diagnostico", label: "Diagnóstico" },
  { id: "recomendacoes", label: "Recomendações" },
  { id: "pauta", label: "Pauta" },
  { id: "proximos", label: "Próximos Passos" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  prestadorId: string;
  ultimaAnalise?: AnaliseData | null;
  ultimaAnaliseEm?: string | null;
}

export default function AnaliseIA({ prestadorId, ultimaAnalise, ultimaAnaliseEm }: Props) {
  const [gerando, setGerando] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0]);
  const [analise, setAnalise] = useState<AnaliseData | null>(ultimaAnalise ?? null);
  const [analiseEm, setAnaliseEm] = useState<string | null>(ultimaAnaliseEm ?? null);
  const [erroGeração, setErroGeração] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("resumo");
  const [copiado, setCopiado] = useState(false);
  const [passosFe, setPassosFe] = useState<boolean[]>([]);

  const gerarAnalise = useCallback(async () => {
    setGerando(true);
    setAnalise(null);
    setErroGeração(null);
    let msgIdx = 0;
    setLoadingMsg(LOADING_MSGS[0]);

    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, LOADING_MSGS.length - 1);
      setLoadingMsg(LOADING_MSGS[msgIdx]);
    }, 3000);

    try {
      const res = await fetch("/api/analise/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestador_id: prestadorId }),
      });

      if (!res.ok || !res.body) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Erro ao gerar análise");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Acumula chunks — SSE pode chegar fragmentado em múltiplos pacotes TCP
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // guarda linha incompleta para o próximo chunk

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let msg: { text?: string; done?: boolean; analise?: AnaliseData; error?: string };
          try {
            msg = JSON.parse(line.slice(6)) as typeof msg;
          } catch {
            continue; // JSON malformado no meio de um chunk — aguarda o restante no buffer
          }
          if (msg.error) throw new Error(msg.error); // propaga para o catch externo
          if (msg.done && msg.analise) {
            setAnalise(msg.analise);
            setAnaliseEm(new Date().toLocaleString("pt-BR"));
            setPassosFe(new Array((msg.analise.proximos_passos ?? []).length).fill(false));
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setErroGeração(msg);
    } finally {
      clearInterval(interval);
      setGerando(false);
    }
  }, [prestadorId]);

  function copiarPauta() {
    if (!analise?.pauta_reuniao) return;
    const texto = analise.pauta_reuniao.join("\n");
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (gerando) {
    return (
      <div className="bg-white border border-brand-200 rounded-xl p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
        </div>
        <p className="text-sm font-medium text-brand-700 animate-pulse">{loadingMsg}</p>
        <p className="text-xs text-gray-400 mt-1">Isso pode levar 15–30 segundos…</p>
      </div>
    );
  }

  // ── Botão inicial ou regenerar ─────────────────────────────────────────────
  if (!analise) {
    return (
      <div className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <svg
            className="w-6 h-6 text-brand-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a10 10 0 110 20A10 10 0 0112 2z" strokeLinecap="round" />
            <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Análise Inteligente com IA</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
          Diagnóstico completo dos seus dados Meta Ads com recomendações estratégicas
          personalizadas.
        </p>
        <Button onClick={gerarAnalise} className="mx-auto flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Gerar Análise IA
        </Button>
        {erroGeração && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 max-w-sm mx-auto text-left">
            <p className="font-semibold mb-0.5">Erro ao gerar análise</p>
            <p className="break-words">{erroGeração}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Análise inválida (JSON não parseado corretamente) ─────────────────────
  if (analise && !analise.resumo_executivo && !analise.nota_geral) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-red-700 mb-1">Falha ao processar a análise</p>
        <p className="text-xs text-red-500 mb-4">
          O modelo retornou um formato inesperado. Tente gerar novamente.
        </p>
        <Button onClick={gerarAnalise}>Tentar novamente</Button>
      </div>
    );
  }

  // ── Análise exibida ────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-brand-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon
                points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Análise Inteligente · IA</p>
            {analiseEm && <p className="text-xs text-gray-400">Gerada em {analiseEm}</p>}
          </div>
          {analise.nota_geral != null && <NotaGeral nota={analise.nota_geral} />}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={gerarAnalise}
          className="flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-100 bg-gray-50 px-4 overflow-x-auto">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === id
                ? "border-brand-600 text-brand-700 bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {/* Resumo */}
        {tab === "resumo" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {analise.resumo_executivo}
            </p>
            {analise.mensagem_para_cliente && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
                <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">
                  Mensagem para o cliente
                </p>
                <p className="text-sm text-brand-800 leading-relaxed">
                  {analise.mensagem_para_cliente}
                </p>
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        {tab === "kpis" && (
          <div className="space-y-3">
            {!analise.analise_kpis && (
              <p className="text-sm text-gray-400">Dados de KPIs não disponíveis.</p>
            )}
            {analise.analise_kpis &&
              Object.entries(analise.analise_kpis).map(([key, kpi]) => {
                const k = kpi as KpiAnalise;
                const labels: Record<string, string> = {
                  ctr: "CTR do link",
                  cpm: "CPM",
                  frequencia: "Frequência",
                  custo_por_resultado: "Custo por mensagem",
                  hook_rate: "Hook Rate",
                };
                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 border border-gray-100 rounded-xl p-4"
                  >
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${avaliacaoCls(k.avaliacao)}`}
                    >
                      {avaliacaoLabel(k.avaliacao)}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-gray-700">{labels[key] ?? key}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{k.comentario}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Campanhas */}
        {tab === "campanhas" && (
          <div className="space-y-3">
            {(analise.analise_campanhas ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma análise por campanha disponível.</p>
            )}
            {(analise.analise_campanhas ?? []).map((c, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCampanhaCls(c.status)}`}
                  >
                    {statusCampanhaLabel(c.status)}
                  </span>
                  <p className="text-xs font-bold text-gray-800 truncate">{c.nome}</p>
                </div>
                <p className="text-xs text-gray-500">{c.comentario}</p>
                <p className="text-xs mt-1.5">
                  <span className="text-gray-400">Ação sugerida: </span>
                  <span className="font-semibold text-gray-700 capitalize">{c.acao_sugerida}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Diagnóstico */}
        {tab === "diagnostico" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!analise.diagnostico && (
              <p className="text-sm text-gray-400">Dados de diagnóstico não disponíveis.</p>
            )}
            {analise.diagnostico &&
              (
                [
                  {
                    key: "pontos_fortes",
                    label: "Pontos fortes",
                    cls: "border-green-200 bg-green-50",
                    dot: "bg-green-500",
                  },
                  {
                    key: "pontos_fracos",
                    label: "Pontos fracos",
                    cls: "border-red-200 bg-red-50",
                    dot: "bg-red-500",
                  },
                  {
                    key: "oportunidades",
                    label: "Oportunidades",
                    cls: "border-blue-200 bg-blue-50",
                    dot: "bg-blue-500",
                  },
                  {
                    key: "riscos",
                    label: "Riscos",
                    cls: "border-yellow-200 bg-yellow-50",
                    dot: "bg-yellow-500",
                  },
                ] as const
              ).map(({ key, label, cls, dot }) => (
                <div key={key} className={`border rounded-xl p-4 ${cls}`}>
                  <p className="text-xs font-bold text-gray-700 mb-2">{label}</p>
                  <ul className="space-y-1.5">
                    {((analise.diagnostico?.[key] as string[]) ?? []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${dot}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}

        {/* Recomendações */}
        {tab === "recomendacoes" && (
          <div className="space-y-3">
            {(analise.recomendacoes ?? []).map((r, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${prioridadeCls(r.prioridade)}`}
                  >
                    {r.prioridade}
                  </span>
                  <p className="text-sm font-bold text-gray-800">{r.titulo}</p>
                </div>
                <p className="text-xs text-gray-600">{r.descricao}</p>
                {r.impacto_esperado && (
                  <p className="text-xs text-brand-600 mt-1.5 font-medium">
                    Impacto: {r.impacto_esperado}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pauta */}
        {tab === "pauta" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                Pauta da reunião
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={copiarPauta}
                className="text-xs text-brand-600 border-brand-200 hover:bg-brand-50 flex items-center gap-1.5"
              >
                {copiado ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar pauta
                  </>
                )}
              </Button>
            </div>
            <ol className="space-y-2">
              {(analise.pauta_reuniao ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {item.replace(/^Ponto \d+:\s*/i, "")}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Próximos passos */}
        {tab === "proximos" && (
          <div className="space-y-2">
            {(analise.proximos_passos ?? []).map((p, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 border rounded-xl p-3.5 transition cursor-pointer ${
                  passosFe[i] ? "bg-gray-50 opacity-60" : "bg-white"
                }`}
                onClick={() => {
                  const next = [...passosFe];
                  next[i] = !next[i];
                  setPassosFe(next);
                }}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition ${
                    passosFe[i] ? "border-green-500 bg-green-500" : "border-gray-300"
                  }`}
                >
                  {passosFe[i] && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline
                        points="20 6 9 17 4 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${prazoCls(p.prazo)}`}
                  >
                    {prazoLabel(p.prazo)}
                  </span>
                  <span
                    className={`text-sm text-gray-700 ${passosFe[i] ? "line-through text-gray-400" : ""}`}
                  >
                    {p.acao}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
