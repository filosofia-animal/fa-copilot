/**
 * Armado del system prompt.
 *
 * ESTABILIDAD DEL PREFIJO: este string se manda como bloque cacheado en cada
 * request. El prompt caching matchea por prefijo byte a byte, así que cualquier
 * cosa volátil acá dentro —una fecha calculada, el nombre del usuario, un
 * timestamp— invalida el caché en cada consulta y multiplica el costo por cinco,
 * sin romper nada visible.
 *
 * Por eso esta función depende SÓLO de la identidad y del corpus, que no cambian
 * entre requests. Todo lo variable va en los `messages`. Hay un test que verifica
 * el determinismo; si lo hacés fallar, no lo relajes: sacá lo volátil.
 */

import type { CopilotCorpus, CopilotIdentity } from "../types";
import { buildRules } from "./rules";
import { buildSectionCatalog, TOOL_NAME } from "./sections";

export function buildSystemPrompt(
  identity: CopilotIdentity,
  corpus: CopilotCorpus
): string {
  const catalog = buildSectionCatalog(corpus);

  const catalogBlock = catalog
    ? `## Catálogo de secciones profundas

Estas secciones NO están en el texto de abajo. Para leerlas usá \`${TOOL_NAME}\` con el id.

${catalog}

`
    : "";

  const manualHeader = `## Manual base de ${identity.system}

Todo lo que sigue lo tenés siempre disponible.

`;

  return buildRules(identity) + catalogBlock + manualHeader + corpus.manual;
}
