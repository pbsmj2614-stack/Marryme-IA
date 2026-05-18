import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Prestador, Roteiro } from "@/lib/types";
import Header from "@/components/Header";
import AtualizarTodosButton from "@/components/AtualizarTodosButton";
import SearchInput from "@/components/SearchInput";
import PainelDrillDown from "@/components/PainelDrillDown";
import PrestadoresGrid from "@/components/PrestadoresGrid";
import type { PrestadorCardData } from "@/components/PrestadoresGrid";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Button } from "@/components/ui/button";

const TABS = [
  { value: "todos", label: "Todos" },
  { value: "validados", label: "Validados" },
  { value: "aguardando", label: "Aguardando" },
  { value: "sem_roteiro", label: "Sem roteiro" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab = "todos", q = "" } = await searchParams;
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: prestadores }, { data: mmInativos }] = await Promise.all([
    supabase
      .from("prestadores")
      .select(
        "*, roteiros(id, aprovado, criado_em, analise_estrategica), entrevistas(dados_json, criado_em), relatorios_campanha(health_score, gerado_em)"
      )
      .order("nome_artistico", { ascending: true }),
    supabase.from("mm_clientes").select("nome_empresa").in("status", ["Pausado", "Encerrado"]),
  ]);

  // Nomes de clientes inativos na pipeline (para ocultar seus cards)
  const mmInativosNomes = new Set(
    (mmInativos ?? []).map((c) => (c.nome_empresa as string).toLowerCase().trim())
  );

  type PrestadorRow = Prestador & {
    roteiros: (Pick<Roteiro, "id" | "aprovado" | "criado_em"> & {
      analise_estrategica: { nivel_mercado?: string } | null;
    })[];
    entrevistas: {
      dados_json: { plano?: string; fase_projeto?: string; mm_id?: string } | null;
      criado_em: string;
    }[];
    relatorios_campanha: { health_score: number | null; gerado_em: string }[];
  };
  const FASES_INATIVAS = ["Pausado", "Churn"];

  const lista = (prestadores ?? []) as PrestadorRow[];

  function getFaseProjeto(p: PrestadorRow): string | null {
    const ultima = [...(p.entrevistas ?? [])].sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    )[0];
    return ultima?.dados_json?.fase_projeto ?? null;
  }

  function isAtivo(p: PrestadorRow) {
    // Exclui se a entrevista já marca como inativo
    if (FASES_INATIVAS.includes(getFaseProjeto(p) ?? "")) return false;
    // Exclui se mm_clientes.status é Pausado ou Encerrado (fonte de verdade da pipeline)
    if (mmInativosNomes.has(p.nome_artistico.toLowerCase().trim())) return false;
    return true;
  }

  function getStatus(p: PrestadorRow) {
    const total = p.roteiros?.length ?? 0;
    const aprovados = p.roteiros?.filter((r) => r.aprovado).length ?? 0;
    return { total, aprovados };
  }

  // Apenas ativos (exclui Pausado/Churn) — inativos só aparecem na Pipeline
  const listaAtiva = lista.filter(isAtivo);

  // Dados para o painel de drill-down (health score por prestador ativo)
  const drillDownData = listaAtiva.map((p) => {
    const ultimoRelatorio = [...(p.relatorios_campanha ?? [])].sort(
      (a, b) => new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
    )[0];
    return {
      id: p.id,
      nome: p.nome_artistico,
      categoria: p.categoria,
      healthScore: ultimoRelatorio?.health_score ?? null,
    };
  });

  const contagens = {
    todos: listaAtiva.length,
    validados: listaAtiva.filter((p) => getStatus(p).aprovados > 0).length,
    aguardando: listaAtiva.filter((p) => {
      const s = getStatus(p);
      return s.total > 0 && s.aprovados === 0;
    }).length,
    sem_roteiro: listaAtiva.filter((p) => getStatus(p).total === 0).length,
  };

  const filtrada = listaAtiva
    .filter((p) => {
      const { total, aprovados } = getStatus(p);
      if (tab === "validados") return aprovados > 0;
      if (tab === "aguardando") return total > 0 && aprovados === 0;
      if (tab === "sem_roteiro") return total === 0;
      return true;
    })
    .filter((p) => {
      if (!q.trim()) return true;
      return p.nome_artistico.toLowerCase().includes(q.toLowerCase());
    });

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-800">Prestadores</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Suspense>
              <SearchInput placeholder="Buscar prestador..." className="w-52" />
            </Suspense>
            <AtualizarTodosButton />
            <Button asChild>
              <Link href="/novo">+ Novo prestador</Link>
            </Button>
          </div>
        </div>

        {/* Painel de drill-down — health score por prestador */}
        <PainelDrillDown prestadores={drillDownData} />

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map(({ value, label }) => {
            const count = contagens[value as keyof typeof contagens];
            const ativo = tab === value || (!tab && value === "todos");
            return (
              <Link
                key={value}
                href={`/?tab=${value}`}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                  ativo
                    ? "border-brand-600 text-brand-700"
                    : `border-transparent text-gray-500 hover:text-gray-700 ${count === 0 ? "opacity-50" : ""}`
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    ativo
                      ? "bg-brand-100 text-brand-700 font-semibold"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        <PrestadoresGrid
          prestadores={filtrada.map((p): PrestadorCardData => {
            const { total, aprovados } = getStatus(p);
            const roteirosOrdenados = [...(p.roteiros ?? [])].sort(
              (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
            );
            const ultimoRoteiro = roteirosOrdenados[0];
            const ultimaEntrevista = [...(p.entrevistas ?? [])].sort(
              (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
            )[0];
            const ultimoRelatorio = [...(p.relatorios_campanha ?? [])].sort(
              (a, b) => new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
            )[0];
            return {
              prestadorId: p.id,
              nome: p.nome_artistico,
              categoria: p.categoria,
              cidadeBase: p.cidade_base,
              whatsapp: p.whatsapp,
              nivelMercado: ultimoRoteiro?.analise_estrategica?.nivel_mercado ?? null,
              plano: ultimaEntrevista?.dados_json?.plano ?? null,
              faseProjeto: ultimaEntrevista?.dados_json?.fase_projeto ?? null,
              mmId: ultimaEntrevista?.dados_json?.mm_id ?? null,
              total,
              aprovados,
              ultimoRoteiroId: ultimoRoteiro?.id,
              ultimoRoteiroAprovado: ultimoRoteiro?.aprovado,
              healthScore: ultimoRelatorio?.health_score ?? null,
            };
          })}
          searchQuery={q}
          tab={tab}
        />
      </main>
    </div>
  );
}
