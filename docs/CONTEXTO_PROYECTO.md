# Film con IA (aifilms) — Contexto técnico y funcional

> Documento de referencia profunda del proyecto. Pensado para dar contexto
> completo (a personas y a agentes) sin tener que releer todo el código.
> Complementa a [`CLAUDE.md`](../CLAUDE.md) (versión corta, auto-cargada por Claude Code).
>
> Última revisión del código: rama `main`. Todo el proyecto (código, comentarios y UI) está en español.

---

## 1. Qué es y para quién

**Film con IA** es una aplicación web (un solo usuario, uso local) que guía la
**producción de un cortometraje con IA**, de principio a fin, en un pipeline por
etapas. Convierte una **idea vaga** en un **guion estructurado**, extrae
**personajes** y **escenarios** con anclas de consistencia visual, desglosa el
guion en **planos (~10 s cada uno)**, genera **keyframes** (fotograma inicial de
cada plano) y produce, por plano, un **"paquete"** listo para animar.

### El punto clave del modelo de trabajo (human-in-the-loop)

La app **no genera el vídeo**. La generación de vídeo la hace el usuario
**manualmente en la app de Gemini (Omni/Veo)**, porque ese flujo es gratuito por
cuenta con **cuota diaria**. Por eso el producto se centra en:

1. Preparar todo el material creativo con consistencia (guion, personajes,
   escenarios, planos, keyframes).
2. Entregar por cada plano un **paquete de generación**: el keyframe + las
   imágenes de referencia (capas) + un **prompt image-to-video listo para pegar**
   en Gemini.
3. Gestionar **varias cuentas de Google** y su **cuota diaria** para repartir la
   generación.
4. **Importar** los clips resultantes y **ensamblarlos** con ffmpeg en el film
   final.

Todo lo que genera IA dentro de la app es **texto** (guion, descripciones,
prompts) e **imágenes** (referencias de personaje, imágenes de escenario,
keyframes). El vídeo y el audio quedan fuera (el audio está diferido; ver §12).

---

## 2. Stack tecnológico

| Área | Tecnología |
|---|---|
| Framework | Next.js **15.1.6** (App Router, Server Components) |
| UI | React **19**, Tailwind CSS **4**, `lucide-react` (iconos), `clsx` + `tailwind-merge` (`cn`) |
| Lenguaje | TypeScript 5.7 (ESM, `"type": "module"`) |
| ORM / DB | Prisma **6** sobre **SQLite** (`file:./dev.db`) |
| Validación | **Zod** (esquemas de guion/extracciones) |
| Media | **ffmpeg / ffprobe** (binarios del sistema, vía `spawn`) |
| IA texto | Azure OpenAI (Foundry + Accenture + Students) y Google AI Studio (Gemini) |
| IA imagen | Google Generative Language API (Gemini "Nano Banana") + FLUX.2-pro (Azure/BFL) como fallback |

No hay framework de tests, ni autenticación, ni capa de estado cliente (Redux,
etc.): el estado vive en el servidor (Prisma) y en el estado local de cada
componente cliente.

### Scripts (`package.json`)

```bash
npm run dev          # next dev
npm run build        # next build
npm run start        # next start
npm run lint         # next lint
npm run db:push      # prisma db push  (aplica el schema a SQLite)
npm run db:generate  # prisma generate
npm run db:studio    # prisma studio   (inspector de la DB)
# postinstall ejecuta prisma generate automáticamente
```

---

## 3. Estructura del repositorio

