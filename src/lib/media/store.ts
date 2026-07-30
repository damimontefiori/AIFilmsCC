import { promises as fs } from "node:fs";
import path from "node:path";
import { projectSubdir, ensureDir, toRelative, type ProjectSubdir } from "@/lib/paths";

function extFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mp4")) return "mp4";
  return "bin";
}

/**
 * Guarda una imagen base64 en data/projects/<id>/<sub>/<filename>.<ext>.
 * Devuelve la clave relativa (para DB + ruta /api/media).
 */
export async function saveBase64Image(
  projectId: string,
  sub: ProjectSubdir,
  baseName: string,
  base64: string,
  mime: string,
): Promise<string> {
  const dir = await ensureDir(projectSubdir(projectId, sub));
  const filename = `${baseName}.${extFor(mime)}`;
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, Buffer.from(base64, "base64"));
  return toRelative(abs);
}

/** Guarda un buffer arbitrario (p.ej. subida de video). Devuelve clave relativa. */
export async function saveBuffer(
  projectId: string,
  sub: ProjectSubdir,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = await ensureDir(projectSubdir(projectId, sub));
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buffer);
  return toRelative(abs);
}

/** Lee un archivo de media por su clave relativa. */
export async function readMediaBase64(relKey: string): Promise<{ base64: string } | null> {
  const { fromRelative } = await import("@/lib/paths");
  const abs = fromRelative(relKey);
  if (!abs) return null;
  try {
    const buf = await fs.readFile(abs);
    return { base64: buf.toString("base64") };
  } catch {
    return null;
  }
}
