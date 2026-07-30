import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { refineConcept } from "@/lib/pipeline/concept";
import { generateScript } from "@/lib/pipeline/script";
import { scriptToMarkdown } from "@/lib/pipeline/types";

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
  const scriptModel: string =
    (typeof body.model === "string" && body.model) || project.scriptModel;
  const apiKey: string | undefined =
    typeof body.apiKey === "string" ? body.apiKey : undefined;
  try {
    const concept = await refineConcept({
      idea: project.idea,
      language: project.language,
      genre: project.genre || undefined,
      tone: project.tone || undefined,
    });
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
      // Modelo elegido para el guion (por defecto el del proyecto; key opcional).
      { model: scriptModel, apiKey },
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
