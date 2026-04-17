/** Formata número com casas decimais (pt-BR) */
export function fmt(n: number | null | undefined, dec = 0): string {
  const v = n ?? 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Formata valor em Reais (pt-BR) */
export function fmtBRL(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata percentual com 2 casas decimais (pt-BR) */
export function fmtPct(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
