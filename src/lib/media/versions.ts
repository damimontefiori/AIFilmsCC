import { promises as fs } from "node:fs";
import path from "node:path";
import { projectSubdir, toRelative, fromRelative } from "@/lib/paths";
import { readMediaBase64, saveBase64Image } from "@/lib/media/store";
import { generateImage } from "@/lib/providers/image";

/**
 * Historial de imágenes de escenario derivado del DISCO (sin esquema): cada
 * versión es un archivo `<prefix><timestamp>.<ext>` en la carpeta keyframes del
 * proyecto. La "actual" es el `imagePath` de la entidad; el resto son versiones
 * anteriores que el usuario puede seleccionar o borrar.
 *
 * Prefijos:
 *  - Ambiente canónico de una locación: `loc-<lid>-`
 *  - Encuadre: `enc-<eid>-`
 */

/** MIME a partir de la extensión de una clave relativa. */
export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

/** Timestamp embebido al final del nombre (`...-<ts>.<ext>`), o 0 si no hay. */
function tsOf(filename: string): number {
  const m = filename.match(/-(\d{10,})\.[^.]+$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Versiones (claves relativas) de una entidad, más recientes primero. Se
 * calcula filtrando `files` (contenido ya leído de la carpeta keyframes) por
 * `prefix`. `current` se garantiza incluido aunque su nombre no siga el prefijo
 * (p. ej. encuadres antiguos nombrados con otro esquema).
 */
export function versionsFromFiles(
  files: string[],
  projectId: string,
  prefix: string,
  current?: string | null,
): string[] {
  const dir = projectSubdir(projectId, "keyframes");
  const matched = files
    .filter((f) => f.startsWith(prefix))
    .sort((a, b) => tsOf(b) - tsOf(a))
    .map((f) => toRelative(path.join(dir, f)));
  if (current && !matched.includes(current)) matched.unshift(current);
  return matched;
}

/** Lee la carpeta keyframes del proyecto (nombres de archivo). */
export async function readKeyframeFiles(projectId: string): Promise<string[]> {
  const dir = projectSubdir(projectId, "keyframes");
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** Versiones de una entidad (lee el disco por sí misma). */
export async function listImageVersions(
  projectId: string,
  prefix: string,
  current?: string | null,
): Promise<string[]> {
  const files = await readKeyframeFiles(projectId);
  return versionsFromFiles(files, projectId, prefix, current);
}

/** Resuelve una clave a su ruta absoluta DENTRO de la carpeta keyframes del
 * proyecto y con el prefijo esperado (evita traversal y borrados cruzados). */
function safeAbs(projectId: string, prefix: string, relKey: string): string | null {
  const base = path.basename(relKey);
  if (!base.startsWith(prefix)) return null;
  const abs = fromRelative(relKey);
  if (!abs) return null;
  const dir = path.resolve(projectSubdir(projectId, "keyframes"));
  if (path.resolve(path.dirname(abs)) !== dir) return null;
  return abs;
}

/** Borra una versión concreta. Lanza si la clave no es válida para la entidad. */
export async function deleteImageVersion(
  projectId: string,
  prefix: string,
  relKey: string,
): Promise<void> {
  const abs = safeAbs(projectId, prefix, relKey);
  if (!abs) throw new Error("Versión no válida.");
  await fs.rm(abs, { force: true }).catch(() => {});
}

/** Borra TODAS las versiones de una entidad (al eliminar la locación/encuadre). */
export async function deleteAllVersions(projectId: string, prefix: string): Promise<void> {
  const dir = projectSubdir(projectId, "keyframes");
  const files = await readKeyframeFiles(projectId);
  await Promise.all(
    files
      .filter((f) => f.startsWith(prefix))
      .map((f) => fs.rm(path.join(dir, f), { force: true }).catch(() => {})),
  );
}

/**
 * Edita una imagen existente con una instrucción en lenguaje natural: usa la
 * imagen ACTUAL como lienzo (`baseImage`) y guarda el resultado como una NUEVA
 * versión (no borra la anterior: el historial se conserva). Devuelve la clave
 * de la nueva imagen.
 */
export async function generateEditedImage(opts: {
  projectId: string;
  currentKey: string; // imagePath actual (lienzo)
  newBase: string; // nombre base de la nueva versión, p. ej. `loc-<lid>-<ts>`
  prompt: string;
  aspectRatio: string;
}): Promise<{ imagePath: string; provider: string }> {
  const ref = await readMediaBase64(opts.currentKey);
  if (!ref) throw new Error("No se pudo leer la imagen actual para editarla.");
  const result = await generateImage({
    prompt: opts.prompt,
    baseImage: { base64: ref.base64, mimeType: mimeFromKey(opts.currentKey) },
    aspectRatio: opts.aspectRatio,
  });
  const imagePath = await saveBase64Image(
    opts.projectId,
    "keyframes",
    opts.newBase,
    result.base64,
    result.mimeType,
  );
  return { imagePath, provider: result.provider };
}
