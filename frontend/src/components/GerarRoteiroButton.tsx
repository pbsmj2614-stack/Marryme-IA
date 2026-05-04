"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { extractFunctionError } from "@/lib/error-utils";
import { Button } from "@/components/ui/button";

export default function GerarRoteiroButton({ entrevistaId }: { entrevistaId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGerar() {
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
      toast.error(err instanceof Error ? err.message : "Erro inesperado ao chamar Edge Function");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={handleGerar} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? "Gerando roteiro..." : "Gerar roteiro completo"}
      </Button>
      {loading && <p className="text-xs text-muted-foreground">Isso pode levar ~30 segundos...</p>}
    </div>
  );
}
