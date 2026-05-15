"use client";

import { useState } from "react";
import { toast } from "sonner";
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
    try {
      const res = await fetch(`/api/prestadores/${prestadorId}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        toast.success("Prestador excluído com sucesso!");
        window.location.replace("/");
      } else {
        toast.error("Erro ao excluir: " + (data.error ?? res.statusText));
        setLoading(false);
      }
    } catch {
      toast.error("Erro de rede ao excluir prestador.");
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
