import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { getTimeline, buildTimelineFromClips } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Línea de tiempo actual del proyecto.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ timeline: await getTimeline(id) });
}

// (Re)genera la línea de tiempo desde los clips importados por plano.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ timeline: await buildTimelineFromClips(id) });
}
