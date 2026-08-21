/**
 * El cliente del copiloto.
 *
 * La única herramienta es la de leer secciones del propio manual: sin base de
 * datos, sin web. Es lo que hace verificable que el copiloto sólo hable del
 * sistema y lo que elimina el riesgo de filtrar datos.
 *
 * El loop es manual y no el tool runner del SDK por dos motivos concretos:
 *  - Acumular el consumo de TODAS las vueltas. Si se registrara sólo la última,
 *    el costo guardado mentiría y el presupuesto mensual no serviría.
 *  - Poder descartar el texto de relleno. El modelo suele escribir "dejame
 *    ver..." antes de pedir una sección; eso no es la respuesta.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  CopilotConfig,
  CopilotMessage,
  CopilotTokenUsage,
} from "../types";
import { COPILOT_DEFAULTS } from "../types";
import { buildSystemPrompt } from "./prompt";
import { buildSectionTool, getSection, readSectionForTool } from "./sections";
import { calculateCostUsd } from "./pricing";

export type CopilotAnswer = {
  answer: string;
  usage: CopilotTokenUsage;
  costUsd: number;
  model: string;
  /** Ids de las secciones que se abrieron. Dice qué contenido se gana su lugar. */
  sectionsUsed: string[];
};

export type CopilotStreamHandlers = {
  /** Texto de la respuesta, token a token. */
  onDelta(text: string): void;
  /** Va a abrir una sección: hay que descartar lo escrito y esperar. */
  onSectionLookup(sectionTitle: string): void;
};

/**
 * Marcas de que el modelo se plantó y no contestó con contenido del manual. Se
 * registran para medir cuántas consultas caen fuera de alcance sin tener que
 * leer todas las respuestas a mano.
 */
const REFUSAL_MARKERS = [
  "no está en el manual",
  "no esta en el manual",
  "no lo sé",
  "no lo se",
  "sólo ayudo con",
  "solo ayudo con",
  "no tengo acceso",
];

export function looksLikeRefusal(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return REFUSAL_MARKERS.some((marker) => normalized.includes(marker));
}

function buildMessages(
  history: CopilotMessage[],
  question: string,
  route: string | null,
  historyLimit: number
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = history
    .slice(-historyLimit)
    .map((message) => ({ role: message.role, content: message.content }));

  const context = route
    ? `[La persona está en la pantalla ${route}]\n\n${question}`
    : question;

  messages.push({ role: "user", content: context });
  return messages;
}

function addUsage(total: CopilotTokenUsage, message: Anthropic.Message): void {
  total.inputTokens += message.usage.input_tokens ?? 0;
  total.outputTokens += message.usage.output_tokens ?? 0;
  total.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
  total.cacheCreationTokens += message.usage.cache_creation_input_tokens ?? 0;
}

export async function streamCopilotAnswer(
  config: CopilotConfig,
  question: string,
  history: CopilotMessage[],
  route: string | null,
  handlers: CopilotStreamHandlers
): Promise<CopilotAnswer> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");

  const model = config.model ?? COPILOT_DEFAULTS.model;
  const maxTokens = config.maxTokens ?? COPILOT_DEFAULTS.maxTokens;
  const historyLimit = config.historyLimit ?? COPILOT_DEFAULTS.historyLimit;
  const maxToolRounds = config.maxToolRounds ?? COPILOT_DEFAULTS.maxToolRounds;

  const anthropic = new Anthropic({ apiKey });
  const messages = buildMessages(history, question, route, historyLimit);
  const systemPrompt = buildSystemPrompt(config.identity, config.corpus);

  const usage: CopilotTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  const sectionsUsed: string[] = [];
  let answer = "";

  for (let round = 0; round <= maxToolRounds; round++) {
    // En la última vuelta se sacan las herramientas: lo obliga a responder con
    // lo que tiene en vez de agotar el turno pidiendo secciones.
    const toolsAvailable = round < maxToolRounds;

    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // El núcleo es casi todo el input y no cambia entre requests.
          cache_control: { type: "ephemeral" },
        },
      ],
      ...(toolsAvailable ? { tools: [buildSectionTool(config.corpus)] } : {}),
      messages,
    });

    // Se emite en vivo. Si la vuelta termina pidiendo una sección, ese texto era
    // preámbulo y el cliente lo descarta al recibir onSectionLookup.
    stream.on("text", handlers.onDelta);

    const message = await stream.finalMessage();
    addUsage(usage, message);

    const toolUses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      answer = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      break;
    }

    const firstId = String((toolUses[0].input as { seccion?: unknown }).seccion ?? "");
    handlers.onSectionLookup(
      getSection(config.corpus, firstId)?.title ?? "el manual"
    );

    messages.push({ role: "assistant", content: message.content });
    messages.push({
      role: "user",
      content: toolUses.map((toolUse) => {
        const id = String((toolUse.input as { seccion?: unknown }).seccion ?? "");
        const result = readSectionForTool(config.corpus, id);
        if (result.found && !sectionsUsed.includes(id)) sectionsUsed.push(id);
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result.text,
          ...(result.found ? {} : { is_error: true }),
        };
      }),
    });
  }

  return {
    answer,
    usage,
    costUsd: calculateCostUsd(model, usage),
    model,
    sectionsUsed,
  };
}