```
src/
  app/
    layout.tsx                     # shell global (header + nav Proyectos/Estado)
    page.tsx                       # home: lista de proyectos
    health/page.tsx                # estado de proveedores (texto/imagen/media/audio)
    projects/
      new/page.tsx                 # crear proyecto
      [id]/
        layout.tsx                 # carga proyecto + PipelineNav
        page.tsx                   # redirect → /idea
        idea/ script/ characters/ locations/ shots/ packages/ assembly/  (páginas de etapa)
    api/
      health/ (route + text + image)
      media/[...path]/route.ts     # stream de media desde disco
      accounts/ (route + [aid])
      projects/
        route.ts                   # GET lista / POST crear
        [id]/
          route.ts                 # GET/PATCH/DELETE proyecto
          refine/ autopilot/ script/    (LLM: concepto, borrador, guion)
          characters/ (route, extract, [cid], [cid]/reference)
          locations/  (route, extract, [lid], [lid]/image, [lid]/encuadres, .../[eid])
          scenes/[sceneId]/route.ts # asignar locación a escena
          shots/ (route, breakdown, refresh-prompts, [sid], [sid]/keyframe,
                  [sid]/suggest-moment, [sid]/generated, [sid]/clip)
          export/route.ts          # ensamblar + exportar mp4
      settings/ (route, test, playground)  # config de proveedores + test/playground
    settings/page.tsx              # UI de configuración de modelos
  components/
    pipeline/  (una vista por etapa: idea-editor, script-editor, characters-manager,
                locations-manager, shots-board, packages-view, assembly-view,
                pipeline-nav, projects-grid, new-project-form, script-model-picker,
                settings-manager)
    ui/        (button, card, field, misc, modal — primitivos)
  lib/
    config.ts          # lee DB (override) ?? env; slots de proveedores
    settings.ts        # caché de overrides (ProviderSetting) + get/save
    provider-catalog.ts# catálogo client-safe de slots/targets (UI + whitelist)
    model-runner.ts    # ejecuta test/playground contra UN proveedor concreto
    model-choice.ts    # projectTextChoice(): resuelve el modelo LLM del proyecto
    db.ts              # PrismaClient singleton
    paths.ts           # layout de DATA_DIR y claves relativas
    serialize.ts       # parseJson/toJson + tipo ReferenceImage
    dto.ts             # DTOs serializables server→client
    utils.ts           # cn, todayKey, withRetry, slugify
    languages.ts       # idiomas de contenido + promptLangName
    match-characters.ts# emparejado difuso nombre-plano ↔ personaje / escena ↔ locación
    projects.ts characters.ts locations.ts shots.ts accounts.ts framings.ts  (data-access)
    pipeline/
      types.ts         # esquemas Zod del guion + scriptToMarkdown + estimateClipCount
      stages.ts        # STAGES / ENABLED_STAGES
      script-models.ts # modelos seleccionables para el guion (client-safe)
      safety.ts        # GEMINI_VIDEO_SAFETY, SAFE_NEGATIVES, REALISM_DIRECTIVE
      concept.ts script.ts characters.ts locations.ts shots.ts  (lógica LLM + prompts)
    providers/
      text/  (index.ts, azure-openai.ts, gemini.ts)
      image/ (index.ts, gemini.ts, flux.ts, types.ts)
      audio/ (index.ts — DIFERIDO)
    media/
      store.ts         # guardar/leer archivos base64/buffer
      ffmpeg.ts        # probe + normalizar + concatenar
prisma/schema.prisma
data/                  # DATA_DIR (media por proyecto) — no versionado
```

---

## 4. Modelo de datos (Prisma / SQLite)

Los campos "array/objeto" se guardan como **String JSON** (portabilidad en
SQLite). Se (de)serializan con `parseJson`/`toJson` de [`serialize.ts`](../src/lib/serialize.ts).
Los mappers `to*DTO` son la frontera de deserialización server→client.

- **Project** — la película. Concepto (`idea`, `logline`, `synopsis`, `genre`,
  `tone`, `styleBible`), parámetros (`language`, `aspectRatio`,
  `targetDurationSec`), `scriptModel` (modelo LLM elegido para TODO el proyecto),
  `scriptJson` (guion estructurado serializado) y `scriptMarkdown` (render de
  solo lectura). `status` recorre `idea → concept → script → characters → shots
  → assembled` (informativo, el gating de UI es blando). Relaciona con
  Character, Location, Scene, Export.
- **Location** — escenario reutilizable. `description` = **"biblia de objetos"**
  (invariantes del lugar: materiales, props, luz). `imagePath` = **imagen
  canónica de referencia SIN personas** (ancla de apariencia). `locked`,
  `order`. Tiene `Encuadre[]`, `Scene[]`, `Shot[]`.
- **Encuadre** — una **toma concreta** de una Locación (general, cerrado, OTS…),
  imagen SIN personas derivada de la referencia canónica. Reutilizable por
  cualquier plano que necesite esa toma. Campos: `label`, `framingPrompt`,
  `imagePath`, `order`.
- **Character** — `canonicalDescription` (apariencia fija = ancla de
  consistencia), `personality`, `role`, `referenceImages` (JSON: array de
  `{path, kind, provider, prompt, createdAt}`), `locked`, `order`.
