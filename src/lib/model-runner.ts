// Ejecuta una llamada real contra UN proveedor concreto (por su id de target).
// Da servicio a /api/settings/test (ping) y /api/settings/playground (prompt del
// usuario). Reutiliza los constructores de config y los clientes de bajo nivel.
import {
  narrativeTextConfig,
  structuredReasoningConfig,
  damiMiniConfig,
  solLunaConfig,
  geminiImageConfigs,
  fluxImageConfigs,
  aiStudioConfig,
  type AzureTextConfig,
} from "@/lib/config";
import { complete } from "@/lib/providers/text/azure-openai";
import { geminiGenerateText } from "@/lib/providers/text/gemini";
import { geminiGenerate } from "@/lib/providers/image/gemini";
import { fluxGenerate } from "@/lib/providers/image/flux";
import { loadSettings } from "@/lib/settings";
import { targetById } from "@/lib/provider-catalog";

function azureConfigFor(target: string): AzureTextConfig | null {
  switch (target) {
    case "foundry-narrative":
      return narrativeTextConfig();
    case "foundry-mini":
      return structuredReasoningConfig();
    case "dami-mini":
      return damiMiniConfig();
    case "sol":
      return solLunaConfig("sol");
    case "luna":
      return solLunaConfig("luna");
    default:
      return null;
  }
}

export type RunTextResult = { text: string; provider: string };
export type RunImageResult = { base64: string; mimeType: string; provider: string };

export async function runText(
  target: string,
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<RunTextResult> {
  await loadSettings();
  if (target === "aistudio") {
    const cfg = aiStudioConfig();
    if (!cfg) throw new Error("Gemini AI Studio no está configurado.");
    const text = await geminiGenerateText({ apiKey: cfg.apiKey, model: cfg.model, system, user, maxTokens });
    return { text, provider: `aistudio:${cfg.model}` };
  }
  const cfg = azureConfigFor(target);
  if (!cfg) throw new Error(`El slot "${target}" no está configurado.`);
  const text = await complete(cfg, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
  });
  return { text, provider: cfg.label };
}

export async function runImage(
  target: string,
  prompt: string,
  aspectRatio = "1:1",
): Promise<RunImageResult> {
  await loadSettings();
  if (target === "accenture-flux") {
    const cfg = fluxImageConfigs().find((c) => c.label === "accenture-flux");
    if (!cfg) throw new Error("FLUX (Accenture) no está configurado.");
    return fluxGenerate(cfg, { prompt, aspectRatio });
  }
  const label =
    target === "gemini-image-free" ? "gemini-free" : target === "gemini-image-paid" ? "gemini-paid" : null;
  if (!label) throw new Error(`Objetivo de imagen desconocido: ${target}`);
  const cfg = geminiImageConfigs().find((c) => c.label === label);
  if (!cfg) throw new Error(`El slot "${target}" no está configurado.`);
  return geminiGenerate(cfg, { prompt, aspectRatio });
}

const PING_SYS = "Eres un servicio de prueba. Responde con una sola palabra.";
const PING_USER = "Responde exactamente: ok";

export type TestResult = { target: string; ok: boolean; ms: number; detail: string; provider?: string };

/** Ping mínimo a un target. Para imagen genera 1 imagen simple (CONSUME cuota). */
export async function testTarget(target: string): Promise<TestResult> {
  const meta = targetById(target);
  const start = Date.now();
  try {
    if (meta?.kind === "image") {
      const r = await runImage(target, "A simple flat red circle centered on a plain white background. Minimalist.");
      const kb = Math.round((r.base64.length * 0.75) / 1024);
      return { target, ok: true, ms: Date.now() - start, detail: `imagen OK (~${kb} KB, ${r.mimeType})`, provider: r.provider };
    }
    const r = await runText(target, PING_SYS, PING_USER, 64);
    return { target, ok: true, ms: Date.now() - start, detail: r.text.trim().slice(0, 80) || "ok", provider: r.provider };
  } catch (e) {
    return { target, ok: false, ms: Date.now() - start, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}
