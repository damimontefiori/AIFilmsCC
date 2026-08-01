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
  /** Ejecuta el pase de revisión "script doctor" (por defecto true). */
  review?: boolean;
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

  // 1) Borrador. Reintenta ante fallos transitorios o JSON malformado.
  const draft = await withRetry(
    async () => {
      const text = await callScriptModel(system, user, choice, 20000, 32768);
      return coerceScriptDoc(extractJson<unknown>(text), input);
    },
    { attempts: 2 },
  );

  // 2) Pase de revisión "script doctor": corrige incoherencias y huecos de
  //    comprensión antes de fijar el guion. Si falla, conserva el borrador.
  if (choice.review === false) return draft;
  return reviewScript(draft, input, choice);
}

/** Llama al modelo de guion elegido (Azure razonamiento o Gemini AI Studio). */
export async function callScriptModel(
  system: string,
  user: string,
  choice: ScriptModelChoice,
  maxTokensAzure = 20000,
  maxTokensGemini = 32768,
): Promise<string> {
  const modelId = choice.model || DEFAULT_SCRIPT_MODEL;
  const modelOpt = scriptModelById(modelId);
  if (modelOpt?.provider === "aistudio") {
    const apiKey = choice.apiKey?.trim() || defaultAiStudioKey();
    if (!apiKey) {
      throw new Error("Falta la API Key de AI Studio para el modelo seleccionado.");
    }
    return geminiGenerateText({
      apiKey,
      model: modelId,
      system,
      user,
      jsonMode: true,
      maxTokens: maxTokensGemini,
    });
  }
  const r = await generateNarrative({ system, user, jsonMode: true, maxTokens: maxTokensAzure });
  return r.text;
}

/**
 * Pase de revisión "script doctor": revisa el borrador y CORRIGE incoherencias
 * y huecos de comprensión para que el film se entienda SOLO con lo visible +
 * hablado. Ante cualquier fallo devuelve el borrador sin tocar.
 */
export async function reviewScript(
  draft: ScriptDoc,
  input: ScriptInput,
  choice: ScriptModelChoice,
): Promise<ScriptDoc> {
  const lang = promptLangName(input.language);
  const system = [
    "Eres un EDITOR de guion / 'script doctor' exigente de cine.",
    `Trabajas en ${lang}.`,
    "Recibes un guion BORRADOR y lo CORRIGES para que el cortometraje sea coherente y COMPRENSIBLE viendo SOLO los clips.",
    "REGLA DE ORO: el espectador solo ve la acción (convertida en video) y oye el diálogo; NUNCA lee sinopsis ni resúmenes.",
    "Detecta y CORRIGE:",
    "- Datos en líneas de ACCIÓN que no se pueden VER (backstory, relaciones, motivos ocultos): dramatízalos en un beat visible (una imagen/objeto/foto que el público vea con claridad, o un flashback breve) o dilos en diálogo claro; si no se puede mostrar, elimínalo.",
    "- Diálogo CRÍPTICO que dependa de contexto no mostrado: hazlo auto-explicativo, o establece antes ese contexto en pantalla.",
    "- Elementos introducidos y NO resueltos (hilos sueltos): págalos o quítalos.",
    "- Incoherencias de trama, de reparto (nº y nombres de personajes) y de continuidad.",
    "- Arco poco claro: asegura presentación (quiénes/dónde/qué quieren), detonante, escalada, giro/clímax y desenlace, todo LEGIBLE en pantalla.",
    "Conserva lo que ya funciona y el tono/estilo; cambia SOLO lo necesario. Mantén una duración y nº de escenas similares.",
    "Devuelves EXCLUSIVAMENTE el guion COMPLETO corregido en el MISMO JSON, sin texto adicional ni fences.",
    "",
    GEMINI_VIDEO_SAFETY,
  ].join(" ");

  const compact = JSON.stringify({
    title: draft.title,
    logline: draft.logline,
    synopsis: draft.synopsis,
    genre: draft.genre,
    tone: draft.tone,
    styleBible: draft.styleBible,
    scenes: draft.scenes,
  });

  const user = [
    "Concepto de referencia:",
    `- Logline: ${input.logline}`,
    `- Sinopsis: ${input.synopsis}`,
    "",
    "AUTO-CHEQUEO a garantizar: un espectador que SOLO ve los clips (sin leer nada) entiende quiénes son, qué quiere el/la protagonista, qué está en juego, el giro y cómo termina, usando SOLO acción visible y diálogo.",
    "Corrige el siguiente guion borrador y devuelve el JSON corregido con la MISMA forma { title, logline, synopsis, genre, tone, styleBible, scenes: [ { order, heading, location, timeOfDay, summary, characters, beats: [ {type:'action',text} | {type:'dialogue',character,line,parenthetical?} ] } ] }.",
    "",
    "GUION BORRADOR (JSON):",
    compact.slice(0, 16000),
  ].join("\n");

  try {
    const text = await withRetry(
      () => callScriptModel(system, user, choice, 20000, 32768),
      { attempts: 2 },
    );
    const doc = coerceScriptDoc(extractJson<unknown>(text), input);
    return doc.scenes.length > 0 ? doc : draft;
  } catch {
    return draft;
  }
}
