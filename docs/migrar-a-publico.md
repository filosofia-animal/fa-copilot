# Migrar los consumidores: de repo privado a repo público

Mientras `fa-copilot` fue privado, cada sistema que lo instalaba tenía que
cablear una credencial en dos lugares distintos —GitHub Actions y Vercel— para
que `npm ci` pudiera clonarlo. Ese andamiaje es lo que hacía que un PR sin
relación con el copiloto no pudiera mergear: `npm ci` está en todos los jobs, y
si el clone falla, falla todo el CI del repo con un error de git que parece de
red.

Con el repo público el andamiaje entero se borra. Este documento dice qué se
borra, en qué orden y cómo verificar cada paso.

**El orden importa.** Primero el repo público, después la limpieza de los
consumidores, y el token se revoca al final. Al revés, cada repo que todavía
espera la credencial queda con el CI rojo.

## Paso 1 — Hacer público el repo (una vez, en GitHub)

Settings → General → Danger Zone → **Change repository visibility** → Public.

Verificar sin credencial de por medio, en una terminal cualquiera:

```bash
git ls-remote https://github.com/filosofia-animal/fa-copilot.git HEAD
```

Si eso responde, npm puede clonarlo desde cualquier parte: CI, Vercel, la
máquina de cualquiera. Hasta que ese comando funcione, no sigas con el paso 2.

## Paso 2 — Limpiar cada consumidor

Por sistema. `fa-ventas` es el que tiene el andamiaje completo; los que se
montaron después pueden tener sólo una parte.

### 2.1 La dependencia: no se toca

Vale decirlo porque es contraintuitivo y porque el primer intento de esta
migración fue cambiarla. El `package-lock.json` dice:

```
"resolved": "git+ssh://git@github.com/filosofia-animal/fa-copilot.git#<sha>"
```

Eso parece que hay que arreglarlo —una URL ssh sale a buscar una clave que en CI
no existe— y no hay nada que arreglar:

- npm normaliza el `resolved` a la forma `ssh` para **toda** dependencia de
  GitHub, sin importar cómo esté escrita en el `package.json`. Escribirla como
  `git+https://…` no cambia el lockfile: probado, npm la vuelve a escribir en
  `ssh`.
- Y no importa, porque siendo el repo público npm la resuelve por https de todos
  modos. Verificado con npm 10 en un entorno sin `~/.ssh` y sin ninguna
  credencial: `npm install` y `npm ci` desde ese mismo lockfile instalan el
  paquete.

Así que el `package.json` queda como está, con el atajo `github:owner/repo#tag`,
y el lockfile no se regenera. Mientras el repo fue privado esa forma `ssh` sí era
la trampa: el `insteadOf` tenía que matchearla a ella y no a la `https`, y quien
reescribía sólo la `https` volvía a fallar con el mismo error creyendo que ya lo
había resuelto.

Lo que sí conviene revisar de paso: que el tag al que apunta el sistema sea el
que se quiere. Actualizarlo es un cambio aparte de esta limpieza —cambia el
código del copiloto— y va en su propio PR, con typecheck, tests y build.

### 2.2 Los workflows

Cada job que instalaba dependencias tenía dos cosas puestas por el repo privado:
el composite action con la credencial y el `persist-credentials: false` del
checkout. Ahora es lo de cualquier repo:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
```

- Reemplazar cada `uses: ./.github/actions/npm-install` (con su bloque `with:
  copilot-token:`) por los dos pasos de arriba.
- Borrar el directorio `.github/actions/npm-install`.
- Borrar el `persist-credentials: false` y el comentario que lo explica. Dejarlo
  no rompe nada —ningún job de CI pushea—, pero el comentario describe un
  problema que ya no existe y manda a buscarlo la próxima vez.

### 2.3 Vercel

- Borrar `scripts/vercel-install.sh`.
- Borrar el campo `installCommand` de `vercel.json`. Sin ese campo Vercel corre
  su install por defecto, que es lo que se quiere.
- En Project Settings → Environment Variables, borrar `FA_COPILOT_TOKEN` de
  Production, Preview y Development.

Hacer estos tres juntos: el script sin la variable falla a propósito y con un
mensaje claro, pero falla.

### 2.4 La documentación del propio consumidor

En `fa-ventas`, `docs/copiloto-instalar.md` es casi todo sobre la credencial.
Queda el `@source` de Tailwind y el `transpilePackages`, que no cambian. El resto
se borra.

### 2.5 Verificar

Un PR de la limpieza tiene que pasar el CI del repo entero, y el Preview de
Vercel tiene que buildear. Eso ya prueba las dos rutas: son las mismas dos que
antes había que probar por separado.

## Paso 3 — Recién ahora, retirar la credencial

Cuando ningún repo la use:

- Borrar el secreto de organización `FA_COPILOT_TOKEN` (Organization settings →
  Secrets and variables → Actions).
- Revocar el fine-grained token en la página de tokens de la cuenta que lo
  emitió.

Vale hacerlo y no dejarlo "por si acaso": un token que nadie usa es el que nadie
renueva, y cuando venza va a aparecer como sospechoso en el próximo build que
falle por cualquier otra cosa.

## Un sistema nuevo, desde ahora

Dos líneas y ninguna credencial:

```json
"@fa/copilot": "github:filosofia-animal/fa-copilot#v0.2.2"
```

```css
@import "tailwindcss";
@source "../node_modules/@fa/copilot/src";
```

Más `transpilePackages: ["@fa/copilot"]` en el `next.config.ts`, porque el
paquete se distribuye como TypeScript sin compilar.

El `@source` sigue siendo el paso que más se olvida, y el que menos se parece a
su síntoma: no falla nada —`npm ci` pasa, el build pasa, el widget monta y
responde— y el panel sale sin sus clases, desarmado sobre la pantalla. El README
lo explica en detalle.
