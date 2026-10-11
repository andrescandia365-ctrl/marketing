// Automatic lyric sync: OpenAI's transcription API hears the song and returns each word with its time; the
// pasted lyrics are then matched to it (shared/lyrics.ts). Same OPENAI_API_KEY as the images and the voice.
// whisper-1 is the model that returns word times. Guaraní is not one of its languages: it listens without a
// language hint, and hand sync is the fallback.
import type { HeardWord, LyricLanguage } from "../shared/lyrics.ts";

const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
// The API takes files up to 25 MB.
const MAX_BYTES = 25 * 1024 * 1024;
const HINTED: LyricLanguage[] = ["es", "ja", "ko", "en"];

export class LyricsError extends Error {}

export function autoSyncAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function hearSong(
  audio: Blob,
  name: string,
  language: LyricLanguage,
  lyrics: string,
  // "voice": an explainer scene's voice, heard for its subtitles' word times (the messages say so).
  what: "song" | "voice" = "song",
): Promise<{ words: HeardWord[]; duration: number }> {
  const song = what === "song";
  if (!autoSyncAvailable()) throw new LyricsError(song ? "Para sincronizar automático falta OPENAI_API_KEY en .env." : "Para escuchar las palabras de la voz falta OPENAI_API_KEY en .env.");
  if (audio.size > MAX_BYTES) {
    throw new LyricsError(song ? "La canción pesa más de 25 MB. Pasala a mp3 o sincronizá tocando." : "La voz pesa más de 25 MB. Pasala a mp3.");
  }
  const form = new FormData();
  form.append("file", audio, name || "cancion.mp3");
  form.append("model", MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (HINTED.includes(language)) form.append("language", language);
  // The start of the lyrics helps it spell what it hears (the prompt is short, so only the start fits).
  form.append("prompt", lyrics.slice(0, 600));

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (error) {
    throw new LyricsError(`No se pudo conectar con OpenAI: ${(error as Error).message}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new LyricsError(`No se pudo escuchar ${song ? "la canción" : "la voz"} (${res.status}): ${body.error?.message ?? res.statusText}`);
  }
  const data = (await res.json()) as { words?: HeardWord[]; duration?: number };
  if (!data.words?.length) {
    throw new LyricsError(song ? "La transcripción no devolvió palabras con tiempo. Probá sincronizar tocando." : "La transcripción no devolvió palabras con tiempo: los subtítulos siguen con tiempos estimados.");
  }
  return { words: data.words, duration: data.duration ?? 0 };
}
