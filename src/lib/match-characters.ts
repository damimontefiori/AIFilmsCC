// Empareja el nombre que usa un plano (p.ej. "Niña") con el registro de
// personaje (p.ej. "La niña"): exacto → contención → solapamiento de tokens.
// El desglose suele nombrar a los personajes distinto que la extracción.

// Normaliza sin distinguir acentos: "Lucia" ≈ "Lucía".
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
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

const bigTokens = (s: string) =>
  norm(s)
    .split(/\s+/)
    .filter((w) => w.length >= 4);

/**
 * Empareja una escena (heading + summary) con la locación más parecida, por
 * solapamiento de palabras significativas con su nombre + descripción.
 */
export function matchLocationForScene<
  T extends { name: string; description: string },
>(sceneText: string, locations: T[]): T | undefined {
  if (locations.length === 0) return undefined;
  const st = new Set(bigTokens(sceneText));
  let best: T | undefined;
  let bestScore = 0;
  for (const loc of locations) {
    const lt = bigTokens(`${loc.name} ${loc.description}`);
    let score = 0;
    for (const w of lt) if (st.has(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = loc;
    }
  }
  return bestScore >= 2 ? best : undefined;
}
