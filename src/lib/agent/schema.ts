import type { AgentTarget, EditProposal } from "@/lib/dto";

/**
 * Campos editables por el copiloto, por entidad. Fuente ÚNICA usada tanto en el
 * prompt del agente como en la validación al aplicar (whitelist de seguridad).
 */
export const EDITABLE_FIELDS: Record<AgentTarget, string[]> = {
  project: [
    "title",
    "idea",
    "logline",
    "synopsis",
    "genre",
    "tone",
    "styleBible",
    "targetDurationSec",
    "aspectRatio",
    "language",
  ],
  character: ["name", "role", "canonicalDescription", "personality"],
  location: ["name", "description"],
  scene: ["heading", "summary"],
  shot: [
    "actionDescription",
    "keyframeMoment",
    "cameraNotes",
    "dialogueOrVO",
    "characters",
    "renderMode",
    "notes",
    "geminiPrompt",
  ],
  // Edición del GUION a nivel de beat. id = "sceneIndex:beatIndex".
  // `line`/`character`/`parenthetical` para diálogo; `text` para acción.
  "script-beat": ["line", "text", "character", "parenthetical"],
};

const NUMBER_FIELDS = new Set(["targetDurationSec"]);
const ARRAY_FIELDS = new Set(["characters"]);
const ENUM_FIELDS: Record<string, string[]> = {
  aspectRatio: ["16:9", "9:16", "1:1"],
  renderMode: ["composite", "direct"],
};

export function isEditable(target: AgentTarget, field: string): boolean {
  return EDITABLE_FIELDS[target]?.includes(field) ?? false;
}

/** Valida y normaliza una propuesta cruda del modelo; null si es inválida. */
export function normalizeProposal(raw: unknown): EditProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const target = r.target as AgentTarget;
  if (!target || !(target in EDITABLE_FIELDS)) return null;
  const field = String(r.field || "");
  if (!isEditable(target, field)) return null;

  const id = target === "project" ? null : typeof r.id === "string" && r.id ? r.id : null;
  if (target !== "project" && !id) return null; // el resto requiere id
  // El guion se direcciona por "sceneIndex:beatIndex".
  if (target === "script-beat" && !/^\d+:\d+$/.test(id || "")) return null;

  let value: unknown = r.value;
  if (NUMBER_FIELDS.has(field)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    value = n;
  } else if (ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value)) return null;
    value = value.map((v) => String(v));
  } else {
    if (value == null) return null;
    value = String(value);
  }
  if (ENUM_FIELDS[field] && !ENUM_FIELDS[field].includes(String(value))) return null;

  const summary = String(r.summary || `${target}.${field}`).slice(0, 240);
  return { target, id, field, value, summary };
}
