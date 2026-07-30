import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Concepto refinado (idea vaga -> concepto)
// ─────────────────────────────────────────────────────────────────────────
export const RefinedConceptSchema = z.object({
  title: z.string().default(""),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  genre: z.string().default(""),
  tone: z.string().default(""),
  styleBible: z.string().default(""),
});
export type RefinedConcept = z.infer<typeof RefinedConceptSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Guion estructurado ("app-defined format")
// ─────────────────────────────────────────────────────────────────────────
export const ScriptBeatSchema = z.union([
  z.object({
    type: z.literal("action"),
    text: z.string().default(""),
  }),
  z.object({
    type: z.literal("dialogue"),
    character: z.string().default(""),
    parenthetical: z.string().optional(),
    line: z.string().default(""),
  }),
]);
export type ScriptBeat = z.infer<typeof ScriptBeatSchema>;

export const ScriptSceneSchema = z.object({
  order: z.number().default(0),
  heading: z.string().default(""),
  location: z.string().default(""),
  timeOfDay: z.string().default(""),
  summary: z.string().default(""),
  characters: z.array(z.string()).default([]),
  beats: z.array(ScriptBeatSchema).default([]),
});
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;

export const ScriptDocSchema = z.object({
  title: z.string().default(""),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  genre: z.string().default(""),
  tone: z.string().default(""),
  styleBible: z.string().default(""),
  scenes: z.array(ScriptSceneSchema).default([]),
});
export type ScriptDoc = z.infer<typeof ScriptDocSchema>;

/** Nº aproximado de clips (~10s cada uno) para una duración objetivo. */
export function estimateClipCount(targetDurationSec: number): number {
  return Math.max(3, Math.round(targetDurationSec / 10));
}

/** Renderiza el guion estructurado a markdown legible. */
export function scriptToMarkdown(doc: ScriptDoc): string {
  const lines: string[] = [];
  if (doc.title) lines.push(`# ${doc.title}`, "");
  if (doc.logline) lines.push(`**Logline:** ${doc.logline}`, "");
  if (doc.genre || doc.tone)
    lines.push(`**Género/Tono:** ${[doc.genre, doc.tone].filter(Boolean).join(" · ")}`, "");
  if (doc.synopsis) lines.push(`**Sinopsis:** ${doc.synopsis}`, "");
  lines.push("");
  for (const scene of doc.scenes) {
    lines.push(`## ${scene.order}. ${scene.heading || scene.location}`);
    if (scene.summary) lines.push(`_${scene.summary}_`, "");
    for (const beat of scene.beats) {
      if (beat.type === "action") {
        lines.push(beat.text, "");
      } else {
        const paren = beat.parenthetical ? ` (${beat.parenthetical})` : "";
        lines.push(`**${beat.character.toUpperCase()}**${paren}: ${beat.line}`, "");
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
