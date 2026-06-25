import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type {
  Roteiro,
  DadosEntrevista,
  PrestadorMeta,
  RelatorioCampanha,
  ChatSessao,
} from "@/lib/types";
import Header from "@/components/Header";
import AprovarButton from "@/components/AprovarButton";
import ExcluirPrestadorButton from "@/components/ExcluirPrestadorButton";
import ExportarButton from "@/components/ExportarButton";
import CampanhaTab from "@/components/CampanhaTab";
import ChatInterface from "@/components/chat/ChatInterface";
import RoteirosFinalizados from "@/components/chat/RoteirosFinalizados";
import PrestadorSwitcher from "@/components/PrestadorSwitcher";
import { createSupabaseServer } from "@/lib/supabase-server";
import { formatarTelefone } from "@/lib/utils";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

export default async function PrestadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sessao?: string }>;
}) {
  const { id } = await params;
  const { tab = "roteiro", sessao } = await searchParams;
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: prestador },
    { data: roteiros },
    { data: entrevista },
    { data: relatorios },
    { data: analises },
    { data: sessoesFinalizadas },
    { data: todosPrestadores },
  ] = await Promise.all([
    supabase.from("prestadores").select("*").eq("id", id).single(),
    supabase
      .from("roteiros")
      .select("*")
      .eq("prestador_id", id)
      .order("criado_em", { ascending: false })
      .limit(20),
    supabase
      .from("entrevistas")
      .select("id, dados_json")
      .eq("prestador_id", id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("relatorios_campanha")
      .select("*")
      .eq("prestador_id", id)
      .order("gerado_em", { ascending: false })
      .limit(10),
    supabase
      .from("analises_ia")
      .select("dados_json, gerado_em")
      .eq("prestador_id", id)
      .order("gerado_em", { ascending: false })
      .limit(1),
    supabase
      .from("chat_sessoes")
      .select("id, titulo, tipo, status, roteiro_final, tokens_usados, criado_em, atualizado_em")
      .eq("prestador_id", id)
      .in("status", ["finalizada", "aprovada"])
      .order("atualizado_em", { ascending: false })
      .limit(20),
    supabase
      .from("prestadores")
      .select("id, nome_artistico, categoria")
      .order("nome_artistico", { ascending: true }),
  ]);

  if (!prestador) notFound();

  const p = prestador as PrestadorMeta;
  const lista = (roteiros ?? []) as Roteiro[];
  const listaPrestadores = (todosPrestadores ?? []) as {
    id: string;
    nome_artistico: string;
    categoria: string;
  }[];
  const ultimo = lista[0] ?? null;
  const sessoesFin = (sessoesFinalizadas ?? []) as ChatSessao[];
  const dados = entrevista?.dados_json as DadosEntrevista | undefined;
  const historicoRelatorios = (relatorios ?? []) as RelatorioCampanha[];
  const ultimoRelatorio = historicoRelatorios[0] ?? null;

  let ultimaAnalise = analises?.[0]?.dados_json ?? null;
  let ultimaAnaliseEm = analises?.[0]?.gerado_em
    ? new Date(analises[0].gerado_em).toLocaleString("pt-BR")
    : null;

  if (ultimoRelatorio?.id) {
    const { data: analiseRel } = await supabase
      .from("analises_ia")
      .select("dados_json, gerado_em")
      .eq("relatorio_id", ultimoRelatorio.id)
      .order("gerado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analiseRel) {
      ultimaAnalise = analiseRel.dados_json;
      ultimaAnaliseEm = new Date(analiseRel.gerado_em).toLocaleString("pt-BR");
    }
  }

  const isChatAtivo = tab !== "campanha" && tab !== "aprovacoes";

  const tabLinks = (
    <div className="flex gap-1 border-b border-gray-200">
      {(
        [
          { value: "roteiro", label: "Chat IA" },
          { value: "aprovacoes", label: "Aprovações" },
          { value: "campanha", label: "Campanha Meta Ads" },
        ] as const
      ).map(({ value, label }) => {
        const ativo = tab === value;
        return (
          <Link
            key={value}
            href={`/prestador/${id}?tab=${value}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
              ativo
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {value === "aprovacoes" &&
              sessoesFin.filter((s) => s.status === "finalizada").length > 0 && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                  {sessoesFin.filter((s) => s.status === "finalizada").length}
                </span>
              )}
            {value === "campanha" &&
              ultimoRelatorio?.health_score !== undefined &&
              ultimoRelatorio.health_score !== null && (
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    ultimoRelatorio.health_score >= 70
                      ? "bg-green-100 text-green-700"
                      : ultimoRelatorio.health_score >= 40
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-600"
                  }`}
                >
                  {ultimoRelatorio.health_score}
                </span>
              )}
          </Link>
        );
      })}
    </div>
  );

  if (isChatAtivo) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <Header user={user} />

        {/* Barra compacta + tabs — full-width, sem max-w */}
        <div className="bg-white border-b border-gray-200 shrink-0">
          <div className="px-5 pt-3 pb-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <PrestadorSwitcher atual={p} todos={listaPrestadores} />
              <span className="text-xs font-medium text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full shrink-0">
                {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
              </span>
              {p.cidade_base && (
                <span className="text-xs text-gray-400 hidden sm:inline">{p.cidade_base}</span>
              )}
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 text-xs font-semibold text-gray-600 hover:text-brand-700 hover:bg-brand-50 hover:border-brand-200"
            >
              <Link href={`/prestador/${id}/editar`}>Editar cadastro</Link>
            </Button>
          </div>
          <div className="px-5">{tabLinks}</div>
        </div>

        {/* ChatInterface ocupa todo o restante — sem max-w, sem padding externo */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatInterface prestadorId={id} roteirosAntigos={lista} sessaoInicial={sessao} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <div className="max-w-5xl mx-auto px-4 py-8 w-full">
        {/* Prestador header completo */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold text-gray-900">{p.nome_artistico}</h2>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                </span>
                {p.cidade_base && <span className="text-sm text-gray-400">{p.cidade_base}</span>}
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                {p.whatsapp && (
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 shrink-0 text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{formatarTelefone(p.whatsapp)}</span>
                  </div>
                )}
                {p.instagram && (
                  <div className="flex items-start gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 shrink-0 text-gray-400 mt-0.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="2"
                        y="2"
                        width="20"
                        height="20"
                        rx="5"
                        ry="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                    </svg>
                    <span className="break-all whitespace-pre-wrap">{p.instagram}</span>
                  </div>
                )}
                {p.email && (
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 shrink-0 text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points="22,6 12,13 2,6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="break-all">{p.email}</span>
                  </div>
                )}
              </div>
            </div>
            {tab === "campanha" && (
              <div className="flex items-center gap-2 flex-wrap">
                {ultimo && (
                  <ExportarButton
                    tipo="completo"
                    variant="primary"
                    prestador={p}
                    roteiro={ultimo}
                  />
                )}
                {ultimo && <AprovarButton roteiroId={ultimo.id} aprovadoAtual={ultimo.aprovado} />}
              </div>
            )}
          </div>
        </div>

        {/* Entrevista profile — só na aba Campanha */}
        {tab === "campanha" && dados && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Perfil da entrevista
              </h3>
              <Link
                href={`/prestador/${id}/editar`}
                className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline transition"
              >
                Editar informações
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {dados.anos_experiencia && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Experiência</p>
                  <p className="text-sm font-bold text-gray-800">{dados.anos_experiencia}</p>
                </div>
              )}
              {dados.numero_casamentos && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Casamentos</p>
                  <p className="text-sm font-bold text-gray-800">{dados.numero_casamentos}</p>
                </div>
              )}
              {dados.preco_medio && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Ticket médio</p>
                  <p className="text-sm font-bold text-gray-800">{dados.preco_medio}</p>
                </div>
              )}
            </div>
            {(dados.especialidade || dados.formacao) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {dados.especialidade && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-brand-100">
                    <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1.5">
                      Nicho
                    </p>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
                      {dados.especialidade}
                    </p>
                  </div>
                )}
                {dados.formacao && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Certificações
                    </p>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
                      {dados.formacao}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <ExcluirPrestadorButton prestadorId={p.id} />
          {!entrevista && (
            <Button asChild>
              <Link href={`/prestador/${id}/editar`}>Cadastrar entrevista</Link>
            </Button>
          )}
        </div>

        {tabLinks}
      </div>

      {/* Aprovações tab */}
      {tab === "aprovacoes" && (
        <main className="max-w-5xl mx-auto px-4 py-6 w-full">
          <RoteirosFinalizados sessoes={sessoesFin} prestadorId={id} />
        </main>
      )}

      {/* Campanha tab */}
      {tab === "campanha" && (
        <main id="campanha" className="max-w-5xl mx-auto px-4 pb-8 w-full">
          <CampanhaTab
            key={p.id}
            prestadorId={p.id}
            prestadorNome={p.nome_artistico}
            metaAccountId={p.meta_ad_account_id}
            metaSyncStatus={p.meta_sync_status}
            metaUltimaSync={p.meta_ultima_sync}
            ultimoRelatorio={ultimoRelatorio}
            historico={historicoRelatorios}
            ultimaAnalise={ultimaAnalise}
            ultimaAnaliseEm={ultimaAnaliseEm}
          />
        </main>
      )}
    </div>
  );
}
