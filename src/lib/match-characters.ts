// Empareja el nombre que usa un plano (p.ej. "Niña") con el registro de
// personaje (p.ej. "La niña"): exacto → contención → solapamiento de tokens.
// El desglose suele nombrar a los personajes distinto que la extracción.

const norm = (s: string) => s.trim().toLowerCase();
const nameTokens = (s: string) =>
  norm(s)
    .split(/\s+/)
    .filter((w) => w.length >= 3);

export function matchCharacter<T extends { name: string }>(
  shotName: string,
  chars: T[],
): T | undefined {
  const n = norm(shotName);
  const exact = chars.find((c) => norm(c.name) === n);
  if (exact) return exact;
  const contains = chars.find(
    (c) => norm(c.name).includes(n) || n.includes(norm(c.name)),
  );
  if (contains) return contains;
  const st = nameTokens(shotName);
  return chars.find((c) => nameTokens(c.name).some((t) => st.includes(t)));
}
