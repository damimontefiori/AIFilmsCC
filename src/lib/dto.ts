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

export type LocationDTO = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imagePath: string | null;
  locked: boolean;
  order: number;
};

export type ShotDTO = {
  id: string;
  sceneId: string;
  order: number;
  actionDescription: string;
  cameraNotes: string;
  dialogueOrVO: string;
  characters: string[];
  durationSec: number;
  keyframePath: string | null;
  environmentPath: string | null;
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
  shots: ShotDTO[];
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
