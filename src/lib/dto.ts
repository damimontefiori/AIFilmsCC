// Tipos serializables para pasar de server components a client.
// Sin imports de servidor: seguro para el bundle de cliente.

import type { ReferenceImage } from "@/lib/serialize";

export type CharacterDTO = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  canonicalDescription: string;
  personality: string;
  referenceImages: ReferenceImage[];
  locked: boolean;
  notes: string;
  order: number;
};

export type EncuadreDTO = {
  id: string;
  locationId: string;
  label: string;
  framingPrompt: string;
  imagePath: string | null;
  order: number;
  imageVersions: string[]; // historial (claves rel), más recientes primero
};

export type LocationDTO = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imagePath: string | null;
  locked: boolean;
  order: number;
  encuadres: EncuadreDTO[];
  imageVersions: string[]; // historial del ambiente canónico, más recientes primero
};

export type ShotDTO = {
  id: string;
  sceneId: string;
  order: number;
  actionDescription: string;
  keyframeMoment: string;
  cameraNotes: string;
  dialogueOrVO: string;
  characters: string[];
  durationSec: number;
  keyframePath: string | null;
  encuadreId: string | null;
  encuadreImagePath: string | null; // imagen del ambiente resuelto (encuadre elegido), para display
  locationId: string | null; // override de locación de ESTE plano; null = usa el de la escena
  renderMode: string; // composite | direct
  keyframePrompt: string | null;
  geminiPrompt: string | null;
  assignedAccountId: string | null;
  status: string;
  videoPath: string | null;
  notes: string;
};

export type SceneDTO = {
  id: string;
  order: number;
  heading: string;
  summary: string;
  characters: string[];
  locationId: string | null;
  shots: ShotDTO[];
};

export type TimelineClipDTO = {
  id: string;
  order: number;
  sourcePath: string;
  sourceShotId: string | null;
  label: string;
  inSec: number | null;
  outSec: number | null;
  volume: number; // 0..2 (0..200%)
  keyframePath: string | null; // keyframe del plano de origen, para el thumbnail
};

export type AudioSettingsDTO = {
  audioPath: string | null;
  audioMode: string; // mix | replace
  audioVolume: number;
};

// ── Copiloto de IA ────────────────────────────────────────────────────────
export type AgentTarget =
  | "project"
  | "character"
  | "location"
  | "scene"
  | "shot"
  | "script-beat";

/** Propuesta de edición del copiloto (se aplica tras confirmación del usuario). */
export type EditProposal = {
  target: AgentTarget;
  id: string | null; // null para el proyecto; id de la entidad para el resto
  field: string;
  value: unknown;
  summary: string; // descripción legible del cambio
};

export type AgentMessageDTO = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals: EditProposal[];
  createdAt: string;
};

export type AccountDTO = {
  id: string;
  label: string;
  email: string;
  dailyQuota: number;
  active: boolean;
  usedToday: number;
  remainingToday: number;
};

export type ProjectDTO = {
  id: string;
  title: string;
  idea: string;
  logline: string;
  synopsis: string;
  genre: string;
  tone: string;
  language: string;
  aspectRatio: string;
  targetDurationSec: number;
  styleBible: string;
  status: string;
  scriptModel: string;
  scriptJson: string | null;
  scriptMarkdown: string | null;
};

type ProjectLike = {
  id: string;
  title: string;
  idea: string;
  logline: string;
  synopsis: string;
  genre: string;
  tone: string;
  language: string;
  aspectRatio: string;
  targetDurationSec: number;
  styleBible: string;
  status: string;
  scriptModel: string;
  scriptJson: string | null;
  scriptMarkdown: string | null;
};

export function toProjectDTO(p: ProjectLike): ProjectDTO {
  return {
    id: p.id,
    title: p.title,
    idea: p.idea,
    logline: p.logline,
    synopsis: p.synopsis,
    genre: p.genre,
    tone: p.tone,
    language: p.language,
    aspectRatio: p.aspectRatio,
    targetDurationSec: p.targetDurationSec,
    styleBible: p.styleBible,
    status: p.status,
    scriptModel: p.scriptModel,
    scriptJson: p.scriptJson,
    scriptMarkdown: p.scriptMarkdown,
  };
}
