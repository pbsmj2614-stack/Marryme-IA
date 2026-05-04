"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

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
    <Button
      onClick={toggleAprovado}
      disabled={loading}
      variant="outline"
      size="sm"
      className={`font-semibold transition ${
        aprovado
          ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200 hover:text-green-700"
          : "text-gray-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200"
      }`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : aprovado ? (
        "✓ Aprovado"
      ) : (
        "Marcar como aprovado"
      )}
    </Button>
  );
}
