import { NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { getExportSegments } from "@/lib/timeline";
import { assembleFilm, type Segment, type AudioTrack } from "@/lib/media/ffmpeg";
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

  // Fuente de la secuencia: la línea de tiempo editada si existe; si no, los
  // clips importados en orden de plano (comportamiento clásico).
  const shots = await getShotsFlat(id);
  const withClips = shots.filter((s) => s.videoPath);
  const timeline = await getExportSegments(id);
  const usingTimeline = timeline.length > 0;

  const raw: { sourcePath: string; inSec: number | null; outSec: number | null; volume: number }[] =
    usingTimeline
      ? timeline
      : withClips.map((s) => ({ sourcePath: s.videoPath!, inSec: null, outSec: null, volume: 1 }));

  const segments: Segment[] = [];
  for (const s of raw) {
    const abs = fromRelative(s.sourcePath);
    if (abs) segments.push({ path: abs, inSec: s.inSec, outSec: s.outSec, volume: s.volume });
  }

  if (segments.length === 0) {
    return NextResponse.json(
      { error: "No hay clips para ensamblar. Importa clips o genera la línea de tiempo." },
      { status: 400 },
    );
  }

  // Pista de audio opcional del film final.
  let audio: AudioTrack | undefined;
  if (project.audioPath) {
    const aAbs = fromRelative(project.audioPath);
    if (aAbs) {
      audio = {
        path: aAbs,
        mode: project.audioMode === "replace" ? "replace" : "mix",
        volume: project.audioVolume,
      };
    }
  }

  const exportRow = await prisma.export.create({
    data: {
      projectId: id,
      status: "running",
      settings: JSON.stringify({ count: segments.length, source: usingTimeline ? "timeline" : "shots", audio: !!audio }),
    },
  });

  try {
    const dir = await ensureDir(projectSubdir(id, "exports"));
    const outAbs = path.join(dir, `film-${Date.now()}.mp4`);
    await assembleFilm(segments, outAbs, project.aspectRatio, { audio });
    const relKey = toRelative(outAbs);

    await prisma.export.update({
      where: { id: exportRow.id },
      data: { status: "done", outputPath: relKey },
    });
    await prisma.project.update({ where: { id }, data: { status: "assembled" } });

    return NextResponse.json({
      export: { id: exportRow.id, status: "done", outputPath: relKey },
      usedClips: segments.length,
      missing: usingTimeline ? 0 : shots.length - withClips.length,
      source: usingTimeline ? "timeline" : "shots",
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
