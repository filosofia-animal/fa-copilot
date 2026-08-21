import { z } from "zod";

/**
 * Enmascara los parámetros dinámicos de una ruta antes de mandarla al modelo.
 *
 * El copiloto recibe DÓNDE está la persona para dar contexto, pero nunca QUIÉN
 * está mirando: `/clientes/9f3a…` se convierte en `/clientes/[id]`. Es la
 * garantía de que no viaja PII por el contexto de navegación. Se aplica en el
 * server: no se confía en el cliente.
 */
export function maskRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
        /^\d+$/.test(segment)
      ) {
        return "[id]";
      }
      return segment;
    })
    .join("/");
}

export const copilotMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const copilotChatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Escribí una pregunta")
    .max(500, "La pregunta no puede superar los 500 caracteres"),
  conversationId: z.string().uuid().nullish(),
  route: z.string().max(200).nullish(),
  history: z.array(copilotMessageSchema).max(20).default([]),
});

export const copilotFeedbackSchema = z.object({
  usageId: z.string().uuid(),
  value: z.union([z.literal(1), z.literal(-1)]),
});
