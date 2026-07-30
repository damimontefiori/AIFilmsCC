import { NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Campos que el cliente puede actualizar directamente.
const EDITABLE = new Set([
  "title",
  "idea",
  "logline",
  "synopsis",
  "genre",
  "tone",
  "language",
  "aspectRatio",
  "targetDurationSec",
  "styleBible",
  "status",
  "scriptModel",
  "scriptJson",
  "scriptMarkdown",
]);

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) data[k] = v;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const project = await updateProject(id, data);
  return NextResponse.json(project);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
