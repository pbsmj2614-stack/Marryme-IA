"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CopiarButton({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copiar}
      className="text-xs text-gray-400 hover:text-brand-600 h-auto py-0.5 px-1.5 gap-1"
    >
      {copiado ? (
        <>
          <Check className="w-3 h-3" />
          Copiado!
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Copiar
        </>
      )}
    </Button>
  );
}
