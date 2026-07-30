"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  Wand2,
  Image as ImageIcon,
  Save,
  Trash2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { SceneDTO, ShotDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const STATUS: Record<string, { label: string; tone: any }> = {
  planned: { label: "Planificado", tone: "default" },
  keyframe_ready: { label: "Keyframe", tone: "info" },
  package_ready: { label: "Listo", tone: "info" },
  generated: { label: "Generado", tone: "success" },
  imported: { label: "Importado", tone: "success" },
};

export function ShotsBoard({
  projectId,
  initial,
  hasScript,
}: {
  projectId: string;
  initial: SceneDTO[];
  hasScript: boolean;
}) {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneDTO[]>(initial);
  const [breaking, setBreaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function breakdown() {
    if (
      scenes.length > 0 &&
      !confirm("Esto reemplazará el desglose actual (y sus keyframes). ¿Continuar?")
    )
      return;
    setBreaking(true);
    setError(null);
    try {
      const res = await jsonFetch<{ scenes: SceneDTO[] }>(
        `/api/projects/${projectId}/shots/breakdown`,
        { method: "POST" },
      );
      setScenes(res.scenes);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBreaking(false);
    }
  }

  function patchShot(shot: ShotDTO) {
    setScenes((scs) =>
      scs.map((sc) =>
        sc.id === shot.sceneId
          ? { ...sc, shots: sc.shots.map((s) => (s.id === shot.id ? shot : s)) }
          : sc,
      ),
    );
  }

  function removeShotLocal(sceneId: string, shotId: string) {
    setScenes((scs) =>
      scs.map((sc) =>
        sc.id === sceneId ? { ...sc, shots: sc.shots.filter((s) => s.id !== shotId) } : sc,
      ),
    );
  }

  const totalShots = scenes.reduce((n, s) => n + s.shots.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Badge>{scenes.length} escenas</Badge>
          <Badge>{totalShots} planos</Badge>
        </div>
        <Button onClick={breakdown} disabled={breaking || !hasScript}>
          {breaking ? <Spinner /> : scenes.length ? <RefreshCw className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
          {scenes.length ? "Rehacer desglose" : "Desglosar en planos"}
        </Button>
      </div>

      {!hasScript && (
        <div className="flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Genera el guion antes de desglosar en planos.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {scenes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clapperboard className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted">
              Aún no hay planos. Desglosa el guion en clips de ~8s.
            </p>
          </CardContent>
        </Card>
      ) : (
        scenes.map((scene) => (
          <div key={scene.id} className="space-y-2">
            <h3 className="flex items-center gap-2 pt-2 font-mono text-sm uppercase text-muted">
              <span className="rounded bg-surface-2 px-2 py-0.5">{scene.order}</span>
              {scene.heading}
            </h3>
            {scene.shots.map((shot, i) => (
              <ShotRow
                key={shot.id}
                projectId={projectId}
                shot={shot}
                index={i + 1}
                onPatch={patchShot}
                onRemove={() => removeShotLocal(scene.id, shot.id)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function ShotRow({
  projectId,
  shot,
  index,
  onPatch,
  onRemove,
}: {
  projectId: string;
  shot: ShotDTO;
  index: number;
  onPatch: (s: ShotDTO) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(shot);
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ShotDTO>(k: K, v: ShotDTO[K]) {
    setLocal((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(
        `/api/projects/${projectId}/shots/${shot.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            actionDescription: local.actionDescription,
            cameraNotes: local.cameraNotes,
            dialogueOrVO: local.dialogueOrVO,
            durationSec: Number(local.durationSec),
          }),
        },
      );
      setLocal(updated);
      onPatch(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateKeyframe() {
    setGenning(true);
    setError(null);
    try {
      const res = await jsonFetch<{ shot: ShotDTO }>(
        `/api/projects/${projectId}/shots/${shot.id}/keyframe`,
        { method: "POST" },
      );
      setLocal(res.shot);
      onPatch(res.shot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenning(false);
    }
  }

  async function del() {
    if (!confirm("¿Eliminar este plano?")) return;
    await jsonFetch(`/api/projects/${projectId}/shots/${shot.id}`, { method: "DELETE" });
    onRemove();
  }

  const status = STATUS[local.status] || STATUS.planned;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone={status.tone}>#{index} · {status.label}</Badge>
            <span className="text-xs text-muted">{local.durationSec}s</span>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {local.keyframePath ? (
              <img
                src={mediaUrl(local.keyframePath)}
                alt="keyframe"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">
                Sin keyframe
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={generateKeyframe}
            disabled={genning}
          >
            {genning ? <Spinner /> : <ImageIcon className="h-3 w-3" />}
            {local.keyframePath ? "Regenerar keyframe" : "Generar keyframe"}
          </Button>
          {local.characters.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {local.characters.map((c) => (
                <Badge key={c} tone="info">{c}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <Label>Acción</Label>
            <Textarea
              className="min-h-14 text-sm"
              value={local.actionDescription}
              onChange={(e) => set("actionDescription", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Cámara</Label>
              <Input value={local.cameraNotes} onChange={(e) => set("cameraNotes", e.target.value)} />
            </div>
            <div>
              <Label>Duración (s)</Label>
              <Input
                type="number"
                min={2}
                max={8}
                value={local.durationSec}
                onChange={(e) => set("durationSec", Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label>Diálogo / voz en off</Label>
            <Input value={local.dialogueOrVO} onChange={(e) => set("dialogueOrVO", e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={del}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
