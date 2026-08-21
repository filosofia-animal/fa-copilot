"use client";

import { useCallback, useRef, useState } from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Id de `ai_help_usage`, necesario para votar la respuesta. Sólo en assistant. */
  usageId?: string | null;
  feedback?: 1 | -1 | null;
};

type StreamEvent =
  | { type: "start"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "lookup"; sectionTitle: string }
  | { type: "done"; conversationId: string; usageId: string | null }
  | { type: "error"; message: string };

/**
 * Estado del chat del copiloto: manda la pregunta, va pegando los deltas del
 * stream en el último mensaje y expone el error para mostrarlo en el panel.
 */
export type UseCopilotChatOptions = {
  /** Ruta del endpoint montado con createCopilotHandler. */
  endpoint: string;
  /** Ruta actual, para dar contexto. Se enmascara en el server. */
  pathname?: string | null;
};

export function useCopilotChat({ endpoint, pathname }: UseCopilotChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sección que el copiloto está abriendo, para mostrarlo mientras espera. */
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setLookingUp(null);
    conversationIdRef.current = null;
  }, []);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setLookingUp(null);
      setIsStreaming(true);

      const history = messages.map(({ role, content }) => ({ role, content }));

      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            conversationId: conversationIdRef.current,
            route: pathname ?? null,
            history,
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            (payload as { error?: string } | null)?.error ??
              "No se pudo contactar al copiloto."
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // El endpoint manda NDJSON: un evento JSON por línea.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line) as StreamEvent;
            } catch {
              continue; // línea partida o basura: se ignora, no rompe el chat.
            }

            if (event.type === "start") {
              conversationIdRef.current = event.conversationId;
            } else if (event.type === "delta") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + event.text,
                  };
                }
                return next;
              });
            } else if (event.type === "lookup") {
              // El texto emitido hasta acá era preámbulo del modelo antes de
              // pedir la sección: se descarta para que no quede en la respuesta.
              setLookingUp(event.sectionTitle);
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: "" };
                }
                return next;
              });
            } else if (event.type === "done") {
              setLookingUp(null);
              conversationIdRef.current = event.conversationId;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, usageId: event.usageId };
                }
                return next;
              });
            } else if (event.type === "error") {
              setError(event.message);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Algo salió mal.");
        // Saca la burbuja vacía del asistente para no dejar un hueco.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === "") {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
        setLookingUp(null);
      }
    },
    [endpoint, isStreaming, messages, pathname]
  );

  const markFeedback = useCallback((usageId: string, value: 1 | -1) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.usageId === usageId ? { ...message, feedback: value } : message
      )
    );
  }, []);

  return { messages, isStreaming, lookingUp, error, send, reset, markFeedback };
}
