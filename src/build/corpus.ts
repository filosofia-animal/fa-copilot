/**
 * Genera el corpus en DOS NIVELES desde los .md del sistema.
 *
 *   Nivel 1 — núcleo: `docs/ayuda/*.md`. Viaja cacheado en CADA consulta, así
 *   que todo lo que entra acá se paga siempre. Techo ajustado.
 *
 *   Nivel 2 — secciones: `docs/ayuda/secciones/*.md`. El prompt lleva sólo su
 *   catálogo (~40 tokens por sección); el contenido se carga a demanda. Por eso
 *   este nivel puede crecer sin encarecer las consultas.
 *
 * POR QUÉ SE GENERA UN .ts Y NO SE LEE EL FILESYSTEM EN RUNTIME: el núcleo es el
 * prefijo cacheado, y el prompt caching matchea byte a byte. Un string constante
 * commiteado es idéntico entre requests y entre deploys; leer del disco deja el
 * orden a merced del filesystem y obliga a incluir los .md en el tracing del
 * bundler.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CopilotSection } from "../types";

/** Archivos que NO forman parte del corpus que ve el modelo. */
const EXCLUDED = new Set(["evals.md"]);

export type CorpusPaths = {
  /** Dónde viven los .md del núcleo. */
  coreDir: string;
  /** Dónde viven las secciones. Por defecto, `secciones/` dentro del núcleo. */
  sectionsDir?: string;
  /** Dónde escribir los generados. */
  outDir: string;
  /** El comando que regenera, para el encabezado del archivo generado. */
  buildCommand?: string;
};

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !EXCLUDED.has(f))
    .sort(); // alfabético = orden de los prefijos numéricos, y es estable
}

/**
 * En los .md los nombres de botones se escriben [[Guardar]]. El marcador existe
 * para que el check pueda verificar contra el código que ese texto siga
 * existiendo en pantalla; al modelo se le entrega como negrita.
 */
export function renderButtonMarkers(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, "**$1**");
}

export function extractButtonMarkers(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
}

export function collectCoreFiles(paths: CorpusPaths): string[] {
  return listMarkdown(paths.coreDir);
}

export function buildCore(paths: CorpusPaths): string {
  const files = listMarkdown(paths.coreDir);
  if (files.length === 0) {
    throw new Error(`No se encontró ningún .md en ${paths.coreDir}`);
  }
  return renderButtonMarkers(
    files
      .map((f) => readFileSync(join(paths.coreDir, f), "utf8").trim())
      .join("\n\n---\n\n")
  );
}

function sectionsDirOf(paths: CorpusPaths): string {
  return paths.sectionsDir ?? join(paths.coreDir, "secciones");
}

/**
 * Las secciones profundas. El id sale del nombre del archivo; el título del H1;
 * el resumen de la línea `> Resumen:` — que es lo único de la sección que viaja
 * en cada consulta, así que tiene que decir con precisión qué preguntas cubre.
 */
export function buildSections(paths: CorpusPaths): CopilotSection[] {
  const dir = sectionsDirOf(paths);
  return listMarkdown(dir).map((file) => {
    const raw = readFileSync(join(dir, file), "utf8").trim();
    const id = file.replace(/\.md$/, "");

    const titleMatch = /^#\s+(.+)$/m.exec(raw);
    if (!titleMatch) {
      throw new Error(`La sección ${file} no tiene un título H1 ("# Título").`);
    }

    const summaryMatch = /^>\s*Resumen:\s*(.+)$/m.exec(raw);
    if (!summaryMatch) {
      throw new Error(
        `La sección ${file} no tiene línea de resumen. Agregá "> Resumen: ..." debajo ` +
          `del título: es lo único que el modelo ve para decidir si abrirla.`
      );
    }

    return {
      id,
      title: titleMatch[1].trim(),
      summary: summaryMatch[1].trim(),
      content: renderButtonMarkers(raw),
    };
  });
}

/** Los nombres de botón citados como [[X]], con el archivo donde están. */
export function collectButtonMarkers(
  paths: CorpusPaths
): Array<{ label: string; file: string }> {
  const found: Array<{ label: string; file: string }> = [];
  for (const dir of [paths.coreDir, sectionsDirOf(paths)]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(join(dir, file), "utf8");
      for (const match of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
        found.push({ label: match[1].trim(), file });
      }
    }
  }
  return found;
}

export function writeCorpus(paths: CorpusPaths): {
  coreTokens: number;
  sectionTokens: number;
  catalogTokens: number;
  sections: number;
  coreFiles: number;
} {
  const core = buildCore(paths);
  const sections = buildSections(paths);
  const buildCommand = paths.buildCommand ?? "npm run copilot:build";

  const banner = (source: string) =>
    [
      "// ARCHIVO GENERADO — no editar a mano.",
      `// Fuente: ${source} · Regenerar con: ${buildCommand}`,
      "",
    ].join("\n");

  mkdirSync(paths.outDir, { recursive: true });

  writeFileSync(
    join(paths.outDir, "manual.generated.ts"),
    banner("el núcleo del manual") +
      `export const COPILOT_MANUAL = ${JSON.stringify(core)};\n`,
    "utf8"
  );

  writeFileSync(
    join(paths.outDir, "sections.generated.ts"),
    banner("las secciones del manual") +
      'import type { CopilotSection } from "@fa/copilot";\n\n' +
      `export const COPILOT_SECTIONS: Record<string, CopilotSection> = ${JSON.stringify(
        Object.fromEntries(sections.map((s) => [s.id, s])),
        null,
        2
      )};\n`,
    "utf8"
  );

  const tok = (s: string) => Math.round(s.length / 3.6);
  const catalog = sections.map((s) => `${s.id} ${s.title} ${s.summary}`).join("\n");

  return {
    coreTokens: tok(core),
    sectionTokens: sections.reduce((sum, s) => sum + tok(s.content), 0),
    catalogTokens: tok(catalog),
    sections: sections.length,
    coreFiles: collectCoreFiles(paths).length,
  };
}

