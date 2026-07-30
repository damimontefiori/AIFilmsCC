import { NextResponse } from "next/server";
import { generateImage } from "@/lib/providers/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Test real de generación de imagen. CONSUME cuota — invocar bajo demanda.
export async function POST() {
  try {
    const r = await generateImage({
      prompt:
        "A simple flat icon of a clapperboard on a dark background, minimal, centered.",
      aspectRatio: "1:1",
    });
    return NextResponse.json({
      ok: true,
      provider: r.provider,
      mimeType: r.mimeType,
      bytes: Math.round((r.base64.length * 3) / 4),
      preview: `data:${r.mimeType};base64,${r.base64.slice(0, 200000)}`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
