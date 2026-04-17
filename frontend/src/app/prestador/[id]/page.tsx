import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Roteiro, Prestador, DadosEntrevista, CenaRoteiro, Anuncio, DirecaoCena, PrestadorMeta, RelatorioCampanha } from "@/lib/types";
import Header from "@/components/Header";
import RoteiroCard from "@/components/RoteiroCard";
import AprovarButton from "@/components/AprovarButton";
import GerarRoteiroButton from "@/components/GerarRoteiroButton";
import RefazerRoteiroButton from "@/components/RefazerRoteiroButton";
import ExcluirPrestadorButton from "@/components/ExcluirPrestadorButton";
import CopiarButton from "@/components/CopiarButton";
import GerarSecaoButton from "@/components/GerarSecaoButton";
import ExportarButton from "@/components/ExportarButton";
import CampanhaTab from "@/components/CampanhaTab";
import { createSupabaseServer } from "@/lib/supabase-server";
import { formatarTelefone } from "@/lib/utils";

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

/** Renderiza texto com quebras de parágrafo por \n\n */
function TextoFormatado({ texto, className = "" }: { texto: string; className?: string }) {
  const paragrafos = texto.split(/\n\n+/).filter(Boolean);
  if (paragrafos.length <= 1) {
    return (
      <p className={`font-lora leading-[1.7] text-gray-800 whitespace-pre-wrap ${className}`}>
        {texto}
      </p>
    );
  }
  return (
    <div className={`font-lora leading-[1.7] text-gray-800 space-y-3 ${className}`}>
      {paragrafos.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">{p}</p>
      ))}
    </div>
  );
}

