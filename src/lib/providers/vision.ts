// Análisis de imagen (imagen → texto) con Gemini multimodal (AI Studio).
// Se usa para redactar la "biblia de objetos" de un escenario a partir de una
// imagen de referencia subida por el usuario.
import { aiStudioConfig } from "@/lib/config";
import { loadSettings } from "@/lib/settings";

export async function describeImage(params: {
  imageBase64: string;
  mimeType: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; provider: string }> {
  await loadSettings();
  const cfg = aiStudioConfig();
  if (!cfg) {
    throw new Error(
      "Gemini AI Studio no está configurado (AISTUDIO_API_KEY); se usa para analizar imágenes.",
    );
  }
  const model = cfg.model || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
            { text: params.user },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: params.maxTokens ?? 2048 },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Análisis de imagen (Gemini) respondió ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const cand = data.candidates?.[0];
  let text = "";
  for (const p of cand?.content?.parts ?? []) if (p.text) text += p.text;
  if (!text) {
    throw new Error(
      `El análisis de imagen devolvió vacío${cand?.finishReason ? ` (${cand.finishReason})` : ""}`,
    );
  }
  return { text: text.trim(), provider: `aistudio:${model}` };
}
