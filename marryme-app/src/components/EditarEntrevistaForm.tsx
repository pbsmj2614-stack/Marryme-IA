"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { DadosEntrevista } from "@/lib/types";

function Field({
  label, name, value, onChange, textarea = false, required = false, placeholder = "",
}: {
  label: string; name: keyof DadosEntrevista; value: string;
  onChange: (name: keyof DadosEntrevista, val: string) => void;
  textarea?: boolean; required?: boolean; placeholder?: string;
}) {
  const cls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {textarea ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder} required={required} className={cls} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder} required={required} className={cls} />
      )}
    </div>
  );
}

export default function EditarEntrevistaForm({
  prestadorId,
  entrevistaId,
  initialData,
}: {
  prestadorId: string;
  entrevistaId: string;
  initialData: DadosEntrevista;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosEntrevista>(initialData);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  function handleChange(name: keyof DadosEntrevista, value: string) {
    setDados((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("entrevistas")
      .update({ dados_json: dados })
      .eq("id", entrevistaId);
    if (error) {
      setErro("Erro ao salvar. Tente novamente.");
      setLoading(false);
      return;
    }
    router.push(`/prestador/${prestadorId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Dados básicos</h3>
        <Field label="Nome artístico" name="nome_artistico" value={dados.nome_artistico} onChange={handleChange} required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="WhatsApp" name="whatsapp" value={dados.whatsapp} onChange={handleChange} placeholder="(11) 99999-9999" />
          <Field label="E-mail" name="email" value={dados.email} onChange={handleChange} placeholder="contato@..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cidade base" name="cidade_base" value={dados.cidade_base} onChange={handleChange} placeholder="São Paulo - SP" />
          <Field label="Instagram" name="instagram" value={dados.instagram} onChange={handleChange} placeholder="@usuario" />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Experiência e posicionamento</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Anos de experiência" name="anos_experiencia" value={dados.anos_experiencia} onChange={handleChange} required placeholder="Ex: 8 anos" />
          <Field label="Nº aproximado de casamentos" name="numero_casamentos" value={dados.numero_casamentos} onChange={handleChange} placeholder="Ex: 200+" />
        </div>
        <Field label="Especialidade / nicho" name="especialidade" value={dados.especialidade} onChange={handleChange} textarea required placeholder="Ex: casamentos na natureza, fotojornalismo..." />
        <Field label="Ticket médio (R$)" name="preco_medio" value={dados.preco_medio} onChange={handleChange} placeholder="Ex: R$ 8.000 a R$ 15.000" />
        <Field label="Formação / certificações" name="formacao" value={dados.formacao} onChange={handleChange} textarea placeholder="Cursos, workshops, especializações..." />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Diferenciais e estilo</h3>
        <Field label="Equipamentos / recursos principais" name="equipamentos" value={dados.equipamentos} onChange={handleChange} textarea placeholder="Ex: câmeras Sony, iluminação LED..." />
        <Field label="Principais diferenciais" name="diferenciais" value={dados.diferenciais} onChange={handleChange} textarea required placeholder="O que faz este profissional ser único?" />
        <Field label="Estilo / forma de trabalho" name="estilo_trabalho" value={dados.estilo_trabalho} onChange={handleChange} textarea required placeholder="Como ele conduz o dia? Como é a relação com os noivos?" />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Storytelling e conexão emocional</h3>
        <Field label="Depoimento / feedback favorito de clientes" name="depoimento_favorito" value={dados.depoimento_favorito} onChange={handleChange} textarea placeholder="O que os noivos mais falam depois do casamento?" />
        <Field label="Momentos especiais / casos que marcaram" name="momentos_especiais" value={dados.momentos_especiais} onChange={handleChange} textarea placeholder="Uma história ou situação marcante no trabalho..." />
        <Field label="Como os noivos costumam encontrá-lo" name="como_conheceu_noivos" value={dados.como_conheceu_noivos} onChange={handleChange} textarea placeholder="Indicação, Instagram, feiras, Google..." />
        <Field label="Informações adicionais" name="informacoes_adicionais" value={dados.informacoes_adicionais} onChange={handleChange} textarea placeholder="Qualquer outra informação relevante para o roteiro..." />
      </section>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{erro}</div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar alterações"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/prestador/${prestadorId}`)}
          className="px-6 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
