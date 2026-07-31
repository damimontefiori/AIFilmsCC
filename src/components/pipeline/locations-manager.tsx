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
              onDeleted={refetch}
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
  onDeleted,
}: {
  projectId: string;
  location: LocationDTO;
  onPatchLocal: (lid: string, patch: Partial<LocationDTO>) => void;
  onDeleted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    onDeleted();
  }

  const busy = saving || genning;

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
            <Label>Descripción del ambiente y objetos</Label>
            <Textarea
              className="min-h-32 text-sm"
              value={location.description}
              onChange={(e) => onPatchLocal(location.id, { description: e.target.value })}
              placeholder="Espacio, materiales, iluminación y objetos/props concretos…"
            />
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
            {location.imagePath ? "Regenerar ambiente" : "Generar ambiente"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
