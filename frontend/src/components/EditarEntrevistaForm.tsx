"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { Categoria, DadosEntrevista } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "musico",     label: "Músico / Banda" },
  { value: "fotografo",  label: "Fotógrafo / Cinegrafista" },
  { value: "celebrante", label: "Celebrante / Cerimonialista" },
  { value: "dj",         label: "DJ" },
  { value: "outro",      label: "Outro" },
];

const PLANOS = ["Essencial", "Growth", "Enterprise"];
const FASES  = ["Onboarding", "Planejamento de Metas", "Voo de Cruzeiro", "Renovação", "Pausado", "Churn"];
const RESPS  = ["Paulo", "Murilo", "Kauê"];

// ─── UI helpers ───────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 transition";

const selectCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-400 transition appearance-none cursor-pointer";

const textareaCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 transition resize-none";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pt-1">
      {children}
    </p>
  );
}

function SelectField({
  label, value, onChange, options, required, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} disabled={disabled} required={required}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
      </div>
    </div>
  );
}

function CharField({
  label, value, onChange, placeholder, required, textarea, rows = 3, maxLength, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; textarea?: boolean;
  rows?: number; maxLength?: number; disabled?: boolean;
}) {
  const remaining = maxLength !== undefined ? maxLength - value.length : null;
  const warn = remaining !== null && remaining <= Math.ceil((maxLength ?? 0) * 0.15);
  return (
    <div>
      <Label required={required}>{label}</Label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} rows={rows} maxLength={maxLength}
          className={textareaCls} disabled={disabled} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} maxLength={maxLength}
          className={inputCls} disabled={disabled} />
      )}
      {remaining !== null && value.length > 0 && (
        <p className={`text-right text-xs mt-1 ${remaining === 0 ? "text-red-500 font-medium" : warn ? "text-amber-500" : "text-gray-400"}`}>
          {remaining} restantes
        </p>
      )}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function EditarEntrevistaForm({
  prestadorId,
  entrevistaId,
  initialData,
}: {
  prestadorId: string;
  entrevistaId: string | null;
  initialData: DadosEntrevista;
}) {
  const router = useRouter();
  const [dados,  setDados]  = useState<DadosEntrevista>(initialData);
  const [saving, setSaving] = useState(false);
  const [erro,   setErro]   = useState("");
  const [sucesso, setSucesso] = useState("");

  function set(name: keyof DadosEntrevista, value: string) {
    const val = name === "whatsapp" ? formatarTelefone(value) : value;
    setDados((prev) => ({ ...prev, [name]: val }));
  }

  function validate(): string | null {
    if (!dados.nome_artistico.trim() || dados.nome_artistico.trim().length < 2)
      return "Nome artístico é obrigatório (mínimo 2 caracteres).";
    if (dados.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim()))
      return "E-mail inválido.";
    if (!dados.especialidade.trim())
      return "Especialidade é obrigatória.";
    if (!dados.diferenciais.trim())
      return "Diferenciais são obrigatórios.";
    if (!dados.estilo_trabalho.trim())
      return "Estilo de trabalho é obrigatório.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validErr = validate();
    if (validErr) { setErro(validErr); return; }
    setErro("");
    setSucesso("");
    setSaving(true);

    const supabase = createClient();

    try {
      // ── 1. Atualiza prestador ──
      const { data: prestadorAtualizado, error: errP } = await supabase
        .from("prestadores")
        .update({
          nome_artistico: dados.nome_artistico.trim(),
          categoria:      dados.categoria,
          whatsapp:       dados.whatsapp    || null,
          email:          dados.email       || null,
          cidade_base:    dados.cidade_base || null,
          instagram:      dados.instagram   || null,
        })
        .eq("id", prestadorId)
        .select("id, whatsapp")
        .maybeSingle();

      if (errP) throw new Error("Erro ao atualizar prestador: " + errP.message);
      if (!prestadorAtualizado) throw new Error("Prestador não encontrado ou sem permissão para editar.");

      // ── 2. Cria ou atualiza entrevista (sincroniza campos de contato com prestadores) ──
      const dadosSinc = {
        ...dados,
        // Garante que dados_json reflita exatamente o que foi salvo em prestadores
        nome_artistico: dados.nome_artistico.trim(),
        whatsapp:       dados.whatsapp    || "",
        email:          dados.email       || "",
        cidade_base:    dados.cidade_base || "",
        instagram:      dados.instagram   || "",
      };
      if (entrevistaId) {
        const { error: errE } = await supabase
          .from("entrevistas")
          .update({ dados_json: dadosSinc })
          .eq("id", entrevistaId);
        if (errE) throw new Error("Erro ao atualizar entrevista: " + errE.message);
      } else {
        const { error: errE } = await supabase
          .from("entrevistas")
          .insert({ prestador_id: prestadorId, dados_json: dadosSinc });
        if (errE) throw new Error("Erro ao criar entrevista: " + errE.message);
      }

      setSucesso("Informações salvas.");
      setTimeout(() => router.push(`/prestador/${prestadorId}`), 800);

    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado ao salvar.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        {/* ── Identificação ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionHeader>Identificação</SectionHeader>
          <div className="space-y-4">
            <CharField label="Nome artístico / empresa" value={dados.nome_artistico}
              onChange={(v) => set("nome_artistico", v)} placeholder="Ex: Banda Ravel…"
              required maxLength={60} disabled={saving} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Categoria" value={dados.categoria}
                onChange={(v) => set("categoria", v as Categoria)}
                options={CATEGORIAS} required disabled={saving} />
              <SelectField label="Plano" value={dados.plano ?? "Essencial"}
                onChange={(v) => set("plano", v)}
                options={PLANOS.map((p) => ({ value: p, label: p }))} disabled={saving} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Fase do projeto" value={dados.fase_projeto ?? "Onboarding"}
                onChange={(v) => set("fase_projeto", v)}
                options={FASES.map((f) => ({ value: f, label: f }))} disabled={saving} />
              <SelectField label="Responsável MM" value={dados.responsavel_mm ?? ""}
                onChange={(v) => set("responsavel_mm", v)}
                options={[{ value: "", label: "— selecione —" }, ...RESPS.map((r) => ({ value: r, label: r }))]}
                disabled={saving} />
            </div>
          </div>
        </div>

        {/* ── Contato ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionHeader>Contato</SectionHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>WhatsApp</Label>
                <input type="tel" value={dados.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-9999" className={inputCls} disabled={saving} />
              </div>
              <div>
                <Label>E-mail</Label>
                <input type="email" value={dados.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="contato@exemplo.com" className={inputCls} disabled={saving} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CharField label="Cidade base" value={dados.cidade_base}
                onChange={(v) => set("cidade_base", v)} placeholder="São Paulo, SP"
                maxLength={300} disabled={saving} />
              <CharField label="Instagram" value={dados.instagram}
                onChange={(v) => set("instagram", v)} placeholder="@usuario"
                maxLength={300} disabled={saving} />
            </div>
          </div>
        </div>

        {/* ── Experiência ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionHeader>Experiência e posicionamento</SectionHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CharField label="Anos de experiência" value={dados.anos_experiencia}
                onChange={(v) => set("anos_experiencia", v)} placeholder="Ex: 8 anos"
                maxLength={120} disabled={saving} />
              <CharField label="Nº aprox. de casamentos" value={dados.numero_casamentos}
                onChange={(v) => set("numero_casamentos", v)} placeholder="Ex: 200+"
                maxLength={120} disabled={saving} />
            </div>
            <CharField label="Especialidade / nicho" value={dados.especialidade}
              onChange={(v) => set("especialidade", v)}
              placeholder="Ex: casamentos na natureza, fotojornalismo, MPB ao vivo…"
              textarea rows={4} required maxLength={800} disabled={saving} />
            <CharField label="Ticket médio (R$)" value={dados.preco_medio}
              onChange={(v) => set("preco_medio", v)} placeholder="Ex: R$ 8.000 a R$ 15.000"
              maxLength={120} disabled={saving} />
            <CharField label="Formação / certificações" value={dados.formacao}
              onChange={(v) => set("formacao", v)}
              placeholder="Cursos, workshops, especializações…"
              textarea maxLength={300} disabled={saving} />
          </div>
        </div>

        {/* ── Diferenciais ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionHeader>Diferenciais e estilo</SectionHeader>
          <div className="space-y-4">
            <CharField label="Equipamentos / recursos principais" value={dados.equipamentos}
              onChange={(v) => set("equipamentos", v)}
              placeholder="Ex: câmeras Sony, iluminação LED…"
              textarea maxLength={500} disabled={saving} />
            <CharField label="Principais diferenciais" value={dados.diferenciais}
              onChange={(v) => set("diferenciais", v)}
              placeholder="O que faz este profissional ser único? Seja específico."
              textarea rows={5} required maxLength={1000} disabled={saving} />
            <CharField label="Estilo / forma de trabalho" value={dados.estilo_trabalho}
              onChange={(v) => set("estilo_trabalho", v)}
              placeholder="Como ele conduz o dia? Como é a relação com os noivos?"
              textarea rows={5} required maxLength={1000} disabled={saving} />
          </div>
        </div>

        {/* ── Storytelling ── */}
        <div className="px-6 py-5">
          <SectionHeader>Storytelling e conexão emocional</SectionHeader>
          <div className="space-y-4">
            <CharField label="Depoimento / feedback favorito" value={dados.depoimento_favorito}
              onChange={(v) => set("depoimento_favorito", v)}
              placeholder="O que os noivos mais falam depois do casamento?"
              textarea rows={4} maxLength={800} disabled={saving} />
            <CharField label="Momentos especiais / casos marcantes" value={dados.momentos_especiais}
              onChange={(v) => set("momentos_especiais", v)}
              placeholder="Uma história ou situação marcante no trabalho…"
              textarea rows={5} maxLength={1200} disabled={saving} />
            <CharField label="Como os noivos costumam encontrá-lo" value={dados.como_conheceu_noivos}
              onChange={(v) => set("como_conheceu_noivos", v)}
              placeholder="Indicação, Instagram, feiras, Google…"
              textarea maxLength={500} disabled={saving} />
            <CharField label="Informações adicionais" value={dados.informacoes_adicionais}
              onChange={(v) => set("informacoes_adicionais", v)}
              placeholder="Qualquer outra informação relevante para o roteiro…"
              textarea rows={5} maxLength={1200} disabled={saving} />
          </div>
        </div>
      </div>

      {/* ── Alertas ── */}
      {erro && (
        <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">✕ {erro}</div>
      )}
      {sucesso && (
        <div className="px-4 py-3 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm">✓ {sucesso}</div>
      )}

      {/* ── Botões ── */}
      <div className="flex flex-col sm:flex-row gap-3 pb-8">
        <button
          type="button"
          onClick={() => router.push(`/prestador/${prestadorId}`)}
          disabled={saving}
          className="flex-1 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-600 font-semibold text-sm transition disabled:opacity-50 shadow-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Salvando…
            </span>
          ) : "Salvar informações"}
        </button>
      </div>

    </form>
  );
}
