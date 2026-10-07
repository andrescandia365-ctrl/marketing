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
  // Per shot, by index: what is heard inside Grok's clip (written into the video prompt's "Audio:" line) and how loud
  // the clip's own sound plays in the video. Missing (older pieces): the defaults below.
  clipSound?: Record<number, ClipSound>;
  clipLevel?: Record<number, ClipLevel>;
};

export const DEFAULT_AUDIO: AudioSettings = { characters: {}, shots: {}, musicVolume: 0.35, sfxVolume: 0.8, beatSync: false, clipSound: {}, clipLevel: {} };

// ── Grok's clip sound ──────────────────────────────────────────────────────────
// Grok's clips can carry speech and sound. Per shot the person says what is heard inside the clip (the line, the room,
// the effects, or nothing) and how loud the clip plays under the voices and the music. Music is never asked for: a
// track goes on top, with its licence.
export const CLIP_HEARS = ["dialogue", "ambient", "effects"] as const;
export type ClipHear = (typeof CLIP_HEARS)[number];
export const CLIP_HEAR_LABEL: Record<ClipHear, string> = { dialogue: "Diálogo", ambient: "Ambiente", effects: "Efectos" };
export type ClipSound = { hear: ClipHear[]; detail: string };
export const CLIP_LEVELS = ["full", "low", "mute"] as const;
export type ClipLevel = (typeof CLIP_LEVELS)[number];
export const CLIP_LEVEL_LABEL: Record<ClipLevel, string> = { full: "Entero", low: "Bajo", mute: "Mudo" };
export const CLIP_LEVEL_GAIN: Record<ClipLevel, number> = { full: 1, low: 0.3, mute: 0 };

// Default: the room is always heard; the line too when Grok says it.
export function clipSoundOf(audio: AudioSettings, shot: Shot, index: number): ClipSound {
  const set = audio.clipSound?.[index];
  if (set) return set;
  return { hear: voiceModeOf(audio, shot, index) === "grok" ? ["dialogue", "ambient"] : ["ambient"], detail: "" };
}

// Default: the whole clip sound, unless another voice is laid on top (then it is ducked anyway in the mix).
export function clipLevelOf(audio: AudioSettings, index: number): ClipLevel {
  return audio.clipLevel?.[index] ?? "full";
}

// The "Audio: …" line the video prompt ends with, from what the person chose.
export function audioLine(sound: ClipSound): string {
  const parts: string[] = [];
  const detail = sound.detail.trim().replace(/\.+$/, "");
  if (sound.hear.includes("dialogue")) parts.push("the spoken line, clear and in sync with the lips");
  else parts.push("no speech, nobody talks");
  if (sound.hear.includes("ambient")) parts.push("natural room tone of the place");
  if (sound.hear.includes("effects")) parts.push(detail ? `the sounds of the action: ${detail}` : "the sounds of the action");
  else if (detail && sound.hear.includes("ambient")) parts.push(detail);
  if (!sound.hear.includes("ambient") && !sound.hear.includes("effects") && !sound.hear.includes("dialogue")) return "Audio: complete silence, no music, no voices.";
  return `Audio: ${parts.join("; ")}; no music.`;
}

// The video prompt the person copies: with the shot's own choice of sound when they made one; untouched otherwise
// (the writer's "Audio:" line is usually the most specific).
export function clipPrompt(audio: AudioSettings, shot: Shot, index: number): string {
  const set = audio.clipSound?.[index];
  return set ? withAudioLine(shot.videoPrompt, set, Boolean(shot.timeline?.length)) : shot.videoPrompt;
}

// The video prompt with its "Audio:" line replaced by the person's choice (added when the writer left none). A
// continuous take's director's prompt keeps its own sound rules; only the detail is added.
export function withAudioLine(videoPrompt: string, sound: ClipSound, continuous = false): string {
  const prompt = videoPrompt.trim();
  if (!prompt) return prompt;
  if (continuous) return sound.detail.trim() ? `${prompt} Also heard: ${sound.detail.trim().replace(/\.+$/, "")}.` : prompt;
  const at = prompt.search(/\bAudio:/i);
  const base = (at >= 0 ? prompt.slice(0, at) : prompt).trim();
  return `${base}${base && !/[.!?]$/.test(base) ? "." : ""} ${audioLine(sound)}`.trim();
}

export function voiceModeOf(audio: AudioSettings, shot: Shot, index: number): VoiceMode {
  if (!shot.voiceover.trim()) return "subtitles";
  // A continuous take is spoken inside the clip: its director's prompt scripts the dialogue.
  if (shot.timeline?.length) return audio.shots[index] ?? "grok";
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
