import { generateStructured, extractJson } from "@/lib/providers/text";
import { promptLangName } from "@/lib/languages";
import { withRetry } from "@/lib/utils";
import { RefinedConceptSchema, type RefinedConcept } from "./types";
import { GEMINI_VIDEO_SAFETY } from "./safety";

export type ConceptInput = {
  idea: string;
  language: string;
  genre?: string;
  tone?: string;
  title?: string;
};

/**
 * Expande una idea vaga a un concepto de película: título, logline, sinopsis,
 * género, tono y una "biblia de estilo" visual (clave para consistencia).
 */
export async function refineConcept(input: ConceptInput): Promise<RefinedConcept> {
  const lang = promptLangName(input.language);
  const system = [
    "Eres un guionista y director de cine galardonado, con criterio de festival.",
    `Escribe TODO el contenido en ${lang}, con voz de autor y precisión cinematográfica.`,
    "Conviertes una idea vaga en un concepto potente para un cortometraje: premisa específica y fresca (nada de clichés ni lugares comunes), con un conflicto claro y un giro con significado.",
    "Devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional ni fences.",
    "",
    GEMINI_VIDEO_SAFETY,
  ].join(" ");

  const user = [
    `Idea del usuario: "${input.idea}".`,
    input.title ? `Título tentativo: "${input.title}".` : "",
    input.genre ? `Género sugerido: ${input.genre}.` : "",
    input.tone ? `Tono sugerido: ${input.tone}.` : "",
    "",
    "Desarrolla un concepto para un CORTOMETRAJE (se construirá con clips de ~10 s).",
    "Criterios de calidad:",
    "- Un protagonista con un deseo/necesidad claro y algo en juego (stakes).",
    "- Un gancho específico y original; evita premisas genéricas y finales predecibles.",
    "- Un giro o revelación que resignifique lo anterior; deja una imagen o idea que resuene.",
    "- Concreción sensorial: lugares, objetos y detalles específicos, no abstracciones.",
    "",
    "Devuelve un JSON con exactamente estas claves:",
    "- title: título evocador y memorable (no descriptivo ni genérico).",
    "- logline: UNA frase con protagonista + situación + conflicto + apuesta (estilo logline profesional).",
    "- synopsis: 4-6 frases con arco real: planteamiento, escalada, giro y desenlace resonante.",
    "- genre: género principal (y subgénero si aplica).",
    "- tone: 2-4 adjetivos de atmósfera (p.ej. 'melancólico, onírico, inquietante').",
    "- styleBible: BIBLIA VISUAL concreta que guiará la generación de imágenes. Incluye:",
    "  referencia estética (directores/películas comparables), paleta de color exacta,",
    "  esquema de iluminación, óptica/lente y tipo de encuadre, época y ambientación,",
    "  y textura de imagen (p.ej. 'cine analógico 35 mm, grano fino, halación cálida'). Sé específico y visual.",
  ]
    .filter(Boolean)
    .join("\n");

  // Usa gpt-4.1 (rápido) para el refinamiento; el modelo de razonamiento
  // (lento, hasta ~15 min) se reserva para el guion completo.
  // Reintenta ante fallos transitorios (5xx) o JSON malformado.
  return withRetry(async () => {
    const { text } = await generateStructured({
      system,
      user,
      jsonMode: true,
      maxTokens: 4000,
    });
    const raw = extractJson<unknown>(text);
    return RefinedConceptSchema.parse(raw);
  }, { attempts: 3 });
}
