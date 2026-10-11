// What a lyric video's background, Grok layers and "beat" graphics pulse on. With a kick grid from the drums stem
// (the Reloj, shared/clock.ts) the bigger moves land on the downbeats and the small accents on every kick. With no
// grid they keep the old approximation: peaks found on the master (findBeats). That fallback is decoration only; it
// never times a cut (plates cut on the Reloj's downbeats or on the word) and never feeds the Reloj, which stops
// rather than read the master. Pure functions of t, so preview and render draw the same.

export type LyricPulse = {
  source: "kick" | "master" | "none";
  // Kick mode: every kick. Master mode: the master's peaks. Empty for none.
  beats: number[];
  // Kick mode only: the first kick of each bar.
  downbeats: number[];
};

export const NO_PULSE: LyricPulse = { source: "none", beats: [], downbeats: [] };

// How a small accent compares to a downbeat move, and how fast each one settles (per second).
export const KICK_ACCENT = 0.35;
const DOWNBEAT_DECAY = 4;
const KICK_DECAY = 9;
// The master's peaks keep the decay they always had.
const MASTER_DECAY = 5;

type GridLike = { usable: boolean; kicks: number[]; downbeats: number[] } | null | undefined;

const sorted = (xs: number[]) => xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);

// The kick grid wins when the Reloj has a usable one; else the master's peaks; else nothing.
export function lyricPulse(masterBeats: number[], grid?: GridLike): LyricPulse {
  if (grid?.usable && grid.kicks.length) return { source: "kick", beats: sorted(grid.kicks), downbeats: sorted(grid.downbeats) };
  if (masterBeats.length) return { source: "master", beats: sorted(masterBeats), downbeats: [] };
  return NO_PULSE;
}

// 1 right on a hit, settling at `rate` per second; 0 before the first hit. `times` sorted.
export function envelope(times: number[], t: number, rate: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return last < 0 ? 0 : Math.exp(-(t - times[last]) * rate);
}

// How strong the pulse is at t, 0..1: a downbeat gives 1, a plain kick at most KICK_ACCENT.
export function pulseAt(p: LyricPulse, t: number): number {
  if (p.source === "master") return envelope(p.beats, t, MASTER_DECAY);
  if (p.source === "kick") return Math.max(envelope(p.downbeats, t, DOWNBEAT_DECAY), KICK_ACCENT * envelope(p.beats, t, KICK_DECAY));
  return 0;
}

// The hits the Grok layers' parallax nudges on: a bigger move, so downbeats only when there is a grid.
export function layerHits(p: LyricPulse): number[] {
  return p.source === "kick" ? p.downbeats : p.beats;
}

// The studio's plain line about what the pulse follows.
export function pulseNote(source: LyricPulse["source"]): string {
  if (source === "kick") return "El fondo, las capas y los elementos que laten siguen el kick del stem de batería (Reloj): lo grande en el primer tiempo de cada compás, los acentos chicos en cada kick.";
  if (source === "master") return "Por ahora el pulso sigue los golpes que se oyen en la canción entera (aproximado). Cuando armes el Reloj con el stem de batería (Demucs o uno que subas), late con el kick.";
  return "";
}
