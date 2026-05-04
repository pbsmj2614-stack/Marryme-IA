"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintButton() {
  return (
    <Button
      onClick={() => window.print()}
      className="bg-gray-900 hover:bg-gray-800 text-white gap-1.5"
    >
      <Printer className="w-4 h-4" />
      Imprimir / PDF
    </Button>
  );
}
