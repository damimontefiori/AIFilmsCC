import { z } from "zod";
import { generateStructured, extractJson } from "@/lib/providers/text";
import { promptLangName } from "@/lib/languages";
import { withRetry } from "@/lib/utils";
import { SAFE_NEGATIVES, REALISM_DIRECTIVE } from "./safety";

export const ExtractedCharacterSchema = z.object({
  name: z.string().default(""),
  role: z.string().default(""),
  canonicalDescription: z.string().default(""),
  personality: z.string().default(""),
});
export type ExtractedCharacter = z.infer<typeof ExtractedCharacterSchema>;

/**
 * Extrae los personajes del guion con descripciones canónicas MUY visuales
 * (el ancla de consistencia). Usa gpt-4.1 (rápido).
 */
export async function extractCharacters(input: {
  scriptMarkdown: string;
  styleBible: string;
  language: string;
}): Promise<ExtractedCharacter[]> {
  const lang = promptLangName(input.language);
  const system = [
    "Eres un director de casting y diseñador de personajes de cine.",
    `Escribe los textos en ${lang}.`,
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
  ].join(" ");

  const user = [
    "A partir del siguiente guion, identifica TODOS los personajes con presencia visual.",
    "Para cada uno, escribe una descripción canónica MUY detallada y VISUAL, pensada para",
    "generar imágenes consistentes: edad aparente, género, tono de piel/etnia, complexión y",
    "estatura, cabello (color y estilo), rasgos faciales distintivos, marcas o cicatrices,",
    "y VESTUARIO concreto (prendas, colores, materiales, accesorios). Sé específico y fijo:",
    "esta descripción debe permitir dibujar al personaje IGUAL en cada plano.",
    "IMPORTANTE: haz que los personajes sean VISUALMENTE DISTINTOS entre sí (diferente color/estilo de cabello,",
    "silueta y colores de vestuario) para que se distingan a simple vista en planos de grupo y el modelo no los confunda.",
    "",
    `Estilo visual del film (para coherencia): ${input.styleBible}`,
    "",
    "Devuelve JSON con la forma:",
    '{ "characters": [ { "name": string, "role": string, "canonicalDescription": string, "personality": string } ] }',
    "",
    "GUION:",
    input.scriptMarkdown.slice(0, 12000),
  ].join("\n");

  return withRetry(async () => {
    const { text } = await generateStructured({
      system,
      user,
      jsonMode: true,
      maxTokens: 4000,
    });
    const raw = extractJson<{ characters?: unknown[] }>(text);
    const list = Array.isArray(raw?.characters) ? raw.characters : [];
    const parsed = list
      .map((c) => ExtractedCharacterSchema.parse(c))
      .filter((c) => c.name.trim() !== "");
    if (parsed.length === 0) throw new Error("No se extrajo ningún personaje");
    return parsed;
  }, { attempts: 3 });
}

export type ReferenceKind = "portrait" | "full_body" | "three_quarter";

const KIND_DIRECTIVE: Record<ReferenceKind, string> = {
  portrait:
    "Head-and-shoulders portrait, front view, neutral facial expression, looking at camera.",
  full_body:
    "Full-body shot, standing in a neutral relaxed pose, full figure visible head to toe.",
  three_quarter:
    "Three-quarter body shot from a slight side angle, showing outfit and posture.",
};

/**
 * Construye un prompt de imagen para una hoja de referencia de personaje.
 * Estructura tipo "character sheet": personaje único, fondo neutro, luz de
 * estudio pareja, para máxima consistencia.
 */
export function buildReferencePrompt(params: {
  canonicalDescription: string;
  styleBible: string;
  kind: ReferenceKind;
  withReferences: boolean;
}): string {
  const parts = [
    "Character reference sheet image for film production. Single character only, no text, no labels.",
    KIND_DIRECTIVE[params.kind],
    "Plain neutral light-gray studio background, soft even lighting, sharp focus, consistent identity.",
    params.withReferences
      ? "Keep the SAME identity, face and outfit as the provided reference image(s); only change the pose/framing."
      : "",
    "",
    `Character description: ${params.canonicalDescription}`,
    params.styleBible ? `Overall visual style: ${params.styleBible}` : "",
    REALISM_DIRECTIVE,
    `Family-friendly, ${SAFE_NEGATIVES}.`,
  ];
  return parts.filter(Boolean).join("\n");
}
