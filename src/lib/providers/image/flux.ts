import type { FluxImageConfig } from "@/lib/config";
import { ImageGenError, type ImageRequest, type ImageResult } from "./types";

// NOTA: el contrato exacto del endpoint FLUX.2-pro de Azure AI Foundry
// (Black Forest Labs) no está 100% documentado aquí. Esta implementación es
// best-effort: cubre respuesta síncrona (base64/URL) y el patrón asíncrono
// (id + polling_url) de BFL. Es el FALLBACK; el camino primario es Gemini.

function dimsFor(aspect?: string): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

async function urlToBase64(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/png";
  return { base64: buf.toString("base64"), mimeType };
}

/** Intenta extraer una imagen (base64 o URL) de varias formas de respuesta. */
async function extractImage(
  json: unknown,
): Promise<{ base64: string; mimeType: string } | null> {
  const j = json as Record<string, any>;
  const b64 =
    j?.b64_json ||
    j?.image ||
    j?.data?.[0]?.b64_json ||
    j?.result?.sample_b64 ||
    j?.result?.b64_json;
  if (typeof b64 === "string" && b64.length > 100) {
    return { base64: b64, mimeType: "image/png" };
  }
  const url =
    j?.result?.sample ||
    j?.data?.[0]?.url ||
    j?.url ||
    (typeof j?.image === "string" && j.image.startsWith("http")
      ? j.image
      : null);
  if (typeof url === "string" && url.startsWith("http")) {
    return urlToBase64(url);
  }
  return null;
}

export async function fluxGenerate(
  cfg: FluxImageConfig,
  req: ImageRequest,
): Promise<ImageResult> {
  const { width, height } = dimsFor(req.aspectRatio);
  const body: Record<string, unknown> = {
    prompt: req.prompt,
    width,
    height,
    output_format: "png",
    n: 1,
  };
  const ref = req.referenceImages?.[0];
  if (ref) body.input_image = ref.base64; // image-to-image best-effort

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ImageGenError(
      `FLUX ${cfg.label} respondió ${res.status}: ${text.slice(0, 400)}`,
      res.status,
      cfg.label,
    );
  }

  const json = await res.json();

  // Patrón asíncrono de BFL: { id, polling_url }.
  const pollingUrl = (json as any)?.polling_url;
  if (pollingUrl) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(pollingUrl, {
        headers: { "api-key": cfg.key },
      });
      if (!poll.ok) continue;
      const pj = await poll.json();
      const status = (pj as any)?.status;
      if (status && status !== "Ready" && status !== "succeeded") continue;
      const img = await extractImage(pj);
      if (img) return { ...img, provider: cfg.label };
    }
    throw new ImageGenError(
      `FLUX ${cfg.label}: timeout esperando resultado`,
      408,
      cfg.label,
    );
  }

  const img = await extractImage(json);
  if (!img) {
    throw new ImageGenError(
      `FLUX ${cfg.label}: no se pudo extraer imagen de la respuesta`,
      200,
      cfg.label,
    );
  }
  return { ...img, provider: cfg.label };
}
