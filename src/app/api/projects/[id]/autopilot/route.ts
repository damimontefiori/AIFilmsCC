import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { refineConcept } from "@/lib/pipeline/concept";
import { generateScript } from "@/lib/pipeline/script";
import { scriptToMarkdown } from "@/lib/pipeline/types";
import { projectTextChoice } from "@/lib/model-choice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Encadena refinar (rápido) + guion (gpt-5.4-pro, hasta ~15 min).
export const maxDuration = 900;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Auto-borrador: encadena refinar concepto + generar guion desde la idea.
 * (Fases posteriores extenderán esto a personajes y shots.)
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const choice = projectTextChoice(project, body.model, body.apiKey);
  const scriptModel = choice.model || project.scriptModel;
  try {
    const concept = await refineConcept(
      {
        idea: project.idea,
        language: project.language,
        genre: project.genre || undefined,
        tone: project.tone || undefined,
      },
      choice,
    );
    const isDefaultTitle =
      !project.title || project.title === "Proyecto sin título";

    const doc = await generateScript(
      {
        idea: project.idea,
        title: isDefaultTitle ? concept.title : project.title,
        logline: concept.logline,
        synopsis: concept.synopsis,
        genre: concept.genre,
        tone: concept.tone,
        styleBible: concept.styleBible,
        language: project.language,
        targetDurationSec: project.targetDurationSec,
      },
      // Modelo elegido (por defecto el del proyecto; key opcional).
      choice,
    );
    const markdown = scriptToMarkdown(doc);

    const updated = await updateProject(id, {
      scriptModel,
      title: isDefaultTitle && concept.title ? concept.title : project.title,
      logline: doc.logline || concept.logline,
      synopsis: doc.synopsis || concept.synopsis,
      genre: doc.genre || concept.genre,
      tone: doc.tone || concept.tone,
      styleBible: doc.styleBible || concept.styleBible,
      scriptJson: JSON.stringify(doc),
      scriptMarkdown: markdown,
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
