# Changelog

Versionado semántico. Cada versión es un tag en el repo; los sistemas apuntan a
un tag, no a una rama — así una mejora del copiloto nunca se cuela en un deploy
de otro sistema sin que alguien lo decida.

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
