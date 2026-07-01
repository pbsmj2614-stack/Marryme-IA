/**
 * Resolução de aba de cliente no Google Sheets — escolhe a aba com mais tarefas
 * e prefixo MM correto (cohort MM044+).
 */

import { getAbaIdPrefixFromTitle, normalizeMmId } from "@/lib/sheets-cadastro";
import type { TarefaSheet } from "@/lib/sheets";

/** Coleta todas as abas candidatas para um cliente. */
export function collectAbaCandidates(
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined,
  todasAbas: string[],
  abasClientes: string[]
): string[] {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const abasPorPrefixo = abasClientes.filter((a) => getAbaIdPrefixFromTitle(a) === idNorm);
  const raw = [existente, abaEncontrada, ...abasPorPrefixo];
  return Array.from(new Set(raw.filter((a): a is string => !!a && todasAbas.includes(a))));
}

/** Pontua aba: +1000 prefixo correto, +100 match encontrarAba, +count tarefas. */
export function scoreSheetsAba(
  aba: string,
  idCliente: string,
  abaEncontrada: string | null,
  tarefasPorAba: Record<string, TarefaSheet[]>
): number {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  let score = tarefasPorAba[aba]?.length ?? 0;
  if (getAbaIdPrefixFromTitle(aba) === idNorm) score += 1000;
  if (abaEncontrada && aba === abaEncontrada) score += 100;
  return score;
}

/** Escolhe a aba com maior score entre candidatos. */
export function resolveSheetsAba(
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined,
  todasAbas: string[],
  abasClientes: string[],
  tarefasPorAba: Record<string, TarefaSheet[]>
): string | null {
  const candidatos = collectAbaCandidates(
    idCliente,
    abaEncontrada,
    existente,
    todasAbas,
    abasClientes
  );
  if (candidatos.length === 0) return null;

  let best = candidatos[0];
  let bestScore = -1;
  for (const aba of candidatos) {
    const s = scoreSheetsAba(aba, idCliente, abaEncontrada, tarefasPorAba);
    if (s > bestScore) {
      bestScore = s;
      best = aba;
    }
  }
  return best;
}
