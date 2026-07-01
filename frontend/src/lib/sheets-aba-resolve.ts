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

function taskCount(
  aba: string,
  tarefasPorAba: Record<string, TarefaSheet[]>
): number {
  return tarefasPorAba[aba]?.length ?? 0;
}

/** Pontua aba: +1000 prefixo correto, +100 match encontrarAba, +count tarefas. */
export function scoreSheetsAba(
  aba: string,
  idCliente: string,
  abaEncontrada: string | null,
  tarefasPorAba: Record<string, TarefaSheet[]>
): number {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  let score = taskCount(aba, tarefasPorAba);
  if (getAbaIdPrefixFromTitle(aba) === idNorm) score += 1000;
  if (abaEncontrada && aba === abaEncontrada) score += 100;
  return score;
}

/** Escolhe a aba com maior score; prefere abaEncontrada em empate ou quando tem mais tarefas. */
export function resolveSheetsAba(
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined,
  todasAbas: string[],
  abasClientes: string[],
  tarefasPorAba: Record<string, TarefaSheet[]>
): string | null {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
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
    } else if (s === bestScore && aba === abaEncontrada) {
      best = aba;
    }
  }

  // Não troca aba existente por outra com MENOS tarefas (evita regressão pós-reparo)
  if (
    existente &&
    todasAbas.includes(existente) &&
    best !== existente &&
    taskCount(best, tarefasPorAba) < taskCount(existente, tarefasPorAba)
  ) {
    const prefixoExistente = getAbaIdPrefixFromTitle(existente);
    if (prefixoExistente === idNorm) return existente;
  }

  // abaEncontrada com mais tarefas que a escolhida → preferir match por ID/nome
  if (
    abaEncontrada &&
    candidatos.includes(abaEncontrada) &&
    getAbaIdPrefixFromTitle(abaEncontrada) === idNorm &&
    taskCount(abaEncontrada, tarefasPorAba) >= taskCount(best, tarefasPorAba)
  ) {
    return abaEncontrada;
  }

  return best;
}

/** Se deve atualizar sheets_aba no reparo (não regride contagem). */
export function shouldUpdateSheetsAba(
  idCliente: string,
  abaAtual: string | null | undefined,
  abaIdeal: string | null,
  todasAbas: string[],
  tarefasPorAba: Record<string, TarefaSheet[]>
): boolean {
  if (!abaIdeal) return false;
  if (!abaAtual || !todasAbas.includes(abaAtual)) return true;

  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const prefixoAtual = getAbaIdPrefixFromTitle(abaAtual);
  if (prefixoAtual && prefixoAtual !== idNorm) return true;

  if (abaIdeal === abaAtual) return false;

  const atualCount = taskCount(abaAtual, tarefasPorAba);
  const idealCount = taskCount(abaIdeal, tarefasPorAba);
  return idealCount > atualCount;
}
