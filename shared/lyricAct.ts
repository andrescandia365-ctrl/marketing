// "La letra actúa el canto": in a lyric video a word that is held long stretches while it is sung and settles after,
// and a word sung loud shakes a little. Both are measured once per word and saved with the piece:
// - how long: the word's own times, trusted only when the automatic sync really heard it (`heard`, alignLyrics);
//   tapped or .lrc lines spread their words by letter count, so they never stretch.
// - how loud: the RMS of the vocal stem over the word's span (`level`, dBFS), from Demucs's vocals or a vocal stem the
//   person uploads. Never the master: with no vocal stem a word has no level and only the stretch applies.
// Thresholds are relative to the song (its loudest tenth of words, clearly above its median). The deformation is a pure
// function of t, so the preview and the render draw the same, and it is capped so the word always reads.
import type { LyricLine, LyricWord } from "./lyrics.ts";

// A word held at least this long stretches; at HELD_FULL it gets the whole stretch.
export const HELD_MIN = 0.6;
export const HELD_FULL = 1.6;
// Horizontal scale at the peak of the longest word: 1 + STRETCH_MAX. A held word gets at least STRETCH_FLOOR of it.
export const STRETCH_MAX = 0.2;
const STRETCH_FLOOR = 0.3;
// Seconds a stretched word takes to settle back after it ends (ease out, no overshoot).
export const SETTLE = 0.35;
// Shouted: among the loudest LOUD_SHARE of the song's measured words, and at least LOUD_ABOVE dB over its median.
export const LOUD_SHARE = 0.1;
export const LOUD_ABOVE = 3;
// Fewer measured words than this say nothing about the song's dynamics.
export const LOUD_MIN_WORDS = 8;
// The shake's largest offset, in units of the word's font size; a calm piece shakes half as much.
export const SHAKE_MAX = 0.035;
// How fast the shake starts and how long it rings after the word.
const SHAKE_ATTACK = 0.05;
const SHAKE_RING = 0.25;
// Below this a span is silence (and an empty stem gives no level).
const FLOOR_DB = -80;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp(x);
  return u * u * (3 - 2 * u);
};

// RMS in dBFS of each span of a mono signal, rounded to 0.1 dB. null when the span is outside the signal, empty or
// silent. `pcm` is the vocal stem, never the master.
export function wordLevels(pcm: { samples: Float32Array; sampleRate: number }, spans: { start: number; end: number }[]): (number | null)[] {
  const { samples, sampleRate } = pcm;
  return spans.map(({ start, end }) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const a = Math.max(0, Math.floor(start * sampleRate));
    const b = Math.min(samples.length, Math.ceil(end * sampleRate));
    if (b - a < 16) return null;
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / (b - a));
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    return db > FLOOR_DB ? Math.round(db * 10) / 10 : null;
  });
}

// Mono mix of several channels (a decoded stem), for wordLevels.
export function monoOf(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += (ch[i] ?? 0) / channels.length;
  return out;
}

// Every word's span, line by line, in the order withLevels expects.
export function wordSpans(lines: LyricLine[]): { start: number; end: number }[] {
  return lines.flatMap((l) => l.words.map((w) => ({ start: w.start, end: w.end })));
}

// The lines with each word's level (same order as wordSpans). A word without one loses an old level.
export function withLevels(lines: LyricLine[], levels: (number | null)[]): LyricLine[] {
  let k = 0;
  return lines.map((l) => ({
    ...l,
    words: l.words.map((w) => {
      const level = levels[k++];
      const { level: _old, ...rest } = w;
      return typeof level === "number" ? { ...rest, level } : rest;
    }),
  }));
}

// The lines with levels measured on `spans`, or null when the words' spans changed since (an edit made while the
// voice was being measured): the levels would land on other words, and writing them back would undo the edit.
export function levelsFor(lines: LyricLine[], spans: { start: number; end: number }[], levels: (number | null)[]): LyricLine[] | null {
  const now = wordSpans(lines);
  const same = now.length === spans.length && now.every((w, i) => w.start === spans[i].start && w.end === spans[i].end);
  return same ? withLevels(lines, levels) : null;
}

