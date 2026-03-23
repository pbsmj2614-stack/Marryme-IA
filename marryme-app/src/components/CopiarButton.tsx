"use client";

import { useState } from "react";

export default function CopiarButton({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button
      onClick={copiar}
      className="text-xs text-gray-400 hover:text-brand-600 transition font-medium"
    >
      {copiado ? "✓ Copiado!" : "Copiar"}
    </button>
  );
}
