"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { exportarDocumento, type TipoExport } from "@/lib/exportDocx";
import type { Prestador, Roteiro } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
  tipo: TipoExport;
  variant?: "primary" | "outline" | "icon";
  prestador: Pick<Prestador, "nome_artistico" | "categoria">;
  roteiro?: Roteiro;
  roteiroId?: string;
}

const LABEL: Record<TipoExport, string> = {
  completo: "Exportar .docx",
  analise: "Exportar análise",
  roteiro: "Exportar roteiro",
  anuncios: "Exportar anúncios",
  direcao: "Exportar direção",
};

export default function ExportarButton({
  tipo,
  variant = "outline",
  prestador,
  roteiro,
  roteiroId,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      let roteiroFinal = roteiro;
      if (!roteiroFinal) {
        if (!roteiroId) throw new Error("Nenhum roteiro disponível.");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("roteiros")
          .select("*")
          .eq("id", roteiroId)
          .single();
        if (error || !data) throw new Error("Roteiro não encontrado.");
        roteiroFinal = data as Roteiro;
      }
      await exportarDocumento(tipo, prestador, roteiroFinal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar.");
    } finally {
      setLoading(false);
    }
  }

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={loading}
        title={LABEL[tipo]}
        className="h-8 w-8"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
    );
  }

  if (variant === "outline") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        className="text-xs h-8 text-primary border-primary/30 hover:bg-primary/5"
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        )}
        {loading ? "Gerando..." : LABEL[tipo]}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {loading ? "Gerando..." : LABEL[tipo]}
    </Button>
  );
}
