import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShot, toShotDTO } from "@/lib/shots";
import { parseJson, type ReferenceImage } from "@/lib/serialize";
import { buildKeyframePrompt } from "@/lib/pipeline/shots";
import { generateImage, type InputImage } from "@/lib/providers/image";
import { saveBase64Image, readMediaBase64 } from "@/lib/media/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; sid: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id, sid } = await params;
  const project = await getProject(id);
  const shot = await getShot(sid);
  if (!project || !shot) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  try {
    const scene = await prisma.scene.findUnique({ where: { id: shot.sceneId } });
    const shotChars = parseJson<string[]>(shot.characterIds, []);

    // Mapea nombres del plano a personajes del proyecto.
    const allChars = await prisma.character.findMany({ where: { projectId: id } });
    const byName = new Map(allChars.map((c) => [c.name.trim().toLowerCase(), c]));
    const matched = shotChars
      .map((n) => byName.get(n.trim().toLowerCase()))
      .filter((c): c is (typeof allChars)[number] => Boolean(c));

    // Reúne imágenes de referencia (prioriza personajes bloqueados).
    const referenceImages: InputImage[] = [];
    const descriptions: { name: string; description: string }[] = [];
    for (const c of matched) {
      descriptions.push({ name: c.name, description: c.canonicalDescription });
      const refs = parseJson<ReferenceImage[]>(c.referenceImages, []);
      // Una imagen por personaje (la primera disponible) para no saturar.
      const chosen = refs[0];
      if (chosen && referenceImages.length < 4) {
        const data = await readMediaBase64(chosen.path);
        if (data) referenceImages.push({ base64: data.base64, mimeType: "image/png" });
      }
    }

    const prompt = buildKeyframePrompt({
      sceneHeading: scene?.heading || "",
      actionDescription: shot.actionDescription,
      cameraNotes: shot.cameraNotes,
      characterDescriptions: descriptions,
      styleBible: project.styleBible,
      aspectRatio: project.aspectRatio,
      withReferences: referenceImages.length > 0,
    });

    const result = await generateImage({
      prompt,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      aspectRatio: project.aspectRatio,
    });

    const keyframePath = await saveBase64Image(
      id,
      "keyframes",
      `${sid}-${Date.now()}`,
      result.base64,
      result.mimeType,
    );

    // Borra el keyframe anterior (evita archivos huérfanos al regenerar).
    if (shot.keyframePath && shot.keyframePath !== keyframePath) {
      const { fromRelative } = await import("@/lib/paths");
      const { promises: fs } = await import("node:fs");
      const oldAbs = fromRelative(shot.keyframePath);
      if (oldAbs) await fs.rm(oldAbs, { force: true }).catch(() => {});
    }

    const updated = await prisma.shot.update({
      where: { id: sid },
      data: {
        keyframePath,
        keyframePrompt: prompt,
        status: shot.status === "planned" ? "package_ready" : shot.status,
      },
    });
    return NextResponse.json({ shot: toShotDTO(updated), provider: result.provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
