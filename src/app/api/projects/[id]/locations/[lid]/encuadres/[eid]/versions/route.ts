import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getEncuadre } from "@/lib/locations";
import { fromRelative } from "@/lib/paths";
import { listImageVersions, deleteImageVersion } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; lid: string; eid: string }> };

function belongs(eid: string, relKey: string): boolean {
  return path.basename(relKey).startsWith(`enc-${eid}-`);
}

/** GET: historial del encuadre. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id, lid, eid } = await params;
  const enc = await getEncuadre(eid);
  if (!enc || enc.locationId !== lid || enc.location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const versions = await listImageVersions(id, `enc-${eid}-`, enc.imagePath);
  return NextResponse.json({ imagePath: enc.imagePath, versions });
}

/** POST { imagePath }: selecciona una versión existente como imagen actual. */
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid, eid } = await params;
  const enc = await getEncuadre(eid);
  if (!enc || enc.locationId !== lid || enc.location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const imagePath = String(body.imagePath || "");
  if (!belongs(eid, imagePath)) {
    return NextResponse.json({ error: "Versión no válida" }, { status: 400 });
  }
  const abs = fromRelative(imagePath);
  if (!abs || !(await fs.access(abs).then(() => true, () => false))) {
    return NextResponse.json({ error: "La versión ya no existe" }, { status: 404 });
  }
  await prisma.encuadre.update({ where: { id: eid }, data: { imagePath } });
  const versions = await listImageVersions(id, `enc-${eid}-`, imagePath);
  return NextResponse.json({ imagePath, versions });
}

/** DELETE { imagePath }: borra una versión; si era la actual, pasa a la más
 * reciente restante (o null). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id, lid, eid } = await params;
  const enc = await getEncuadre(eid);
  if (!enc || enc.locationId !== lid || enc.location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const imagePath = String(body.imagePath || "");
  if (!belongs(eid, imagePath)) {
    return NextResponse.json({ error: "Versión no válida" }, { status: 400 });
  }
  await deleteImageVersion(id, `enc-${eid}-`, imagePath);
  let current = enc.imagePath;
  if (current === imagePath) {
    const rest = await listImageVersions(id, `enc-${eid}-`, null);
    current = rest[0] ?? null;
    await prisma.encuadre.update({ where: { id: eid }, data: { imagePath: current } });
  }
  const versions = await listImageVersions(id, `enc-${eid}-`, current);
  return NextResponse.json({ imagePath: current, versions });
}
