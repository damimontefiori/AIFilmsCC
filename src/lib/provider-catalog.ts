// Catálogo declarativo de proveedores configurables. CLIENT-SAFE (sin imports de
// servidor): lo consumen tanto la UI (/settings) como el whitelist del backend.
// Cada `key` es EXACTAMENTE el nombre de su variable de entorno.

export type CatalogField = {
  key: string;
  label: string;
  secret?: boolean; // API keys: enmascaradas en el GET, input password en la UI
  placeholder?: string;
};

export type ModelKind = "text" | "image";

export type ModelTarget = {
  id: string; // id usado por /test y /playground
  label: string;
  kind: ModelKind;
  note?: string;
};

export type CatalogSlot = {
  id: string;
  category: "Texto" | "Imagen";
  title: string;
  usage: string; // "para qué se usa"
  fields: CatalogField[];
  targets: string[]; // ids de MODEL_TARGETS probables/playground de este slot
};

export const MODEL_TARGETS: ModelTarget[] = [
  { id: "foundry-narrative", label: "gpt-5.4-pro (narrativo)", kind: "text", note: "Razonamiento; puede tardar." },
  { id: "foundry-mini", label: "gpt-5.4-mini (estructurado)", kind: "text" },
  { id: "dami-mini", label: "gpt-5.4-mini (DamiOpenAIText · respaldo)", kind: "text" },
  { id: "sol", label: "gpt-5.6-sol (guion)", kind: "text" },
  { id: "luna", label: "gpt-5.6-luna (estructurado)", kind: "text" },
  { id: "aistudio", label: "Gemini AI Studio", kind: "text" },
  { id: "gemini-image-free", label: "Gemini imagen (free)", kind: "image", note: "Consume cuota." },
  { id: "gemini-image-paid", label: "Gemini imagen (paid)", kind: "image", note: "Consume cuota." },
  { id: "accenture-flux", label: "FLUX.2-pro (Accenture)", kind: "image", note: "Consume cuota." },
];

export function targetById(id: string): ModelTarget | undefined {
  return MODEL_TARGETS.find((t) => t.id === id);
}

