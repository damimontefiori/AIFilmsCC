// Helpers para (de)serializar campos JSON guardados como String en SQLite.

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export type ReferenceImage = {
  path: string; // ruta relativa dentro de DATA_DIR
  kind: string; // portrait | full_body | three_quarter | custom
  provider: string; // gemini | flux
  prompt?: string;
  createdAt?: string;
};
