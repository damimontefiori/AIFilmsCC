"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, Wand2, ArrowRight, AlertCircle } from "lucide-react";
import type { ProjectDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { LANGUAGES } from "@/lib/languages";
import {
  DEFAULT_SCRIPT_MODEL,
  scriptModelById,
} from "@/lib/pipeline/script-models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { ScriptModelPicker } from "./script-model-picker";

export function IdeaEditor({
  project,
  defaultAiStudioKey,
}: {
  project: ProjectDTO;
  defaultAiStudioKey: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(project);
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(project.scriptModel || DEFAULT_SCRIPT_MODEL);
  const [apiKey, setApiKey] = useState(defaultAiStudioKey);

  function set<K extends keyof ProjectDTO>(key: K, value: ProjectDTO[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          idea: form.idea,
          genre: form.genre,
          tone: form.tone,
          language: form.language,
          aspectRatio: form.aspectRatio,
          targetDurationSec: Number(form.targetDurationSec),
          logline: form.logline,
          synopsis: form.synopsis,
          styleBible: form.styleBible,
          scriptModel: model,
        }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function refine() {
    setRefining(true);
    setError(null);
    try {
      // Guarda primero por si el usuario cambió idea/género/tono.
      await jsonFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          idea: form.idea,
          genre: form.genre,
          tone: form.tone,
          language: form.language,
        }),
      });
      const updated = await jsonFetch<ProjectDTO>(
        `/api/projects/${project.id}/refine`,
        { method: "POST" },
      );
      setForm((f) => ({ ...f, ...updated }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefining(false);
    }
  }

  async function autopilot() {
    const opt = scriptModelById(model);
    if (opt?.needsApiKey && !apiKey.trim()) {
      setError("El modelo del guion seleccionado requiere una API Key de AI Studio.");
      return;
    }
    setAuto(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          idea: form.idea,
          genre: form.genre,
          tone: form.tone,
          language: form.language,
          targetDurationSec: Number(form.targetDurationSec),
          aspectRatio: form.aspectRatio,
          scriptModel: model,
        }),
      });
      await jsonFetch(`/api/projects/${project.id}/autopilot`, {
        method: "POST",
        body: JSON.stringify({
          model,
          apiKey: opt?.needsApiKey ? apiKey : undefined,
        }),
      });
      router.push(`/projects/${project.id}/script`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAuto(false);
    }
  }

  const busy = saving || refining || auto;
  const hasConcept = Boolean(form.logline || form.synopsis || form.styleBible);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Idea y ajustes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Título del cortometraje"
            />
          </div>
          <div>
            <Label>Idea</Label>
            <Textarea
              className="min-h-32"
              value={form.idea}
              onChange={(e) => set("idea", e.target.value)}
              placeholder="Describe tu idea, aunque sea vaga…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Género</Label>
              <Input value={form.genre} onChange={(e) => set("genre", e.target.value)} />
            </div>
            <div>
              <Label>Tono</Label>
              <Input value={form.tone} onChange={(e) => set("tone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Idioma</Label>
              <Select value={form.language} onChange={(e) => set("language", e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={form.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value)}>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </Select>
            </div>
            <div>
              <Label>Duración (s)</Label>
              <Input
                type="number"
                min={16}
                max={600}
                value={form.targetDurationSec}
                onChange={(e) => set("targetDurationSec", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" onClick={save} disabled={busy}>
              {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
            </Button>
            <Button variant="outline" onClick={refine} disabled={busy}>
              {refining ? <Spinner /> : <Sparkles className="h-4 w-4" />} Refinar concepto
            </Button>
            <Button onClick={autopilot} disabled={busy}>
              {auto ? <Spinner /> : <Wand2 className="h-4 w-4" />} Auto-borrador
            </Button>
          </div>
          {auto && (
            <p className="text-xs text-muted">
              Generando concepto y guion… puede tardar hasta ~1 minuto.
            </p>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Concepto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasConcept ? (
            <p className="text-sm text-muted">
              Aún no hay concepto. Pulsa <strong>Refinar concepto</strong> para
              expandir tu idea en logline, sinopsis y estilo visual.
            </p>
          ) : (
            <>
              <div>
                <Label>Logline</Label>
                <Textarea
                  className="min-h-16"
                  value={form.logline}
                  onChange={(e) => set("logline", e.target.value)}
                />
              </div>
              <div>
                <Label>Sinopsis</Label>
                <Textarea
                  className="min-h-28"
                  value={form.synopsis}
                  onChange={(e) => set("synopsis", e.target.value)}
                />
              </div>
              <div>
                <Label>Biblia de estilo (visual)</Label>
                <Textarea
                  className="min-h-28"
                  value={form.styleBible}
                  onChange={(e) => set("styleBible", e.target.value)}
                />
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={save} disabled={busy}>
                  {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
                </Button>
                <Button variant="outline" onClick={() => router.push(`/projects/${project.id}/script`)}>
                  Ir a Guion <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
      <ScriptModelPicker
        model={model}
        setModel={setModel}
        apiKey={apiKey}
        setApiKey={setApiKey}
        hint="Modelo para generar el guion. Lo usan «Auto-borrador» y el paso «Guion»."
      />
    </div>
  );
}
