import { describe, it, expect } from "vitest";
import {
  isPrazoVencido,
  formatDate,
  planoBadgeClass,
  planoLabel,
  isStatusAtivo,
  dedupClientesByNome,
  dedupTarefas,
} from "../client-utils";

describe("isPrazoVencido", () => {
  it("retorna false se prazo é null", () => {
    expect(isPrazoVencido(null, "Em andamento")).toBe(false);
  });

  it("retorna false se status é Finalizado", () => {
    expect(isPrazoVencido("2000-01-01", "Finalizado")).toBe(false);
  });

  it("retorna true para data no passado com status aberto", () => {
    expect(isPrazoVencido("2000-01-01", "Em andamento")).toBe(true);
  });

  it("retorna false para data no futuro", () => {
    const futuro = new Date();
    futuro.setFullYear(futuro.getFullYear() + 1);
    const iso = futuro.toISOString().split("T")[0];
    expect(isPrazoVencido(iso, "Em andamento")).toBe(false);
  });
});

describe("formatDate", () => {
  it("retorna — para null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("formata datas no padrão pt-BR dd/mm/aaaa", () => {
    const result = formatDate("2025-06-15");
    expect(result).toMatch(/15\/06\/2025/);
  });
});

describe("planoBadgeClass", () => {
  it("retorna classe de essencial", () => {
    expect(planoBadgeClass("essencial")).toContain("pink");
  });

  it("retorna fallback para plano desconhecido", () => {
    expect(planoBadgeClass("inexistente")).toBe("bg-gray-700 text-gray-200");
  });

  it("retorna fallback para null", () => {
    expect(planoBadgeClass(null)).toBe("bg-gray-700 text-gray-200");
  });
});

describe("planoLabel", () => {
  it("capitaliza e traduz planos conhecidos", () => {
    expect(planoLabel("essencial")).toBe("Essencial");
    expect(planoLabel("growth")).toBe("Growth");
    expect(planoLabel("enterprise")).toBe("Enterprise");
  });

  it("retorna o próprio valor para plano desconhecido", () => {
    expect(planoLabel("custom")).toBe("custom");
  });
});

describe("isStatusAtivo", () => {
  it("retorna true para Ativo", () => {
    expect(isStatusAtivo("Ativo")).toBe(true);
  });

  it("retorna false para Pausado", () => {
    expect(isStatusAtivo("Pausado")).toBe(false);
  });

  it("retorna false para Encerrado", () => {
    expect(isStatusAtivo("Encerrado")).toBe(false);
  });

  it("retorna true para null/undefined", () => {
    expect(isStatusAtivo(null)).toBe(true);
    expect(isStatusAtivo(undefined)).toBe(true);
  });
});

describe("dedupClientesByNome", () => {
  it("remove duplicatas mantendo o menor ID", () => {
    const input = [
      { id_cliente: "MM003", nome_empresa: "Festas XYZ" },
      { id_cliente: "MM001", nome_empresa: "Festas XYZ" },
      { id_cliente: "MM005", nome_empresa: "Festas XYZ" },
    ];
    const result = dedupClientesByNome(input);
    expect(result).toHaveLength(1);
    expect(result[0].id_cliente).toBe("MM001");
  });

  it("preserva clientes com nomes distintos", () => {
    const input = [
      { id_cliente: "MM001", nome_empresa: "Alpha" },
      { id_cliente: "MM002", nome_empresa: "Beta" },
    ];
    expect(dedupClientesByNome(input)).toHaveLength(2);
  });

  it("é case-insensitive no nome", () => {
    const input = [
      { id_cliente: "MM001", nome_empresa: "Alpha" },
      { id_cliente: "MM002", nome_empresa: "ALPHA" },
    ];
    const result = dedupClientesByNome(input);
    expect(result).toHaveLength(1);
    expect(result[0].id_cliente).toBe("MM001");
  });
});

describe("dedupTarefas", () => {
  const base = {
    cliente_id: "c1",
    o_que: "Fazer X",
    prazo: "2025-01-01",
    etapa: "Onboarding",
  };

  it("remove duplicata exata", () => {
    expect(dedupTarefas([base, base])).toHaveLength(1);
  });

  it("mantém tarefas com etapas diferentes", () => {
    const t2 = { ...base, etapa: "Renovação" };
    expect(dedupTarefas([base, t2])).toHaveLength(2);
  });

  it("trata null em prazo e etapa corretamente", () => {
    const t1 = { ...base, prazo: null, etapa: null };
    const t2 = { ...base, prazo: null, etapa: null };
    expect(dedupTarefas([t1, t2])).toHaveLength(1);
  });
});
