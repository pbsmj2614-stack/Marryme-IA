/**
 * Resolução de aba de cliente no Google Sheets — escolhe a aba com mais tarefas
 * e prefixo MM correto (cohort MM044+).
 */

import { extractMmNum, getAbaIdPrefixFromTitle, normalizeMmId } from "@/lib/sheets-cadastro";
import type { TarefaSheet } from "@/lib/sheets";

/** MM044+ exige prefixo da aba = id do cadastro (evita roubar aba/tarefas de outro cliente). */
export const MM_ABA_STRICT_PREFIX_MIN = 44;

function abaPrefixMatchesCliente(aba: string, idCliente: string): boolean {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const prefix = getAbaIdPrefixFromTitle(aba);
  return prefix === idNorm;
}

function preferAbaComPrefixoCorreto(
  candidatos: string[],
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined
): string | null {
  const comPrefixo = candidatos.filter((a) => abaPrefixMatchesCliente(a, idCliente));
  if (comPrefixo.length === 0) return null;
  if (abaEncontrada && comPrefixo.includes(abaEncontrada)) return abaEncontrada;
  if (existente && comPrefixo.includes(existente)) return existente;
  return comPrefixo[0];
}

function normalizeNomeKey(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "");
}

/** Aba contém o nome da empresa (ignora prefixo MM###). */
export function abaMatchesNomeEmpresa(aba: string, nomeEmpresa: string): boolean {
  const nomeKey = normalizeNomeKey(nomeEmpresa);
  if (nomeKey.length < 2) return false;
  const abaSemPrefixo = aba.replace(/^MM\d+[-_\s]*/i, "");
  const abaKey = normalizeNomeKey(abaSemPrefixo);
  if (abaKey.length < 3) return false;
  return abaKey.includes(nomeKey) || nomeKey.includes(abaKey);
}

/** Coleta todas as abas candidatas para um cliente. */
export function collectAbaCandidates(
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined,
  todasAbas: string[],
  abasClientes: string[],
  nomeEmpresa?: string
): string[] {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const abasPorPrefixo = abasClientes.filter((a) => getAbaIdPrefixFromTitle(a) === idNorm);
  const strictPrefix = extractMmNum(idNorm) >= MM_ABA_STRICT_PREFIX_MIN;
  const abasPorNome = nomeEmpresa
    ? abasClientes.filter(
        (a) =>
          abaMatchesNomeEmpresa(a, nomeEmpresa) &&
          (!strictPrefix || abaPrefixMatchesCliente(a, idCliente))
      )
    : [];
  const raw = [existente, abaEncontrada, ...abasPorPrefixo, ...abasPorNome];
  return Array.from(new Set(raw.filter((a): a is string => !!a && todasAbas.includes(a))));
}

function taskCount(
  aba: string,
  tarefasPorAba: Record<string, TarefaSheet[]>
): number {
  return tarefasPorAba[aba]?.length ?? 0;
}

/** Pontua aba: tarefas parseadas dominam; bônus de prefixo só com tarefas > 0. */
export function scoreSheetsAba(
  aba: string,
  idCliente: string,
  abaEncontrada: string | null,
  tarefasPorAba: Record<string, TarefaSheet[]>
): number {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const count = taskCount(aba, tarefasPorAba);
  let score = count * 100;
  if (count > 0 && getAbaIdPrefixFromTitle(aba) === idNorm) score += 1000;
  if (count > 0 && abaEncontrada && aba === abaEncontrada) score += 100;
  return score;
}

/** Escolhe a aba com maior score; prefere abaEncontrada em empate ou quando tem mais tarefas. */
export function resolveSheetsAba(
  idCliente: string,
  abaEncontrada: string | null,
  existente: string | null | undefined,
  todasAbas: string[],
  abasClientes: string[],
  tarefasPorAba: Record<string, TarefaSheet[]>,
  nomeEmpresa?: string
): string | null {
  const idNorm = normalizeMmId(idCliente) ?? idCliente;
  const candidatos = collectAbaCandidates(
    idCliente,
    abaEncontrada,
    existente,
    todasAbas,
    abasClientes,
    nomeEmpresa
  );
  if (candidatos.length === 0) return null;

  const strictPrefix = extractMmNum(idNorm) >= MM_ABA_STRICT_PREFIX_MIN;
  const candidatosEscopo = strictPrefix
    ? candidatos.filter((a) => abaPrefixMatchesCliente(a, idCliente))
    : candidatos;
  if (candidatosEscopo.length === 0) return null;

  const todosLoteVazios = candidatosEscopo.every((a) => taskCount(a, tarefasPorAba) === 0);
  if (todosLoteVazios) {
    return (
      preferAbaComPrefixoCorreto(candidatosEscopo, idCliente, abaEncontrada, existente) ??
      candidatosEscopo[0]
    );
  }

  let best = candidatosEscopo[0];
  let bestScore = -1;
  for (const aba of candidatosEscopo) {
    const s = scoreSheetsAba(aba, idCliente, abaEncontrada, tarefasPorAba);
    if (s > bestScore) {
      bestScore = s;
      best = aba;
    } else if (s === bestScore && aba === abaEncontrada) {
      best = aba;
    }
  }

  // Só troca para aba com tarefas se o prefixo MM for do próprio cliente
  if (taskCount(best, tarefasPorAba) === 0) {
    const comTarefas = candidatosEscopo.filter((a) => taskCount(a, tarefasPorAba) > 0);
    if (comTarefas.length > 0) {
      best = comTarefas.reduce((a, b) =>
        taskCount(a, tarefasPorAba) >= taskCount(b, tarefasPorAba) ? a : b
      );
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
