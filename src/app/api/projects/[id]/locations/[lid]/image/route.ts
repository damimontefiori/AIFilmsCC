import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getLocation, toLocationDTO } from "@/lib/locations";
import { buildLocationPrompt } from "@/lib/pipeline/locations";
import { generateImage } from "@/lib/providers/image";
import { saveBase64Image } from "@/lib/media/store";
import { fromRelative } from "@/lib/paths";
import { promises as fs } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; lid: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const project = await getProject(id);
  const location = await getLocation(lid);
  if (!project || !location) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  try {
    const prompt = buildLocationPrompt({
      name: location.name,
      description: location.description,
      styleBible: project.styleBible,
      aspectRatio: project.aspectRatio,
    });
    const result = await generateImage({ prompt, aspectRatio: project.aspectRatio });
    const imagePath = await saveBase64Image(
      id,
      "keyframes",
      `loc-${lid}-${Date.now()}`,
      result.base64,
      result.mimeType,
    );
    // Borra la imagen anterior de la locación.
    if (location.imagePath && location.imagePath !== imagePath) {
      const oldAbs = fromRelative(location.imagePath);
      if (oldAbs) await fs.rm(oldAbs, { force: true }).catch(() => {});
    }
    const updated = await prisma.location.update({
      where: { id: lid },
      data: { imagePath, imagePrompt: prompt },
    });
    return NextResponse.json({ location: toLocationDTO(updated), provider: result.provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
