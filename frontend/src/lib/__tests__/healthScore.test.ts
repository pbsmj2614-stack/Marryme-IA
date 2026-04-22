import { describe, it, expect } from "vitest";
import { getStatusFromScore, getScoreColor } from "../healthScore";

describe("getStatusFromScore", () => {
  it("retorna Concluído para 100", () => {
    expect(getStatusFromScore(100)).toBe("Concluído");
  });

  it("retorna Saudável para 70–99", () => {
    expect(getStatusFromScore(70)).toBe("Saudável");
    expect(getStatusFromScore(85)).toBe("Saudável");
    expect(getStatusFromScore(99)).toBe("Saudável");
  });

  it("retorna Em atenção para 50–69", () => {
    expect(getStatusFromScore(50)).toBe("Em atenção");
    expect(getStatusFromScore(60)).toBe("Em atenção");
    expect(getStatusFromScore(69)).toBe("Em atenção");
  });

  it("retorna Em risco para 0–49", () => {
    expect(getStatusFromScore(0)).toBe("Em risco");
    expect(getStatusFromScore(25)).toBe("Em risco");
    expect(getStatusFromScore(49)).toBe("Em risco");
  });
});

describe("getScoreColor", () => {
  it("retorna verde para score >= 70", () => {
    expect(getScoreColor(70)).toBe("#22c55e");
    expect(getScoreColor(100)).toBe("#22c55e");
  });

  it("retorna amarelo para score 50–69", () => {
    expect(getScoreColor(50)).toBe("#eab308");
    expect(getScoreColor(69)).toBe("#eab308");
  });

  it("retorna vermelho para score < 50", () => {
    expect(getScoreColor(0)).toBe("#ef4444");
    expect(getScoreColor(49)).toBe("#ef4444");
  });
});
