"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { extractFunctionError } from "@/lib/error-utils";
import { Button } from "@/components/ui/button";

type Secao = "analise_estrategica" | "roteiro_sugerido" | "copy_anuncios" | "direcao_criativa";

interface Props {
  entrevistaId: string;
  roteiroId?: string;
  secao: Secao;
  modo: "gerar" | "refazer";
}

const LABEL: Record<Secao, string> = {
  analise_estrategica: "Análise Estratégica",
  roteiro_sugerido: "Roteiro de Vídeo",
  copy_anuncios: "Roteiro Para Anúncios",
  direcao_criativa: "Direção Criativa",
};

export default function GerarSecaoButton({ entrevistaId, roteiroId, secao, modo }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke("gerar-roteiro", {
        body: { entrevista_id: entrevistaId, secao, roteiro_id: roteiroId },
      });
      if (error) {
        toast.error(await extractFunctionError(error, "Erro ao gerar seção"));
        return;
      }
      void data;
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado ao chamar Edge Function");
    } finally {
      setLoading(false);
    }
  }

  if (modo === "refazer") {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={loading}
          className="rounded-full h-7 text-xs"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              Refazer
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-muted-foreground">Esta seção ainda não foi gerada.</p>
      <Button onClick={handleClick} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Gerando (~30s)...
          </>
        ) : (
          <>
            <Plus className="mr-2 h-4 w-4" />
            Gerar {LABEL[secao]}
          </>
        )}
      </Button>
    </div>
  );
}
