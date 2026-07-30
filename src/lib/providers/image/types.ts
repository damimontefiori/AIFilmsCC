export type InputImage = {
  base64: string;
  mimeType: string; // p.ej. image/png
};

export type ImageRequest = {
  prompt: string;
  /** Imágenes de referencia (para consistencia / image-to-image). */
  referenceImages?: InputImage[];
  /** "16:9" | "9:16" | "1:1" — se inyecta en el prompt como guía. */
  aspectRatio?: string;
};

export type ImageResult = {
  base64: string;
  mimeType: string;
  provider: string;
};

export class ImageGenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}
