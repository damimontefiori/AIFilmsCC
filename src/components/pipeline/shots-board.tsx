"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  Wand2,
  Image as ImageIcon,
  Trash2,
  AlertCircle,
  RefreshCw,
  Plus,
  Images,
  Sparkles,
  Check,
} from "lucide-react";
import type { SceneDTO, ShotDTO, LocationDTO, EncuadreDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label, Select } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";
import { Modal, ImageZoom } from "@/components/ui/modal";
import { FRAMING_TEMPLATES, FRAMING_PLACEHOLDER, FRAMING_HELP } from "@/lib/framings";

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
    setScenes((scs) => scs.map((sc) => (sc.id === sceneId ? { ...sc, locationId } : sc)));
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
      patchSceneLocation(sceneId, prev);
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
  const [error, setError] = useState<string | null>(null);
  const [genning, setGenning] = useState<null | "keyframe">(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // Ambiente / encuadres.
  const [envBusy, setEnvBusy] = useState<null | "select" | "newenc" | "mode" | "scene">(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [newEncOpen, setNewEncOpen] = useState(false);
  const [newEncLabel, setNewEncLabel] = useState("");
  const [newEncFraming, setNewEncFraming] = useState("");
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  // Prompt.
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptBusy, setPromptBusy] = useState<null | "preview" | "generate">(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const hasChars = local.characters.length > 0;
  const mode = local.renderMode === "direct" ? "direct" : "composite";
  const effLocationId = local.locationId ?? sceneLocationId;
  const effLocation = locations.find((l) => l.id === effLocationId) ?? null;
  const sceneLocation = locations.find((l) => l.id === sceneLocationId) ?? null;
  const found = findEncuadre(locations, local.encuadreId);
  const encMatches = !!found && found.loc.id === effLocationId;
  const currentLocation = encMatches ? found!.loc : effLocation;
  const envImage = (encMatches ? local.encuadreImagePath : null) ?? effLocation?.imagePath ?? null;
  const currentLabel = encMatches ? found!.enc.label || "Encuadre" : "Canónico";
  const isOverride = !!local.locationId;
  const busy = genning !== null || envBusy !== null || suggesting;

  // ── Autoguardado de campos de texto (debounce) ──────────────────────────
  async function persist(cur: ShotDTO) {
    setSaveState("saving");
    setError(null);
    try {
      const updated = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          actionDescription: cur.actionDescription,
          keyframeMoment: cur.keyframeMoment,
          cameraNotes: cur.cameraNotes,
          dialogueOrVO: cur.dialogueOrVO,
          characters: cur.characters,
        }),
      });
      onPatch(updated); // sincroniza al padre (no toca el textarea en edición)
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState("idle");
    }
  }
  function scheduleSave(next: ShotDTO) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 700);
  }
  async function flushSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await persist(local);
  }

  function set<K extends keyof ShotDTO>(k: K, v: ShotDTO[K]) {
    setLocal((s) => {
      const next = { ...s, [k]: v };
      scheduleSave(next);
      return next;
    });
  }

  function toggleChar(name: string) {
    setLocal((s) => {
      const exists = s.characters.some((c) => normName(c) === normName(name));
      const characters = exists
        ? s.characters.filter((c) => normName(c) !== normName(name))
        : [...s.characters, name];
      const next = { ...s, characters };
      scheduleSave(next);
      return next;
    });
  }

  // Merge SOLO campos estructurales de una respuesta del server (no pisa texto en edición).
  function mergeStructural(u: ShotDTO) {
    setLocal((s) => ({
      ...s,
      encuadreId: u.encuadreId,
      encuadreImagePath: u.encuadreImagePath,
      locationId: u.locationId,
      renderMode: u.renderMode,
      keyframePath: u.keyframePath,
      keyframePrompt: u.keyframePrompt,
      status: u.status,
    }));
    onPatch(u);
  }

  // ── Generación / IA ─────────────────────────────────────────────────────
  async function generateKeyframe() {
    setGenning("keyframe");
    setError(null);
    try {
      await flushSave();
      const res = await jsonFetch<{ shot: ShotDTO }>(
        `/api/projects/${projectId}/shots/${shot.id}/keyframe`,
        { method: "POST", body: JSON.stringify({}) },
      );
      mergeStructural(res.shot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenning(null);
    }
  }

  async function suggestMoment() {
    setSuggesting(true);
    setError(null);
    try {
      await flushSave();
      const { moment } = await jsonFetch<{ moment: string }>(
        `/api/projects/${projectId}/shots/${shot.id}/suggest-moment`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (moment) set("keyframeMoment", moment);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  async function setMode(next: "composite" | "direct") {
    if (next === mode) return;
    setEnvBusy("mode");
    setError(null);
    try {
      const u = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ renderMode: next }),
      });
      mergeStructural(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  async function selectEncuadre(encuadreId: string | null) {
    setEnvBusy("select");
    setError(null);
    try {
      const u = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ encuadreId }),
      });
      mergeStructural(u);
      setGalleryOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  async function createEncuadre() {
    if (!effLocationId || !newEncFraming.trim()) return;
    setEnvBusy("newenc");
    setError(null);
    try {
      const { encuadre } = await jsonFetch<{ encuadre: EncuadreDTO }>(
        `/api/projects/${projectId}/locations/${effLocationId}/encuadres`,
        { method: "POST", body: JSON.stringify({ label: newEncLabel, framingPrompt: newEncFraming }) },
      );
      const u = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ encuadreId: encuadre.id }),
      });
      mergeStructural(u);
      setNewEncOpen(false);
      setNewEncLabel("");
      setNewEncFraming("");
      setGalleryOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  async function changeShotLocation(locId: string) {
    setEnvBusy("scene");
    setError(null);
    try {
      const u = await jsonFetch<ShotDTO>(`/api/projects/${projectId}/shots/${shot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ locationId: locId || null, encuadreId: null }),
      });
      mergeStructural(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvBusy(null);
    }
  }

  async function openPrompt() {
    setPromptBusy("preview");
    setError(null);
    try {
      await flushSave();
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
      mergeStructural(res.shot);
      setPromptOpen(false);
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

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone={status.tone}>#{index} · {status.label}</Badge>
            <span className="text-xs text-muted">{local.durationSec}s</span>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {local.keyframePath ? (
              <ImageZoom
                src={mediaUrl(local.keyframePath)}
                alt="keyframe"
                caption={`Keyframe · plano #${index}`}
                className="h-full"
                imgClassName="h-full"
              />
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
                  <ImageZoom
                    src={mediaUrl(envImage)}
                    alt="ambiente"
                    caption={`${currentLocation?.name ?? "Ambiente"} · ${currentLabel}`}
                  />
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

              {encMatches ? (
                <div className="space-y-1">
                  <p className="px-1 text-[10px] text-muted">
                    Toma fija por el encuadre. «Cámara» solo afecta al clip.
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setNewEncOpen(false); setGalleryOpen(true); }}
                      disabled={busy || !effLocation}
                    >
                      <Images className="h-3 w-3" /> Cambiar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => selectEncuadre(null)}
                      disabled={busy}
                      title="Volver a componer según el campo «Cámara»."
                    >
                      Quitar encuadre
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="px-1 text-[10px] text-muted">
                    La toma la define el campo <strong>«Cámara»</strong> (a la derecha); se compone sobre el escenario.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => { setNewEncOpen(false); setGalleryOpen(true); }}
                    disabled={busy || !effLocation}
                    title="Elegir un encuadre existente o crear uno nuevo (para reutilizar una toma en varios planos)."
                  >
                    <Images className="h-3 w-3" /> Usar o crear un encuadre
                  </Button>
                </div>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={openPrompt}
            disabled={promptBusy !== null || busy}
            title="Ver/editar el prompt exacto que se enviará al modelo."
          >
            {promptBusy === "preview" ? <Spinner /> : <Wand2 className="h-3 w-3" />} Ver / editar prompt
          </Button>
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label className="mb-0">Momento del keyframe</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={suggestMoment}
                disabled={busy}
                title="Proponer con IA el instante exacto a congelar (podrás editarlo)."
              >
                {suggesting ? <Spinner /> : <Sparkles className="h-3 w-3" />} Proponer con IA
              </Button>
            </div>
            <Textarea
              className="min-h-12 text-sm"
              value={local.keyframeMoment}
              onChange={(e) => set("keyframeMoment", e.target.value)}
              placeholder="Instante exacto a congelar. Usa «Proponer con IA» o escríbelo. Si lo dejas vacío, se usa la Acción."
            />
            <p className="mt-1 text-[11px] text-muted">
              La Acción puede abarcar varios instantes; aquí eliges CUÁL frame se genera.
            </p>
          </div>
          <div>
            <Label>Cámara / toma</Label>
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-muted">Toma:</span>
              {FRAMING_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => set("cameraNotes", t.text)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:border-primary hover:text-primary"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Input
              value={local.cameraNotes}
              onChange={(e) => set("cameraNotes", e.target.value)}
              placeholder="Plano + movimiento. P. ej. «vista general, cámara fija» o «acercamiento, dolly suave»"
            />
            <p className="mt-1 text-[11px] text-muted">
              Define el <strong>plano del keyframe</strong> cuando NO usas un encuadre, y el
              movimiento para el clip. Duración fija ~10s.
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
              Marca quién aparece en el encuadre (incluye a quien esté de espaldas u OTS para usar su referencia).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] text-muted">
              {saveState === "saving" ? (
                <><Spinner className="h-3 w-3" /> Guardando…</>
              ) : saveState === "saved" ? (
                <><Check className="h-3 w-3 text-success" /> Guardado</>
              ) : (
                <>Autoguardado activo</>
              )}
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={del} title="Eliminar plano">
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

      {/* ── Modal: galería de encuadres ── */}
      <Modal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        title={effLocation ? `Encuadres de ${effLocation.name}` : "Encuadres"}
        className="max-w-4xl"
      >
        {!effLocation ? (
          <p className="text-sm text-muted">Este plano no tiene escenario asignado.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <EncuadreTile
                label="Canónico"
                imagePath={effLocation.imagePath}
                active={local.encuadreId === null}
                disabled={busy || !effLocation.imagePath}
                onSelect={() => selectEncuadre(null)}
                onZoom={setZoomSrc}
              />
              {effLocation.encuadres.map((enc) => (
                <EncuadreTile
                  key={enc.id}
                  label={enc.label || "Encuadre"}
                  imagePath={enc.imagePath}
                  active={local.encuadreId === enc.id}
                  disabled={busy}
                  onSelect={() => selectEncuadre(enc.id)}
                  onZoom={setZoomSrc}
                />
              ))}
              <button
                type="button"
                disabled={busy || !effLocation.imagePath}
                onClick={() => setNewEncOpen((v) => !v)}
                className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted hover:border-primary disabled:opacity-50"
                title={effLocation.imagePath ? "Generar otra toma de esta locación" : "Genera antes la imagen de referencia en Escenarios"}
              >
                <Plus className="h-5 w-5" /> Nuevo encuadre
              </button>
            </div>

            {!effLocation.imagePath && (
              <p className="text-xs text-primary">
                Esta locación no tiene imagen de referencia; genérala en Escenarios para crear encuadres.
              </p>
            )}

            {newEncOpen && effLocation.imagePath && (
              <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
                <Label className="mb-0 text-xs">Nuevo encuadre (otra toma del mismo lugar)</Label>
                <p className="text-[11px] text-muted">{FRAMING_HELP}</p>
                <Input
                  value={newEncLabel}
                  onChange={(e) => setNewEncLabel(e.target.value)}
                  placeholder="Nombre corto para reconocerlo (p. ej. Acercamiento a la mesa)"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted">Empezar con:</span>
                  {FRAMING_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setNewEncFraming(t.text)}
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:border-primary hover:text-primary"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  className="min-h-20"
                  value={newEncFraming}
                  onChange={(e) => setNewEncFraming(e.target.value)}
                  placeholder={FRAMING_PLACEHOLDER}
                />
                <Button onClick={createEncuadre} disabled={busy || !newEncFraming.trim()}>
                  {envBusy === "newenc" ? <Spinner /> : <Wand2 className="h-4 w-4" />} Generar encuadre
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal: ver/editar prompt ── */}
      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Prompt del keyframe"
        className="max-w-3xl"
      >
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Refleja la Acción y el «Momento del keyframe» actuales. Edítalo y genera con este texto tal cual.
          </p>
          <Textarea
            className="min-h-[50vh] font-mono text-xs leading-snug"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={generateWithPrompt} disabled={promptBusy !== null || !promptText.trim()}>
              {promptBusy === "generate" ? <Spinner /> : <ImageIcon className="h-4 w-4" />} Generar con este prompt
            </Button>
            <Button variant="outline" onClick={openPrompt} disabled={promptBusy !== null} title="Recargar desde los campos actuales (descarta ediciones).">
              <RefreshCw className="h-4 w-4" /> Recargar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Lightbox para miniaturas de la galería ── */}
      <Modal open={!!zoomSrc} onClose={() => setZoomSrc(null)} title="Vista ampliada" className="max-w-5xl">
        {zoomSrc && (
          <img src={mediaUrl(zoomSrc)} alt="" className="mx-auto max-h-[80vh] w-auto rounded-md object-contain" />
        )}
      </Modal>
    </Card>
  );
}

function EncuadreTile({
  label,
  imagePath,
  active,
  disabled,
  onSelect,
  onZoom,
}: {
  label: string;
  imagePath: string | null;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onZoom: (path: string) => void;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border ${
        active ? "border-primary ring-2 ring-primary" : "border-border"
      } ${imagePath ? "" : "opacity-60"}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="block w-full"
        title="Usar este encuadre"
      >
        {imagePath ? (
          <img src={mediaUrl(imagePath)} alt={label} className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-xs text-muted">sin imagen</div>
        )}
      </button>
      {imagePath && (
        <button
          type="button"
          onClick={() => onZoom(imagePath)}
          className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white hover:bg-black/70"
          title="Ampliar"
        >
          <Images className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-center gap-1 truncate px-1.5 py-1 text-xs">
        {active && <Check className="h-3 w-3 shrink-0 text-primary" />}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}
