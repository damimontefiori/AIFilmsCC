"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Wand2,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Save,
  ImagePlus,
  AlertCircle,
} from "lucide-react";
import type { LocationDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
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
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encBusy, setEncBusy] = useState<null | "new" | string>(null);
  const [newEncLabel, setNewEncLabel] = useState("");
  const [newEncFraming, setNewEncFraming] = useState("");

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

  async function saveFields() {
    setSaving(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/locations/${location.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: location.name, description: location.description }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
      const res = await jsonFetch<{ location: LocationDTO }>(
        `/api/projects/${projectId}/locations/${location.id}/image`,
        { method: "POST" },
      );
      onPatchLocal(location.id, { imagePath: res.location.imagePath });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenning(false);
    }
  }

  async function del() {
    if (!confirm(`¿Eliminar la locación "${location.name}"?`)) return;
    await jsonFetch(`/api/projects/${projectId}/locations/${location.id}`, { method: "DELETE" });
    onRefetch();
  }

  const busy = saving || genning || encBusy !== null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="font-semibold"
              value={location.name}
              onChange={(e) => onPatchLocal(location.id, { name: e.target.value })}
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
              onChange={(e) => onPatchLocal(location.id, { description: e.target.value })}
              placeholder="Materiales, colores, iluminación y objetos/props concretos que NO deben cambiar entre tomas…"
            />
            <p className="mt-1 text-[11px] text-muted">
              Estos invariantes viajan a cada encuadre para que las distintas tomas
              del lugar se mantengan consistentes.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={saveFields} disabled={busy}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Guardar
          </Button>
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
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {location.imagePath ? (
              <img src={mediaUrl(location.imagePath)} alt={location.name} className="h-full w-full object-cover" />
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

          {/* Encuadres: otras tomas del mismo lugar (general, cerrado, OTS…). */}
          <div className="space-y-1 border-t border-border pt-2">
            <Label className="mb-0">Encuadres (tomas de este lugar)</Label>
            {!location.imagePath && (
              <p className="text-[11px] text-muted">
                Genera primero la referencia para poder crear encuadres.
              </p>
            )}
            {location.encuadres.length > 0 && (
              <div className="grid grid-cols-3 gap-1">
                {location.encuadres.map((enc) => (
                  <div key={enc.id} className="group relative overflow-hidden rounded border border-border">
                    {enc.imagePath ? (
                      <img src={mediaUrl(enc.imagePath)} alt={enc.label} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center text-[9px] text-muted">—</div>
                    )}
                    <div className="truncate px-1 py-0.5 text-[9px]" title={enc.label}>{enc.label || "Encuadre"}</div>
                    <button
                      type="button"
                      onClick={() => deleteEncuadre(enc.id)}
                      disabled={busy}
                      title="Eliminar encuadre"
                      className="absolute right-0.5 top-0.5 rounded bg-background/70 p-0.5 opacity-0 group-hover:opacity-100"
                    >
                      {encBusy === enc.id ? <Spinner /> : <Trash2 className="h-3 w-3 text-danger" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {location.imagePath && (
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
                <Button variant="secondary" size="sm" className="w-full" onClick={createEncuadre} disabled={busy || !newEncFraming.trim()}>
                  {encBusy === "new" ? <Spinner /> : <Plus className="h-3 w-3" />} Nuevo encuadre
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
