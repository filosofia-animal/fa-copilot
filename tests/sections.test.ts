import { describe, it, expect } from "vitest";
import {
  buildSectionCatalog,
  buildSectionTool,
  getSection,
  readSectionForTool,
  sectionIds,
  TOOL_NAME,
} from "../src/server/sections";
import { FIXTURE_CORPUS } from "./fixtures/corpus";

describe("catálogo de secciones", () => {
  it("expone los ids del corpus, ordenados igual siempre", () => {
    expect(sectionIds(FIXTURE_CORPUS)).toEqual(sectionIds(FIXTURE_CORPUS));
    expect(sectionIds(FIXTURE_CORPUS)).toContain("calculos");
  });

  it("nombra cada sección con su id, para que el modelo pueda pedirla", () => {
    const catalog = buildSectionCatalog(FIXTURE_CORPUS);
    for (const id of sectionIds(FIXTURE_CORPUS)) {
      expect(catalog).toContain(`\`${id}\``);
    }
  });

  it("es determinista, porque forma parte del prefijo cacheado", () => {
    expect(buildSectionCatalog(FIXTURE_CORPUS)).toBe(buildSectionCatalog(FIXTURE_CORPUS));
  });

  it("no rompe con un corpus sin secciones", () => {
    // Un sistema puede arrancar con sólo el núcleo, antes de escribir las
    // secciones profundas. Eso tiene que funcionar, no explotar.
    const soloNucleo = { manual: "# Manual\n", sections: {} };
    expect(sectionIds(soloNucleo)).toEqual([]);
    expect(() => buildSectionCatalog(soloNucleo)).not.toThrow();
  });
});

describe("herramienta leer_seccion", () => {
  it("restringe el parámetro a los ids que existen", () => {
    const tool = buildSectionTool(FIXTURE_CORPUS);
    expect(tool.name).toBe(TOOL_NAME);
    // El enum es lo único que impide que el modelo invente un id.
    expect(tool.input_schema.properties.seccion.enum).toEqual(sectionIds(FIXTURE_CORPUS));
    expect(tool.input_schema.required).toEqual(["seccion"]);
  });

  it("devuelve el contenido completo de una sección real", () => {
    const result = readSectionForTool(FIXTURE_CORPUS, "calculos");
    expect(result.found).toBe(true);
    expect(result.text).toBe(FIXTURE_CORPUS.sections.calculos.content);
  });

  it("ante un id inventado no rompe y lista los válidos", () => {
    // Pasa: el modelo pide una sección que existía en otra versión del manual.
    const result = readSectionForTool(FIXTURE_CORPUS, "seccion-que-no-existe");
    expect(result.found).toBe(false);
    expect(result.text).toContain("No existe una sección");
    for (const id of sectionIds(FIXTURE_CORPUS)) {
      expect(result.text).toContain(id);
    }
  });

  it("getSection devuelve null en vez de tirar", () => {
    expect(getSection(FIXTURE_CORPUS, "nada")).toBeNull();
    expect(getSection(FIXTURE_CORPUS, "calculos")).not.toBeNull();
  });
});
