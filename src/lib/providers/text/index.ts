import {
  narrativeTextConfig,
  structuredTextConfigs,
  type AzureTextConfig,
} from "@/lib/config";
import { complete, type ChatMessage } from "./azure-openai";

export type { ChatMessage } from "./azure-openai";

export type GenerateResult = {
  text: string;
  provider: string;
};

/**
 * Texto narrativo/creativo (idea, guion). Usa el slot de razonamiento
 * (gpt-5.4-pro); si no está configurado, cae al slot estructurado.
 */
export async function generateNarrative(params: {
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<GenerateResult> {
  const chain: AzureTextConfig[] = [];
  const narrative = narrativeTextConfig();
  if (narrative) chain.push(narrative);
  chain.push(...structuredTextConfigs());
  return runChain(chain, params);
}

/**
 * Tareas estructuradas/JSON (extracción de personajes, desglose de shots,
 * prompts). Usa gpt-4.1 con failover Accenture -> Students.
 */
export async function generateStructured(params: {
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<GenerateResult> {
  const chain = structuredTextConfigs();
  return runChain(chain, params);
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
