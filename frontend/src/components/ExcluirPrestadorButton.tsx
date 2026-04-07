"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ExcluirPrestadorButton({ prestadorId }: { prestadorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function handleExcluir() {
    setLoading(true);
    const supabase = createClient();
    const r1 = await supabase.from("roteiros").delete().eq("prestador_id", prestadorId);
    const r2 = await supabase.from("entrevistas").delete().eq("prestador_id", prestadorId);
    const r3 = await supabase.from("prestadores").delete().eq("id", prestadorId);
    console.log("roteiros:", r1.error, "entrevistas:", r2.error, "prestador:", r3.error);
    if (!r3.error) {
      router.push("/");
      router.refresh();
    } else {
      alert("Erro ao excluir: " + r3.error.message);
      setLoading(false);
      setConfirmar(false);
    }
  }

  if (confirmar) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Confirmar exclusão?</span>
        <button
          onClick={handleExcluir}
          disabled={loading}
          className="text-sm font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
        >
          {loading ? "Excluindo..." : "Excluir"}
        </button>
        <button
          onClick={() => setConfirmar(false)}
          className="text-sm px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirmar(true)}
      className="text-sm font-medium px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
    >
      Excluir prestador
    </button>
  );
}
