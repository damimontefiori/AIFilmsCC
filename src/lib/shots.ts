import { prisma } from "@/lib/db";
import { parseJson, toJson } from "@/lib/serialize";
import type { SceneDTO, ShotDTO } from "@/lib/dto";
import {
  buildGeminiVideoPrompt,
  CLIP_SECONDS,
  type BreakdownScene,
} from "@/lib/pipeline/shots";

type ShotRow = {
  id: string;
  sceneId: string;
  order: number;
  actionDescription: string;
  cameraNotes: string;
  dialogueOrVO: string;
  characterIds: string;
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

export function toShotDTO(s: ShotRow): ShotDTO {
  return {
    id: s.id,
    sceneId: s.sceneId,
    order: s.order,
    actionDescription: s.actionDescription,
    cameraNotes: s.cameraNotes,
    dialogueOrVO: s.dialogueOrVO,
    characters: parseJson<string[]>(s.characterIds, []),
    durationSec: s.durationSec,
    keyframePath: s.keyframePath,
    environmentPath: s.environmentPath,
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
    include: { shots: { orderBy: { order: "asc" } } },
  });
  return scenes.map((sc) => ({
    id: sc.id,
    order: sc.order,
    heading: sc.heading,
    summary: sc.summary,
    characters: parseJson<string[]>(sc.characterIds, []),
    shots: sc.shots.map(toShotDTO),
  }));
}

/** Todos los shots de un proyecto en orden (escena, luego shot). */
export async function getShotsFlat(projectId: string): Promise<ShotDTO[]> {
  const scenes = await getScenesWithShots(projectId);
  return scenes.flatMap((s) => s.shots);
}

/**
 * Reemplaza el desglose de escenas/shots de un proyecto. Elimina las escenas
 * existentes (cascade borra shots) y crea las nuevas.
 */
export async function replaceBreakdown(
  projectId: string,
  breakdown: BreakdownScene[],
  styleBible: string,
  language: string,
): Promise<void> {
  await prisma.scene.deleteMany({ where: { projectId } });
  let globalShotOrder = 0;
  for (const sc of breakdown) {
    const scene = await prisma.scene.create({
      data: {
        projectId,
        order: sc.order,
        heading: sc.heading,
        summary: sc.summary,
        characterIds: toJson(
          Array.from(new Set(sc.shots.flatMap((sh) => sh.characters))),
        ),
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
          // Duración FIJA: Gemini Omni siempre genera ~10s.
          durationSec: CLIP_SECONDS,
          // Prompt de video listo desde el inicio (editable después).
          geminiPrompt: buildGeminiVideoPrompt({
            actionDescription: sh.actionDescription,
            cameraNotes: sh.cameraNotes,
            dialogueOrVO: sh.dialogueOrVO,
            styleBible,
            language,
          }),
        },
      });
    }
  }
}

export function getShot(id: string) {
  return prisma.shot.findUnique({ where: { id } });
}
