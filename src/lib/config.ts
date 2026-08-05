// Lectura centralizada de configuración de proveedores + validación de presencia.
// Nada de esto se expone al cliente; solo se usa en route handlers / server.
// Precedencia: override en DB (gestionado en /settings) > variable de entorno.
// La caché de overrides se llena con loadSettings() (async) antes de construir
// las cadenas; si no está cargada, se cae limpiamente al valor de entorno.

import { getOverride } from "@/lib/settings";

function env(name: string): string | undefined {
  const override = getOverride(name);
  const raw = override ?? process.env[name];
  return raw && raw.trim() !== "" ? raw.trim() : undefined;
}

export type AzureApi = "chat" | "responses";

export type AzureTextConfig = {
  label: string;
  endpoint: string;
  key: string;
  deployment: string;
  apiVersion: string;
  // "responses": modelos de razonamiento (gpt-5.x) vía Responses API.
  // "chat": chat/completions clásico (gpt-4.1, gpt-4o).
  api: AzureApi;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh"; // solo Responses API
};

/** Slot narrativo/razonamiento (gpt-5.4-pro). */
export function narrativeTextConfig(): AzureTextConfig | null {
  const endpoint = env("FOUNDRY_NARRATIVE_ENDPOINT");
  const key = env("FOUNDRY_NARRATIVE_KEY");
  const deployment = env("FOUNDRY_NARRATIVE_DEPLOYMENT");
  if (!endpoint || !key || !deployment) return null;
  return {
    label: "foundry-narrative",
    endpoint,
    key,
    deployment,
    apiVersion: env("FOUNDRY_NARRATIVE_API_VERSION") || "2025-04-01-preview",
    api: "responses",
    reasoningEffort: "medium",
  };
}

/** Slot estructurado por razonamiento (gpt-5.4-mini, Responses API v1). */
export function structuredReasoningConfig(): AzureTextConfig | null {
  const endpoint = env("FOUNDRY_MINI_ENDPOINT");
  const key = env("FOUNDRY_MINI_KEY");
  if (!endpoint || !key) return null;
  return {
    label: "foundry-mini",
    endpoint, // v1 completo (termina en /responses); azure-openai lo usa tal cual
    key,
    deployment: env("FOUNDRY_MINI_DEPLOYMENT") || "gpt-5.4-mini",
    apiVersion: "", // no aplica al endpoint v1
    api: "responses",
    reasoningEffort: "low", // razonamiento ligero: rápido y de calidad para JSON
  };
}

/**
 * Slot estructurado de RESPALDO: otro gpt-5.4-mini (recurso DamiOpenAIText),
 * endpoint clásico Responses (con api-version). Reintento cuando foundry-mini
 * no está o falla.
 */
export function damiMiniConfig(): AzureTextConfig | null {
  const endpoint = env("DAMI_MINI_ENDPOINT");
  const key = env("DAMI_MINI_KEY");
  if (!endpoint || !key) return null;
  return {
    label: "dami-mini",
    endpoint,
    key,
    deployment: env("DAMI_MINI_DEPLOYMENT") || "gpt-5.4-mini",
    apiVersion: env("DAMI_MINI_API_VERSION") || "2025-04-01-preview",
    api: "responses",
    reasoningEffort: "low",
  };
}

/**
 * Slot estructurado/JSON: gpt-5.4-mini con reintento en otro recurso.
 * Cadena: foundry-mini → DamiOpenAIText (ambos gpt-5.4-mini). Sin gpt-4.1.
 */
export function structuredTextConfigs(): AzureTextConfig[] {
  const configs: AzureTextConfig[] = [];
  const mini = structuredReasoningConfig();
  if (mini) configs.push(mini);
  const dami = damiMiniConfig();
  if (dami) configs.push(dami);
  return configs;
}

/**
 * Grupo gpt-5.6 (Azure for Students, recurso jmontefioric-resource), endpoint
 * v1 Responses. `sol` = guion; `luna` = resto (estructurado). SIN fallback: el
 * llamador propaga el error si falla.
 */
export function solLunaConfig(kind: "sol" | "luna"): AzureTextConfig | null {
  const up = kind.toUpperCase();
  const endpoint = env(`${up}_ENDPOINT`);
  const key = env(`${up}_KEY`);
  if (!endpoint || !key) return null;
  return {
    label: kind,
    endpoint, // v1 (termina en /responses); azure-openai lo usa tal cual
    key,
    deployment: env(`${up}_DEPLOYMENT`) || (kind === "sol" ? "gpt-5.6-sol" : "gpt-5.6-luna"),
    apiVersion: "",
    api: "responses",
    reasoningEffort: kind === "sol" ? "medium" : "low",
  };
}

export type GeminiImageConfig = {
  label: string;
  apiKey: string;
  model: string;
};

/** Claves de Gemini image en orden de failover (free -> paid). */
export function geminiImageConfigs(): GeminiImageConfig[] {
  const model = env("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-lite-image";
  const configs: GeminiImageConfig[] = [];
  const free = env("GEMINI_FREE_API_KEY");
  if (free) configs.push({ label: "gemini-free", apiKey: free, model });
  const paid = env("GEMINI_PAID_API_KEY");
  if (paid) configs.push({ label: "gemini-paid", apiKey: paid, model });
  return configs;
}

export type FluxImageConfig = {
  label: string;
  endpoint: string;
  key: string;
  model: string;
};

/** Configs de FLUX.2-pro (fallback de imagen). */
export function fluxImageConfigs(): FluxImageConfig[] {
  const configs: FluxImageConfig[] = [];
  const accEndpoint = env("ACCENTURE_IMAGE_ENDPOINT");
  const accKey = env("ACCENTURE_IMAGE_KEY");
  if (accEndpoint && accKey) {
    configs.push({
      label: "accenture-flux",
      endpoint: accEndpoint,
      key: accKey,
      model: env("ACCENTURE_IMAGE_MODEL") || "FLUX.2-pro",
    });
  }
  return configs;
}

export type AiStudioConfig = {
  apiKey: string;
  model: string;
};

/** Config de Gemini AI Studio (nivel gratuito) para el guion. */
export function aiStudioConfig(overrideKey?: string): AiStudioConfig | null {
  const apiKey = (overrideKey && overrideKey.trim()) || env("AISTUDIO_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    model: env("AISTUDIO_SCRIPT_MODEL") || "gemini-3.6-flash",
  };
}

/** Clave por defecto de AI Studio, para autocompletar el campo en la UI. */
export function defaultAiStudioKey(): string {
  return env("AISTUDIO_API_KEY") || "";
}

export function ffmpegBin(): string {
  return env("FFMPEG_PATH") || "ffmpeg";
}

export function ffprobeBin(): string {
  return env("FFPROBE_PATH") || "ffprobe";
}
