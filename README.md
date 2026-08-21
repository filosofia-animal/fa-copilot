# @fa/copilot

El copiloto de ayuda in-app: un chat flotante que explica **cómo se usa** un
sistema. No consulta la base, no navega la web, no ejecuta nada. Lo único que
sabe es el manual que el propio repo tiene versionado.

Nació en fa-ventas y se extrajo acá para que el resto de los sistemas internos
lo monten sin reescribirlo. **Lo reusable es todo esto; lo que cada sistema
tiene que escribir es el manual.**

Se instala como dependencia git, apuntando a un tag:

```json
"@fa/copilot": "github:filosofia-animal/fa-copilot#v0.1.0"
```

Se distribuye como TypeScript sin compilar, así que el consumidor necesita
`transpilePackages: ["@fa/copilot"]` en su `next.config.ts`.

Y como este repo es privado, `npm ci` necesita credenciales para clonarlo:

- **Vercel**: darle acceso a este repo a su app de GitHub. No hay token que
  guardar ni rotar.
- **GitHub Actions**: el `GITHUB_TOKEN` que Actions inyecta sirve sólo para el
  repo donde corre, así que hace falta un token de lectura como secreto de
  organización y una línea antes de `npm ci`:

  ```yaml
  - run: git config --global url."https://x-access-token:${{ secrets.FA_COPILOT_TOKEN }}@github.com/".insteadOf "https://github.com/"
  - run: npm ci
  ```

  Sin eso el build falla con un error de git que parece de red y no dice qué
  falta. Es lo primero que se rompe al instalar el paquete en un sistema nuevo.

## Qué trae

| Entrada | Qué es |
|---|---|
| `@fa/copilot` | Los tipos. `CopilotConfig` es el contrato. |
| `@fa/copilot/server` | El handler del endpoint, el prompt, los límites, el costo. |
| `@fa/copilot/react` | `CopilotWidget`: el botón flotante y el panel. |
| `@fa/copilot/build` | Compila los `.md` a corpus y corre las guardas en CI. |
| `@fa/copilot/storage/supabase` | Persistencia sobre dos tablas de Supabase. |
| `@fa/copilot/theme.css` | Las variables `--copilot-*` con valores por defecto. |

## Cómo está armado

**El manual en dos niveles.** El núcleo (`docs/ayuda/*.md`) viaja en el system
prompt de cada consulta. Las secciones (`docs/ayuda/secciones/*.md`) no: en el
prompt va sólo un catálogo de una línea por sección, y el modelo pide la que
necesita con la herramienta `leer_seccion`. Es lo que permite que el corpus
crezca sin que crezca el costo por consulta — en fa-ventas el corpus es de
~20.700 tokens y por consulta viajan ~10.700.

**El prefijo se cachea.** `buildSystemPrompt(identity, corpus)` depende sólo de
esos dos argumentos y de nada más. El prompt caching de Anthropic matchea por
prefijo byte a byte: meter una fecha, un nombre o un id ahí adentro invalida el
caché en cada consulta y multiplica el costo por cinco sin romper nada visible.
Hay un test de determinismo; si lo hacés fallar, sacá lo volátil, no relajes el
test.

**El manual cita botones y eso se verifica.** En los `.md` los botones se
escriben `[[Cerrar como ganado]]`. Al modelo se le entregan en negrita, y
`checkCorpus` verifica contra el JSX que ese texto siga existiendo. Es la guarda
que evita que el copiloto siga mandando a la gente a un botón que se renombró.

## Montarlo en un sistema

1. **Corpus.** Escribí `docs/ayuda/*.md` (núcleo) y `docs/ayuda/secciones/*.md`.
   Cada sección arranca con un `# Título` y un primer párrafo que funciona como
   resumen: eso es lo que ve el modelo en el catálogo, así que tiene que decir
   *cuándo* abrir la sección.
2. **Scripts.** Dos archivos finos que sólo aportan los paths de tu repo, y le
   pasan el resto a `writeCorpus` / `checkCorpus`. Sumá `copilot:check` a CI.
3. **Tablas.** Dos: conversaciones y uso. Ver `storage/supabase.ts` para las
   columnas, o implementá `CopilotStorage` contra lo que tengas.
4. **Config.** Un `CopilotConfig`: identidad, corpus, storage, quién puede usarlo
   y los límites. Conviene partirlo en dos módulos —el determinista (identidad +
   corpus) y el que toca la base— para poder importar el primero desde los tests
   sin arrastrar el entorno.
5. **Endpoint.** `export const { POST, GET } = createCopilotHandler(config)`.
6. **Widget.** `<CopilotWidget endpoint="..." submitFeedback={...} />` y mapeá
   las variables `--copilot-*` a tus tokens de marca en el CSS global.

`docs/copiloto-replicar.md` en fa-ventas tiene el paso a paso completo, con lo
que cuesta cada parte y con qué se equivoca uno.

## Lo que el copiloto no hace, a propósito

- No lee la base. Si le preguntan un dato, deriva.
- No recibe la ruta real: el server enmascara `/leads/9f3a…` a `/leads/[id]`
  antes de que salga nada hacia la API. Nunca viaja PII por el contexto.
- No confía en el cliente para los permisos: se revalidan contra la base en cada
  request.
- No abre más de dos secciones por consulta, y en la última ronda se le sacan
  las herramientas. Es el techo de costo por consulta.
