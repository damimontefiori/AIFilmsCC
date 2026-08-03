"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Wand2,
  Plus,
  Trash2,
  Lock,
  Unlock,
  ImagePlus,
  AlertCircle,
  X,
  Download,
  Check,
} from "lucide-react";
import type { CharacterDTO } from "@/lib/dto";
import type { ReferenceImage } from "@/lib/serialize";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";
import { ImageZoom } from "@/components/ui/modal";

const KIND_LABEL: Record<string, string> = {
  portrait: "Retrato",
  full_body: "Cuerpo",
  three_quarter: "3/4",
};
// Token seguro para el nombre de archivo (sin "/").
const KIND_FILE: Record<string, string> = {
  portrait: "retrato",
  full_body: "cuerpo",
  three_quarter: "tres-cuartos",
};

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "personaje"
  );
}
function refFilename(name: string, kind: string, path: string) {
  const ext = (path.split(".").pop() || "png").toLowerCase();
  return `${slugify(name)}-${KIND_FILE[kind] || kind}.${ext}`;
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
  const [genKind, setGenKind] = useState<string | null>(null);
  const [useRefs, setUseRefs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ── Autoguardado (debounce) de los campos de texto ──
  async function persist(cur: CharacterDTO) {
    setSaveState("saving");
    setError(null);
    try {
      await jsonFetch(`/api/projects/${projectId}/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: cur.name,
          role: cur.role,
          canonicalDescription: cur.canonicalDescription,
          personality: cur.personality,
        }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState("idle");
    }
  }
  function scheduleSave(next: CharacterDTO) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 700);
  }
  function update(patch: Partial<CharacterDTO>) {
    onPatchLocal(character.id, patch);
    scheduleSave({ ...character, ...patch });
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

  const busy = genKind !== null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_320px]">
        {/* Columna izquierda: datos */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="font-semibold"
              value={character.name}
              onChange={(e) => update({ name: e.target.value })}
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
              onChange={(e) => update({ role: e.target.value })}
              placeholder="Protagonista, antagonista…"
            />
          </div>
          <div>
            <Label>Descripción canónica (apariencia fija)</Label>
            <Textarea
              className="min-h-28 text-sm"
              value={character.canonicalDescription}
              onChange={(e) => update({ canonicalDescription: e.target.value })}
              placeholder="Edad, complexión, cabello, rasgos, vestuario concreto…"
            />
          </div>
          <div>
            <Label>Personalidad (opcional)</Label>
            <Textarea
              className="min-h-14 text-sm"
              value={character.personality}
              onChange={(e) => update({ personality: e.target.value })}
            />
          </div>
          <span className="flex items-center gap-1 text-[11px] text-muted">
            {saveState === "saving" ? (
              <><Spinner className="h-3 w-3" /> Guardando…</>
            ) : saveState === "saved" ? (
              <><Check className="h-3 w-3 text-success" /> Guardado</>
            ) : (
              <>Autoguardado activo</>
            )}
          </span>
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
              <div
                key={r.path}
                className="group relative overflow-hidden rounded-md border border-border"
              >
                <ImageZoom
                  src={mediaUrl(r.path)}
                  alt={KIND_LABEL[r.kind] || r.kind}
                  caption={`${character.name} · ${KIND_LABEL[r.kind] || r.kind}`}
                  className="aspect-square w-full"
                />
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">
                  {KIND_LABEL[r.kind] || r.kind}
                </span>
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <a
                    href={mediaUrl(r.path)}
                    download={refFilename(character.name, r.kind, r.path)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-full bg-background/80 p-1 hover:bg-background"
                    title="Descargar"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => removeImage(r.path)}
                    className="rounded-full bg-background/80 p-1 hover:bg-background"
                    title="Eliminar"
                  >
                    <X className="h-3 w-3 text-danger" />
                  </button>
                </div>
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
            {(["portrait", "full_body"] as const).map((k) => (
              <Button
                key={k}
                variant="outline"
                size="sm"
                onClick={() => generate(k)}
                disabled={busy}
              >
                {genKind === k ? <Spinner /> : <ImagePlus className="h-3 w-3" />} {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Genera el <strong>retrato</strong> y el <strong>cuerpo entero</strong>: son el
            ancla de identidad al componer los keyframes (componer usa el cuerpo; directo, ambos).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
