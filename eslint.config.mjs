import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Más chico que el de un sistema: acá no hay Next, ni rutas, ni imágenes. Lo que
 * sí hay son hooks —el widget es lo más frágil del paquete— así que las reglas
 * de hooks entran completas.
 */
export default [
  { ignores: ["node_modules/**", "dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/react/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    rules: {
      // El adaptador de Supabase habla con un cliente que no tipa: el `any` es
      // deliberado y está comentado en su lugar.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
