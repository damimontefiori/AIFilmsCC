import path from "node:path";
import { promises as fs } from "node:fs";

/** Absolute path to the data directory (media per project). */
export function dataDir(): string {
  const configured = process.env.DATA_DIR || "./data";
  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

export function projectDir(projectId: string): string {
  return path.join(dataDir(), "projects", projectId);
}

export type ProjectSubdir =
  | "characters"
  | "keyframes"
  | "clips"
  | "audio"
  | "exports";

export function projectSubdir(projectId: string, sub: ProjectSubdir): string {
  return path.join(projectDir(projectId), sub);
}

/** Ensure a directory exists (recursive). Returns the same path. */
export async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Convert an absolute path inside DATA_DIR to a stable relative key
 * (used for DB storage and the /api/media route).
 */
export function toRelative(absPath: string): string {
  const rel = path.relative(dataDir(), absPath);
  return rel.split(path.sep).join("/");
}

/** Resolve a relative media key back to an absolute path (guards traversal). */
export function fromRelative(relKey: string): string | null {
  const base = dataDir();
  const resolved = path.resolve(base, relKey);
  const normalizedBase = path.resolve(base) + path.sep;
  if (resolved !== path.resolve(base) && !resolved.startsWith(normalizedBase)) {
    return null; // path traversal attempt
  }
  return resolved;
}
