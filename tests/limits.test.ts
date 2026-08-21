import { describe, it, expect, vi } from "vitest";
import { checkCopilotAvailability } from "../src/server/limits";
import type { CopilotConfig, CopilotLimits, CopilotStorage } from "../src/types";
import { FIXTURE_CORPUS, FIXTURE_IDENTITY } from "./fixtures/corpus";

const LIMITES: CopilotLimits = {
  maxPerHour: 15,
  maxPerDay: 60,
  monthlyBudgetUsd: 30,
  budgetAlertRatio: 0.8,
};

/**
 * Los tres frenos son lo único que separa "una herramienta útil" de "una factura
 * sorpresa". No hay forma de probarlos en producción sin gastar, así que se
 * prueban acá con un storage de mentira.
 */
function armar(opciones: {
  enabled?: boolean;
  hourCount?: number;
  dayCount?: number;
  spent?: number;
  limits?: Partial<CopilotLimits>;
}) {
  const onAlert = vi.fn();
  const storage = {
    countUsageSince: vi.fn(async (_userId: string, since: Date) => {
      const esLaVentanaDeUnaHora = Date.now() - since.getTime() < 2 * 60 * 60 * 1000;
      return esLaVentanaDeUnaHora ? (opciones.hourCount ?? 0) : (opciones.dayCount ?? 0);
    }),
    sumCostSince: vi.fn(async () => opciones.spent ?? 0),
  } as unknown as CopilotStorage;

  const config = {
    identity: FIXTURE_IDENTITY,
    corpus: FIXTURE_CORPUS,
    storage,
    settings: {
      isEnabled: async () => opciones.enabled ?? true,
      limits: async () => ({ ...LIMITES, ...opciones.limits }),
    },
    onAlert,
  } as unknown as CopilotConfig;

  return { config, onAlert };
}

describe("checkCopilotAvailability", () => {
  it("deja pasar cuando no hay nada que frene", async () => {
    const { config } = armar({});
    expect(await checkCopilotAvailability(config, "u1")).toBeNull();
  });

  it("respeta el interruptor de apagado", async () => {
    // Es el freno que se usa cuando algo sale mal: tiene que cortar antes de
    // gastar una sola consulta.
    const { config } = armar({ enabled: false });
    expect((await checkCopilotAvailability(config, "u1"))?.kind).toBe("disabled");
  });

  it("corta al llegar al límite por hora, no al pasarlo", async () => {
    // Con >= el usuario hace 15; con > haría 16. Es el clásico off-by-one de un
    // rate limit, y del lado equivocado cuesta plata.
    const justo = armar({ hourCount: LIMITES.maxPerHour });
    expect((await checkCopilotAvailability(justo.config, "u1"))?.kind).toBe("rate_limit");

    const unaMenos = armar({ hourCount: LIMITES.maxPerHour - 1 });
    expect(await checkCopilotAvailability(unaMenos.config, "u1")).toBeNull();
  });

  it("corta al llegar al límite por día", async () => {
    const { config } = armar({ dayCount: LIMITES.maxPerDay });
    expect((await checkCopilotAvailability(config, "u1"))?.kind).toBe("rate_limit");
  });

  it("corta al agotar el presupuesto del mes y avisa", async () => {
    const { config, onAlert } = armar({ spent: LIMITES.monthlyBudgetUsd });
    const block = await checkCopilotAvailability(config, "u1");
    expect(block?.kind).toBe("budget");
    expect(onAlert).toHaveBeenCalledOnce();
  });

  it("avisa al pasar el umbral pero sigue respondiendo", async () => {
    // El aviso temprano es lo que da margen para decidir: subir el tope o
    // averiguar por qué se disparó el uso. No tiene que cortar.
    const { config, onAlert } = armar({
      spent: LIMITES.monthlyBudgetUsd * LIMITES.budgetAlertRatio,
    });
    expect(await checkCopilotAvailability(config, "u1")).toBeNull();
    expect(onAlert).toHaveBeenCalledOnce();
  });

  it("no avisa cuando el gasto está lejos del tope", async () => {
    // Una alerta que llega siempre no la lee nadie.
    const { config, onAlert } = armar({ spent: 1 });
    expect(await checkCopilotAvailability(config, "u1")).toBeNull();
    expect(onAlert).not.toHaveBeenCalled();
  });

  it("con presupuesto en cero queda cortado, no abierto", async () => {
    // Un tope mal configurado tiene que fallar cerrado.
    const { config } = armar({ spent: 0, limits: { monthlyBudgetUsd: 0 } });
    expect((await checkCopilotAvailability(config, "u1"))?.kind).toBe("budget");
  });

  it("mide la hora y el día en ventanas distintas", async () => {
    const { config } = armar({ hourCount: 0, dayCount: 0 });
    await checkCopilotAvailability(config, "u1");
    const llamadas = (config.storage.countUsageSince as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(llamadas).toHaveLength(2);
    const [[, unaHora], [, unDia]] = llamadas as [[string, Date], [string, Date]];
    expect(unaHora.getTime()).toBeGreaterThan(unDia.getTime());
  });
});
