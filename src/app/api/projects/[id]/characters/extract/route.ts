import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { listCharacters } from "@/lib/characters";
import { extractCharacters } from "@/lib/pipeline/characters";

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
  if (!project.scriptMarkdown) {
    return NextResponse.json(
      { error: "Genera el guion antes de extraer personajes." },
      { status: 400 },
    );
  }
  try {
    const extracted = await extractCharacters({
      scriptMarkdown: project.scriptMarkdown,
      styleBible: project.styleBible,
      language: project.language,
    });

    // No destructivo: solo añade personajes cuyo nombre aún no existe.
    const existing = await prisma.character.findMany({ where: { projectId: id } });
    const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    let order = existing.length;
    let added = 0;
    for (const c of extracted) {
      if (existingNames.has(c.name.trim().toLowerCase())) continue;
      await prisma.character.create({
        data: {
          projectId: id,
          name: c.name,
          role: c.role,
          canonicalDescription: c.canonicalDescription,
          personality: c.personality,
          order: order++,
        },
      });
      added++;
    }
    if (project.status === "script") {
      await prisma.project.update({ where: { id }, data: { status: "characters" } });
    }
    return NextResponse.json({ added, characters: await listCharacters(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
