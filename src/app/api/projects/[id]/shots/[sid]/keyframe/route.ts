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
  // Técnica: body.mode la sobreescribe puntualmente; si no, la del plano.
  const mode = (body.mode ?? shot.renderMode) === "direct" ? "direct" : "composite";
  // preview: devuelve el prompt SIN generar. promptOverride: se usa TAL CUAL.
  const preview = body.preview === true;
  const promptOverride =
    typeof body.promptOverride === "string" && body.promptOverride.trim()
      ? String(body.promptOverride)
      : "";

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

    // Referencias ETIQUETADAS por personaje. En COMPONER 1 por personaje
    // (cuerpo entero) para no mezclar identidades; en DIRECTO hasta 2.
    const kindRank: Record<string, number> =
      mode === "direct"
        ? { portrait: 0, full_body: 1, three_quarter: 2 }
        : { full_body: 0, three_quarter: 1, portrait: 2 };
    const maxRefs = mode === "direct" ? 2 : 1;
    const labeledReferences: { label: string; images: InputImage[] }[] = [];
    const flatRefs: InputImage[] = [];
    const descriptions: { name: string; description: string }[] = [];

    for (const c of matched) {
      descriptions.push({ name: c.name, description: c.canonicalDescription });
      const refs = parseJson<ReferenceImage[]>(c.referenceImages, [])
        .slice()
        .sort((a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9))
        .slice(0, maxRefs);
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

    const hasChars = descriptions.length > 0;
    const doComposite = mode !== "direct" && hasChars;

    // Prompt (mismo texto para preview y para generar). keyframeMoment fija el
    // instante; vacío → acción completa.
    const builtPrompt = doComposite
      ? buildCompositePrompt({
          characterDescriptions: descriptions,
          actionDescription: shot.actionDescription,
          keyframeMoment: shot.keyframeMoment,
          cameraNotes: shot.cameraNotes,
          genre: project.genre,
          tone: project.tone,
          aspectRatio: project.aspectRatio,
        })
      : buildKeyframePrompt({
          sceneHeading: scene?.heading || "",
          sceneSummary: scene?.summary || "",
          actionDescription: shot.actionDescription,
          keyframeMoment: shot.keyframeMoment,
          cameraNotes: shot.cameraNotes,
          characterDescriptions: mode === "direct" ? descriptions : [],
          styleBible: project.styleBible,
          genre: project.genre,
          tone: project.tone,
          aspectRatio: project.aspectRatio,
          withReferences: mode === "direct" && labeledReferences.length > 0,
        });

    if (preview) {
      return NextResponse.json({ prompt: builtPrompt, mode });
    }

    const effectivePrompt = promptOverride || builtPrompt;

    // Resuelve la imagen base del AMBIENTE. Locación EFECTIVA del plano:
    // override del plano → locación de la escena. Se usa el encuadre elegido solo
    // si pertenece a esa locación (si quedó "stale", cae al canónico efectivo).
    const effLocationId = shot.locationId ?? scene?.locationId ?? null;
    let baseImagePath: string | null = null;
    if (shot.encuadre?.imagePath && shot.encuadre.locationId === effLocationId) {
      baseImagePath = shot.encuadre.imagePath;
    } else if (effLocationId) {
      const loc = await prisma.location.findUnique({ where: { id: effLocationId } });
      baseImagePath = loc?.imagePath ?? null;
    }

    let keyframePath: string;
    let keyframePromptUsed: string;
    let provider: string;

    if (mode === "direct") {
      // ── Directo: una sola pasada con personajes, sin capa base. ──
      const result = await generateImage({
        prompt: effectivePrompt,
        labeledReferences: labeledReferences.length ? labeledReferences : undefined,
        referenceImages: flatRefs.length ? flatRefs : undefined,
        aspectRatio: project.aspectRatio,
      });
      keyframePath = await saveBase64Image(id, "keyframes", `${sid}-${Date.now()}`, result.base64, result.mimeType);
      keyframePromptUsed = effectivePrompt;
      provider = result.provider;
    } else if (hasChars) {
      // ── Componer: personajes sobre el ambiente (encuadre/canónico). ──
      if (!baseImagePath) {
        throw new Error(
          "El plano no tiene ambiente. Elige un encuadre o genera la imagen de la locación de la escena, o usa modo Directo.",
        );
      }
      const envData = await readMediaBase64(baseImagePath);
      if (!envData) throw new Error("No se pudo leer el ambiente");
      const result = await generateImage({
        prompt: effectivePrompt,
        baseImage: { base64: envData.base64, mimeType: "image/png" },
        labeledReferences: labeledReferences.length ? labeledReferences : undefined,
        referenceImages: flatRefs.length ? flatRefs : undefined,
        aspectRatio: project.aspectRatio,
      });
      keyframePath = await saveBase64Image(id, "keyframes", `${sid}-${Date.now()}`, result.base64, result.mimeType);
      keyframePromptUsed = effectivePrompt;
      provider = result.provider;
    } else {
      // ── Componer sin personajes → el keyframe ES el ambiente. ──
      if (!baseImagePath) {
        throw new Error(
          "El plano no tiene ambiente. Elige un encuadre o genera la imagen de la locación de la escena, o usa modo Directo.",
        );
      }
      keyframePath = baseImagePath;
      keyframePromptUsed = shot.keyframePrompt || "";
      provider = "encuadre";
    }

    // Borra el keyframe anterior solo si es un archivo PROPIO del plano
    // (`${sid}-…`): nunca una imagen de encuadre/locación compartida.
    if (
      shot.keyframePath &&
      shot.keyframePath !== keyframePath &&
      shot.keyframePath.includes(`${sid}-`)
    ) {
      await rmRel(shot.keyframePath);
    }

    const updated = await prisma.shot.update({
      where: { id: sid },
      data: {
        keyframePath,
        keyframePrompt: keyframePromptUsed,
        status: shot.status === "planned" ? "package_ready" : shot.status,
      },
      include: { encuadre: true },
    });
    return NextResponse.json({ shot: toShotDTO(updated), provider, mode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
