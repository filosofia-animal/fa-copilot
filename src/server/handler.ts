/**
 * El endpoint del copiloto, listo para montar en una ruta de Next.js:
 *
 *   // app/api/help/chat/route.ts
 *   export const { POST, GET } = createCopilotHandler(copilotConfig);
 *   export const dynamic = "force-dynamic";
 *
 * Es un route handler y no una Server Action porque una action no puede devolver
 * texto token por token, y la diferencia es esperar seis segundos mirando un
 * spinner contra ver la respuesta aparecer al segundo.
 *
 * Orden de los chequeos, del más barato al más caro: sesión → permiso →
 * validación → límites → modelo → registro. Los primeros cuatro cortan ANTES de
 * gastar un token.
 */

import type { CopilotConfig, CopilotMessage } from "../types";
import { copilotChatRequestSchema, maskRoute } from "./schemas";
import { checkCopilotAvailability } from "./limits";
import { looksLikeRefusal, streamCopilotAnswer } from "./chat";

function encodeEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createCopilotHandler(config: CopilotConfig) {
  /** Resuelve al actor y verifica el permiso contra la fuente de verdad. */
  async function authorize() {
    const actor = await config.getActor();
    if (!actor) return { error: json({ error: "No autenticado" }, 401) };
    // Se revalida en cada request: que el widget no se dibuje no impide que
    // alguien llame acá con curl.
    if (!config.canUse(actor)) {
      return { error: json({ error: "No tenés acceso al copiloto" }, 403) };
    }
    return { actor };
  }

  async function POST(request: Request): Promise<Response> {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const actor = auth.actor!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body inválido" }, 400);
    }

    const parsed = copilotChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        400
      );
    }

    const { question, conversationId, route, history } = parsed.data;

    const blocked = await checkCopilotAvailability(config, actor.id);
    if (blocked) {
      return json(
        { error: blocked.message, reason: blocked.kind },
        blocked.kind === "rate_limit" ? 429 : 503
      );
    }

    const safeRoute = route ? maskRoute(route) : null;

    let conversation;
    try {
      conversation = await config.storage.getOrCreateConversation(
        actor.id,
        conversationId,
        question
      );
    } catch (error) {
      console.error("[copilot] no se pudo abrir la conversación:", error);
      return json({ error: "No se pudo abrir la conversación" }, 500);
    }

    // El historial de confianza es el guardado, no el que manda el cliente.
    const storedHistory: CopilotMessage[] = conversation.messages;
    const startedAt = Date.now();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encodeEvent({ type: "start", conversationId: conversation.id })
        );

        try {
          const result = await streamCopilotAnswer(
            config,
            question,
            storedHistory.length > 0 ? storedHistory : (history as CopilotMessage[]),
            safeRoute,
            {
              onDelta: (text) =>
                controller.enqueue(encodeEvent({ type: "delta", text })),
              onSectionLookup: (sectionTitle) =>
                controller.enqueue(encodeEvent({ type: "lookup", sectionTitle })),
            }
          );

          const nextMessages: CopilotMessage[] = [
            ...storedHistory,
            { role: "user", content: question },
            { role: "assistant", content: result.answer },
          ];

          // La respuesta ya se entregó: si el registro falla se loguea y no se
          // rompe la experiencia.
          let usageId: string | null = null;
          try {
            await config.storage.appendMessages(conversation.id, nextMessages);
            usageId = await config.storage.recordUsage({
              userId: actor.id,
              conversationId: conversation.id,
              model: result.model,
              question,
              answer: result.answer,
              route: safeRoute,
              usage: result.usage,
              costUsd: result.costUsd,
              latencyMs: Date.now() - startedAt,
              refused: looksLikeRefusal(result.answer),
              sectionsUsed: result.sectionsUsed,
            });
          } catch (error) {
            console.error("[copilot] no se pudo registrar la consulta:", error);
          }

          controller.enqueue(
            encodeEvent({ type: "done", conversationId: conversation.id, usageId })
          );
        } catch (error) {
          console.error("[copilot] error del modelo:", error);
          controller.enqueue(
            encodeEvent({
              type: "error",
              message: "No pude responder en este momento. Probá de nuevo en un rato.",
            })
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  /** Historial de conversaciones del usuario, para el selector del panel. */
  async function GET(): Promise<Response> {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const conversations = await config.storage.listConversations(auth.actor!.id, 10);
    return json({ conversations }, 200);
  }

  return { POST, GET };
}
