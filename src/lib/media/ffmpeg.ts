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
};

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

/** Normaliza un clip a WxH/fps y garantiza pista de audio estéreo 48k. */
async function normalizeClip(
  input: string,
  output: string,
  target: { width: number; height: number; fps: number },
): Promise<void> {
  const info = await probe(input);
  const vf =
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
    `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${target.fps}`;

  const args: string[] = ["-y"];
  args.push("-i", input);
  if (!info.hasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  args.push("-map", "0:v:0");
  args.push("-map", info.hasAudio ? "0:a:0" : "1:a:0");
  args.push("-vf", vf);
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p");
  args.push("-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k");
  if (!info.hasAudio) args.push("-shortest");
  args.push(output);

  const { code, stderr } = await run(ffmpegBin(), args);
  if (code !== 0) {
    throw new Error(`ffmpeg normalize falló (${code}): ${stderr.slice(-400)}`);
  }
}

/**
 * Ensambla clips en un único .mp4. Normaliza cada clip a un formato canónico
 * y luego concatena con el demuxer concat (copia, sin recodificar de nuevo).
 */
export async function assembleFilm(
  clipPaths: string[],
  outputPath: string,
  aspectRatio: string,
  opts: AssembleOptions = {},
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No hay clips para ensamblar");

  const dims = dimsForAspect(aspectRatio);
  const target = {
    width: opts.width ?? dims.width,
    height: opts.height ?? dims.height,
    fps: opts.fps ?? 24,
  };

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aifilms-"));
  try {
    const normalized: string[] = [];
    for (let i = 0; i < clipPaths.length; i++) {
      const out = path.join(tmp, `n${String(i).padStart(3, "0")}.mp4`);
      await normalizeClip(clipPaths[i], out, target);
      normalized.push(out);
    }

    // Lista para el demuxer concat (rutas con forward slashes, escapadas).
    const listPath = path.join(tmp, "list.txt");
    const listBody = normalized
      .map((p) => `file '${p.split(path.sep).join("/").replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listPath, listBody, "utf8");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const { code, stderr } = await run(ffmpegBin(), [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg concat falló (${code}): ${stderr.slice(-400)}`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
