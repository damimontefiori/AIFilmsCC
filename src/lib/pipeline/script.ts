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
    "PRINCIPIOS DE OFICIO (obligatorios):",
    "- Narrativa VISUAL: cuenta con imágenes y acción, no con explicaciones; muestra, no cuentes.",
    "- Estructura con arco: imagen de apertura potente → escalada con conflicto creciente → giro/revelación → botón final que resuene.",
    "- Diálogo con SUBTEXTO: breve, natural y específico de cada personaje; nada de frases obvias, expositivas ni que narren lo que ya vemos.",
    "- Voces diferenciadas: cada personaje habla distinto. Economía: si una línea no aporta, se elimina.",
    "- Especificidad sensorial y evita clichés, moralejas y finales predecibles.",
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
    "Prioriza acción visual clara y rodable; el diálogo, mínimo y con subtexto.",
    "El primer beat debe ser una imagen que enganche; el último, un remate con significado.",
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
