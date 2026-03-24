import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prestador, Roteiro } from "@/lib/types";
import Header from "@/components/Header";
import PrestadorCard from "@/components/PrestadorCard";
import { createSupabaseServer } from "@/lib/supabase-server";

const TABS = [
  { value: "todos", label: "Todos" },
  { value: "validados", label: "Validados" },
  { value: "aguardando", label: "Aguardando" },
  { value: "sem_roteiro", label: "Sem roteiro" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "todos" } = await searchParams;
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prestadores } = await supabase
    .from("prestadores")
    .select("*, roteiros(id, aprovado, criado_em, analise_estrategica)")
    .order("criado_em", { ascending: false });

  type PrestadorRow = Prestador & {
    roteiros: (Pick<Roteiro, "id" | "aprovado" | "criado_em"> & {
      analise_estrategica: { nivel_mercado?: string } | null;
    })[];
  };
  const lista = (prestadores ?? []) as PrestadorRow[];

  function getStatus(p: PrestadorRow) {
    const total = p.roteiros?.length ?? 0;
    const aprovados = p.roteiros?.filter((r) => r.aprovado).length ?? 0;
    return { total, aprovados };
  }

  const contagens = {
    todos: lista.length,
    validados: lista.filter((p) => getStatus(p).aprovados > 0).length,
    aguardando: lista.filter((p) => { const s = getStatus(p); return s.total > 0 && s.aprovados === 0; }).length,
    sem_roteiro: lista.filter((p) => getStatus(p).total === 0).length,
  };

  const filtrada = lista.filter((p) => {
    const { total, aprovados } = getStatus(p);
    if (tab === "validados") return aprovados > 0;
    if (tab === "aguardando") return total > 0 && aprovados === 0;
    if (tab === "sem_roteiro") return total === 0;
    return true;
  });

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Prestadores</h2>
          <Link
            href="/novo"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            + Novo prestador
          </Link>
        </div>

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
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  ativo ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {filtrada.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Nenhum prestador nesta categoria.</p>
            {tab === "todos" && (
              <Link href="/novo" className="mt-3 inline-block text-brand-600 hover:underline text-sm">
                Adicionar o primeiro
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtrada.map((p) => {
              const { total, aprovados } = getStatus(p);
              const roteirosOrdenados = [...(p.roteiros ?? [])].sort(
                (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
              );
              const ultimoRoteiro = roteirosOrdenados[0];

              const nivelMercado = ultimoRoteiro?.analise_estrategica?.nivel_mercado ?? null;

              return (
                <PrestadorCard
                  key={p.id}
                  prestadorId={p.id}
                  nome={p.nome_artistico}
                  categoria={p.categoria}
                  cidadeBase={p.cidade_base}
                  whatsapp={p.whatsapp}
                  nivelMercado={nivelMercado}
                  total={total}
                  aprovados={aprovados}
                  ultimoRoteiroId={ultimoRoteiro?.id}
                  ultimoRoteiroAprovado={ultimoRoteiro?.aprovado}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
