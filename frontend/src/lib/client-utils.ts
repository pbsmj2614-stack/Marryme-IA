/** Utilitários compartilhados entre pipeline e daily (sem dependências de servidor). */

export function isPrazoVencido(prazo: string | null, status: string): boolean {
  if (!prazo || status === "Finalizado") return false;
  return prazo < new Date().toISOString().split("T")[0];
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

export function formatDateFull(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function planoBadgeClass(plano: string | null): string {
  switch (plano?.toLowerCase()) {
    case "essencial":
      return "bg-pink-900 text-pink-300";
    case "growth":
      return "bg-violet-900 text-violet-300";
    case "enterprise":
      return "bg-amber-900 text-amber-300";
    case "premium":
      return "bg-purple-900 text-purple-300";
    case "trial":
      return "bg-gray-700 text-gray-300";
    default:
      return "bg-gray-700 text-gray-200";
  }
}

export function planoLabel(plano: string): string {
  const map: Record<string, string> = {
    essencial: "Essencial",
    growth: "Growth",
    enterprise: "Enterprise",
    premium: "Premium",
    trial: "Trial",
  };
  return map[plano.toLowerCase()] ?? plano;
}

/** Retorna true se o status do cliente NÃO é Pausado nem Encerrado. */
export function isStatusAtivo(status: string | null | undefined): boolean {
  return !/paus|encerr/i.test(status ?? "");
}

/** Remove clientes duplicados por nome_empresa — mantém o de menor ID (ex: MM001 < MM005). */
export function dedupClientesByNome<T extends { nome_empresa: string; id_cliente: string }>(
  clientes: T[]
): T[] {
  const seen = new Map<string, T>();
  for (const c of clientes) {
    const key = c.nome_empresa.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
    } else {
      const existNum = parseInt(existing.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      const newNum = parseInt(c.id_cliente.replace(/^MM/i, ""), 10) || 999999;
      if (newNum < existNum) seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

/** Remove tarefas duplicadas por combinação de cliente + tarefa + prazo + etapa. */
export function dedupTarefas<
  T extends {
    cliente_id: string;
    o_que: string;
    prazo: string | null;
    etapa: string | null;
  },
>(tarefas: T[]): T[] {
  const seen = new Set<string>();
  return tarefas.filter((t) => {
    const key = `${t.cliente_id}|${t.o_que}|${t.prazo ?? ""}|${t.etapa ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
