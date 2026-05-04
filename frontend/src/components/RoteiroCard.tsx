"use client";

import { useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoteiroCardProps {
  titulo: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  conteudoCopiar?: string;
  acaoSlot?: React.ReactNode;
}

export default function RoteiroCard({
  titulo,
  children,
  defaultOpen = false,
  conteudoCopiar,
  acaoSlot,
}: RoteiroCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copiado, setCopiado] = useState(false);

  async function copiar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!conteudoCopiar) return;
    await navigator.clipboard.writeText(conteudoCopiar);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition text-left cursor-pointer select-none"
      >
        <span className="font-semibold text-gray-800">{titulo}</span>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Slot para botão Gerar/Refazer */}
          {acaoSlot}

          {/* Botão copiar — só aparece quando há conteúdo */}
          {conteudoCopiar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copiar}
              className="text-xs h-7 px-2.5 rounded-full text-gray-500 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 gap-1"
            >
              {copiado ? (
                <>
                  <Check className="w-3 h-3" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copiar
                </>
              )}
            </Button>
          )}

          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {open && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
