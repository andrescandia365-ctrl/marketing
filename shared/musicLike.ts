// Does an uploaded story clip carry music? Story clips should come without it (the video prompt asks "no music"; a
// track goes on top separately, with its licence). This is a warning only, never a block, and it is conservative on
// purpose: a false alarm on a clip of a room or a voice is worse than missing quiet music. [NOT SURE] The thresholds
// were tuned on synthetic signals (tests/musicLike.test.ts), not on a set of real Grok clips.
//
// The heuristic, over the clip's mono sound (the browser decodes and downmixes it, `src/lib/clipMusic.ts`):
// - loud: share of frames with sound (above -50 dBFS and within 40 dB of the clip's loudest frame);
// - tonal: share of all frames that are loud and tonal (low spectral flatness between 100 Hz and 5 kHz: peaks, not
//   hiss);
// - sustain: share of the tonal frames whose strongest pitch (100 Hz–2 kHz) is the same note 0.2 s earlier: music
//   holds notes, speech glides and breaks on consonants;
// - pitches: how many distinct notes are each held for at least 0.25 s: a melody or chords change note, a fridge hum
//   or a single drone does not;
// - beat: how periodic the onsets are (normalized autocorrelation of the spectral flux at 60–200 bpm): a groove
//   repeats, syllables and footsteps do not.
// Music is likely when the clip sounds most of the time and either holds several notes over most of it, or holds a
// few notes on a clear, regular beat.

export type MusicFeatures = {
  seconds: number;
  loud: number;
  tonal: number;
  sustain: number;
  pitches: number;
  beat: number;
};

export const ANALYSIS_RATE = 22050;
const FRAME = 2048; // ~93 ms: about 10.8 Hz per bin at 22.05 kHz, enough to tell notes apart from ~150 Hz up
const HOP = 512; // ~23 ms
// Only the first seconds are read: Grok's clips last 6, 10 or 15 s.
export const MAX_SECONDS = 30;

// The rule's thresholds, in one place.
export const MUSIC_RULE = {
  minSeconds: 3,
  loud: 0.6,
  tonal: 0.5,
  sustain: 0.4,
  pitches: 3,
  beat: 0.45,
  beatTonal: 0.3,
  beatPitches: 2,
};

// In-place radix-2 FFT (re, im of length a power of two).
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const midiOf = (hz: number) => 69 + 12 * Math.log2(hz / 440);