- **Scene** — `heading`, `summary`, `characterIds` (JSON string[]),
  `locationId` (locación por defecto de la escena, asignada por LLM). Tiene
  `Shot[]`.
- **Shot** — el plano (clip de ~10 s). Contenido: `actionDescription`,
  `keyframeMoment` (instante exacto a congelar), `cameraNotes`, `dialogueOrVO`,
  `characterIds` (JSON, **solo los visibles en el encuadre**), `durationSec`
  (fijo 10). Producción: `keyframePath`, `keyframePrompt`, `geminiPrompt`
  (prompt de vídeo listo para pegar), `renderMode` (`composite | direct`),
  `encuadreId` (toma elegida; null = usa la referencia canónica de la locación
  efectiva), `locationId` (override de locación **solo** para este plano),
  `assignedAccountId`, `videoPath`, `status`
  (`planned → keyframe_ready/package_ready → generated → imported`).
- **Account** — cuenta de Google para generar en Gemini. `label`, `email`,
  `dailyQuota` (default 3), `active`.
- **AccountUsage** — contador `count` por `(accountId, date=YYYY-MM-DD)`
  (`@@unique`). Alimenta `usedToday`/`remainingToday`.
- **Export** — un ensamblado. `status` (`pending|running|done|error`),
  `settings` (JSON), `outputPath`, `error`.
- **ProviderSetting** — override en runtime de la configuración de proveedores.
  Almacén clave-valor (`key` = nombre de la variable de entorno, `value` = su
  valor). Gestionado desde `/settings`; `config.ts` lee `DB ?? env`. Uso local
  monousuario: las keys se guardan en claro (mismo modelo de amenaza que
  `.env.local`) y **nunca** se exponen al cliente sin enmascarar. Ver §12.

Los borrados son en cascada (`onDelete: Cascade`) salvo `Scene.location` y
`Shot.location/encuadre` que son `SetNull` (si borras un encuadre, los planos
que lo usaban vuelven a la referencia canónica sin romperse).

---

## 5. El pipeline, etapa por etapa (funcional)

Las etapas están en [`stages.ts`](../src/lib/pipeline/stages.ts). El usuario avanza por
la barra numerada (`PipelineNav`). El gating es **blando**: la navegación deja
entrar a todas, pero las acciones concretas se bloquean (p. ej. extraer
personajes/escenarios y desglosar planos exigen guion guardado; exportar exige
≥1 clip importado).

### 1) Idea (`/projects/[id]/idea`)
- El usuario escribe una **idea** + ajustes (idioma, aspect ratio, duración).
- **Refinar concepto** → `POST /refine` → `refineConcept()` expande la idea a
  título/logline/sinopsis/género/tono + **biblia de estilo visual** (`styleBible`,
  clave para consistencia). Usa el slot **estructurado (rápido)**.
- **Auto-borrador** → `POST /autopilot` → encadena refinar + generar guion en una
  sola acción y salta a Guion (puede tardar minutos por el modelo de razonamiento).

### 2) Guion (`/projects/[id]/script`)
- **Generar guion** → `POST /script` → `generateScript()`. Produce un
  `ScriptDoc` (escenas con `beats` de tipo `action` o `dialogue`). Usa el slot
  **narrativo (razonamiento)** por defecto (`gpt-5.4-pro`), o Gemini AI Studio si
  se elige en el selector.
- Incluye un **pase "script doctor"** (`reviewScript`) que corrige incoherencias
  y "huecos de comprensión" (ver §6). Editable a mano y se guarda como
  `scriptJson` + `scriptMarkdown`.

### 3) Personajes (`/projects/[id]/characters`)
- **Extraer del guion** → `POST /characters/extract` → `extractCharacters()`
  crea personajes con **descripción canónica muy visual** (edad, etnia,
  complexión, cabello, rasgos, vestuario), pensada para dibujarlos igual en cada
  plano y **distintos entre sí**. Añade solo nombres nuevos (no destructivo).
- Por personaje: editar (autosave), **bloquear** (ancla), y generar **imágenes
  de referencia** (`portrait` 1:1 / `full_body` 9:16) con
  `POST /characters/[cid]/reference`. Puede reutilizar refs previas para mantener
  identidad.

