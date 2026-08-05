"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  RotateCcw,
  X,
  Check,
  Wand2,
  AlertCircle,
} from "lucide-react";
import type { AgentMessageDTO, EditProposal } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea, Select } from "@/components/ui/field";
import { Spinner, Badge } from "@/components/ui/misc";

type Model = "gpt-5.6-sol" | "gemini-3.6-flash";
type Effort = "minimal" | "low" | "medium" | "high";

const TARGET_LABEL: Record<string, string> = {
  project: "Proyecto",
  character: "Personaje",
  location: "Escenario",
  scene: "Escena",
  shot: "Plano",
  "script-beat": "Guion",
};

function valuePreview(v: unknown): string {
  const s = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return s.length > 300 ? s.slice(0, 300) + "…" : s;
}

export function FilmAgentPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<AgentMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<Model>("gpt-5.6-sol");
  const [effort, setEffort] = useState<Effort>("medium");
  const [applied, setApplied] = useState<Record<string, "done" | "busy" | "error">>({});
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const appliedKey = `filmAgent.applied.${projectId}`;

  // Preferencias + estado persistido (reabre el panel y recuerda lo aplicado
  // tras la recarga que hacemos al aplicar un cambio).
  useEffect(() => {
    const m = localStorage.getItem("filmAgent.model") as Model | null;
    const e = localStorage.getItem("filmAgent.effort") as Effort | null;
    if (m === "gpt-5.6-sol" || m === "gemini-3.6-flash") setModel(m);
    if (e && ["minimal", "low", "medium", "high"].includes(e)) setEffort(e);
    if (localStorage.getItem("filmAgent.open") === "1") setOpen(true);
    try {
      const done = JSON.parse(localStorage.getItem(appliedKey) || "[]") as string[];
      if (Array.isArray(done) && done.length) {
        setApplied(Object.fromEntries(done.map((k) => [k, "done" as const])));
      }
    } catch {
      /* ignorar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function openPanel() {
    setOpen(true);
    localStorage.setItem("filmAgent.open", "1");
  }
  function closePanel() {
    setOpen(false);
    localStorage.setItem("filmAgent.open", "0");
  }
  function changeModel(m: Model) {
    setModel(m);
    localStorage.setItem("filmAgent.model", m);
  }
  function changeEffort(e: Effort) {
    setEffort(e);
    localStorage.setItem("filmAgent.effort", e);
  }

  // Carga perezosa del historial al abrir por primera vez.
  useEffect(() => {
    if (!open || loaded) return;
    jsonFetch<{ messages: AgentMessageDTO[] }>(`/api/projects/${projectId}/agent`)
      .then((r) => setMessages(r.messages))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [open, loaded, projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    const temp: AgentMessageDTO = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      proposals: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, temp]);
    try {
      const res = await jsonFetch<{ userMessage: AgentMessageDTO; message: AgentMessageDTO }>(
        `/api/projects/${projectId}/agent`,
        { method: "POST", body: JSON.stringify({ message: text, model, effort }) },
      );
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.userMessage, res.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (!confirm("¿Reiniciar la conversación? Se borrará todo lo hablado con el copiloto.")) return;
    await jsonFetch(`/api/projects/${projectId}/agent`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
    setApplied({});
    setDiscarded(new Set());
    localStorage.removeItem(appliedKey);
  }

  async function applyProposal(msgId: string, idx: number, p: EditProposal) {
    const key = `${msgId}:${idx}`;
    setApplied((a) => ({ ...a, [key]: "busy" }));
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/agent/apply`, {
        method: "POST",
        body: JSON.stringify({ proposal: p }),
      });
      // Persistir "aplicado" y recargar para que la fase visible (incl. el
      // editor de Guion) refleje el cambio. El panel se reabre solo.
      try {
        const done = JSON.parse(localStorage.getItem(appliedKey) || "[]") as string[];
        if (!done.includes(key)) done.push(key);
        localStorage.setItem(appliedKey, JSON.stringify(done));
      } catch {
        /* ignorar */
      }
      setApplied((a) => ({ ...a, [key]: "done" }));
      window.location.reload();
    } catch (e) {
      setApplied((a) => ({ ...a, [key]: "error" }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function discard(msgId: string, idx: number) {
    setDiscarded((d) => new Set(d).add(`${msgId}:${idx}`));
  }

  const pendingCount = useMemo(
    () =>
      messages.reduce(
        (n, m) =>
          n + m.proposals.filter((_, i) => !applied[`${m.id}:${i}`] && !discarded.has(`${m.id}:${i}`)).length,
        0,
      ),
    [messages, applied, discarded],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        title="Copiloto del film"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition hover:brightness-110"
      >
        <Sparkles className="h-5 w-5" />
        Copiloto
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l border-border bg-surface shadow-2xl">
      {/* Cabecera */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Copiloto del film</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            title="Reiniciar conversación"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closePanel}
            title="Cerrar"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* Selector de modelo */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Select
          value={model}
          onChange={(e) => changeModel(e.target.value as Model)}
          className="h-8 flex-1 text-xs"
        >
          <option value="gpt-5.6-sol">GPT-5.6 Sol (razonamiento)</option>
          <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
        </Select>
        {model === "gpt-5.6-sol" && (
          <Select
            value={effort}
            onChange={(e) => changeEffort(e.target.value as Effort)}
            className="h-8 w-28 text-xs"
            title="Esfuerzo de razonamiento"
          >
            <option value="minimal">mínimo</option>
            <option value="low">bajo</option>
            <option value="medium">medio</option>
            <option value="high">alto</option>
          </Select>
        )}
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !sending && (
          <div className="mt-6 text-center text-sm text-muted">
            <Wand2 className="mx-auto mb-2 h-8 w-8 text-primary/70" />
            Tu copiloto conoce todo el film y su estado actual. Pídele ideas, mejoras o cambios
            concretos (los aplica tras tu confirmación).
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] space-y-2">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
              {m.proposals.map((p, i) => {
                const key = `${m.id}:${i}`;
                if (discarded.has(key)) return null;
                const st = applied[key];
                return (
                  <div key={key} className="rounded-md border border-accent/50 bg-surface-2 p-2 text-xs">
                    <div className="mb-1 flex items-center gap-1 text-[11px] text-muted">
                      <Badge tone="info">{TARGET_LABEL[p.target] || p.target}</Badge>
                      <span>· campo</span>
                      <span className="font-medium text-foreground">{p.field}</span>
                    </div>
                    <p className="mb-1">{p.summary}</p>
                    <p className="rounded bg-background px-2 py-1 text-accent">{valuePreview(p.value)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {st === "done" ? (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="h-3 w-3" /> Aplicado
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={st === "busy"}
                            onClick={() => applyProposal(m.id, i, p)}
                          >
                            {st === "busy" ? <Spinner /> : <Check className="h-3 w-3" />} Aplicar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={st === "busy"}
                            onClick={() => discard(m.id, i)}
                          >
                            Descartar
                          </Button>
                          {st === "error" && <span className="text-danger">error</span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        )}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Pensando…
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-t border-border bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Entrada */}
      <div className="flex items-end gap-2 border-t border-border p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pídele cambios, mejoras o ideas… (Enter para enviar)"
          className="min-h-10 flex-1 resize-none text-sm"
          rows={2}
        />
        <Button size="icon" onClick={send} disabled={sending || !input.trim()} title="Enviar">
          {sending ? <Spinner /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {pendingCount > 0 && (
        <div className="border-t border-border px-3 py-1 text-[11px] text-muted">
          {pendingCount} propuesta(s) pendiente(s) de tu confirmación.
        </div>
      )}
    </div>
  );
}
