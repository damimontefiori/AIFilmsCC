import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { fromRelative } from "@/lib/paths";
import { deleteAllVersions } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; lid: string; eid: string }> };

// Elimina un encuadre. Los planos que lo usaban vuelven al canónico
// (encuadreId → null por onDelete: SetNull).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, eid } = await params;
  const enc = await prisma.encuadre.findUnique({ where: { id: eid } });
  if (!enc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // Borra TODO el historial del encuadre (no solo la versión actual).
  await deleteAllVersions(id, `enc-${eid}-`);
  // Imagen con esquema de nombre previo (no cubierta por el prefijo eid).
  if (enc.imagePath) {
    const abs = fromRelative(enc.imagePath);
    if (abs) await fs.rm(abs, { force: true }).catch(() => {});
  }
  await prisma.encuadre.delete({ where: { id: eid } });
  return NextResponse.json({ ok: true });
}
