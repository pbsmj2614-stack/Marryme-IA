import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prestador, Roteiro } from "@/lib/types";
import Header from "@/components/Header";
import { createSupabaseServer } from "@/lib/supabase-server";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

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
    .select("*, roteiros(id, aprovado, criado_em)")
    .order("criado_em", { ascending: false });

  type PrestadorRow = Prestador & { roteiros: Pick<Roteiro, "id" | "aprovado" | "criado_em">[] };
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
              const temRoteiro = total > 0;

              return (
                <Link
                  key={p.id}
                  href={`/prestador/${p.id}`}
                  className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-brand-300 transition group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition">
                        {p.nome_artistico}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                        {p.cidade_base ? ` · ${p.cidade_base}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      temRoteiro
                        ? aprovados > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {temRoteiro
                        ? aprovados > 0
                          ? `${aprovados} aprovado${aprovados > 1 ? "s" : ""}`
                          : "Aguardando"
                        : "Sem roteiro"}
                    </span>
                  </div>
                  <div className="mt-4 text-xs text-gray-400">
                    {total} roteiro{total !== 1 ? "s" : ""} gerado{total !== 1 ? "s" : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
