import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Roteiro, Prestador, DadosEntrevista } from "@/lib/types";
import Header from "@/components/Header";
import RoteiroCard from "@/components/RoteiroCard";
import AprovarButton from "@/components/AprovarButton";
import GerarRoteiroButton from "@/components/GerarRoteiroButton";
import RefazerRoteiroButton from "@/components/RefazerRoteiroButton";
import ExcluirPrestadorButton from "@/components/ExcluirPrestadorButton";
import CopiarButton from "@/components/CopiarButton";
import { createSupabaseServer } from "@/lib/supabase-server";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

export default async function PrestadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

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

  const { data: entrevista } = await supabase
    .from("entrevistas")
    .select("id, dados_json")
    .eq("prestador_id", id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  const p = prestador as Prestador;
  const lista = (roteiros ?? []) as Roteiro[];
  const ultimo = lista[0] ?? null;
  const dados = entrevista?.dados_json as DadosEntrevista | undefined;

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header do prestador */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold text-gray-900">{p.nome_artistico}</h2>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                </span>
                {p.cidade_base && (
                  <span className="text-sm text-gray-400">{p.cidade_base}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                {p.whatsapp && <span>📱 {p.whatsapp}</span>}
                {p.instagram && <span>📸 {p.instagram}</span>}
                {p.email && <span>✉️ {p.email}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {ultimo && (
                <AprovarButton roteiroId={ultimo.id} aprovadoAtual={ultimo.aprovado} />
              )}
            </div>
          </div>
        </div>

        {/* Resumo do perfil da entrevista */}
        {dados && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Perfil da entrevista</h3>
              <Link
                href={`/prestador/${id}/editar`}
                className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline transition"
              >
                ✏️ Editar informações
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {dados.anos_experiencia && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Experiência</p>
                  <p className="text-gray-800 font-medium">{dados.anos_experiencia}</p>
                </div>
              )}
              {dados.numero_casamentos && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Casamentos</p>
                  <p className="text-gray-800 font-medium">{dados.numero_casamentos}</p>
                </div>
              )}
              {dados.preco_medio && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Ticket médio</p>
                  <p className="text-gray-800 font-medium">{dados.preco_medio}</p>
                </div>
              )}
              {dados.especialidade && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs text-gray-400 mb-0.5">Especialidade</p>
                  <p className="text-gray-700">{dados.especialidade}</p>
                </div>
              )}
              {dados.diferenciais && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs text-gray-400 mb-0.5">Diferenciais</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{dados.diferenciais}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <ExcluirPrestadorButton prestadorId={p.id} />
          {entrevista && ultimo && (
            <RefazerRoteiroButton entrevistaId={entrevista.id} />
          )}
        </div>

        {/* Sem roteiro */}
        {!ultimo && (
          <div className="text-center py-16 text-gray-400 space-y-4">
            <p>Nenhum roteiro gerado ainda.</p>
            {entrevista && <GerarRoteiroButton entrevistaId={entrevista.id} />}
          </div>
        )}

        {/* Roteiro mais recente */}
        {ultimo && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-800">Roteiro mais recente</h3>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                ultimo.aprovado ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}>
                {ultimo.aprovado ? "✓ Aprovado" : "Aguardando aprovação"}
              </span>
              {ultimo.exemplos_fewshot_usados > 0 && (
                <span className="text-xs text-gray-400">
                  {ultimo.exemplos_fewshot_usados} exemplo(s) de referência usados
                </span>
              )}
            </div>

            {/* Análise estratégica */}
            {ultimo.analise_estrategica && (
              <RoteiroCard titulo="Análise Estratégica" defaultOpen>
                <div className="grid sm:grid-cols-2 gap-5 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Posicionamento</p>
                    <p className="text-gray-800">{ultimo.analise_estrategica.posicionamento_final}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Público-alvo</p>
                    <p className="text-gray-800">{ultimo.analise_estrategica.publico_alvo}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nível de mercado</p>
                    <p className="text-gray-800">{ultimo.analise_estrategica.nivel_mercado}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tom de comunicação</p>
                    <p className="text-gray-800">{ultimo.analise_estrategica.tom_comunicacao}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Diferenciais-chave</p>
                    <ul className="space-y-1">
                      {ultimo.analise_estrategica.diferenciais_chave.map((d, i) => (
                        <li key={i} className="flex gap-2 text-gray-800">
                          <span className="text-brand-400 font-bold mt-0.5">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Gatilhos emocionais</p>
                    <ul className="space-y-1">
                      {ultimo.analise_estrategica.gatilhos_emocionais.map((g, i) => (
                        <li key={i} className="flex gap-2 text-gray-800">
                          <span className="text-pink-400 font-bold mt-0.5">•</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </RoteiroCard>
            )}

            {/* Roteiro de vídeo */}
            {ultimo.roteiro_sugerido?.roteiro && (
              <RoteiroCard titulo="Roteiro de Vídeo">
                <div className="space-y-5">
                  {ultimo.roteiro_sugerido.roteiro.map((cena) => (
                    <div key={cena.cena} className="border-l-4 border-brand-300 pl-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-brand-600 uppercase tracking-wide">
                          Cena {cena.cena} — {cena.titulo}
                        </p>
                        <CopiarButton texto={cena.texto} />
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-3">
                        {cena.texto}
                      </p>
                      {cena.legenda_sugerida && (
                        <div className="bg-gray-50 rounded-md px-3 py-2 mt-2">
                          <p className="text-xs font-medium text-gray-500 mb-0.5">Legenda sugerida</p>
                          <p className="text-xs text-gray-700 italic">{cena.legenda_sugerida}</p>
                        </div>
                      )}
                      {cena.orientacao_captacao && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-400 mb-0.5">Orientação de captação</p>
                          <p className="text-xs text-gray-500">{cena.orientacao_captacao}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </RoteiroCard>
            )}

            {/* Copy de anúncios */}
            {ultimo.copy_anuncios?.anuncios && (
              <RoteiroCard titulo="Copy de Anúncios — Meta Ads">
                <div className="space-y-5">
                  {ultimo.copy_anuncios.anuncios.map((ad) => {
                    const textoCompleto = `${ad.headline}\n\n${ad.copy}\n\nCTA: ${ad.cta}`;
                    return (
                      <div key={ad.tipo} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                            ad.tipo === "emocional"
                              ? "bg-pink-100 text-pink-700"
                              : ad.tipo === "direto"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {ad.tipo}
                          </span>
                          <CopiarButton texto={textoCompleto} />
                        </div>
                        <p className="text-sm font-bold text-gray-900 mb-2">{ad.headline}</p>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">{ad.copy}</p>
                        <div className="border-t border-gray-200 pt-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mr-2">CTA</span>
                          <span className="text-sm text-brand-700 font-medium">{ad.cta}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </RoteiroCard>
            )}

            {/* Direção criativa */}
            {ultimo.direcao_criativa?.direcao && (
              <RoteiroCard titulo="Direção Criativa">
                <div className="space-y-4">
                  {ultimo.direcao_criativa.direcao.map((d, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4">
                      <p className="font-semibold text-gray-900 mb-3">{d.tipo_cena}</p>
                      <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Ambientação</p>
                          <p className="text-gray-700">{d.ambientacao}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Enquadramento</p>
                          <p className="text-gray-700">{d.enquadramento}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Estilo de edição</p>
                          <p className="text-gray-700">{d.estilo_edicao}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Legenda sugerida</p>
                          <p className="text-gray-700 italic">{d.legenda_sugerida}</p>
                        </div>
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
