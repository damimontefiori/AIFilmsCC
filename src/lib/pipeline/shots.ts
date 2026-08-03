import { z } from "zod";
import { generateStructured, extractJson } from "@/lib/providers/text";
import { promptLangName } from "@/lib/languages";
import { withRetry } from "@/lib/utils";
import { estimateClipCount, type ScriptDoc } from "./types";
import { GEMINI_VIDEO_SAFETY, SAFE_NEGATIVES, REALISM_DIRECTIVE } from "./safety";

// Duración objetivo por clip: los videos de Gemini Omni duran ~10s.
export const CLIP_SECONDS = 10;

// ── Breakdown de escenas en shots ────────────────────────────────────────
export const BreakdownShotSchema = z.object({
  actionDescription: z.string().default(""),
  cameraNotes: z.string().default(""),
  dialogueOrVO: z.string().default(""),
  characters: z.array(z.string()).default([]),
  durationSec: z.number().default(CLIP_SECONDS),
});
export const BreakdownSceneSchema = z.object({
  order: z.number().default(0),
  heading: z.string().default(""),
  summary: z.string().default(""),
  shots: z.array(BreakdownShotSchema).default([]),
});
export type BreakdownScene = z.infer<typeof BreakdownSceneSchema>;

/**
 * Divide el guion en planos (~10s) listos para generar como clips.
 * Usa gpt-4.1 (rápido, JSON).
 */
export async function breakdownShots(input: {
  script: ScriptDoc;
  language: string;
  targetDurationSec: number;
}): Promise<BreakdownScene[]> {
  const lang = promptLangName(input.language);
  const totalClips = estimateClipCount(input.targetDurationSec);

  const system = [
    "Eres un director de cine y director de fotografía que planifica la cobertura (coverage) plano a plano.",
    `Escribe los textos en ${lang}.`,
    "Piensas en tamaños de plano y montaje profesional, no en un único plano general repetido.",
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
    "",
    GEMINI_VIDEO_SAFETY,
  ].join(" ");

  const compactScript = JSON.stringify(
    {
      title: input.script.title,
      styleBible: input.script.styleBible,
      scenes: input.script.scenes.map((s) => ({
        order: s.order,
        heading: s.heading,
        summary: s.summary,
        characters: s.characters,
        beats: s.beats,
      })),
    },
    null,
    0,
  ).slice(0, 14000);

  const user = [
    `Divide el guion en planos de ~10 s (los clips de Gemini Omni duran ~10 s; aprovéchalos). En total, ~${totalClips} planos.`,
    "",
    "PIENSA COMO DIRECTOR — cobertura profesional, NO el mismo plano general una y otra vez:",
    "- Varía los tamaños de plano: establishing/gran plano general, plano general, plano medio, primer plano, plano detalle/inserto, y over-the-shoulder (OTS).",
    "- Alterna quién está en cuadro: usa primeros planos y planos de UN solo personaje para reacciones y momentos clave; reserva los planos con todo el grupo para 1-2 momentos (apertura o clímax).",
    "- Indica el movimiento de cámara (fijo, paneo, dolly/steadycam, etc.) y la emoción del momento.",
    "",
    "REGLA CRÍTICA sobre 'characters': lista TODAS las personas VISIBLES EN EL ENCUADRE de ESE plano (no todos los de la escena, pero sí todas las que se ven).",
    "INCLUYE a quien aparezca de espaldas, de perfil o en primer plano en un plano over-the-shoulder (OTS): esa persona está en cuadro y debe listarse.",
    "En un primer plano suele haber 1 persona; en un plano/contraplano u OTS, las 2 personas implicadas; el grupo completo solo cuando el encuadre lo muestra. Un inserto o plano de detalle puede tener 0 personas.",
    "Mantén la MISMA vestimenta y aspecto de cada personaje en todos los planos (continuidad).",
    "",
    "Devuelve JSON con la forma:",
    '{ "scenes": [ { "order": number, "heading": string, "summary": string,',
    '  "shots": [ { "actionDescription": string (qué se ve y la emoción),',
    '    "cameraNotes": string (tamaño de plano + ángulo + movimiento),',
    '    "dialogueOrVO": string, "characters": string[] (SOLO los visibles en el encuadre),',
    '    "durationSec": number (2-10) } ] } ] }',
    "",
    "GUION (JSON):",
    compactScript,
  ].join("\n");

  return withRetry(async () => {
    const { text } = await generateStructured({
      system,
      user,
      jsonMode: true,
      maxTokens: 8000,
    });
    const raw = extractJson<{ scenes?: unknown[] }>(text);
    const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
    const result = scenes
      .map((s, i) => {
        const parsed = BreakdownSceneSchema.parse(s);
        return { ...parsed, order: parsed.order || i + 1 };
      })
      .filter((s) => s.shots.length > 0);
    if (result.length === 0) throw new Error("El desglose salió vacío");
    return result;
  }, { attempts: 3 });
}

