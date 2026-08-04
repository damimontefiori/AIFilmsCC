import { NextResponse } from "next/server";
import {
  generateStructured,
  generateNarrative,
  type TextModelChoice,
} from "@/lib/providers/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ping real y barato a los proveedores de texto. Acepta { model, apiKey } para
// verificar el ruteo (p.ej. gemini-3.6-flash) por el `provider` devuelto.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const choice: TextModelChoice | undefined =
    typeof body?.model === "string" && body.model
      ? { model: body.model, apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined }
      : undefined;

  const results: Record<string, { ok: boolean; provider?: string; error?: string }> = {};

  try {
    const r = await generateStructured(
      { system: "Responde solo con la palabra OK.", user: "ping", maxTokens: 5 },
      choice,
    );
    results.structured = { ok: true, provider: r.provider };
  } catch (err) {
    results.structured = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const r = await generateNarrative(
      { system: "Responde solo con la palabra OK.", user: "ping", maxTokens: 2000 },
      choice,
    );
    results.narrative = { ok: true, provider: r.provider };
  } catch (err) {
    results.narrative = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(results);
}
