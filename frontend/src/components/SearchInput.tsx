"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

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
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [valor, setValor] = useState(searchParams.get(paramName) ?? "");

  // Debounce: só atualiza a URL 300ms após parar de digitar
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
      <svg
        className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition w-full"
      />
      {valor && (
        <button
          onClick={() => setValor("")}
          className="absolute right-2.5 text-gray-300 hover:text-gray-500 text-base leading-none"
          aria-label="Limpar busca"
        >
          ✕
        </button>
      )}
    </div>
  );
}
