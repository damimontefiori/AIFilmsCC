"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Save,
  Trash2,
  Plus,
  MessageSquare,
  Film,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { ProjectDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import {
  scriptToMarkdown,
  type ScriptBeat,
  type ScriptDoc,
  type ScriptScene,
} from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function parseDoc(json: string | null): ScriptDoc | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ScriptDoc;
  } catch {
    return null;
  }
}

export function ScriptEditor({ project }: { project: ProjectDTO }) {
  const router = useRouter();
  const [doc, setDoc] = useState<ScriptDoc | null>(parseDoc(project.scriptJson));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function mutate(next: ScriptDoc) {
    setDoc(next);
    setDirty(true);
  }

  function updateScene(i: number, patch: Partial<ScriptScene>) {
    if (!doc) return;
    const scenes = doc.scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    mutate({ ...doc, scenes });
  }

  function updateBeat(si: number, bi: number, patch: Partial<ScriptBeat>) {
    if (!doc) return;
    const scenes = doc.scenes.map((s, idx) => {
      if (idx !== si) return s;
      const beats = s.beats.map((b, j) =>
        j === bi ? ({ ...b, ...patch } as ScriptBeat) : b,
      );
      return { ...s, beats };
    });
    mutate({ ...doc, scenes });
  }

  function addBeat(si: number, type: "action" | "dialogue") {
    if (!doc) return;
    const beat: ScriptBeat =
      type === "action"
        ? { type: "action", text: "" }
        : { type: "dialogue", character: "", line: "" };
    const scenes = doc.scenes.map((s, idx) =>
      idx === si ? { ...s, beats: [...s.beats, beat] } : s,
    );
    mutate({ ...doc, scenes });
  }

  function removeBeat(si: number, bi: number) {
    if (!doc) return;
    const scenes = doc.scenes.map((s, idx) =>
      idx === si ? { ...s, beats: s.beats.filter((_, j) => j !== bi) } : s,
    );
    mutate({ ...doc, scenes });
  }

  function addScene() {
    if (!doc) return;
    const scene: ScriptScene = {
      order: doc.scenes.length + 1,
      heading: "",
      location: "",
      timeOfDay: "",
      summary: "",
      characters: [],
      beats: [],
    };
    mutate({ ...doc, scenes: [...doc.scenes, scene] });
  }

  function removeScene(si: number) {
    if (!doc) return;
    const scenes = doc.scenes
      .filter((_, idx) => idx !== si)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    mutate({ ...doc, scenes });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await jsonFetch<{ doc: ScriptDoc }>(
        `/api/projects/${project.id}/script`,
        { method: "POST" },
      );
      setDoc(res.doc);
      setDirty(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scriptJson: JSON.stringify(doc),
          scriptMarkdown: scriptToMarkdown(doc),
        }),
      });
      setDirty(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const busy = generating || saving;

  if (!doc) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Film className="h-10 w-10 text-primary" />
          <div>
            <p className="font-medium">Aún no hay guion</p>
            <p className="text-sm text-muted">
              Genera un guion estructurado a partir del concepto.
            </p>
          </div>
          <Button onClick={generate} disabled={busy}>
            {generating ? <Spinner /> : <Wand2 className="h-4 w-4" />} Generar guion
          </Button>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-30 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-surface/90 p-2 backdrop-blur">
        <div className="flex items-center gap-2 px-2 text-sm">
          <Badge>{doc.scenes.length} escenas</Badge>
          {dirty && <Badge tone="warning">Cambios sin guardar</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            {generating ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Regenerar
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {doc.scenes.map((scene, si) => (
        <Card key={si}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {scene.order}
              </span>
              <Input
                className="font-mono text-sm uppercase"
                value={scene.heading}
                placeholder="INT. LUGAR - DÍA"
                onChange={(e) => updateScene(si, { heading: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeScene(si)}
                title="Eliminar escena"
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>

            <Textarea
              className="min-h-14 text-sm"
              value={scene.summary}
              placeholder="Resumen de la escena…"
              onChange={(e) => updateScene(si, { summary: e.target.value })}
            />

            <div className="space-y-2 border-l-2 border-border pl-3">
              {scene.beats.map((beat, bi) => (
                <div key={bi} className="flex items-start gap-2">
                  {beat.type === "action" ? (
                    <>
                      <Film className="mt-2 h-4 w-4 shrink-0 text-muted" />
                      <Textarea
                        className="min-h-12 text-sm"
                        value={beat.text}
                        placeholder="Acción…"
                        onChange={(e) =>
                          updateBeat(si, bi, { text: e.target.value } as Partial<ScriptBeat>)
                        }
                      />
                    </>
                  ) : (
                    <>
                      <MessageSquare className="mt-2 h-4 w-4 shrink-0 text-accent" />
                      <div className="flex-1 space-y-1">
                        <Input
                          className="h-8 text-sm font-medium"
                          value={beat.character}
                          placeholder="PERSONAJE"
                          onChange={(e) =>
                            updateBeat(si, bi, {
                              character: e.target.value,
                            } as Partial<ScriptBeat>)
                          }
                        />
                        <Textarea
                          className="min-h-12 text-sm"
                          value={beat.line}
                          placeholder="Diálogo…"
                          onChange={(e) =>
                            updateBeat(si, bi, { line: e.target.value } as Partial<ScriptBeat>)
                          }
                        />
                      </div>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBeat(si, bi)}
                    title="Eliminar beat"
                  >
                    <Trash2 className="h-4 w-4 text-muted" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => addBeat(si, "action")}>
                  <Plus className="h-3 w-3" /> Acción
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBeat(si, "dialogue")}>
                  <Plus className="h-3 w-3" /> Diálogo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addScene} className="w-full">
        <Plus className="h-4 w-4" /> Añadir escena
      </Button>
    </div>
  );
}
