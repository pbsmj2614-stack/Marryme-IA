import { describe, it, expect } from "vitest";
import { fmt, fmtBRL, fmtPct } from "../formatters";

describe("fmt", () => {
  it("formata inteiro sem casas decimais", () => {
    expect(fmt(1234)).toBe("1.234");
  });

  it("formata com casas decimais", () => {
    expect(fmt(1234.5, 2)).toBe("1.234,50");
  });

  it("trata null/undefined como 0", () => {
    expect(fmt(null)).toBe("0");
    expect(fmt(undefined)).toBe("0");
  });

  it("trata zero", () => {
    expect(fmt(0)).toBe("0");
  });
});

describe("fmtBRL", () => {
  it("formata valor em reais", () => {
    expect(fmtBRL(1000)).toMatch(/R\$\s*1\.000,00/);
  });

  it("trata null como R$ 0,00", () => {
    expect(fmtBRL(null)).toMatch(/R\$\s*0,00/);
  });

  it("formata centavos corretamente", () => {
    expect(fmtBRL(0.5)).toMatch(/0,50/);
  });
});

describe("fmtPct", () => {
  it("formata percentual com 2 casas", () => {
    expect(fmtPct(12.5)).toBe("12,50%");
  });

  it("trata null como 0,00%", () => {
    expect(fmtPct(null)).toBe("0,00%");
  });

  it("formata 100%", () => {
    expect(fmtPct(100)).toBe("100,00%");
  });
});
