"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Loader2,
  Mic,
  MicOff,
  Minus,
  Plus,
} from "lucide-react";
import { useCopilotChat } from "./use-chat";
import { useStoredNumber } from "./use-stored-number";
import { useDictation } from "./use-dictation";
import { HelpMessageBubble } from "./message";

/**
 * Tamaños de texto del panel. Arranca en 15px: el copiloto lo usa gente que no
 * vive en el sistema, y 13px en un panel angosto es incómodo de leer.
 */
const FONT_SIZES = [15, 17, 19] as const;
const FONT_SIZE_STORAGE_KEY = "fa-copilot-font-size";

/**
 * Preguntas de arranque. Además de dar un primer clic, le enseñan a la gente
 * qué tipo de cosas puede preguntar — y sobre todo, que es ayuda de uso y no
 * consulta de datos.
 */


/**
 * Respuestas rápidas del modo guiado. El copiloto acompaña de a un paso y
 * espera confirmación; tener el "listo" a un clic saca justo la fricción que
 * queremos evitar — escribir.
 */
const QUICK_REPLIES = ["Listo, seguí", "No lo encuentro"];

const SIMPLIFY_PROMPT =
  "Explicámelo más simple, como si fuera la primera vez que uso el sistema.";

export type CopilotWidgetProps = {
  /** Ruta del endpoint montado con createCopilotHandler. */
  endpoint: string;
  /** Persiste el voto de una respuesta. La provee el host (server action). */
  submitFeedback: (usageId: string, value: 1 | -1) => Promise<unknown>;
  /** Ruta actual, para dar contexto. Se enmascara en el server. */
  pathname?: string | null;
  /** Bajada del encabezado. Nombrar el sistema ayuda a saber de qué sabe. */
  subtitle?: string;
  /**
   * Tres preguntas de arranque. Enseñan qué se puede preguntar y, sobre todo,
   * que no es consulta de datos. Poné preguntas reales del sistema.
   */
  suggestions?: readonly string[];
  /** Cuánto despejar por abajo, para convivir con otros widgets flotantes. */
  bottomOffsetPx?: number;
  rightOffsetPx?: number;
  /** Por debajo de los overlays del host (paletas, tours) y encima del resto. */
  zIndex?: number;
};

