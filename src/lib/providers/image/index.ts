import { geminiImageConfigs, fluxImageConfigs } from "@/lib/config";
import { geminiGenerate } from "./gemini";
import { fluxGenerate } from "./flux";
import type { ImageRequest, ImageResult } from "./types";

export type { ImageRequest, ImageResult, InputImage } from "./types";
export { ImageGenError } from "./types";

/**
 * Genera una imagen usando Gemini 2.5 Flash Image (primario, con failover
 * free -> paid) y FLUX.2-pro como fallback. Devuelve base64 + mimeType.
 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const errors: string[] = [];

  for (const cfg of geminiImageConfigs()) {
    try {
      return await geminiGenerate(cfg, req);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  for (const cfg of fluxImageConfigs()) {
    try {
      return await fluxGenerate(cfg, req);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `No se pudo generar la imagen con ningún proveedor.\n${errors.join("\n") || "Sin proveedores configurados."}`,
  );
}
