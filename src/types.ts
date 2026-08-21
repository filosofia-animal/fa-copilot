/**
 * El contrato entre el paquete y el sistema que lo instala.
 *
 * Todo lo que varía de un sistema a otro entra por acá. Si algo tuvo que
 * agregarse a este archivo para soportar un sistema nuevo, es una señal de que
 * la costura estaba mal puesta: revisalo antes de sumar una opción más.
 */

/** Un mensaje del hilo. */
export type CopilotMessage = { role: "user" | "assistant"; content: string };

/** Lo mínimo que el paquete necesita saber de quien pregunta. */
export type CopilotActor = { id: string; role: string };

/** Una sección profunda del manual, generada desde los .md del sistema. */
export type CopilotSection = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

/** El corpus del sistema, generado por `copilot build`. */
export type CopilotCorpus = {
  /** Núcleo: viaja cacheado en cada consulta. */
  manual: string;
  /** Secciones a demanda, por id. */
  sections: Record<string, CopilotSection>;
};

/** Consumo de una consulta, tal como lo devuelve la API. */
export type CopilotTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

/** Lo que se registra de cada consulta respondida. */
export type CopilotUsageRecord = {
  userId: string;
  conversationId: string | null;
  model: string;
  question: string;
  answer: string;
  route: string | null;
  usage: CopilotTokenUsage;
  costUsd: number;
  latencyMs: number;
  refused: boolean;
  sectionsUsed: string[];
};

/**
 * Persistencia. Viene con una implementación para Supabase
 * (`createSupabaseStorage`); un sistema con otra base implementa esto y listo.
 *
 * Las cuatro primeras operaciones son el camino caliente de una consulta; las
 * dos últimas alimentan el panel de control.
 */
export type CopilotStorage = {
  /** Consultas de un usuario desde un instante dado. Alimenta el rate limit. */
  countUsageSince(userId: string, since: Date): Promise<number>;
  /** Gasto acumulado en USD desde un instante dado. Alimenta el presupuesto. */
  sumCostSince(since: Date): Promise<number>;
  /** Devuelve la conversación si es de ese usuario, o crea una nueva. */
  getOrCreateConversation(
    userId: string,
    conversationId: string | null | undefined,
    firstQuestion: string
  ): Promise<{ id: string; messages: CopilotMessage[] }>;
  appendMessages(conversationId: string, messages: CopilotMessage[]): Promise<void>;
  /** Registra la consulta y devuelve su id, que el cliente usa para votar. */
  recordUsage(record: CopilotUsageRecord): Promise<string | null>;
  setFeedback(usageId: string, userId: string, value: 1 | -1): Promise<void>;
  softDeleteConversation(conversationId: string, userId: string): Promise<void>;
  listConversations(
    userId: string,
    limit: number
  ): Promise<Array<{ id: string; title: string | null; updated_at: string }>>;
};

/** Los tres frenos del gasto. Los valores vivos los resuelve `settings`. */
export type CopilotLimits = {
  maxPerHour: number;
  maxPerDay: number;
  monthlyBudgetUsd: number;
  /** Proporción del presupuesto a partir de la cual se avisa. */
  budgetAlertRatio: number;
};

/**
 * Configuración que puede cambiar sin deploy. Si el sistema no tiene dónde
 * guardarla, devolvé los valores fijos y listo: el paquete funciona igual.
 */
export type CopilotSettings = {
  isEnabled(): Promise<boolean>;
  limits(): Promise<CopilotLimits>;
};

/** Textos que identifican al sistema dentro del prompt. */
export type CopilotIdentity = {
  /** Nombre del sistema, tal como lo llama el equipo. Ej: "fa-ventas". */
  system: string;
  /** Qué es, en una frase. Ej: "el sistema de gestión de ventas". */
  description: string;
  /** A quién derivar cuando no sabe. Ej: "Luisina". */
  askInstead: string;
  /**
   * Frase extra para el caso "me piden un dato concreto". Cada sistema tiene su
   * propia salida — en fa-ventas es el chat de Reportes.
   */
  dataQuestionEscape?: string;
};

export type CopilotConfig = {
  identity: CopilotIdentity;
  corpus: CopilotCorpus;
  storage: CopilotStorage;
  settings: CopilotSettings;
  /** Resuelve quién pregunta. Devolvé null si no hay sesión. */
  getActor(): Promise<CopilotActor | null>;
  /** Decide si ese actor puede usar el copiloto. */
  canUse(actor: CopilotActor): boolean;
  /** Modelo de Anthropic. Default: claude-sonnet-4-6. */
  model?: string;
  /** Techo de la respuesta. Default: 2000. */
  maxTokens?: number;
  /** Mensajes de historial que se reenvían. Default: 6. */
  historyLimit?: number;
  /** Vueltas de herramienta por consulta. Default: 2. */
  maxToolRounds?: number;
  /** Aviso a operaciones: presupuesto al 80% y corte. */
  onAlert?(message: string): void;
  /** Clave de la API. Default: process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
};

/** Motivo por el que el copiloto no puede responder ahora. */
export type CopilotBlock =
  | { kind: "disabled"; message: string }
  | { kind: "rate_limit"; message: string }
  | { kind: "budget"; message: string };

export const COPILOT_DEFAULTS = {
  model: "claude-sonnet-4-6",
  maxTokens: 2000,
  historyLimit: 6,
  maxToolRounds: 2,
  limits: {
    maxPerHour: 15,
    maxPerDay: 60,
    monthlyBudgetUsd: 30,
    budgetAlertRatio: 0.8,
  } satisfies CopilotLimits,
} as const;
