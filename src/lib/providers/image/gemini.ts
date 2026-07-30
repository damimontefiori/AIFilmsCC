import type { GeminiImageConfig } from "@/lib/config";
import { ImageGenError, type ImageRequest, type ImageResult } from "./types";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Genera una imagen con Gemini 2.5 Flash Image (Nano Banana) vía la
 * Generative Language API. Admite imágenes de referencia (image-to-image),
 * clave para mantener consistencia de personajes.
 */
export async function geminiGenerate(
  cfg: GeminiImageConfig,
  req: ImageRequest,
): Promise<ImageResult> {
  const parts: GeminiPart[] = [];
  const labeled = req.labeledReferences ?? [];

  if (req.baseImage) {
    // MODO EDICIÓN/COMPOSITING: la imagen base (ambiente) va PRIMERO como
    // lienzo; luego las referencias del/los personaje(s) a insertar; y al
    // final la instrucción de composición (req.prompt).
    parts.push({
      inlineData: { mimeType: req.baseImage.mimeType, data: req.baseImage.base64 },
    });
    for (const grp of labeled) {
      parts.push({ text: `PERSON TO INSERT — ${grp.label} (match this exact person):` });
      for (const img of grp.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
    parts.push({ text: req.prompt });
  } else if (labeled.length > 0) {
    // Composición con referencias ETIQUETADAS por personaje para que el modelo
    // no mezcle ni reasigne identidades cuando hay varios personajes.
    parts.push({
      text:
        "You are compositing ONE cinematic film still. Below are labeled character references. " +
        "Reproduce each person's face, hair and wardrobe EXACTLY as in their labeled reference. " +
        "Do not swap, blend or mix identities between people.",
    });
    for (const grp of labeled) {
      parts.push({ text: `REFERENCE — ${grp.label} (match this exact person):` });
      for (const img of grp.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
    parts.push({ text: req.prompt });
  } else {
    parts.push({ text: req.prompt });
    for (const img of req.referenceImages ?? []) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`;

  // imageConfig.aspectRatio controla la relación de aspecto de salida
  // (sin él, Gemini devuelve ~1:1). Soporta 1:1, 16:9, 9:16, 4:3, 3:4…
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
  };
  if (req.aspectRatio) {
    generationConfig.imageConfig = { aspectRatio: req.aspectRatio };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ImageGenError(
      `Gemini image ${cfg.label} respondió ${res.status}: ${text.slice(0, 400)}`,
      res.status,
      cfg.label,
    );
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] };
    }[];
  };

  const outParts = data.candidates?.[0]?.content?.parts ?? [];
  const imgPart = outParts.find((p) => p.inlineData?.data);
  if (!imgPart?.inlineData) {
    throw new ImageGenError(
      `Gemini image ${cfg.label} no devolvió imagen`,
      200,
      cfg.label,
    );
  }

  return {
    base64: imgPart.inlineData.data,
    mimeType: imgPart.inlineData.mimeType || "image/png",
    provider: cfg.label,
  };
}
