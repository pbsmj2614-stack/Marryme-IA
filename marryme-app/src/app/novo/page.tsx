"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { Categoria, DadosEntrevista } from "@/lib/types";
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
  required = false,
}: {
  label: string;
  name: keyof DadosEntrevista;
  value: string;
  onChange: (name: keyof DadosEntrevista, val: string) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  const cls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {textarea ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cls}
        />
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

  function handleChange(name: keyof DadosEntrevista, value: string) {
    setDados((prev) => ({ ...prev, [name]: value }));
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

      // 4. Disparar Edge Function
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

            <Field label="Nome artístico" name="nome_artistico" value={dados.nome_artistico} onChange={handleChange} required placeholder="Ex: Banda Ravel, Foto Ana Lima..." />

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
              <Field label="WhatsApp" name="whatsapp" value={dados.whatsapp} onChange={handleChange} placeholder="(11) 99999-9999" />
              <Field label="E-mail" name="email" value={dados.email} onChange={handleChange} type="email" placeholder="contato@..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade base" name="cidade_base" value={dados.cidade_base} onChange={handleChange} placeholder="São Paulo - SP" />
              <Field label="Instagram" name="instagram" value={dados.instagram} onChange={handleChange} placeholder="@usuario" />
            </div>
          </section>

          {/* Experiência */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Experiência e posicionamento</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Anos de experiência" name="anos_experiencia" value={dados.anos_experiencia} onChange={handleChange} placeholder="Ex: 8 anos" required />
              <Field label="Nº aproximado de casamentos" name="numero_casamentos" value={dados.numero_casamentos} onChange={handleChange} placeholder="Ex: 200+" />
            </div>

            <Field label="Especialidade / nicho" name="especialidade" value={dados.especialidade} onChange={handleChange} textarea placeholder="Ex: casamentos na natureza, fotojornalismo, música ao vivo MPB..." required />

            <Field label="Ticket médio (R$)" name="preco_medio" value={dados.preco_medio} onChange={handleChange} placeholder="Ex: R$ 8.000 a R$ 15.000" />

            <Field label="Formação / certificações" name="formacao" value={dados.formacao} onChange={handleChange} textarea placeholder="Cursos, workshops, especializações..." />
          </section>

          {/* Diferenciais */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Diferenciais e estilo</h3>

            <Field label="Equipamentos / recursos principais" name="equipamentos" value={dados.equipamentos} onChange={handleChange} textarea placeholder="Ex: câmeras Sony, iluminação LED, carro de apoio..." />

            <Field label="Principais diferenciais" name="diferenciais" value={dados.diferenciais} onChange={handleChange} textarea required placeholder="O que faz este profissional ser único? Seja específico." />

            <Field label="Estilo / forma de trabalho" name="estilo_trabalho" value={dados.estilo_trabalho} onChange={handleChange} textarea required placeholder="Como ele conduz o dia? Como é a relação com os noivos?" />
          </section>

          {/* Storytelling */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Storytelling e conexão emocional</h3>

            <Field label="Depoimento / feedback favorito de clientes" name="depoimento_favorito" value={dados.depoimento_favorito} onChange={handleChange} textarea placeholder="O que os noivos mais falam depois do casamento?" />

            <Field label="Momentos especiais / casos que marcaram" name="momentos_especiais" value={dados.momentos_especiais} onChange={handleChange} textarea placeholder="Uma história ou situação marcante no trabalho..." />

            <Field label="Como os noivos costumam encontrá-lo" name="como_conheceu_noivos" value={dados.como_conheceu_noivos} onChange={handleChange} textarea placeholder="Indicação, Instagram, feiras, Google..." />

            <Field label="Informações adicionais" name="informacoes_adicionais" value={dados.informacoes_adicionais} onChange={handleChange} textarea placeholder="Qualquer outra informação relevante para o roteiro..." />
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60"
          >
            {loading ? "Processando..." : "Salvar e cadastrar prestador"}
          </button>
        </form>
      </main>
    </div>
  );
}
