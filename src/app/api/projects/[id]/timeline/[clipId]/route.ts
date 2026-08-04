import { NextResponse } from "next/server";
import { updateClip, deleteClip } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clipId: string }> };

// Actualiza recortes (inSec/outSec) o etiqueta de un segmento.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, clipId } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const timeline = await updateClip(id, clipId, body);
    return NextResponse.json({ timeline });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

// Borra un segmento de la línea de tiempo (no toca el archivo de vídeo).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, clipId } = await params;
  const timeline = await deleteClip(id, clipId);
  return NextResponse.json({ timeline });
}
