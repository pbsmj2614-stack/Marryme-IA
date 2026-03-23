import { redirect, notFound } from "next/navigation";
import type { Prestador } from "@/lib/types";
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

  const { data: entrevista } = await supabase
    .from("entrevistas")
    .select("id, dados_json")
    .eq("prestador_id", id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (!entrevista) notFound();

  const p = prestador as Prestador;

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800">Editar entrevista</h2>
          <p className="text-sm text-gray-500 mt-1">
            {p.nome_artistico} — altere as informações para melhorar a geração do roteiro
          </p>
        </div>
        <EditarEntrevistaForm
          prestadorId={id}
          entrevistaId={entrevista.id}
          initialData={entrevista.dados_json}
        />
      </main>
    </div>
  );
}
