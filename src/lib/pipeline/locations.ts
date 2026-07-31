import { z } from "zod";
import { generateStructured, extractJson } from "@/lib/providers/text";
import { promptLangName } from "@/lib/languages";
import { withRetry } from "@/lib/utils";
import { REALISM_DIRECTIVE, SAFE_NEGATIVES } from "./safety";

export const ExtractedLocationSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
});
export type ExtractedLocation = z.infer<typeof ExtractedLocationSchema>;

/**
 * Extrae las LOCACIONES distintas del guion con una descripción visual
 * detallada del ambiente y de los OBJETOS/props que contiene (para que la
 * imagen canónica del escenario los incluya y se mantengan consistentes).
 */
export async function extractLocations(input: {
  scriptMarkdown: string;
  styleBible: string;
  language: string;
}): Promise<ExtractedLocation[]> {
  const lang = promptLangName(input.language);
  const system = [
    "Eres un director de arte de cine.",
    `Escribe los textos en ${lang}.`,
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
  ].join(" ");

  const user = [
    "A partir del guion, identifica las LOCACIONES/escenarios DISTINTOS (agrupa escenas que ocurren en el mismo sitio).",
    "Para cada locación escribe una descripción visual MUY detallada y FIJA del ambiente:",
    "arquitectura/espacio, materiales y colores, iluminación, y especialmente los OBJETOS y props concretos",
    "que aparecen (mobiliario, aparatos, decoración) con su aspecto exacto. Esta descripción generará una",
    "imagen canónica del escenario que se REUTILIZARÁ en todos sus planos, así que sé específico y consistente.",
    "",
    `Estilo visual del film: ${input.styleBible}`,
    "",
    "Devuelve JSON con la forma:",
    '{ "locations": [ { "name": string (nombre corto del lugar), "description": string } ] }',
    "",
    "GUION:",
    input.scriptMarkdown.slice(0, 12000),
  ].join("\n");

  return withRetry(async () => {
    const { text } = await generateStructured({ system, user, jsonMode: true, maxTokens: 4000 });
    const raw = extractJson<{ locations?: unknown[] }>(text);
    const list = Array.isArray(raw?.locations) ? raw.locations : [];
    const parsed = list
      .map((l) => ExtractedLocationSchema.parse(l))
      .filter((l) => l.name.trim() !== "");
    if (parsed.length === 0) throw new Error("No se extrajo ninguna locación");
    return parsed;
  }, { attempts: 3 });
}

/** Prompt para la imagen canónica del ambiente (establishing, SIN personas). */
export function buildLocationPrompt(params: {
  name: string;
  description: string;
  styleBible: string;
  aspectRatio: string;
}): string {
  return [
    `Photorealistic cinematic establishing shot of a film LOCATION — the empty set with NO people. Aspect ratio ${params.aspectRatio}, filmic.`,
    "Show the full space and ALL its key objects/props clearly and in a fixed layout (this image is the canonical reference reused across every shot here).",
    `LOCATION: ${params.name}.`,
    `DETAILS (render exactly, including every prop): ${params.description}`,
    params.styleBible ? `VISUAL STYLE (obey strictly): ${params.styleBible}` : "",
    REALISM_DIRECTIVE,
    `No people, no characters. Cohesive cinematic lighting. No text, no watermark, no logos. Family-friendly. Avoid: ${SAFE_NEGATIVES}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