export const CATALOG_SLOTS: CatalogSlot[] = [
  {
    id: "foundry-narrative",
    category: "Texto",
    title: "Narrativo · gpt-5.4-pro (Azure Responses)",
    usage:
      "Genera el GUION completo (modelo de razonamiento, lento — hasta ~15 min). Es el primer eslabón del texto narrativo/creativo.",
    fields: [
      { key: "FOUNDRY_NARRATIVE_ENDPOINT", label: "Endpoint" },
      { key: "FOUNDRY_NARRATIVE_KEY", label: "API Key", secret: true },
      { key: "FOUNDRY_NARRATIVE_DEPLOYMENT", label: "Deployment", placeholder: "gpt-5.4-pro" },
      { key: "FOUNDRY_NARRATIVE_API_VERSION", label: "API version", placeholder: "2025-04-01-preview" },
    ],
    targets: ["foundry-narrative"],
  },
  {
    id: "foundry-mini",
    category: "Texto",
    title: "Estructurado · gpt-5.4-mini (Azure Responses v1)",
    usage:
      "Tareas estructuradas/JSON PRIMARIAS: refinar concepto, extraer personajes y escenarios, desglose de planos y sugerir momento. Razonamiento ligero.",
    fields: [
      { key: "FOUNDRY_MINI_ENDPOINT", label: "Endpoint (v1, termina en /responses)" },
      { key: "FOUNDRY_MINI_KEY", label: "API Key", secret: true },
      { key: "FOUNDRY_MINI_DEPLOYMENT", label: "Deployment", placeholder: "gpt-5.4-mini" },
    ],
    targets: ["foundry-mini"],
  },
  {
    id: "dami-mini",
    category: "Texto",
    title: "Estructurado · gpt-5.4-mini (DamiOpenAIText · respaldo)",
    usage:
      "Respaldo de las tareas estructuradas: otro gpt-5.4-mini en el recurso DamiOpenAIText. Se usa cuando el primario (foundry-mini) no está o falla.",
    fields: [
      { key: "DAMI_MINI_ENDPOINT", label: "Endpoint", placeholder: "https://damiopenaitext.cognitiveservices.azure.com" },
      { key: "DAMI_MINI_KEY", label: "API Key", secret: true },
      { key: "DAMI_MINI_DEPLOYMENT", label: "Deployment", placeholder: "gpt-5.4-mini" },
      { key: "DAMI_MINI_API_VERSION", label: "API version", placeholder: "2025-04-01-preview" },
    ],
    targets: ["dami-mini"],
  },
  {
    id: "sol",
    category: "Texto",
    title: "GPT-5.6 Sol (guion · Azure Students)",
    usage:
      "Guion cuando se elige el grupo «GPT-5.6 (Sol/Luna)» en Idea. Sin fallback: si falla (p. ej. sin crédito), se informa.",
    fields: [
      { key: "SOL_ENDPOINT", label: "Endpoint (v1, termina en /responses)" },
      { key: "SOL_KEY", label: "API Key", secret: true },
      { key: "SOL_DEPLOYMENT", label: "Deployment", placeholder: "gpt-5.6-sol" },
    ],
    targets: ["sol"],
  },
  {
    id: "luna",
    category: "Texto",
    title: "GPT-5.6 Luna (estructurado · Azure Students)",
    usage:
      "Resto del pipeline (concepto, extracciones, planos, momento) cuando se elige el grupo «GPT-5.6 (Sol/Luna)» en Idea. Sin fallback.",
    fields: [
      { key: "LUNA_ENDPOINT", label: "Endpoint (v1, termina en /responses)" },
      { key: "LUNA_KEY", label: "API Key", secret: true },
      { key: "LUNA_DEPLOYMENT", label: "Deployment", placeholder: "gpt-5.6-luna" },
    ],
    targets: ["luna"],
  },
  {
    id: "aistudio",
    category: "Texto",
    title: "Gemini AI Studio (alternativa multipropósito)",
    usage:
      "Si se elige como modelo del proyecto, gobierna TODO el pipeline de texto (guion + estructurado). Nivel gratuito de AI Studio.",
    fields: [
      { key: "AISTUDIO_API_KEY", label: "API Key", secret: true },
      { key: "AISTUDIO_SCRIPT_MODEL", label: "Modelo", placeholder: "gemini-3.6-flash" },
    ],
    targets: ["aistudio"],
  },
  {
    id: "gemini-image",
    category: "Imagen",
    title: "Gemini “Nano Banana” (imagen primaria)",
    usage:
      "Genera TODAS las imágenes del pipeline (referencias de personaje, escenarios/encuadres y keyframes). Failover: clave free → clave paid.",
    fields: [
      { key: "GEMINI_IMAGE_MODEL", label: "Modelo", placeholder: "gemini-3.1-flash-lite-image" },
      { key: "GEMINI_FREE_API_KEY", label: "API Key (free)", secret: true },
      { key: "GEMINI_PAID_API_KEY", label: "API Key (paid)", secret: true },
    ],
    targets: ["gemini-image-free", "gemini-image-paid"],
  },
  {
    id: "accenture-image",
    category: "Imagen",
    title: "FLUX.2-pro (Accenture · fallback de imagen)",
    usage:
      "Fallback de imagen si fallan ambas claves de Gemini. Cliente best-effort (Azure AI Foundry / Black Forest Labs).",
    fields: [
      { key: "ACCENTURE_IMAGE_ENDPOINT", label: "Endpoint" },
      { key: "ACCENTURE_IMAGE_KEY", label: "API Key", secret: true },
      { key: "ACCENTURE_IMAGE_MODEL", label: "Modelo", placeholder: "FLUX.2-pro" },
    ],
    targets: ["accenture-flux"],
  },
];

/** Todas las claves configurables (whitelist del backend). */
export const SETTING_KEYS: string[] = CATALOG_SLOTS.flatMap((s) => s.fields.map((f) => f.key));

/** Claves secretas (API keys) — nunca se devuelven en claro al cliente. */
export const SECRET_KEYS = new Set<string>(
  CATALOG_SLOTS.flatMap((s) => s.fields.filter((f) => f.secret).map((f) => f.key)),
);
