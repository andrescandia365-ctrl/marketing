// Pure helpers for the explainer's mix (src/lib/motionAudio.ts), kept here so they can be tested without audio.

// Where a sample's attack starts (the first moment it reaches a quarter of its peak), less 2 ms so the attack is
// not cut, and its peak. Library files carry silence before the hit (up to ~60 ms in the key set), which would
// put the sound a frame or two after its motion.
export function sampleShape(data: Float32Array, rate: number): { onset: number; peak: number } {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak === 0) return { onset: 0, peak: 0 };
  const threshold = peak / 4;
  let i = 0;
  while (i < data.length && Math.abs(data[i]) < threshold) i++;
  return { onset: Math.max(0, i / rate - 0.002), peak };
}

// The gain that brings one sample of a kind to the kind's middle peak (one level per kind), within ±12 dB.
export function levelGain(peak: number, reference: number): number {
  if (peak <= 0 || reference <= 0) return 1;
  return Math.min(4, Math.max(0.25, reference / peak));
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const k = Math.floor(v.length / 2);
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
}

// Room before the big moments: the music bed drops to ROOM_DIP for `gap` seconds (half a beat of the score) right
// before the product's reveal and the logo, and comes back on the hit. Fast, a stop, then the hit.
export const ROOM_DIP = 0.2;
export const BIG_HITS = ["reveal", "logo"] as const;

export function roomWindows(hits: { at: number; kind: string }[], gap: number): { from: number; to: number }[] {
  const windows = hits
    .filter((h) => (BIG_HITS as readonly string[]).includes(h.kind) && h.at - gap >= 0.05)
    .map((h) => ({ from: h.at - gap, to: h.at }))
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.from <= last.to + 0.05) last.to = Math.max(last.to, w.to);
    else merged.push({ ...w });
  }
  return merged;
}
