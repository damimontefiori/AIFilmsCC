import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { refineConcept } from "@/lib/pipeline/concept";
import { projectTextChoice } from "@/lib/model-choice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const choice = projectTextChoice(project, body.model, body.apiKey);
  try {
    const concept = await refineConcept(
      {
        idea: project.idea,
        language: project.language,
        genre: project.genre || undefined,
        tone: project.tone || undefined,
        title: project.title && project.title !== "Proyecto sin título" ? project.title : undefined,
      },
      choice,
    );

    const isDefaultTitle =
      !project.title || project.title === "Proyecto sin título";

    const updated = await updateProject(id, {
      title: isDefaultTitle && concept.title ? concept.title : project.title,
      logline: concept.logline,
      synopsis: concept.synopsis,
      genre: concept.genre,
      tone: concept.tone,
      styleBible: concept.styleBible,
      status: "concept",
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
