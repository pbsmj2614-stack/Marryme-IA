/**
 * healthScore.ts — Cálculo de score de saúde por cliente
 *
 * score = Math.round((tarefas_finalizadas / total_tarefas) * 100)
 * Se total_tarefas = 0, retorna 0.
 *
 * Faixas:
 *   0–49   → "Em risco"
 *   50–69  → "Em atenção"
 *   70–99  → "Saudável"
 *   100    → "Concluído"
 */

import { createClient } from "@/lib/supabase";

export type StatusSaude = "Em risco" | "Em atenção" | "Saudável" | "Concluído";

export function getStatusFromScore(score: number): StatusSaude {
  if (score === 100) return "Concluído";
  if (score >= 70)   return "Saudável";
  if (score >= 50)   return "Em atenção";
  return "Em risco";
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "#22c55e"; // verde
  if (score >= 50) return "#eab308"; // amarelo
  return "#ef4444";                  // vermelho
}

/**
 * Calcula o score de um único cliente buscando suas tarefas no Supabase.
 */
export async function calcularScore(clienteId: string): Promise<number> {
  const supabase = createClient();

  const { data: tarefas, error } = await supabase
    .from("mm_tarefas")
    .select("status")
    .eq("cliente_id", clienteId);

  if (error || !tarefas || tarefas.length === 0) return 0;

  const finalizadas = tarefas.filter((t) => t.status === "Finalizado").length;
  return Math.round((finalizadas / tarefas.length) * 100);
}

/**
 * Calcula scores de todos os clientes em uma única query.
 * Retorna { MM001: 85, MM002: 42, ... }
 */
export async function calcularTodosScores(): Promise<Record<string, number>> {
  const supabase = createClient();

  const { data: tarefas, error } = await supabase
    .from("mm_tarefas")
    .select("cliente_id, status");

  if (error || !tarefas) return {};

  // Agrupa por cliente_id
  const agrupado: Record<string, { total: number; finalizadas: number }> = {};

  for (const t of tarefas) {
    if (!t.cliente_id) continue;
    if (!agrupado[t.cliente_id]) {
      agrupado[t.cliente_id] = { total: 0, finalizadas: 0 };
    }
    agrupado[t.cliente_id].total++;
    if (t.status === "Finalizado") {
      agrupado[t.cliente_id].finalizadas++;
    }
  }

  const scores: Record<string, number> = {};
  for (const [id, { total, finalizadas }] of Object.entries(agrupado)) {
    scores[id] = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
  }

  return scores;
}

/**
 * Retorna score + status para um conjunto de clientes.
 * Útil para o dashboard — evita N queries.
 */
export async function calcularMetricasTodosClientes(): Promise<
  Record<string, { score: number; status: StatusSaude }>
> {
  const scores = await calcularTodosScores();
  const resultado: Record<string, { score: number; status: StatusSaude }> = {};

  for (const [id, score] of Object.entries(scores)) {
    resultado[id] = { score, status: getStatusFromScore(score) };
  }

  return resultado;
}
