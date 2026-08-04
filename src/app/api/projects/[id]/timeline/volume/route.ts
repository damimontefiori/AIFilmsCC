import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { setAllVolumes } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Fija el mismo volumen (0..2) a TODOS los segmentos. Body: { volume: number }.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const timeline = await setAllVolumes(id, body?.volume);
  return NextResponse.json({ timeline });
}
