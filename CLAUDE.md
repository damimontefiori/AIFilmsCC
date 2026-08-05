# CLAUDE.md — Film con IA (aifilms)

Contexto rápido del proyecto para trabajar con eficacia. Referencia profunda en
[`docs/CONTEXTO_PROYECTO.md`](docs/CONTEXTO_PROYECTO.md). **Todo el proyecto está en español** (código,
comentarios, UI y prompts); mantén ese idioma al escribir código y textos.

## Qué es
App web (Next.js 15 App Router, un solo usuario, local) que produce un
**cortometraje con IA** por etapas: **idea → concepto → guion → personajes →
escenarios → planos → keyframes → paquetes → montaje**.

Clave: **la app NO genera vídeo ni audio**. Genera texto (guion, prompts) e
imágenes (referencias, escenarios, keyframes), y por cada plano entrega un
**paquete** (keyframe + capas de referencia + prompt image-to-video) que el
usuario pega **a mano en la app de Gemini** para generar el clip, usando varias
cuentas de Google con cuota diaria. Luego importa los clips y los ensambla con
**ffmpeg**.

## Stack
Next.js 15.1.6 · React 19 · TypeScript (ESM) · Tailwind 4 · Prisma 6 + **SQLite**
· Zod · ffmpeg/ffprobe (binarios del sistema). Sin tests, sin auth.

## Comandos
```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run lint         # next lint
npm run db:push      # aplicar prisma/schema.prisma a SQLite
npm run db:studio    # inspeccionar la DB
```

## Arquitectura (dónde vive qué)
- `src/app/**` — páginas de etapa (`projects/[id]/{idea,script,characters,locations,shots,packages,assembly}`) y `src/app/api/**/route.ts` (backend).
- `src/components/pipeline/**` — una vista por etapa; `src/components/ui/**` — primitivos.
- `src/lib/config.ts` — env + slots de proveedores. `src/lib/model-choice.ts` — `projectTextChoice()` resuelve el modelo LLM de TODO el proyecto desde `project.scriptModel`.
- `src/lib/pipeline/**` — lógica LLM y **constructores de prompt** (`concept`, `script`, `characters`, `locations`, `shots`), esquemas Zod (`types.ts`) y `safety.ts`.
- `src/lib/providers/{text,image,audio}/**` — clientes + failover. `text/index.ts` = `generateNarrative`/`generateStructured`; `image/index.ts` = `generateImage`.
- `src/lib/{projects,characters,locations,shots,accounts}.ts` — data-access (Prisma). `src/lib/media/{store,ffmpeg}.ts` — disco y montaje. `src/lib/paths.ts` — layout de `DATA_DIR`.

## Modelo de datos (Prisma / SQLite)
`Project → Location → Encuadre`, `Project → Character`, `Project → Scene → Shot`,
`Account`/`AccountUsage`, `Export`, `ProviderSetting` (config de proveedores en
runtime, key-value). Campos array/objeto se guardan como **String JSON** → usar
`parseJson`/`toJson` de `src/lib/serialize.ts`. Conceptos:
- **Location.description** = "biblia de objetos"; **Location.imagePath** = imagen canónica SIN personas.
- **Encuadre** = otra toma de la misma locación (sin personas).
- **Character.canonicalDescription** = ancla de consistencia; `referenceImages` = JSON.
- **Shot.renderMode** = `composite` (insertar personas en el ambiente) | `direct`; `encuadreId`/`locationId` = overrides por plano.

## Proveedores de IA (failover)
- **Texto**: el modelo elegido en el proyecto (`project.scriptModel`, vía `projectTextChoice`) gobierna **TODAS** las llamadas LLM del pipeline, no solo el guion. Modelos seleccionables en Idea (`src/lib/pipeline/script-models.ts`):
  - **`gpt-5.4-pro`** (por defecto, Azure Responses, **puede tardar ~15 min**): narrativo para el guion; estructurado (concepto, extracciones, planos, momento) = `gpt-5.4-mini` (foundry) → `gpt-5.4-mini` (DamiOpenAIText) como respaldo. **Sin gpt-4.1.**
  - **Gemini AI Studio**: se usa en **todo** el pipeline (guion + estructurado).
  - **`gpt-5.6` (Sol/Luna, Azure Students)**: `gpt-5.6-sol` para el guion y `gpt-5.6-luna` para el resto. **Sin fallback** (si falla, se informa el error).
- **Imagen**: Gemini "Nano Banana" free → paid, luego FLUX.2-pro (Accenture) como fallback.
- **Audio**: diferido (stubs Suno/ElevenLabs).
- **Configuración en runtime**: la página `/settings` gestiona endpoints/modelos/keys por proveedor y un **playground** por modelo. Se guardan en `ProviderSetting` (DB) y **tienen prioridad sobre las variables de entorno** (`config.ts` lee `DB ?? env` vía la caché de `src/lib/settings.ts`; catálogo de slots en `src/lib/provider-catalog.ts`; ejecución por modelo en `src/lib/model-runner.ts`; API en `src/app/api/settings/**`). Las API keys **nunca** viajan al cliente sin enmascarar.

## Convenciones (respétalas al editar)
- Rutas API: `runtime="nodejs"`, `dynamic="force-dynamic"`, `maxDuration` en las lentas. Params de Next 15 son `Promise`: `const { id } = await params`.
- PATCH con **whitelist** de campos. JSON de SQLite siempre vía `parseJson`/`toJson`; DTOs (`src/lib/dto.ts`) deserializan en la frontera server→client.
- `withRetry` envuelve llamadas LLM/imagen. `extractJson` tolera fences ```json.
- Fetch cliente vía `jsonFetch` (`src/lib/api-client.ts`); media vía `mediaUrl()`.
- Prompts de imagen/vídeo: **etiquetas en inglés**, valores en el idioma del contenido. Mantén `GEMINI_VIDEO_SAFETY`/`REALISM_DIRECTIVE`/`SAFE_NEGATIVES` en los prompts (evitan rechazos de la política de Gemini e inconsistencias de estética).

## Gotchas
- La consistencia de personajes depende del **emparejado difuso** de nombres (`src/lib/match-characters.ts`): el desglose nombra a los personajes distinto que la extracción.
- El slot narrativo (`gpt-5.4-pro`) es lento a propósito; no lo uses para tareas rápidas.
- Los keyframes de plano se guardan con prefijo `<sid>-` para poder borrarlos sin tocar imágenes de locación/encuadre compartidas.
- Peticiones git explícitas del usuario (rollback/reset) se ejecutan directo, sin pre-chequeos que hagan esperar.
