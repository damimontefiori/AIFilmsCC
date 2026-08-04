import { NextResponse } from "next/server";
import { runText, runImage } from "@/lib/model-runner";
import { targetById } from "@/lib/provider-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Playground: ejecuta el prompt del usuario contra UN modelo concreto.
// Texto → devuelve el texto; imagen → devuelve un data URL (CONSUME cuota).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const target = String(body?.target || "");
  const meta = targetById(target);
  if (!meta) return NextResponse.json({ error: "Objetivo inválido" }, { status: 400 });

  const prompt = String(body?.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "Escribe un prompt" }, { status: 400 });

  const start = Date.now();
  try {
    if (meta.kind === "image") {
      const r = await runImage(target, prompt, String(body?.aspectRatio || "1:1"));
      return NextResponse.json({
        kind: "image",
        provider: r.provider,
        ms: Date.now() - start,
        image: `data:${r.mimeType};base64,${r.base64}`,
      });
    }
    const system = String(body?.system || "Eres un asistente útil. Responde en español, de forma breve.");
    const maxTokens = Number(body?.maxTokens) || 1024;
    const r = await runText(target, system, prompt, maxTokens);
    return NextResponse.json({ kind: "text", provider: r.provider, ms: Date.now() - start, text: r.text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
