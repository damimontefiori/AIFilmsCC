import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getLocation } from "@/lib/locations";
import { buildImageEditPrompt } from "@/lib/pipeline/locations";
import { generateEditedImage, listImageVersions } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; lid: string }> };

/**
 * Corrige el AMBIENTE canónico con una instrucción en lenguaje natural
 * ("agranda la lámpara", "elimina a la persona de la derecha"). Usa la imagen
 * actual como lienzo y guarda el resultado como NUEVA versión (conserva el
 * historial). Devuelve la nueva imagen y el historial actualizado.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const project = await getProject(id);
  const location = await getLocation(lid);
  if (!project || !location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!location.imagePath) {
    return NextResponse.json({ error: "Genera primero la imagen del ambiente" }, { status: 400 });
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
      currentKey: location.imagePath,
      newBase: `loc-${lid}-${Date.now()}`,
      prompt,
      aspectRatio: project.aspectRatio,
    });
    await prisma.location.update({ where: { id: lid }, data: { imagePath } });
    const versions = await listImageVersions(id, `loc-${lid}-`, imagePath);
    return NextResponse.json({ imagePath, versions, provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
