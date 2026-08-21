import { describe, it, expect } from "vitest";
import { copilotChatRequestSchema, maskRoute } from "../src/server/schemas";
import { looksLikeRefusal } from "../src/server/chat";

describe("maskRoute", () => {
  /**
   * La ruta se manda para dar contexto ("estoy en /leads/…, ¿cómo cierro esto?").
   * Sin enmascarar, cada consulta llevaría el id de una persona real a la API de
   * un tercero. Es el único lugar del paquete donde podría filtrarse PII.
   */
  it("enmascara UUIDs", () => {
    expect(maskRoute("/leads/9f3a1b2c-4d5e-6f70-8a9b-0c1d2e3f4a5b")).toBe("/leads/[id]");
  });

  it("enmascara ids numéricos", () => {
    expect(maskRoute("/facturas/12345")).toBe("/facturas/[id]");
  });

  it("deja intactas las rutas sin parámetros", () => {
    expect(maskRoute("/tablero")).toBe("/tablero");
    expect(maskRoute("/configuracion/general")).toBe("/configuracion/general");
  });

  it("enmascara rutas anidadas con varios segmentos", () => {
    expect(maskRoute("/a/b/7c9e6679-7425-40de-944b-e07fc1f90ae7")).toBe("/a/b/[id]");
  });

  it("no se queda con nada parecido a un id, venga como venga", () => {
    for (const ruta of [
      "/x/00000000-0000-0000-0000-000000000000",
      "/x/9F3A1B2C-4D5E-6F70-8A9B-0C1D2E3F4A5B",
      "/x/1",
    ]) {
      expect(maskRoute(ruta), ruta).toBe("/x/[id]");
    }
  });
});

describe("copilotChatRequestSchema", () => {
  it("acepta una consulta normal", () => {
    const parsed = copilotChatRequestSchema.safeParse({ question: "¿Cómo archivo algo?" });
    expect(parsed.success).toBe(true);
  });

  it("rechaza una consulta vacía", () => {
    expect(copilotChatRequestSchema.safeParse({ question: "   " }).success).toBe(false);
    expect(copilotChatRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza un conversationId que no es un uuid", () => {
    // Es lo que impide que alguien pruebe a leer el hilo de otro con un id
    // inventado a mano.
    const parsed = copilotChatRequestSchema.safeParse({
      question: "hola",
      conversationId: "../otro",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("looksLikeRefusal", () => {
  /**
   * Sirve para una cosa concreta: marcar en la tabla de uso las consultas que el
   * copiloto no supo contestar, que es de dónde sale qué le falta al manual.
   */
  it("detecta las respuestas fuera de alcance", () => {
    expect(looksLikeRefusal("Eso no está en el manual que tengo.")).toBe(true);
    expect(looksLikeRefusal("No tengo acceso a los datos del sistema.")).toBe(true);
  });

  it("no marca una respuesta normal", () => {
    expect(
      looksLikeRefusal("Para archivar algo entrá a /archivo y hacé clic en Restaurar.")
    ).toBe(false);
  });
});
