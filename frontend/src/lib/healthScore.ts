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

export type StatusSaude = "Em risco" | "Em atenção" | "Saudável" | "Concluído";

export function getStatusFromScore(score: number): StatusSaude {
  if (score === 100) return "Concluído";
  if (score >= 70) return "Saudável";
  if (score >= 50) return "Em atenção";
  return "Em risco";
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "#22c55e"; // verde
  if (score >= 50) return "#eab308"; // amarelo
  return "#ef4444"; // vermelho
}
