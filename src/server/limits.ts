/**
 * Los tres frenos del gasto, en orden de costo creciente: primero el kill switch
 * (una lectura), después el rate limit del usuario, y último el presupuesto (que
 * agrega sobre todo el mes). Devuelve null si puede responder.
 */

import type { CopilotBlock, CopilotConfig } from "../types";

/** Primer instante del mes corriente, en UTC. */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkCopilotAvailability(
  config: CopilotConfig,
  userId: string
): Promise<CopilotBlock | null> {
  if (!(await config.settings.isEnabled())) {
    return {
      kind: "disabled",
      message: "El copiloto está desactivado por configuración.",
    };
  }

  const limits = await config.settings.limits();
  const now = Date.now();

  const [hourCount, dayCount] = await Promise.all([
    config.storage.countUsageSince(userId, new Date(now - 60 * 60 * 1000)),
    config.storage.countUsageSince(userId, new Date(now - 24 * 60 * 60 * 1000)),
  ]);

  if (hourCount >= limits.maxPerHour) {
    return {
      kind: "rate_limit",
      message: `Llegaste al límite de ${limits.maxPerHour} consultas por hora. Se libera solo, probá más tarde.`,
    };
  }

  if (dayCount >= limits.maxPerDay) {
    return {
      kind: "rate_limit",
      message: `Llegaste al límite de ${limits.maxPerDay} consultas por día.`,
    };
  }

  const spent = await config.storage.sumCostSince(startOfMonth());

  if (spent >= limits.monthlyBudgetUsd) {
    config.onAlert?.(
      `[COPILOTO] Presupuesto mensual agotado: USD ${spent.toFixed(2)} de USD ${limits.monthlyBudgetUsd}. Queda apagado hasta el mes que viene o hasta que se suba el tope.`
    );
    return {
      kind: "budget",
      message:
        "El copiloto llegó al presupuesto del mes. Un admin puede subir el tope en la configuración.",
    };
  }

  if (spent >= limits.monthlyBudgetUsd * limits.budgetAlertRatio) {
    config.onAlert?.(
      `[COPILOTO] Presupuesto mensual al ${Math.round((spent / limits.monthlyBudgetUsd) * 100)}%: USD ${spent.toFixed(2)} de USD ${limits.monthlyBudgetUsd}.`
    );
  }

  return null;
}

export { startOfMonth };
