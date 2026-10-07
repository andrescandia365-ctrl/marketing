// Two clocks for a lyric / motion piece. Cuts, clicks and body accents sit on the kick, measured on the
// drums stem only (low-pass ~150 Hz, hat onsets dropped). Words sit on the vocal stem and are never snapped
// to the beat. There is no third clock: dance is written onto the kick, not read off the master or a pose.
import { splitWords, type HeardWord } from "./lyrics.ts";

export class ClockError extends Error {}

export const LOWPASS_HZ = 150;
export const HAT_HZ = 5000;
const SILENCE_GAP = 0.35;
const DRIFT_LIMIT = 0.01;
const MIN_KICKS = 4;

export type Pcm = { samples: Float32Array; sampleRate: number };

export type GridSection = {
  t0: number;
  t1: number;
  grid0: number;
  period: number;
  bpm: number;
};

export type KickGrid = {
  bpm: number;
  grid0: number;
  period: number;
  fps: number;
  tolerances: {
    hitFrames: number;
    hitMs: number;
    audioCueMs: number;
    kickFitMs: number;
    offsetReportMs: number;
  };
  downbeats: number[];
  kicks: number[];
  kicksWithinHalfMs: number;
  medianErrorMs: number;
  sections: GridSection[];
  usable: boolean;
  drift: number;
};

export type SyncWord = { t: number | null; t_out: number | null; text: string; section: string };

export type SyncMove = {
  t: number;
  kick_t: number;
  offset_ms: number;
  move: string;
  on: "downbeat" | "kick";
  proposed?: true;
};

export type SyncDoc = {
  grid: KickGrid;
  words: SyncWord[];
  moves: SyncMove[];
  lyric_gate: string;
  lyric_gate_ok: boolean;
  unaligned: string[];
  engines: { beats: string; words: string };
};

export type Spring = { omega: number; zeta: number };
// Small overshoot on UI. Large type stays at zeta 1, so it never goes past the target.
export const UI_SPRING: Spring = { omega: 14, zeta: 0.7 };
export const TYPE_SPRING: Spring = { omega: 11, zeta: 1 };

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function positiveMod(x: number, m: number): number {
  const r = x % m;
  return r < 0 ? r + m : r;
}

function diffs(times: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]);
  return out;
}

// Closed form. At t0 the value is `from`. zeta >= 1 is the critical spring (no overshoot).
export function spring(from: number, to: number, t0: number, t: number, spec: Spring): number {
  const dt = t - t0;
  if (dt <= 0) return from;
  const gap = from - to;
  if (spec.zeta >= 1) {
    const e = Math.exp(-spec.omega * dt);
    return to + gap * e * (1 + spec.omega * dt);
  }
  const zeta = Math.min(0.99, spec.zeta);
  const wd = spec.omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * spec.omega * dt);
  return to + gap * e * (Math.cos(wd * dt) + ((zeta * spec.omega) / wd) * Math.sin(wd * dt));
}

type Coeff = { b0: number; b1: number; b2: number; a1: number; a2: number };

function biquad(kind: "lowpass" | "highpass", freq: number, sampleRate: number): Coeff {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * 0.707);
  const b0 = kind === "lowpass" ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = kind === "lowpass" ? 1 - cos : -(1 + cos);
  const b2 = b0;
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function applyBiquad(x: Float32Array, c: Coeff): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = c.b0 * xn + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
    y[i] = yn;
  }
  return y;
}

function movingMeanAbs(x: Float32Array, win: number): Float32Array {
  const y = new Float32Array(x.length);
  const prefix = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) prefix[i + 1] = prefix[i] + Math.abs(x[i]);
  const half = Math.max(1, win >> 1);
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(x.length, i + half);
    y[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return y;
}

function normalize(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-8) throw new ClockError("El stem de batería está en silencio.");
  const y = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) y[i] = samples[i] / peak;
  return y;
}

