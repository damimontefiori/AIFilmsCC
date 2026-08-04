import {
  narrativeTextConfig,
  structuredTextConfigs,
  defaultAiStudioKey,
  type AzureTextConfig,
} from "@/lib/config";
import { scriptModelById } from "@/lib/pipeline/script-models";
import { loadSettings } from "@/lib/settings";
import { complete, type ChatMessage } from "./azure-openai";
import { geminiGenerateText } from "./gemini";

export type { ChatMessage } from "./azure-openai";

export type GenerateResult = {
  text: string;
  provider: string;
};

/** Selección de modelo de texto del proyecto (id + key opcional de AI Studio). */
export type TextModelChoice = { model?: string; apiKey?: string };

type TextParams = { system: string; user: string; maxTokens?: number; jsonMode?: boolean };

/**
 * Si el `choice` apunta a un modelo AI Studio (gemini), lo llama y devuelve el
 * resultado; si no es AI Studio devuelve null (para seguir con Azure). Lanza si
 * el modelo AI Studio falla (el caller decide el failover).
 */
async function tryAiStudio(
  choice: TextModelChoice | undefined,
  params: TextParams,
): Promise<GenerateResult | null> {
  const opt = choice?.model ? scriptModelById(choice.model) : undefined;
  if (opt?.provider !== "aistudio") return null;
  const apiKey = choice?.apiKey?.trim() || defaultAiStudioKey();
  if (!apiKey) throw new Error("Falta la API Key de AI Studio para el modelo seleccionado.");
  const text = await geminiGenerateText({
    apiKey,
    model: choice!.model!,
    system: params.system,
    user: params.user,
    jsonMode: params.jsonMode,
    maxTokens: params.maxTokens,
  });
  return { text, provider: choice!.model! };
}

/**
 * Texto narrativo/creativo (idea, guion). Con `choice` AI Studio → gemini;
 * si no (o si gemini falla) → Azure razonamiento (gpt-5.4-pro) → estructurado.
 */
export async function generateNarrative(
  params: TextParams,
  choice?: TextModelChoice,
): Promise<GenerateResult> {
  await loadSettings();
  try {
    const r = await tryAiStudio(choice, params);
    if (r) return r;
  } catch (err) {
    console.warn("[text] AI Studio (narrative) falló, failover a Azure:", err);
  }
  const chain: AzureTextConfig[] = [];
  const narrative = narrativeTextConfig();
  if (narrative) chain.push(narrative);
  chain.push(...structuredTextConfigs());
  return runChain(chain, params);
}

/**
 * Tareas estructuradas/JSON (concepto, personajes, escenarios, planos, etc.).
 * Con `choice` AI Studio → gemini; si no (o si falla) → gpt-5.4-mini → gpt-4.1.
 */
export async function generateStructured(
  params: TextParams,
  choice?: TextModelChoice,
): Promise<GenerateResult> {
  await loadSettings();
  try {
    const r = await tryAiStudio(choice, params);
    if (r) return r;
  } catch (err) {
    console.warn("[text] AI Studio (structured) falló, failover a Azure:", err);
  }
  return runChain(structuredTextConfigs(), params);
}

async function runChain(
  chain: AzureTextConfig[],
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    jsonMode?: boolean;
  },
): Promise<GenerateResult> {
  if (chain.length === 0) {
    throw new Error(
      "No hay proveedores de texto configurados (revisa FOUNDRY_NARRATIVE_* / ACCENTURE_TEXT_* / STUDENTS_TEXT_*).",
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  let lastError: unknown;
  for (const cfg of chain) {
    try {
      const text = await complete(cfg, {
        messages,
        jsonMode: params.jsonMode,
        maxTokens: params.maxTokens,
      });
      return { text, provider: cfg.label };
    } catch (err) {
      lastError = err;
      // Continúa con el siguiente proveedor del chain.
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Fallaron todos los proveedores de texto");
}

/**
 * Extrae un objeto JSON de una respuesta del modelo, tolerando fences
 * ```json y texto alrededor.
 */
export function extractJson<T>(raw: string): T {
  let s = raw.trim();
  // Quitar fences de markdown si existen.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Recortar al primer { o [ y su cierre.
  const firstBrace = s.search(/[[{]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
  return JSON.parse(s) as T;
}
