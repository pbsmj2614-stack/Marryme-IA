"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { Categoria, DadosEntrevista } from "@/lib/types";
import { formatarTelefone } from "@/lib/utils";
import Header from "@/components/Header";

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "musico", label: "Músico" },
  { value: "fotografo", label: "Fotógrafo" },
  { value: "celebrante", label: "Celebrante" },
  { value: "dj", label: "DJ" },
  { value: "outro", label: "Outro" },
];

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

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder = "",
  textarea = false,
  rows = 3,
  required = false,
  maxLength,
}: {
  label: string;
  name: keyof DadosEntrevista;
  value: string;
  onChange: (name: keyof DadosEntrevista, val: string) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}) {
  const cls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  const restantes = maxLength !== undefined ? maxLength - value.length : null;
  const poucosRestantes = restantes !== null && restantes <= Math.ceil(maxLength! * 0.15);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {textarea ? (
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          className={cls}
        />
      )}
      {restantes !== null && value.length > 0 && (
        <p className={`text-right text-xs mt-1 transition-colors ${
          restantes === 0
            ? "text-red-500 font-medium"
            : poucosRestantes
            ? "text-amber-500"
            : "text-gray-300"
        }`}>
          {restantes} restantes
        </p>
      )}
    </div>
  );
}

export default function NovoPage() {
  const router = useRouter();
  const [dados, setDados] = useState<DadosEntrevista>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const acaoRef = useRef<"cadastrar" | "gerar">("cadastrar");

  function handleChange(name: keyof DadosEntrevista, value: string) {
    const val = name === "whatsapp" ? formatarTelefone(value) : value;
    setDados((prev) => ({ ...prev, [name]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    const supabase = createClient();

    // 1. Verificar autenticação
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    try {
      // 2. Salvar prestador
      setStatus("Salvando prestador...");
      const { data: prestador, error: errPrestador } = await supabase
        .from("prestadores")
        .insert({
          nome_artistico: dados.nome_artistico,
          categoria: dados.categoria,
          whatsapp: dados.whatsapp || null,
          email: dados.email || null,
          cidade_base: dados.cidade_base || null,
          instagram: dados.instagram || null,
        })
        .select()
        .single();

      if (errPrestador || !prestador) throw new Error("Erro ao salvar prestador");

      // 3. Salvar entrevista
      setStatus("Salvando entrevista...");
      const { data: entrevista, error: errEntrevista } = await supabase
        .from("entrevistas")
        .insert({
          prestador_id: prestador.id,
          dados_json: dados,
        })
        .select()
        .single();

      if (errEntrevista || !entrevista) throw new Error("Erro ao salvar entrevista");

      // 4a. Só cadastrar — redireciona sem gerar roteiro
      if (acaoRef.current === "cadastrar") {
        router.push(`/prestador/${prestador.id}`);
        return;
      }

      // 4b. Cadastrar e gerar roteiro
      setStatus("Gerando roteiro com IA (isso pode levar ~30 segundos)...");
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-roteiro", {
        body: { entrevista_id: entrevista.id },
      });

      if (fnError) throw new Error(fnError.message ?? "Erro ao gerar roteiro");
      if (!fnData?.roteiro) throw new Error("Roteiro não retornado pela IA");

      // 5. Redirecionar
      router.push(`/prestador/${prestador.id}`);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Novo prestador — Entrevista</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Dados básicos */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Dados básicos</h3>

            <Field label="Nome artístico" name="nome_artistico" value={dados.nome_artistico} onChange={handleChange} required placeholder="Ex: Banda Ravel, Foto Ana Lima..." maxLength={60} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria <span className="text-red-500">*</span>
              </label>
              <select
                value={dados.categoria}
                onChange={(e) => handleChange("categoria", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                required
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="WhatsApp" name="whatsapp" value={dados.whatsapp} onChange={handleChange} placeholder="(11) 99999-9999" maxLength={60} />
              <Field label="E-mail" name="email" value={dados.email} onChange={handleChange} type="email" placeholder="contato@..." maxLength={60} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade base" name="cidade_base" value={dados.cidade_base} onChange={handleChange} placeholder="São Paulo - SP" maxLength={300} />
              <Field label="Instagram" name="instagram" value={dados.instagram} onChange={handleChange} placeholder="@usuario" maxLength={300} />
            </div>
          </section>

          {/* Experiência */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Experiência e posicionamento</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Anos de experiência" name="anos_experiencia" value={dados.anos_experiencia} onChange={handleChange} placeholder="Ex: 8 anos" required maxLength={120} />
              <Field label="Nº aproximado de casamentos" name="numero_casamentos" value={dados.numero_casamentos} onChange={handleChange} placeholder="Ex: 200+" maxLength={120} />
            </div>

            <Field label="Especialidade / nicho" name="especialidade" value={dados.especialidade} onChange={handleChange} textarea rows={4} placeholder="Ex: casamentos na natureza, fotojornalismo, música ao vivo MPB..." required maxLength={800} />

            <Field label="Ticket médio (R$)" name="preco_medio" value={dados.preco_medio} onChange={handleChange} placeholder="Ex: R$ 8.000 a R$ 15.000" maxLength={120} />

            <Field label="Formação / certificações" name="formacao" value={dados.formacao} onChange={handleChange} textarea placeholder="Cursos, workshops, especializações..." maxLength={300} />
          </section>

          {/* Diferenciais */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Diferenciais e estilo</h3>

            <Field label="Equipamentos / recursos principais" name="equipamentos" value={dados.equipamentos} onChange={handleChange} textarea placeholder="Ex: câmeras Sony, iluminação LED, carro de apoio..." maxLength={500} />

            <Field label="Principais diferenciais" name="diferenciais" value={dados.diferenciais} onChange={handleChange} textarea rows={5} required placeholder="O que faz este profissional ser único? Seja específico." maxLength={1000} />

            <Field label="Estilo / forma de trabalho" name="estilo_trabalho" value={dados.estilo_trabalho} onChange={handleChange} textarea rows={5} required placeholder="Como ele conduz o dia? Como é a relação com os noivos?" maxLength={1000} />
          </section>

          {/* Storytelling */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Storytelling e conexão emocional</h3>

            <Field label="Depoimento / feedback favorito de clientes" name="depoimento_favorito" value={dados.depoimento_favorito} onChange={handleChange} textarea rows={4} placeholder="O que os noivos mais falam depois do casamento?" maxLength={800} />

            <Field label="Momentos especiais / casos que marcaram" name="momentos_especiais" value={dados.momentos_especiais} onChange={handleChange} textarea rows={5} placeholder="Uma história ou situação marcante no trabalho..." maxLength={1200} />

            <Field label="Como os noivos costumam encontrá-lo" name="como_conheceu_noivos" value={dados.como_conheceu_noivos} onChange={handleChange} textarea placeholder="Indicação, Instagram, feiras, Google..." maxLength={500} />

            <Field label="Informações adicionais" name="informacoes_adicionais" value={dados.informacoes_adicionais} onChange={handleChange} textarea rows={5} placeholder="Qualquer outra informação relevante para o roteiro..." maxLength={1200} />
          </section>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {erro}
            </div>
          )}

          {status && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {status}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={loading}
              onClick={() => { acaoRef.current = "cadastrar"; }}
              className="flex-1 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60"
            >
              {loading && acaoRef.current === "cadastrar" ? "Salvando..." : "Cadastrar prestador"}
            </button>
            <button
              type="submit"
              disabled={loading}
              onClick={() => { acaoRef.current = "gerar"; }}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60"
            >
              {loading && acaoRef.current === "gerar" ? "Processando..." : "Cadastrar e gerar roteiro"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
