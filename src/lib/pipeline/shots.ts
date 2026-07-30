import { z } from "zod";
import { generateStructured, extractJson } from "@/lib/providers/text";
import { estimateClipCount, type ScriptDoc } from "./types";

// ── Breakdown de escenas en shots ────────────────────────────────────────
export const BreakdownShotSchema = z.object({
  actionDescription: z.string().default(""),
  cameraNotes: z.string().default(""),
  dialogueOrVO: z.string().default(""),
  characters: z.array(z.string()).default([]),
  durationSec: z.number().default(8),
});
export const BreakdownSceneSchema = z.object({
  order: z.number().default(0),
  heading: z.string().default(""),
  summary: z.string().default(""),
  shots: z.array(BreakdownShotSchema).default([]),
});
export type BreakdownScene = z.infer<typeof BreakdownSceneSchema>;

const LANG_NAME: Record<string, string> = {
  es: "español",
  en: "inglés",
  pt: "portugués",
  fr: "francés",
};

/**
 * Divide el guion en planos (~8s) listos para generar como clips.
 * Usa gpt-4.1 (rápido, JSON).
 */
export async function breakdownShots(input: {
  script: ScriptDoc;
  language: string;
  targetDurationSec: number;
}): Promise<BreakdownScene[]> {
  const lang = LANG_NAME[input.language] || "español";
  const totalClips = estimateClipCount(input.targetDurationSec);

  const system = [
    "Eres un director y editor de cine que planifica el rodaje plano a plano.",
    `Escribe los textos en ${lang}.`,
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
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
    `Divide el guion en planos cortos de ~8 segundos cada uno (máximo 8s por plano),`,
    `pensando en clips generados por IA. En total, apunta a ~${totalClips} planos.`,
    "Cada plano debe ser UNA acción visual clara y rodable en un solo clip.",
    "Para cada plano indica: qué ocurre (acción), encuadre/movimiento de cámara,",
    "diálogo o voz en off si aplica, y qué personajes aparecen (por nombre).",
    "",
    "Devuelve JSON con la forma:",
    '{ "scenes": [ { "order": number, "heading": string, "summary": string,',
    '  "shots": [ { "actionDescription": string, "cameraNotes": string,',
    '    "dialogueOrVO": string, "characters": string[], "durationSec": number } ] } ] }',
    "",
    "GUION (JSON):",
    compactScript,
  ].join("\n");

  const { text } = await generateStructured({
    system,
    user,
    jsonMode: true,
    maxTokens: 8000,
  });

  const raw = extractJson<{ scenes?: unknown[] }>(text);
  const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  return scenes
    .map((s, i) => {
      const parsed = BreakdownSceneSchema.parse(s);
      return { ...parsed, order: parsed.order || i + 1 };
    })
    .filter((s) => s.shots.length > 0);
}

// ── Constructores de prompts ──────────────────────────────────────────────

/** Prompt para el KEYFRAME (fotograma inicial) del plano. */
export function buildKeyframePrompt(params: {
  sceneHeading: string;
  actionDescription: string;
  cameraNotes: string;
  characterDescriptions: { name: string; description: string }[];
  styleBible: string;
  aspectRatio: string;
  withReferences: boolean;
}): string {
  const chars =
    params.characterDescriptions.length > 0
      ? params.characterDescriptions
          .map((c) => `- ${c.name}: ${c.description}`)
          .join("\n")
      : "(sin personajes en cuadro)";
  return [
    `Cinematic film keyframe (the first frame of a video shot). Aspect ratio ${params.aspectRatio}.`,
    params.withReferences
      ? "Keep each character's identity, face and outfit EXACTLY as in the provided reference image(s)."
      : "",
    `Scene: ${params.sceneHeading}.`,
    `Action in frame: ${params.actionDescription}.`,
    params.cameraNotes ? `Framing / camera: ${params.cameraNotes}.` : "",
    "Characters present:",
    chars,
    params.styleBible ? `Visual style: ${params.styleBible}` : "",
    "Photorealistic cinematic still, cohesive lighting, no text, no watermark, no logos.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Prompt de video (image-to-video) que el usuario pega en Gemini junto con el
 * keyframe. Etiquetas en inglés (Veo responde mejor), valores en el idioma
 * del contenido.
 */
export function buildGeminiVideoPrompt(params: {
  durationSec: number;
  actionDescription: string;
  cameraNotes: string;
  dialogueOrVO: string;
  styleBible: string;
}): string {
  const style = params.styleBible.slice(0, 400);
  return [
    `Animate the attached keyframe into a ~${params.durationSec}s cinematic clip.`,
    "Keep the characters' appearance, wardrobe and the visual style EXACTLY as in the image.",
    `Action: ${params.actionDescription}`,
    params.cameraNotes ? `Camera: ${params.cameraNotes}` : "",
    params.dialogueOrVO ? `Dialogue / VO: ${params.dialogueOrVO}` : "",
    style ? `Style: ${style}` : "",
    "Negative: no on-screen text, no subtitles, no watermark, do not change character identity.",
  ]
    .filter(Boolean)
    .join("\n");
}
