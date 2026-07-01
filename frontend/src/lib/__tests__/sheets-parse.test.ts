import { describe, expect, it } from "vitest";
import { detectTaskColumnLayout, parseTarefasValues, alignTaskSheetRows } from "@/lib/sheets";

/** Fixture B:I — layout PlanilhaModelo (col A vazia, Check em B). */
function fixtureLayoutBI(): string[][] {
  return [
    ["", "Campanha 2026 | Cliente Teste"],
    ["", "Check", "Etapa", "O que?", "Tipo", "Quem?", "Prazo", "Status", "Observações"],
    ["", "TRUE", "Organização", "Pegar Acesso da BM", "Marry Me", "Kauê", "10/06/2026", "Não iniciado", ""],
    ["", "TRUE", "Organização", "Configurar a BM", "Marry Me", "Kauê", "11/06/2026", "Não iniciado", ""],
    ["", "FALSE", "Preparação", "Desenvolver proposta em PDF", "Marry Me", "Consolo", "15/06/2026", "Não iniciado", ""],
  ];
}

describe("detectTaskColumnLayout", () => {
  it("detecta Check em B e O que? em D", () => {
    const layout = detectTaskColumnLayout(fixtureLayoutBI());
    expect(layout.hasCheckHeader).toBe(true);
    expect(layout.checkCol).toBe(1);
    expect(layout.oQueCol).toBe(3);
    expect(layout.etapaCol).toBe(2);
  });
});

describe("parseTarefasValues", () => {
  it("conta 3 tarefas pelo O que? e 2 concluídas via checkbox", () => {
    const tarefas = parseTarefasValues(fixtureLayoutBI());
    expect(tarefas).toHaveLength(3);
    expect(tarefas.filter((t) => t.check_feito)).toHaveLength(2);
    expect(tarefas[0].o_que).toBe("Pegar Acesso da BM");
    expect(tarefas[2].check_feito).toBe(false);
  });

  it("ignora coluna Status para conclusão (sempre Não iniciado na planilha)", () => {
    const tarefas = parseTarefasValues(fixtureLayoutBI());
    const concluidas = tarefas.filter((t) => t.check_feito);
    expect(concluidas.every((t) => t.status === "Não iniciado")).toBe(true);
  });

  it("parseia quando linhas de dados omitem coluna A vazia do cabeçalho", () => {
    const misaligned = [
      ["", "Check", "Etapa", "O que?", "Tipo", "Quem?", "Prazo", "Status", "Observações"],
      ["TRUE", "Organização", "Pegar Acesso da BM", "Marry Me", "Kauê", "10/06/2026", "Não iniciado", ""],
      ["FALSE", "Preparação", "Configurar a BM", "Marry Me", "Kauê", "11/06/2026", "Não iniciado", ""],
    ];
    const aligned = alignTaskSheetRows(misaligned);
    expect(aligned[1][0]).toBe("");
    expect(aligned[1][3]).toBe("Pegar Acesso da BM");
    const tarefas = parseTarefasValues(misaligned);
    expect(tarefas.length).toBeGreaterThanOrEqual(1);
    expect(tarefas[0].o_que).toBe("Pegar Acesso da BM");
  });

  it("parseia aba lida só em B:I (sem coluna A)", () => {
    const biOnly = [
      ["Check", "Etapa", "O que?", "Tipo", "Quem?", "Prazo", "Status", "Obs"],
      ["TRUE", "Organização", "Pegar Acesso da BM", "Marry Me", "Kauê", "10/06/2026", "Não iniciado", ""],
      ["FALSE", "Preparação", "Configurar a BM", "Marry Me", "Paulo", "11/06/2026", "Não iniciado", ""],
    ];
    const tarefas = parseTarefasValues(biOnly);
    expect(tarefas).toHaveLength(2);
    expect(tarefas[0].o_que).toBe("Pegar Acesso da BM");
  });

  it("tolera cabeçalho O Que sem interrogação", () => {
    const headerVariant = [
      ["", "Check", "Etapa", "O Que", "Tipo", "Quem", "Prazo", "Status", "Obs"],
      ["", "FALSE", "Prep", "Montar campanha", "Marry Me", "Ana", "01/07/2026", "Não iniciado", ""],
    ];
    const tarefas = parseTarefasValues(headerVariant);
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].o_que).toBe("Montar campanha");
  });
});
