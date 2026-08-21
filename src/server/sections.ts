/**
 * Nivel 2 del corpus: las secciones profundas que se cargan a demanda.
 *
 * El system prompt lleva sólo el CATÁLOGO (id, título y resumen de cada una).
 * Cuando la pregunta necesita el detalle, el modelo llama a `leer_seccion` y
 * recién ahí se carga ese texto. Es lo que permite que el manual crezca sin
 * encarecer todas las consultas: agregar 50.000 tokens de secciones suma unos
 * pocos tokens de catálogo, no 50.000 por pregunta.
 *
 * La herramienta es de LECTURA SOBRE UN CORPUS FIJO Y COMMITEADO: sin base de
 * datos, sin red, y el único parámetro es un id de una lista cerrada. El modelo
 * sigue pudiendo decir únicamente lo que dice el manual.
 */

import type { CopilotCorpus, CopilotSection } from "../types";

export const TOOL_NAME = "leer_seccion";

/** Ids válidos. Al ser un enum en el schema, el modelo no puede inventar uno. */
export function sectionIds(corpus: CopilotCorpus): string[] {
  return Object.keys(corpus.sections).sort();
}

export function getSection(
  corpus: CopilotCorpus,
  id: string
): CopilotSection | null {
  return corpus.sections[id] ?? null;
}

/**
 * El catálogo que va en el system prompt. Determinista: mismo orden y mismo
 * texto siempre, porque forma parte del prefijo cacheado.
 */
export function buildSectionCatalog(corpus: CopilotCorpus): string {
  const ids = sectionIds(corpus);
  if (ids.length === 0) return "";

  const lines = ids.map((id) => {
    const section = corpus.sections[id];
    return `- \`${id}\` — ${section.title}: ${section.summary}`;
  });

  return lines.join("\n");
}

/** Definición de la herramienta, en el formato de la API. */
export function buildSectionTool(corpus: CopilotCorpus) {
  return {
    name: TOOL_NAME,
    description:
      "Abre una sección del manual de fa-ventas para leer el detalle completo. " +
      "Usala cuando la pregunta necesite información que no está en el manual base: " +
      "cómo se calcula una métrica, el paso a paso exacto de una tarea, o el detalle " +
      "de una pantalla de configuración. No la uses si ya podés responder con lo que tenés.",
    input_schema: {
      type: "object" as const,
      properties: {
        seccion: {
          type: "string" as const,
          enum: sectionIds(corpus),
          description: "El id de la sección a abrir, de la lista del catálogo.",
        },
      },
      required: ["seccion"],
      additionalProperties: false,
    },
  };
}

/** Resultado que se le devuelve al modelo tras una llamada a la herramienta. */
export function readSectionForTool(
  corpus: CopilotCorpus,
  id: string
): { text: string; found: boolean } {
  const section = getSection(corpus, id);
  if (!section) {
    return {
      found: false,
      text:
        `No existe una sección con id "${id}". Las disponibles son: ${sectionIds(corpus).join(", ")}. ` +
        `Si ninguna cubre la pregunta, decile a la persona que eso no está en el manual.`,
    };
  }
  return { found: true, text: section.content };
}
