// The §3 script template: 75 seconds, five sections, each tied to a Negative / Touching / Good beat.
import type { Section, Shot } from "./schema.ts";

export const TEMPLATE: Record<Section, { start: number; end: number; beat: "negative" | "touching" | "good"; label: string }> = {
  hook: { start: 0, end: 5, beat: "negative", label: "Hook" },
  agitate: { start: 5, end: 25, beat: "negative", label: "Agitate" },
  turn: { start: 25, end: 40, beat: "touching", label: "Turn" },
  resolve: { start: 40, end: 65, beat: "good", label: "Resolve" },
  button: { start: 65, end: 75, beat: "good", label: "Button" },
};

export const TOTAL_SECONDS = 75;

export type TimedShot = Shot & { index: number; start: number; end: number };

// A section's time is split evenly among its shots, so three agitate shots get about 6.7 s each.
export function timeShots(shots: Shot[]): TimedShot[] {
  const timed: TimedShot[] = [];
  for (const [section, slot] of Object.entries(TEMPLATE) as [Section, (typeof TEMPLATE)[Section]][]) {
    const inSection = shots.map((s, index) => ({ s, index })).filter(({ s }) => s.section === section);
    const step = (slot.end - slot.start) / Math.max(inSection.length, 1);
    inSection.forEach(({ s, index }, i) => {
      timed.push({ ...s, index, start: slot.start + i * step, end: slot.start + (i + 1) * step });
    });
  }
  return timed.sort((a, b) => a.start - b.start);
}

export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
