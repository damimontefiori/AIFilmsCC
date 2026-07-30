"use client";

import { useRef, useState } from "react";
import {
  Upload,
  Trash2,
  Film,
  Clapperboard,
  Download,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { ShotDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function AssemblyView({
  projectId,
  initialShots,
  initialExport,
}: {
  projectId: string;
  initialShots: ShotDTO[];
  initialExport: string | null;
}) {
  const [shots, setShots] = useState<ShotDTO[]>(initialShots);
  const [exporting, setExporting] = useState(false);
  const [exportKey, setExportKey] = useState<string | null>(initialExport);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const imported = shots.filter((s) => s.videoPath).length;

  function patchShot(shot: ShotDTO) {
    setShots((ss) => ss.map((s) => (s.id === shot.id ? shot : s)));
  }

  async function doExport() {
    setExporting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await jsonFetch<{
        export: { outputPath: string };
        usedClips: number;
        missing: number;
      }>(`/api/projects/${projectId}/export`, { method: "POST" });
      setExportKey(res.export.outputPath);
      setInfo(
        `Ensamblado con ${res.usedClips} clip(s)` +
          (res.missing > 0 ? ` · ${res.missing} plano(s) sin clip omitidos` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Montaje final</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={imported === shots.length && shots.length > 0 ? "success" : "default"}>
              {imported}/{shots.length} clips importados
            </Badge>
            <Button onClick={doExport} disabled={exporting || imported === 0}>
              {exporting ? <Spinner /> : <Clapperboard className="h-4 w-4" />}
              Ensamblar y exportar
            </Button>
          </div>
          {exporting && (
            <p className="text-xs text-muted">
              Normalizando y concatenando con ffmpeg… puede tardar según el número de clips.
            </p>
          )}
          {info && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {info}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {exportKey && (
            <div className="space-y-2">
              <video
                key={exportKey}
                controls
                className="w-full rounded-md border border-border bg-black"
                src={mediaUrl(exportKey)}
              />
              <a href={mediaUrl(exportKey)} download>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" /> Descargar película
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="font-semibold">Clips por plano</h3>
        {shots.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted">
              No hay planos. Genera el desglose en la etapa «Planos».
            </CardContent>
          </Card>
        ) : (
          shots.map((shot, i) => (
            <ClipRow key={shot.id} projectId={projectId} shot={shot} index={i + 1} onPatch={patchShot} />
          ))
        )}
      </div>
    </div>
  );
}

function ClipRow({
  projectId,
  shot,
  index,
  onPatch,
}: {
  projectId: string;
  shot: ShotDTO;
  index: number;
  onPatch: (s: ShotDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/shots/${shot.id}/clip`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al subir");
      onPatch(data.shot);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeClip() {
    const res = await jsonFetch<{ shot: ShotDTO }>(
      `/api/projects/${projectId}/shots/${shot.id}/clip`,
      { method: "DELETE" },
    );
    onPatch(res.shot);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">
          {index}
        </span>
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
          {shot.keyframePath ? (
            <img src={mediaUrl(shot.keyframePath)} alt="kf" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted">
              sin keyframe
            </div>
          )}
        </div>

        <div className="min-w-40 flex-1">
          <p className="line-clamp-1 text-sm">{shot.actionDescription || "—"}</p>
          <p className="text-xs text-muted">{shot.durationSec}s</p>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {shot.videoPath ? (
          <div className="flex items-center gap-2">
            <video
              className="h-16 w-28 rounded border border-border bg-black"
              src={mediaUrl(shot.videoPath)}
              muted
              controls
            />
            <Button variant="ghost" size="icon" onClick={removeClip} title="Quitar clip">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={onFile}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Spinner /> : <Upload className="h-4 w-4" />} Subir clip
            </Button>
          </>
        )}

        <Badge tone={shot.videoPath ? "success" : "default"}>
          {shot.videoPath ? <Film className="mr-1 h-3 w-3" /> : null}
          {shot.videoPath ? "importado" : "pendiente"}
        </Badge>
      </CardContent>
    </Card>
  );
}
