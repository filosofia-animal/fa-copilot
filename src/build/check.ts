/**
 * Las guardas del corpus. Corren en CI.
 *
 * Sin esto el copiloto se desactualiza en silencio: sigue respondiendo, sólo que
 * manda a la persona a buscar algo que ya no existe. Es la mitad del valor de
 * toda la feature.
 *
 * Con el manual en dos niveles hay dos presupuestos distintos y eso cambia la
 * vara: el NÚCLEO se paga en cada consulta, así que su techo es ajustado; las
 * SECCIONES se cargan a demanda, así que lo que importa es que cada una entre
 * cómoda en una respuesta, no el total.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildCore,
  buildSections,
  collectButtonMarkers,
  collectCoreFiles,
  type CorpusPaths,
} from "./corpus";
import { extractUiLabels } from "./labels";

/** ~3.6 caracteres por token es la aproximación para castellano. */
const CHARS_PER_TOKEN = 3.6;

export type CheckOptions = {
  paths: CorpusPaths;
  /** Dónde viven las pantallas, para verificar cobertura de rutas. */
  routesDir?: string;
  /** Dónde buscar los textos visibles del sistema. */
  sourceDirs?: string[];
  /** Techo del núcleo, que se paga siempre. */
  maxCoreChars?: number;
  /** Techo por sección. */
  maxSectionChars?: number;
  /** Techo del catálogo, que también viaja siempre. */
  maxCatalogChars?: number;
  /** Rutas que a propósito no se documentan, con el motivo. */
  undocumentedRoutes?: Map<string, string>;
  /** Botones que la extracción no encuentra por motivos legítimos. */
  unextractableLabels?: Map<string, string>;
};

function tokens(text: string): number {
  return Math.round(text.length / CHARS_PER_TOKEN);
}

/** Rutas de Next.js App Router: cada `page.tsx` es una pantalla. */
export function collectRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Los grupos de rutas — (dashboard) — no aportan segmento a la URL.
      const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
      routes.push(...collectRoutes(full, prefix + segment));
    } else if (entry === "page.tsx") {
      routes.push(prefix || "/");
    }
  }
  return routes;
}

export type CheckResult = { problems: string[]; summary: string };

