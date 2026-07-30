import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { buildGeminiVideoPrompt } from "@/lib/pipeline/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Recalcula el prompt de video (Gemini) de todos los planos con el builder
// actual. Útil para actualizar proyectos generados con una versión anterior.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const scenes = await prisma.scene.findMany({
    where: { projectId: id },
    include: { shots: true },
  });

  let updated = 0;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      const geminiPrompt = buildGeminiVideoPrompt({
        durationSec: shot.durationSec,
        actionDescription: shot.actionDescription,
        cameraNotes: shot.cameraNotes,
        dialogueOrVO: shot.dialogueOrVO,
        styleBible: project.styleBible,
      });
      await prisma.shot.update({ where: { id: shot.id }, data: { geminiPrompt } });
      updated++;
    }
  }

  return NextResponse.json({ updated, shots: await getShotsFlat(id) });
}