// Onsets on the low band only. A hat (energy up high, almost nothing under 150 Hz) never becomes a kick.
export function detectKicks(pcm: Pcm): number[] {
  const sr = pcm.sampleRate;
  if (sr < 8000) throw new ClockError("El stem tiene una frecuencia de muestreo demasiado baja.");
  const src = normalize(pcm.samples);
  const low = applyBiquad(applyBiquad(src, biquad("lowpass", LOWPASS_HZ, sr)), biquad("lowpass", LOWPASS_HZ, sr));
  const high = applyBiquad(applyBiquad(src, biquad("highpass", HAT_HZ, sr)), biquad("highpass", HAT_HZ, sr));
  const env = movingMeanAbs(low, Math.max(1, Math.round(0.008 * sr)));
  const highEnv = movingMeanAbs(high, Math.max(1, Math.round(0.004 * sr)));
  let maxLow = 0;
  for (let i = 0; i < env.length; i++) maxLow = Math.max(maxLow, env[i]);
  const hop = Math.max(1, Math.round(0.001 * sr));
  const hops: number[] = [];
  for (let i = 0; i < env.length; i += hop) {
    let peak = 0;
    const end = Math.min(env.length, i + hop);
    for (let j = i; j < end; j++) peak = Math.max(peak, env[j]);
    hops.push(peak);
  }
  let maxNov = 0;
  const novelty = new Float64Array(hops.length);
  for (let i = 1; i < hops.length; i++) {
    novelty[i] = Math.max(0, hops[i] - hops[i - 1]);
    maxNov = Math.max(maxNov, novelty[i]);
  }
  const thresh = maxNov * 0.22;
  const minGap = Math.round(0.18 / (hop / sr));
  const rough: number[] = [];
  let last = -minGap;
  for (let i = 1; i < hops.length - 1; i++) {
    if (i - last < minGap) continue;
    if (novelty[i] < thresh || novelty[i] < novelty[i - 1] || novelty[i] < novelty[i + 1]) continue;
    const centre = i * hop;
    let peak = 0;
    let peakAt = centre;
    const a = Math.max(0, centre - Math.round(0.03 * sr));
    const b = Math.min(env.length - 1, centre + Math.round(0.02 * sr));
    for (let j = a; j <= b; j++) {
      if (env[j] > peak) {
        peak = env[j];
        peakAt = j;
      }
    }
    if (peak < maxLow * 0.08) continue;
    const level = peak * 0.3;
    let onset = peakAt;
    for (let j = peakAt; j > a; j--) {
      if (env[j] <= level) {
        onset = j;
        break;
      }
    }
    let lowSum = 0;
    let highSum = 0;
    const hs = Math.max(0, onset - Math.round(0.005 * sr));
    const he = Math.min(env.length, onset + Math.round(0.02 * sr));
    for (let j = hs; j < he; j++) {
      lowSum += env[j];
      highSum += highEnv[j];
    }
    // Agudos altos, graves bajos: es un hat, no un kick.
    if (highSum > lowSum * 1.15 && lowSum < maxLow * (he - hs) * 0.35) continue;
    const t = onset / sr;
    if (t < 0.02) continue;
    rough.push(t);
    last = i;
  }
  return rough;
}

function fitSection(kicks: number[]): { grid0: number; period: number; bpm: number; errors: number[] } {
  const period = median(diffs(kicks));
  if (!(period > 0.15 && period < 2)) throw new ClockError("El periodo de los kicks no parece un tempo.");
  let bestG = positiveMod(kicks[0], period);
  let bestMed = Infinity;
  let bestErr: number[] = [];
  for (const candidate of kicks) {
    const g = positiveMod(candidate, period);
    const errors = kicks.map((t) => t - (g + Math.round((t - g) / period) * period));
    const med = median(errors.map(Math.abs));
    if (med < bestMed) {
      bestMed = med;
      bestG = g;
      bestErr = errors;
    }
  }
  const grid0 = positiveMod(bestG + median(bestErr), period);
  const errors = kicks.map((t) => t - (grid0 + Math.round((t - grid0) / period) * period));
  return { grid0, period, bpm: 60 / period, errors };
}

function splitKicks(kicks: number[]): number[][] {
  const minK = 8;
  if (kicks.length < minK * 2) return [kicks];
  const parts: number[][] = [];
  let start = 0;
  while (start < kicks.length) {
    if (kicks.length - start < minK) {
      if (parts.length) parts[parts.length - 1].push(...kicks.slice(start));
      else parts.push(kicks.slice(start));
      break;
    }
    const seed = median(diffs(kicks.slice(start, Math.min(kicks.length, start + minK))));
    let end = Math.min(kicks.length - 1, start + minK - 1);
    while (end < kicks.length - 1) {
      const next = end + 1;
      const from = Math.max(start, next - 6);
      const local = median(diffs(kicks.slice(from, next + 1)));
      if (next - start + 1 > minK && Math.abs(local / seed - 1) > DRIFT_LIMIT) break;
      end = next;
    }
    if (end <= start) {
      parts.push(kicks.slice(start));
      break;
    }
    parts.push(kicks.slice(start, end + 1));
    if (end >= kicks.length - 1) break;
    start = end;
  }
  return parts.filter((part) => part.length >= MIN_KICKS);
}