// ── Constructores de prompts ──────────────────────────────────────────────

/** Prompt para el KEYFRAME (fotograma inicial) del plano. */
export function buildKeyframePrompt(params: {
  sceneHeading: string;
  sceneSummary: string;
  actionDescription: string;
  keyframeMoment?: string; // instante exacto a congelar; si vacío, se usa la acción entera
  cameraNotes: string;
  characterDescriptions: { name: string; description: string }[];
  styleBible: string;
  genre: string;
  tone: string;
  aspectRatio: string;
  withReferences: boolean;
}): string {
  const n = params.characterDescriptions.length;
  const names = params.characterDescriptions.map((c) => c.name);

  // Control estricto del reparto en cuadro (evita duplicados y extras).
  let castRule: string;
  if (n === 0) {
    castRule =
      "NO people in this frame — empty environment. Do not add any person, figure, silhouette or crowd.";
  } else {
    castRule = [
      `This frame shows EXACTLY ${n} ${n === 1 ? "person" : "people"}: ${names.join(", ")}.`,
      `${names.join(" and ")} ${n === 1 ? "is" : "are"} the MAIN SUBJECT and MUST be clearly visible and prominently framed, physically present and performing the action.`,
      "Do NOT render an empty room or environment; do NOT omit anyone.",
      "Each appears EXACTLY ONCE — no duplicates, no clone/mirror, no extra or background people.",
    ].join(" ");
  }

  const charBlock =
    n > 0
      ? params.characterDescriptions
          .map((c) => `- ${c.name}: ${c.description}`)
          .join("\n")
      : "";

  const moodBits = [params.genre, params.tone].filter(Boolean).join(" · ");

  // Titular con el SUJETO al frente: los modelos de imagen ponderan el inicio;
  // liderar con la persona evita que se rinda una escena vacía.
  const headline =
    n === 0
      ? `Photorealistic cinematic film still — an empty environment with NO people. Aspect ratio ${params.aspectRatio}, filmic.`
      : `Photorealistic cinematic film still. FOREGROUND SUBJECT (large in the frame, sharp focus, unmistakably present): ${names.join(" and ")}. Aspect ratio ${params.aspectRatio}, filmic.`;

  return [
    headline,
    params.withReferences
      ? `Insert ${names.join(" and ")} INTO the scene EXACTLY as their labeled reference image (same face, hairstyle and full wardrobe); even from behind or in profile keep their exact hair and wardrobe. They are living people standing/sitting in the shot, not a backdrop. Keep identities distinct and unmixed.`
      : "",
    "",
    `CAST: ${castRule}`,
    charBlock ? `CHARACTERS IN FRAME:\n${charBlock}` : "",
    "",
    `BACKGROUND SETTING (soft-focus set-dressing BEHIND the subject; render THIS place, and do NOT substitute another environment from the style guide — e.g. do not put an Earth scene in space): ${params.sceneHeading}${n === 0 && params.sceneSummary ? ` — ${params.sceneSummary}` : ""}.`,
    params.keyframeMoment?.trim()
      ? `KEY MOMENT TO FREEZE (depict EXACTLY this instant): ${params.keyframeMoment.trim()}.`
      : `ACTION (freeze the decisive opening-frame moment): ${params.actionDescription}.`,
    params.cameraNotes ? `SHOT / CAMERA: ${params.cameraNotes}.` : "",
    moodBits
      ? `GENRE & MOOD: ${moodBits}. Lighting, expressions and body language must convey this mood — not a posed or cheerful snapshot.`
      : "",
    params.styleBible ? `VISUAL STYLE (obey strictly): ${params.styleBible}` : "",
    REALISM_DIRECTIVE,
    `Cohesive cinematic lighting, natural in-scene poses. No text, no captions, no watermark, no logos. Family-friendly. Avoid: ${SAFE_NEGATIVES}.`,
    n > 0
      ? `CHECK: ${names.join(" and ")} must be clearly visible in the final image — a frame without them (an empty room/environment) is INVALID.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Prompt de COMPOSICIÓN: instruye a editar una imagen base (ambiente ya
 * generado) para INSERTAR a los personajes dentro, de forma fiable.
 */
export function buildCompositePrompt(params: {
  characterDescriptions: { name: string; description: string }[];
  actionDescription: string;
  keyframeMoment?: string; // instante exacto a congelar; si vacío, se usa la acción entera
  cameraNotes: string;
  genre: string;
  tone: string;
  aspectRatio: string;
}): string {
  const names = params.characterDescriptions.map((c) => c.name);
  const charBlock = params.characterDescriptions
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");
  const moodBits = [params.genre, params.tone].filter(Boolean).join(" · ");

  return [
    `EDIT the provided base image (a photographed film location). Add ${names.join(" and ")} INTO that scene as real photographed people, seamlessly integrated — match the base image's lighting, color, grain, depth of field and perspective. Aspect ratio ${params.aspectRatio}, photorealistic.`,
    `EXACTLY ${names.length} ${names.length === 1 ? "person" : "people"} added: ${names.join(", ")}. Each appears once — no duplicates, no extra people.`,
    `Reproduce each person's face, hairstyle and full wardrobe EXACTLY from their labeled reference (${names.join(", ")}). Even when a person is seen from BEHIND or in profile, keep their exact hair color/style, wardrobe and silhouette so they remain recognizable.`,
    `PEOPLE IN FRAME:\n${charBlock}`,
    params.keyframeMoment?.trim()
      ? `KEY MOMENT / POSE (depict EXACTLY this instant): ${params.keyframeMoment.trim()}.`
      : `ACTION / POSE: ${params.actionDescription}.`,
    moodBits ? `Their expressions and body language convey: ${moodBits}.` : "",
    `Keep the environment, its objects, composition and framing UNCHANGED; only add the people. ${names.join(" and ")} MUST be clearly visible and correctly scaled in the result.`,
    REALISM_DIRECTIVE,
    `No text, no captions, no watermark. Family-friendly. Avoid: ${SAFE_NEGATIVES}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Quita el prefijo de guion "PERSONAJE (acotación):" de una línea de diálogo. */
export function stripSpeakerPrefix(s: string): string {
  return s
    .replace(/^\s*\p{Lu}[\p{L}\p{M}\s.'’-]{0,30}?(\s*\([^)]*\))?\s*:\s+/u, "")
    .trim();
}

/**
 * Prompt de video (image-to-video) que el usuario pega en Gemini junto con el
 * keyframe. Etiquetas en inglés (Veo responde mejor), valores en el idioma
 * del contenido. Incluye una LEYENDA visual para que el modelo identifique a
 * cada personaje en la imagen (no puede resolver nombres por sí solo).
 */
export function buildGeminiVideoPrompt(params: {
  actionDescription: string;
  cameraNotes: string;
  dialogueOrVO: string;
  styleBible: string;
  language: string;
  cast: { name: string; appearance: string }[];
}): string {
  const style = params.styleBible.slice(0, 400);
  const langName = promptLangName(params.language);
  const dialogue = stripSpeakerPrefix(params.dialogueOrVO);
  const hasDialogue = dialogue.length > 0;
  const legend =
    params.cast.length > 0
      ? `Who is who in the image — ${params.cast
          .map((c) => `${c.name}: ${c.appearance}`)
          .join(" | ")}.`
      : "";
  return [
    // Gemini Omni genera clips de duración fija (~10s), ignora la duración pedida.
    `Animate the attached keyframe into a short cinematic clip (~${CLIP_SECONDS}s).`,
    "Keep the characters, wardrobe, ENVIRONMENT, props/objects and visual style EXACTLY as in the image — do not change or replace them.",
    legend, // el modelo no resuelve nombres solo; se los mapeamos a la imagen
    `Action: ${params.actionDescription}`,
    params.cameraNotes ? `Camera: ${params.cameraNotes}` : "",
    // Audio: sin música (rompe la continuidad al concatenar) y sin diálogos no pedidos.
    hasDialogue
      ? `Spoken dialogue, ONLY in ${langName}: "${dialogue}". No other language.`
      : "No dialogue, no voice-over, no spoken words.",
    "No background music, no musical score, no soundtrack (ambient/diegetic sound only).",
    style ? `Style: ${style}` : "",
    "Cinematic tone, family-friendly. Keep each person's face, hair and wardrobe consistent (even seen from behind or in profile). No on-screen text, subtitles or watermarks.",
  ]
    .filter(Boolean)
    .join("\n");
}
