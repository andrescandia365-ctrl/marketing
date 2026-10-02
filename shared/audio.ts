// How each line is heard, and the piece's music. Saved with the project.
import type { Shot } from "./schema.ts";

// subtitles: only the subtitle. grok: the clip carries the voice (Grok says the line). generated: a synthetic voice
// made by the app. recorded: the person's own voice, recorded in the app or uploaded.
export const VOICE_MODES = ["subtitles", "grok", "generated", "recorded"] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];
export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  subtitles: "Solo subtítulos",
  grok: "La dice Grok",
  generated: "Voz generada",
  recorded: "Grabada o subida",
};

export type CharacterVoice = {
  // The default for this character's lines; a shot can override it.
  mode: VoiceMode;
  // The name of the voice in Grok's Audio panel.
  grokVoice: string;
  // The generated voice's name (OpenAI voices).
  ttsVoice: string;
};

export type AudioSettings = {
  characters: Record<string, CharacterVoice>;
  // Per-shot override of the speaker's mode, by shot index.
  shots: Record<number, VoiceMode>;
  musicVolume: number;
  sfxVolume: number;
  // Move each cut to the nearest beat of the music.
  beatSync: boolean;
};

export const DEFAULT_AUDIO: AudioSettings = { characters: {}, shots: {}, musicVolume: 0.35, sfxVolume: 0.8, beatSync: false };

export function voiceModeOf(audio: AudioSettings, shot: Shot, index: number): VoiceMode {
  if (!shot.voiceover.trim()) return "subtitles";
  return audio.shots[index] ?? audio.characters[shot.speaker]?.mode ?? "subtitles";
}

// The shot's video prompt with the line spoken on screen, for when Grok says it. The app normally asks for
// silent clips, so the "no speech" part is taken out.
export function speakingPrompt(videoPrompt: string, name: string, line: string, voice: string, language: "es" | "en"): string {
  const base = videoPrompt
    .replace(/,?\s*no (?:speech|dialogue|talking|voices?)\b/gi, "")
    .replace(/,?\s*nobody speaks\b/gi, "")
    .replace(/\s+\./g, ".")
    .trim();
  const tongue = language === "es" ? "Rioplatense Spanish (Buenos Aires accent)" : "English";
  return `${base} ${name} says, in ${tongue}, lips in sync${voice ? `, with the voice ${voice}` : ""}: "${line.trim()}"`;
}