### 4) Escenarios (`/projects/[id]/locations`)
- **Extraer del guion** → `POST /locations/extract` → `extractLocations()`
  agrupa escenas por lugar y escribe la **biblia de objetos** (props e
  invariantes).
- Por locación: generar **imagen canónica** (SIN personas) con
  `POST /locations/[lid]/image`; y crear **encuadres** (otras tomas del mismo
  lugar) con `POST /locations/[lid]/encuadres` (usa la canónica como referencia
  + la biblia de objetos para no cambiar el lugar). Plantillas de encuadre en
  lenguaje llano en [`framings.ts`](../src/lib/framings.ts).

### 5) Planos (`/projects/[id]/shots`)
- **Desglosar** → `POST /shots/breakdown` → `breakdownShots()` divide el guion en
  ~10 s por plano pensando en **cobertura profesional** (variar tamaños de plano,
  alternar quién está en cuadro, OTS, insertos…). `replaceBreakdown()` borra y
  recrea escenas/planos, asigna cada escena a una locación existente por
  **significado** (`assignScenesToLocations`, LLM que solo empareja, nunca crea) y
  precalcula el `geminiPrompt` de cada plano.
- Por plano: editar acción/momento/cámara/diálogo/personajes (autosave), elegir
  **modo de render** (Componer vs Directo), override de locación/encuadre (galería
  modal), **proponer con IA** el momento a congelar (`POST /shots/[sid]/suggest-moment`)
  y **generar keyframe** (`POST /shots/[sid]/keyframe`, con preview de prompt y
  override manual). Ver §7.

### 6) Paquetes (`/projects/[id]/packages`)
- Panel de **cuentas** (añadir/activar/borrar, cuota diaria) con sugerencia de la
  cuenta con más cuota restante hoy.
- Por plano, un **paquete**: keyframe (descargable) + **capas** (imagen del
  ambiente + referencias de personaje, para arrastrar a Gemini) + el **prompt
  image-to-video editable** (copiar al portapapeles). Botón **Marcar generado**
  (`POST /shots/[sid]/generated`) que contabiliza la cuota de la cuenta usada.
- **Refrescar prompts** (`POST /shots/refresh-prompts`) recalcula todos los
  `geminiPrompt` con el builder actual (útil tras cambiar la lógica de prompts).

### 7) Montaje (`/projects/[id]/assembly`)
- Por plano: **subir clip** (multipart a `POST /shots/[sid]/clip`, validado con
  `ffprobe`) o quitarlo.
- **Ensamblar y exportar** (`POST /export`) → `assembleFilm()` normaliza y
  concatena con ffmpeg → `exports/film-<ts>.mp4`, con reproductor inline y
  descarga.

---

## 6. Estrategia de prompts y de consistencia

La consistencia visual es el problema central del producto. El código la ataca
en varias capas (todas en [`pipeline/`](../src/lib/pipeline)):

- **Anclas textuales fijas**: `styleBible` (biblia de estilo del proyecto),
  `canonicalDescription` (personaje) y `description` (biblia de objetos de la
  locación) se inyectan en cada prompt para no derivar.
- **Anclas de imagen**: imágenes de referencia de personaje + imagen canónica de
  escenario. En generación de imagen se pasan como *reference images*
  (image-to-image).
- **Referencias etiquetadas** (`labeledReferences`): al componer varios
  personajes, cada uno va con su etiqueta y sus imágenes, con instrucción
  explícita de **no mezclar identidades** (evita que dos personajes se fusionen).
- **`REALISM_DIRECTIVE`** ([`safety.ts`](../src/lib/pipeline/safety.ts)): fija el medio de render
  (foto-realista live-action por defecto) para que todos los planos compartan
  estética, salvo que la biblia de estilo pida animación.
- **`GEMINI_VIDEO_SAFETY`**: bloque de seguridad inyectado en los prompts de
  guion/concepto/planos para que el contenido **no sea rechazado** por la política
  de la app de Gemini al convertirlo en vídeo (nada de gore, armas, sexual,
  odio…; conflicto resuelto de forma sugerida). `SAFE_NEGATIVES` es la versión
  corta para prompts de imagen.
