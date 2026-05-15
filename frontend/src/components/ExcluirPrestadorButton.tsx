"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { excluirPrestadorAction } from "@/app/prestador/[id]/actions";
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
      const result = await excluirPrestadorAction(prestadorId);
      if (result.ok) {
        toast.success("Prestador excluído com sucesso!");
        // window.location bypassa o React Router e evita que o Next.js
        // re-renderize a página atual (que chamaria notFound() pois o
        // prestador já foi deletado)
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
