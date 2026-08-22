/**
 * Extrae los textos que el usuario ve en pantalla, desde el JSX.
 *
 * Sirve para una sola cosa, pero importante: el manual nombra
 * botones con su texto literal —"hacé clic en **Cerrar como ganado**"— y ese
 * texto se desactualiza en silencio cuando alguien renombra el botón. El
 * copiloto sigue mandando a la persona a buscar algo que ya no existe, y nada
 * falla.
 *
 * Con esto, el manual escribe los botones como [[Cerrar como ganado]] y
 * `help:check` verifica contra esta extracción que cada uno siga existiendo.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__"]);

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    // Los .ts entran además de los .tsx: la navegación del sidebar declara sus
    // etiquetas en components/layout/nav-items.ts, no en JSX.
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

/**
 * Texto visible en JSX: contenido entre etiquetas, más los atributos que el
 * usuario llega a leer (placeholder, aria-label, title).
 */
const PATTERNS: RegExp[] = [
  // El texto visible de una etiqueta JSX. Los saltos de línea entran a
  // propósito: prettier pone el contenido de un botón en su propia línea en
  // cuanto la línea se pasa de largo, y buscando sólo en una línea no se
  // encuentra NADA en un repo formateado así. Como la clase excluye < y >, el
  // match no puede cruzar una etiqueta: es exactamente el nodo de texto.
  />([^<>{}]{2,80})</g,
  // Los atributos van con comilla doble o simple: cada repo tiene su estilo, y
  // en los que usan comilla simple esto es la diferencia entre extraer las
  // etiquetas y no extraer ninguna.
  /placeholder=["']([^"']{2,60})["']/g,
  /aria-label=["']([^"']{2,60})["']/g,
  /title=["']([^"']{2,60})["']/g,
  // Etiquetas declaradas en objetos de configuración en vez de JSX — la
  // navegación del sidebar es el caso principal, y es justo lo que más cita el
  // manual ("hacé clic en Accionables, en el menú de la izquierda").
  /\blabel:\s*["']([^"']{2,60})["']/g,
];

export function extractUiLabels(dirs: string[]): Set<string> {
  const labels = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          // Colapsa la sangría y los saltos que quedan dentro del nodo de texto:
          // "\n            + Nuevo curso\n          " es "+ Nuevo curso".
          const text = match[1].replace(/\s+/g, " ").trim();
          // Ruido típico del JSX: fragmentos de clases, entidades, símbolos.
          if (!text || text.length < 2) continue;
          if (/^[\s\d.,:;/|·—–-]+$/.test(text)) continue;
          if (text.startsWith("&")) continue;
          labels.add(text);
        }
      }
    }
  }

  return labels;
}
