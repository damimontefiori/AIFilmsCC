import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/serialize";
import { toShotDTO } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sid: string }> };

const EDITABLE = new Set([
  "actionDescription",
  "keyframeMoment",
  "cameraNotes",
  "dialogueOrVO",
  "durationSec",
  "geminiPrompt",
  "notes",
  "status",
  "assignedAccountId",
  "encuadreId",
  "locationId",
  "renderMode",
]);

export async function PATCH(req: Request, { params }: Ctx) {
  const { sid } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) data[k] = v;
  }
  if (Array.isArray(body.characters)) {
    data.characterIds = toJson(body.characters.map(String));
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const shot = await prisma.shot.update({
    where: { id: sid },
    data,
    include: { encuadre: true },
  });
  return NextResponse.json(toShotDTO(shot));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { sid } = await params;
  await prisma.shot.delete({ where: { id: sid } });
  return NextResponse.json({ ok: true });
}
