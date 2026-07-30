import { generateStructured, extractJson } from "@/lib/providers/text";
import { RefinedConceptSchema, type RefinedConcept } from "./types";

export type ConceptInput = {
  idea: string;
  language: string;
  genre?: string;
  tone?: string;
  title?: string;
};

const LANG_NAME: Record<string, string> = {
  es: "español",
  en: "inglés",
  pt: "portugués",
  fr: "francés",
};

/**
 * Expande una idea vaga a un concepto de película: título, logline, sinopsis,
 * género, tono y una "biblia de estilo" visual (clave para consistencia).
 */
export async function refineConcept(input: ConceptInput): Promise<RefinedConcept> {
  const lang = LANG_NAME[input.language] || "español";
  const system = [
    "Eres un desarrollador de historias y guionista de cine profesional.",
    `Escribe TODO el contenido en ${lang}.`,
    "Tu trabajo es tomar una idea vaga y convertirla en un concepto sólido para un cortometraje.",
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
  ].join(" ");

  const user = [
    `Idea del usuario: "${input.idea}".`,
    input.title ? `Título tentativo: "${input.title}".` : "",
    input.genre ? `Género sugerido: ${input.genre}.` : "",
    input.tone ? `Tono sugerido: ${input.tone}.` : "",
    "",
    "Genera un concepto para un cortometraje generado con IA (clips de ~8s).",
    "Devuelve un JSON con exactamente estas claves:",
    "- title: título evocador y corto.",
    "- logline: una sola frase que capture la premisa.",
    "- synopsis: 3-5 frases con inicio, giro y desenlace.",
    "- genre: género principal.",
    "- tone: tono/atmósfera (p.ej. 'melancólico, onírico').",
    "- styleBible: descripción del ESTILO VISUAL para mantener consistencia entre clips:",
    "  estética general, paleta de colores, tipo de iluminación, lente/encuadre,",
    "  época y ambientación, y textura (p.ej. 'cine analógico 35mm, grano suave').",
    "  Este campo guiará la generación de imágenes; sé concreto y visual.",
  ]
    .filter(Boolean)
    .join("\n");

  // Usa gpt-4.1 (rápido) para el refinamiento; el modelo de razonamiento
  // (lento, hasta ~15 min) se reserva para el guion completo.
  const { text } = await generateStructured({
    system,
    user,
    jsonMode: true,
    maxTokens: 4000,
  });

  const raw = extractJson<unknown>(text);
  return RefinedConceptSchema.parse(raw);
}
