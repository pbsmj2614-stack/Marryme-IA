"use client";

import { useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  function handleExcluir() {
    startTransition(async () => {
      // Usa fetch (Route Handler) em vez de Server Action para evitar o
      // auto router.refresh() que o Next.js dispara após Server Actions com
      // revalidatePath — esse refresh re-renderiza a página atual antes da
      // navegação completar, causando notFound() → 404.
      const res = await fetch(`/api/prestadores/${prestadorId}`, { method: "DELETE" });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && result.ok) {
        toast.success("Prestador excluído com sucesso!");
        window.location.replace("/");
      } else {
        toast.error("Erro ao excluir: " + (result.error ?? "erro desconhecido"));
      }
    });
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
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleExcluir}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