- **"Regla de oro" del guion** ([`script.ts`](../src/lib/pipeline/script.ts)): el espectador
  solo ve la acción (convertida en vídeo) y oye el diálogo; **nunca** lee la
  sinopsis ni los `summary`. Por eso el prompt prohíbe meter en la acción datos
  no visibles y exige dramatizar el backstory. El **pase "script doctor"**
  (`reviewScript`) revisa el borrador y corrige esos huecos; si falla, conserva
  el borrador.
- **Emparejado difuso** ([`match-characters.ts`](../src/lib/match-characters.ts)): los nombres
  que usa el desglose ("Niña") no siempre coinciden con el registro de personaje
  ("La niña"). `matchCharacter` empareja por exacto → contención → solapamiento de
  tokens (sin acentos). *(Nota: un fallo previo de "personaje ausente en
  keyframes" fue en realidad un problema de emparejado de nombres, no un límite
  del modelo de imagen.)*

### Constructores de prompt (dónde vive cada uno)
- `buildReferencePrompt` (character sheet, fondo blanco) — [`characters.ts`](../src/lib/pipeline/characters.ts)
- `buildLocationPrompt` (establishing sin personas) y `buildEncuadrePrompt`
  (re-encuadre del mismo lugar) — [`locations.ts`](../src/lib/pipeline/locations.ts)
- `buildKeyframePrompt` (keyframe directo), `buildCompositePrompt` (insertar
  personas en el ambiente) y `buildGeminiVideoPrompt` (prompt image-to-video +
  **leyenda "quién es quién"**) — [`shots.ts`](../src/lib/pipeline/shots.ts)

---

## 7. Generación del keyframe: modos y resolución de ambiente

Toda la orquestación está en [`shots/[sid]/keyframe/route.ts`](../src/app/api/projects/[id]/shots/[sid]/keyframe/route.ts).

**Locación efectiva** = `shot.locationId ?? scene.locationId`. **Usa encuadre**
si el plano tiene un `encuadre` cuya `imagePath` existe y pertenece a la locación
efectiva; si no, usa la **imagen canónica** de la locación.

Tres caminos según `renderMode` y si hay personajes en cuadro:

1. **Directo** (`direct`): una sola pasada. `buildKeyframePrompt` + referencias
   etiquetadas (hasta 2 por personaje: retrato + cuerpo), sin lienzo base. Por
   defecto lo eligen los planos **sin personas** de tipo inserto/detalle/close-up.
2. **Componer con personajes** (`composite` + hay personajes): se toma la imagen
   del ambiente (encuadre elegido o canónico) como **lienzo base** y se
   **insertan** los personajes con `buildCompositePrompt` (1 referencia por
   personaje, cuerpo entero, para no mezclar identidades). Si se usa un encuadre,
   **no** se pasa la cámara (la toma ya está fijada); sobre la canónica **sí** se
   pasa para reencuadrar en un paso.
3. **Componer sin personajes**: el keyframe **es** directamente la imagen del
   ambiente (no se genera nada; `provider: "encuadre"`).

Detalles: `preview: true` devuelve el prompt sin generar; `promptOverride` se usa
tal cual; el keyframe anterior solo se borra si su ruta lleva el prefijo
`${sid}-` (nunca una imagen de locación/encuadre compartida).

---

## 8. Proveedores de IA y failover

Toda la lectura de credenciales está centralizada en [`config.ts`](../src/lib/config.ts)
(nada se expone al cliente). El **modelo del proyecto** (`project.scriptModel`)
gobierna TODAS las llamadas LLM vía `projectTextChoice()`
([`model-choice.ts`](../src/lib/model-choice.ts)).

### Texto ([`providers/text/`](../src/lib/providers/text))
El modelo elegido en Idea (`SCRIPT_MODELS`) define el comportamiento. Dos funciones de entrada:
- **`generateNarrative`** (idea, guion): AI Studio → Gemini; grupo **gpt-5.6** → `gpt-5.6-sol` (**sin fallback**); si no → **narrativo Azure** (`gpt-5.4-pro`, Responses, razonamiento) → cadena estructurada.
- **`generateStructured`** (concepto, personajes, escenarios, planos, momento…):
  AI Studio → Gemini; grupo **gpt-5.6** → `gpt-5.6-luna` (**sin fallback**); si no →
  **`gpt-5.4-mini`** (foundry, Responses v1) → **`gpt-5.4-mini`** (DamiOpenAIText, Responses clásico) como respaldo. **Sin gpt-4.1.**

