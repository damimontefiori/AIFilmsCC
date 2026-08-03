import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sceneId: string }> };

// Cambia la LOCACIÓN por defecto de una escena (afecta a sus planos que usan el
// canónico; los que tienen un encuadre propio no cambian).
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, sceneId } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = body.locationId;
  let locationId: string | null = null;
  if (typeof raw === "string" && raw) {
    const loc = await prisma.location.findFirst({ where: { id: raw, projectId: id } });
    if (!loc) return NextResponse.json({ error: "Locación no encontrada" }, { status: 404 });
    locationId = loc.id;
  }
  const scene = await prisma.scene.update({
    where: { id: sceneId },
    data: { locationId },
  });
  return NextResponse.json({ scene: { id: scene.id, locationId: scene.locationId } });
}
