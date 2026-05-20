"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { validarEntrevista } from "@/lib/schemas";
import type { Categoria, DadosEntrevista } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";
import { RESPONSAVEIS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "musico", label: "Músico / Banda" },
  { value: "fotografo", label: "Fotógrafo / Cinegrafista" },
  { value: "celebrante", label: "Celebrante / Cerimonialista" },
  { value: "dj", label: "DJ" },
  { value: "outro", label: "Outro" },
];

const CATEGORIA_TO_SEGMENTO: Record<Categoria, string> = {
  musico: "Músico/Banda",
  fotografo: "Fotógrafo",
  celebrante: "Celebrante",
  dj: "DJ",
  outro: "Outro",
};

const PLANOS = ["Essencial", "Growth", "Enterprise"];
const FASES = [
  "Onboarding",
  "Planejamento de Metas",
  "Voo de Cruzeiro",
  "Renovação",
  "Pausado",
  "Churn",
];
const RESPS = RESPONSAVEIS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pt-1">
      {children}
    </p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </Label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  erro,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  erro?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      {/* Radix UI Select não aceita value="" em SelectItem — string vazia → undefined (mostra placeholder) */}
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger className={erro ? "border-red-400 focus:ring-red-400" : ""}>
          <SelectValue placeholder={placeholder ?? "Selecione..."} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {erro && <p className="text-xs text-red-500 mt-1">{erro}</p>}
    </div>
  );
}

