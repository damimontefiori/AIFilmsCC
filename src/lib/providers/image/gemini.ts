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
  parts.push({ text: req.prompt });

  for (const img of req.referenceImages ?? []) {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    });
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
