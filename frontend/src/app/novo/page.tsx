"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { extractFunctionError } from "@/lib/error-utils";
import { RESPONSAVEIS } from "@/lib/constants";
import { validarEntrevista } from "@/lib/schemas";
import type { Categoria, DadosEntrevista } from "@/lib/types";
import { formatarTelefone, cn } from "@/lib/utils";
import Header from "@/components/Header";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "musico", label: "Músico / Banda" },
  { value: "fotografo", label: "Fotógrafo / Cinegrafista" },
  { value: "celebrante", label: "Celebrante / Cerimonialista" },
  { value: "dj", label: "DJ" },
  { value: "outro", label: "Outro" },
];

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

const INITIAL: DadosEntrevista = {
  nome_artistico: "",
  categoria: "musico",
  whatsapp: "",
  email: "",
  cidade_base: "",
  instagram: "",
  anos_experiencia: "",
  especialidade: "",
  preco_medio: "",
  numero_casamentos: "",
  formacao: "",
  equipamentos: "",
  diferenciais: "",
  estilo_trabalho: "",
  depoimento_favorito: "",
  momentos_especiais: "",
  como_conheceu_noivos: "",
  informacoes_adicionais: "",
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{children}</p>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      {/* Radix UI Select não aceita value="" em SelectItem — string vazia → undefined (mostra placeholder) */}
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
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
  const errCls = erro ? "border-red-400 focus-visible:ring-red-400" : "";
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
          className={cn("resize-none", errCls)}
          disabled={disabled}
        />
      ) : (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={errCls}
          disabled={disabled}
        />
      )}
      {erro && <p className="text-xs text-red-500 mt-1">{erro}</p>}
      {!erro && remaining !== null && value.length > 0 && (
        <p
          className={`text-right text-xs mt-1 ${
            remaining === 0 ? "text-red-500 font-medium" : warn ? "text-amber-500" : "text-gray-600"
          }`}
        >
          {remaining} restantes
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [dados, setDados] = useState<DadosEntrevista>({
    ...INITIAL,
    plano: "Essencial",
    fase_projeto: "Onboarding",
    responsavel_mm: "",
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const acaoRef = useRef<"cadastrar" | "gerar">("cadastrar");

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [user, userLoading, router]);

  function set(name: keyof DadosEntrevista, value: string) {
    const val = name === "whatsapp" ? formatarTelefone(value) : value;
    setDados((prev) => ({ ...prev, [name]: val }));
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
      const primeiro = Object.keys(camposErro)[0];
      document.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }
    setErros({});
    setLoading(true);

    const supabase = createClient();

    try {
      // ── 1. Salvar prestador ──
      setStatus("Salvando prestador...");
      const { data: prestador, error: errPrestador } = await supabase
        .from("prestadores")
        .insert({
          nome_artistico: dados.nome_artistico.trim(),
          categoria: dados.categoria,
          whatsapp: dados.whatsapp || null,
          email: dados.email || null,
          cidade_base: dados.cidade_base || null,
          instagram: dados.instagram || null,
        })
        .select()
        .single();

      if (errPrestador || !prestador)
        throw new Error("Erro ao salvar prestador: " + errPrestador?.message);

      // ── 2. Salvar entrevista ──
      setStatus("Salvando entrevista...");
      const { data: entrevista, error: errEntrevista } = await supabase
        .from("entrevistas")
        .insert({ prestador_id: prestador.id, dados_json: dados })
        .select()
        .single();

      if (errEntrevista || !entrevista)
        throw new Error("Erro ao salvar entrevista: " + errEntrevista?.message);

      // ── 3. Verificar se cliente já existe na pipeline ──────────────────────
      setStatus("Verificando pipeline...");
      const nomeBusca = dados.nome_artistico.trim();

      const { data: candidatos } = await supabase
        .from("mm_clientes")
        .select("id_cliente, nome_empresa")
        .ilike("nome_empresa", nomeBusca);

      // Pega o de menor ID MM caso haja duplicatas residuais
      const clienteExistente =
        (candidatos ?? []).sort((a, b) => {
          const na = parseInt(a.id_cliente.replace(/^MM/i, ""), 10) || 999999;
          const nb = parseInt(b.id_cliente.replace(/^MM/i, ""), 10) || 999999;
          return na - nb;
        })[0] ?? null;

      if (clienteExistente) {
        // ── Já existe na pipeline — só vincula o mm_id, sem criar duplicata ──
        await supabase
          .from("entrevistas")
          .update({ dados_json: { ...dados, mm_id: clienteExistente.id_cliente } })
          .eq("id", entrevista.id);
        toast.success(
          `Vinculado ao cliente existente: ${clienteExistente.nome_empresa} (${clienteExistente.id_cliente}). Nenhuma entrada duplicada criada.`
        );
      } else {
        // ── Novo cliente — criar pipeline completa (Sheets + mm_clientes) ──
        setStatus("Criando pipeline completa (planilha + tarefas)...");
        let abortarCadastro = false;
        try {
          const segmentoLabel =
            CATEGORIAS.find((c) => c.value === dados.categoria)?.label ?? dados.categoria;
          const res = await fetch("/api/sheets/novo-cliente", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nome_empresa: nomeBusca,
              segmento: segmentoLabel,
              cidade: dados.cidade_base || "",
              whatsapp: dados.whatsapp || "",
              email: dados.email || "",
              plano: dados.plano || "Essencial",
              fase_projeto: dados.fase_projeto || "Onboarding",
              responsavel_mm: dados.responsavel_mm || "",
              observacoes: dados.informacoes_adicionais || "",
            }),
          });
          const sheetData = await res.json();

          if (res.status === 409 || sheetData.duplicado) {
            // Sheets achou duplicata que o Supabase não tinha — desfaz e aborta
            abortarCadastro = true;
            await supabase.from("entrevistas").delete().eq("id", entrevista.id);
            await supabase.from("prestadores").delete().eq("id", prestador.id);
            throw new Error(sheetData.error ?? "Cliente já cadastrado na planilha.");
          }

          if (sheetData.ok) {
            if (sheetData.id) {
              await supabase
                .from("entrevistas")
                .update({ dados_json: { ...dados, mm_id: sheetData.id } })
                .eq("id", entrevista.id);
            }
            toast.success(
              `Pipeline criada: ${sheetData.aba} · ID: ${sheetData.id} · ${sheetData.tarefas} tarefa(s) com prazo.`
            );
          } else {
            toast.warning(`Sheets: ${sheetData.error ?? "falha ao criar aba"}`);
          }
        } catch (sheetsErr) {
          if (abortarCadastro) throw sheetsErr;
          toast.warning(
            `Planilha não atualizada: ${sheetsErr instanceof Error ? sheetsErr.message : "erro de rede"}`
          );
        }
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
        throw new Error(await extractFunctionError(fnError, "Erro ao gerar roteiro"));
      }
      if (!fnData?.roteiro) throw new Error(fnData?.error ?? "Roteiro não retornado pela IA");

      router.push(`/prestador/${prestador.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
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
            Se o cliente já existe na pipeline, apenas cria o card de roteiro vinculado. Se for
            novo, cria a pipeline completa (planilha + tarefas) e o card.
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
                  erro={erros.nome_artistico}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SelectField
                    label="Categoria"
                    value={dados.categoria}
                    onChange={(v) => set("categoria", v as Categoria)}
                    options={CATEGORIAS}
                    required
                    disabled={loading}
                  />
                  <SelectField
                    label="Plano"
                    value={dados.plano ?? "Essencial"}
                    onChange={(v) => set("plano", v)}
                    options={PLANOS.map((p) => ({ value: p, label: p }))}
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SelectField
                    label="Fase do projeto"
                    value={dados.fase_projeto ?? "Onboarding"}
                    onChange={(v) => set("fase_projeto", v)}
                    options={FASES.map((f) => ({ value: f, label: f }))}
                    disabled={loading}
                  />
                  <SelectField
                    label="Responsável MM"
                    value={dados.responsavel_mm ?? ""}
                    onChange={(v) => set("responsavel_mm", v)}
                    options={RESPS.map((r) => ({ value: r, label: r }))}
                    placeholder="— selecione —"
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
                    <FieldLabel>WhatsApp</FieldLabel>
                    <Input
                      type="tel"
                      value={dados.whatsapp}
                      onChange={(e) => set("whatsapp", e.target.value)}
                      placeholder="(11) 99999-9999"
                      disabled={loading}
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
                      disabled={loading}
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
                  erro={erros.especialidade}
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
                  disabled={loading}
                  erro={erros.estilo_trabalho}
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

          {status && (
            <div className="px-4 py-3 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              {status}
            </div>
          )}

          {/* ── Aviso de pré-requisito Sheets ── */}
          <p className="text-xs text-gray-400 text-center">
            Se o cliente já existe na pipeline, nenhuma entrada nova é criada na planilha. Para
            novos clientes, é necessário{" "}
            <span className="font-mono text-gray-500">GOOGLE_SERVICE_ACCOUNT_JSON</span>{" "}
            configurado.
          </p>

          {/* ── Botões ── */}
          <div className="flex flex-col sm:flex-row gap-3 pb-8">
            <Button
              type="submit"
              variant="outline"
              disabled={loading}
              onClick={() => {
                acaoRef.current = "cadastrar";
              }}
              className="flex-1 py-3.5 rounded-xl h-auto"
            >
              {loading && acaoRef.current === "cadastrar" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Cadastrar prestador"
              )}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              onClick={() => {
                acaoRef.current = "gerar";
              }}
              className="flex-1 py-3.5 rounded-xl h-auto"
            >
              {loading && acaoRef.current === "gerar" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando roteiro…
                </>
              ) : (
                "Cadastrar e gerar roteiro ✦"
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
