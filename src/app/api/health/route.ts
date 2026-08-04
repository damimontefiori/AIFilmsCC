import { NextResponse } from "next/server";
import {
  narrativeTextConfig,
  structuredTextConfigs,
  geminiImageConfigs,
  fluxImageConfigs,
} from "@/lib/config";
import { checkBinaries } from "@/lib/media/ffmpeg";
import { loadSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await loadSettings(true);
  const narrative = narrativeTextConfig();
  const structured = structuredTextConfigs();
  const gemini = geminiImageConfigs();
  const flux = fluxImageConfigs();
  const bins = await checkBinaries();

  return NextResponse.json({
    text: {
      narrative: narrative
        ? { configured: true, deployment: narrative.deployment }
        : { configured: false },
      structured: structured.map((c) => ({ label: c.label, deployment: c.deployment })),
    },
    image: {
      gemini: gemini.map((c) => ({ label: c.label, model: c.model })),
      flux: flux.map((c) => ({ label: c.label, model: c.model })),
    },
    audio: { deferred: true },
    media: bins,
  });
}