function downbeatsOf(grid0: number, period: number, kicks: number[]): number[] {
  const n0 = Math.round((kicks[0] - grid0) / period);
  const last = kicks[kicks.length - 1];
  const out: number[] = [];
  for (let n = n0; ; n += 4) {
    const t = grid0 + n * period;
    if (t > last + period * 0.51) break;
    if (t < kicks[0] - 1e-3) continue;
    const kick = kicks.find((k) => Math.abs(k - t) <= period * 0.2);
    out.push(r6(kick ?? t));
  }
  return out;
}

function windowDrift(kicks: number[], period: number): number {
  const ioi = diffs(kicks);
  const win = 6;
  if (ioi.length < win || period <= 0) return 0;
  let drift = 0;
  for (let i = 0; i + win <= ioi.length; i++) {
    drift = Math.max(drift, Math.abs(median(ioi.slice(i, i + win)) / period - 1));
  }
  return drift;
}

// The kick grid. One period when the tempo holds within ~1%. Otherwise one period per section.
export function fitKicks(pcm: Pcm, fps = 24): KickGrid {
  const found = detectKicks(pcm);
  if (found.length < MIN_KICKS) {
    throw new ClockError(
      `El stem de batería tiene ${found.length} kicks. Hacen falta al menos ${MIN_KICKS}. El reloj no mide el beat en el master.`,
    );
  }
  const groups = splitKicks(found);
  const fitted = groups.map((kicks) => ({ kicks, ...fitSection(kicks) }));
  const first = fitted[0];
  let drift = fitted.length > 1 ? 0 : windowDrift(first.kicks, first.period);
  const sections: GridSection[] = fitted.map((section) => {
    drift = Math.max(drift, Math.abs(section.period / first.period - 1));
    return {
      t0: r6(section.kicks[0]),
      t1: r6(section.kicks[section.kicks.length - 1]),
      grid0: r6(section.grid0),
      period: r6(section.period),
      bpm: Math.round(section.bpm * 1000) / 1000,
    };
  });
  if (fitted.length === 1) drift = windowDrift(first.kicks, first.period);
  const errors: number[] = [];
  let within = 0;
  fitted.forEach((section) => {
    section.errors.forEach((error) => {
      errors.push(Math.abs(error));
      if (Math.abs(error) <= 0.0005) within++;
    });
  });
  const downbeats = fitted.flatMap((section) => downbeatsOf(section.grid0, section.period, section.kicks));
  const usable = sections.length === 1 && drift <= DRIFT_LIMIT;
  return {
    bpm: sections[0].bpm,
    grid0: sections[0].grid0,
    period: sections[0].period,
    fps,
    tolerances: { hitFrames: 1, hitMs: 1000 / fps, audioCueMs: 60, kickFitMs: 0.5, offsetReportMs: 20 },
    downbeats,
    kicks: found.map(r6),
    kicksWithinHalfMs: within,
    medianErrorMs: Math.round(median(errors) * 1e6) / 1e3,
    sections,
    usable,
    drift,
  };
}

function letters(text: string): string[] {
  return [
    ...text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
  ];
}

export function lyricTokens(lyrics: string): { text: string; section: string }[] {
  let section = "canción";
  const out: { text: string; section: string }[] = [];
  for (const raw of lyrics.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^\[([^\]]+)\]$/.exec(line);
    if (head) {
      section = head[1].trim().toLowerCase();
      continue;
    }
    if (/^\([^)]*\)$/.test(line)) continue;
    for (const part of splitWords(line)) {
      if (letters(part.text).length) out.push({ text: part.text, section });
    }
  }
  return out;
}

