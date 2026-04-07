"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { Categoria, DadosEntrevista } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";
import Header from "@/components/Header";
import type { User } from "@supabase/supabase-js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "musico",     label: "Músico / Banda" },
  { value: "fotografo",  label: "Fotógrafo / Cinegrafista" },
  { value: "celebrante", label: "Celebrante / Cerimonialista" },
  { value: "dj",         label: "DJ" },
  { value: "outro",      label: "Outro" },
];

const PLANOS    = ["Essencial", "Growth", "Enterprise"];
const FASES     = ["Onboarding", "Planejamento de Metas", "Voo de Cruzeiro", "Renovação", "Pausado", "Churn"];
const RESPS     = ["Paulo", "Murilo", "Kauê"];

const INITIAL: DadosEntrevista = {
  nome_artistico:        "",
  categoria:             "musico",
  whatsapp:              "",
  email:                 "",
  cidade_base:           "",
  instagram:             "",
  anos_experiencia:      "",
  especialidade:         "",
  preco_medio:           "",
  numero_casamentos:     "",
  formacao:              "",
  equipamentos:          "",
  diferenciais:          "",
  estilo_trabalho:       "",
  depoimento_favorito:   "",
  momentos_especiais:    "",
  como_conheceu_noivos:  "",
  informacoes_adicionais:"",
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

const inputCls = (err?: boolean) =>
  `w-full bg-white border ${
    err ? "border-red-400" : "border-gray-200"
  } rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 transition`;

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
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

function Select({
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
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={selectCls}
          disabled={disabled}
          required={required}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
      </div>
    </div>
  );
}

function CharField({
  label, value, onChange, placeholder, required, textarea, rows = 3, maxLength, disabled,
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
}) {
  const remaining = maxLength !== undefined ? maxLength - value.length : null;
  const warn = remaining !== null && remaining <= Math.ceil((maxLength ?? 0) * 0.15);
  return (
    <div>
      <Label required={required}>{label}</Label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={textareaCls}
          disabled={disabled}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={inputCls()}
          disabled={disabled}
        />
      )}
      {remaining !== null && value.length > 0 && (
        <p className={`text-right text-xs mt-1 ${
          remaining === 0 ? "text-red-500 font-medium" : warn ? "text-amber-500" : "text-gray-600"
        }`}>
          {remaining} restantes
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [dados,   setDados]   = useState<DadosEntrevista>({
    ...INITIAL,
    plano:          "Essencial",
    fase_projeto:   "Onboarding",
    responsavel_mm: "",
  });
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState("");
  const [erro,    setErro]    = useState("");
  const [sheetsAviso, setSheetsAviso] = useState("");
  const acaoRef = useRef<"cadastrar" | "gerar">("cadastrar");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/login"); return; }
      setUser(u);
    }
    init();
  }, [router]);

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
    setSheetsAviso("");
    setLoading(true);

    const supabase = createClient();

    try {
      // ── 1. Salvar prestador ──
      setStatus("Salvando prestador...");
      const { data: prestador, error: errPrestador } = await supabase
        .from("prestadores")
        .insert({
          nome_artistico: dados.nome_artistico.trim(),
          categoria:      dados.categoria,
          whatsapp:       dados.whatsapp   || null,
          email:          dados.email      || null,
          cidade_base:    dados.cidade_base|| null,
          instagram:      dados.instagram  || null,
        })
        .select()
        .single();

      if (errPrestador || !prestador) throw new Error("Erro ao salvar prestador: " + errPrestador?.message);

      // ── 2. Salvar entrevista ──
      setStatus("Salvando entrevista...");
      const { data: entrevista, error: errEntrevista } = await supabase
        .from("entrevistas")
        .insert({ prestador_id: prestador.id, dados_json: dados })
        .select()
        .single();

      if (errEntrevista || !entrevista) throw new Error("Erro ao salvar entrevista: " + errEntrevista?.message);

      // ── 3. Criar aba no Sheets + cadastrar no mm_clientes (best-effort) ──
      setStatus("Criando aba na planilha...");
      let abortarCadastro = false;
      try {
        const segmentoLabel = CATEGORIAS.find((c) => c.value === dados.categoria)?.label ?? dados.categoria;
        const res = await fetch("/api/sheets/novo-cliente", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nome_empresa:   dados.nome_artistico.trim(),
            segmento:       segmentoLabel,
            cidade:         dados.cidade_base           || "",
            whatsapp:       dados.whatsapp              || "",
            email:          dados.email                 || "",
            plano:          dados.plano                 || "Essencial",
            fase_projeto:   dados.fase_projeto          || "Onboarding",
            responsavel_mm: dados.responsavel_mm        || "",
            observacoes:    dados.informacoes_adicionais || "",
          }),
        });
        const sheetData = await res.json();
        if (res.status === 409 || sheetData.duplicado) {
          // Cliente já existe — desfaz o cadastro do prestador e bloqueia
          abortarCadastro = true;
          await supabase.from("entrevistas").delete().eq("id", entrevista.id);
          await supabase.from("prestadores").delete().eq("id", prestador.id);
          throw new Error(sheetData.error ?? "Cliente já cadastrado.");
        }
        if (sheetData.ok) {
          // Salva mm_id na entrevista para vincular prestador ↔ planilha
          if (sheetData.id) {
            await supabase
              .from("entrevistas")
              .update({ dados_json: { ...dados, mm_id: sheetData.id } })
              .eq("id", entrevista.id);
          }
          setSheetsAviso(`Planilha: ${sheetData.aba} · ID: ${sheetData.id} · ${sheetData.tarefas} tarefa(s) com prazo.`);
        } else {
          // Não bloqueia — apenas registra no aviso
          setSheetsAviso(`Aviso Sheets: ${sheetData.error ?? "falha ao criar aba"}`);
        }
      } catch (sheetsErr) {
        if (abortarCadastro) throw sheetsErr; // duplicata — propaga para o catch externo
        // Outros erros de Sheets não impedem o cadastro
        setSheetsAviso(`Aviso: planilha não atualizada (${sheetsErr instanceof Error ? sheetsErr.message : "erro de rede"})`);
      }

      // ── 4a. Só cadastrar ──
      if (acaoRef.current === "cadastrar") {
        router.push(`/prestador/${prestador.id}`);
        return;
      }

      // ── 4b. Gerar roteiro ──
      setStatus("Gerando roteiro com IA (~30 segundos)...");
      await supabase.auth.refreshSession();
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-roteiro", {
        body: { entrevista_id: entrevista.id },
      });

      if (fnError) {
        let detalhe = fnError.message ?? "Erro ao gerar roteiro";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (fnError as any).context;
        if (ctx instanceof Response) {
          try { const b = await ctx.clone().json(); if (b?.error) detalhe = b.error; } catch { /* ignora */ }
        }
        throw new Error(detalhe);
      }
      if (!fnData?.roteiro) throw new Error(fnData?.error ?? "Roteiro não retornado pela IA");

      router.push(`/prestador/${prestador.id}`);

    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* ── Cabeçalho ── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Novo Prestador</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastra o perfil, cria a aba na planilha e pode gerar os roteiros de IA em um clique.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">

          {/* ══════════════════════════════════════════════════ */}
          {/* SEÇÃO 1 — Identificação                           */}
          {/* ══════════════════════════════════════════════════ */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <SectionHeader>Identificação</SectionHeader>
              <div className="space-y-4">

                <CharField
                  label="Nome artístico / empresa"
                  value={dados.nome_artistico}
                  onChange={(v) => set("nome_artistico", v)}
                  placeholder="Ex: Banda Ravel, Foto Ana Lima…"
                  required
                  maxLength={60}
                  disabled={loading}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Categoria"
                    value={dados.categoria}
                    onChange={(v) => set("categoria", v as Categoria)}
                    options={CATEGORIAS}
                    required
                    disabled={loading}
                  />
                  <Select
                    label="Plano"
                    value={dados.plano ?? "Essencial"}
                    onChange={(v) => set("plano", v)}
                    options={PLANOS.map((p) => ({ value: p, label: p }))}
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Fase do projeto"
                    value={dados.fase_projeto ?? "Onboarding"}
                    onChange={(v) => set("fase_projeto", v)}
                    options={FASES.map((f) => ({ value: f, label: f }))}
                    disabled={loading}
                  />
                  <Select
                    label="Responsável MM"
                    value={dados.responsavel_mm ?? ""}
                    onChange={(v) => set("responsavel_mm", v)}
                    options={[{ value: "", label: "— selecione —" }, ...RESPS.map((r) => ({ value: r, label: r }))]}
                    disabled={loading}
                  />
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
                    <input
                      type="tel"
                      value={dados.whatsapp}
                      onChange={(e) => set("whatsapp", e.target.value)}
                      placeholder="(11) 99999-9999"
                      className={inputCls()}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <input
                      type="email"
                      value={dados.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="contato@exemplo.com"
                      className={inputCls()}
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CharField
                    label="Cidade base"
                    value={dados.cidade_base}
                    onChange={(v) => set("cidade_base", v)}
                    placeholder="São Paulo, SP"
                    maxLength={300}
                    disabled={loading}
                  />
                  <CharField
                    label="Instagram"
                    value={dados.instagram}
                    onChange={(v) => set("instagram", v)}
                    placeholder="@usuario"
                    maxLength={300}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* ── Experiência ── */}
            <div className="px-6 py-5 border-b border-gray-100">
              <SectionHeader>Experiência e posicionamento</SectionHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CharField
                    label="Anos de experiência"
                    value={dados.anos_experiencia}
                    onChange={(v) => set("anos_experiencia", v)}
                    placeholder="Ex: 8 anos"
                    maxLength={120}
                    disabled={loading}
                  />
                  <CharField
                    label="Nº aprox. de casamentos"
                    value={dados.numero_casamentos}
                    onChange={(v) => set("numero_casamentos", v)}
                    placeholder="Ex: 200+"
                    maxLength={120}
                    disabled={loading}
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
                  disabled={loading}
                />
                <CharField
                  label="Ticket médio (R$)"
                  value={dados.preco_medio}
                  onChange={(v) => set("preco_medio", v)}
                  placeholder="Ex: R$ 8.000 a R$ 15.000"
                  maxLength={120}
                  disabled={loading}
                />
                <CharField
                  label="Formação / certificações"
                  value={dados.formacao}
                  onChange={(v) => set("formacao", v)}
                  placeholder="Cursos, workshops, especializações…"
                  textarea
                  maxLength={300}
                  disabled={loading}
                />
              </div>
            </div>

            {/* ── Diferenciais ── */}
            <div className="px-6 py-5 border-b border-gray-100">
              <SectionHeader>Diferenciais e estilo</SectionHeader>
              <div className="space-y-4">
                <CharField
                  label="Equipamentos / recursos principais"
                  value={dados.equipamentos}
                  onChange={(v) => set("equipamentos", v)}
                  placeholder="Ex: câmeras Sony, iluminação LED…"
                  textarea
                  maxLength={500}
                  disabled={loading}
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
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>
            </div>

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
                  disabled={loading}
                />
                <CharField
                  label="Momentos especiais / casos marcantes"
                  value={dados.momentos_especiais}
                  onChange={(v) => set("momentos_especiais", v)}
                  placeholder="Uma história ou situação marcante no trabalho…"
                  textarea
                  rows={5}
                  maxLength={1200}
                  disabled={loading}
                />
                <CharField
                  label="Como os noivos costumam encontrá-lo"
                  value={dados.como_conheceu_noivos}
                  onChange={(v) => set("como_conheceu_noivos", v)}
                  placeholder="Indicação, Instagram, feiras, Google…"
                  textarea
                  maxLength={500}
                  disabled={loading}
                />
                <CharField
                  label="Informações adicionais"
                  value={dados.informacoes_adicionais}
                  onChange={(v) => set("informacoes_adicionais", v)}
                  placeholder="Qualquer outra informação relevante para o roteiro…"
                  textarea
                  rows={5}
                  maxLength={1200}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* ── Alertas ── */}
          {erro && (
            <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
              ✕ {erro}
            </div>
          )}

          {sheetsAviso && !erro && (
            <div className={`px-4 py-3 rounded-xl border text-sm ${
              sheetsAviso.startsWith("Aviso")
                ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}>
              {sheetsAviso}
            </div>
          )}

          {status && !erro && (
            <div className="px-4 py-3 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              {status}
            </div>
          )}

          {/* ── Aviso de pré-requisito Sheets ── */}
          <p className="text-xs text-gray-400 text-center">
            A criação da aba na planilha requer{" "}
            <span className="font-mono text-gray-500">GOOGLE_SERVICE_ACCOUNT_JSON</span> configurado.
            Se ausente, o prestador ainda é cadastrado normalmente.
          </p>

          {/* ── Botões ── */}
          <div className="flex flex-col sm:flex-row gap-3 pb-8">
            <button
              type="submit"
              disabled={loading}
              onClick={() => { acaoRef.current = "cadastrar"; }}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading && acaoRef.current === "cadastrar" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Salvando…
                </span>
              ) : "Cadastrar prestador"}
            </button>
            <button
              type="submit"
              disabled={loading}
              onClick={() => { acaoRef.current = "gerar"; }}
              className="flex-1 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && acaoRef.current === "gerar" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Gerando roteiro…
                </span>
              ) : "Cadastrar e gerar roteiro ✦"}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
