import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { replaceBreakdown, getScenesWithShots } from "@/lib/shots";
import { breakdownShots } from "@/lib/pipeline/shots";
import { ScriptDocSchema } from "@/lib/pipeline/types";
import { parseJson } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!project.scriptJson) {
    return NextResponse.json(
      { error: "Genera el guion antes del desglose de planos." },
      { status: 400 },
    );
  }
  try {
    const script = ScriptDocSchema.parse(parseJson(project.scriptJson, {}));
    const breakdown = await breakdownShots({
      script,
      language: project.language,
      targetDurationSec: project.targetDurationSec,
    });
    await replaceBreakdown(id, breakdown, project.styleBible);
    if (["script", "characters"].includes(project.status)) {
      await prisma.project.update({ where: { id }, data: { status: "shots" } });
    }
    return NextResponse.json({ scenes: await getScenesWithShots(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
