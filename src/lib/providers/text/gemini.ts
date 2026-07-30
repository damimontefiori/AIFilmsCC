// Cliente de texto para Gemini (Generative Language API / AI Studio).
// Usado como opción alternativa para la generación del guion.

export class GeminiTextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GeminiTextError";
  }
}

export async function geminiGenerateText(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    // Presupuesto amplio: gemini-3.x flash es un modelo "thinking" y los
    // tokens de razonamiento cuentan contra el presupuesto de salida.
    maxOutputTokens: params.maxTokens ?? 32768,
  };
  if (params.jsonMode) generationConfig.responseMimeType = "application/json";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.user }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GeminiTextError(
      `Gemini text (${params.model}) respondió ${res.status}: ${text.slice(0, 500)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
  };

  const candidate = data.candidates?.[0];
  let text = "";
  for (const p of candidate?.content?.parts ?? []) {
    if (p.text) text += p.text;
  }
  if (!text) {
    const reason = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : "";
    throw new GeminiTextError(
      `Gemini text (${params.model}) devolvió respuesta vacía${reason}`,
      200,
    );
  }
  return text;
}
