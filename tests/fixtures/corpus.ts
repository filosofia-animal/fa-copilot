/**
 * Un corpus mínimo pero realista, para probar el paquete sin depender del manual
 * de ningún sistema.
 *
 * Tiene lo que importa para los tests: un núcleo con rutas y nombres de botón,
 * dos secciones con resumen y cuerpo distinguibles, y una sección cuyo cuerpo
 * dice algo que NO está en el núcleo — así se puede verificar que el cuerpo no
 * se filtre al system prompt, que es la invariante que sostiene los dos niveles.
 */

import type { CopilotCorpus, CopilotIdentity } from "../../src/types";

export const FIXTURE_IDENTITY: CopilotIdentity = {
  system: "sistema-de-prueba",
  description: "un sistema inventado para los tests del paquete",
  askInstead: "Alguien del equipo",
  dataQuestionEscape:
    "Si te preguntan un dato, explicá que vos sólo sabés cómo funciona el sistema.",
};

const MANUAL = `# Manual de uso de sistema-de-prueba

Este documento es la base de conocimiento del copiloto.

## Pantalla: Tablero (/tablero)

Es la pantalla de entrada. Muestra las tareas del día.

Para crear una tarea, hacé clic en **Nueva tarea** arriba a la derecha.

## Pantalla: Archivo (/archivo)

Guarda lo que ya se cerró. Desde acá se puede **Restaurar** un elemento.
`;

const SECCION_CALCULOS = `# Cómo se calculan los números

Abrí esta sección cuando pregunten por una fórmula o por qué dos pantallas
muestran números distintos.

Avance % = Tareas cerradas ÷ Tareas totales × 100. Las tareas archivadas no
entran en el denominador, que es la diferencia que más confunde.

El día corre de medianoche a medianoche en la zona del servidor.
`;

const SECCION_PROCEDIMIENTOS = `# Procedimientos largos

Abrí esta sección cuando pidan el paso a paso de algo que toca más de una
pantalla.

Para archivar una tarea con dependencias hay que soltar primero cada
dependencia, una por una, y recién después archivar la tarea madre. El orden
inverso deja huérfanas las dependencias y no hay forma de deshacerlo.
`;

/** Del cuerpo de una sección, no de su resumen: no debe aparecer en el prompt. */
export const SOLO_EN_EL_CUERPO =
  "Las tareas archivadas no entran en el denominador";

export const FIXTURE_CORPUS: CopilotCorpus = {
  manual: MANUAL,
  sections: {
    calculos: {
      id: "calculos",
      title: "Cómo se calculan los números",
      summary:
        "Abrí esta sección cuando pregunten por una fórmula o por qué dos pantallas muestran números distintos.",
      content: SECCION_CALCULOS,
    },
    procedimientos: {
      id: "procedimientos",
      title: "Procedimientos largos",
      summary:
        "Abrí esta sección cuando pidan el paso a paso de algo que toca más de una pantalla.",
      content: SECCION_PROCEDIMIENTOS,
    },
  },
};
