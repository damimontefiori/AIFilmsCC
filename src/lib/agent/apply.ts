import { prisma } from "@/lib/db";
import { updateProject } from "@/lib/projects";
import { toJson, parseJson } from "@/lib/serialize";
import { ScriptDocSchema, scriptToMarkdown, type ScriptDoc } from "@/lib/pipeline/types";
import { buildGeminiVideoPrompt } from "@/lib/pipeline/shots";
import { buildShotCast } from "@/lib/shots";
import type { EditProposal } from "@/lib/dto";
import { isEditable } from "./schema";

// Campos de un plano que afectan al paquete de vídeo (prompt image-to-video).
const SHOT_PROMPT_FIELDS = new Set(["actionDescription", "cameraNotes", "dialogueOrVO", "characters"]);

/** Regenera el `geminiPrompt` de un plano tras editarlo, para no dejar el paquete obsoleto. */
async function rebuildShotGeminiPrompt(projectId: string, shotId: string): Promise<void> {
  const [shot, project, chars] = await Promise.all([
    prisma.shot.findUnique({ where: { id: shotId } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { styleBible: true, language: true } }),
    prisma.character.findMany({ where: { projectId } }),
  ]);
  if (!shot || !project) return;
  const cast = buildShotCast(parseJson<string[]>(shot.characterIds, []), chars);
  const geminiPrompt = buildGeminiVideoPrompt({
    actionDescription: shot.actionDescription,
    cameraNotes: shot.cameraNotes,
    dialogueOrVO: shot.dialogueOrVO,
    styleBible: project.styleBible,
    language: project.language,
    cast,
  });
  await prisma.shot.update({ where: { id: shotId }, data: { geminiPrompt } });
}

async function assertProjectOwns(
  kind: "character" | "location" | "scene",
  id: string,
  projectId: string,
) {
  const row =
    kind === "character"
      ? await prisma.character.findUnique({ where: { id }, select: { projectId: true } })
      : kind === "location"
        ? await prisma.location.findUnique({ where: { id }, select: { projectId: true } })
        : await prisma.scene.findUnique({ where: { id }, select: { projectId: true } });
  if (!row || row.projectId !== projectId) throw new Error("Entidad no encontrada en este proyecto");
}

async function assertShotOwns(id: string, projectId: string) {
  const shot = await prisma.shot.findUnique({
    where: { id },
    select: { scene: { select: { projectId: true } } },
  });
  if (!shot || shot.scene.projectId !== projectId) {
    throw new Error("Plano no encontrado en este proyecto");
  }
}

/** Aplica UNA propuesta ya confirmada por el usuario. Revalida whitelist + pertenencia. */
export async function applyProposal(projectId: string, p: EditProposal): Promise<void> {
  if (!isEditable(p.target, p.field)) throw new Error(`Campo no editable: ${p.target}.${p.field}`);

  if (p.target === "project") {
    const value = p.field === "targetDurationSec" ? Number(p.value) : p.value;
    await updateProject(projectId, { [p.field]: value });
    return;
  }

  // Edición del GUION a nivel de beat (id "sceneIndex:beatIndex").
  if (p.target === "script-beat") {
    const m = /^(\d+):(\d+)$/.exec(p.id || "");
    if (!m) throw new Error("id de beat inválido");
    const si = Number(m[1]);
    const bi = Number(m[2]);
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { scriptJson: true },
    });
    const doc = parseJson<ScriptDoc | null>(proj?.scriptJson ?? null, null);
    const beat = doc?.scenes?.[si]?.beats?.[bi];
    if (!doc || !beat) throw new Error("No se encontró ese beat del guion");
    const val = String(p.value ?? "");
    if (beat.type === "dialogue") {
      if (p.field === "line") beat.line = val;
      else if (p.field === "character") beat.character = val;
      else if (p.field === "parenthetical") beat.parenthetical = val || undefined;
      else throw new Error(`Campo "${p.field}" no válido para un diálogo`);
    } else {
      if (p.field === "text") beat.text = val;
      else throw new Error(`Campo "${p.field}" no válido para una acción`);
    }
    const validated = ScriptDocSchema.parse(doc);
    await updateProject(projectId, {
      scriptJson: JSON.stringify(validated),
      scriptMarkdown: scriptToMarkdown(validated),
    });
    return;
  }

  if (!p.id) throw new Error("Falta el id de la entidad");

  switch (p.target) {
    case "character":
      await assertProjectOwns("character", p.id, projectId);
      await prisma.character.update({ where: { id: p.id }, data: { [p.field]: p.value } });
      return;
    case "location":
      await assertProjectOwns("location", p.id, projectId);
      await prisma.location.update({ where: { id: p.id }, data: { [p.field]: p.value } });
      return;
    case "scene":
      await assertProjectOwns("scene", p.id, projectId);
      await prisma.scene.update({ where: { id: p.id }, data: { [p.field]: p.value } });
      return;
    case "shot": {
      await assertShotOwns(p.id, projectId);
      const data: Record<string, unknown> =
        p.field === "characters"
          ? { characterIds: toJson(Array.isArray(p.value) ? p.value : []) }
          : { [p.field]: p.value };
      await prisma.shot.update({ where: { id: p.id }, data });
      // Mantener el paquete de vídeo sincronizado con el plano editado.
      if (SHOT_PROMPT_FIELDS.has(p.field)) await rebuildShotGeminiPrompt(projectId, p.id);
      return;
    }
  }
}
