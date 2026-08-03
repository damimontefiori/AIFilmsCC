import { prisma } from "@/lib/db";
import { parseJson, toJson } from "@/lib/serialize";
import { matchCharacter } from "@/lib/match-characters";
import { assignScenesToLocations } from "@/lib/pipeline/locations";
import type { SceneDTO, ShotDTO } from "@/lib/dto";
import {
  buildGeminiVideoPrompt,
  CLIP_SECONDS,
  type BreakdownScene,
} from "@/lib/pipeline/shots";

/** Tag visual corto de un personaje (para la leyenda "quién es quién"). */
function shortAppearance(name: string, desc: string): string {
  let d = desc.trim();
  const nameRe = new RegExp(
    "^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b[,\\s]*",
    "i",
  );
  d = d.replace(nameRe, "").replace(/^aparenta\s*/i, "");
  return d.slice(0, 180).trim();
}

/** Construye la leyenda de reparto (nombre → apariencia) para un plano. */
export function buildShotCast(
  shotCharacterNames: string[],
  chars: { name: string; canonicalDescription: string }[],
): { name: string; appearance: string }[] {
  const cast: { name: string; appearance: string }[] = [];
  const seen = new Set<string>();
  for (const n of shotCharacterNames) {
    const c = matchCharacter(n, chars);
    if (c && !seen.has(c.name)) {
      seen.add(c.name);
      cast.push({ name: c.name, appearance: shortAppearance(c.name, c.canonicalDescription) });
    }
  }
  return cast;
}

type ShotRow = {
  id: string;
  sceneId: string;
  order: number;
  actionDescription: string;
  keyframeMoment: string;
  cameraNotes: string;
  dialogueOrVO: string;
  characterIds: string;
  durationSec: number;
  keyframePath: string | null;
  encuadreId: string | null;
  locationId: string | null;
  renderMode: string;
  keyframePrompt: string | null;
  geminiPrompt: string | null;
  assignedAccountId: string | null;
  status: string;
  videoPath: string | null;
  notes: string;
  encuadre?: { imagePath: string | null } | null;
};

export function toShotDTO(s: ShotRow): ShotDTO {
  return {
    id: s.id,
    sceneId: s.sceneId,
    order: s.order,
    actionDescription: s.actionDescription,
    keyframeMoment: s.keyframeMoment,
    cameraNotes: s.cameraNotes,
    dialogueOrVO: s.dialogueOrVO,
    characters: parseJson<string[]>(s.characterIds, []),
    durationSec: s.durationSec,
    keyframePath: s.keyframePath,
    encuadreId: s.encuadreId,
    encuadreImagePath: s.encuadre?.imagePath ?? null,
    locationId: s.locationId,
    renderMode: s.renderMode,
    keyframePrompt: s.keyframePrompt,
    geminiPrompt: s.geminiPrompt,
    assignedAccountId: s.assignedAccountId,
    status: s.status,
    videoPath: s.videoPath,
    notes: s.notes,
  };
}

export async function getScenesWithShots(projectId: string): Promise<SceneDTO[]> {
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      shots: { orderBy: { order: "asc" }, include: { encuadre: true } },
    },
  });
  return scenes.map((sc) => ({
    id: sc.id,
    order: sc.order,
    heading: sc.heading,
    summary: sc.summary,
    characters: parseJson<string[]>(sc.characterIds, []),
    locationId: sc.locationId,
    shots: sc.shots.map(toShotDTO),
  }));
}

/** Todos los shots de un proyecto en orden (escena, luego shot). */
export async function getShotsFlat(projectId: string): Promise<ShotDTO[]> {
  const scenes = await getScenesWithShots(projectId);
  return scenes.flatMap((s) => s.shots);
}

/** Técnica por defecto de un plano: los insertos/detalle sin personas nacen en
 *  "directo" (una pasada); el resto en "componer". El usuario puede cambiarlo. */
function defaultRenderMode(sh: { characters: string[]; cameraNotes: string; actionDescription: string }): string {
  const hasChars = sh.characters.length > 0;
  const text = `${sh.cameraNotes} ${sh.actionDescription}`.toLowerCase();
  const isInsert = /inserto|detalle|primer[ií]simo|close[- ]?up|macro/.test(text);
  return !hasChars && isInsert ? "direct" : "composite";
}

/**
 * Reemplaza el desglose de escenas/shots de un proyecto. Elimina las escenas
 * existentes (cascade borra shots) y crea las nuevas. Asigna cada escena a una
 * locación EXISTENTE mediante un LLM semántico (emparejar-primero; nunca crea).
 */
export async function replaceBreakdown(
  projectId: string,
  breakdown: BreakdownScene[],
  styleBible: string,
  language: string,
): Promise<void> {
  const chars = await prisma.character.findMany({ where: { projectId } });
  const locations = await prisma.location.findMany({ where: { projectId } });

  // Asignación semántica escena→locación (best-effort; si falla, quedan sin asignar).
  let assignments: (string | null)[] = breakdown.map(() => null);
  if (locations.length > 0) {
    try {
      assignments = await assignScenesToLocations({
        scenes: breakdown.map((s) => ({ heading: s.heading, summary: s.summary })),
        locations: locations.map((l) => ({ id: l.id, name: l.name, description: l.description })),
        language,
      });
    } catch {
      assignments = breakdown.map(() => null);
    }
  }
  const validIds = new Set(locations.map((l) => l.id));

  await prisma.scene.deleteMany({ where: { projectId } });
  let globalShotOrder = 0;
  for (let i = 0; i < breakdown.length; i++) {
    const sc = breakdown[i];
    const locationId = assignments[i] && validIds.has(assignments[i]!) ? assignments[i] : null;
    const scene = await prisma.scene.create({
      data: {
        projectId,
        order: sc.order,
        heading: sc.heading,
        summary: sc.summary,
        characterIds: toJson(
          Array.from(new Set(sc.shots.flatMap((sh) => sh.characters))),
        ),
        locationId,
      },
    });
    for (const sh of sc.shots) {
      await prisma.shot.create({
        data: {
          sceneId: scene.id,
          order: globalShotOrder++,
          actionDescription: sh.actionDescription,
          cameraNotes: sh.cameraNotes,
          dialogueOrVO: sh.dialogueOrVO,
          characterIds: toJson(sh.characters),
          // Encuadre por defecto = canónico de la locación (encuadreId null).
          encuadreId: null,
          renderMode: defaultRenderMode(sh),
          // Duración FIJA: Gemini Omni siempre genera ~10s.
          durationSec: CLIP_SECONDS,
          // Prompt de video listo desde el inicio (editable después).
          geminiPrompt: buildGeminiVideoPrompt({
            actionDescription: sh.actionDescription,
            cameraNotes: sh.cameraNotes,
            dialogueOrVO: sh.dialogueOrVO,
            styleBible,
            language,
            cast: buildShotCast(sh.characters, chars),
          }),
        },
      });
    }
  }
}

export function getShot(id: string) {
  return prisma.shot.findUnique({ where: { id }, include: { encuadre: true } });
}
