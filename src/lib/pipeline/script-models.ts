// Modelos seleccionables para la generación del guion (client-safe).

export type ScriptModelProvider = "azure-narrative" | "aistudio";

export type ScriptModelOption = {
  id: string;
  label: string;
  provider: ScriptModelProvider;
  needsApiKey: boolean;
  note?: string;
};

export const DEFAULT_SCRIPT_MODEL = "gpt-5.4-pro";

export const SCRIPT_MODELS: ScriptModelOption[] = [
  {
    id: "gpt-5.4-pro",
    label: "GPT-5.4-pro (Azure · por defecto)",
    provider: "azure-narrative",
    needsApiKey: false,
    note: "Razonamiento de alta calidad; puede tardar varios minutos.",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash (AI Studio)",
    provider: "aistudio",
    needsApiKey: true,
    note: "Rápido; nivel gratuito de AI Studio. Requiere API Key.",
  },
];

export function scriptModelById(id: string): ScriptModelOption | undefined {
  return SCRIPT_MODELS.find((m) => m.id === id);
}
