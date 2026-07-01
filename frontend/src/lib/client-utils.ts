/** Utilitários compartilhados entre pipeline e daily (sem dependências de servidor). */

import { normalizeMmId } from "@/lib/sheets-cadastro";

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

/** Mapeia cada id_cliente (incl. duplicatas por nome) para o id canônico (menor MM). */
export function buildClienteIdAliasMap<T extends { nome_empresa: string; id_cliente: string }>(
  clientes: T[]
): Map<string, string> {
  const canonical = dedupClientesByNome(clientes);
  const canonicalIdByNome = new Map(
    canonical.map((c) => [c.nome_empresa.toLowerCase().trim(), c.id_cliente])
  );
  const aliases = new Map<string, string>();
  for (const c of clientes) {
    aliases.set(
      c.id_cliente,
      canonicalIdByNome.get(c.nome_empresa.toLowerCase().trim()) ?? c.id_cliente
    );
  }
  return aliases;
}

/** Mapa id_cliente → cliente canônico (para Daily/Pipeline com duplicatas por nome). */
export function buildClienteLookupMap<T extends { nome_empresa: string; id_cliente: string }>(
  clientes: T[]
): Map<string, T> {
  const canonical = dedupClientesByNome(clientes);
  const byNome = new Map(canonical.map((c) => [c.nome_empresa.toLowerCase().trim(), c]));
  const lookup = new Map<string, T>();
  for (const c of clientes) {
    lookup.set(c.id_cliente, byNome.get(c.nome_empresa.toLowerCase().trim()) ?? c);
  }
  return lookup;
}

/** Prefixo MM### extraído do nome da aba (ex: MM039_Nome → MM039). */
export function getAbaIdPrefix(sheetsAba: string | null | undefined): string | null {
  if (!sheetsAba) return null;
  const m = sheetsAba.trim().match(/^MM[\s_-]*(\d{1,4})/i);
  return m ? normalizeMmId(`MM${m[1]}`) : null;
}

/** IDs de cliente_id a consultar no Supabase (inclui prefixo da aba quando diferente). */
export function clienteIdsForTarefas(
  idCliente: string,
  sheetsAba: string | null | undefined
): string[] {
  const ids = new Set<string>([idCliente]);
  const prefix = getAbaIdPrefix(sheetsAba);
  if (prefix) ids.add(prefix);
  return Array.from(ids);
}

/**
 * Verifica se uma tarefa pertence a um cliente (considera alias por nome e prefixo da aba).
 * Ex: tarefa com cliente_id MM045 aparece no cliente cuja sheets_aba é MM045_Nome.
 */
export function tarefaBelongsToCliente<
  T extends { cliente_id: string },
  C extends { id_cliente: string; sheets_aba?: string | null },
>(tarefa: T, cliente: C, idAliases: Map<string, string>): boolean {
  const tId = tarefa.cliente_id.toUpperCase().trim();
  const cId = cliente.id_cliente.toUpperCase().trim();
  const canonical = (idAliases.get(tarefa.cliente_id) ?? tarefa.cliente_id).toUpperCase().trim();

  if (canonical === cId || tId === cId) return true;

  const abaPrefix = getAbaIdPrefix(cliente.sheets_aba);
  if (abaPrefix && abaPrefix === tId) return true;

  return false;
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
    const key = `${t.cliente_id}|${t.o_que.trim().toLowerCase()}|${t.prazo ?? ""}|${(t.etapa ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Dedup de tarefas já agrupadas no mesmo cliente (ignora cliente_id na chave). */
export function dedupTarefasMerged<
  T extends { o_que: string; prazo: string | null; etapa: string | null },
>(tarefas: T[]): T[] {
  const seen = new Set<string>();
  return tarefas.filter((t) => {
    const key = `${t.o_que.trim().toLowerCase()}|${t.prazo ?? ""}|${(t.etapa ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
