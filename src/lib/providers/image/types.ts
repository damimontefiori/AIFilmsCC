export type InputImage = {
  base64: string;
  mimeType: string; // p.ej. image/png
};

/**
 * Referencia etiquetada: vincula una o más imágenes a un sujeto nombrado.
 * Clave para que el modelo mapee cada rostro al personaje correcto y no
 * mezcle identidades cuando hay varios personajes en cuadro.
 */
export type LabeledReference = {
  label: string; // p.ej. "Mateo (protagonista)"
  images: InputImage[];
};

export type ImageRequest = {
  prompt: string;
  /**
   * Imagen base a EDITAR (lienzo). Va primero; el modelo la conserva y solo
   * añade/modifica lo indicado. Clave para compositing (insertar un personaje
   * en un ambiente ya generado de forma fiable).
   */
  baseImage?: InputImage;
  /** Imágenes de referencia sin etiquetar (image-to-image simple). */
  referenceImages?: InputImage[];
  /** Referencias etiquetadas por personaje (composición multi-sujeto). */
  labeledReferences?: LabeledReference[];
  /** "16:9" | "9:16" | "1:1" — controla el aspecto de salida. */
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
