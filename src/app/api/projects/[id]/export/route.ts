import { NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { assembleFilm } from "@/lib/media/ffmpeg";
import { fromRelative, projectSubdir, ensureDir, toRelative } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type Ctx = { params: Promise<{ id: string }> };

// Último export del proyecto (para mostrar el reproductor).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const last = await prisma.export.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(last ?? null);
}

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const shots = await getShotsFlat(id);
  const withClips = shots.filter((s) => s.videoPath);
  if (withClips.length === 0) {
    return NextResponse.json(
      { error: "No hay clips importados para ensamblar." },
      { status: 400 },
    );
  }

  const clipPaths = withClips
    .map((s) => fromRelative(s.videoPath!))
    .filter((p): p is string => Boolean(p));

  const exportRow = await prisma.export.create({
    data: { projectId: id, status: "running", settings: JSON.stringify({ count: clipPaths.length }) },
  });

  try {
    const dir = await ensureDir(projectSubdir(id, "exports"));
    const outAbs = path.join(dir, `film-${Date.now()}.mp4`);
    await assembleFilm(clipPaths, outAbs, project.aspectRatio);
    const relKey = toRelative(outAbs);

    await prisma.export.update({
      where: { id: exportRow.id },
      data: { status: "done", outputPath: relKey },
    });
    await prisma.project.update({ where: { id }, data: { status: "assembled" } });

    return NextResponse.json({
      export: { id: exportRow.id, status: "done", outputPath: relKey },
      usedClips: clipPaths.length,
      missing: shots.length - withClips.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.export.update({
      where: { id: exportRow.id },
      data: { status: "error", error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
