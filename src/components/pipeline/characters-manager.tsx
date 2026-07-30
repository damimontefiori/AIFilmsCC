"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Wand2,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Save,
  ImagePlus,
  AlertCircle,
  X,
} from "lucide-react";
import type { CharacterDTO } from "@/lib/dto";
import type { ReferenceImage } from "@/lib/serialize";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

const KIND_LABEL: Record<string, string> = {
  portrait: "Retrato",
  full_body: "Cuerpo",
  three_quarter: "3/4",
};

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function CharactersManager({
  projectId,
  initial,
  hasScript,
}: {
  projectId: string;
  initial: CharacterDTO[];
  hasScript: boolean;
}) {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterDTO[]>(initial);
  const [extracting, setExtracting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    const list = await jsonFetch<CharacterDTO[]>(`/api/projects/${projectId}/characters`);
    setCharacters(list);
  }

  async function extract() {
    setExtracting(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/characters/extract`, { method: "POST" });
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
      await jsonFetch(`/api/projects/${projectId}/characters`, {
        method: "POST",
        body: JSON.stringify({ name: "Nuevo personaje" }),
      });
      await refetch();
    } finally {
      setAdding(false);
    }
  }

  function patchLocal(cid: string, patch: Partial<CharacterDTO>) {
    setCharacters((cs) => cs.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-muted">
          Las descripciones canónicas y las imágenes de referencia{" "}
          <strong className="text-foreground">bloqueadas</strong> son el ancla de
          consistencia: se usarán para generar los keyframes de cada plano.
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
          Genera el guion antes de extraer personajes.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {characters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted">
              Aún no hay personajes. Extráelos del guion o añádelos manualmente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              projectId={projectId}
              character={c}
              onPatchLocal={patchLocal}
              onDeleted={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterCard({
  projectId,
  character,
  onPatchLocal,
  onDeleted,
}: {
  projectId: string;
  character: CharacterDTO;
  onPatchLocal: (cid: string, patch: Partial<CharacterDTO>) => void;
  onDeleted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [genKind, setGenKind] = useState<string | null>(null);
  const [useRefs, setUseRefs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function saveFields() {
    setSaving(true);
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: character.name,
          role: character.role,
          canonicalDescription: character.canonicalDescription,
          personality: character.personality,
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleLock() {
    const next = !character.locked;
    onPatchLocal(character.id, { locked: next });
    await jsonFetch(`/api/projects/${projectId}/characters/${character.id}`, {
      method: "PATCH",
      body: JSON.stringify({ locked: next }),
    }).catch(() => onPatchLocal(character.id, { locked: !next }));
  }

  async function generate(kind: string) {
    setGenKind(kind);
    setError(null);
    try {
      const res = await jsonFetch<{ referenceImages: ReferenceImage[] }>(
        `/api/projects/${projectId}/characters/${character.id}/reference`,
        { method: "POST", body: JSON.stringify({ kind, useReferences: useRefs }) },
      );
      onPatchLocal(character.id, { referenceImages: res.referenceImages });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenKind(null);
    }
  }

  async function removeImage(path: string) {
    const res = await jsonFetch<{ referenceImages: ReferenceImage[] }>(
      `/api/projects/${projectId}/characters/${character.id}/reference?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
    onPatchLocal(character.id, { referenceImages: res.referenceImages });
  }

  async function del() {
    if (!confirm(`¿Eliminar a "${character.name}"?`)) return;
    await jsonFetch(`/api/projects/${projectId}/characters/${character.id}`, {
      method: "DELETE",
    });
    onDeleted();
  }

  const busy = saving || genKind !== null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_320px]">
        {/* Columna izquierda: datos */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="font-semibold"
              value={character.name}
              onChange={(e) => onPatchLocal(character.id, { name: e.target.value })}
              placeholder="Nombre"
            />
            <Button
              variant={character.locked ? "primary" : "outline"}
              size="icon"
              onClick={toggleLock}
              title={character.locked ? "Bloqueado (ancla de consistencia)" : "Sin bloquear"}
            >
              {character.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={del} title="Eliminar">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
          <div>
            <Label>Rol</Label>
            <Input
              value={character.role}
              onChange={(e) => onPatchLocal(character.id, { role: e.target.value })}
              placeholder="Protagonista, antagonista…"
            />
          </div>
          <div>
            <Label>Descripción canónica (apariencia fija)</Label>
            <Textarea
              className="min-h-28 text-sm"
              value={character.canonicalDescription}
              onChange={(e) =>
                onPatchLocal(character.id, { canonicalDescription: e.target.value })
              }
              placeholder="Edad, complexión, cabello, rasgos, vestuario concreto…"
            />
          </div>
          <div>
            <Label>Personalidad (opcional)</Label>
            <Textarea
              className="min-h-14 text-sm"
              value={character.personality}
              onChange={(e) => onPatchLocal(character.id, { personality: e.target.value })}
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

        {/* Columna derecha: referencias */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="mb-0">Referencias visuales</Label>
            {character.locked && <Badge tone="success">Ancla</Badge>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {character.referenceImages.length === 0 && (
              <div className="col-span-3 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted">
                Sin imágenes todavía
              </div>
            )}
            {character.referenceImages.map((r) => (
              <div key={r.path} className="group relative">
                <img
                  src={mediaUrl(r.path)}
                  alt={r.kind}
                  className="aspect-square w-full rounded-md border border-border object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">
                  {KIND_LABEL[r.kind] || r.kind}
                </span>
                <button
                  onClick={() => removeImage(r.path)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Eliminar"
                >
                  <X className="h-3 w-3 text-danger" />
                </button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={useRefs}
              onChange={(e) => setUseRefs(e.target.checked)}
            />
            Usar imágenes previas como referencia (consistencia)
          </label>

          <div className="flex flex-wrap gap-2">
            {(["portrait", "full_body", "three_quarter"] as const).map((k) => (
              <Button
                key={k}
                variant="outline"
                size="sm"
                onClick={() => generate(k)}
                disabled={busy}
              >
                {genKind === k ? <Spinner /> : <ImagePlus className="h-3 w-3" />}{" "}
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
