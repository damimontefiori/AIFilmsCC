// Audio (música/SFX vía Suno, voces vía ElevenLabs) — DIFERIDO.
// Solo se dejan las interfaces y stubs para integrarlos en una fase posterior.
// El ensamblado del film deja un slot de audio opcional que consume esto.

export type MusicRequest = {
  prompt: string;
  durationSec?: number;
  instrumental?: boolean;
};

export type VoiceRequest = {
  text: string;
  voiceId?: string;
  language?: string;
};

export type AudioResult = {
  path: string; // ruta relativa dentro de DATA_DIR
  provider: string;
};

export const AUDIO_DEFERRED = true;

export async function generateMusic(_req: MusicRequest): Promise<AudioResult> {
  throw new Error(
    "Generación de música (Suno) aún no implementada — fase posterior.",
  );
}

export async function generateVoice(_req: VoiceRequest): Promise<AudioResult> {
  throw new Error(
    "Generación de voces (ElevenLabs) aún no implementada — fase posterior.",
  );
}
