import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { listLocations } from "@/lib/locations";
import { extractLocations } from "@/lib/pipeline/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!project.scriptMarkdown) {
    return NextResponse.json(
      { error: "Genera el guion antes de extraer locaciones." },
      { status: 400 },
    );
  }
  try {
    const extracted = await extractLocations({
      scriptMarkdown: project.scriptMarkdown,
      styleBible: project.styleBible,
      language: project.language,
    });

    const existing = await prisma.location.findMany({ where: { projectId: id } });
    const existingNames = new Set(existing.map((l) => l.name.trim().toLowerCase()));
    let order = existing.length;
    let added = 0;
    for (const l of extracted) {
      if (existingNames.has(l.name.trim().toLowerCase())) continue;
      await prisma.location.create({
        data: { projectId: id, name: l.name, description: l.description, order: order++ },
      });
      added++;
    }
    return NextResponse.json({ added, locations: await listLocations(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