export default async function PrestadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id }       = await params;
  const { tab = "roteiro" } = await searchParams;
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Todas as queries em paralelo — ~30% mais rápido
  const [
    { data: prestador },
    { data: roteiros },
    { data: entrevista },
    { data: relatorios },
    { data: analises },
  ] = await Promise.all([
    supabase.from("prestadores").select("*").eq("id", id).single(),
    supabase.from("roteiros").select("*").eq("prestador_id", id).order("criado_em", { ascending: false }).limit(20),
    supabase.from("entrevistas").select("id, dados_json").eq("prestador_id", id).order("criado_em", { ascending: false }).limit(1).single(),
    supabase.from("relatorios_campanha").select("*").eq("prestador_id", id).order("gerado_em", { ascending: false }).limit(10),
    supabase.from("analises_ia").select("dados_json, gerado_em").eq("prestador_id", id).order("gerado_em", { ascending: false }).limit(1),
  ]);

  if (!prestador) notFound();

  const p = prestador as PrestadorMeta;
  const lista = (roteiros ?? []) as Roteiro[];
  const ultimo = lista[0] ?? null;
  const dados = entrevista?.dados_json as DadosEntrevista | undefined;
  const historicoRelatorios = (relatorios ?? []) as RelatorioCampanha[];
  const ultimoRelatorio = historicoRelatorios[0] ?? null;
  const ultimaAnalise = analises?.[0]?.dados_json ?? null;
  const ultimaAnaliseEm = analises?.[0]?.gerado_em
    ? new Date(analises[0].gerado_em).toLocaleString("pt-BR")
    : null;

  // ── Textos para cópia por seção ─────────────────────────────────────────────
  const textoAnalise = ultimo?.analise_estrategica
    ? [
        `Posicionamento: ${ultimo.analise_estrategica.posicionamento_final}`,
        `Público-alvo: ${ultimo.analise_estrategica.publico_alvo}`,
        `Nível de mercado: ${ultimo.analise_estrategica.nivel_mercado}`,
        `Tom de comunicação: ${ultimo.analise_estrategica.tom_comunicacao}`,
        `Diferenciais-chave:\n${ultimo.analise_estrategica.diferenciais_chave.map((d, i) => `  ${i + 1}. ${d}`).join("\n")}`,
        `Gatilhos emocionais:\n${ultimo.analise_estrategica.gatilhos_emocionais.map((g, i) => `  ${i + 1}. ${g}`).join("\n")}`,
      ].join("\n\n")
    : undefined;

  const textoRoteiro = ultimo?.roteiro_sugerido?.roteiro
    ? (ultimo.roteiro_sugerido.roteiro as CenaRoteiro[])
        .map((c: CenaRoteiro) =>
          [
            `Cena ${c.cena} — ${c.titulo}`,
            c.texto,
            c.legenda_sugerida ? `Legenda: ${c.legenda_sugerida}` : null,
            c.orientacao_captacao ? `Captação: ${c.orientacao_captacao}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n---\n\n")
    : undefined;

  const textoCopy = ultimo?.copy_anuncios?.anuncios
    ? ultimo.copy_anuncios.anuncios
        .map((ad: Anuncio) => `[${ad.tipo.toUpperCase()}]\n${ad.headline}\n\n${ad.copy}\n\nCTA: ${ad.cta}`)
        .join("\n\n---\n\n")
    : undefined;

  const textoDirecao = ultimo?.direcao_criativa?.direcao
    ? ultimo.direcao_criativa.direcao
        .map((d: DirecaoCena, i: number) =>
          [
            `${i + 1}. ${d.tipo_cena}`,
            `Ambientação: ${d.ambientacao}`,
            `Enquadramento: ${d.enquadramento}`,
            `Edição: ${d.estilo_edicao}`,
            `Legenda: ${d.legenda_sugerida}`,
          ].join("\n")
        )
        .join("\n\n")
    : undefined;

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

              <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                {p.whatsapp && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{formatarTelefone(p.whatsapp)}</span>
                  </div>
                )}
                {p.instagram && (
                  <div className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-gray-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                    </svg>
                    <span className="break-all whitespace-pre-wrap">{p.instagram}</span>
                  </div>
                )}
                {p.email && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="22,6 12,13 2,6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="break-all">{p.email}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {ultimo && (
                <ExportarButton
                  tipo="completo"
                  variant="primary"
                  prestador={p}
                  roteiro={ultimo}
                />
              )}
              {ultimo && (
                <AprovarButton roteiroId={ultimo.id} aprovadoAtual={ultimo.aprovado} />
              )}
            </div>
          </div>
        </div>

        {/* Resumo do perfil da entrevista */}
        {dados && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Perfil da entrevista</h3>
              <Link
                href={`/prestador/${id}/editar`}
                className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline transition"
              >
                Editar informações
              </Link>
            </div>

            {/* Linha 1 — KPIs numéricos */}
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

            {/* Linha 2 — Nicho + Certificações */}
            {(dados.especialidade || dados.formacao) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {dados.especialidade && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-brand-100">
                    <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1.5">Nicho</p>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{dados.especialidade}</p>
                  </div>
                )}
                {dados.formacao && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Certificações</p>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{dados.formacao}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <ExcluirPrestadorButton prestadorId={p.id} />
          <div className="flex items-center gap-2 flex-wrap">
            {!entrevista && (
              <Link
                href={`/prestador/${id}/editar`}
                className="text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition"
              >
                Cadastrar entrevista
              </Link>
            )}
            {entrevista && ultimo && (
              <RefazerRoteiroButton entrevistaId={entrevista.id} />
            )}
            {entrevista && !ultimo && (
              <GerarRoteiroButton entrevistaId={entrevista.id} />
            )}
          </div>
        </div>

        {/* Abas: Roteiro | Campanha */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {[
            { value: "roteiro",  label: "Roteiro" },
            { value: "campanha", label: "Campanha Meta Ads" },
          ].map(({ value, label }) => {
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
                {value === "campanha" && ultimoRelatorio?.health_score !== undefined && ultimoRelatorio.health_score !== null && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    ultimoRelatorio.health_score >= 70 ? "bg-green-100 text-green-700" :
                    ultimoRelatorio.health_score >= 40 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-600"
                  }`}>
                    {ultimoRelatorio.health_score}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Conteúdo da aba Campanha */}
        {tab === "campanha" && (
          <CampanhaTab
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
        )}

        {/* Seções — tab roteiro */}
        {tab !== "campanha" && (
        <div className="space-y-4">
          {ultimo && (
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
          )}

          {/* 1. Análise Estratégica */}
          <RoteiroCard
            titulo="1. Análise Estratégica"
            defaultOpen={!!ultimo?.analise_estrategica}
            conteudoCopiar={textoAnalise}
            acaoSlot={entrevista ? (
              <div className="flex items-center gap-2">
                {ultimo?.analise_estrategica && (
                  <ExportarButton tipo="analise" variant="outline" prestador={p} roteiro={ultimo} />
                )}
                <GerarSecaoButton
                  entrevistaId={entrevista.id}
                  roteiroId={ultimo?.id}
                  secao="analise_estrategica"
                  modo={ultimo?.analise_estrategica ? "refazer" : "gerar"}
                />
              </div>
            ) : undefined}
          >
            {ultimo?.analise_estrategica ? (
              <div className="grid sm:grid-cols-2 gap-5 text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Posicionamento</p>
                  <TextoFormatado texto={ultimo.analise_estrategica.posicionamento_final} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Público-alvo</p>
                  <TextoFormatado texto={ultimo.analise_estrategica.publico_alvo} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nível de mercado</p>
                  <TextoFormatado texto={ultimo.analise_estrategica.nivel_mercado} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tom de comunicação</p>
                  <TextoFormatado texto={ultimo.analise_estrategica.tom_comunicacao} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Diferenciais-chave</p>
                  <ul className="space-y-1.5">
                    {(ultimo.analise_estrategica.diferenciais_chave ?? []).map((d, i) => (
                      <li key={i} className="flex gap-2 font-lora leading-[1.7] text-gray-800">
                        <span className="text-brand-400 font-bold mt-0.5">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Gatilhos emocionais</p>
                  <ul className="space-y-1.5">
                    {(ultimo.analise_estrategica.gatilhos_emocionais ?? []).map((g, i) => (
                      <li key={i} className="flex gap-2 font-lora leading-[1.7] text-gray-800">
                        <span className="text-pink-400 font-bold mt-0.5">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : entrevista ? (
              <GerarSecaoButton entrevistaId={entrevista.id} roteiroId={ultimo?.id} secao="analise_estrategica" modo="gerar" />
            ) : (
              <p className="text-sm text-gray-400">Cadastre a entrevista para gerar esta seção.</p>
            )}
          </RoteiroCard>

          {/* 2. Roteiro de Vídeo */}
          <RoteiroCard
            titulo="2. Roteiro de Vídeo"
            conteudoCopiar={textoRoteiro}
            acaoSlot={entrevista ? (
              <div className="flex items-center gap-2">
                {ultimo?.roteiro_sugerido && (
                  <ExportarButton tipo="roteiro" variant="outline" prestador={p} roteiro={ultimo} />
                )}
                <GerarSecaoButton
                  entrevistaId={entrevista.id}
                  roteiroId={ultimo?.id}
                  secao="roteiro_sugerido"
                  modo={ultimo?.roteiro_sugerido ? "refazer" : "gerar"}
                />
              </div>
            ) : undefined}
          >
            {ultimo?.roteiro_sugerido?.roteiro ? (
              <div className="space-y-0">
                {(ultimo.roteiro_sugerido.roteiro as CenaRoteiro[]).map((cena: CenaRoteiro, idx: number) => (
                  <div key={cena.cena}>
                    <div className="border-l-4 border-brand-300 pl-4 py-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-brand-600 uppercase tracking-wide">
                          Cena {cena.cena} — {cena.titulo}
                        </p>
                        <CopiarButton texto={cena.texto} />
                      </div>
                      <TextoFormatado texto={cena.texto} className="mb-3" />
                      {cena.legenda_sugerida && (
                        <div className="bg-gray-50 rounded-md px-3 py-2 mt-2">
                          <p className="text-xs font-medium text-gray-500 mb-0.5">Legenda sugerida</p>
                          <p className="text-xs text-gray-700 font-lora leading-[1.7] italic">{cena.legenda_sugerida}</p>
                        </div>
                      )}
                      {cena.orientacao_captacao && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-400 mb-0.5">Orientação de captação</p>
                          <p className="text-xs text-gray-500 font-lora leading-[1.7]">{cena.orientacao_captacao}</p>
                        </div>
                      )}
                    </div>
                    {idx < ((ultimo.roteiro_sugerido?.roteiro as CenaRoteiro[])?.length ?? 0) - 1 && (
                      <hr className="my-5 border-gray-100" />
                    )}
                  </div>
                ))}
              </div>
            ) : entrevista ? (
              <GerarSecaoButton entrevistaId={entrevista.id} roteiroId={ultimo?.id} secao="roteiro_sugerido" modo="gerar" />
            ) : (
              <p className="text-sm text-gray-400">Cadastre a entrevista para gerar esta seção.</p>
            )}
          </RoteiroCard>

          {/* 3. Roteiro Para Anúncios */}
          <RoteiroCard
            titulo="3. Roteiro Para Anúncios"
            conteudoCopiar={textoCopy}
            acaoSlot={entrevista ? (
              <div className="flex items-center gap-2">
                {ultimo?.copy_anuncios && (
                  <ExportarButton tipo="anuncios" variant="outline" prestador={p} roteiro={ultimo} />
                )}
                <GerarSecaoButton
                  entrevistaId={entrevista.id}
                  roteiroId={ultimo?.id}
                  secao="copy_anuncios"
                  modo={ultimo?.copy_anuncios ? "refazer" : "gerar"}
                />
              </div>
            ) : undefined}
          >
            {ultimo?.copy_anuncios?.anuncios ? (
              <div className="space-y-5">
                {(ultimo.copy_anuncios.anuncios as Anuncio[]).map((ad: Anuncio) => {
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
                      <TextoFormatado texto={ad.copy} className="mb-3 text-sm text-gray-700" />
                      <div className="border-t border-gray-200 pt-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mr-2">CTA</span>
                        <span className="text-sm text-brand-700 font-medium">{ad.cta}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : entrevista ? (
              <GerarSecaoButton entrevistaId={entrevista.id} roteiroId={ultimo?.id} secao="copy_anuncios" modo="gerar" />
            ) : (
              <p className="text-sm text-gray-400">Cadastre a entrevista para gerar esta seção.</p>
            )}
          </RoteiroCard>

          {/* 4. Direção Criativa */}
          <RoteiroCard
            titulo="4. Direção Criativa"
            conteudoCopiar={textoDirecao}
            acaoSlot={entrevista ? (
              <div className="flex items-center gap-2">
                {ultimo?.direcao_criativa && (
                  <ExportarButton tipo="direcao" variant="outline" prestador={p} roteiro={ultimo} />
                )}
                <GerarSecaoButton
                  entrevistaId={entrevista.id}
                  roteiroId={ultimo?.id}
                  secao="direcao_criativa"
                  modo={ultimo?.direcao_criativa ? "refazer" : "gerar"}
                />
              </div>
            ) : undefined}
          >
            {ultimo?.direcao_criativa?.direcao ? (
              <div className="space-y-4">
                {(ultimo.direcao_criativa.direcao as DirecaoCena[]).map((d: DirecaoCena, i: number) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4">
                    <p className="font-semibold text-gray-900 mb-3">
                      <span className="text-brand-500 mr-1">{i + 1}.</span> {d.tipo_cena}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Ambientação</p>
                        <TextoFormatado texto={d.ambientacao} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Enquadramento</p>
                        <TextoFormatado texto={d.enquadramento} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Estilo de edição</p>
                        <TextoFormatado texto={d.estilo_edicao} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Legenda sugerida</p>
                        <p className="font-lora leading-[1.7] text-gray-700 italic">{d.legenda_sugerida}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : entrevista ? (
              <GerarSecaoButton entrevistaId={entrevista.id} roteiroId={ultimo?.id} secao="direcao_criativa" modo="gerar" />
            ) : (
              <p className="text-sm text-gray-400">Cadastre a entrevista para gerar esta seção.</p>
            )}
          </RoteiroCard>
        </div>
        )}
      </main>
    </div>
  );
}
