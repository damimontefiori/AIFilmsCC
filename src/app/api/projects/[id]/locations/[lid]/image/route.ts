import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getLocation } from "@/lib/locations";
import { buildLocationPrompt } from "@/lib/pipeline/locations";
import { generateImage } from "@/lib/providers/image";
import { saveBase64Image } from "@/lib/media/store";
import { listImageVersions } from "@/lib/media/versions";

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
    // Se guarda como una NUEVA versión (no se borra la anterior: historial).
    const imagePath = await saveBase64Image(
      id,
      "keyframes",
      `loc-${lid}-${Date.now()}`,
      result.base64,
      result.mimeType,
    );
    await prisma.location.update({ where: { id: lid }, data: { imagePath, imagePrompt: prompt } });
    const versions = await listImageVersions(id, `loc-${lid}-`, imagePath);
    return NextResponse.json({ imagePath, versions, provider: result.provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
