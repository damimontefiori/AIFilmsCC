import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJson, type ReferenceImage } from "@/lib/serialize";
import { fromRelative } from "@/lib/paths";
import { promises as fs } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; cid: string }> };

const EDITABLE = new Set([
  "name",
  "role",
  "canonicalDescription",
  "personality",
  "locked",
  "notes",
  "order",
]);

export async function PATCH(req: Request, { params }: Ctx) {
  const { cid } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) data[k] = v;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const character = await prisma.character.update({ where: { id: cid }, data });
  return NextResponse.json(character);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { cid } = await params;
  const character = await prisma.character.findUnique({ where: { id: cid } });
  if (character) {
    // Borra los archivos de referencia (best-effort).
    const refs = parseJson<ReferenceImage[]>(character.referenceImages, []);
    for (const r of refs) {
      const abs = fromRelative(r.path);
      if (abs) await fs.rm(abs, { force: true }).catch(() => {});
    }
    await prisma.character.delete({ where: { id: cid } });
  }
  return NextResponse.json({ ok: true });
}
