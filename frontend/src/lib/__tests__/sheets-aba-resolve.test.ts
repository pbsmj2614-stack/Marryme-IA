import { describe, expect, it } from "vitest";
import { resolveSheetsAba } from "@/lib/sheets-aba-resolve";
import type { TarefaSheet } from "@/lib/sheets";

describe("resolveSheetsAba", () => {
  const tarefas = (n: number): TarefaSheet[] =>
    Array.from({ length: n }, (_, i) => ({
      check_feito: false,
      etapa: "E",
      o_que: `Tarefa ${i}`,
      tipo: "Marry Me",
      quem: "X",
      prazo: "01/01/2026",
      status: "Não iniciado",
      observacoes: "",
    }));

  it("prefere aba com mais tarefas mesmo se existente tiver algumas", () => {
    const porAba: Record<string, TarefaSheet[]> = {
      MM062_stale: tarefas(1),
      MM062_Rafa: tarefas(10),
    };
    const result = resolveSheetsAba(
      "MM062",
      "MM062_Rafa",
      "MM062_stale",
      ["MM062_stale", "MM062_Rafa"],
      ["MM062_stale", "MM062_Rafa"],
      porAba
    );
    expect(result).toBe("MM062_Rafa");
  });

  it("MM050+ mantém aba do próprio prefixo mesmo se outra aba tiver mais tarefas no lote", () => {
    const porAba: Record<string, TarefaSheet[]> = {
      MM050_Cliente: tarefas(0),
      MM058_Cliente: tarefas(12),
    };
    const result = resolveSheetsAba(
      "MM050",
      "MM050_Cliente",
      "MM050_Cliente",
      ["MM050_Cliente", "MM058_Cliente"],
      ["MM050_Cliente", "MM058_Cliente"],
      porAba,
      "Cliente"
    );
    expect(result).toBe("MM050_Cliente");
  });

  it("MM050+ com lote vazio prefere abaEncontrada com prefixo correto", () => {
    const porAba: Record<string, TarefaSheet[]> = {
      MM051_Ana: tarefas(0),
      MM058_Outro: tarefas(0),
    };
    const result = resolveSheetsAba(
      "MM051",
      "MM051_Ana",
      "MM058_Outro",
      ["MM051_Ana", "MM058_Outro"],
      ["MM051_Ana", "MM058_Outro"],
      porAba,
      "Ana"
    );
    expect(result).toBe("MM051_Ana");
  });
});
