import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { getShot, toShotDTO } from "@/lib/shots";
import { saveBuffer } from "@/lib/media/store";
import { probe } from "@/lib/media/ffmpeg";
import { fromRelative } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; sid: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id, sid } = await params;
  const shot = await getShot(sid);
  if (!shot) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase() || ".mp4";
  const buf = Buffer.from(await file.arrayBuffer());
  const relKey = await saveBuffer(id, "clips", `${sid}${ext}`, buf);

  // Valida que sea un video legible.
  const abs = fromRelative(relKey)!;
  try {
    const info = await probe(abs);
    if (!info.width || !info.height) throw new Error("sin pista de video");
    const updated = await prisma.shot.update({
      where: { id: sid },
      data: { videoPath: relKey, status: "imported" },
    });
    return NextResponse.json({ shot: toShotDTO(updated), probe: info });
  } catch (err) {
    await fs.rm(abs, { force: true }).catch(() => {});
    return NextResponse.json(
      { error: `Archivo de video inválido: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { sid } = await params;
  const shot = await getShot(sid);
  if (!shot) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (shot.videoPath) {
    const abs = fromRelative(shot.videoPath);
    if (abs) await fs.rm(abs, { force: true }).catch(() => {});
  }
  const updated = await prisma.shot.update({
    where: { id: sid },
    data: {
      videoPath: null,
      status: shot.status === "imported" ? "generated" : shot.status,
    },
  });
  return NextResponse.json({ shot: toShotDTO(updated) });
}
