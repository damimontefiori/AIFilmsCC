import { NextResponse } from "next/server";
import { reorderTimeline } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Reordena la línea de tiempo. Body: { ids: string[] } en el nuevo orden.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const timeline = await reorderTimeline(id, ids);
  return NextResponse.json({ timeline });
}
