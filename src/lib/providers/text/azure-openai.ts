import type { AzureTextConfig } from "@/lib/config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  messages: ChatMessage[];
  /** Fuerza salida JSON (response_format / text.format json_object). */
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export class AzureTextError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: string,
  ) {
    super(message);
    this.name = "AzureTextError";
  }
}

function baseUrl(cfg: AzureTextConfig): string {
  return cfg.endpoint.replace(/\/+$/, "");
}

/** Punto de entrada: despacha a chat/completions o Responses API según cfg. */
export async function complete(
  cfg: AzureTextConfig,
  opts: ChatOptions,
): Promise<string> {
  return cfg.api === "responses"
    ? responsesComplete(cfg, opts)
    : chatComplete(cfg, opts);
}

/** chat/completions clásico (gpt-4.1, gpt-4o). */
export async function chatComplete(
  cfg: AzureTextConfig,
  opts: ChatOptions,
): Promise<string> {
  const url = `${baseUrl(cfg)}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
  const body: Record<string, unknown> = {
    messages: opts.messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 4000,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": cfg.key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AzureTextError(
      `Azure chat ${cfg.label} respondió ${res.status}: ${text.slice(0, 500)}`,
      res.status,
      cfg.label,
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new AzureTextError(`Azure chat ${cfg.label} devolvió vacío`, 200, cfg.label);
  }
  return content;
}

/** Responses API (modelos de razonamiento gpt-5.x). */
export async function responsesComplete(
  cfg: AzureTextConfig,
  opts: ChatOptions,
): Promise<string> {
  // Endpoint v1 (termina en /responses, p.ej. gpt-5.4-mini) se usa TAL CUAL;
  // el clásico (cognitiveservices) construye /openai/responses?api-version=.
  const base = baseUrl(cfg);
  const url = /\/responses$/.test(base)
    ? base
    : `${base}/openai/responses?api-version=${cfg.apiVersion}`;
  const body: Record<string, unknown> = {
    model: cfg.deployment,
    input: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    // Piso: los modelos de razonamiento gastan tokens "thinking"; presupuestos
    // chicos (p.ej. 200) devuelven vacío. Aseguramos margen suficiente.
    max_output_tokens: Math.max(opts.maxTokens ?? 16000, 4000),
  };
  if (cfg.reasoningEffort) body.reasoning = { effort: cfg.reasoningEffort };
  if (opts.jsonMode) body.text = { format: { type: "json_object" } };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": cfg.key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AzureTextError(
      `Azure responses ${cfg.label} respondió ${res.status}: ${text.slice(0, 500)}`,
      res.status,
      cfg.label,
    );
  }

  const data = (await res.json()) as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: {
      type?: string;
      content?: { type?: string; text?: string }[];
    }[];
  };

  let text = "";
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) text += c.text;
    }
  }
  if (!text) {
    const reason = data.incomplete_details?.reason
      ? ` (incompleto: ${data.incomplete_details.reason})`
      : "";
    throw new AzureTextError(
      `Azure responses ${cfg.label} devolvió vacío${reason}`,
      200,
      cfg.label,
    );
  }
  return text;
}
