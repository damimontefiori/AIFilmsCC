import { generateNarrative, extractJson } from "@/lib/providers/text";
import { geminiGenerateText } from "@/lib/providers/text/gemini";
import { defaultAiStudioKey } from "@/lib/config";
import { promptLangName } from "@/lib/languages";
import { withRetry } from "@/lib/utils";
import { scriptModelById, DEFAULT_SCRIPT_MODEL } from "./script-models";
import { GEMINI_VIDEO_SAFETY } from "./safety";
import {
  ScriptDocSchema,
  estimateClipCount,
  type ScriptBeat,
  type ScriptDoc,
  type ScriptScene,
} from "./types";

export type ScriptModelChoice = {
  model?: string;
  apiKey?: string;
};

export type ScriptInput = {
  idea: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string;
  tone: string;
  styleBible: string;
  language: string;
  targetDurationSec: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function coerceBeat(b: any): ScriptBeat | null {
  if (!b || typeof b !== "object") {
    const t = str(b);
    return t ? { type: "action", text: t } : null;
  }
  const isDialogue =
    b.type === "dialogue" || (!b.type && (b.character || b.speaker)) || b.line;
  if (isDialogue) {
    const line = str(b.line ?? b.text ?? b.dialogue);
    if (!line) return null;
    return {
      type: "dialogue",
      character: str(b.character ?? b.speaker),
      line,
      parenthetical: b.parenthetical ? str(b.parenthetical) : undefined,
    };
  }
  const text = str(b.text ?? b.action ?? b.description);
  return text ? { type: "action", text } : null;
}

function coerceScene(s: any, index: number): ScriptScene {
  const beats = Array.isArray(s?.beats)
    ? s.beats.map(coerceBeat).filter((x: ScriptBeat | null): x is ScriptBeat => !!x)
    : [];
  const chars = Array.isArray(s?.characters)
    ? s.characters.map(str).filter(Boolean)
    : [];
  return {
    order: typeof s?.order === "number" ? s.order : index + 1,
    heading: str(s?.heading),
    location: str(s?.location),
    timeOfDay: str(s?.timeOfDay ?? s?.time_of_day),
    summary: str(s?.summary),
    characters: chars,
    beats,
  };
}

function coerceScriptDoc(raw: any, input: ScriptInput): ScriptDoc {
  const scenesRaw = Array.isArray(raw?.scenes) ? raw.scenes : [];
  const scenes = scenesRaw
    .map((s: any, i: number) => coerceScene(s, i))
    .map((s: ScriptScene, i: number) => ({ ...s, order: i + 1 }));
  const doc = {
    title: str(raw?.title) || input.title,
    logline: str(raw?.logline) || input.logline,
    synopsis: str(raw?.synopsis) || input.synopsis,
    genre: str(raw?.genre) || input.genre,
    tone: str(raw?.tone) || input.tone,
    styleBible: str(raw?.styleBible) || input.styleBible,
    scenes,
  };
  return ScriptDocSchema.parse(doc);
}

/**
 * Genera un guion estructurado para un cortometraje, dimensionado a la
 * duración objetivo (~8s por clip). Usa el modelo de razonamiento.
 */
export async function generateScript(
  input: ScriptInput,
  choice: ScriptModelChoice = {},
): Promise<ScriptDoc> {
  const lang = promptLangName(input.language);
  const clips = estimateClipCount(input.targetDurationSec);
  const sceneHint = Math.max(2, Math.min(8, Math.round(clips / 2)));

  const system = [
    "Eres un guionista de cine premiado, especializado en cortometrajes con nivel de festival.",
    `Escribe TODO en ${lang}, con oficio profesional.`,
    "",
    "REGLA DE ORO — AUTO-CONTENIDO Y COMPRENSIBLE (la más importante):",
    "El espectador SOLO ve y oye lo que ocurre en los 'beats' (la acción convertida en video + el diálogo hablado). NUNCA lee la sinopsis, ni los 'summary', ni las descripciones de acción. Por tanto:",
    "- TODO lo que el público necesita para entender la historia debe estar en la ACCIÓN VISIBLE o en el DIÁLOGO HABLADO.",
    "- PROHIBIDO poner en las líneas de acción información que NO se pueda VER en pantalla. Ejemplo de error: 'un casete que era de su hermana desaparecida' → el video solo muestra un casete; el público no puede saber eso. Si un dato del pasado importa, DRAMATÍZALO en pantalla (un recuerdo/flashback visible, una foto que el público vea con claridad, una acción reveladora) o DILO en diálogo de forma natural.",
    "- PROHIBIDO diálogo críptico que dependa de contexto no mostrado. Ejemplo de error: 'yo solté su mano ese día' → ¿la mano de quién?, ¿qué día? Primero se establece en pantalla, o la línea se hace auto-explicativa.",
    "- ESTABLECER → DESARROLLAR → PAGAR: cada elemento (personaje, objeto, deseo, miedo, secreto, amenaza) se presenta, se desarrolla y se resuelve de forma VISIBLE. Sin hilos sueltos.",
    "- SIMPLICIDAD para el formato: con pocos clips y diálogo escaso, la trama y el arco emocional deben ser SIMPLES y LEGIBLES. NO metas backstory ni subtramas que no se puedan dramatizar en los planos disponibles; si no cabe en pantalla, no va.",
    "",
    "PRINCIPIOS DE OFICIO (obligatorios):",
    "- Narrativa VISUAL: cuenta con imágenes y acción; muestra, no cuentes. Las líneas de acción describen SOLO lo que la cámara ve (comportamiento, objetos, expresiones), nunca significados ni pasados invisibles.",
    "- Estructura con arco CLARO: presentación (quiénes son, dónde, qué quieren) → detonante → escalada de conflicto → giro/clímax → desenlace. Cada parte debe entenderse por lo que se ve/oye.",
    "- Diálogo con SUBTEXTO pero CLARO: breve y natural; con subtexto, pero sin volverse incomprensible. Nada expositivo ni que narre lo que ya vemos.",
    "- Voces diferenciadas y economía: si una línea no aporta, se elimina.",
    "- Especificidad sensorial; evita clichés, moralejas y finales predecibles.",
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences de markdown.",
    "",
    GEMINI_VIDEO_SAFETY,
  ].join(" ");

  const user = [
    `Concepto:`,
    `- Título: ${input.title}`,
    `- Logline: ${input.logline}`,
    `- Sinopsis: ${input.synopsis}`,
    `- Género: ${input.genre}`,
    `- Tono: ${input.tone}`,
    `- Estilo visual: ${input.styleBible}`,
    input.idea ? `- Idea original: ${input.idea}` : "",
    "",
    `El cortometraje dura ~${input.targetDurationSec}s y se construirá con ~${clips} clips de ~10s.`,
    `Escribe un guion CONCISO con aproximadamente ${sceneHint} escenas, respetando el arco completo.`,
    "Cada escena debe cumplir un propósito dramático y avanzar la historia; ábrela lo más tarde posible y ciérrala lo antes posible.",
    "Prioriza acción visual clara y rodable; el diálogo, mínimo y con subtexto pero comprensible.",
    "El primer beat debe ser una imagen que enganche; el último, un remate con significado.",
    "",
    "El concepto/sinopsis es MATERIA PRIMA: adáptalo para que sea 100% narrable EN PANTALLA con este formato. Si la premisa depende de backstory u contexto que no se puede mostrar, DRAMATÍZALO en un beat visible (recuerdo/foto/objeto revelador o diálogo claro) o SIMPLIFÍCALO. No dejes que el espectador dependa de la sinopsis para entender.",
    "Mantén el reparto CONSISTENTE: el mismo número y nombres de personajes en toda la historia (coherente con la sinopsis).",
    "",
    "AUTO-CHEQUEO antes de responder: imagina a un espectador que SOLO ve los clips (sin leer nada). ¿Entiende quiénes son, qué quiere el/la protagonista, qué está en juego, cuál es el giro y cómo termina, usando SOLO acción visible y diálogo hablado? Reescribe o dramatiza cualquier cosa que no pase esta prueba; ELIMINA todo dato que no se pueda ver ni oír.",
    "",
    "Devuelve un JSON con esta forma EXACTA:",
    "{",
    '  "title": string,',
    '  "logline": string,',
    '  "synopsis": string,',
    '  "genre": string,',
    '  "tone": string,',
    '  "styleBible": string,',
    '  "scenes": [',
    "    {",
    '      "order": number,',
    '      "heading": string (formato guion, p.ej. "INT. FARO - NOCHE"),',
    '      "location": string,',
    '      "timeOfDay": string,',
    '      "summary": string (1-2 frases de qué ocurre),',
    '      "characters": string[] (nombres que aparecen),',
    '      "beats": [',
    '        {"type":"action","text": string} |',
    '        {"type":"dialogue","character": string,"line": string,"parenthetical"?: string}',
    "      ]",
    "    }",
    "  ]",
    "}",
    "Mantén los diálogos breves y cinematográficos. No incluyas nada fuera del JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const modelId = choice.model || DEFAULT_SCRIPT_MODEL;
  const modelOpt = scriptModelById(modelId);

  // Reintenta ante fallos transitorios o JSON malformado (2 intentos: el
  // modelo de razonamiento es costoso, no conviene reintentar de más).
  return withRetry(
    async () => {
      let text: string;
      if (modelOpt?.provider === "aistudio") {
        // Gemini (AI Studio, nivel gratuito) — rápido.
        const apiKey = choice.apiKey?.trim() || defaultAiStudioKey();
        if (!apiKey) {
          throw new Error(
            "Falta la API Key de AI Studio para el modelo seleccionado.",
          );
        }
        text = await geminiGenerateText({
          apiKey,
          model: modelId,
          system,
          user,
          jsonMode: true,
          maxTokens: 32768,
        });
      } else {
        // Azure (gpt-5.4-pro) — modelo de razonamiento por defecto.
        const r = await generateNarrative({
          system,
          user,
          jsonMode: true,
          maxTokens: 20000,
        });
        text = r.text;
      }
      const raw = extractJson<unknown>(text);
      return coerceScriptDoc(raw, input);
    },
    { attempts: 2 },
  );
}
