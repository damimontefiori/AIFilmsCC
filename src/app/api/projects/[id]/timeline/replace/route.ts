import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { replaceTimeline } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Reemplaza la línea de tiempo completa (usado por "deshacer": restaura un
// snapshot previo). Body: { clips: [{ sourcePath, sourceShotId?, label?, inSec?, outSec? }] }.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const clips = Array.isArray(body?.clips) ? body.clips : [];
  const timeline = await replaceTimeline(id, clips);
  return NextResponse.json({ timeline });
}
