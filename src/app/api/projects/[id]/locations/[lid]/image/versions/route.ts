import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getLocation } from "@/lib/locations";
import { fromRelative } from "@/lib/paths";
import { listImageVersions, deleteImageVersion } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; lid: string }> };

function belongs(lid: string, relKey: string): boolean {
  return path.basename(relKey).startsWith(`loc-${lid}-`);
}

/** GET: historial del ambiente canónico (claves rel, más recientes primero). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const location = await getLocation(lid);
  if (!location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const versions = await listImageVersions(id, `loc-${lid}-`, location.imagePath);
  return NextResponse.json({ imagePath: location.imagePath, versions });
}

/** POST { imagePath }: selecciona una versión existente como ambiente actual. */
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const location = await getLocation(lid);
  if (!location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const imagePath = String(body.imagePath || "");
  if (!belongs(lid, imagePath)) {
    return NextResponse.json({ error: "Versión no válida" }, { status: 400 });
  }
  const abs = fromRelative(imagePath);
  if (!abs || !(await fs.access(abs).then(() => true, () => false))) {
    return NextResponse.json({ error: "La versión ya no existe" }, { status: 404 });
  }
  await prisma.location.update({ where: { id: lid }, data: { imagePath } });
  const versions = await listImageVersions(id, `loc-${lid}-`, imagePath);
  return NextResponse.json({ imagePath, versions });
}

/** DELETE { imagePath }: borra una versión. Si era la actual, pasa a la más
 * reciente restante (o null si no queda ninguna). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const location = await getLocation(lid);
  if (!location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const imagePath = String(body.imagePath || "");
  if (!belongs(lid, imagePath)) {
    return NextResponse.json({ error: "Versión no válida" }, { status: 400 });
  }
  await deleteImageVersion(id, `loc-${lid}-`, imagePath);
  let current = location.imagePath;
  if (current === imagePath) {
    const rest = await listImageVersions(id, `loc-${lid}-`, null);
    current = rest[0] ?? null;
    await prisma.location.update({ where: { id: lid }, data: { imagePath: current } });
  }
  const versions = await listImageVersions(id, `loc-${lid}-`, current);
  return NextResponse.json({ imagePath: current, versions });
}