export function CopilotWidget({
  endpoint,
  submitFeedback,
  pathname,
  subtitle = "Cómo usar el sistema",
  suggestions = [],
  bottomOffsetPx = 88,
  rightOffsetPx = 20,
  zIndex = 9000,
}: CopilotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  // El tamaño elegido se recuerda: quien lo necesita grande lo necesita siempre.
  const [fontSize, setFontSize] = useStoredNumber(
    FONT_SIZE_STORAGE_KEY,
    FONT_SIZES,
    FONT_SIZES[0]
  );
  const { messages, isStreaming, lookingUp, error, send, reset, markFeedback } =
    useCopilotChat({ endpoint, pathname });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // El dictado escribe en el casillero; la persona revisa y manda.
  const dictation = useDictation((text) =>
    setInput((prev) => (prev ? `${prev} ${text}` : text))
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function changeFontSize(direction: 1 | -1) {
    const index = FONT_SIZES.indexOf(
      fontSize as (typeof FONT_SIZES)[number]
    );
    const next = FONT_SIZES[index + direction];
    if (next === undefined) return;
    // El hook persiste solo; acá no hay que volver a escribir.
    setFontSize(next);
  }

  // Escape cierra el panel, como el resto de los overlays de la app.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  function submit(text?: string) {
    const question = text ?? input;
    if (!question.trim() || isStreaming) return;
    if (!text) setInput("");
    void send(question);
  }

  // Si el sistema ya tiene otros widgets flotantes en la esquina inferior
  // derecha, `bottomOffsetPx` los despeja. En mobile además hay que despejar la
  // barra inferior: el host puede exponer su altura en --copilot-bottom-nav-h.
  const fabStyle = {
    right: `${rightOffsetPx}px`,
    bottom: `calc(${bottomOffsetPx}px + var(--copilot-bottom-nav-h, 0px) + env(safe-area-inset-bottom))`,
    zIndex,
  } as const;

  const lastMessage = messages[messages.length - 1];
  const showQuickReplies =
    messages.length > 0 && !isStreaming && lastMessage?.role === "assistant";

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir el copiloto de ayuda"
          style={fabStyle}
          className="fixed flex h-14 w-14 items-center justify-center rounded-full bg-[var(--copilot-primary)] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-primary)] motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div
          style={
            {
              zIndex: zIndex + 1,
              // El panel arranca donde arranca el botón, así no tapa el widget
              // de bugs mientras está abierto. En mobile es pantalla completa,
              // así que la variable sólo la usa el breakpoint sm en adelante.
              "--help-panel-bottom": `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom))`,
            } as React.CSSProperties
          }
          className="fixed inset-x-0 bottom-0 top-0 flex flex-col bg-[var(--copilot-surface)] sm:inset-auto sm:right-5 sm:bottom-[var(--help-panel-bottom)] sm:h-[640px] sm:max-h-[calc(100vh-6rem)] sm:w-[460px] sm:rounded-[12px] sm:border sm:border-[var(--copilot-border)] sm:shadow-2xl"
          role="dialog"
          aria-label="Copiloto de ayuda"
        >
          <header className="flex items-center gap-2 border-b border-[var(--copilot-border)] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--copilot-primary-light)]">
              <Sparkles className="h-4 w-4 text-[var(--copilot-primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-[600] text-[var(--copilot-text)]">Copiloto</p>
              <p className="text-[12px] text-[var(--copilot-text-secondary)]">
                {subtitle}
              </p>
            </div>

            <div className="flex items-center gap-0.5 rounded-[6px] border border-[var(--copilot-border)]">
              <button
                type="button"
                onClick={() => changeFontSize(-1)}
                disabled={fontSize === FONT_SIZES[0]}
                aria-label="Achicar el texto"
                className="p-1.5 text-[var(--copilot-text-secondary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-text)] disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] font-[600] text-[var(--copilot-text-tertiary)]">A</span>
              <button
                type="button"
                onClick={() => changeFontSize(1)}
                disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                aria-label="Agrandar el texto"
                className="p-1.5 text-[var(--copilot-text-secondary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-text)] disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                aria-label="Empezar una conversación nueva"
                className="rounded-[6px] p-2 text-[var(--copilot-text-tertiary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-text)]"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar el copiloto"
              className="rounded-[6px] p-2 text-[var(--copilot-text-tertiary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div
            ref={scrollRef}
            style={{ fontSize: `${fontSize}px` }}
            className="flex-1 space-y-3 overflow-y-auto bg-[var(--copilot-bg)] px-4 py-4"
          >
            {messages.length === 0 && (
              <div className="flex flex-col gap-3 pt-2">
                <p className="text-[1em] leading-relaxed text-[var(--copilot-text-secondary)]">
                  Preguntame cómo se hace algo en el sistema y te voy llevando paso a
                  paso. Sé de las pantallas, los estados, los permisos y cómo se
                  calcula cada número — pero no tengo acceso a los datos, así que no
                  puedo decirte ningún número concreto.
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => submit(suggestion)}
                      className="rounded-[8px] border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-2.5 text-left text-[0.92em] text-[var(--copilot-text)] transition-colors hover:border-[var(--copilot-primary)] hover:bg-[var(--copilot-primary-light)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <HelpMessageBubble
                key={index}
                message={message}
                onFeedback={markFeedback}
                onSimplify={() => submit(SIMPLIFY_PROMPT)}
                canSimplify={!isStreaming}
                submitFeedback={submitFeedback}
              />
            ))}

            {isStreaming && lastMessage?.content === "" && (
              <div className="flex items-center gap-2 text-[0.85em] text-[var(--copilot-text-tertiary)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                {lookingUp
                  ? `Abriendo la sección "${lookingUp}"…`
                  : "Buscando en el manual…"}
              </div>
            )}

            {error && (
              <div className="rounded-[8px] border border-[var(--copilot-danger)]/30 bg-red-50 px-3 py-2 text-[0.9em] text-[var(--copilot-danger)]">
                {error}
              </div>
            )}
          </div>

          {showQuickReplies && (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--copilot-border-subtle)] px-3 pt-2.5">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => submit(reply)}
                  className="rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-1.5 text-[13px] text-[var(--copilot-text-secondary)] transition-colors hover:border-[var(--copilot-primary)] hover:text-[var(--copilot-text)]"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          <div className="px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={500}
                placeholder="¿Cómo hago…?"
                style={{ fontSize: `${fontSize}px` }}
                className="max-h-28 flex-1 resize-none rounded-[8px] border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-2.5 text-[var(--copilot-text)] outline-none placeholder:text-[var(--copilot-text-tertiary)] focus:border-[var(--copilot-primary)]"
              />

              {dictation.isSupported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  aria-label={
                    dictation.isListening ? "Dejar de dictar" : "Dictar la pregunta"
                  }
                  className={
                    dictation.isListening
                      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[var(--copilot-danger)] bg-red-50 text-[var(--copilot-danger)] transition-colors"
                      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-[var(--copilot-text-secondary)] transition-colors hover:text-[var(--copilot-text)]"
                  }
                >
                  {dictation.isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => submit()}
                disabled={!input.trim() || isStreaming}
                aria-label="Enviar pregunta"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[var(--copilot-primary)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-[var(--copilot-text-tertiary)]">
              {dictation.isListening
                ? "Te escucho — hablá tranquilo y después revisá lo que quedó escrito."
                : "Las consultas se guardan para mejorar la ayuda. Si algo no está o está mal explicado, marcá el pulgar abajo."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
