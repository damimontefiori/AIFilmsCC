import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { getCharacter, addReferenceImage, removeReferenceImage } from "@/lib/characters";
import { parseJson, type ReferenceImage } from "@/lib/serialize";
import { buildReferencePrompt, type ReferenceKind } from "@/lib/pipeline/characters";
import { generateImage, type InputImage } from "@/lib/providers/image";
import { saveBase64Image, readMediaBase64 } from "@/lib/media/store";
import { todayKey } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; cid: string }> };

const ASPECT: Record<ReferenceKind, string> = {
  portrait: "1:1",
  full_body: "9:16",
  three_quarter: "1:1",
};

export async function POST(req: Request, { params }: Ctx) {
  const { id, cid } = await params;
  const project = await getProject(id);
  const character = await getCharacter(cid);
  if (!project || !character) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const kind: ReferenceKind = ["portrait", "full_body", "three_quarter"].includes(body.kind)
    ? body.kind
    : "portrait";
  const useReferences = body.useReferences !== false; // por defecto true

  try {
    const existing = parseJson<ReferenceImage[]>(character.referenceImages, []);

    // Reúne imágenes de referencia existentes para mantener la identidad.
    const referenceImages: InputImage[] = [];
    if (useReferences && existing.length > 0) {
      for (const r of existing.slice(-3)) {
        const data = await readMediaBase64(r.path);
        if (data) referenceImages.push({ base64: data.base64, mimeType: "image/png" });
      }
    }

    const prompt = buildReferencePrompt({
      canonicalDescription: character.canonicalDescription,
      styleBible: project.styleBible,
      kind,
      withReferences: referenceImages.length > 0,
    });

    const result = await generateImage({
      prompt,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      aspectRatio: ASPECT[kind],
    });

    const path = await saveBase64Image(
      id,
      "characters",
      `${cid}-${kind}-${Date.now()}`,
      result.base64,
      result.mimeType,
    );

    const ref: ReferenceImage = {
      path,
      kind,
      provider: result.provider,
      prompt,
      createdAt: todayKey(),
    };
    const refs = await addReferenceImage(cid, ref);
    return NextResponse.json({ ref, referenceImages: refs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { cid } = await params;
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Falta path" }, { status: 400 });
  }
  const refs = await removeReferenceImage(cid, path);
  // Borra el archivo (best-effort).
  const { fromRelative } = await import("@/lib/paths");
  const { promises: fs } = await import("node:fs");
  const abs = fromRelative(path);
  if (abs) await fs.rm(abs, { force: true }).catch(() => {});
  return NextResponse.json({ referenceImages: refs });
}
