"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  placeholder?: string;
  paramName?: string;
  className?: string;
}

export default function SearchInput({
  placeholder = "Buscar...",
  paramName = "q",
  className = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [valor, setValor] = useState(searchParams.get(paramName) ?? "");

  const pushURL = useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v.trim()) {
        params.set(paramName, v.trim());
      } else {
        params.delete(paramName);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, paramName]
  );

  useEffect(() => {
    const t = setTimeout(() => pushURL(valor), 300);
    return () => clearTimeout(t);
  }, [valor, pushURL]);

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition w-full"
      />
      {valor && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setValor("")}
          aria-label="Limpar busca"
          className="absolute right-1 h-6 w-6 text-gray-300 hover:text-gray-500 hover:bg-transparent"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
