import { NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.idea !== "string" || body.idea.trim() === "") {
    return NextResponse.json({ error: "Falta la idea" }, { status: 400 });
  }
  const project = await createProject({
    title: body.title,
    idea: body.idea,
    language: body.language,
    aspectRatio: body.aspectRatio,
    targetDurationSec:
      typeof body.targetDurationSec === "number" ? body.targetDurationSec : undefined,
    genre: body.genre,
    tone: body.tone,
  });
  return NextResponse.json(project, { status: 201 });
}
