import { scriptModelById } from "@/lib/pipeline/script-models";
import { defaultAiStudioKey } from "@/lib/config";
import type { TextModelChoice } from "@/lib/providers/text";

/**
 * Construye el modelo de texto a usar para TODAS las llamadas LLM del proyecto,
 * a partir de `project.scriptModel` (o un override del body). Si es un modelo
 * de AI Studio, resuelve la API key (body → env).
 */
export function projectTextChoice(
  project: { scriptModel: string },
  bodyModel?: unknown,
  bodyApiKey?: unknown,
): TextModelChoice {
  const model = (typeof bodyModel === "string" && bodyModel) || project.scriptModel;
  const opt = scriptModelById(model);
  const apiKey =
    opt?.provider === "aistudio"
      ? ((typeof bodyApiKey === "string" && bodyApiKey.trim()) || defaultAiStudioKey())
      : undefined;
  return { model, apiKey };
}
