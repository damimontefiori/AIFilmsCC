import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { generateScript } from "@/lib/pipeline/script";
import { scriptToMarkdown } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// gpt-5.4-pro puede tardar hasta ~15 min. (En local no se aplica, pero refleja la realidad.)
export const maxDuration = 900;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const model: string =
    (typeof body.model === "string" && body.model) || project.scriptModel;
  const apiKey: string | undefined =
    typeof body.apiKey === "string" ? body.apiKey : undefined;
  try {
    const doc = await generateScript(
      {
        idea: project.idea,
        title: project.title,
        logline: project.logline,
        synopsis: project.synopsis,
        genre: project.genre,
        tone: project.tone,
        styleBible: project.styleBible,
        language: project.language,
        targetDurationSec: project.targetDurationSec,
      },
      { model, apiKey },
    );
    const markdown = scriptToMarkdown(doc);
    const updated = await updateProject(id, {
      scriptModel: model,
      scriptJson: JSON.stringify(doc),
      scriptMarkdown: markdown,
      // Sincroniza metadatos que el guion pudo refinar.
      logline: doc.logline || project.logline,
      synopsis: doc.synopsis || project.synopsis,
      styleBible: doc.styleBible || project.styleBible,
      status: "script",
    });
    return NextResponse.json({ project: updated, doc, markdown });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
