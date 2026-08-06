import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getEncuadre } from "@/lib/locations";
import { buildImageEditPrompt } from "@/lib/pipeline/locations";
import { generateEditedImage, listImageVersions } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; lid: string; eid: string }> };

/** Corrige un ENCUADRE con una instrucción en lenguaje natural (nueva versión). */
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid, eid } = await params;
  const project = await getProject(id);
  const enc = await getEncuadre(eid);
  if (!project || !enc || enc.locationId !== lid || enc.location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!enc.imagePath) {
    return NextResponse.json({ error: "El encuadre aún no tiene imagen" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const instruction = String(body.instruction || "").slice(0, 800).trim();
  if (!instruction) {
    return NextResponse.json({ error: "Describe la corrección" }, { status: 400 });
  }
  try {
    const prompt = buildImageEditPrompt({
      instruction,
      styleBible: project.styleBible,
      aspectRatio: project.aspectRatio,
    });
    const { imagePath, provider } = await generateEditedImage({
      projectId: id,
      currentKey: enc.imagePath,
      newBase: `enc-${eid}-${Date.now()}`,
      prompt,
      aspectRatio: project.aspectRatio,
    });
    await prisma.encuadre.update({ where: { id: eid }, data: { imagePath } });
    const versions = await listImageVersions(id, `enc-${eid}-`, imagePath);
    return NextResponse.json({ imagePath, versions, provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
