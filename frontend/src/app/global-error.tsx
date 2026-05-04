"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
          <p className="text-gray-500 text-sm mb-6">
            Um erro inesperado ocorreu. Nossa equipe foi notificada.
          </p>
          <Button onClick={() => window.location.reload()}>Recarregar página</Button>
        </div>
      </body>
    </html>
  );
}
