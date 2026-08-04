import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ffmpegBin, ffprobeBin } from "@/lib/config";

type RunResult = { code: number; stdout: string; stderr: string };

function run(bin: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export type BinaryStatus = { available: boolean; version?: string; error?: string };

export async function checkBinaries(): Promise<{
  ffmpeg: BinaryStatus;
  ffprobe: BinaryStatus;
}> {
  async function check(bin: string): Promise<BinaryStatus> {
    try {
      const { code, stdout } = await run(bin, ["-version"]);
      if (code !== 0) return { available: false, error: `exit ${code}` };
      const version = stdout.split("\n")[0]?.trim();
      return { available: true, version };
    } catch (err) {
      return { available: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ffmpeg: await check(ffmpegBin()), ffprobe: await check(ffprobeBin()) };
}

export type ProbeResult = {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
};

export async function probe(filePath: string): Promise<ProbeResult> {
  const { code, stdout, stderr } = await run(ffprobeBin(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  if (code !== 0) {
    throw new Error(`ffprobe falló (${code}): ${stderr.slice(0, 300)}`);
  }
  const json = JSON.parse(stdout) as {
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      codec_name?: string;
    }[];
    format?: { duration?: string };
  };
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  let fps = 24;
  if (video?.r_frame_rate) {
    const [n, d] = video.r_frame_rate.split("/").map(Number);
    if (n && d) fps = Math.round((n / d) * 1000) / 1000;
  }
  return {
    durationSec: Number(json.format?.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps,
    hasAudio,
    codec: video?.codec_name ?? "",
  };
}

export type AssembleOptions = {
  width?: number;
  height?: number;
  fps?: number;
  audio?: AudioTrack;
};

/** Un segmento de la línea de tiempo: clip de origen (ruta ABSOLUTA) + recortes + volumen (0..2). */
export type Segment = { path: string; inSec?: number | null; outSec?: number | null; volume?: number | null };

/** Pista de audio del film final (ruta ABSOLUTA). */
export type AudioTrack = { path: string; mode: "mix" | "replace"; volume: number };

function dimsForAspect(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
    default:
      return { width: 1280, height: 720 };
  }
}

/**
 * Normaliza un segmento a WxH/fps, aplica el recorte in/out (si hay) y garantiza
 * pista de audio estéreo 48k. El recorte usa seeking de entrada (`-ss`) + `-t`.
 */
async function normalizeClip(
  seg: Segment,
  output: string,
  target: { width: number; height: number; fps: number },
): Promise<void> {
  const info = await probe(seg.path);
  const inSec = seg.inSec ?? null;
  const outSec = seg.outSec ?? null;
  const dur = outSec != null ? outSec - (inSec ?? 0) : null;
  const vf =
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
    `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${target.fps}`;

  const args: string[] = ["-y"];
  if (inSec != null && inSec > 0) args.push("-ss", String(inSec)); // seek de entrada
  args.push("-i", seg.path);
  if (!info.hasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  args.push("-map", "0:v:0");
  args.push("-map", info.hasAudio ? "0:a:0" : "1:a:0");
  args.push("-vf", vf);
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p");
  args.push("-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k");
  // Volumen del clip (0..2 = 0..200%). Solo si difiere del 100%.
  const vol = seg.volume;
  if (vol != null && Number.isFinite(vol) && Math.abs(vol - 1) > 0.001) {
    args.push("-af", `volume=${Math.min(2, Math.max(0, vol)).toFixed(3)}`);
  }
  if (dur != null && dur > 0) args.push("-t", String(dur));
  else if (!info.hasAudio) args.push("-shortest");
  args.push(output);

  const { code, stderr } = await run(ffmpegBin(), args);
  if (code !== 0) {
    throw new Error(`ffmpeg normalize falló (${code}): ${stderr.slice(-400)}`);
  }
}

/**
 * Añade la pista de audio al vídeo concatenado. `mix` mezcla la pista sobre el
 * audio de los clips (con volumen); `replace` sustituye todo el audio. En ambos
 * casos el resultado dura lo que el vídeo (se rellena/silencia o se corta).
 */
async function applyAudio(videoIn: string, audio: AudioTrack, output: string): Promise<void> {
  const vol = Number.isFinite(audio.volume) ? Math.max(0, audio.volume) : 0.8;
  const filter =
    audio.mode === "replace"
      ? `[1:a]volume=${vol},apad[a]`
      : `[1:a]volume=${vol}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`;
  const { code, stderr } = await run(ffmpegBin(), [
    "-y",
    "-i", videoIn,
    "-i", audio.path,
    "-filter_complex", filter,
    "-map", "0:v:0",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    output,
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg audio falló (${code}): ${stderr.slice(-400)}`);
  }
}

/**
 * Ensambla segmentos en un único .mp4. Normaliza cada segmento (con su recorte)
 * a un formato canónico, concatena con el demuxer concat (copia) y, si hay pista
 * de audio, aplica una pasada final de mezcla/reemplazo.
 */
export async function assembleFilm(
  segments: Segment[],
  outputPath: string,
  aspectRatio: string,
  opts: AssembleOptions = {},
): Promise<void> {
  if (segments.length === 0) throw new Error("No hay clips para ensamblar");

  const dims = dimsForAspect(aspectRatio);
  const target = {
    width: opts.width ?? dims.width,
    height: opts.height ?? dims.height,
    fps: opts.fps ?? 24,
  };

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aifilms-"));
  try {
    const normalized: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const out = path.join(tmp, `n${String(i).padStart(3, "0")}.mp4`);
      await normalizeClip(segments[i], out, target);
      normalized.push(out);
    }

    // Lista para el demuxer concat (rutas con forward slashes, escapadas).
    const listPath = path.join(tmp, "list.txt");
    const listBody = normalized
      .map((p) => `file '${p.split(path.sep).join("/").replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listPath, listBody, "utf8");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // Si hay audio, concatena a un temporal y luego aplica la pista; si no, directo.
    const concatOut = opts.audio ? path.join(tmp, "concat.mp4") : outputPath;
    const { code, stderr } = await run(ffmpegBin(), [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      concatOut,
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg concat falló (${code}): ${stderr.slice(-400)}`);
    }

    if (opts.audio) {
      await applyAudio(concatOut, opts.audio, outputPath);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
