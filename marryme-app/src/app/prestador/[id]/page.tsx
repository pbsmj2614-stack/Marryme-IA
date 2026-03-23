import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Roteiro, Prestador } from "@/lib/types";
import Header from "@/components/Header";
import RoteiroCard from "@/components/RoteiroCard";
import AprovarButton from "@/components/AprovarButton";

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

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

export default async function PrestadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prestador } = await supabase
    .from("prestadores")
    .select("*")
    .eq("id", id)
    .single();

  if (!prestador) notFound();

  const { data: roteiros } = await supabase
    .from("roteiros")
    .select("*")
    .eq("prestador_id", id)
    .order("criado_em", { ascending: false });

  const p = prestador as Prestador;
  const lista = (roteiros ?? []) as Roteiro[];
  const ultimo = lista[0] ?? null;

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header do prestador */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{p.nome_artistico}</h2>
              <p className="text-gray-500 text-sm mt-1">
                {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                {p.cidade_base ? ` · ${p.cidade_base}` : ""}
              </p>
              <div className="flex gap-4 mt-3 text-sm text-gray-600">
                {p.whatsapp && <span>📱 {p.whatsapp}</span>}
                {p.instagram && <span>📸 {p.instagram}</span>}
                {p.email && <span>✉️ {p.email}</span>}
              </div>
            </div>

            {ultimo && (
              <AprovarButton
                roteiroId={ultimo.id}
                aprovadoAtual={ultimo.aprovado}
              />
            )}
          </div>
        </div>

        {/* Sem roteiro */}
        {!ultimo && (
          <div className="text-center py-16 text-gray-400">
            <p>Nenhum roteiro gerado ainda.</p>
          </div>
        )}

        {/* Roteiro mais recente */}
        {ultimo && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Roteiro mais recente</h3>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                ultimo.aprovado
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}>
                {ultimo.aprovado ? "Aprovado" : "Aguardando aprovação"}
              </span>
              {ultimo.exemplos_fewshot_usados > 0 && (
                <span className="text-xs text-gray-400">
                  {ultimo.exemplos_fewshot_usados} exemplo(s) de referência usados
                </span>
              )}
            </div>

            {ultimo.analise_estrategica && (
              <RoteiroCard titulo="Análise Estratégica" defaultOpen>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Posicionamento</p>
                    <p>{ultimo.analise_estrategica.posicionamento_final}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Público-alvo</p>
                    <p>{ultimo.analise_estrategica.publico_alvo}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Nível de mercado</p>
                    <p>{ultimo.analise_estrategica.nivel_mercado}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Tom de comunicação</p>
                    <p>{ultimo.analise_estrategica.tom_comunicacao}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Diferenciais-chave</p>
                    <ul className="list-disc list-inside space-y-1">
                      {ultimo.analise_estrategica.diferenciais_chave.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Gatilhos emocionais</p>
                    <ul className="list-disc list-inside space-y-1">
                      {ultimo.analise_estrategica.gatilhos_emocionais.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </RoteiroCard>
            )}

            {ultimo.roteiro_sugerido?.roteiro && (
              <RoteiroCard titulo="Roteiro de Vídeo">
                <div className="space-y-4">
                  {ultimo.roteiro_sugerido.roteiro.map((cena) => (
                    <div key={cena.cena} className="border-l-4 border-brand-300 pl-4">
                      <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">
                        Cena {cena.cena} — {cena.titulo}
                      </p>
                      <p className="text-sm text-gray-800 mb-2">{cena.texto}</p>
                      {cena.legenda_sugerida && (
                        <p className="text-xs text-gray-500 italic">
                          Legenda: {cena.legenda_sugerida}
                        </p>
                      )}
                      {cena.orientacao_captacao && (
                        <p className="text-xs text-gray-400 mt-1">
                          Captação: {cena.orientacao_captacao}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </RoteiroCard>
            )}

            {ultimo.copy_anuncios?.anuncios && (
              <RoteiroCard titulo="Copy de Anúncios — Meta Ads">
                <div className="space-y-5">
                  {ultimo.copy_anuncios.anuncios.map((ad) => (
                    <div key={ad.tipo} className="bg-gray-50 rounded-lg p-4">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full mb-3 inline-block ${
                        ad.tipo === "emocional"
                          ? "bg-pink-100 text-pink-700"
                          : ad.tipo === "direto"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {ad.tipo}
                      </span>
                      <p className="text-sm font-semibold text-gray-800 mb-1">{ad.headline}</p>
                      <p className="text-sm text-gray-700 mb-2">{ad.copy}</p>
                      <p className="text-xs text-brand-600 font-medium">CTA: {ad.cta}</p>
                    </div>
                  ))}
                </div>
              </RoteiroCard>
            )}

            {ultimo.direcao_criativa?.direcao && (
              <RoteiroCard titulo="Direção Criativa">
                <div className="space-y-4">
                  {ultimo.direcao_criativa.direcao.map((d, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4 text-sm">
                      <p className="font-semibold text-gray-800 mb-2">{d.tipo_cena}</p>
                      <div className="grid sm:grid-cols-2 gap-2 text-gray-600">
                        <p><span className="font-medium">Ambientação:</span> {d.ambientacao}</p>
                        <p><span className="font-medium">Enquadramento:</span> {d.enquadramento}</p>
                        <p><span className="font-medium">Edição:</span> {d.estilo_edicao}</p>
                        <p><span className="font-medium">Legenda:</span> {d.legenda_sugerida}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </RoteiroCard>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
