import { solLunaConfig, aiStudioConfig } from "@/lib/config";
import { loadSettings } from "@/lib/settings";
import { complete } from "@/lib/providers/text/azure-openai";
import { extractJson } from "@/lib/providers/text";
import type { EditProposal } from "@/lib/dto";
import { buildFilmContext } from "./context";
import { EDITABLE_FIELDS, normalizeProposal } from "./schema";

export type AgentModel = "gpt-5.6-sol" | "gemini-3.6-flash";
export type AgentEffort = "minimal" | "low" | "medium" | "high";
export type AgentTurn = { role: "user" | "assistant"; content: string };
export type AgentResult = { reply: string; proposals: EditProposal[] };

function systemPrompt(context: string): string {
  const fields = Object.entries(EDITABLE_FIELDS)
    .map(([tg, f]) => `  - ${tg}: ${f.join(", ")}`)
    .join("\n");
  return [
    "Eres el COPILOTO de una app que produce cortometrajes con IA. Acompañas al usuario en TODO el pipeline (idea, guion, personajes, escenarios, planos, paquetes, montaje): resuelves dudas, propones mejoras e ideas, y SUGIERES ediciones concretas de campos.",
    "Escribe en el idioma del usuario (por defecto español). Sé concreto, con criterio cinematográfico, y honesto: si algo no conviene, dilo.",
    "",
    "FORMATO DE SALIDA — OBLIGATORIO: responde EXCLUSIVAMENTE un objeto JSON válido (sin texto fuera del JSON, sin fences) con esta forma:",
    '{ "reply": string, "proposals": [ { "target": "project|character|location|scene|shot", "id": string|null, "field": string, "value": string | number | string[], "summary": string } ] }',
    "- `reply`: tu respuesta conversacional (markdown simple permitido).",
    "- `proposals`: SOLO cuando el usuario pide un cambio concreto y estás razonablemente seguro. Si es solo conversación, o si necesitas aclarar algo antes, deja `proposals` en [] y pregunta en `reply`.",
    '- `target` "project" usa id=null; para el resto usa el id EXACTO que aparece en el contexto (id=...). NO inventes ids.',
    "- Campos editables permitidos (cualquier otro se rechaza):",
    fields,
    "- `value` es el valor NUEVO y COMPLETO del campo (texto entero, no un diff). Para `shot.characters` es un array de nombres.",
    "- `aspectRatio` ∈ {16:9, 9:16, 1:1}; `shot.renderMode` ∈ {composite, direct}; `targetDurationSec` es número.",
    "- GUION: para cambiar un diálogo o una acción usa target \"script-beat\", id=\"sceneIndex:beatIndex\" (los índices aparecen en el contexto, sección GUION) y field: `line` (diálogo), `character`, `parenthetical`, o `text` (acción). El `value` es la línea/acción completa nueva.",
    "- Aún NO puedes crear/borrar entidades ni regenerar el guion completo ni disparar generaciones (keyframes, imágenes, desglose): si lo piden, explícalo en `reply`. Pero SÍ puedes editar líneas concretas del guion existente (script-beat) y los campos de personajes, escenarios, planos y proyecto.",
    "- Cada propuesta lleva un `summary` claro (qué cambia y por qué), en el idioma del usuario. Las ediciones se aplican SOLO tras la confirmación del usuario.",
    "",
    "GUÍA DE CAMPOS (respeta el propósito Y la longitud de cada uno; no pongas prosa en el campo equivocado):",
    "- shot.actionDescription: QUÉ se ve y la emoción del plano, conciso (1-3 frases).",
    "- shot.keyframeMoment: el INSTANTE exacto a congelar como fotograma inicial (UNA frase corta).",
    "- shot.cameraNotes: SOLO lenguaje de cámara — tamaño de plano + ángulo + movimiento — MUY breve (p. ej. «Plano medio, dolly-in lento»). NUNCA re-describas la escena ni encadenes varios momentos aquí.",
    "- shot.dialogueOrVO: diálogo/voz en off del plano (vacío si no hay).",
    "- shot.characters: nombres VISIBLES en el encuadre.",
    "- character.canonicalDescription: apariencia FIJA y visual (ancla de consistencia). project.styleBible: biblia visual (paleta, luz, óptica, textura).",
    "",
    "RESTRICCIÓN CLAVE DEL FORMATO: cada PLANO es UN solo fotograma clave que se anima en UN clip de ~10 s. NO representes una secuencia de varios momentos en un mismo plano (p. ej. «Tomás espera y LUEGO llega Vera y se sienta» son varios momentos). Si el usuario pide algo multi-momento, elige UN instante representable (ajusta keyframeMoment/actionDescription a ese instante) y explica en `reply` que dividir un plano en varios AÚN no está disponible; sugiere qué instante conviene. Cambia SOLO los campos necesarios. NO edites `geminiPrompt` a mano: el paquete de vídeo se regenera solo al cambiar acción/cámara/diálogo/personajes de un plano.",
    "",
    context,
  ].join("\n");
}

function parse(text: string): AgentResult {
  try {
    const raw = extractJson<{ reply?: unknown; proposals?: unknown[] }>(text);
    const reply = typeof raw.reply === "string" ? raw.reply : "";
    const proposals = Array.isArray(raw.proposals)
      ? raw.proposals.map(normalizeProposal).filter((p): p is EditProposal => !!p)
      : [];
    return { reply: reply || "(sin respuesta)", proposals };
  } catch {
    // Si el modelo no devolvió JSON, trátalo como respuesta de solo texto.
    return { reply: text.slice(0, 4000), proposals: [] };
  }
}

async function geminiChat(
  apiKey: string,
  model: string,
  system: string,
  history: AgentTurn[],
  message: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini (copiloto) respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const cand = data.candidates?.[0];
  let out = "";
  for (const p of cand?.content?.parts ?? []) if (p.text) out += p.text;
  if (!out) throw new Error(`Gemini (copiloto) devolvió vacío${cand?.finishReason ? ` (${cand.finishReason})` : ""}`);
  return out;
}

/** Ejecuta un turno del copiloto. Contexto fresco + historial + mensaje nuevo. */
export async function runAgent(opts: {
  projectId: string;
  model: AgentModel;
  effort: AgentEffort;
  history: AgentTurn[];
  message: string;
}): Promise<AgentResult> {
  await loadSettings();
  const sys = systemPrompt(await buildFilmContext(opts.projectId));
  const history = opts.history.slice(-20); // ventana de conversación

  if (opts.model === "gemini-3.6-flash") {
    const cfg = aiStudioConfig();
    if (!cfg) throw new Error("Gemini AI Studio no está configurado (revisa AISTUDIO_API_KEY).");
    return parse(await geminiChat(cfg.apiKey, cfg.model || "gemini-3.6-flash", sys, history, opts.message));
  }

  // GPT-5.6 Sol (Azure Responses) con multi-turno y razonamiento seleccionable.
  const base = solLunaConfig("sol");
  if (!base) throw new Error("El modelo GPT-5.6 (Sol) no está configurado (revisa SOL_ENDPOINT/SOL_KEY).");
  const cfg = { ...base, reasoningEffort: opts.effort };
  const messages = [
    { role: "system" as const, content: sys },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.message },
  ];
  return parse(await complete(cfg, { messages, jsonMode: true, maxTokens: 8000 }));
}
