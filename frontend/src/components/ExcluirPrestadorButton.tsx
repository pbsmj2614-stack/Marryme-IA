"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export default function ExcluirPrestadorButton({ prestadorId }: { prestadorId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleExcluir() {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("roteiros").delete().eq("prestador_id", prestadorId);
    await supabase.from("entrevistas").delete().eq("prestador_id", prestadorId);
    const r3 = await supabase.from("prestadores").delete().eq("id", prestadorId);
    if (!r3.error) {
      window.location.href = "/";
    } else {
      toast.error("Erro ao excluir: " + r3.error.message);
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          Excluir prestador
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir prestador?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação é irreversível. Todos os roteiros e entrevistas deste prestador serão
            apagados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleExcluir}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