`azure-openai.ts` despacha a **chat/completions** (`chat`) o a la **Responses API**
(gpt-5.x, `responses`). Detalles: los modelos de razonamiento gastan tokens
"thinking", así que hay un **piso** de `max_output_tokens`. El endpoint v1 (termina
en `/responses`) se usa tal cual; el clásico construye `/openai/responses?api-version=`.
`extractJson` tolera fences ```` ```json ````.

> **Latencia**: el slot narrativo `gpt-5.4-pro` puede tardar **hasta ~15 min**.
> Por eso `refineConcept`/tareas rápidas usan el slot **estructurado** (gpt-5.4-mini)
> y el razonamiento se reserva para el guion completo. Las rutas de guion/autopilot
> ponen `maxDuration = 900`. El grupo **gpt-5.6** (Sol/Luna) no tiene fallback:
> si falla (p. ej. sin crédito), el error se propaga para informarlo.

### Imagen ([`providers/image/`](../src/lib/providers/image))
`generateImage()` ([index.ts](../src/lib/providers/image/index.ts)) hace failover:
1. **Gemini** "Nano Banana" (`GEMINI_IMAGE_MODEL`, def. `gemini-3.1-flash-lite-image`):
   clave **free** (2 reintentos) → clave **paid** (2 reintentos).
2. **FLUX.2-pro** (Azure/BFL): Accenture (best-effort, soporta respuesta
   síncrona y patrón asíncrono `polling_url`; el body incluye `model`, exigido
   por el endpoint).

El cliente Gemini de imagen ([gemini.ts](../src/lib/providers/image/gemini.ts)) arma los `parts` en
tres modos: **edición/compositing** (imagen base primero como lienzo, luego refs
etiquetadas, luego prompt), **multi-sujeto etiquetado** (instrucción de no
mezclar identidades + refs + prompt) y **i2i simple**. El aspect ratio se fija
con `imageConfig.aspectRatio` (sin él Gemini devuelve ~1:1).

### Audio ([`providers/audio/`](../src/lib/providers/audio)) — **DIFERIDO**
Solo interfaces y stubs (`generateMusic` vía Suno, `generateVoice` vía
ElevenLabs) que lanzan "no implementado". El montaje deja un slot de audio
opcional para el futuro. `AUDIO_DEFERRED = true`.

---

## 9. Almacenamiento de media (disco)

Layout en `DATA_DIR` (def. `./data`), gestionado por [`paths.ts`](../src/lib/paths.ts) +
[`media/store.ts`](../src/lib/media/store.ts):

```
DATA_DIR/projects/<projectId>/
  characters/  <cid>-<kind>-<ts>.<ext>     # refs de personaje (portrait/full_body)
  keyframes/   loc-<lid>-<ts>.<ext>        # imagen canónica de locación
               enc-<lid>-<ts>.<ext>        # encuadres
               <sid>-<ts>.<ext>            # keyframes de plano (prefijo = borrado seguro)
  clips/       <sid><ext>                  # clips de vídeo importados
  exports/     film-<ts>.mp4               # ensamblados
  audio/                                   # (reservado, diferido)
