import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCore,
  buildSections,
  extractButtonMarkers,
  extractUiLabels,
  renderButtonMarkers,
} from "../src/build";

describe("marcadores de botón", () => {
  /**
   * El manual le dice a la persona en qué botón hacer clic, con el texto
   * literal. Ese texto se desactualiza en silencio cuando alguien renombra el
   * botón: el copiloto sigue respondiendo, sólo que manda a buscar algo que ya
   * no existe. El marcador existe para poder verificarlo contra el código.
   */
  it("se convierten a negrita para el modelo", () => {
    expect(renderButtonMarkers("hacé clic en [[Nueva tarea]]")).toBe(
      "hacé clic en **Nueva tarea**"
    );
  });

  it("convierte varios en la misma línea", () => {
    expect(renderButtonMarkers("[[Uno]] y [[Dos]]")).toBe("**Uno** y **Dos**");
  });

  it("no toca el texto sin marcadores", () => {
    expect(renderButtonMarkers("texto **ya en negrita** normal")).toBe(
      "texto **ya en negrita** normal"
    );
  });

  it("los extrae para poder verificarlos", () => {
    expect(extractButtonMarkers("[[Archivo]] y después [[Restaurar]]")).toEqual([
      "Archivo",
      "Restaurar",
    ]);
  });
});

/** Un repo de juguete: dos .md de núcleo, una sección, y un poco de JSX. */
function repoDePrueba() {
  const root = mkdtempSync(join(tmpdir(), "copilot-"));
  const coreDir = join(root, "ayuda");
  const sectionsDir = join(coreDir, "secciones");
  const srcDir = join(root, "componentes");
  mkdirSync(sectionsDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(join(coreDir, "01-inicio.md"), "# Inicio\n\nClic en [[Nueva tarea]].\n");
  writeFileSync(join(coreDir, "02-archivo.md"), "# Archivo\n\nAcá se guarda lo cerrado.\n");
  writeFileSync(
    join(sectionsDir, "calculos.md"),
    "# Cómo se calculan los números\n\n> Resumen: Abrí esta sección para las fórmulas.\n\nAvance % = cerradas ÷ totales.\n"
  );
  writeFileSync(
    join(srcDir, "boton.tsx"),
    `export function B() { return <button>Nueva tarea</button>; }\n`
  );
  writeFileSync(
    join(srcDir, "nav.ts"),
    `export const NAV = [{ label: "Archivo", href: "/archivo" }];\n`
  );
  return { root, paths: { coreDir, outDir: join(root, "out") }, srcDir };
}

describe("armado del corpus", () => {
  it("junta los .md del núcleo en un solo texto, sin marcadores crudos", () => {
    const { paths } = repoDePrueba();
    const core = buildCore(paths);
    expect(core).toContain("Inicio");
    expect(core).toContain("Archivo");
    expect(core).toContain("**Nueva tarea**");
    expect(core).not.toContain("[[");
  });

  it("saca el título y la línea de resumen de cada sección", () => {
    // El resumen es lo único que el modelo ve en el catálogo: si sale vacío, el
    // modelo no sabe cuándo abrir la sección y el segundo nivel deja de servir.
    // Por eso se declara explícito y no se infiere del primer párrafo.
    const { paths } = repoDePrueba();
    const [seccion] = buildSections(paths);
    expect(seccion.id).toBe("calculos");
    expect(seccion.title).toBe("Cómo se calculan los números");
    expect(seccion.summary).toContain("fórmulas");
    expect(seccion.content).toContain("Avance %");
  });

  it("exige la línea de resumen, con un error que dice cómo arreglarlo", () => {
    // Sin resumen la sección queda invisible para el modelo: existe en el corpus
    // pero nunca se abre. Falla ruidoso a propósito, en vez de degradarse.
    const { paths } = repoDePrueba();
    writeFileSync(
      join(paths.coreDir, "secciones", "sin-resumen.md"),
      "# Una sección\n\nCuerpo sin línea de resumen.\n"
    );
    expect(() => buildSections(paths)).toThrowError(/Resumen/);
  });

  it("es determinista: el mismo repo da el mismo corpus", () => {
    const { paths } = repoDePrueba();
    expect(buildCore(paths)).toBe(buildCore(paths));
  });
});

describe("extracción de etiquetas de la interfaz", () => {
  it("encuentra el texto de un botón en JSX", () => {
    const { srcDir } = repoDePrueba();
    expect(extractUiLabels([srcDir]).has("Nueva tarea")).toBe(true);
  });

  it("encuentra etiquetas declaradas en un .ts, no sólo en JSX", () => {
    // La navegación suele vivir en un archivo de configuración, y es justo lo
    // que el manual cita más. Que la extracción no lo mire deja la guarda
    // dando falsos positivos.
    const { srcDir } = repoDePrueba();
    expect(extractUiLabels([srcDir]).has("Archivo")).toBe(true);
  });

  it("encuentra etiquetas escritas con comilla simple", () => {
    // Cada repo tiene su estilo de comillas y prettier lo impone. En uno que usa
    // simple, mirar sólo la doble no extrae NADA: la guarda pasa a dar falsos
    // positivos en masa en vez de proteger.
    const { srcDir } = repoDePrueba();
    writeFileSync(
      join(srcDir, "nav-simple.ts"),
      "export const NAV = [{ label: 'Configuración', href: '/config' }];\n"
    );
    expect(extractUiLabels([srcDir]).has("Configuración")).toBe(true);
  });

  it("no devuelve ruido ni cadenas vacías", () => {
    const { srcDir } = repoDePrueba();
    for (const label of extractUiLabels([srcDir])) {
      expect(label.trim()).toBe(label);
      expect(label.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("no explota si un directorio no existe", () => {
    expect(() => extractUiLabels(["/directorio/que/no/existe"])).not.toThrow();
  });
});
