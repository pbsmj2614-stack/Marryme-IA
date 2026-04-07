"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

interface AprovarButtonProps {
  roteiroId: string;
  aprovadoAtual: boolean;
}

export default function AprovarButton({ roteiroId, aprovadoAtual }: AprovarButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aprovado, setAprovado] = useState(aprovadoAtual);

  async function toggleAprovado() {
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("roteiros")
      .update({ aprovado: !aprovado })
      .eq("id", roteiroId);

    if (!error) {
      setAprovado((v) => !v);
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <button
      onClick={toggleAprovado}
      disabled={loading}
      className={`text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
        aprovado
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-600 hover:bg-brand-100 hover:text-brand-700"
      }`}
    >
      {loading ? "..." : aprovado ? "✓ Aprovado" : "Marcar como aprovado"}
    </button>
  );
}
