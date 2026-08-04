import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { saveBuffer } from "@/lib/media/store";
import { probe } from "@/lib/media/ffmpeg";
import { fromRelative } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function settings(p: { audioPath: string | null; audioMode: string; audioVolume: number }) {
  return { audioPath: p.audioPath, audioMode: p.audioMode, audioVolume: p.audioVolume };
}

// Sube la pista de audio del film final (música/voz). Valida que sea audio legible.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase() || ".mp3";
  const buf = Buffer.from(await file.arrayBuffer());
  const relKey = await saveBuffer(id, "audio", `track-${Date.now()}${ext}`, buf);
  const abs = fromRelative(relKey)!;

  try {
    const info = await probe(abs);
    if (!info.hasAudio) throw new Error("el archivo no contiene pista de audio");
  } catch (err) {
    await fs.rm(abs, { force: true }).catch(() => {});
    return NextResponse.json(
      { error: `Audio inválido: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  // Borra la pista anterior (best-effort) y guarda la nueva.
  if (project.audioPath && project.audioPath !== relKey) {
    const old = fromRelative(project.audioPath);
    if (old) await fs.rm(old, { force: true }).catch(() => {});
  }
  const updated = await prisma.project.update({ where: { id }, data: { audioPath: relKey } });
  return NextResponse.json({ audio: settings(updated) });
}

// Ajusta el modo (mix|replace) y el volumen de la pista.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data: { audioMode?: string; audioVolume?: number } = {};
  if (body?.audioMode === "mix" || body?.audioMode === "replace") data.audioMode = body.audioMode;
  if (Number.isFinite(Number(body?.audioVolume))) {
    data.audioVolume = Math.min(2, Math.max(0, Number(body.audioVolume)));
  }
  const updated = await prisma.project.update({ where: { id }, data });
  return NextResponse.json({ audio: settings(updated) });
}

// Quita la pista de audio.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (project.audioPath) {
    const abs = fromRelative(project.audioPath);
    if (abs) await fs.rm(abs, { force: true }).catch(() => {});
  }
  const updated = await prisma.project.update({ where: { id }, data: { audioPath: null } });
  return NextResponse.json({ audio: settings(updated) });
}
