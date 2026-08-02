# Film con IA

Aplicación web que guía a un creador por un pipeline para producir un
cortometraje con IA, de una **idea vaga** al **montaje final**:

```
idea → guion → personajes (visual) → planos → paquete por clip → importar → ensamblar/exportar
```

Los **videos se generan manualmente fuera de la app**, en
[gemini.google.com](https://gemini.google.com/) (Gemini/Veo, image-to-video),
limitados a ~3 videos/día por cuenta de Google AI Pro. La app prepara **todo lo
necesario** para generar cada clip (un **keyframe** con los personajes ya
compuestos + el prompt de movimiento) y luego **consume los `.mp4`** para montar
el film.

## Consistencia de personajes (el núcleo)

Para que los personajes se mantengan iguales entre clips, la app:

1. Genera una **hoja de referencia** por personaje (Gemini 2.5 Flash Image),
   pudiendo **bloquearla** como ancla de consistencia.
2. Por cada plano genera un **keyframe** (fotograma inicial) condicionado con
   esas referencias, así el personaje aparece idéntico en la escena.
3. El usuario sube ese keyframe a Gemini y usa **image-to-video**, anclando la
   apariencia en el clip.

## Requisitos

- **Node 20+** (probado con Node 22)
- **ffmpeg** y **ffprobe** en el `PATH`
- Claves de las suscripciones (Azure OpenAI + Gemini) — ver más abajo

## Puesta en marcha

```bash
npm install
```

Copia `.env.example` a `.env.local` y rellena las claves desde
`suscripciones.txt` (Azure OpenAI para texto, Gemini para imagen). `.env.local`
está en `.gitignore` — **nunca se commitea**.

```bash
npm run db:push   # crea la base SQLite (prisma/dev.db)
npm run dev       # arranca en http://localhost:3000
```

Comprueba el estado de los proveedores en **/health** (valida texto, imagen y
ffmpeg; incluye pruebas en vivo).

## Modelos usados

| Tarea | Modelo | Slot |
|---|---|---|
| Guion (creativo) | `gpt-5.4-pro` (por defecto) **o** `gemini-3.6-flash` (AI Studio) | FOUNDRY_NARRATIVE / AISTUDIO |
| Concepto / personajes / planos (JSON) | `gpt-4.1` (chat) | ACCENTURE→STUDENTS |
| Imágenes (refs + keyframes) | `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite; + FLUX.2-pro fallback) | GEMINI free→paid |

> `gpt-5.4-pro` puede tardar **hasta ~15 min** en responder; no es un fallo.
> Por eso solo se usa para el guion; el resto usa `gpt-4.1` (segundos).

**Selector de modelo del guion:** puedes elegir el modelo **antes de generar**
(en el paso «Idea», junto a Auto-borrador) y también en el paso «Guion». Por
defecto usa `gpt-5.4-pro` (Azure). Si eliges `gemini-3.6-flash` (AI Studio,
nivel gratuito, ~14 s) aparece un campo de **API Key** autocompletado desde
`AISTUDIO_API_KEY` del `.env.local` (editable). La elección se guarda por
proyecto y la respetan tanto **Auto-borrador** como la generación del guion.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma + SQLite ·
ffmpeg. Una sola app full-stack.

- `src/lib/providers/` — texto (Azure OpenAI), imagen (Gemini/FLUX), audio (stub)
- `src/lib/pipeline/` — prompts y formatos (concepto, guion, personajes, planos)
- `src/lib/media/` — ffmpeg (probe, normalizar, concatenar) y almacenamiento
- `src/app/projects/[id]/{idea,script,characters,shots,packages,assembly}` — etapas
- `data/projects/<id>/` — media por proyecto (gitignored)

## Notas

- **Audio** (Suno / ElevenLabs) está **diferido**: hay interfaces stub y el
  montaje deja un hueco para una pista de audio opcional en el futuro.
- La generación de video es **manual/externa**; la app no llama a ninguna API de
  video, solo arma paquetes e ingiere los `.mp4` resultantes.
- Los planos se dimensionan a **~10 s** (duración por defecto de los clips de
  Gemini Omni), configurable por plano (2–10 s).
- **Política de video de Gemini:** los prompts de guion, planos y video se
  generan con directrices para cumplir la política de Gemini (contenido apto,
  sin violencia gráfica, contenido sexual, actos peligrosos ni odio), reduciendo
  los rechazos al generar los clips. Si aun así Gemini rechaza un clip, suaviza
  la descripción del plano.
- El montaje normaliza cada clip (resolución/fps del proyecto, audio estéreo
  48 kHz; añade silencio si el clip no trae audio) y concatena con ffmpeg.