// Word clock. Unmatched tokens stay without a time. Nothing is moved onto a kick.
export function wordClock(lyrics: string, heard: HeardWord[]): { words: SyncWord[]; unaligned: string[]; gate: string; ok: boolean } {
  const tokens = lyricTokens(lyrics);
  if (!tokens.length) throw new ClockError("Falta la letra.");
  const heardChars: { c: string; t: number; start: number; end: number }[] = [];
  for (const h of heard) {
    if (!(h.end >= h.start)) continue;
    const cs = letters(h.word);
    cs.forEach((c, i) => heardChars.push({ c, t: h.start + ((h.end - h.start) * (i + 0.5)) / cs.length, start: h.start, end: h.end }));
  }
  const lyricChars: { c: string; token: number }[] = [];
  tokens.forEach((token, index) => letters(token.text).forEach((c) => lyricChars.push({ c, token: index })));
  const matchTime: ({ t: number; start: number; end: number } | undefined)[] = new Array(lyricChars.length);
  const n = lyricChars.length;
  const m = heardChars.length;
  if (n && m && n * m <= 8_000_000) {
    const table = new Uint8Array((n + 1) * (m + 1));
    let prev = new Uint16Array(m + 1);
    let cur = new Uint16Array(m + 1);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (lyricChars[i - 1].c === heardChars[j - 1].c) {
          cur[j] = prev[j - 1] + 1;
          table[i * (m + 1) + j] = 1;
        } else if (prev[j] >= cur[j - 1]) {
          cur[j] = prev[j];
          table[i * (m + 1) + j] = 2;
        } else {
          cur[j] = cur[j - 1];
          table[i * (m + 1) + j] = 3;
        }
      }
      [prev, cur] = [cur, prev];
      cur.fill(0);
    }
    for (let i = n, j = m; i > 0 && j > 0; ) {
      const move = table[i * (m + 1) + j];
      if (move === 1) {
        matchTime[i - 1] = heardChars[j - 1];
        i--;
        j--;
      } else if (move === 2) i--;
      else j--;
    }
  }
  const span: { start?: number; end?: number; from?: number; to?: number; hits: number }[] = tokens.map(() => ({ hits: 0 }));
  lyricChars.forEach((ch, i) => {
    const hit = matchTime[i];
    if (hit === undefined) return;
    const slot = span[ch.token];
    slot.hits++;
    slot.start = slot.start === undefined ? hit.t : Math.min(slot.start, hit.t);
    slot.end = slot.end === undefined ? hit.t : Math.max(slot.end, hit.t);
    slot.from = slot.from === undefined ? hit.start : Math.min(slot.from, hit.start);
    slot.to = slot.to === undefined ? hit.end : Math.max(slot.to, hit.end);
  });
  let last = -Infinity;
  const aligned: { t: number; end: number }[] = [];
  tokens.forEach((token, i) => {
    const slot = span[i];
    const need = letters(token.text).length;
    const trusted =
      slot.start !== undefined &&
      slot.hits >= Math.max(1, Math.ceil(need * 0.5)) &&
      slot.start >= last - 1e-3 &&
      slot.end! - slot.start <= 2 + 0.4 * need;
    if (!trusted) {
      aligned.push({ t: NaN, end: NaN });
      return;
    }
    const t = slot.from ?? slot.start!;
    const end = Math.max(slot.to ?? slot.end!, t + 0.04);
    aligned.push({ t, end });
    last = end;
  });
  const words: SyncWord[] = tokens.map((token, i) => {
    if (Number.isNaN(aligned[i].t)) return { t: null, t_out: null, text: token.text, section: token.section };
    let next: number | null = null;
    for (let j = i + 1; j < aligned.length; j++) {
      if (!Number.isNaN(aligned[j].t)) {
        next = aligned[j].t;
        break;
      }
    }
    const end = aligned[i].end;
    const tOut = next !== null && next - end <= SILENCE_GAP ? next : end;
    return { t: r6(aligned[i].t), t_out: r6(tOut), text: token.text, section: token.section };
  });
  const unaligned = words.filter((word) => word.t === null).map((word) => word.text);
  const hit = words.length - unaligned.length;
  return { words, unaligned, gate: `${hit}/${words.length}`, ok: unaligned.length === 0 && words.length > 0 };
}

const MOVE_ON: Record<string, "downbeat" | "kick"> = {
  step: "kick",
  hit: "kick",
  land: "kick",
  turn: "downbeat",
  cut: "downbeat",
};

