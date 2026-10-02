// Timing and labels for the three beats. Shots carry their own length, so a short and an
// 8-minute episode use the same timeline code.
import type { Beat, Role, Shot } from "./schema.ts";

export const BEAT_INFO: Record<Beat, { label: string }> = {
  negative: { label: "Negativo" },
  touching: { label: "Emotivo" },
  good: { label: "Bueno" },
};

export const ROLE_LABEL: Record<Role, string> = {
  good: "El Bueno",
  bad: "El Malo",
  human: "Persona",
  narrator: "Narrador",
};

export const LENGTHS = {
  short: { label: "Corto · 60–90 s", min: 60, max: 90 },
  episode: { label: "Episodio · 5–8 min", min: 300, max: 480 },
} as const;

export type TimedShot = Shot & { index: number; start: number; end: number };

export function timeShots(shots: Shot[]): TimedShot[] {
  let t = 0;
  return shots.map((s, index) => {
    const start = t;
    t += s.seconds;
    return { ...s, index, start, end: t };
  });
}

export function totalSeconds(shots: Shot[]): number {
  return shots.reduce((n, s) => n + s.seconds, 0);
}

export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Rough spoken length of a line in Rioplatense Spanish (about 2.5 words per second).
export function spokenSeconds(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length / 2.5;
}
