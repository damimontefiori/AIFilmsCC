"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Trash2,
  Film,
  Clapperboard,
  Download,
  AlertCircle,
  CheckCircle2,
  Scissors,
  Music,
  RefreshCw,
  ListVideo,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Undo2,
  ArrowLeft,
  ArrowRight,
  Volume2,
  VolumeX,
  Copy,
} from "lucide-react";
import type { ShotDTO, TimelineClipDTO, AudioSettingsDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
const baseName = (p: string) => p.split("/").pop() || p;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AssemblyView({
  projectId,
  initialShots,
  initialTimeline,
  initialAudio,
  initialExport,
}: {
  projectId: string;
  initialShots: ShotDTO[];
  initialTimeline: TimelineClipDTO[];
  initialAudio: AudioSettingsDTO;
  initialExport: string | null;
}) {
  const [shots, setShots] = useState<ShotDTO[]>(initialShots);
  const [timeline, setTimeline] = useState<TimelineClipDTO[]>(initialTimeline);
  const [audio, setAudio] = useState<AudioSettingsDTO>(initialAudio);
  const [exporting, setExporting] = useState(false);
  const [exportKey, setExportKey] = useState<string | null>(initialExport);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tlBusy, setTlBusy] = useState(false);
  const [undoStack, setUndoStack] = useState<TimelineClipDTO[][]>([]);

  const imported = shots.filter((s) => s.videoPath).length;

  function patchShot(shot: ShotDTO) {
    setShots((ss) => ss.map((s) => (s.id === shot.id ? shot : s)));
  }

  // Historial de deshacer: guarda snapshots de la línea de tiempo ANTES de cada
  // cambio (máx. 30). Deshacer restaura el snapshot previo vía /timeline/replace.
  const pushUndo = (snap: TimelineClipDTO[]) =>
    setUndoStack((s) => [...s.slice(-29), snap]);

  async function undo() {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setError(null);
    setUndoStack((s) => s.slice(0, -1));
    try {
      const res = await jsonFetch<{ timeline: TimelineClipDTO[] }>(
        `/api/projects/${projectId}/timeline/replace`,
        {
          method: "POST",
          body: JSON.stringify({
            clips: prev.map((c) => ({
              sourcePath: c.sourcePath,
              sourceShotId: c.sourceShotId,
              label: c.label,
              inSec: c.inSec,
              outSec: c.outSec,
            })),
          }),
        },
      );
      setTimeline(res.timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Atajo Ctrl/⌘+Z (fuera de campos de texto).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (undoStack.length === 0) return;
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack]);

  async function buildTimeline() {
    setTlBusy(true);
    setError(null);
    if (timeline.length > 0) pushUndo(timeline); // regenerar es deshacible
    try {
      const res = await jsonFetch<{ timeline: TimelineClipDTO[] }>(
        `/api/projects/${projectId}/timeline`,
        { method: "POST" },
      );
      setTimeline(res.timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTlBusy(false);
    }
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
        source: string;
      }>(`/api/projects/${projectId}/export`, { method: "POST" });
      setExportKey(res.export.outputPath);
      setInfo(
        `Ensamblado con ${res.usedClips} segmento(s) ` +
          `(${res.source === "timeline" ? "línea de tiempo" : "orden de planos"})` +
          (res.missing > 0 ? ` · ${res.missing} plano(s) sin clip omitidos` : "") +
          (audio.audioPath ? ` · audio: ${audio.audioMode === "replace" ? "reemplazo" : "mezcla"}` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Editor visual ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Editor de montaje</CardTitle>
          <div className="flex items-center gap-2">
            {timeline.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={tlBusy}
                onClick={() => {
                  if (confirm("¿Regenerar la línea de tiempo desde los clips importados? Se perderán los cortes y el orden actuales.")) buildTimeline();
                }}
              >
                {tlBusy ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Regenerar
              </Button>
            )}
            <Button onClick={doExport} disabled={exporting || (timeline.length === 0 && imported === 0)}>
              {exporting ? <Spinner /> : <Clapperboard className="h-4 w-4" />}
              Ensamblar y exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeline.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted">
                Genera la línea de tiempo a partir de los clips importados para editarla de forma visual.
              </p>
              <Button onClick={buildTimeline} disabled={tlBusy || imported === 0}>
                {tlBusy ? <Spinner /> : <ListVideo className="h-4 w-4" />} Generar desde los clips
              </Button>
              {imported === 0 && <p className="text-xs text-muted">Importa al menos un clip abajo.</p>}
            </div>
          ) : (
            <TimelineEditor
              projectId={projectId}
              timeline={timeline}
              setTimeline={setTimeline}
              audio={audio}
              onError={setError}
              onSnapshot={pushUndo}
              onUndo={undo}
              undoCount={undoStack.length}
            />
          )}
          {exporting && (
            <p className="text-xs text-muted">
              Normalizando, concatenando{audio.audioPath ? " y aplicando audio" : ""} con ffmpeg… puede tardar.
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
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Película exportada</p>
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

      {/* ── Pista de audio ────────────────────────────────────────────── */}
      <AudioPanel projectId={projectId} audio={audio} onAudio={setAudio} />

      {/* ── Clips por plano (importación) ─────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="font-semibold">Clips por plano</h3>
        <p className="text-xs text-muted">
          Importa aquí el clip de cada plano; luego pulsa «Generar desde los clips» arriba para editarlos.
        </p>
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

// ════════════════════════════════════════════════════════════════════════
//  Editor visual de línea de tiempo
// ════════════════════════════════════════════════════════════════════════
type Placed = TimelineClipDTO & { start: number; dur: number; effIn: number; effOut: number };
type DragState =
  | { type: "trim"; id: string; edge: "in" | "out"; startX: number; origIn: number; origOut: number; srcDur: number }
  | { type: "reorder"; id: string; index: number; startX: number }
  | { type: "seek"; startX: number };

function TimelineEditor({
  projectId,
  timeline,
  setTimeline,
  audio,
  onError,
  onSnapshot,
  onUndo,
  undoCount,
}: {
  projectId: string;
  timeline: TimelineClipDTO[];
  setTimeline: (tl: TimelineClipDTO[]) => void;
  audio: AudioSettingsDTO;
  onError: (m: string | null) => void;
  onSnapshot: (snap: TimelineClipDTO[]) => void;
  onUndo: () => void;
  undoCount: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const curSrcRef = useRef<string>("");
  const playIdxRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);

  const [durations, setDurations] = useState<Map<string, number>>(new Map());
  const [pps, setPps] = useState(40); // píxeles por segundo (zoom)
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trimPreview, setTrimPreview] = useState<{ id: string; effIn: number; effOut: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragUI, setDragUI] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Espejos en ref (se leen de forma síncrona en mouseup, sin depender del
  // re-registro del efecto ni del batching de estado).
  const dropIndexRef = useRef<number | null>(null);
  const trimPreviewRef = useRef<{ id: string; effIn: number; effOut: number } | null>(null);
  // Volumen por clip (0..2) + WebAudio para previsualizar hasta 200%.
  const [volDraft, setVolDraft] = useState<{ id: string; volume: number } | null>(null);
  const volDraftRef = useRef<{ id: string; volume: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const webaudioTriedRef = useRef(false);
  const prevVolRef = useRef(1);

  // Detecta la duración real de cada clip de origen (metadatos, en cliente).
  useEffect(() => {
    const srcs = Array.from(new Set(timeline.map((s) => s.sourcePath)));
    for (const src of srcs) {
      if (durations.has(src)) continue;
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = mediaUrl(src);
      v.onloadedmetadata = () =>
        setDurations((m) => (m.has(src) ? m : new Map(m).set(src, v.duration || 10)));
    }
  }, [timeline, durations]);

  // Coloca cada segmento en la línea de tiempo (start/dur absolutos).
  const placed: Placed[] = useMemo(() => {
    let acc = 0;
    return timeline.map((seg) => {
      const srcDur = durations.get(seg.sourcePath) ?? 10;
      const preview = trimPreview && trimPreview.id === seg.id ? trimPreview : null;
      const effIn = preview ? preview.effIn : seg.inSec ?? 0;
      const effOut = preview ? preview.effOut : seg.outSec ?? srcDur;
      const dur = Math.max(0.1, effOut - effIn);
      const start = acc;
      acc += dur;
      return { ...seg, start, dur, effIn, effOut };
    });
  }, [timeline, durations, trimPreview]);
  const total = placed.reduce((a, s) => a + s.dur, 0);

  const placedRef = useRef<Placed[]>(placed);
  placedRef.current = placed;

  function segAt(time: number): { seg: Placed; index: number } | null {
    for (let i = 0; i < placed.length; i++) {
      if (time < placed[i].start + placed[i].dur - 1e-3) return { seg: placed[i], index: i };
    }
    return placed.length ? { seg: placed[placed.length - 1], index: placed.length - 1 } : null;
  }

  // ── Previsualización: reproduce la secuencia encadenando los clips ──────
  function stopLoop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  function pause() {
    playingRef.current = false;
    setPlaying(false);
    stopLoop();
    videoRef.current?.pause();
    audioRef.current?.pause();
  }
  function loadSegAndPlay(index: number, localOffset: number) {
    const v = videoRef.current;
    const seg = placedRef.current[index];
    if (!v || !seg) return;
    playIdxRef.current = index;
    setSegGain(index); // volumen del clip
    const seekTo = seg.effIn + Math.max(0, localOffset);
    if (curSrcRef.current !== seg.sourcePath) {
      curSrcRef.current = seg.sourcePath;
      v.src = mediaUrl(seg.sourcePath);
      v.onloadeddata = () => {
        v.currentTime = seekTo;
        if (playingRef.current) v.play().catch(() => {});
      };
    } else {
      v.currentTime = seekTo;
      if (playingRef.current) v.play().catch(() => {});
    }
  }
  function frame() {
    const v = videoRef.current;
    if (!v || !playingRef.current) return;
    const seg = placedRef.current[playIdxRef.current];
    if (!seg) return pause();
    const local = v.currentTime;
    if (local >= seg.effOut - 0.03) {
      const next = playIdxRef.current + 1;
      if (next >= placedRef.current.length) {
        pause();
        return;
      }
      loadSegAndPlay(next, 0);
    } else {
      setT(seg.start + (local - seg.effIn));
    }
    rafRef.current = requestAnimationFrame(frame);
  }
  function play() {
    if (placed.length === 0) return;
    let startT = t;
    if (startT >= total - 0.05) startT = 0; // reinicia al final
    const at = segAt(startT);
    if (!at) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    playingRef.current = true;
    setPlaying(true);
    if (audioRef.current) {
      audioRef.current.currentTime = clamp(startT, 0, audioRef.current.duration || startT);
      audioRef.current.play().catch(() => {});
    }
    loadSegAndPlay(at.index, startT - at.seg.start);
    stopLoop();
    rafRef.current = requestAnimationFrame(frame);
  }
  function seekTo(time: number) {
    const clamped = clamp(time, 0, Math.max(0, total));
    setT(clamped);
    const at = segAt(clamped);
    if (!at) return;
    const v = videoRef.current;
    if (v) {
      const local = at.seg.effIn + (clamped - at.seg.start);
      if (curSrcRef.current !== at.seg.sourcePath) {
        curSrcRef.current = at.seg.sourcePath;
        v.src = mediaUrl(at.seg.sourcePath);
        v.onloadeddata = () => (v.currentTime = local);
      } else {
        v.currentTime = local;
      }
      playIdxRef.current = at.index;
    }
    if (audioRef.current) audioRef.current.currentTime = clamp(clamped, 0, audioRef.current.duration || clamped);
  }
  // Inicia el arrastre del cabezal (scrub). Pausa la reproducción si estaba activa.
  function startSeek(clientX: number) {
    if (playingRef.current) pause();
    dragRef.current = { type: "seek", startX: clientX };
    seekTo(laneX(clientX) / pps);
  }

  // ── Volumen por clip (WebAudio permite previsualizar hasta 200%) ───────
  function ensureAudioGraph() {
    if (webaudioTriedRef.current) return;
    webaudioTriedRef.current = true;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx || !videoRef.current) return;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(videoRef.current);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = gain;
    } catch {
      // Sin WebAudio: se usa element.volume (tope 100%).
    }
  }
  function gainFor(seg: Placed): number {
    if (audio.audioPath && audio.audioMode === "replace") return 0; // el audio de los clips se reemplaza
    const d = volDraftRef.current;
    const v = d && d.id === seg.id ? d.volume : seg.volume ?? 1;
    return clamp(v, 0, 2);
  }
  function setSegGain(index: number) {
    const seg = placedRef.current[index];
    if (!seg) return;
    const v = gainFor(seg);
    if (gainRef.current) gainRef.current.gain.value = v;
    else if (videoRef.current) videoRef.current.volume = clamp(v, 0, 1);
  }

  const selClip = selected ? timeline.find((s) => s.id === selected) ?? null : null;
  const curVol = volDraft && volDraft.id === selected ? volDraft.volume : selClip?.volume ?? 1;

  function onVolInput(pct: number) {
    if (!selected) return;
    const d = { id: selected, volume: clamp(pct / 100, 0, 2) };
    volDraftRef.current = d;
    setVolDraft(d);
    if (playingRef.current) setSegGain(playIdxRef.current);
  }
  async function applyVol(v: number) {
    if (!selected) return;
    const d = { id: selected, volume: clamp(v, 0, 2) };
    volDraftRef.current = d;
    setVolDraft(d);
    if (playingRef.current) setSegGain(playIdxRef.current);
    await api(`/api/projects/${projectId}/timeline/${selected}`, "PATCH", { volume: d.volume });
    volDraftRef.current = null;
    setVolDraft(null);
  }
  function commitVol() {
    if (selected && volDraft) applyVol(volDraft.volume);
  }
  function toggleMute() {
    if (!selected) return;
    if (curVol > 0) {
      prevVolRef.current = curVol;
      applyVol(0);
    } else {
      applyVol(prevVolRef.current > 0 ? prevVolRef.current : 1);
    }
  }
  async function applyAllVol() {
    if (!selected) return;
    const v = curVol;
    await api(`/api/projects/${projectId}/timeline/volume`, "POST", { volume: v });
    volDraftRef.current = null;
    setVolDraft(null);
  }

  // Audio: mute del vídeo en modo "replace"; volumen de la pista; refresca ganancia.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = !!audio.audioPath && audio.audioMode === "replace";
    const a = audioRef.current;
    if (a) a.volume = clamp(audio.audioVolume ?? 0.8, 0, 1);
    if (playingRef.current) setSegGain(playIdxRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  // volDraft → ref + ganancia en vivo si se está reproduciendo el clip afectado.
  useEffect(() => {
    volDraftRef.current = volDraft;
    if (playingRef.current) setSegGain(playIdxRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volDraft]);

  useEffect(
    () => () => {
      stopLoop();
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );
  // Si cambia la timeline (split/trim/reorder/borrar), detén la reproducción.
  useEffect(() => {
    pause();
    curSrcRef.current = "";
    seekTo(Math.min(t, total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.length]);

  // ── Mutaciones (API) ───────────────────────────────────────────────────
  async function api(url: string, method: string, body?: unknown) {
    onSnapshot(timeline); // guarda el estado ANTES del cambio (para deshacer)
    setBusy(true);
    onError(null);
    try {
      const res = await jsonFetch<{ timeline: TimelineClipDTO[] }>(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setTimeline(res.timeline);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function splitAtPlayhead() {
    const at = segAt(t);
    if (!at) return;
    const atSec = at.seg.effIn + (t - at.seg.start);
    api(`/api/projects/${projectId}/timeline/${at.seg.id}/split`, "POST", { atSec });
  }
  function deleteSelected() {
    if (!selected) return;
    api(`/api/projects/${projectId}/timeline/${selected}`, "DELETE");
    setSelected(null);
  }
  function commitReorder(fromIndex: number, toIndex: number) {
    if (toIndex === fromIndex || toIndex < 0) return;
    const ids = timeline.map((s) => s.id);
    const [m] = ids.splice(fromIndex, 1);
    ids.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, m);
    api(`/api/projects/${projectId}/timeline/reorder`, "POST", { ids });
  }
  function commitTrim(id: string, effIn: number, effOut: number) {
    api(`/api/projects/${projectId}/timeline/${id}`, "PATCH", { inSec: effIn, outSec: effOut });
  }
  // Mueve el segmento SELECCIONADO una posición (botones ◀ ▶).
  function moveSelected(dir: -1 | 1) {
    if (!selected) return;
    const idx = timeline.findIndex((s) => s.id === selected);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= timeline.length) return;
    const ids = timeline.map((s) => s.id);
    const [m] = ids.splice(idx, 1);
    ids.splice(to, 0, m);
    api(`/api/projects/${projectId}/timeline/reorder`, "POST", { ids });
  }

  // ── Interacción de puntero (trim / reorder / seek) ─────────────────────
  function laneX(clientX: number) {
    const rect = laneRef.current?.getBoundingClientRect();
    return rect ? clientX - rect.left : 0;
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (d.type === "trim") {
        const deltaSec = (e.clientX - d.startX) / pps;
        const tp =
          d.edge === "in"
            ? { id: d.id, effIn: clamp(d.origIn + deltaSec, 0, d.origOut - 0.2), effOut: d.origOut }
            : { id: d.id, effIn: d.origIn, effOut: clamp(d.origOut + deltaSec, d.origIn + 0.2, d.srcDur) };
        trimPreviewRef.current = tp;
        setTrimPreview(tp);
      } else if (d.type === "reorder") {
        setDragUI({ id: d.id, dx: e.clientX - d.startX }); // feedback visual del arrastre
        const x = laneX(e.clientX);
        const arr = placedRef.current;
        let idx = arr.length;
        for (let i = 0; i < arr.length; i++) {
          if (x < (arr[i].start + arr[i].dur / 2) * pps) { idx = i; break; }
        }
        dropIndexRef.current = idx;
        setDropIndex(idx);
      } else if (d.type === "seek") {
        seekTo(laneX(e.clientX) / pps);
      }
    }
    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setDragUI(null);
      if (!d) return;
      if (d.type === "trim") {
        const tp = trimPreviewRef.current;
        trimPreviewRef.current = null;
        setTrimPreview(null);
        if (tp && (Math.abs(tp.effIn - d.origIn) > 0.05 || Math.abs(tp.effOut - d.origOut) > 0.05)) {
          commitTrim(d.id, tp.effIn, tp.effOut);
        }
      } else if (d.type === "reorder") {
        const di = dropIndexRef.current;
        dropIndexRef.current = null;
        setDropIndex(null);
        if (di != null) commitReorder(d.index, di);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pps, timeline]);

  const laneW = Math.max(320, total * pps);
  const selIndex = selected ? timeline.findIndex((s) => s.id === selected) : -1;
  const ticks: number[] = [];
  const step = pps < 25 ? 10 : pps < 60 ? 5 : 2;
  for (let s = 0; s <= total + 0.01; s += step) ticks.push(s);

  return (
    <div className="space-y-3">
      {/* Reproductor de previsualización — alto FIJO para que no salte al
          cambiar de clip (el vídeo se ajusta dentro con object-contain). */}
      <div
        className="relative overflow-hidden rounded-md border border-border bg-black"
        style={{ height: "clamp(220px, 42vh, 460px)" }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="absolute inset-0 h-full w-full bg-black object-contain" playsInline />
        <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white/90">
          {fmt(t)} / {fmt(total)}
        </div>
      </div>
      {audio.audioPath && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio ref={audioRef} src={mediaUrl(audio.audioPath)} preload="auto" className="hidden" />
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => (playing ? pause() : play())} title={playing ? "Pausa" : "Reproducir"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={splitAtPlayhead} disabled={busy} title="Dividir en el cabezal">
          <Scissors className="h-4 w-4" /> Dividir
        </Button>
        <Button variant="outline" size="icon" onClick={deleteSelected} disabled={busy || !selected} title="Borrar segmento seleccionado">
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="outline" size="icon" onClick={() => moveSelected(-1)} disabled={busy || selIndex <= 0} title="Mover el clip a la izquierda">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => moveSelected(1)} disabled={busy || selIndex < 0 || selIndex >= placed.length - 1} title="Mover el clip a la derecha">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" onClick={() => setPps((p) => clamp(p / 1.4, 12, 160))} title="Alejar">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setPps((p) => clamp(p * 1.4, 12, 160))} title="Acercar">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="outline" size="sm" onClick={onUndo} disabled={undoCount === 0} title="Deshacer (Ctrl/⌘+Z)">
          <Undo2 className="h-4 w-4" /> Deshacer{undoCount > 0 ? ` (${undoCount})` : ""}
        </Button>
        {busy && <Spinner />}
        <span className="ml-auto text-xs text-muted">
          {placed.length} segmento(s) · {fmt(total)}
        </span>
      </div>

      {/* Volumen del clip seleccionado */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2">
        <span className="text-xs text-muted">
          Volumen{selClip ? ` · ${selClip.label || baseName(selClip.sourcePath)}` : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          disabled={!selected}
          title={curVol > 0 ? "Silenciar" : "Activar sonido"}
        >
          {curVol > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-danger" />}
        </Button>
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={Math.round(curVol * 100)}
          disabled={!selected}
          onChange={(e) => onVolInput(Number(e.target.value))}
          onMouseUp={commitVol}
          onTouchEnd={commitVol}
          onKeyUp={commitVol}
          className="w-40 sm:w-56"
        />
        <span className="w-12 text-right text-sm font-medium">{Math.round(curVol * 100)}%</span>
        <Button
          variant="outline"
          size="sm"
          onClick={applyAllVol}
          disabled={!selected}
          title="Aplicar este volumen a todos los clips"
        >
          <Copy className="h-4 w-4" /> Aplicar a todos
        </Button>
        {!selected && <span className="text-xs text-muted">Selecciona un clip para ajustar su volumen</span>}
      </div>

      {/* Pistas */}
      <div className="flex">
        <div className="w-11 shrink-0 select-none pt-[18px] text-[11px] text-muted">
          <div className="flex h-14 items-center">Vídeo</div>
          <div className="flex h-9 items-center">Audio</div>
        </div>
        <div className="flex-1 overflow-x-auto rounded-md border border-border bg-surface-0 p-1">
          <div ref={laneRef} className="relative" style={{ width: laneW }}>
            {/* Regla de tiempo (clic/arrastre = mover el cabezal) */}
            <div
              className="relative h-[18px] cursor-pointer select-none"
              onMouseDown={(e) => startSeek(e.clientX)}
            >
              {ticks.map((s) => (
                <span
                  key={s}
                  className="absolute top-0 font-mono text-[10px] text-muted"
                  style={{ left: s * pps }}
                >
                  <span className="absolute -left-px top-3 h-1 w-px bg-border" />
                  {fmt(s)}
                </span>
              ))}
            </div>

            {/* Pista de vídeo */}
            <div
              className="relative h-14"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) startSeek(e.clientX);
              }}
            >
              {placed.map((seg, i) => {
                const isSel = selected === seg.id;
                const dragging = dragUI?.id === seg.id;
                return (
                  <div
                    key={seg.id}
                    className={`absolute top-0 h-14 cursor-grab select-none overflow-hidden rounded-md border bg-surface-2 active:cursor-grabbing ${isSel ? "border-2 border-primary" : "border-border"}`}
                    style={{
                      left: seg.start * pps,
                      width: Math.max(8, seg.dur * pps),
                      transform: dragging ? `translateX(${dragUI!.dx}px)` : undefined,
                      opacity: dragging ? 0.75 : 1,
                      zIndex: dragging ? 30 : undefined,
                    }}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseDown={(e) => {
                      const edge = (e.target as HTMLElement).dataset.edge as "in" | "out" | undefined;
                      if (edge) {
                        dragRef.current = {
                          type: "trim",
                          id: seg.id,
                          edge,
                          startX: e.clientX,
                          origIn: seg.effIn,
                          origOut: seg.effOut,
                          srcDur: durations.get(seg.sourcePath) ?? seg.effOut,
                        };
                      } else {
                        // Clic = SELECCIONAR; arrastrar = MOVER/reordenar.
                        // El cabezal NO se mueve aquí (solo desde la regla/tirador).
                        setSelected(seg.id);
                        dragRef.current = { type: "reorder", id: seg.id, index: i, startX: e.clientX };
                      }
                    }}
                  >
                    {seg.keyframePath && (
                      <img
                        src={mediaUrl(seg.keyframePath)}
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
                      />
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/45 px-1 py-0.5 text-[10px] text-white">
                      {seg.label || baseName(seg.sourcePath)}
                    </span>
                    {(() => {
                      const bv = volDraft?.id === seg.id ? volDraft.volume : seg.volume;
                      if (bv === 0)
                        return (
                          <span className="pointer-events-none absolute right-1 top-1 flex items-center rounded bg-black/55 px-0.5 py-0.5 text-white">
                            <VolumeX className="h-3 w-3" />
                          </span>
                        );
                      if (Math.abs(bv - 1) > 0.001)
                        return (
                          <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] font-medium text-white">
                            {Math.round(bv * 100)}%
                          </span>
                        );
                      return null;
                    })()}
                    {/* Tiradores de recorte */}
                    <span data-edge="in" className="absolute left-0 top-0 h-full w-[7px] cursor-ew-resize bg-primary/70 hover:bg-primary" />
                    <span data-edge="out" className="absolute right-0 top-0 h-full w-[7px] cursor-ew-resize bg-primary/70 hover:bg-primary" />
                  </div>
                );
              })}
              {dropIndex != null && dragUI && (
                <span
                  className="pointer-events-none absolute top-0 z-40 h-14 w-1 -translate-x-1/2 rounded bg-accent"
                  style={{ left: (placed[dropIndex]?.start ?? total) * pps }}
                />
              )}
            </div>

            {/* Pista de audio */}
            <div className="relative mt-1 h-8">
              {audio.audioPath ? (
                <div className="absolute left-0 top-0 flex h-8 items-center gap-1 overflow-hidden rounded-md border border-accent/50 bg-accent/15 px-2" style={{ width: laneW }}>
                  <Music className="h-3 w-3 shrink-0 text-accent" />
                  <span className="truncate text-[10px] text-accent">{baseName(audio.audioPath)}</span>
                </div>
              ) : (
                <div className="flex h-8 items-center px-2 text-[10px] text-muted">Sin pista de audio</div>
              )}
            </div>

            {/* Cabezal (playhead) — arrastrable para posicionar/scrub */}
            <div className="absolute top-0 z-20" style={{ left: t * pps, height: 18 + 56 + 4 + 32 }}>
              <span className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2 bg-danger" />
              <button
                type="button"
                aria-label="Cabezal — arrastra para mover"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startSeek(e.clientX);
                }}
                className="absolute -left-2.5 -top-1 h-5 w-5 cursor-ew-resize border-0 bg-transparent p-0"
              >
                <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-danger" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted">
        Clic en un bloque para seleccionarlo · arrástralo (o usa ◀ ▶) para moverlo · arrastra sus bordes para recortar · el cabezal se mueve desde la regla o su tirador rojo · «Dividir» corta en el cabezal · Ctrl/⌘+Z deshace.
      </p>
    </div>
  );
}

// ── Panel de pista de audio (subir / modo / volumen) ────────────────────
function AudioPanel({
  projectId,
  audio,
  onAudio,
}: {
  projectId: string;
  audio: AudioSettingsDTO;
  onAudio: (a: AudioSettingsDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/audio`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al subir");
      onAudio(data.audio);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await jsonFetch<{ audio: AudioSettingsDTO }>(`/api/projects/${projectId}/audio`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onAudio(res.audio);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    const res = await jsonFetch<{ audio: AudioSettingsDTO }>(`/api/projects/${projectId}/audio`, {
      method: "DELETE",
    });
    onAudio(res.audio);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="h-4 w-4" /> Pista de audio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        {audio.audioPath ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">
                <Music className="mr-1 h-3 w-3" />
                {baseName(audio.audioPath)}
              </Badge>
              <Button variant="ghost" size="icon" title="Quitar audio" onClick={remove}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls className="w-full" src={mediaUrl(audio.audioPath)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Modo</Label>
                <Select value={audio.audioMode} onChange={(e) => patch({ audioMode: e.target.value })}>
                  <option value="mix">Mezclar (música de fondo sobre los clips)</option>
                  <option value="replace">Reemplazar todo el audio</option>
                </Select>
              </div>
              <div>
                <Label>Volumen: {Math.round(audio.audioVolume * 100)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={audio.audioVolume}
                  onChange={(e) => onAudio({ ...audio, audioVolume: Number(e.target.value) })}
                  onMouseUp={(e) => patch({ audioVolume: Number((e.target as HTMLInputElement).value) })}
                  onTouchEnd={(e) => patch({ audioVolume: Number((e.target as HTMLInputElement).value) })}
                  className="mt-3 w-full"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Spinner /> : <Upload className="h-4 w-4" />} Subir pista de audio
            </Button>
            <p className="text-xs text-muted">mp3, wav, m4a… Se aplica al film final.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Importación de clip por plano ───────────────────────────────────────
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
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
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