export function parseMoves(text: string): { name: string; at: number | null }[] {
  const out: { name: string; at: number | null }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z][\w-]*)(?:\s*[@\s]\s*(\d+(?:\.\d+)?))?$/.exec(line);
    if (!match) throw new ClockError(`No entiendo el acento «${line}».`);
    out.push({ name: match[1], at: match[2] === undefined ? null : Number(match[2]) });
  }
  return out;
}

function moveKind(name: string): "downbeat" | "kick" {
  return MOVE_ON[name.split("-")[0].toLowerCase()] ?? "kick";
}

// Accents in song order, each one on the next kick or downbeat of its kind. No list: one proposed accent per downbeat.
export function assignMoves(text: string, grid: KickGrid): SyncMove[] {
  const list = parseMoves(text);
  if (!list.length) {
    return grid.downbeats.map((t) => ({ t, kick_t: t, offset_ms: 0, move: "accent", on: "downbeat" as const, proposed: true as const }));
  }
  const pools = { kick: grid.kicks, downbeat: grid.downbeats };
  const cursor = { kick: 0, downbeat: 0 };
  let lastT = -Infinity;
  return list.map((item) => {
    const on = moveKind(item.name);
    const pool = pools[on];
    if (!pool.length) throw new ClockError(`No hay ${on === "downbeat" ? "downbeats" : "kicks"} para «${item.name}».`);
    let index = cursor[on];
    while (index < pool.length && pool[index] <= lastT + 1e-4) index++;
    if (index >= pool.length) throw new ClockError(`Hay más acentos que ${on === "downbeat" ? "downbeats" : "kicks"}.`);
    cursor[on] = index + 1;
    const kickT = pool[index];
    const offset = item.at === null ? 0 : (item.at - kickT) * 1000;
    lastT = kickT;
    return { t: r6(kickT), kick_t: r6(kickT), offset_ms: Math.round(offset * 1000) / 1000, move: item.name, on };
  });
}

export function assembleSync(input: {
  drums: Pcm;
  lyrics: string;
  moves?: string;
  heard?: HeardWord[];
  fps?: number;
  wordsEngine?: string;
}): SyncDoc {
  const fps = input.fps && input.fps > 0 ? input.fps : 24;
  const grid = fitKicks(input.drums, fps);
  const clock = wordClock(input.lyrics, input.heard ?? []);
  const moves = assignMoves(input.moves ?? "", grid);
  return {
    grid,
    words: clock.words,
    moves,
    lyric_gate: clock.gate,
    lyric_gate_ok: clock.ok,
    unaligned: clock.unaligned,
    engines: { beats: "drums-lowpass-150", words: input.wordsEngine ?? (input.heard?.length ? "vocal-stem" : "none") },
  };
}

export function qaMarkdown(doc: SyncDoc): string {
  const grid = doc.grid;
  const off = doc.moves.filter((move) => Math.abs(move.offset_ms) > grid.tolerances.offsetReportMs);
  const line = grid.usable
    ? "La grilla sirve."
    : grid.sections.length > 1
      ? `Hay que partir secciones: el tempo deriva ${(grid.drift * 100).toFixed(1)}% (${grid.sections.length} tramos).`
      : `Hay que partir secciones: el tempo deriva ${(grid.drift * 100).toFixed(1)}% y no entra en un solo periodo.`;
  return [
    "# Reloj",
    "",
    `BPM: ${grid.bpm.toFixed(2)}`,
    `grid0: ${grid.grid0.toFixed(4)} s`,
    `period: ${grid.period.toFixed(4)} s`,
    `kicks a ±0.5 ms: ${grid.kicksWithinHalfMs}/${grid.kicks.length}`,
    `error mediano: ${grid.medianErrorMs.toFixed(2)} ms`,
    `gate de letra: ${doc.lyric_gate}`,
    `palabras: ${doc.engines.words}`,
    off.length ? `acentos con offset > 20 ms: ${off.map((move) => `${move.move} ${move.offset_ms.toFixed(0)} ms`).join(", ")}` : "acentos con offset > 20 ms: ninguno",
    doc.unaligned.length ? `sin tiempo: ${doc.unaligned.join(", ")}` : "sin tiempo: ninguno",
    line,
    "",
  ].join("\n");
}

export function activeWord(doc: SyncDoc, t: number): SyncWord | null {
  return doc.words.find((word) => word.t !== null && word.t_out !== null && word.t <= t && t < word.t_out) ?? null;
}

