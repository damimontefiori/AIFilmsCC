"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  Save,
  RefreshCw,
} from "lucide-react";
import { jsonFetch } from "@/lib/api-client";
import {
  CATALOG_SLOTS,
  targetById,
  type CatalogSlot,
  type ModelTarget,
} from "@/lib/provider-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label, Select } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

type ValueInfo = { secret: boolean; source: "db" | "env" | "none"; hasValue: boolean; value: string };
type ValuesMap = Record<string, ValueInfo>;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function SourceTag({ source }: { source: "db" | "env" | "none" }) {
  if (source === "db") return <Badge tone="info">guardado</Badge>;
  if (source === "env") return <Badge tone="default">.env</Badge>;
  return <Badge tone="warning">sin definir</Badge>;
}

export function SettingsManager() {
  const [values, setValues] = useState<ValuesMap | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await jsonFetch<{ values: ValuesMap }>("/api/settings");
      setValues(r.values);
      setEdits({});
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const dirtyKeys = Object.keys(edits);
  const dirty = dirtyKeys.length > 0;

  function onEdit(key: string, val: string) {
    setSaved(false);
    setEdits((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await jsonFetch<{ values: ValuesMap }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ values: edits }),
      });
      setValues(r.values);
      setEdits({});
      setSaved(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const g: Record<string, CatalogSlot[]> = {};
    for (const s of CATALOG_SLOTS) (g[s.category] ??= []).push(s);
    return g;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Cargando configuración…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de acciones */}
      <div className="sticky top-14 z-30 -mx-4 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <div className="text-sm text-muted">
          {dirty ? (
            <span className="text-primary">{dirtyKeys.length} campo(s) con cambios sin guardar</span>
          ) : saved ? (
            <span className="text-success">Cambios guardados</span>
          ) : (
            <span>Prioridad: valor guardado &gt; variable de entorno</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={saving}>
            <RefreshCw className="h-4 w-4" /> Recargar
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {Object.entries(grouped).map(([category, slots]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{category}</h2>
          {slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} values={values!} edits={edits} onEdit={onEdit} dirty={dirty} />
          ))}
        </section>
      ))}
    </div>
  );
}

function SlotCard({
  slot,
  values,
  edits,
  onEdit,
  dirty,
}: {
  slot: CatalogSlot;
  values: ValuesMap;
  edits: Record<string, string>;
  onEdit: (key: string, val: string) => void;
  dirty: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{slot.title}</CardTitle>
        <CardDescription>{slot.usage}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {slot.fields.map((f) => {
            const info = values[f.key] ?? { secret: false, source: "none" as const, hasValue: false, value: "" };
            const editVal = edits[f.key];
            if (f.secret) {
              return (
                <div key={f.key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label className="mb-0">{f.label}</Label>
                    <SourceTag source={info.source} />
                  </div>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={editVal ?? ""}
                    placeholder={info.hasValue ? `${info.value} (guardada — dejar vacío para no cambiar)` : "sin definir"}
                    onChange={(e) => onEdit(f.key, e.target.value)}
                  />
                </div>
              );
            }
            return (
              <div key={f.key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">{f.label}</Label>
                  <SourceTag source={info.source} />
                </div>
                <Input
                  value={editVal ?? info.value}
                  placeholder={f.placeholder}
                  onChange={(e) => onEdit(f.key, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Pruebas y playground</div>
          {dirty && (
            <p className="text-xs text-primary">
              Hay cambios sin guardar; las pruebas usan la configuración ya guardada.
            </p>
          )}
          {slot.targets.map((tid) => {
            const t = targetById(tid);
            return t ? <TargetRow key={tid} target={t} /> : null;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type TestState = null | "loading" | { ok: boolean; ms: number; detail: string; provider?: string };
type PlayOut = { kind: "text"; text: string; provider: string; ms: number } | { kind: "image"; image: string; provider: string; ms: number };

function TargetRow({ target }: { target: ModelTarget }) {
  const [test, setTest] = useState<TestState>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(
    target.kind === "image"
      ? "Un círculo rojo simple, centrado, sobre fondo blanco liso. Minimalista."
      : "Escribe un haiku sobre el mar.",
  );
  const [aspect, setAspect] = useState("1:1");
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<PlayOut | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runTest() {
    setTest("loading");
    try {
      const r = await jsonFetch<{ ok: boolean; ms: number; detail: string; provider?: string }>("/api/settings/test", {
        method: "POST",
        body: JSON.stringify({ target: target.id }),
      });
      setTest(r);
    } catch (e) {
      setTest({ ok: false, ms: 0, detail: msg(e) });
    }
  }

  async function runPlayground() {
    if (!prompt.trim()) return;
    setRunning(true);
    setErr(null);
    setOut(null);
    try {
      const r = await jsonFetch<PlayOut>("/api/settings/playground", {
        method: "POST",
        body: JSON.stringify({ target: target.id, prompt, aspectRatio: aspect }),
      });
      setOut(r);
    } catch (e) {
      setErr(msg(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-sm font-medium">{target.label}</span>
        <Badge tone={target.kind === "image" ? "info" : "default"}>{target.kind === "image" ? "imagen" : "texto"}</Badge>
        {target.note && <span className="text-xs text-muted">{target.note}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runTest} disabled={test === "loading"}>
            {test === "loading" ? <Spinner /> : <Play className="h-3.5 w-3.5" />} Probar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            <FlaskConical className="h-3.5 w-3.5" />
            Playground
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {test && test !== "loading" && (
        <div className="flex items-start gap-2 px-3 pb-2 text-sm">
          {test.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          )}
          <span className={test.ok ? "text-success" : "text-danger"}>
            {test.ok ? "OK" : "Error"} · {(test.ms / 1000).toFixed(1)}s
            {test.provider ? ` · ${test.provider}` : ""}
            <span className="text-muted"> — {test.detail}</span>
          </span>
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {target.kind === "image" && (
            <div className="flex items-center gap-2">
              <Label className="mb-0 text-xs">Aspecto</Label>
              <Select value={aspect} onChange={(e) => setAspect(e.target.value)} className="h-8 w-28 text-xs">
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </Select>
              <span className="text-xs text-muted">Genera 1 imagen — consume cuota.</span>
            </div>
          )}
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-16" placeholder="Escribe un prompt…" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={runPlayground} disabled={running || !prompt.trim()}>
              {running ? <Spinner /> : <Play className="h-3.5 w-3.5" />} Ejecutar
            </Button>
            {out && <span className="text-xs text-muted">{out.provider} · {(out.ms / 1000).toFixed(1)}s</span>}
          </div>

          {err && <div className="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}

          {out?.kind === "text" && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm">
              {out.text}
            </pre>
          )}
          {out?.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={out.image} alt="resultado" className="max-h-96 rounded-[var(--radius)] border border-border" />
          )}
        </div>
      )}
    </div>
  );
}
