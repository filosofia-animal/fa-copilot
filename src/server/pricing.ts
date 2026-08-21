/**
 * Tarifas de la API de Anthropic, en USD por millón de tokens.
 *
 * Se usan para calcular el costo de cada consulta en cada consulta, que es lo
 * que alimenta el presupuesto mensual y el corte automático. Si cambian las
 * tarifas o se cambia de modelo, se actualiza acá y el gasto histórico queda
 * como estaba (el costo se guarda calculado, no se recalcula).
 *
 * Fuente: precios de lista de la API de Anthropic, agosto 2026.
 */

export type ModelRates = {
  /** Tokens de entrada sin cachear. */
  input: number;
  /** Tokens generados. */
  output: number;
  /** Lectura de caché: ~10% del input. */
  cacheRead: number;
  /** Escritura de caché con TTL de 5 minutos: ~125% del input. */
  cacheWrite: number;
};

export const MODEL_RATES: Record<string, ModelRates> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** Si el modelo no está tabulado, se asume el más caro para no subestimar el gasto. */
const FALLBACK_RATES: ModelRates = MODEL_RATES["claude-opus-5"];

import type { CopilotTokenUsage } from "../types";

/** @deprecated usá CopilotTokenUsage. Se mantiene por compatibilidad. */
export type TokenUsage = CopilotTokenUsage;

export function getModelRates(model: string): ModelRates {
  return MODEL_RATES[model] ?? FALLBACK_RATES;
}

/** Costo en USD de una consulta, redondeado a 6 decimales (lo que guarda la columna). */
export function calculateCostUsd(model: string, usage: CopilotTokenUsage): number {
  const rates = getModelRates(model);
  const cost =
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheCreationTokens * rates.cacheWrite) /
    1_000_000;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
