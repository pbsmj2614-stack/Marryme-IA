"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import ExportarButton from "@/components/ExportarButton";
import type { Categoria } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";

const FASES = ["Onboarding", "Planejamento de Metas", "Voo de Cruzeiro", "Renovação", "Pausado", "Churn"];

const PLANO_COLORS: Record<string, string> = {
  essencial:  "bg-pink-50 text-pink-700 border-pink-100",
  growth:     "bg-violet-50 text-violet-700 border-violet-100",
  enterprise: "bg-amber-50 text-amber-700 border-amber-100",
  // legado — exibe mas não aparece nos novos cadastros
  premium:    "bg-purple-50 text-purple-700 border-purple-100",
  trial:      "bg-gray-100 text-gray-500 border-gray-200",
};

const PLANO_LABEL: Record<string, string> = {
  essencial:  "Essencial",
  growth:     "Growth",
  enterprise: "Enterprise",
  premium:    "Premium",
  trial:      "Trial",
};

// Cores da borda + texto do select de fase por etapa
const FASE_COLORS: Record<string, string> = {
  "Onboarding":           "border-green-400 text-green-700",
  "Planejamento de Metas":"border-sky-400 text-sky-700",
  "Voo de Cruzeiro":      "border-violet-400 text-violet-700",
  "Renovação":            "border-amber-400 text-amber-700",
  "Pausado":              "border-pink-400 text-pink-700",
  "Churn":                "border-zinc-500 text-zinc-500",
};

interface Props {
  prestadorId: string;
  nome: string;
  categoria: string;
  cidadeBase: string | null;
  whatsapp: string | null;
  nivelMercado: string | null;
  plano: string | null;
  faseProjeto: string | null;
  mmId: string | null;
  total: number;
  aprovados: number;
  ultimoRoteiroId?: string;
  ultimoRoteiroAprovado?: boolean;
  healthScore?: number | null;
}

