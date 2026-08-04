import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShot } from "@/lib/shots";
import { parseJson } from "@/lib/serialize";
import { suggestKeyframeMoment } from "@/lib/pipeline/shots";
import { projectTextChoice } from "@/lib/model-choice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; sid: string }> };

// Propone (IA) el instante exacto a congelar del plano. No guarda: el usuario
// lo edita y el autoguardado lo persiste.
export async function POST(req: Request, { params }: Ctx) {
  const { id, sid } = await params;
  const project = await getProject(id);
  const shot = await getShot(sid);
  if (!project || !shot) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const choice = projectTextChoice(project, body.model, body.apiKey);
  try {
    const scene = await prisma.scene.findUnique({ where: { id: shot.sceneId } });
    const moment = await suggestKeyframeMoment(
      {
        actionDescription: shot.actionDescription,
        sceneHeading: scene?.heading || "",
        sceneSummary: scene?.summary || "",
        cameraNotes: shot.cameraNotes,
        characters: parseJson<string[]>(shot.characterIds, []),
        language: project.language,
      },
      choice,
    );
    return NextResponse.json({ moment });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