export function checkCorpus(options: CheckOptions): CheckResult {
  const {
    paths,
    routesDir,
    sourceDirs,
    maxCoreChars = 72_000, // ≈ 20.000 tokens
    maxSectionChars = 40_000, // ≈ 11.000 tokens
    maxCatalogChars = 6_000,
    undocumentedRoutes = new Map<string, string>(),
    unextractableLabels = new Map<string, string>(),
  } = options;

  const problems: string[] = [];
  const core = buildCore(paths);
  const sections = buildSections(paths);
  const corpus = core + "\n" + sections.map((s) => s.content).join("\n");

  // 1. Cobertura de rutas sobre el corpus completo.
  let routes: string[] = [];
  if (routesDir && existsSync(routesDir)) {
    routes = collectRoutes(routesDir).sort();
    const missing = routes.filter(
      (r) => !corpus.includes(r) && !undocumentedRoutes.has(r)
    );
    if (missing.length > 0) {
      problems.push(
        `Rutas sin documentar (${missing.length}):\n` +
          missing.map((r) => `    ${r}`).join("\n") +
          `\n  Agregá una sección "## Pantalla: Nombre (${missing[0]})", o registrala` +
          `\n  en undocumentedRoutes con su motivo.`
      );
    }
  }

  // 2. Generados sincronizados: si alguien edita un .md y no regenera, el deploy
  //    sirve el manual viejo.
  const generatedCore = join(paths.outDir, "manual.generated.ts");
  const generatedSections = join(paths.outDir, "sections.generated.ts");
  if (!existsSync(generatedCore) || !existsSync(generatedSections)) {
    problems.push("Faltan los archivos generados. Corré: npm run copilot:build");
  } else {
    if (!readFileSync(generatedCore, "utf8").includes(JSON.stringify(core))) {
      problems.push(
        "El núcleo generado está desactualizado respecto de los .md.\n" +
          "  Corré: npm run copilot:build (y commiteá el resultado)."
      );
    }
    const generated = readFileSync(generatedSections, "utf8");
    const stale = sections.filter((s) => !generated.includes(JSON.stringify(s.content)));
    if (stale.length > 0) {
      problems.push(
        `Secciones generadas desactualizadas (${stale.map((s) => s.id).join(", ")}).\n` +
          "  Corré: npm run copilot:build (y commiteá el resultado)."
      );
    }
  }

  // 3. Techos por nivel.
  if (core.length > maxCoreChars) {
    problems.push(
      `El núcleo mide ${core.length} caracteres (~${tokens(core)} tokens) y el techo es ` +
        `${maxCoreChars} (~${Math.round(maxCoreChars / CHARS_PER_TOKEN)}).\n` +
        "  El núcleo se paga en CADA consulta: mové lo que sea detalle a una sección\n" +
        "  en vez de subir el techo."
    );
  }

  const catalog = sections.map((s) => `${s.id} ${s.title} ${s.summary}`).join("\n");
  if (catalog.length > maxCatalogChars) {
    problems.push(
      `El catálogo mide ${catalog.length} caracteres y el techo es ${maxCatalogChars}.\n` +
        "  Viaja en cada consulta: acortá los resúmenes."
    );
  }

  const oversized = sections.filter((s) => s.content.length > maxSectionChars);
  if (oversized.length > 0) {
    problems.push(
      `Secciones que superan ${maxSectionChars} caracteres:\n` +
        oversized.map((s) => `    ${s.id} — ${s.content.length}`).join("\n") +
        "\n  Partila en dos más específicas: una sección enorme se carga entera aunque\n" +
        "  la pregunta toque una sola parte."
    );
  }

  // 4. Ids válidos: uno raro rompería el enum de la herramienta.
  const badIds = sections.filter((s) => !/^[a-z0-9-]+$/.test(s.id));
  if (badIds.length > 0) {
    problems.push(
      `Ids de sección inválidos (sólo minúsculas, números y guiones): ` +
        badIds.map((s) => s.id).join(", ")
    );
  }

  // 5. Etiquetas vivas: cada botón citado tiene que existir en la interfaz.
  const markers = collectButtonMarkers(paths);
  if (sourceDirs && sourceDirs.length > 0) {
    const labels = extractUiLabels(sourceDirs);
    const stale = markers.filter(
      (m) => !labels.has(m.label) && !unextractableLabels.has(m.label)
    );
    if (stale.length > 0) {
      const unique = [...new Map(stale.map((m) => [m.label, m])).values()];
      problems.push(
        `El manual cita botones que ya no existen en pantalla (${unique.length}):\n` +
          unique.map((m) => `    [[${m.label}]] — en ${m.file}`).join("\n") +
          "\n  Alguien renombró el botón, o el texto nunca fue exacto. Corregí el manual\n" +
          "  con el texto actual, o registralo en unextractableLabels si se arma\n" +
          "  dinámicamente y verificaste a mano que existe."
      );
    }
  }

  const deepTokens = sections.reduce((sum, s) => sum + tokens(s.content), 0);
  const summary =
    `Corpus OK · ${routes.length} rutas cubiertas\n` +
    `  Núcleo:    ${collectCoreFiles(paths).length} archivos · ~${tokens(core)} tokens ` +
    `(techo ${Math.round(maxCoreChars / CHARS_PER_TOKEN)}) — se paga en cada consulta\n` +
    `  Secciones: ${sections.length} · ~${deepTokens} tokens · catálogo ~${tokens(catalog)} tokens\n` +
    `  Botones citados: ${markers.length}, todos presentes en la interfaz\n` +
    `  Por consulta viajan ~${tokens(core) + tokens(catalog)} tokens, no ${tokens(core) + deepTokens}.`;

  return { problems, summary };
}