// The features of a mono signal. Pure: same samples, same numbers.
export function musicFeatures(samples: Float32Array, sampleRate: number): MusicFeatures {
  const usable = Math.min(samples.length, Math.floor(MAX_SECONDS * sampleRate));
  const seconds = usable / sampleRate;
  const frames = usable >= FRAME ? 1 + Math.floor((usable - FRAME) / HOP) : 0;
  const empty: MusicFeatures = { seconds, loud: 0, tonal: 0, sustain: 0, pitches: 0, beat: 0 };
  if (frames < 8) return empty;

  const window = new Float64Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const binHz = sampleRate / FRAME;
  const lo = Math.max(1, Math.round(100 / binHz));
  const hi = Math.min(FRAME / 2 - 1, Math.round(5000 / binHz));
  const pitchHi = Math.min(hi, Math.round(2000 / binHz));
  const rms = new Float64Array(frames);
  const flatness = new Float64Array(frames);
  const pitch = new Float64Array(frames).fill(NaN);
  const flux = new Float64Array(frames);
  let prev: Float64Array | null = null;
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[start + i];
      energy += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(energy / FRAME);
    fft(re, im);
    const mag = new Float64Array(hi + 1);
    let logSum = 0;
    let sum = 0;
    let best = lo;
    for (let k = lo; k <= hi; k++) {
      const power = re[k] * re[k] + im[k] * im[k] + 1e-12;
      mag[k] = Math.sqrt(power);
      logSum += Math.log(power);
      sum += power;
      if (k <= pitchHi && mag[k] > mag[best]) best = k;
    }
    const count = hi - lo + 1;
    flatness[f] = Math.exp(logSum / count) / (sum / count);
    // Parabolic interpolation around the strongest bin, for a pitch finer than a bin.
    if (best > lo && best < pitchHi) {
      const a = Math.log(mag[best - 1]);
      const b = Math.log(mag[best]);
      const c = Math.log(mag[best + 1]);
      const d = a - 2 * b + c;
      const offset = d < 0 ? (0.5 * (a - c)) / d : 0;
      pitch[f] = midiOf((best + offset) * binHz);
    }
    if (prev) {
      let rise = 0;
      for (let k = lo; k <= hi; k++) rise += Math.max(0, Math.log1p(mag[k]) - Math.log1p(prev[k]));
      flux[f] = rise;
    }
    prev = mag;
  }

  const peak = Math.max(...rms);
  const floor = Math.max(10 ** (-50 / 20), peak * 10 ** (-40 / 20));
  const isLoud = Array.from(rms, (r) => r > floor);
  const isTonal = isLoud.map((l, f) => l && flatness[f] < 0.2 && !Number.isNaN(pitch[f]));
  const loudCount = isLoud.filter(Boolean).length;
  const tonalCount = isTonal.filter(Boolean).length;
  if (!loudCount) return empty;

  // Sustain: the same note (within half a semitone) 0.2 s earlier.
  const lag = Math.round((0.2 * sampleRate) / HOP);
  let held = 0;
  for (let f = lag; f < frames; f++) {
    if (isTonal[f] && isTonal[f - lag] && Math.abs(pitch[f] - pitch[f - lag]) <= 0.5) held++;
  }
  const sustain = tonalCount ? held / tonalCount : 0;

  // Distinct notes held for 0.25 s or more.
  const minRun = Math.round((0.25 * sampleRate) / HOP);
  const notes = new Set<number>();
  let runStart = -1;
  for (let f = 0; f <= frames; f++) {
    const continues = f < frames && isTonal[f] && runStart >= 0 && Math.abs(pitch[f] - pitch[runStart]) <= 0.5;
    if (continues) continue;
    if (runStart >= 0 && f - runStart >= minRun) notes.add(Math.round(pitch[runStart]));
    runStart = f < frames && isTonal[f] ? f : -1;
  }

  return {
    seconds,
    loud: loudCount / frames,
    tonal: tonalCount / frames,
    sustain,
    pitches: notes.size,
    beat: beatStrength(flux, sampleRate / HOP),
  };
}

// The smallest spectral rise (summed log-magnitude increase over 100 Hz–5 kHz) that counts as an onset.
const MIN_ONSET = 1;

// Peak of the normalized autocorrelation of the onset envelope between 0.3 s and 1 s (200–60 bpm), 0 when flat.
export function beatStrength(flux: Float64Array, framesPerSecond: number): number {
  const n = flux.length;
  const mean = flux.reduce((a, b) => a + b, 0) / n;
  const x = Array.from(flux, (v) => v - mean);
  let zero = 0;
  for (const v of x) zero += v * v;
  // A steady sound (a hum) has a near-flat onset curve whose tiny ripple can be periodic: no onset, no beat.
  if (zero <= 1e-12 || Math.max(...flux) < MIN_ONSET) return 0;
  const from = Math.round(0.3 * framesPerSecond);
  const to = Math.min(n - 1, Math.round(1 * framesPerSecond));
  let best = 0;
  for (let lag = from; lag <= to; lag++) {
    let r = 0;
    for (let i = lag; i < n; i++) r += x[i] * x[i - lag];
    // Scaled for the overlap, so a long lag is not penalized for having fewer pairs.
    best = Math.max(best, (r / zero) * (n / (n - lag)));
  }
  return Math.min(1, best);
}

export function likelyMusic(f: MusicFeatures): boolean {
  const r = MUSIC_RULE;
  if (f.seconds < r.minSeconds || f.loud < r.loud) return false;
  const melodic = f.tonal >= r.tonal && f.sustain >= r.sustain && f.pitches >= r.pitches;
  const groove = f.beat >= r.beat && f.tonal >= r.beatTonal && f.sustain >= r.sustain && f.pitches >= r.beatPitches;
  return melodic || groove;
}
