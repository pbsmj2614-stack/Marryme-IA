import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";
import type { Prestador, Roteiro } from "@/lib/types";
import Header from "@/components/Header";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
}

export default async function DashboardPage() {
  const supabase = await getServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prestadores } = await supabase
    .from("prestadores")
    .select("*, roteiros(id, aprovado, criado_em)")
    .order("criado_em", { ascending: false });

  type PrestadorRow = Prestador & { roteiros: Pick<Roteiro, "id" | "aprovado" | "criado_em">[] };
  const lista = (prestadores ?? []) as PrestadorRow[];

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

        {lista.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Nenhum prestador cadastrado ainda.</p>
            <Link href="/novo" className="mt-3 inline-block text-brand-600 hover:underline text-sm">
              Adicionar o primeiro
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((p) => {
              const totalRoteiros = p.roteiros?.length ?? 0;
              const aprovados = p.roteiros?.filter((r) => r.aprovado).length ?? 0;
              const temRoteiro = totalRoteiros > 0;

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
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        temRoteiro
                          ? aprovados > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {temRoteiro
                        ? aprovados > 0
                          ? `${aprovados} aprovado${aprovados > 1 ? "s" : ""}`
                          : "Aguardando aprovação"
                        : "Sem roteiro"}
                    </span>
                  </div>

                  <div className="mt-4 text-xs text-gray-400">
                    {totalRoteiros} roteiro{totalRoteiros !== 1 ? "s" : ""} gerado{totalRoteiros !== 1 ? "s" : ""}
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