export function nearestKick(doc: SyncDoc, t: number): number | null {
  const half = 0.5 / doc.grid.fps;
  let best: number | null = null;
  let dist = half;
  for (const kick of doc.grid.kicks) {
    const d = Math.abs(kick - t);
    if (d <= dist) {
      dist = d;
      best = kick;
    }
  }
  return best;
}

export function activeMove(doc: SyncDoc, t: number): SyncMove | null {
  const half = 0.5 / doc.grid.fps;
  let best: SyncMove | null = null;
  let dist = half;
  for (const move of doc.moves) {
    const d = Math.abs(move.t - t);
    if (d <= dist) {
      dist = d;
      best = move;
    }
  }
  return best;
}

// A time where the kick, a word and an accent land on the same frame.
export function coincidence(doc: SyncDoc): number | null {
  const half = 0.5 / doc.grid.fps;
  for (const move of doc.moves) {
    const kick = doc.grid.kicks.some((k) => Math.abs(k - move.t) <= half);
    const word = doc.words.some((w) => w.t !== null && w.t_out !== null && Math.abs(w.t - move.t) <= half && w.t < w.t_out);
    if (kick && word) return move.t;
  }
  return doc.grid.kicks[0] ?? null;
}

export type Fix = { t: number; problem: string; fix: string };

export function applyClockFixes(doc: SyncDoc): { doc: SyncDoc; fixes: Fix[] } {
  const frame = 1 / doc.grid.fps;
  const fixes: Fix[] = [];
  const moves = doc.moves.map((move) => {
    const late = Math.abs(move.t - move.kick_t);
    if (late <= frame + 1e-4) return move;
    fixes.push({
      t: move.kick_t,
      problem: `${move.move} cae a ${Math.round(late * 1000)} ms del kick.`,
      fix: "Apoyar el acento en el kick de su tramo.",
    });
    return { ...move, t: move.kick_t, offset_ms: 0 };
  });
  return { doc: { ...doc, moves }, fixes };
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Uint8Array(buf);
}

function readSample(view: DataView, offset: number, format: number, bits: number): number {
  if (format === 3 && bits === 32) return view.getFloat32(offset, true);
  if (bits === 16) return view.getInt16(offset, true) / 32768;
  if (bits === 24) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    let v = b0 | (b1 << 8) | (b2 << 16);
    if (v & 0x800000) v |= ~0xffffff;
    return v / 8388608;
  }
  if (bits === 32) return view.getInt32(offset, true) / 2147483648;
  if (bits === 8) return (view.getUint8(offset) - 128) / 128;
  throw new ClockError("Ese WAV no es PCM de 8, 16, 24 o 32 bits.");
}

export function decodeWav(bytes: Uint8Array): Pcm {
  if (bytes.length < 44) throw new ClockError("Ese WAV está incompleto.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    throw new ClockError("El reloj lee WAV (PCM). El master y los stems tienen que llegar en WAV.");
  }
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOff = -1;
  let dataLen = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const len = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt " && len >= 16) {
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === "data") {
      dataOff = start;
      dataLen = Math.min(len, bytes.length - start);
      break;
    }
    offset = start + len + (len % 2);
  }
  if (!sampleRate || dataOff < 0 || channels < 1) throw new ClockError("Ese WAV no tiene datos de audio.");
  if (audioFormat !== 1 && audioFormat !== 3) throw new ClockError("Ese WAV está comprimido. Exportalo como PCM.");
  const width = bits / 8;
  const frames = Math.floor(dataLen / (width * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += readSample(view, dataOff + (i * channels + c) * width, audioFormat, bits);
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

export function synthDrumStem(sampleRate: number, kicks: number[], hats: number[], seconds: number): Pcm {
  const n = Math.ceil(seconds * sampleRate);
  const samples = new Float32Array(n);
  const burst = (at: number, freq: number, decay: number, amp: number, dur: number) => {
    const a = Math.max(0, Math.floor(at * sampleRate));
    const m = Math.min(n, a + Math.floor(dur * sampleRate));
    for (let i = a; i < m; i++) {
      const tt = (i - a) / sampleRate;
      samples[i] += Math.sin(2 * Math.PI * freq * tt) * Math.exp(-tt / decay) * amp;
    }
  };
  for (const t of kicks) burst(t, 55, 0.018, 0.9, 0.09);
  for (const t of hats) burst(t, 8000, 0.004, 0.55, 0.02);
  return { samples, sampleRate };
}
