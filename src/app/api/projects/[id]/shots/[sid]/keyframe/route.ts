import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getShot, toShotDTO } from "@/lib/shots";
import { parseJson, type ReferenceImage } from "@/lib/serialize";
import { buildKeyframePrompt, buildCompositePrompt } from "@/lib/pipeline/shots";
import { generateImage, type InputImage } from "@/lib/providers/image";
import { saveBase64Image, readMediaBase64 } from "@/lib/media/store";
import { fromRelative } from "@/lib/paths";
import { matchCharacter } from "@/lib/match-characters";
import { promises as fs } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; sid: string }> };

async function rmRel(rel: string | null) {
  if (!rel) return;
  const abs = fromRelative(rel);
  if (abs) await fs.rm(abs, { force: true }).catch(() => {});
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, sid } = await params;
  const project = await getProject(id);
  const shot = await getShot(sid);
  if (!project || !shot) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "composite" ? "composite" : "direct";
  const regenEnvironment = body.regenEnvironment === true;

  try {
    const scene = await prisma.scene.findUnique({ where: { id: shot.sceneId } });
    const shotChars = parseJson<string[]>(shot.characterIds, []);

    // Mapea nombres del plano a personajes del proyecto (emparejado robusto).
    const allChars = await prisma.character.findMany({ where: { projectId: id } });
    const matched: typeof allChars = [];
    const seen = new Set<string>();
    for (const n of shotChars) {
      const c = matchCharacter(n, allChars);
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        matched.push(c);
      }
    }

    // Reúne referencias ETIQUETADAS por personaje (mapea imagen ↔ nombre).
    const kindRank: Record<string, number> = { portrait: 0, full_body: 1, three_quarter: 2 };
    const labeledReferences: { label: string; images: InputImage[] }[] = [];
    const flatRefs: InputImage[] = [];
    const descriptions: { name: string; description: string }[] = [];

    for (const c of matched) {
      descriptions.push({ name: c.name, description: c.canonicalDescription });
      const refs = parseJson<ReferenceImage[]>(c.referenceImages, [])
        .slice()
        .sort((a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9))
        .slice(0, 2);
      const images: InputImage[] = [];
      for (const r of refs) {
        const data = await readMediaBase64(r.path);
        if (data) {
          const img = { base64: data.base64, mimeType: "image/png" };
          images.push(img);
          flatRefs.push(img);
        }
      }
      if (images.length) {
        labeledReferences.push({ label: c.role ? `${c.name} (${c.role})` : c.name, images });
      }
    }

    const doComposite = mode === "composite" && descriptions.length > 0;

    let keyframePath: string;
    let keyframePromptUsed: string;
    let provider: string;
    let environmentPath: string | null = shot.environmentPath;

    if (doComposite) {
      // ── Compositing por capas: 1) ambiente vacío, 2) insertar personaje(s) ──
      if (!environmentPath || regenEnvironment) {
        const envPrompt = buildKeyframePrompt({
          sceneHeading: scene?.heading || "",
          sceneSummary: scene?.summary || "",
          actionDescription: shot.actionDescription,
          cameraNotes: shot.cameraNotes,
          characterDescriptions: [], // ambiente SIN personajes (se genera fiable)
          styleBible: project.styleBible,
          genre: project.genre,
          tone: project.tone,
          aspectRatio: project.aspectRatio,
          withReferences: false,
        });
        const envResult = await generateImage({ prompt: envPrompt, aspectRatio: project.aspectRatio });
        const newEnv = await saveBase64Image(id, "keyframes", `${sid}-env-${Date.now()}`, envResult.base64, envResult.mimeType);
        if (environmentPath && environmentPath !== newEnv) await rmRel(environmentPath);
        environmentPath = newEnv;
      }

      const envData = await readMediaBase64(environmentPath);
      if (!envData) throw new Error("No se pudo leer el plate de ambiente");

      const compPrompt = buildCompositePrompt({
        characterDescriptions: descriptions,
        actionDescription: shot.actionDescription,
        cameraNotes: shot.cameraNotes,
        genre: project.genre,
        tone: project.tone,
        aspectRatio: project.aspectRatio,
      });
      const result = await generateImage({
        prompt: compPrompt,
        baseImage: { base64: envData.base64, mimeType: "image/png" },
        labeledReferences: labeledReferences.length ? labeledReferences : undefined,
        referenceImages: flatRefs.length ? flatRefs : undefined,
        aspectRatio: project.aspectRatio,
      });
      keyframePath = await saveBase64Image(id, "keyframes", `${sid}-${Date.now()}`, result.base64, result.mimeType);
      keyframePromptUsed = compPrompt;
      provider = result.provider;
    } else {
      // ── Directo: una sola generación ──
      const prompt = buildKeyframePrompt({
        sceneHeading: scene?.heading || "",
        sceneSummary: scene?.summary || "",
        actionDescription: shot.actionDescription,
        cameraNotes: shot.cameraNotes,
        characterDescriptions: descriptions,
        styleBible: project.styleBible,
        genre: project.genre,
        tone: project.tone,
        aspectRatio: project.aspectRatio,
        withReferences: labeledReferences.length > 0,
      });
      const result = await generateImage({
        prompt,
        labeledReferences: labeledReferences.length ? labeledReferences : undefined,
        referenceImages: flatRefs.length ? flatRefs : undefined,
        aspectRatio: project.aspectRatio,
      });
      keyframePath = await saveBase64Image(id, "keyframes", `${sid}-${Date.now()}`, result.base64, result.mimeType);
      keyframePromptUsed = prompt;
      provider = result.provider;
      // Un plano sin personajes es su propio "ambiente".
      if (descriptions.length === 0) environmentPath = keyframePath;
    }

    // Borra el keyframe anterior (evita huérfanos).
    if (shot.keyframePath && shot.keyframePath !== keyframePath && shot.keyframePath !== environmentPath) {
      await rmRel(shot.keyframePath);
    }

    const updated = await prisma.shot.update({
      where: { id: sid },
      data: {
        keyframePath,
        environmentPath,
        keyframePrompt: keyframePromptUsed,
        status: shot.status === "planned" ? "package_ready" : shot.status,
      },
    });
    return NextResponse.json({ shot: toShotDTO(updated), provider, mode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
