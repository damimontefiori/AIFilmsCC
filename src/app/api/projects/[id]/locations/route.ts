import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listLocations } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await listLocations(id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const count = await prisma.location.count({ where: { projectId: id } });
  const location = await prisma.location.create({
    data: {
      projectId: id,
      name: (body.name || "Nueva locación").toString(),
      description: (body.description || "").toString(),
      order: count,
    },
  });
  return NextResponse.json(location, { status: 201 });
}
