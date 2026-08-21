import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Los tests del paquete son de lógica: prompt, corpus, costo, guardas. La
    // UI se cubre con typecheck; renderizar el panel pediría jsdom y un fetch
    // simulado, y el valor está en el sistema que lo monta, no acá.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