const CATEGORIA_LABEL: Record<string, string> = {
  musico: "Músico",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

export default function PrestadorCard({
  prestadorId,
  nome,
  categoria,
  cidadeBase,
  whatsapp,
  nivelMercado,
  plano,
  faseProjeto,
  mmId,
  total,
  aprovados,
  ultimoRoteiroId,
  ultimoRoteiroAprovado,
  healthScore,
}: Props) {
  const router = useRouter();
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [loadingAcao, setLoadingAcao] = useState<string | null>(null);
  const [fase,        setFase]        = useState(faseProjeto ?? "Onboarding");
  const [savingFase,  setSavingFase]  = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const temRoteiro = total > 0;

  // Extrai só a primeira cidade (antes de " (", " -" ou ",")
  const cidadeCurta = cidadeBase
    ? cidadeBase.split(/\s*[\(\-,]/)[0].trim()
    : null;

  // Extrai só o resumo do nível (antes do primeiro ".", "," ou " com")
  const nivelCurto = nivelMercado
    ? nivelMercado.split(/[.,]|\s+com\s/)[0].trim()
    : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function navegarParaPrestador() {
    router.push(`/prestador/${prestadorId}`);
  }

  async function handleAprovar() {
    if (!ultimoRoteiroId) return;
    setMenuOpen(false);
    setLoadingAcao("aprovar");
    const supabase = createClient();
    await supabase
      .from("roteiros")
      .update({ aprovado: !ultimoRoteiroAprovado })
      .eq("id", ultimoRoteiroId);
    router.refresh();
    setLoadingAcao(null);
  }

  async function handleRenomear() {
    setMenuOpen(false);
    const novoNome = window.prompt("Novo nome:", nome);
    if (!novoNome || novoNome.trim() === nome) return;
    setLoadingAcao("renomear");
    const supabase = createClient();
    await supabase
      .from("prestadores")
      .update({ nome_artistico: novoNome.trim() })
      .eq("id", prestadorId);
    router.refresh();
    setLoadingAcao(null);
  }

  async function handleDuplicar() {
    setMenuOpen(false);
    setLoadingAcao("duplicar");
    const supabase = createClient();

    const { data: prestador } = await supabase
      .from("prestadores")
      .select("*")
      .eq("id", prestadorId)
      .single();

    const { data: entrevista } = await supabase
      .from("entrevistas")
      .select("dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prestador) { setLoadingAcao(null); return; }

    const { data: novo } = await supabase
      .from("prestadores")
      .insert({
        nome_artistico: `${prestador.nome_artistico} (cópia)`,
        categoria: prestador.categoria,
        whatsapp: prestador.whatsapp,
        email: prestador.email,
        cidade_base: prestador.cidade_base,
        instagram: prestador.instagram,
      })
      .select()
      .single();

    if (!novo) { setLoadingAcao(null); return; }

    if (entrevista?.dados_json) {
      await supabase.from("entrevistas").insert({
        prestador_id: novo.id,
        dados_json: entrevista.dados_json,
      });
    }

    router.push(`/prestador/${novo.id}`);
  }

  async function handleExcluir() {
    setMenuOpen(false);
    if (!window.confirm(`Excluir "${nome}"?\n\nEsta ação remove o prestador e todos os roteiros permanentemente.`)) return;
    setLoadingAcao("excluir");
    const supabase = createClient();
    await supabase.from("prestadores").delete().eq("id", prestadorId);
    router.refresh();
    setLoadingAcao(null);
  }

  const carregando = loadingAcao !== null;

  async function handleFaseChange(novaFase: string) {
    setFase(novaFase);
    setSavingFase(true);
    const supabase = createClient();
    // Busca última entrevista e atualiza dados_json.fase_projeto
    const { data: ent } = await supabase
      .from("entrevistas")
      .select("id, dados_json")
      .eq("prestador_id", prestadorId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ent) {
      await supabase
        .from("entrevistas")
        .update({ dados_json: { ...(ent.dados_json as object), fase_projeto: novaFase } })
        .eq("id", ent.id);
    }
    setSavingFase(false);
    router.refresh();
  }

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-brand-300 transition group cursor-pointer ${carregando ? "opacity-60 pointer-events-none" : ""}`}
      onClick={navegarParaPrestador}
    >
      {/* Linha 1: nome + badge status */}
      <div className="flex items-start justify-between gap-2 pr-6">
        <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition leading-snug">
          {nome}
        </h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
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

      {/* Linha 2: tags de tipo, plano, classificação e mmId */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
          {CATEGORIA_LABEL[categoria] ?? categoria}
        </span>
        {plano && (() => {
          const k = plano.trim().toLowerCase();
          const cls = PLANO_COLORS[k] ?? "bg-gray-100 text-gray-600 border-gray-200";
          const label = PLANO_LABEL[k] ?? (plano.charAt(0).toUpperCase() + plano.slice(1).toLowerCase());
          return (
            <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${cls}`}>
              {label}
            </span>
          );
        })()}
        {nivelCurto && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
            {nivelCurto}
          </span>
        )}
        {mmId && (
          <span className="text-xs font-mono bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
            {mmId}
          </span>
        )}
      </div>

      {/* Fase do projeto — sempre editável inline, cor muda por etapa */}
      <div
        className="mt-2 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-gray-400 shrink-0">Fase:</span>
        <div className="relative">
          <select
            value={fase}
            onChange={(e) => handleFaseChange(e.target.value)}
            disabled={savingFase || carregando}
            className={`text-xs bg-transparent border rounded-md pl-2 pr-5 py-0.5 appearance-none cursor-pointer focus:outline-none transition disabled:opacity-50 font-medium ${FASE_COLORS[fase] ?? "border-gray-200 text-gray-600"}`}
          >
            {FASES.map((f) => <option key={f}>{f}</option>)}
          </select>
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 text-[9px]">▼</span>
        </div>
        {savingFase && (
          <svg className="animate-spin h-3 w-3 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {/* Linha 3: telefone e cidade */}
      <div className="mt-3 space-y-1.5">
        {whatsapp && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="truncate">{formatarTelefone(whatsapp)}</span>
          </div>
        )}
        {cidadeCurta && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{cidadeCurta}</span>
          </div>
        )}
      </div>

      {/* Linha 4: contagem + health score + botão download */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 truncate">
            {total === 0 ? "Sem roteiro" : `${total} roteiro${total !== 1 ? "s" : ""}`}
          </span>
          {healthScore !== null && healthScore !== undefined && (
            <Link
              href={`/prestador/${prestadorId}?tab=campanha`}
              onClick={(e) => e.stopPropagation()}
              className={`shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full border transition hover:opacity-80 ${
                healthScore >= 70 ? "bg-green-50 text-green-700 border-green-200" :
                healthScore >= 40 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                "bg-red-50 text-red-600 border-red-200"
              }`}
              title="Health Score Meta Ads"
            >
              HS {healthScore}
            </Link>
          )}
        </div>
        {ultimoRoteiroAprovado && ultimoRoteiroId && (
          <ExportarButton
            tipo="completo"
            variant="icon"
            prestador={{ nome_artistico: nome, categoria: categoria as Categoria }}
            roteiroId={ultimoRoteiroId}
          />
        )}
      </div>

      {/* Botão 3 pontos */}
      <div
        ref={menuRef}
        className="absolute top-3 right-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          title="Opções"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
            {/* Aprovar */}
            <button
              onClick={handleAprovar}
              disabled={!ultimoRoteiroId}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-gray-700">
                {ultimoRoteiroAprovado ? "Desaprovar" : "Aprovar"}
              </span>
            </button>

            {/* Renomear */}
            <button
              onClick={handleRenomear}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-gray-700">Renomear</span>
            </button>

            {/* Duplicar */}
            <button
              onClick={handleDuplicar}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-gray-700">Duplicar</span>
            </button>

            <div className="my-1 border-t border-gray-100" />

            {/* Excluir */}
            <button
              onClick={handleExcluir}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-red-50 transition"
            >
              <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-red-600 font-medium">Excluir</span>
            </button>
          </div>
        )}
      </div>

      {/* Indicador de loading */}
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
          <svg className="animate-spin h-5 w-5 text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}
    </div>
  );
}
