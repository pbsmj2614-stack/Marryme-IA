import { redirect, notFound } from "next/navigation";
import type { Prestador, DadosEntrevista } from "@/lib/types";
import Header from "@/components/Header";
import EditarEntrevistaForm from "@/components/EditarEntrevistaForm";
import { createSupabaseServer } from "@/lib/supabase-server";

export default async function EditarPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Busca entrevista — pode não existir para prestadores antigos
  const { data: entrevista } = await supabase
    .from("entrevistas")
    .select("id, dados_json")
    .eq("prestador_id", id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const p = prestador as Prestador;

  // Monta dados iniciais: entrevista existente ou campos básicos do prestador
  const initialData: DadosEntrevista = {
    nome_artistico:        p.nome_artistico ?? "",
    categoria:             p.categoria      ?? "musico",
    whatsapp:              p.whatsapp       ?? "",
    email:                 p.email          ?? "",
    cidade_base:           p.cidade_base    ?? "",
    instagram:             p.instagram      ?? "",
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
    plano:          "Essencial",
    fase_projeto:   "Onboarding",
    responsavel_mm: "",
    // Sobrescreve com dados da entrevista se existir
    ...(entrevista?.dados_json ?? {}),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{p.nome_artistico}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {entrevista ? "Atualize os dados para melhorar a geração do roteiro." : "Preencha os dados para habilitar a geração de roteiros."}
          </p>
        </div>
        <EditarEntrevistaForm
          prestadorId={id}
          entrevistaId={entrevista?.id ?? null}
          initialData={initialData}
        />
      </main>
    </div>
  );
}
