import { NextResponse } from "next/server";
import { splitClip } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clipId: string }> };

// Divide un segmento en dos por un instante (segundos absolutos del clip origen).
export async function POST(req: Request, { params }: Ctx) {
  const { id, clipId } = await params;
  const body = await req.json().catch(() => ({}));
  const atSec = Number(body?.atSec);
  if (!Number.isFinite(atSec)) {
    return NextResponse.json({ error: "atSec inválido" }, { status: 400 });
  }
  try {
    const timeline = await splitClip(id, clipId, atSec);
    return NextResponse.json({ timeline });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
