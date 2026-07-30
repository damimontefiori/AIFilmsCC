// Directrices para que el contenido generado cumpla la política de generación
// de video de la app de Gemini (Omni/Veo) y no sea rechazado al crear los clips.

/** Bloque para inyectar en los system prompts (guion, concepto, planos). */
export const GEMINI_VIDEO_SAFETY = [
  "IMPORTANTE — el contenido se convertirá en video con la app de Gemini, que RECHAZA material que infrinja su política. Ajústate a estas reglas:",
  "- Mantén todo apto y cinematográfico, sin sensacionalismo.",
  "- Nada de violencia gráfica, sangre, gore ni lesiones explícitas; nada de crueldad hacia personas o animales.",
  "- Nada de armas usadas para herir, ni actividades peligrosas o instrucciones dañinas (autolesión, drogas, fabricación de armas).",
  "- Nada de contenido sexual explícito ni desnudez; ningún menor en situaciones inseguras o sexualizadas.",
  "- Nada de odio, acoso ni discriminación hacia personas o grupos.",
  "Si la historia tiene conflicto o tensión, resuélvelo de forma sugerida/implícita y visualmente segura (elipsis, fuera de cuadro, simbolismo).",
].join("\n");

/** Línea breve de negativos de seguridad para los prompts de imagen/video. */
export const SAFE_NEGATIVES =
  "no gore, no blood, no graphic violence, no weapons used to harm, no sexual content, no nudity, no hateful or disturbing imagery";

/**
 * Fija el MEDIO de render para que TODOS los personajes y planos compartan la
 * misma estética (evita que un personaje salga fotorrealista y otro en 3D/cartoon).
 * Por defecto live-action fotorrealista; una biblia de estilo animada lo anula.
 */
export const REALISM_DIRECTIVE =
  "Rendering medium: live-action PHOTOREALISTIC cinematic footage — real human skin, real fabrics, real optics and film lighting. Do NOT render as 3D animation, Pixar/cartoon, anime or illustration, UNLESS the visual style above explicitly specifies an animated look.";
