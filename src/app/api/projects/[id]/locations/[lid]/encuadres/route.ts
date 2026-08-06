import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getLocation, toEncuadreDTO } from "@/lib/locations";
import { buildEncuadrePrompt } from "@/lib/pipeline/locations";
import { generateImage } from "@/lib/providers/image";
import { saveBase64Image, readMediaBase64 } from "@/lib/media/store";
import { listImageVersions, mimeFromKey } from "@/lib/media/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; lid: string }> };

// Genera un ENCUADRE derivado (otra toma de la locación) a partir de su imagen
// de referencia canónica + la biblia de objetos.
export async function POST(req: Request, { params }: Ctx) {
  const { id, lid } = await params;
  const project = await getProject(id);
  const location = await getLocation(lid);
  if (!project || !location || location.projectId !== id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!location.imagePath) {
    return NextResponse.json(
      { error: "Genera primero la imagen de referencia de la locación" },
      { status: 400 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const framing = String(body.framingPrompt || body.framing || "").trim();
  const label = String(body.label || "").slice(0, 120).trim();
  if (!framing) {
    return NextResponse.json({ error: "Describe la toma/encuadre" }, { status: 400 });
  }
  const ref = await readMediaBase64(location.imagePath);
  if (!ref) {
    return NextResponse.json({ error: "No se pudo leer la referencia" }, { status: 400 });
  }
  // Crea la fila primero para poder nombrar los archivos por su id (historial
  // aislado por encuadre: prefijo `enc-<eid>-`).
  const count = await prisma.encuadre.count({ where: { locationId: lid } });
  const encuadre = await prisma.encuadre.create({
    data: {
      locationId: lid,
      label: label || framing.slice(0, 40),
      framingPrompt: framing,
      order: count,
    },
  });
  try {
    const prompt = buildEncuadrePrompt({
      locationName: location.name,
      bible: location.description,
      framing,
      styleBible: project.styleBible,
      aspectRatio: project.aspectRatio,
    });
    const result = await generateImage({
      prompt,
      referenceImages: [{ base64: ref.base64, mimeType: mimeFromKey(location.imagePath) }],
      aspectRatio: project.aspectRatio,
    });
    const imagePath = await saveBase64Image(
      id,
      "keyframes",
      `enc-${encuadre.id}-${Date.now()}`,
      result.base64,
      result.mimeType,
    );
    const updated = await prisma.encuadre.update({
      where: { id: encuadre.id },
      data: { imagePath },
    });
    const versions = await listImageVersions(id, `enc-${encuadre.id}-`, imagePath);
    return NextResponse.json({
      encuadre: toEncuadreDTO(updated, versions),
      provider: result.provider,
    });
  } catch (err) {
    // Rollback: sin imagen no dejamos un encuadre huérfano.
    await prisma.encuadre.delete({ where: { id: encuadre.id } }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