```

- En la DB se guarda una **clave relativa** POSIX (`toRelative`); `/api/media/[...path]`
  la resuelve con `fromRelative` (**con guarda anti-path-traversal**) y hace stream
  con el `Content-Type` correcto y `Cache-Control: private, max-age=60`.
- `readMediaBase64` relee archivos para volver a alimentarlos como referencias en
  la generación (refs de personaje, imagen base de ambiente).

---

## 10. Montaje con ffmpeg ([`media/ffmpeg.ts`](../src/lib/media/ffmpeg.ts))

Binarios desde env (`FFMPEG_PATH`/`FFPROBE_PATH`, def. `ffmpeg`/`ffprobe`) vía
`spawn` (`windowsHide: true`). `assembleFilm` es en dos fases:

1. **Normalizar** cada clip a un formato canónico en un tmp dir: `scale` con
   `force_original_aspect_ratio=decrease` + `pad` (letterbox negro) + `setsar=1` +
   `fps`; vídeo `libx264 -preset medium -crf 20 -pix_fmt yuv420p`; audio `aac`
   48k estéreo 192k (sintetiza silencio `anullsrc` + `-shortest` si el clip no
   tiene audio). Dimensiones por aspect: 16:9→1280×720, 9:16→720×1280, 1:1→1080×1080; fps def. 24.
2. **Concatenar** con el demuxer `concat` (`-c copy -movflags +faststart`): copia
   de streams, sin recodificar de nuevo. La lista usa rutas con forward-slashes
   escapadas. El tmp dir se limpia siempre en `finally`.

`probe()` (ffprobe JSON) devuelve `{durationSec, width, height, fps, hasAudio, codec}`
y valida los clips subidos.

---

## 11. Gestión de cuentas y cuota ([`accounts.ts`](../src/lib/accounts.ts))

Como el vídeo se genera manualmente en Gemini con cuota diaria por cuenta de
Google, la app **rastrea** ese consumo:
- `listAccounts()` cruza el uso de **hoy** (`todayKey`, hora local) para dar
  `usedToday`/`remainingToday`.
- `suggestAccount()` sugiere la cuenta activa con más cuota restante.
- `bumpUsage` hace upsert de un contador por `(accountId, date)`. **Marcar
  generado** incrementa (y maneja reasignación de cuenta); **desmarcar** revierte.

---

## 12. Configuración y variables de entorno

Copiar [`.env.example`](../.env.example) a `.env.local` (nunca commitear claves). Grupos:

- **Texto narrativo** (`FOUNDRY_NARRATIVE_*`, `gpt-5.4-pro`, Responses).
- **Texto estructurado por razonamiento** (`FOUNDRY_MINI_*`, `gpt-5.4-mini`,
  endpoint v1 completo terminado en `/responses`) y su **respaldo**
  (`DAMI_MINI_*`, otro `gpt-5.4-mini` en DamiOpenAIText, Responses clásico).
- **Grupo GPT-5.6** (Azure Students, seleccionable en Idea): `SOL_*`
  (`gpt-5.6-sol`, guion) y `LUNA_*` (`gpt-5.6-luna`, resto). Sin fallback.
- **Imagen** Gemini (`GEMINI_FREE_API_KEY`, `GEMINI_PAID_API_KEY`,
  `GEMINI_IMAGE_MODEL`) y FLUX (`ACCENTURE_IMAGE_*`).
- **Guion alternativo** Gemini AI Studio (`AISTUDIO_API_KEY`,
  `AISTUDIO_SCRIPT_MODEL`; la key se autocompleta en la UI).
- **DB** (`DATABASE_URL`), **media** (`DATA_DIR`), **binarios**
  (`FFMPEG_PATH`, `FFPROBE_PATH`).

Cada slot es opcional: si falta, `config.ts` simplemente no lo añade a la cadena
de failover. Si no hay **ningún** proveedor de texto, las rutas LLM lanzan un
error explicativo.

### Configuración en runtime — página `/settings`

Los valores anteriores pueden **editarse sin tocar `.env.local`** desde la página
`/settings`, que los guarda en la tabla `ProviderSetting` (DB). **Precedencia:
override en DB > variable de entorno.**

- **Precedencia**: el `env()` de [`config.ts`](../src/lib/config.ts) consulta primero la caché de
  overrides ([`settings.ts`](../src/lib/settings.ts), `getOverride`) y cae a `process.env`. La caché se
  carga con `loadSettings()` (async) al inicio de `generateNarrative` /
  `generateStructured` / `generateImage` y en las rutas de settings/health; si no
  está cargada, se degrada limpiamente al valor de entorno. Guardar un valor
  vacío **borra** el override (vuelve a `.env`).
- **Catálogo**: [`provider-catalog.ts`](../src/lib/provider-catalog.ts) (client-safe) declara los *slots*
  (campos + texto "para qué se usa") y los *targets* de modelo probables. Es la
  fuente única para la UI y para el **whitelist** del backend.
- **Seguridad de keys**: la API (`GET /api/settings`) devuelve las API keys
  **enmascaradas** (`••••1234`) y con su `source` (`db`/`env`/`none`); nunca en
  claro. El `PATCH` ignora valores que contengan la máscara.
- **Playground / test por modelo**: [`model-runner.ts`](../src/lib/model-runner.ts) ejecuta una llamada
  real contra UN proveedor concreto. `POST /api/settings/test` hace un ping
  (imagen → genera 1 imagen, consume cuota); `POST /api/settings/playground`
  ejecuta el prompt del usuario (texto → devuelve texto; imagen → data URL). En
  la UI, cada modelo tiene botón **Probar** y un panel colapsable **Playground**.

---

## 13. Convenciones del código (para editar sin sorpresas)

- **Rutas API**: `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`,
  y `maxDuration` en las lentas (LLM/imagen 300, guion/autopilot 900, export 600,
  clip/suggest 120). Los params de Next 15 son **`Promise`** → `const { id } = await params`.
- **PATCH con whitelist**: las rutas de update solo aceptan campos permitidos
  (evita escrituras arbitrarias). `characters[]` se reserializa a `characterIds`.
- **JSON en SQLite**: siempre vía `parseJson`/`toJson`; los DTO deserializan en la
  frontera server→client.
- **Reintentos**: `withRetry` (backoff lineal) envuelve llamadas LLM (JSON
  malformado o 5xx transitorio) y la generación de imagen (por clave).
- **Cliente**: todo el fetch pasa por `jsonFetch` ([`api-client.ts`](../src/lib/api-client.ts))
  salvo subidas multipart (clip). Media vía `mediaUrl()`.
- **Idioma**: contenido en el idioma del proyecto (`promptLangName`); las
  **etiquetas** de los prompts de imagen/vídeo van en **inglés** (los modelos
  responden mejor), los **valores** en el idioma del contenido.
- **Los campos de formulario** en `field.tsx` piden a los gestores de contraseñas
  que los ignoren (evita autocompletado no deseado).

---

## 14. Limitaciones conocidas y trabajo diferido

- **Vídeo y audio**: fuera de la app. El vídeo lo genera el usuario a mano en
  Gemini; el audio (Suno/ElevenLabs) está en stub.
- **FLUX.2-pro**: cliente best-effort (el contrato exacto del endpoint no está
  documentado en el repo); es solo fallback de imagen.
- **Sin auth ni multiusuario**: pensado para uso local, un usuario. SQLite y
  `DATA_DIR` local.
- **Sin tests** automatizados ni CI.
- **Gating de etapas blando**: `ENABLED_STAGES` tiene todo a `true`; las guardas
  reales son por acción.
- **Export síncrono**: el ensamblado corre dentro del request (con `maxDuration`),
  no en una cola; hay un modelo `Export` pero no un worker.

---

## 15. Estado actual del repositorio (al escribir este doc)

`git status` en `main` muestra cambios sin commitear que corresponden a un
**refactor de selección de modelo por proyecto**: se añadió
[`src/lib/model-choice.ts`](../src/lib/model-choice.ts) (`projectTextChoice`) y se propagó `choice`
a través de `config.ts`, los proveedores de texto y todas las funciones de
`pipeline/*` y sus rutas, para que **el modelo elegido en el proyecto gobierne
todas las llamadas LLM** (no solo el guion). Commits recientes: mejoras de UX de
personajes/encuadres/planos, rediseño Locación→Encuadre→Keyframe, cambio a Nano
Banana 2 Lite para imagen y el pase "script doctor".

Cambios posteriores (esta sesión): (1) **fix del fallback FLUX** — `fluxGenerate`
ahora envía `model` en el body (el endpoint devolvía `no_model_name`) y se
**eliminó el proveedor Students de imagen** (solo queda Accenture). (2) Nueva
**sección de configuración `/settings`** (enfoque DB-override, ver §12) con un
**playground por modelo**: tabla `ProviderSetting`, `settings.ts`,
`provider-catalog.ts`, `model-runner.ts` y rutas `api/settings/**`.

---

## 16. Flujo de datos de un extremo a otro (resumen)

```
idea (texto)
  └─(refineConcept, estructurado)→ concepto + styleBible
        └─(generateScript + reviewScript, narrativo)→ ScriptDoc (scriptJson/markdown)
              ├─(extractCharacters)→ Character[] ──(reference img, Gemini)→ refs
              ├─(extractLocations)→ Location[] ──(image, Gemini)→ canónica ─→ Encuadre[]
              └─(breakdownShots + assignScenesToLocations)→ Scene[]/Shot[]
                    └─ por plano:
                        keyframe (composite: ambiente + refs de personaje, Gemini)
                        geminiPrompt (image-to-video, para pegar en Gemini a mano)
                        ↓ (usuario genera el clip en Gemini y lo sube)
                        clip (videoPath) ──(assembleFilm, ffmpeg)→ film-<ts>.mp4
```
