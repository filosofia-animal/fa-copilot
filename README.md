# @fa/copilot

El copiloto de ayuda in-app: un chat flotante que explica **cómo se usa** un
sistema. No consulta la base, no navega la web, no ejecuta nada. Lo único que
sabe es el manual que el propio repo tiene versionado.

Nació en fa-ventas y se extrajo acá para que el resto de los sistemas internos
lo monten sin reescribirlo. **Lo reusable es todo esto; lo que cada sistema
tiene que escribir es el manual.**

Se instala como dependencia git, apuntando a un tag:

```json
"@fa/copilot": "git+https://github.com/filosofia-animal/fa-copilot.git#v0.2.2"
```

El repo es público, así que no hace falta ninguna credencial: `npm ci` lo clona
igual en tu máquina, en CI y en el build de Vercel. Se escribe con la forma
`git+https` a propósito, y no con el atajo `github:`: el atajo hace que npm
normalice la dependencia a `ssh://git@github.com/…` en el `package-lock`, y esa
forma sale a buscar una clave SSH que en CI no existe.

Se distribuye como TypeScript sin compilar, así que el consumidor necesita
`transpilePackages: ["@fa/copilot"]` en su `next.config.ts`.

## Tailwind tiene que escanear el paquete

El paquete **no trae CSS**: el widget se pinta con clases de Tailwind y las
genera el Tailwind del sistema que lo monta. Tailwind ignora `node_modules` por
diseño, así que hay que declararlo a mano en el CSS global:

```css
@import "tailwindcss";
@source "../node_modules/@fa/copilot/src";
```

La ruta es relativa al archivo CSS. En Tailwind 3 el equivalente va en
`tailwind.config`, sumando `"./node_modules/@fa/copilot/src/**/*.{ts,tsx}"` a
`content`.

Sin esa línea no falla nada: `npm ci` pasa, el build pasa, los tipos pasan, el
widget monta y responde. Sale sin una sola de sus clases y el panel queda
desarmado sobre la pantalla — a pantalla completa, transparente y encima del
contenido. Y no se ve crudo sino a medio estilar, porque las clases genéricas que
el sistema ya usa en otro lado (`flex`, `border`, `rounded-full`) existen igual:
lo que falta es todo lo propio del widget, que son valores arbitrarios y
variantes `sm:` que no aparecen en ningún otro archivo del repo consumidor. Por
eso el síntoma manda a buscar el problema al componente y no al CSS.

Le pasó a fa-ventas en staging, justo al migrar el copiloto a este repo: mientras
el paquete vivió en `packages/` la detección automática de Tailwind lo alcanzaba
y nadie tuvo que declarar nada. El olvido aparece recién al consumirlo desde acá,
que es el único camino que existe hoy.

Conviene copiar la guarda de fa-ventas (`tests/unit/help-widget-styles.test.ts`):
compila el CSS global de verdad y exige que las clases del paquete salgan del
otro lado. Un detalle que no es obvio — las clases se leen del paquete instalado,
nunca se escriben en el test: Tailwind escanea también ese archivo, así que una
clase copiada como literal se generaría desde el propio test y la guarda pasaría
en verde con el `@source` borrado.

## No hace falta credencial

Este repo es **público**, y es la única razón por la que instalarlo es una línea
en el `package.json` y nada más. Vale la pena decir qué desaparece con eso,
porque estuvo ahí y costó: mientras fue privado, quien clonaba el paquete era
**npm**, con la URL del lockfile y por su cuenta, sin que interviniera la app de
GitHub del hosting. Cada sistema que lo consumía necesitaba entonces dos
credenciales distintas —una para GitHub Actions, otra para Vercel—, y verde en
una no decía nada de la otra. Con cuatro maneras de equivocarse que fallaban
todas con el mismo error de git, que parece de red y no dice qué falta:

- un token de organización que vence, y el día que vence se rompen todos los
  repos a la vez;
- `persist-credentials: false` en cada `actions/checkout`, porque si no la
  cabecera de autorización que deja el checkout le gana a la credencial de la
  URL y el clone falla con "Repository not found" mientras el token figura como
  nunca usado;
- el `insteadOf` sobre la forma `ssh://`, porque es la que npm deja en el
  lockfile por más que el `package.json` diga `https`;
- la variable de entorno en Vercel, por proyecto y en los tres entornos.

Nada de eso existe más. Si estás migrando un sistema que todavía tiene ese
andamiaje puesto, `docs/migrar-a-publico.md` dice qué se borra y en qué orden.

Lo que sí sigue siendo cierto: el paquete es reusable, el manual no. Acá no vive
contenido de ningún sistema —los tests corren contra `tests/fixtures/corpus.ts`—
y `docs/ayuda/` es del repo que lo monta. Que este repo sea público no expone el
manual de nadie.

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
   las variables `--copilot-*` a tus tokens de marca en el CSS global. Sin el
   `@source` de más arriba el widget sale sin estilos: es el paso que más se
   olvida y el que menos se parece a su síntoma.

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

## Desarrollo

```bash
npm ci
npm run typecheck
npm run lint
npm test
```

Los tests corren contra un corpus de prueba (`tests/fixtures/corpus.ts`), no
contra el manual de ningún sistema: el paquete tiene que poder verificarse solo.
Si un test necesita contenido de un manual real, ese test va en el repo del
sistema, no acá.

Las tres cosas que conviene no romper, porque fallan en silencio:

- **El system prompt es determinista.** El caché de Anthropic matchea por
  prefijo byte a byte. Una fecha o un id ahí adentro multiplica el costo por
  cinco sin que nada falle.
- **El cuerpo de las secciones no va al prompt.** Es lo que hace que el corpus
  pueda crecer sin que crezca el costo por consulta.
- **Las reglas de accesibilidad del prompt.** Son la diferencia entre una
  herramienta que la gente usa y una que abandona; se borran fácil al editar.

Hay un test para cada una. Si alguno falla, el arreglo va en el código, no en el
test.