function CharField({
  label,
  value,
  onChange,
  placeholder,
  required,
  textarea,
  rows = 3,
  maxLength,
  disabled,
  erro,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  erro?: string;
}) {
  const remaining = maxLength !== undefined ? maxLength - value.length : null;
  const warn = remaining !== null && remaining <= Math.ceil((maxLength ?? 0) * 0.15);
  const errorCls = erro ? "border-red-400 focus-visible:ring-red-400" : "";
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={`resize-none ${errorCls}`}
          disabled={disabled}
        />
      ) : (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={errorCls}
          disabled={disabled}
        />
      )}
      {erro && <p className="text-xs text-red-500 mt-1">{erro}</p>}
      {!erro && remaining !== null && value.length > 0 && (
        <p
          className={`text-right text-xs mt-1 ${remaining === 0 ? "text-red-500 font-medium" : warn ? "text-amber-500" : "text-gray-400"}`}
        >
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
  const [dados, setDados] = useState<DadosEntrevista>(initialData);
  const [saving, setSaving] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  function set(name: keyof DadosEntrevista, value: string) {
    const val = name === "whatsapp" ? formatarTelefone(value) : value;
    setDados((prev) => ({ ...prev, [name]: val }));
    // Limpa o erro do campo assim que o usuário começa a corrigir
    if (erros[name])
      setErros((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const camposErro = validarEntrevista(dados);
    if (camposErro) {
      setErros(camposErro);
      // Foca no primeiro campo com erro
      const primeiro = Object.keys(camposErro)[0];
      document.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }
    setErros({});
    setSaving(true);

    const supabase = createClient();

    try {
      // ── 1. Atualiza prestador ──
      const { error: errP } = await supabase
        .from("prestadores")
        .update({
          nome_artistico: dados.nome_artistico.trim(),
          categoria: dados.categoria,
          whatsapp: dados.whatsapp || null,
          email: dados.email || null,
          cidade_base: dados.cidade_base || null,
          instagram: dados.instagram || null,
        })
        .eq("id", prestadorId);

      if (errP) throw new Error("Erro ao atualizar prestador: " + errP.message);

      // ── 2. Cria ou atualiza entrevista (sincroniza campos de contato com prestadores) ──
      const dadosSinc = {
        ...dados,
        // Garante que dados_json reflita exatamente o que foi salvo em prestadores
        nome_artistico: dados.nome_artistico.trim(),
        whatsapp: dados.whatsapp || "",
        email: dados.email || "",
        cidade_base: dados.cidade_base || "",
        instagram: dados.instagram || "",
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

      toast.success("Informações salvas.");
      setTimeout(() => router.push(`/prestador/${prestadorId}`), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado ao salvar.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        {/* ── Identificação ── */}
        <div className="px-6 py-5">
          <SectionHeader>Identificação</SectionHeader>
          <div className="space-y-4">
            <CharField
              label="Nome artístico / empresa"
              value={dados.nome_artistico}
              onChange={(v) => set("nome_artistico", v)}
              placeholder="Ex: Banda Ravel…"
              required
              maxLength={60}
              disabled={saving}
              erro={erros.nome_artistico}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField
                label="Categoria"
                value={dados.categoria}
                onChange={(v) => {
                  const cat = v as Categoria;
                  set("categoria", cat);
                  set("segmento", CATEGORIA_TO_SEGMENTO[cat] ?? cat);
                }}
                options={CATEGORIAS}
                required
                disabled={saving}
              />
              <SelectField
                label="Plano"
                value={dados.plano ?? "Essencial"}
                onChange={(v) => set("plano", v)}
                options={PLANOS.map((p) => ({ value: p, label: p }))}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField
                label="Fase do projeto"
                value={dados.fase_projeto ?? "Onboarding"}
                onChange={(v) => set("fase_projeto", v)}
                options={FASES.map((f) => ({ value: f, label: f }))}
                disabled={saving}
              />
              <SelectField
                label="Responsável MM"
                value={dados.responsavel_mm ?? ""}
                onChange={(v) => set("responsavel_mm", v)}
                options={RESPS.map((r) => ({ value: r, label: r }))}
                placeholder="— selecione —"
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Contato ── */}
        <div className="px-6 py-5">
          <SectionHeader>Contato</SectionHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>WhatsApp</FieldLabel>
                <Input
                  type="tel"
                  value={dados.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-9999"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>E-mail</FieldLabel>
                <Input
                  type="email"
                  value={dados.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="contato@exemplo.com"
                  className={erros.email ? "border-red-400 focus-visible:ring-red-400" : ""}
                  disabled={saving}
                />
                {erros.email && <p className="text-xs text-red-500 mt-1">{erros.email}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CharField
                label="Cidade base"
                value={dados.cidade_base}
                onChange={(v) => set("cidade_base", v)}
                placeholder="São Paulo, SP"
                maxLength={300}
                disabled={saving}
              />
              <CharField
                label="Instagram"
                value={dados.instagram}
                onChange={(v) => set("instagram", v)}
                placeholder="@usuario"
                maxLength={300}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Experiência ── */}
        <div className="px-6 py-5">
          <SectionHeader>Experiência e posicionamento</SectionHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CharField
                label="Anos de experiência"
                value={dados.anos_experiencia}
                onChange={(v) => set("anos_experiencia", v)}
                placeholder="Ex: 8 anos"
                maxLength={120}
                disabled={saving}
              />
              <CharField
                label="Nº aprox. de casamentos"
                value={dados.numero_casamentos}
                onChange={(v) => set("numero_casamentos", v)}
                placeholder="Ex: 200+"
                maxLength={120}
                disabled={saving}
              />
            </div>
            <CharField
              label="Especialidade / nicho"
              value={dados.especialidade}
              onChange={(v) => set("especialidade", v)}
              placeholder="Ex: casamentos na natureza, fotojornalismo, MPB ao vivo…"
              textarea
              rows={4}
              required
              maxLength={800}
              disabled={saving}
              erro={erros.especialidade}
            />
            <CharField
              label="Ticket médio (R$)"
              value={dados.preco_medio}
              onChange={(v) => set("preco_medio", v)}
              placeholder="Ex: R$ 8.000 a R$ 15.000"
              maxLength={120}
              disabled={saving}
            />
            <CharField
              label="Formação / certificações"
              value={dados.formacao}
              onChange={(v) => set("formacao", v)}
              placeholder="Cursos, workshops, especializações…"
              textarea
              maxLength={300}
              disabled={saving}
            />
          </div>
        </div>

        <Separator />

        {/* ── Diferenciais ── */}
        <div className="px-6 py-5">
          <SectionHeader>Diferenciais e estilo</SectionHeader>
          <div className="space-y-4">
            <CharField
              label="Equipamentos / recursos principais"
              value={dados.equipamentos}
              onChange={(v) => set("equipamentos", v)}
              placeholder="Ex: câmeras Sony, iluminação LED…"
              textarea
              maxLength={500}
              disabled={saving}
            />
            <CharField
              label="Principais diferenciais"
              value={dados.diferenciais}
              onChange={(v) => set("diferenciais", v)}
              placeholder="O que faz este profissional ser único? Seja específico."
              textarea
              rows={5}
              required
              maxLength={1000}
              disabled={saving}
              erro={erros.diferenciais}
            />
            <CharField
              label="Estilo / forma de trabalho"
              value={dados.estilo_trabalho}
              onChange={(v) => set("estilo_trabalho", v)}
              placeholder="Como ele conduz o dia? Como é a relação com os noivos?"
              textarea
              rows={5}
              required
              maxLength={1000}
              disabled={saving}
              erro={erros.estilo_trabalho}
            />
          </div>
        </div>

        <Separator />

        {/* ── Storytelling ── */}
        <div className="px-6 py-5">
          <SectionHeader>Storytelling e conexão emocional</SectionHeader>
          <div className="space-y-4">
            <CharField
              label="Depoimento / feedback favorito"
              value={dados.depoimento_favorito}
              onChange={(v) => set("depoimento_favorito", v)}
              placeholder="O que os noivos mais falam depois do casamento?"
              textarea
              rows={4}
              maxLength={800}
              disabled={saving}
            />
            <CharField
              label="Momentos especiais / casos marcantes"
              value={dados.momentos_especiais}
              onChange={(v) => set("momentos_especiais", v)}
              placeholder="Uma história ou situação marcante no trabalho…"
              textarea
              rows={5}
              maxLength={1200}
              disabled={saving}
            />
            <CharField
              label="Como os noivos costumam encontrá-lo"
              value={dados.como_conheceu_noivos}
              onChange={(v) => set("como_conheceu_noivos", v)}
              placeholder="Indicação, Instagram, feiras, Google…"
              textarea
              maxLength={500}
              disabled={saving}
            />
            <CharField
              label="Informações adicionais"
              value={dados.informacoes_adicionais}
              onChange={(v) => set("informacoes_adicionais", v)}
              placeholder="Qualquer outra informação relevante para o roteiro…"
              textarea
              rows={5}
              maxLength={1200}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* ── Botões ── */}
      <div className="flex flex-col sm:flex-row gap-3 pb-8">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/prestador/${prestadorId}`)}
          disabled={saving}
          className="flex-1 py-3.5"
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="flex-1 py-3.5">
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando…
            </span>
          ) : (
            "Salvar informações"
          )}
        </Button>
      </div>
    </form>
  );
}
