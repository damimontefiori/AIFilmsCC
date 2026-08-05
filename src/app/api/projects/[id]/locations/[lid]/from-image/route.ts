import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getLocation } from "@/lib/locations";
import { buildLocationBibleFromImage } from "@/lib/pipeline/locations";
import { describeImage } from "@/lib/providers/vision";
import { saveBuffer } from "@/lib/media/store";
import { fromRelative } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; lid: string }> };

function extFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

/**
 * Analiza una imagen de referencia subida y redacta la "biblia de objetos"
 * (adaptada al estilo del film). mode="reference" solo rellena la descripción;
 * mode="canonical" además fija la imagen como Ambiente canónico de la locación.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const project = await getProject(id);
  const location = await getLocation(lid);
  if (!project || !location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const hint = String(form?.get("hint") || "").slice(0, 500);
  const mode = form?.get("mode") === "canonical" ? "canonical" : "reference";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  const mimeType = file.type || "image/png";
  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const { system, user } = buildLocationBibleFromImage({
      name: location.name,
      styleBible: project.styleBible,
      genre: project.genre,
      tone: project.tone,
      hint,
      language: project.language,
    });
    const { text, provider } = await describeImage({
      imageBase64: buf.toString("base64"),
      mimeType,
      system,
      user,
    });

    const data: { description: string; imagePath?: string; imagePrompt?: string } = {
      description: text,
    };
    if (mode === "canonical") {
      const relKey = await saveBuffer(id, "keyframes", `loc-${lid}-${Date.now()}.${extFor(mimeType)}`, buf);
      // Borra la imagen anterior de la locación (best-effort).
      if (location.imagePath && location.imagePath !== relKey) {
        const oldAbs = fromRelative(location.imagePath);
        if (oldAbs) await fs.rm(oldAbs, { force: true }).catch(() => {});
      }
      data.imagePath = relKey;
      data.imagePrompt = "(imagen subida por el usuario)";
    }

    const updated = await prisma.location.update({ where: { id: lid }, data });
    return NextResponse.json({
      description: updated.description,
      imagePath: updated.imagePath,
      provider,
      mode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
