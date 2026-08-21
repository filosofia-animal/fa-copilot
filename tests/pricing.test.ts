import { describe, it, expect } from "vitest";
import { calculateCostUsd, getModelRates, MODEL_RATES } from "../src/server/pricing";
import type { CopilotTokenUsage } from "../src/types";

const sinUso: CopilotTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

describe("calculateCostUsd", () => {
  it("cobra cada tipo de token a su tarifa", () => {
    const rates = MODEL_RATES["claude-sonnet-4-6"];
    const costo = calculateCostUsd("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(costo).toBe(rates.input);
  });

  it("cobra la lectura de caché mucho más barata que el input", () => {
    // Es la razón de ser de toda la arquitectura de dos niveles: si esto se
    // invirtiera, el modelo de costos que sostiene el diseño sería falso.
    const conCache = calculateCostUsd("claude-sonnet-4-6", {
      ...sinUso,
      cacheReadTokens: 10_000,
    });
    const sinCache = calculateCostUsd("claude-sonnet-4-6", {
      ...sinUso,
      inputTokens: 10_000,
    });
    expect(conCache).toBeLessThan(sinCache / 5);
  });

  it("no cobra nada si no se usó nada", () => {
    expect(calculateCostUsd("claude-sonnet-4-6", sinUso)).toBe(0);
  });

  it("redondea a los 6 decimales que guarda la columna", () => {
    const costo = calculateCostUsd("claude-sonnet-4-6", { ...sinUso, inputTokens: 1 });
    expect(costo).toBe(Number(costo.toFixed(6)));
  });
});

describe("getModelRates", () => {
  it("devuelve la tarifa de un modelo tabulado", () => {
    expect(getModelRates("claude-sonnet-4-6")).toEqual(MODEL_RATES["claude-sonnet-4-6"]);
  });

  it("ante un modelo desconocido asume el más caro, para no subestimar el gasto", () => {
    // Subestimar el costo desactiva el corte por presupuesto sin avisar: es
    // mejor que un modelo nuevo se vea más caro de lo que es.
    const desconocido = getModelRates("claude-modelo-que-no-existe");
    for (const rates of Object.values(MODEL_RATES)) {
      expect(desconocido.input).toBeGreaterThanOrEqual(rates.input);
      expect(desconocido.output).toBeGreaterThanOrEqual(rates.output);
    }
  });
});
