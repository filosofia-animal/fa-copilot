"use client";

import { useTransition } from "react";
import { ThumbsUp, ThumbsDown, Baby } from "lucide-react";
import type { ChatMessage } from "./use-chat";

/** clsx en dos líneas: no vale una dependencia para esto. */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Markdown mínimo: negrita, código inline y rutas del sistema como links.
 * No usamos una librería de markdown a propósito — el prompt pide respuestas
 * cortas y el único formato que aparece de verdad es este.
 */
function renderInline(text: string, keyPrefix: string) {
  // Se parte por negrita, código y rutas (/leads, /settings/general).
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\/[a-z][a-z0-9-]*(?:\/[a-z0-9[\]-]+)*)/gi);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-[600]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="px-1 py-0.5 rounded bg-[var(--copilot-surface-hover)] text-[11px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Rutas internas: link real, para poder ir de la respuesta a la pantalla.
    // Se excluyen las que llevan parámetro dinámico, que no son navegables.
    // Es un <a> y no el Link del framework para no atar el paquete a Next.
    if (/^\/[a-z]/.test(part) && !part.includes("[")) {
      return (
        <a
          key={key}
          href={part}
          className="text-[var(--copilot-primary)] underline underline-offset-2 hover:opacity-80"
        >
          {part}
        </a>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

function renderContent(content: string) {
  return content.split("\n").map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" />;

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      return (
        <div key={index} className="flex gap-1.5 pl-1">
          <span className="text-[var(--copilot-text-tertiary)] shrink-0">•</span>
          <span>{renderInline(bullet[1], `b${index}`)}</span>
        </div>
      );
    }

    const numbered = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (numbered) {
      return (
        <div key={index} className="flex gap-1.5 pl-1">
          <span className="text-[var(--copilot-text-tertiary)] shrink-0 tabular-nums">
            {numbered[1]}.
          </span>
          <span>{renderInline(numbered[2], `n${index}`)}</span>
        </div>
      );
    }

    return <div key={index}>{renderInline(trimmed, `p${index}`)}</div>;
  });
}

export function HelpMessageBubble({
  message,
  onFeedback,
  onSimplify,
  canSimplify,
  submitFeedback,
}: {
  message: ChatMessage;
  onFeedback: (usageId: string, value: 1 | -1) => void;
  onSimplify: () => void;
  canSimplify: boolean;
  /** La acción del host que persiste el voto. */
  submitFeedback: (usageId: string, value: 1 | -1) => Promise<unknown>;
}) {
  const [isPending, startTransition] = useTransition();

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[10px] rounded-br-[3px] bg-[var(--copilot-primary)] px-3 py-2 text-[1em] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  function vote(value: 1 | -1) {
    if (!message.usageId || isPending || message.feedback) return;
    const usageId = message.usageId;
    onFeedback(usageId, value);
    startTransition(async () => {
      await submitFeedback(usageId, value);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-w-[92%] rounded-[10px] rounded-bl-[3px] border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-2 text-[1em] leading-relaxed text-[var(--copilot-text)]">
        <div className="flex flex-col gap-0.5">{renderContent(message.content)}</div>
      </div>

      {message.usageId && (
        <div className="flex items-center gap-1 pl-1">
          <button
            type="button"
            onClick={() => vote(1)}
            disabled={!!message.feedback || isPending}
            aria-label="Respuesta útil"
            className={cn(
              "rounded p-1 text-[var(--copilot-text-tertiary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-success)] disabled:cursor-default",
              message.feedback === 1 && "text-[var(--copilot-success)]"
            )}
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => vote(-1)}
            disabled={!!message.feedback || isPending}
            aria-label="Respuesta incorrecta"
            className={cn(
              "rounded p-1 text-[var(--copilot-text-tertiary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-danger)] disabled:cursor-default",
              message.feedback === -1 && "text-[var(--copilot-danger)]"
            )}
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
          {canSimplify && (
            <button
              type="button"
              onClick={onSimplify}
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-1 text-[0.72em] text-[var(--copilot-text-secondary)] transition-colors hover:bg-[var(--copilot-surface-hover)] hover:text-[var(--copilot-text)]"
            >
              <Baby className="h-3 w-3" />
              Explicámelo más simple
            </button>
          )}
          {message.feedback === -1 && (
            <span className="text-[0.7em] text-[var(--copilot-text-tertiary)]">
              Gracias — lo revisamos.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