// How many words carry a level: the studio says whether the voice was measured.
export function measuredWords(lines: LyricLine[]): number {
  return lines.reduce((n, l) => n + l.words.filter((w) => typeof w.level === "number").length, 0);
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// The song's loudness line: words at or above `cut` shout, and `full` dB above it they shout fully. null when the
// song has too few measured words, or is so even that its loudest tenth is not clearly louder than its middle.
export function loudCut(lines: LyricLine[]): { cut: number; median: number } | null {
  const levels = lines
    .flatMap((l) => l.words.map((w) => w.level))
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (levels.length < LOUD_MIN_WORDS) return null;
  const median = quantile(levels, 0.5);
  const top = quantile(levels, 1 - LOUD_SHARE);
  const cut = Math.max(top, median + LOUD_ABOVE);
  // Nothing reaches the line: no word shouts.
  if (levels[levels.length - 1] < cut) return null;
  return { cut, median };
}

// What a word does: `peak` is its horizontal scale at the end of the word (1 = no stretch), `shout` 0..1.
export type WordAct = { peak: number; shout: number };
export const STILL: WordAct = { peak: 1, shout: 0 };

// Whether a word's times were heard (auto sync). Older auto-synced pieces saved no `heard`: their words count.
export function timedByEar(word: LyricWord, synced: string): boolean {
  return synced === "auto" && word.heard !== false;
}

export function wordAct(word: LyricWord, synced: string, loud: { cut: number } | null): WordAct {
  const d = word.end - word.start;
  let peak = 1;
  if (timedByEar(word, synced) && d >= HELD_MIN) {
    const a = clamp((d - HELD_MIN) / (HELD_FULL - HELD_MIN));
    peak = 1 + STRETCH_MAX * (STRETCH_FLOOR + (1 - STRETCH_FLOOR) * a);
  }
  let shout = 0;
  if (loud && typeof word.level === "number" && word.level >= loud.cut) {
    // 0.5 right on the line, the whole shake 6 dB over it.
    shout = 0.5 + 0.5 * clamp((word.level - loud.cut) / 6);
  }
  return { peak, shout };
}

// Every word's act, line by line (computed once per piece, not per frame).
export function pieceActs(lines: LyricLine[], synced: string): WordAct[][] {
  const loud = loudCut(lines);
  return lines.map((l) => l.words.map((w) => wordAct(w, synced, loud)));
}

// Horizontal scale at t: grows while the word is sung, peaks at its end, settles in SETTLE. Never above `peak`.
export function stretchAt(act: WordAct, word: { start: number; end: number }, t: number): number {
  if (act.peak <= 1 || t <= word.start) return 1;
  const d = Math.max(0.05, word.end - word.start);
  if (t <= word.end) return 1 + (act.peak - 1) * smooth((t - word.start) / d);
  const back = clamp((t - word.end) / SETTLE);
  return 1 + (act.peak - 1) * (1 - back) ** 3;
}

// The shake's offset at t in units of the font size: fast in, held while sung, ringing out after. Deterministic
// (sines with phases from the word's start time), so a frame is a pure function of t.
export function shakeAt(act: WordAct, word: { start: number; end: number }, t: number, calm: boolean): { dx: number; dy: number } {
  if (act.shout <= 0 || t < word.start || t > word.end + SHAKE_RING) return { dx: 0, dy: 0 };
  const env = t <= word.end ? clamp((t - word.start) / SHAKE_ATTACK) : 1 - clamp((t - word.end) / SHAKE_RING);
  const amp = SHAKE_MAX * act.shout * env * (calm ? 0.5 : 1);
  const seed = word.start * 7.31;
  const dx = 0.6 * Math.sin(t * 71 + seed) + 0.4 * Math.sin(t * 113 + seed * 1.7);
  const dy = 0.6 * Math.sin(t * 83 + seed * 2.3) + 0.4 * Math.sin(t * 59 + seed * 0.9);
  return { dx: amp * dx, dy: amp * dy };
}

// The studio's plain line on what the switch does with what the piece has.
export function actNote(lines: LyricLine[], synced: string): string {
  const held = synced === "auto";
  const loud = measuredWords(lines) >= LOUD_MIN_WORDS;
  if (held && loud) return "Las notas largas estiran su palabra mientras se cantan y los gritos la sacuden un poco (medido en la voz sola).";
  if (held) return "Las notas largas estiran su palabra mientras se cantan. Para que los gritos la sacudan, medí la fuerza del canto en la voz sola.";
  if (loud) return "Los gritos sacuden su palabra. Las notas largas se estiran solo con la sincronización automática (con el toque o el .lrc no se sabe cuánto dura cada palabra).";
  return "Las notas largas se estiran solo con la sincronización automática, y los gritos se miden en la voz sola (Demucs o un stem que subas).";
}
