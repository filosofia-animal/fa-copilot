import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/server/prompt";
import { TOOL_NAME } from "../src/server/sections";
import { FIXTURE_CORPUS, FIXTURE_IDENTITY, SOLO_EN_EL_CUERPO } from "./fixtures/corpus";

const prompt = buildSystemPrompt(FIXTURE_IDENTITY, FIXTURE_CORPUS);

describe("buildSystemPrompt", () => {
  /**
   * El test que más plata cuida del paquete. El prompt caching de Anthropic
   * matchea por prefijo byte a byte: si alguien mete una fecha, un nombre o un
   * id acá adentro, la caché deja de pegar y cada consulta pasa a costar cinco
   * veces más, en todos los sistemas a la vez, sin romper nada visible.
   */
  it("es determinista entre llamadas", () => {
    expect(buildSystemPrompt(FIXTURE_IDENTITY, FIXTURE_CORPUS)).toBe(prompt);
  });

  it("no contiene nada que cambie entre requests", () => {
    expect(prompt).not.toContain(`${new Date().getFullYear()}-`);
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(prompt).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });

  it("se arma con la identidad que le pasa el sistema, sin nombres cableados", () => {
    expect(prompt).toContain(FIXTURE_IDENTITY.system);
    expect(prompt).toContain(FIXTURE_IDENTITY.description);
    expect(prompt).toContain(FIXTURE_IDENTITY.askInstead);
    // Que no se haya quedado el sistema donde nació el paquete.
    expect(prompt).not.toContain("fa-ventas");
  });

  it("incluye el núcleo del manual", () => {
    expect(prompt).toContain("/tablero");
    expect(prompt).toContain("Nueva tarea");
  });
});

describe("los dos niveles: catálogo sí, cuerpo no", () => {
  /**
   * Esta es la invariante que sostiene toda la arquitectura. Si el cuerpo de una
   * sección se filtra al system prompt, se vuelve al modelo de un solo bloque
   * —pagando el corpus entero en cada consulta— y nada falla a la vista.
   */
  it("incluye el resumen de cada sección", () => {
    for (const section of Object.values(FIXTURE_CORPUS.sections)) {
      expect(prompt, `resumen de ${section.id}`).toContain(section.summary);
    }
  });

  it("NO incluye el cuerpo de las secciones", () => {
    expect(prompt).not.toContain(SOLO_EN_EL_CUERPO);
    for (const section of Object.values(FIXTURE_CORPUS.sections)) {
      const body = section.content;
      const middle = body.slice(
        Math.floor(body.length / 2),
        Math.floor(body.length / 2) + 80
      );
      expect(prompt.includes(middle), `cuerpo de ${section.id} filtrado`).toBe(false);
    }
  });

  it("le explica al modelo cuándo abrir una sección", () => {
    expect(prompt).toContain(TOOL_NAME);
    expect(prompt).toContain("Abrí una sección cuando");
    expect(prompt).toContain("como máximo dos secciones");
  });
});

describe("reglas de alcance", () => {
  it("le prohíbe inventar acceso a datos", () => {
    expect(prompt).toContain("No tenés acceso a la base de datos");
  });

  it("deriva las preguntas de datos a donde diga el sistema", () => {
    expect(prompt).toContain(FIXTURE_IDENTITY.dataQuestionEscape!);
  });
});

describe("reglas de accesibilidad", () => {
  /**
   * El copiloto lo usa gente con mucha experiencia en su trabajo y poca con
   * sistemas. Estas reglas son la diferencia entre una herramienta que usan y
   * una que abandonan a la segunda vez: son fáciles de borrar sin querer al
   * editar el prompt, y su ausencia no rompe nada visible.
   */
  it("prohíbe la jerga técnica y da el reemplazo", () => {
    for (const jargon of ["modal", "toggle", "dropdown", "endpoint", "loguearse"]) {
      expect(prompt, `falta prohibir "${jargon}"`).toContain(jargon);
    }
    expect(prompt).toContain("la ventana que se abre");
    expect(prompt).toContain("el interruptor");
    expect(prompt).toContain("la lista que se despliega");
  });

  it("exige decir dónde está cada cosa, no sólo cómo se llama", () => {
    expect(prompt).toContain("En el menú de la izquierda");
    expect(prompt).toContain("arriba a la derecha");
  });

  it("define el modo guiado de a un paso", () => {
    expect(prompt).toContain("un solo paso por respuesta");
    expect(prompt).toContain("Modo guiado");
    expect(prompt).toContain("no sigas al paso próximo");
  });

  it("no convierte en procedimiento lo que es una sola pregunta", () => {
    expect(prompt).toContain("si es algo de un solo paso");
  });

  it("exige avisar antes de lo irreversible", () => {
    expect(prompt).toContain("no se puede deshacer");
    expect(prompt).toContain("abrí la respuesta avisando");
  });

  it("prohíbe inventar el texto de un botón", () => {
    expect(prompt).toContain("no lo inventes");
  });
});
