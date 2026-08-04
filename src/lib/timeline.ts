import { prisma } from "@/lib/db";
import { getShotsFlat } from "@/lib/shots";
import type { TimelineClipDTO } from "@/lib/dto";

/** Mapa sourceShotId → keyframePath (para el thumbnail de cada segmento). */
async function keyframeMap(projectId: string): Promise<Map<string, string | null>> {
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    include: { shots: { select: { id: true, keyframePath: true } } },
  });
  const m = new Map<string, string | null>();
  for (const sc of scenes) for (const sh of sc.shots) m.set(sh.id, sh.keyframePath);
  return m;
}

export async function getTimeline(projectId: string): Promise<TimelineClipDTO[]> {
  const clips = await prisma.timelineClip.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  const kf = await keyframeMap(projectId);
  return clips.map((c) => ({
    id: c.id,
    order: c.order,
    sourcePath: c.sourcePath,
    sourceShotId: c.sourceShotId,
    label: c.label,
    inSec: c.inSec,
    outSec: c.outSec,
    volume: c.volume,
    keyframePath: c.sourceShotId ? kf.get(c.sourceShotId) ?? null : null,
  }));
}

/** Normaliza un volumen a [0, 2] (0..200%). */
function clampVol(v: unknown, fallback = 1): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : fallback;
}

/**
 * (Re)genera la línea de tiempo a partir de los clips importados por plano, en
 * orden de plano. Un segmento por clip, sin recortes. Reemplaza la existente.
 */
export async function buildTimelineFromClips(projectId: string): Promise<TimelineClipDTO[]> {
  const shots = await getShotsFlat(projectId);
  const withClips = shots.filter((s) => s.videoPath);
  await prisma.timelineClip.deleteMany({ where: { projectId } });
  let order = 0;
  for (const s of withClips) {
    await prisma.timelineClip.create({
      data: {
        projectId,
        order: order++,
        sourcePath: s.videoPath!,
        sourceShotId: s.id,
        label: (s.actionDescription || "").slice(0, 80),
      },
    });
  }
  return getTimeline(projectId);
}

/**
 * Reemplaza por completo la línea de tiempo por la lista dada (order = índice).
 * Usado por "deshacer": restaura un snapshot previo (los ids se regeneran, pero
 * el estado efectivo — fuente, recortes y orden — se conserva).
 */
export async function replaceTimeline(
  projectId: string,
  clips: {
    sourcePath: string;
    sourceShotId?: string | null;
    label?: string;
    inSec?: number | null;
    outSec?: number | null;
    volume?: number | null;
  }[],
): Promise<TimelineClipDTO[]> {
  await prisma.timelineClip.deleteMany({ where: { projectId } });
  let order = 0;
  for (const c of clips) {
    if (!c || typeof c.sourcePath !== "string" || !c.sourcePath) continue;
    await prisma.timelineClip.create({
      data: {
        projectId,
        order: order++,
        sourcePath: c.sourcePath,
        sourceShotId: c.sourceShotId ?? null,
        label: typeof c.label === "string" ? c.label : "",
        inSec: typeof c.inSec === "number" ? c.inSec : null,
        outSec: typeof c.outSec === "number" ? c.outSec : null,
        volume: clampVol(c.volume),
      },
    });
  }
  return getTimeline(projectId);
}

/**
 * Divide un segmento en `atSec` (segundos ABSOLUTOS del clip de origen). No
 * necesita conocer la duración: la primera parte pasa a terminar en `atSec` y la
 * segunda arranca en `atSec` conservando el `outSec` original (null = hasta el fin).
 */
export async function splitClip(
  projectId: string,
  clipId: string,
  atSec: number,
): Promise<TimelineClipDTO[]> {
  const clip = await prisma.timelineClip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) throw new Error("Segmento no encontrado");
  const effIn = clip.inSec ?? 0;
  if (!(atSec > effIn + 0.05)) throw new Error("El punto de corte debe ser mayor que la entrada");
  if (clip.outSec != null && !(atSec < clip.outSec - 0.05)) {
    throw new Error("El punto de corte debe ser menor que la salida");
  }
  // Hueco en el orden para la segunda parte.
  await prisma.timelineClip.updateMany({
    where: { projectId, order: { gt: clip.order } },
    data: { order: { increment: 1 } },
  });
  await prisma.timelineClip.update({ where: { id: clip.id }, data: { outSec: atSec } });
  await prisma.timelineClip.create({
    data: {
      projectId,
      order: clip.order + 1,
      sourcePath: clip.sourcePath,
      sourceShotId: clip.sourceShotId,
      label: clip.label,
      inSec: atSec,
      outSec: clip.outSec,
      volume: clip.volume, // ambas mitades heredan el volumen
    },
  });
  return getTimeline(projectId);
}

const NUM = (v: unknown): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** Actualiza recortes/etiqueta de un segmento (whitelist). */
export async function updateClip(
  projectId: string,
  clipId: string,
  data: { inSec?: unknown; outSec?: unknown; label?: unknown; volume?: unknown },
): Promise<TimelineClipDTO[]> {
  const clip = await prisma.timelineClip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) throw new Error("Segmento no encontrado");
  const patch: { inSec?: number | null; outSec?: number | null; label?: string; volume?: number } = {};
  if ("inSec" in data) patch.inSec = NUM(data.inSec);
  if ("outSec" in data) patch.outSec = NUM(data.outSec);
  if (typeof data.label === "string") patch.label = data.label.slice(0, 120);
  if ("volume" in data) patch.volume = clampVol(data.volume, clip.volume);
  const nextIn = patch.inSec !== undefined ? patch.inSec : clip.inSec;
  const nextOut = patch.outSec !== undefined ? patch.outSec : clip.outSec;
  if (nextIn != null && nextOut != null && nextOut <= nextIn) {
    throw new Error("La salida debe ser mayor que la entrada");
  }
  await prisma.timelineClip.update({ where: { id: clipId }, data: patch });
  return getTimeline(projectId);
}

export async function deleteClip(projectId: string, clipId: string): Promise<TimelineClipDTO[]> {
  await prisma.timelineClip.deleteMany({ where: { id: clipId, projectId } });
  return getTimeline(projectId);
}

/** Reordena la timeline según el array de ids dado (índice = nuevo order). */
export async function reorderTimeline(projectId: string, ids: string[]): Promise<TimelineClipDTO[]> {
  const clips = await prisma.timelineClip.findMany({ where: { projectId } });
  const valid = new Set(clips.map((c) => c.id));
  const ordered = ids.filter((id) => valid.has(id));
  await prisma.$transaction(
    ordered.map((id, i) => prisma.timelineClip.update({ where: { id }, data: { order: i } })),
  );
  return getTimeline(projectId);
}

/** Fija el mismo volumen (0..2) a TODOS los segmentos del proyecto. */
export async function setAllVolumes(projectId: string, volume: unknown): Promise<TimelineClipDTO[]> {
  await prisma.timelineClip.updateMany({ where: { projectId }, data: { volume: clampVol(volume) } });
  return getTimeline(projectId);
}

/** Segmentos listos para ffmpeg (ruta absoluta se resuelve en la ruta de export). */
export type ExportSegment = {
  sourcePath: string;
  inSec: number | null;
  outSec: number | null;
  volume: number;
};

export async function getExportSegments(projectId: string): Promise<ExportSegment[]> {
  const clips = await prisma.timelineClip.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return clips.map((c) => ({ sourcePath: c.sourcePath, inSec: c.inSec, outSec: c.outSec, volume: c.volume }));
}
