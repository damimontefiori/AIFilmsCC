import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listCharacters } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await listCharacters(id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const count = await prisma.character.count({ where: { projectId: id } });
  const character = await prisma.character.create({
    data: {
      projectId: id,
      name: (body.name || "Nuevo personaje").toString(),
      role: (body.role || "").toString(),
      canonicalDescription: (body.canonicalDescription || "").toString(),
      personality: (body.personality || "").toString(),
      order: count,
    },
  });
  return NextResponse.json(character, { status: 201 });
}
