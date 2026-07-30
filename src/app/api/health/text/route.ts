import { NextResponse } from "next/server";
import { generateStructured, generateNarrative } from "@/lib/providers/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ping real y barato a los proveedores de texto.
export async function POST() {
  const results: Record<string, { ok: boolean; provider?: string; error?: string }> = {};

  try {
    const r = await generateStructured({
      system: "Responde solo con la palabra OK.",
      user: "ping",
      maxTokens: 5,
    });
    results.structured = { ok: true, provider: r.provider };
  } catch (err) {
    results.structured = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const r = await generateNarrative({
      system: "Responde solo con la palabra OK.",
      user: "ping",
      maxTokens: 2000, // los modelos de razonamiento consumen tokens ocultos
    });
    results.narrative = { ok: true, provider: r.provider };
  } catch (err) {
    results.narrative = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(results);
}
