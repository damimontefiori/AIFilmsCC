"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Wand2,
  Plus,
  Trash2,
  Lock,
  Unlock,
  ImagePlus,
  Upload,
  Images,
  Download,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { LocationDTO, EncuadreDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { useAutosave } from "@/lib/use-autosave";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Badge, Spinner, SaveIndicator } from "@/components/ui/misc";
import { ImageZoom, Modal } from "@/components/ui/modal";
import { FRAMING_TEMPLATES, FRAMING_PLACEHOLDER, FRAMING_HELP } from "@/lib/framings";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// Nombre de archivo legible para las descargas de imágenes de escenario.
function slugName(s: string) {
  return (
    (s || "escenario")
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "escenario"
  );
}
const extFromPath = (p: string) => (p.split(".").pop() || "png").toLowerCase();

/**
 * Tira de versiones (historial) de una imagen: miniaturas con la actual
 * resaltada; clic para usar una versión anterior; ✕ para borrarla. No muestra
 * nada si solo existe la versión actual.
 */
function VersionStrip({
  versions,
  current,
  busyKey,
  disabled,
  onSelect,
  onDelete,
}: {
  versions: string[];
  current: string | null;
  busyKey: string | null;
  disabled: boolean;
  onSelect: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  if (!versions || versions.length < 2) return null;
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-muted">Versiones ({versions.length})</span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {versions.map((v) => {
          const isCur = v === current;
          const isBusy = busyKey === v;
          return (
            <div key={v} className="relative shrink-0">
              <button
                type="button"
                disabled={disabled || isCur}
                onClick={() => onSelect(v)}
                title={isCur ? "Versión actual" : "Usar esta versión"}
                className={`block h-12 w-16 overflow-hidden rounded border ${
                  isCur
                    ? "border-primary ring-1 ring-primary"
                    : "border-border hover:border-primary disabled:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(v)}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full object-cover"
                />
              </button>
              {isCur && (
                <span className="absolute bottom-0 left-0 rounded-tr bg-primary px-1 text-[9px] leading-tight text-white">
                  actual
                </span>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(v)}
                title="Borrar versión"
                className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-danger shadow-sm hover:bg-danger hover:text-white disabled:opacity-40"
              >
                {isBusy ? <Spinner /> : <Trash2 className="h-2.5 w-2.5" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LocationsManager({
  projectId,
  initial,
  hasScript,
}: {
  projectId: string;
  initial: LocationDTO[];
  hasScript: boolean;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationDTO[]>(initial);
  const [extracting, setExtracting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    setLocations(await jsonFetch<LocationDTO[]>(`/api/projects/${projectId}/locations`));
  }

  async function extract() {
    setExtracting(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/locations/extract`, { method: "POST" });
      await refetch();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  }

  async function addManual() {
    setAdding(true);
    try {
      await jsonFetch(`/api/projects/${projectId}/locations`, {
        method: "POST",
        body: JSON.stringify({ name: "Nueva locación" }),
      });
      await refetch();
    } finally {
      setAdding(false);
    }
  }

  function patchLocal(lid: string, patch: Partial<LocationDTO>) {
    setLocations((ls) => ls.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-muted">
          Genera <strong className="text-foreground">una imagen de ambiente por locación</strong>{" "}
          (con sus objetos) y bloquéala. Se reutiliza como base en todos los planos
          de ese lugar, así el entorno y los props no cambian entre clips.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addManual} disabled={adding}>
            {adding ? <Spinner /> : <Plus className="h-4 w-4" />} Añadir
          </Button>
          <Button onClick={extract} disabled={extracting || !hasScript}>
            {extracting ? <Spinner /> : <Wand2 className="h-4 w-4" />} Extraer del guion
          </Button>
        </div>
      </div>

      {!hasScript && (
        <div className="flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Genera el guion antes de extraer locaciones.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MapPin className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted">
              Aún no hay escenarios. Extráelos del guion o añádelos manualmente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {locations.map((l) => (
            <LocationCard
              key={l.id}
              projectId={projectId}
              location={l}
              onPatchLocal={patchLocal}
              onRefetch={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationCard({
  projectId,
  location,
  onPatchLocal,
  onRefetch,
}: {
  projectId: string;
  location: LocationDTO;
  onPatchLocal: (lid: string, patch: Partial<LocationDTO>) => void;
  onRefetch: () => void;
}) {
  const [genning, setGenning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encBusy, setEncBusy] = useState<null | "new" | string>(null);
  const [newEncLabel, setNewEncLabel] = useState("");
  const [newEncFraming, setNewEncFraming] = useState("");
  const [imgHint, setImgHint] = useState("");
  const [busyImg, setBusyImg] = useState<null | "reference" | "canonical">(null);
  const [encOpen, setEncOpen] = useState(false);
  // Corrección por instrucciones + historial (ambiente y encuadres).
  const [imgInstruction, setImgInstruction] = useState("");
  const [editingAmbient, setEditingAmbient] = useState(false);
  const [versBusy, setVersBusy] = useState<string | null>(null);
  const [encInstr, setEncInstr] = useState<Record<string, string>>({});
  const [encEditing, setEncEditing] = useState<string | null>(null);
  const imgRefA = useRef<HTMLInputElement>(null);
  const imgRefB = useRef<HTMLInputElement>(null);
  const { state: saveState, schedule } = useAutosave();

  // Sube una imagen con un PROPÓSITO explícito:
  //  - "reference": la usa solo como referencia para redactar la biblia de objetos.
  //  - "canonical": además la fija como Ambiente canónico del escenario.
  async function onImage(e: React.ChangeEvent<HTMLInputElement>, mode: "reference" | "canonical") {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setBusyImg(mode);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (imgHint.trim()) fd.append("hint", imgHint.trim());
      const res = await fetch(`/api/projects/${projectId}/locations/${location.id}/from-image`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al analizar la imagen");
      onPatchLocal(location.id, {
        description: data.description,
        imagePath: data.imagePath,
        ...(Array.isArray(data.versions) ? { imageVersions: data.versions } : {}),
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusyImg(null);
    }
  }

  // Autoguardado (debounce) del nombre y la biblia de objetos.
  async function persist(next: { name: string; description: string }) {
    try {
      await jsonFetch(`/api/projects/${projectId}/locations/${location.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next.name, description: next.description }),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  function update(patch: Partial<Pick<LocationDTO, "name" | "description">>) {
    const next = {
      name: patch.name ?? location.name,
      description: patch.description ?? location.description,
    };
    onPatchLocal(location.id, patch);
    schedule(() => persist(next));
  }

  function patchEnc(eid: string, patch: Partial<EncuadreDTO>) {
    onPatchLocal(location.id, {
      encuadres: location.encuadres.map((e) => (e.id === eid ? { ...e, ...patch } : e)),
    });
  }

  async function createEncuadre() {
    if (!newEncFraming.trim()) return;
    setEncBusy("new");
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/locations/${location.id}/encuadres`, {
        method: "POST",
        body: JSON.stringify({ label: newEncLabel, framingPrompt: newEncFraming }),
      });
      setNewEncLabel("");
      setNewEncFraming("");
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEncBusy(null);
    }
  }

  async function deleteEncuadre(eid: string) {
    setEncBusy(eid);
    try {
      await jsonFetch(
        `/api/projects/${projectId}/locations/${location.id}/encuadres/${eid}`,
        { method: "DELETE" },
      );
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEncBusy(null);
    }
  }

  async function toggleLock() {
    const next = !location.locked;
    onPatchLocal(location.id, { locked: next });
    await jsonFetch(`/api/projects/${projectId}/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ locked: next }),
    }).catch(() => onPatchLocal(location.id, { locked: !next }));
  }

  async function generate() {
    setGenning(true);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/image`,
        { method: "POST" },
      );
      onPatchLocal(location.id, { imagePath: res.imagePath, imageVersions: res.versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenning(false);
    }
  }

  // ── Corrección del ambiente por instrucciones + historial ──────────────────
  async function editAmbient() {
    const instruction = imgInstruction.trim();
    if (!instruction) return;
    setEditingAmbient(true);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/image/edit`,
        { method: "POST", body: JSON.stringify({ instruction }) },
      );
      onPatchLocal(location.id, { imagePath: res.imagePath, imageVersions: res.versions });
      setImgInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditingAmbient(false);
    }
  }

  async function selectAmbientVersion(key: string) {
    setVersBusy(key);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/image/versions`,
        { method: "POST", body: JSON.stringify({ imagePath: key }) },
      );
      onPatchLocal(location.id, { imagePath: res.imagePath, imageVersions: res.versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersBusy(null);
    }
  }

  async function deleteAmbientVersion(key: string) {
    if (!confirm("¿Borrar esta versión de la imagen? No se puede deshacer.")) return;
    setVersBusy(key);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string | null; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/image/versions`,
        { method: "DELETE", body: JSON.stringify({ imagePath: key }) },
      );
      onPatchLocal(location.id, { imagePath: res.imagePath, imageVersions: res.versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersBusy(null);
    }
  }

  // ── Corrección/historial de encuadres ──────────────────────────────────────
  async function editEnc(eid: string) {
    const instruction = (encInstr[eid] || "").trim();
    if (!instruction) return;
    setEncEditing(eid);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/encuadres/${eid}/edit`,
        { method: "POST", body: JSON.stringify({ instruction }) },
      );
      patchEnc(eid, { imagePath: res.imagePath, imageVersions: res.versions });
      setEncInstr((s) => ({ ...s, [eid]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEncEditing(null);
    }
  }

  async function selectEncVersion(eid: string, key: string) {
    setVersBusy(key);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/encuadres/${eid}/versions`,
        { method: "POST", body: JSON.stringify({ imagePath: key }) },
      );
      patchEnc(eid, { imagePath: res.imagePath, imageVersions: res.versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersBusy(null);
    }
  }

  async function deleteEncVersion(eid: string, key: string) {
    if (!confirm("¿Borrar esta versión del encuadre? No se puede deshacer.")) return;
    setVersBusy(key);
    setError(null);
    try {
      const res = await jsonFetch<{ imagePath: string | null; versions: string[] }>(
        `/api/projects/${projectId}/locations/${location.id}/encuadres/${eid}/versions`,
        { method: "DELETE", body: JSON.stringify({ imagePath: key }) },
      );
      patchEnc(eid, { imagePath: res.imagePath, imageVersions: res.versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersBusy(null);
    }
  }

  async function del() {
    if (!confirm(`¿Eliminar la locación "${location.name}"?`)) return;
    await jsonFetch(`/api/projects/${projectId}/locations/${location.id}`, { method: "DELETE" });
    onRefetch();
  }

  const busy =
    genning ||
    encBusy !== null ||
    busyImg !== null ||
    editingAmbient ||
    versBusy !== null ||
    encEditing !== null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="font-semibold"
              value={location.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Nombre de la locación"
            />
            <Button
              variant={location.locked ? "primary" : "outline"}
              size="icon"
              onClick={toggleLock}
              title={location.locked ? "Bloqueado (ambiente canónico)" : "Sin bloquear"}
            >
              {location.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={del} title="Eliminar">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
          <div>
            <Label>Biblia de objetos (invariantes del lugar)</Label>
            <Textarea
              className="min-h-32 text-sm"
              value={location.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Materiales, colores, iluminación y objetos/props concretos que NO deben cambiar entre tomas…"
            />
            <p className="mt-1 text-[11px] text-muted">
              Estos invariantes viajan a cada encuadre para que las distintas tomas
              del lugar se mantengan consistentes.
            </p>
          </div>
          <SaveIndicator state={saveState} />
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="mb-0">Ambiente canónico</Label>
            {location.locked && <Badge tone="success">Bloqueado</Badge>}
          </div>
          <div className="group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {location.imagePath ? (
              <>
                <ImageZoom
                  src={mediaUrl(location.imagePath)}
                  alt={location.name}
                  caption={location.name}
                  className="h-full w-full"
                />
                <a
                  href={mediaUrl(location.imagePath)}
                  download={`${slugName(location.name)}-ambiente.${extFromPath(location.imagePath)}`}
                  onClick={(e) => e.stopPropagation()}
                  title="Descargar imagen"
                  className="absolute left-1 top-1 rounded-full bg-background/80 p-1 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted">
                Sin imagen de ambiente
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={generate} disabled={busy}>
            {genning ? <Spinner /> : <ImagePlus className="h-3 w-3" />}
            {location.imagePath ? "Regenerar referencia" : "Generar referencia"}
          </Button>

          {/* Corregir el ambiente con instrucciones (edición dirigida) + historial. */}
          {location.imagePath && (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <Label className="mb-0">Corregir con instrucciones</Label>
              <div className="flex gap-1">
                <Input
                  className="h-7 text-xs"
                  value={imgInstruction}
                  onChange={(e) => setImgInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      editAmbient();
                    }
                  }}
                  placeholder="p. ej. elimina a la persona, agranda la lámpara…"
                  disabled={busy}
                />
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={editAmbient}
                  disabled={busy || !imgInstruction.trim()}
                  title="Aplicar corrección"
                >
                  {editingAmbient ? <Spinner /> : <Sparkles className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted">
                Edita la imagen actual conservando el resto. Cada corrección crea una versión nueva.
              </p>
              <VersionStrip
                versions={location.imageVersions}
                current={location.imagePath}
                busyKey={versBusy}
                disabled={busy}
                onSelect={selectAmbientVersion}
                onDelete={deleteAmbientVersion}
              />
            </div>
          )}

          {/* Subir una imagen propia — el usuario elige el PROPÓSITO. */}
          <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
            <Label className="mb-0">O parte de una imagen tuya</Label>
            <Input
              className="h-7 text-xs"
              value={imgHint}
              onChange={(e) => setImgHint(e.target.value)}
              placeholder="Idea para la biblia (opcional)"
            />
            <input ref={imgRefA} type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e, "reference")} />
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => imgRefA.current?.click()} disabled={busy}>
              {busyImg === "reference" ? <Spinner /> : <Upload className="h-3 w-3" />} Analizar como referencia → biblia
            </Button>
            <input ref={imgRefB} type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e, "canonical")} />
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => imgRefB.current?.click()} disabled={busy}>
              {busyImg === "canonical" ? <Spinner /> : <Upload className="h-3 w-3" />} Usar la imagen como ambiente
            </Button>
            <p className="text-[11px] text-muted">
              <strong>Referencia:</strong> solo inspira la biblia (adaptada al estilo del film); no cambia la imagen del escenario. ·{" "}
              <strong>Como ambiente:</strong> además fija esa imagen como el ambiente canónico.
            </p>
          </div>

          {/* Encuadres: gestionados en un modal amplio (miniaturas grandes). */}
          <div className="space-y-1 border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Encuadres (tomas de este lugar)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEncOpen(true)}
                disabled={!location.imagePath}
              >
                <Images className="h-3 w-3" />
                {location.encuadres.length > 0 ? `Ver / crear (${location.encuadres.length})` : "Crear"}
              </Button>
            </div>
            {!location.imagePath && (
              <p className="text-[11px] text-muted">
                Genera primero la referencia para poder crear encuadres.
              </p>
            )}
          </div>

          <Modal
            open={encOpen}
            onClose={() => setEncOpen(false)}
            title={`Encuadres · ${location.name}`}
            className="max-w-3xl"
          >
            <div className="space-y-4">
              {location.encuadres.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {location.encuadres.map((enc) => (
                    <div key={enc.id} className="space-y-1.5 rounded-md border border-border p-1.5">
                      <div className="group relative overflow-hidden rounded">
                        {enc.imagePath ? (
                          <ImageZoom
                            src={mediaUrl(enc.imagePath)}
                            alt={enc.label}
                            caption={`${location.name} · ${enc.label || "Encuadre"}`}
                            className="aspect-video w-full"
                          />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center text-xs text-muted">—</div>
                        )}
                        {enc.imagePath && (
                          <a
                            href={mediaUrl(enc.imagePath)}
                            download={`${slugName(location.name)}-${slugName(enc.label || "encuadre")}.${extFromPath(enc.imagePath)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Descargar encuadre"
                            className="absolute left-1 top-1 rounded bg-background/80 p-1 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteEncuadre(enc.id)}
                          disabled={busy}
                          title="Eliminar encuadre"
                          className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          {encBusy === enc.id ? <Spinner /> : <Trash2 className="h-4 w-4 text-danger" />}
                        </button>
                      </div>
                      <div className="truncate text-xs" title={enc.label}>
                        {enc.label || "Encuadre"}
                      </div>
                      {enc.imagePath && (
                        <>
                          <div className="flex gap-1">
                            <Input
                              className="h-6 text-[11px]"
                              value={encInstr[enc.id] || ""}
                              onChange={(e) => setEncInstr((s) => ({ ...s, [enc.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  editEnc(enc.id);
                                }
                              }}
                              placeholder="Corregir…"
                              disabled={busy}
                            />
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-6 w-6 shrink-0"
                              onClick={() => editEnc(enc.id)}
                              disabled={busy || !(encInstr[enc.id] || "").trim()}
                              title="Aplicar corrección"
                            >
                              {encEditing === enc.id ? <Spinner /> : <Sparkles className="h-3 w-3" />}
                            </Button>
                          </div>
                          <VersionStrip
                            versions={enc.imageVersions}
                            current={enc.imagePath}
                            busyKey={versBusy}
                            disabled={busy}
                            onSelect={(k) => selectEncVersion(enc.id, k)}
                            onDelete={(k) => deleteEncVersion(enc.id, k)}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Aún no hay encuadres. Crea el primero abajo.</p>
              )}

              <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
                <p className="text-xs text-muted">{FRAMING_HELP}</p>
                <Input
                  value={newEncLabel}
                  onChange={(e) => setNewEncLabel(e.target.value)}
                  placeholder="Nombre corto para reconocerlo (p. ej. Acercamiento a la mesa)"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted">Empezar con:</span>
                  {FRAMING_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setNewEncFraming(tpl.text)}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:border-primary hover:text-primary"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  className="min-h-20 text-sm"
                  value={newEncFraming}
                  onChange={(e) => setNewEncFraming(e.target.value)}
                  placeholder={FRAMING_PLACEHOLDER}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={createEncuadre}
                  disabled={busy || !newEncFraming.trim()}
                >
                  {encBusy === "new" ? <Spinner /> : <Plus className="h-4 w-4" />} Nuevo encuadre
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </CardContent>
    </Card>
  );
}
