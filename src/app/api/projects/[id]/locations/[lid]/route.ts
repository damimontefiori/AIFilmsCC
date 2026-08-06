import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { fromRelative } from "@/lib/paths";
import { deleteAllVersions } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; lid: string }> };

const EDITABLE = new Set(["name", "description", "locked", "order"]);

export async function PATCH(req: Request, { params }: Ctx) {
  const { lid } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) data[k] = v;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const location = await prisma.location.update({ where: { id: lid }, data });
  return NextResponse.json(location);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const location = await prisma.location.findUnique({
    where: { id: lid },
    include: { encuadres: true },
  });
  if (location) {
    // Borra TODO el historial del ambiente y de cada encuadre (no solo la actual).
    await deleteAllVersions(id, `loc-${lid}-`);
    for (const enc of location.encuadres) {
      await deleteAllVersions(id, `enc-${enc.id}-`);
      // Encuadres con nombre de esquema previo (no cubiertos por el prefijo eid).
      if (enc.imagePath) {
        const abs = fromRelative(enc.imagePath);
        if (abs) await fs.rm(abs, { force: true }).catch(() => {});
      }
    }
  }
  await prisma.location.delete({ where: { id: lid } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
