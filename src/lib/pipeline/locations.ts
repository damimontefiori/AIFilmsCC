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

/**
 * Asigna cada escena a una locación EXISTENTE por significado (no por texto):
 * reconoce que "El pasillo" y "Pasillo amarillo" son el mismo lugar. Devuelve un
 * array alineado por índice de escena con el locationId elegido o null (sin match).
 * Nunca inventa ni crea locaciones.
 */
export async function assignScenesToLocations(input: {
  scenes: { heading: string; summary: string }[];
  locations: { id: string; name: string; description: string }[];
  language: string;
}): Promise<(string | null)[]> {
  if (input.scenes.length === 0) return [];
  if (input.locations.length === 0) return input.scenes.map(() => null);

  const lang = promptLangName(input.language);
  const system = [
    "Eres un supervisor de continuidad de cine.",
    `Los nombres y textos están en ${lang}.`,
    "Asignas cada ESCENA al ESCENARIO/locación donde ocurre, eligiendo SOLO de la lista dada por su id.",
    "El mismo lugar puede nombrarse distinto entre escenas: usa el SIGNIFICADO, no el texto literal.",
    "Si ninguna locación corresponde de verdad, devuelve null para esa escena (no fuerces ni inventes).",
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
  ].join(" ");

  const user = [
    "LOCACIONES disponibles (elige por id):",
    ...input.locations.map(
      (l) => `- id=${l.id} · ${l.name}: ${l.description.slice(0, 160)}`,
    ),
    "",
    "ESCENAS (por índice):",
    ...input.scenes.map(
      (s, i) => `#${i}: ${s.heading} — ${(s.summary || "").slice(0, 200)}`,
    ),
    "",
    'Devuelve JSON: { "assignments": [ { "index": number, "locationId": string|null } ] } con UNA entrada por escena.',
  ].join("\n");

  const { text } = await generateStructured({ system, user, jsonMode: true, maxTokens: 2000 });
  const raw = extractJson<{
    assignments?: { index?: number; locationId?: string | null }[];
  }>(text);
  const out: (string | null)[] = input.scenes.map(() => null);
  const validIds = new Set(input.locations.map((l) => l.id));
  for (const a of raw?.assignments ?? []) {
    if (typeof a?.index === "number" && a.index >= 0 && a.index < out.length) {
      out[a.index] = a.locationId && validIds.has(a.locationId) ? a.locationId : null;
    }
  }
  return out;
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

/**
 * Prompt para un ENCUADRE derivado: la MISMA locación (imagen de referencia
 * adjunta) desde otra cámara/acercamiento, sin personas. La biblia de objetos
 * ancla los invariantes para que el re-encuadre no cambie el lugar.
 */
export function buildEncuadrePrompt(params: {
  locationName: string;
  bible: string;
  framing: string;
  styleBible: string;
  aspectRatio: string;
}): string {
  return [
    `Photorealistic cinematic frame of the SAME film location shown in the reference image, but from a DIFFERENT camera setup. Aspect ratio ${params.aspectRatio}, filmic. NO people.`,
    `LOCATION: ${params.locationName}.`,
    `NEW CAMERA FRAMING (only the camera changes — it is the very same place): ${params.framing}.`,
    "KEEP IDENTICAL to the reference image: architecture, spatial layout, materials, colors, lighting and every prop. Do NOT invent a different room and do NOT move or replace objects.",
    params.bible ? `INVARIANTS that must match exactly: ${params.bible}` : "",
    params.styleBible ? `VISUAL STYLE (obey strictly): ${params.styleBible}` : "",
    REALISM_DIRECTIVE,
    `No people, no characters. Cohesive cinematic lighting. No text, no watermark, no logos. Family-friendly. Avoid: ${SAFE_NEGATIVES}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
