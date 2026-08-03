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
  Plus,
  Images,
} from "lucide-react";
import type { SceneDTO, ShotDTO, LocationDTO, EncuadreDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label, Select } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// Normaliza sin acentos para comparar nombres ("Lucía" ≈ "Lucia").
const normName = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

/** Busca un encuadre por id en el catálogo → { loc, enc } o null. */
function findEncuadre(
  locations: LocationDTO[],
  id: string | null,
): { loc: LocationDTO; enc: EncuadreDTO } | null {
  if (!id) return null;
  for (const loc of locations) {
    const enc = loc.encuadres.find((e) => e.id === id);
    if (enc) return { loc, enc };
  }
  return null;
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
  characters,
  locations,
}: {
  projectId: string;
  initial: SceneDTO[];
  hasScript: boolean;
  characters: { id: string; name: string }[];
  locations: LocationDTO[];
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

  function patchSceneLocation(sceneId: string, locationId: string | null) {
    setScenes((scs) =>
      scs.map((sc) => (sc.id === sceneId ? { ...sc, locationId } : sc)),
    );
  }

  // Escenario GENERAL de la escena (afecta a los planos sin override).
  async function changeSceneLocation(sceneId: string, locId: string) {
    const prev = scenes.find((s) => s.id === sceneId)?.locationId ?? null;
    patchSceneLocation(sceneId, locId || null); // optimista
    try {
      await jsonFetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify({ locationId: locId }),
      });
    } catch (e) {
      patchSceneLocation(sceneId, prev); // revertir
      setError(e instanceof Error ? e.message : String(e));
    }
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
          <Badge>{locations.length} escenarios</Badge>
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
              Aún no hay planos. Desglosa el guion en clips de ~10s.
            </p>
          </CardContent>
        </Card>
      ) : (
        scenes.map((scene) => (
          <div key={scene.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <h3 className="flex items-center gap-2 font-mono text-sm uppercase text-muted">
                <span className="rounded bg-surface-2 px-2 py-0.5">{scene.order}</span>
                {scene.heading}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted">
                <span>Escenario:</span>
                <Select
                  className="h-7 w-auto text-xs"
                  value={scene.locationId ?? ""}
                  onChange={(e) => changeSceneLocation(scene.id, e.target.value)}
                  title="Escenario general de la escena (afecta a los planos sin override)."
                  disabled={locations.length === 0}
                >
                  <option value="">— sin escenario —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            {scene.shots.map((shot, i) => (
              <ShotRow
                key={shot.id}
                projectId={projectId}
                shot={shot}
                index={i + 1}
                allCharacters={characters}
                locations={locations}
                sceneLocationId={scene.locationId}
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
  allCharacters,
  locations,
  sceneLocationId,
  onPatch,
  onRemove,
}: {
  projectId: string;
  shot: ShotDTO;
  index: number;
  allCharacters: { id: string; name: string }[];
  locations: LocationDTO[];
  sceneLocationId: string | null;
  onPatch: (s: ShotDTO) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(shot);
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState<null | "keyframe">(null);
  const [error, setError] = useState<string | null>(null);
  // Ambiente / encuadres.
  const [envBusy, setEnvBusy] = useState<null | "select" | "newenc" | "mode" | "scene">(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newEncOpen, setNewEncOpen] = useState(false);
  const [newEncLabel, setNewEncLabel] = useState("");
  const [newEncFraming, setNewEncFraming] = useState("");
  // Panel avanzado: ver/editar el prompt exacto.
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptBusy, setPromptBusy] = useState<null | "preview" | "generate">(null);

  const hasChars = local.characters.length > 0;
  const mode = local.renderMode === "direct" ? "direct" : "composite";
  // Locación EFECTIVA del plano: override del plano → locación de la escena.
  const effLocationId = local.locationId ?? sceneLocationId;
  const effLocation = locations.find((l) => l.id === effLocationId) ?? null;
  const sceneLocation = locations.find((l) => l.id === sceneLocationId) ?? null;
  const found = findEncuadre(locations, local.encuadreId);
  const encMatches = !!found && found.loc.id === effLocationId; // encuadre válido para la locación efectiva
  const currentLocation = encMatches ? found!.loc : effLocation;
  const envImage = (encMatches ? local.encuadreImagePath : null) ?? effLocation?.imagePath ?? null;
  const currentLabel = encMatches ? found!.enc.label || "Encuadre" : "Canónico";
  const isOverride = !!local.locationId;
  const busy = genning !== null || envBusy !== null;

  function set<K extends keyof ShotDTO>(k: K, v: ShotDTO[K]) {
    setLocal((s) => ({ ...s, [k]: v }));
  }

  function toggleChar(name: string) {
    setLocal((s) => {
      const exists = s.characters.some((c) => normName(c) === normName(name));
      const characters = exists
        ? s.characters.filter((c) => normName(c) !== normName(name))
        : [...s.characters, name];
      return { ...s, characters };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          actionDescription: local.actionDescription,
          keyframeMoment: local.keyframeMoment,
          cameraNotes: local.cameraNotes,
          dialogueOrVO: local.dialogueOrVO,
          characters: local.characters,
        }),
      });
      setLocal(updated);
      onPatch(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Genera el keyframe con la técnica del plano (renderMode).
  async function generateKeyframe() {
    setGenning("keyframe");
    setError(null);
    try {
      const res = await jsonFetch<{ shot: ShotDTO }>(
        `/api/projects/${projectId}/shots/${shot.id}/keyframe`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setLocal(res.shot);
      onPatch(res.shot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenning(null);
    }
  }

  // Cambia la técnica (Componer/Directo), persistida en el plano.
  async function setMode(next: "composite" | "direct") {
    if (next === mode) return;
    setEnvBusy("mode");
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ renderMode: next }),
      });
      setLocal(updated);
      onPatch(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  // Elige un encuadre (o null = canónico de la locación de la escena).
  async function selectEncuadre(encuadreId: string | null) {
    setEnvBusy("select");
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ encuadreId }),
      });
      setLocal(updated);
      onPatch(updated);
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  // Genera un ENCUADRE nuevo (otra toma) de la locación EFECTIVA y lo ancla.
  async function createEncuadre() {
    if (!effLocationId || !newEncFraming.trim()) return;
    setEnvBusy("newenc");
    setError(null);
    try {
      const { encuadre } = await jsonFetch<{ encuadre: EncuadreDTO }>(
        `/api/projects/${projectId}/locations/${effLocationId}/encuadres`,
        {
          method: "POST",
          body: JSON.stringify({ label: newEncLabel, framingPrompt: newEncFraming }),
        },
      );
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ encuadreId: encuadre.id }),
      });
      setLocal(updated);
      onPatch(updated);
      setNewEncOpen(false);
      setNewEncLabel("");
      setNewEncFraming("");
      setPickerOpen(false);
      router.refresh(); // refresca el catálogo de encuadres
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  // Cambia el escenario SOLO de este plano (override); resetea el encuadre.
  async function changeShotLocation(locId: string) {
    setEnvBusy("scene");
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ locationId: locId || null, encuadreId: null }),
      });
      setLocal(updated);
      onPatch(updated);
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  function openPicker() {
    setNewEncOpen(false);
    setPickerOpen(true);
  }

  async function previewPrompt() {
    setPromptBusy("preview");
    setError(null);
    try {
      const res = await jsonFetch<{ prompt: string }>(
        `/api/projects/${projectId}/shots/${shot.id}/keyframe`,
        { method: "POST", body: JSON.stringify({ preview: true }) },
      );
      setPromptText(res.prompt);
      setPromptOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromptBusy(null);
    }
  }

  async function generateWithPrompt() {
    if (!promptText.trim()) return;
    setPromptBusy("generate");
    setError(null);
    try {
      const res = await jsonFetch<{ shot: ShotDTO }>(
        `/api/projects/${projectId}/shots/${shot.id}/keyframe`,
        { method: "POST", body: JSON.stringify({ promptOverride: promptText }) },
      );
      setLocal(res.shot);
      onPatch(res.shot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromptBusy(null);
    }
  }

  async function del() {
    if (!confirm("¿Eliminar este plano?")) return;
    await jsonFetch(`/api/projects/${projectId}/shots/${shot.id}`, { method: "DELETE" });
    onRemove();
  }

  const status = STATUS[local.status] || STATUS.planned;
  const genLabel =
    mode === "direct"
      ? local.keyframePath ? "Regenerar (directo)" : "Generar (directo)"
      : hasChars
        ? local.keyframePath ? "Recomponer keyframe" : "Componer keyframe"
        : local.keyframePath ? "Regenerar keyframe" : "Generar keyframe";

  const tileCls = (active: boolean, hasImg: boolean) =>
    `overflow-hidden rounded border text-left ${
      active ? "border-primary ring-1 ring-primary" : "border-border"
    } ${hasImg ? "hover:border-primary" : "opacity-60"}`;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[190px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone={status.tone}>#{index} · {status.label}</Badge>
            <span className="text-xs text-muted">{local.durationSec}s</span>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {local.keyframePath ? (
              <img src={mediaUrl(local.keyframePath)} alt="keyframe" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">Sin keyframe</div>
            )}
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={generateKeyframe} disabled={busy}>
            {genning === "keyframe" ? <Spinner /> : <ImageIcon className="h-3 w-3" />} {genLabel}
          </Button>

          {/* Técnica (persistida por plano) */}
          <div className="flex gap-1">
            <Button
              variant={mode === "composite" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("composite")}
              disabled={busy}
              title="Compone los personajes dentro del encuadre del ambiente."
            >
              {envBusy === "mode" && mode === "direct" ? <Spinner /> : null} Componer
            </Button>
            <Button
              variant={mode === "direct" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("direct")}
              disabled={busy}
              title="Genera en una sola pasada, sin capa base de ambiente."
            >
              {envBusy === "mode" && mode === "composite" ? <Spinner /> : null} Directo
            </Button>
          </div>

          {mode === "direct" ? (
            <p className="rounded-md border border-dashed border-border p-1.5 text-[10px] text-muted">
              Directo: una sola pasada, sin usar un encuadre de ambiente.
            </p>
          ) : (
            <div className="space-y-1 rounded-md border border-dashed border-border p-1.5">
              <div>
                <span className="text-[10px] text-muted">Escenario (este plano)</span>
                <Select
                  className="h-7 text-xs"
                  value={local.locationId ?? ""}
                  onChange={(e) => changeShotLocation(e.target.value)}
                  disabled={busy || locations.length === 0}
                  title="Cambia el escenario SOLO de este plano (override); resetea el encuadre."
                >
                  <option value="">
                    Igual que la escena{sceneLocation ? ` (${sceneLocation.name})` : ""}
                  </option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </div>

              {envImage ? (
                <div className="overflow-hidden rounded">
                  <img src={mediaUrl(envImage)} alt="ambiente" className="aspect-video w-full object-cover" />
                  <div className="truncate px-1 pt-0.5 text-[10px] text-muted">
                    {currentLocation?.name ?? "—"} · {currentLabel}
                    {isOverride ? " · (override)" : ""}
                  </div>
                </div>
              ) : (
                <p className="px-1 text-[10px] text-primary">
                  {effLocationId
                    ? "La locación no tiene imagen de referencia. Genérala en Escenarios."
                    : "Sin escenario. Elige uno aquí o en la escena, o usa Directo."}
                </p>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                disabled={busy || !effLocation}
              >
                {envBusy === "select" ? <Spinner /> : <Images className="h-3 w-3" />}
                {pickerOpen ? "Cerrar encuadres" : "Cambiar encuadre"}
              </Button>

              {pickerOpen && effLocation && (
                <div className="space-y-1 border-t border-border pt-1">
                  <p className="px-1 text-[10px] text-muted">
                    Encuadres de <strong>{effLocation.name}</strong>
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      disabled={busy || !effLocation.imagePath}
                      onClick={() => selectEncuadre(null)}
                      className={tileCls(local.encuadreId === null, !!effLocation.imagePath)}
                      title="Toma canónica (imagen de referencia de la locación)."
                    >
                      {effLocation.imagePath ? (
                        <img src={mediaUrl(effLocation.imagePath)} alt="canónico" className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center text-[9px] text-muted">sin imagen</div>
                      )}
                      <div className="truncate px-1 py-0.5 text-[9px]">
                        {local.encuadreId === null ? "✓ " : ""}Canónico
                      </div>
                    </button>
                    {effLocation.encuadres.map((enc) => (
                      <button
                        key={enc.id}
                        type="button"
                        disabled={busy}
                        onClick={() => selectEncuadre(enc.id)}
                        className={tileCls(local.encuadreId === enc.id, !!enc.imagePath)}
                        title={enc.label || "Encuadre"}
                      >
                        {enc.imagePath ? (
                          <img src={mediaUrl(enc.imagePath)} alt={enc.label} className="aspect-video w-full object-cover" />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center text-[9px] text-muted">—</div>
                        )}
                        <div className="truncate px-1 py-0.5 text-[9px]">
                          {local.encuadreId === enc.id ? "✓ " : ""}{enc.label || "Encuadre"}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy || !effLocation.imagePath}
                      onClick={() => setNewEncOpen((v) => !v)}
                      className="flex aspect-video w-full flex-col items-center justify-center rounded border border-dashed border-border text-[10px] text-muted hover:border-primary disabled:opacity-50"
                      title={effLocation.imagePath ? "Generar otra toma de esta locación" : "Genera antes la imagen de referencia en Escenarios"}
                    >
                      <Plus className="h-4 w-4" /> Nuevo encuadre
                    </button>
                  </div>

                  {!effLocation.imagePath && (
                    <p className="text-[10px] text-primary">
                      Esta locación no tiene imagen de referencia; genérala en Escenarios para crear encuadres.
                    </p>
                  )}

                  {newEncOpen && effLocation.imagePath && (
                    <div className="space-y-1 rounded-md bg-surface-2 p-1.5">
                      <Input
                        className="h-7 text-xs"
                        value={newEncLabel}
                        onChange={(e) => setNewEncLabel(e.target.value)}
                        placeholder="Etiqueta (p. ej. Cerrado en un cubículo)"
                      />
                      <Textarea
                        className="min-h-12 text-xs"
                        value={newEncFraming}
                        onChange={(e) => setNewEncFraming(e.target.value)}
                        placeholder="Describe la toma: ángulo/acercamiento (p. ej. «plano cerrado de un solo cubículo»)"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={createEncuadre}
                        disabled={busy || !newEncFraming.trim()}
                      >
                        {envBusy === "newenc" ? <Spinner /> : <Wand2 className="h-3 w-3" />} Generar encuadre
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Avanzado: ver/editar el prompt EXACTO que se envía al modelo. */}
          <div className="rounded-md border border-dashed border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => (promptOpen ? setPromptOpen(false) : previewPrompt())}
              disabled={promptBusy !== null}
              title="Muestra el prompt que se enviará al modelo; puedes editarlo antes de generar."
            >
              {promptBusy === "preview" ? <Spinner /> : <Wand2 className="h-3 w-3" />}
              {promptOpen ? "Ocultar prompt" : "Ver / editar prompt"}
            </Button>
            {promptOpen && (
              <div className="mt-1.5 space-y-1">
                <Textarea
                  className="min-h-40 font-mono text-[11px] leading-snug"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                />
                <p className="text-[10px] text-muted">
                  Refleja la Acción y el «Momento del keyframe» actuales. Edítalo y genera con este texto tal cual.
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={generateWithPrompt}
                    disabled={promptBusy !== null || !promptText.trim()}
                  >
                    {promptBusy === "generate" ? <Spinner /> : <ImageIcon className="h-3 w-3" />} Generar con este prompt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={previewPrompt}
                    disabled={promptBusy !== null}
                    title="Recargar el prompt desde los campos actuales (descarta ediciones)."
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
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
          <div>
            <Label>Momento del keyframe</Label>
            <Textarea
              className="min-h-12 text-sm"
              value={local.keyframeMoment}
              onChange={(e) => set("keyframeMoment", e.target.value)}
              placeholder="Instante exacto a congelar (p. ej. «Sofía abre la puerta y su rostro se ilumina»). Si lo dejas vacío, se usa la Acción."
            />
            <p className="mt-1 text-[11px] text-muted">
              La Acción puede abarcar varios instantes; aquí eliges CUÁL frame se genera. Recuerda Guardar antes de generar.
            </p>
          </div>
          <div>
            <Label>Cámara</Label>
            <Input value={local.cameraNotes} onChange={(e) => set("cameraNotes", e.target.value)} />
            <p className="mt-1 text-[11px] text-muted">
              Duración de clip: {local.durationSec}s (fija — Gemini Omni genera ~10s).
            </p>
          </div>
          <div>
            <Label>Diálogo / voz en off</Label>
            <Input value={local.dialogueOrVO} onChange={(e) => set("dialogueOrVO", e.target.value)} />
          </div>
          <div>
            <Label>Personajes en cuadro</Label>
            {allCharacters.length === 0 ? (
              <p className="text-[11px] text-muted">
                No hay personajes en el proyecto. Créalos en la etapa Personajes.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {allCharacters.map((c) => {
                  const active = local.characters.some((n) => normName(n) === normName(c.name));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleChar(c.name)}
                      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary"
                      }`}
                    >
                      {active ? "✓ " : "+ "}
                      {c.name}
                    </button>
                  );
                })}
                {local.characters
                  .filter((n) => !allCharacters.some((c) => normName(c.name) === normName(n)))
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleChar(n)}
                      className="rounded-full border border-danger/50 bg-danger/10 px-2 py-0.5 text-xs text-danger"
                      title="No coincide con un personaje del proyecto — click para quitar."
                    >
                      ✕ {n}
                    </button>
                  ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted">
              Marca quién aparece en el encuadre (incluye a quien esté de espaldas u OTS para usar su referencia). Recuerda Guardar antes de generar.
            </p>
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
