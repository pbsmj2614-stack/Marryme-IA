"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { extractFunctionError } from "@/lib/error-utils";
import { Button } from "@/components/ui/button";

export default function RefazerRoteiroButton({ entrevistaId }: { entrevistaId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRefazer() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-roteiro", {
        body: { entrevista_id: entrevistaId },
      });
      if (fnError) {
        toast.error(await extractFunctionError(fnError, "Erro ao gerar roteiro"));
        return;
      }
      if (!fnData?.roteiro) {
        toast.error(fnData?.error ?? "Roteiro não retornado. Tente novamente.");
        return;
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={handleRefazer} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Gerando...
          </>
        ) : (
          <>
            <RefreshCw className="mr-1 h-3 w-3" />
            Refazer roteiro
          </>
        )}
      </Button>
      {loading && <p className="text-xs text-muted-foreground">Aguarde ~30 segundos...</p>}
    </div>
  );
}
