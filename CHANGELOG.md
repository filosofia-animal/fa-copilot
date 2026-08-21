# Changelog

Versionado semántico. Cada versión es un tag en el repo; los sistemas apuntan a
un tag, no a una rama — así una mejora del copiloto nunca se cuela en un deploy
de otro sistema sin que alguien lo decida.

## 0.1.1

El paquete pasa a tener CI propio: typecheck, lint y 60 tests sobre un corpus de
prueba, sin depender del manual de ningún sistema. Existe porque los sistemas
apuntan a un tag: un cambio que pasa verde en el paquete y se rompe recién en el
consumidor falla lejos de donde se originó y con días de diferencia.

Lo que cubren los tests, elegido por lo que duele si se rompe en silencio:

- El determinismo del system prompt. Si alguien mete una fecha o un id en el
  prefijo, la caché deja de pegar y cada consulta cuesta cinco veces más, en
  todos los sistemas a la vez, sin que nada falle a la vista.
- Que el cuerpo de las secciones no se filtre al prompt. Es la invariante que
  sostiene los dos niveles; si se rompe, se vuelve a pagar el corpus entero por
  consulta y todo sigue funcionando igual.
- Las reglas de accesibilidad del prompt (jerga prohibida, modo guiado, aviso
  antes de lo irreversible). Son fáciles de borrar sin querer al editar el
  prompt y su ausencia no rompe nada.
- Los tres frenos de gasto, incluido el off-by-one del límite por hora y que un
  presupuesto en cero falle cerrado.
- El enmascarado de rutas, que es el único lugar del paquete donde podría
  filtrarse PII a la API.
- El armado del corpus y la extracción de etiquetas de la interfaz.

Además, dos lecturas del navegador que se hacían con `setState` en un efecto
—el tamaño de texto guardado y el soporte de dictado— pasan a
`useSyncExternalStore`. Evitan el render encadenado y dejan la regla de hooks en
`error` en vez de degradada. El tamaño de texto ahora además se sincroniza entre
pestañas.

## 0.1.0

Primera versión. Extraída de fa-ventas, donde venía andando en producción.

- Chat de ayuda in-app, acotado a explicar cómo se usa un sistema.
- Corpus en dos niveles: núcleo en el prompt cacheado, secciones a pedido con la
  herramienta `leer_seccion`.
- `createCopilotHandler`: endpoint con streaming, límite de rondas de
  herramientas y acumulación de uso entre rondas.
- Tres frenos de gasto independientes: consultas por hora, por día y presupuesto
  mensual con corte automático y alerta al pasar el umbral.
- `CopilotWidget`: botón flotante y panel, con tamaño de texto ajustable,
  dictado y voto por respuesta.
- `CopilotStorage` como interfaz, con implementación sobre Supabase.
- Guardas de corpus para CI: cobertura de rutas, sincronía del generado, techo de
  tokens, ids válidos y etiquetas de botón vivas contra el JSX.
