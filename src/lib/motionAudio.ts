// The explainer's sound: a score synthesized in code (unless a track is supplied), hits placed on the beat grid,
// the narrator's voice on top with the music ducking under it, and the mix normalized to -14 LUFS (ITU-R BS.1770
// K-weighted integrated loudness, with gating) with peaks kept under -1.5 dBFS.
import type { MotionMood } from "../../shared/motion.ts";
import { ROOM_DIP, levelGain, median, roomWindows, sampleShape } from "../../shared/sound.ts";
import { mulberry32 } from "./motion.ts";

const SR = 48000;
export const TARGET_LUFS = -14;

export type SoundPlan = {
  duration: number;
  music: "synth" | "track" | "none";
  mood: MotionMood;
  bpm: number;
  track: AudioBuffer | null;
  // When each voice line starts, and the end of its scene: what runs past it is faded out there.
  voices: { at: number; until?: number; buffer: AudioBuffer }[];
  // Scene changes (whoosh), elements arriving (pop), a big reveal, the logo, a tap, a key press. n picks a variation.
  hits: { at: number; kind: HitKind; n?: number }[];
  // The bundled public-domain effects, synthesized ones, or none.
  effects: "library" | "synth" | "none";
  // The library's sounds by kind (loaded by motionProject.ts); a kind without one is synthesized.
  samples?: Partial<Record<HitKind, AudioBuffer[]>>;
  // The music bed's level against the voice and effects (the tone's: lower for a dry piece). 1 when missing.
  bed?: number;
};

export type HitKind = "whoosh" | "pop" | "reveal" | "logo" | "tap" | "key";

// A voice that runs past its scene fades out over this long, ending on the cut.
export const VOICE_FADE = 0.08;

// How loud each kind sits in the effects bus: soft under the music, repeated little sounds lowest.
const HIT_GAIN: Record<HitKind, number> = { whoosh: 0.55, pop: 0.6, reveal: 0.75, logo: 0.5, tap: 0.55, key: 0.28 };

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Bars of chords (root note in MIDI and the chord's intervals) for each mood.
const PROGRESSION: Record<MotionMood, { roots: number[]; triad: number[] }> = {
  calm: { roots: [57, 53, 60, 55], triad: [0, 4, 7, 11] },
  drive: { roots: [57, 53, 48, 55], triad: [0, 3, 7] },
  bright: { roots: [60, 65, 67, 65], triad: [0, 4, 7] },
};

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = mulberry32(seed);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
  return buf;
}

function synthScore(ctx: OfflineAudioContext, out: AudioNode, duration: number, mood: MotionMood, bpm: number) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  const prog = PROGRESSION[mood];
  const noise = noiseBuffer(ctx, 1, 7);
  const end = duration;

  for (let b = 0; b * beat < end; b++) {
    const t = b * beat;
    const inBar = b % 4;
    // Kick: every beat (calm: the 1 and the 3, softer).
    if (mood !== "calm" || inBar % 2 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(115, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(mood === "calm" ? 0.45 : 0.85, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    // Hats on the off-beats (bright: every eighth, lighter).
    if (mood !== "calm") {
      const offs = mood === "bright" ? [0.5, 0.25, 0.75] : [0.5];
      for (const o of offs) {
        const at = t + beat * o;
        if (at >= end) continue;
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(o === 0.5 ? 0.22 : 0.1, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
        src.connect(hp).connect(g).connect(out);
        src.start(at, (b * 0.013) % 0.9, 0.06);
      }
    }
  }

  // Bass and pad, one chord per bar.
  for (let k = 0; k * bar < end; k++) {
    const t = k * bar;
    const stop = Math.min(end, t + bar);
    const root = prog.roots[k % prog.roots.length];
    const bass = ctx.createOscillator();
    bass.type = "triangle";
    bass.frequency.value = midi(root - 24);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(mood === "calm" ? 0.16 : 0.28, t + 0.02);
    bg.gain.setTargetAtTime(0, stop - 0.08, 0.03);
    bass.connect(bg).connect(out);
    bass.start(t);
    bass.stop(stop);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = mood === "bright" ? 2200 : 1300;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, t);
    pg.gain.linearRampToValueAtTime(mood === "calm" ? 0.07 : 0.045, t + Math.min(0.4, bar / 3));
    pg.gain.setTargetAtTime(0, stop - 0.15, 0.06);
    lp.connect(pg).connect(out);
    for (const iv of prog.triad) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midi(root + iv);
        o.detune.value = detune;
        o.connect(lp);
        o.start(t);
        o.stop(stop);
      }
    }
  }
}

function addHits(ctx: OfflineAudioContext, out: AudioNode, plan: SoundPlan) {
  if (plan.effects === "none") return;
  const noise = noiseBuffer(ctx, 1, 11);
  // Each library sample's attack and peak, and each kind's middle peak (one level per kind).
  const shapes = new Map<AudioBuffer, { onset: number; peak: number }>();
  const reference: Partial<Record<HitKind, number>> = {};
  for (const [kind, list] of Object.entries(plan.samples ?? {}) as [HitKind, AudioBuffer[]][]) {
    for (const b of list) shapes.set(b, sampleShape(b.getChannelData(0), b.sampleRate));
    reference[kind] = median(list.map((b) => shapes.get(b)!.peak));
  }
  for (const hit of plan.hits) {
    const samples = plan.effects === "library" ? plan.samples?.[hit.kind] : undefined;
    if (samples?.length) {
      const src = ctx.createBufferSource();
      const buffer = samples[(hit.n ?? 0) % samples.length];
      src.buffer = buffer;
      const shape = shapes.get(buffer) ?? { onset: 0, peak: 0 };
      const g = ctx.createGain();
      g.gain.value = HIT_GAIN[hit.kind] * levelGain(shape.peak, reference[hit.kind] ?? shape.peak);
      src.connect(g).connect(out);
      // The slide runs across the cut. Everything else starts with its motion: its attack (not the file's silence
      // before it) lands on the element's time.
      const at = hit.kind === "whoosh" ? hit.at - 0.12 : hit.at - shape.onset;
      if (at >= 0) src.start(at);
      else src.start(0, -at);
      continue;
    }
    if (hit.kind === "whoosh") {
      // Peaks right on the cut.
      const start = Math.max(0, hit.at - 0.28);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(350, start);
      bp.frequency.exponentialRampToValueAtTime(4200, hit.at + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, start);
      g.gain.exponentialRampToValueAtTime(0.5, hit.at);
      g.gain.exponentialRampToValueAtTime(0.001, hit.at + 0.18);
      src.connect(bp).connect(g).connect(out);
      src.start(start, 0, 0.5);
    } else if (hit.kind === "key" || hit.kind === "tap") {
      // A short filtered tick.
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.frequency.value = hit.kind === "key" ? 2400 + ((hit.n ?? 0) % 5) * 180 : 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(hit.kind === "key" ? 0.18 : 0.3, hit.at);
      g.gain.exponentialRampToValueAtTime(0.001, hit.at + (hit.kind === "key" ? 0.03 : 0.05));
      src.connect(hp).connect(g).connect(out);
      src.start(hit.at, ((hit.n ?? 0) % 7) * 0.1, 0.06);
    } else {
      // pop, and lower and longer for a reveal or the logo.
      const big = hit.kind === "reveal" || hit.kind === "logo";
      const o = ctx.createOscillator();
      o.type = hit.kind === "logo" ? "triangle" : "sine";
      o.frequency.setValueAtTime(big ? 330 : 760, hit.at);
      o.frequency.exponentialRampToValueAtTime(big ? 220 : 1250, hit.at + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(big ? 0.3 : 0.22, hit.at);
      g.gain.exponentialRampToValueAtTime(0.001, hit.at + (hit.kind === "logo" ? 0.9 : big ? 0.25 : 0.09));
      o.connect(g).connect(out);
      o.start(hit.at);
      o.stop(hit.at + 1);
    }
  }
}

// ── Loudness (ITU-R BS.1770-4) ──────────────────────────────────────────────────
// The K-weighting of ITU-R BS.1770: a high shelf, then the RLB high-pass, with the standard's own coefficients at
// 48 kHz (other rates are resampled first). Done in plain JS so it matches other meters (ffmpeg's ebur128).
const SHELF = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
const RLB = { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] };

function biquad(x: Float32Array, f: { b: number[]; a: number[] }): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b[0] * x[i] + f.b[1] * x1 + f.b[2] * x2 - f.a[0] * y1 - f.a[1] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

async function at48k(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (buffer.sampleRate === SR) return buffer;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * SR), SR);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

async function kWeight(buffer: AudioBuffer): Promise<Float32Array[]> {
  const b = await at48k(buffer);
  return Array.from({ length: b.numberOfChannels }, (_, ch) => biquad(biquad(b.getChannelData(ch), SHELF), RLB));
}

export async function integratedLoudness(buffer: AudioBuffer): Promise<number> {
  const k = await kWeight(buffer);
  const block = Math.round(0.4 * SR);
  const hop = Math.round(0.1 * SR);
  const powers: number[] = [];
  const length = k[0]?.length ?? 0;
  for (let start = 0; start + block <= length; start += hop) {
    let z = 0;
    for (const d of k) {
      let sum = 0;
      for (let i = start; i < start + block; i++) sum += d[i] * d[i];
      z += sum / block;
    }
    powers.push(z);
  }
  const loud = (z: number) => -0.691 + 10 * Math.log10(z);
  const abs = powers.filter((z) => z > 0 && loud(z) > -70);
  if (!abs.length) return -Infinity;
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const relGate = loud(mean(abs)) - 10;
  const gated = abs.filter((z) => loud(z) > relGate);
  return loud(mean(gated.length ? gated : abs));
}

// Brings the mix to the target loudness, keeping peaks under -1.5 dBFS with a soft knee. The knee takes a little
// loudness away, so it measures again and corrects (at most three passes).
async function normalize(buffer: AudioBuffer): Promise<{ lufs: number }> {
  // Above the knee, peaks bend smoothly towards the limit (-1.5 dBFS), never past it, so codec overshoot stays under
  // 0 dBFS.
  const knee = 0.66;
  const limit = 0.84;
  let lufs = await integratedLoudness(buffer);
  for (let pass = 0; pass < 3 && Number.isFinite(lufs) && Math.abs(lufs - TARGET_LUFS) > 0.2; pass++) {
    const gain = 10 ** ((TARGET_LUFS - lufs) / 20);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const x = d[i] * gain;
        const a = Math.abs(x);
        d[i] = a <= knee ? x : Math.sign(x) * (knee + (limit - knee) * Math.tanh((a - knee) / (limit - knee)));
      }
    }
    lufs = await integratedLoudness(buffer);
  }
  return { lufs };
}

export async function buildSound(plan: SoundPlan): Promise<{ buffer: AudioBuffer; lufs: number }> {
  const length = Math.max(1, Math.ceil(plan.duration * SR));
  const ctx = new OfflineAudioContext(2, length, SR);
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  const voice = ctx.createGain();
  const bedLevel = (plan.music === "track" ? 0.8 : 0.55) * (plan.bed ?? 1);
  music.gain.value = bedLevel;
  sfx.gain.value = 0.55;
  voice.gain.value = 1;
  // The bed makes room before the product and the logo (half a beat of the score) and comes back on the hit.
  const room = ctx.createGain();
  music.connect(room).connect(ctx.destination);
  for (const bus of [sfx, voice]) bus.connect(ctx.destination);
  for (const w of roomWindows(plan.hits, plan.music === "synth" ? 30 / plan.bpm : 0.3)) {
    room.gain.setValueAtTime(1, Math.max(0, w.from - 0.04));
    room.gain.linearRampToValueAtTime(ROOM_DIP, w.from);
    room.gain.setValueAtTime(ROOM_DIP, Math.max(w.from, w.to - 0.012));
    room.gain.linearRampToValueAtTime(1, w.to);
  }

  if (plan.music === "synth") synthScore(ctx, music, plan.duration, plan.mood, plan.bpm);
  if (plan.music === "track" && plan.track) {
    const src = ctx.createBufferSource();
    src.buffer = plan.track;
    src.connect(music);
    src.start(0, 0, plan.duration);
    music.gain.setValueAtTime(bedLevel, Math.max(0, plan.duration - 1.5));
    music.gain.linearRampToValueAtTime(0, plan.duration);
  }
  addHits(ctx, sfx, plan);
  // The music ducks under every voice line. A line longer than its scene fades out on the cut, so it never talks
  // over the next scene (the studio offers to lengthen the scene instead).
  for (const v of plan.voices) {
    const src = ctx.createBufferSource();
    src.buffer = v.buffer;
    const full = v.at + v.buffer.duration;
    const end = v.until !== undefined ? Math.max(v.at, Math.min(full, v.until)) : full;
    if (end < full) {
      const fade = ctx.createGain();
      fade.gain.setValueAtTime(1, Math.max(v.at, end - VOICE_FADE));
      fade.gain.linearRampToValueAtTime(0, end);
      src.connect(fade).connect(voice);
      src.start(v.at, 0, end - v.at);
    } else {
      src.connect(voice);
      src.start(v.at);
    }
    music.gain.setTargetAtTime(music.gain.value * 0.32, Math.max(0, v.at - 0.12), 0.05);
    music.gain.setTargetAtTime(bedLevel, end + 0.05, 0.2);
  }
  const buffer = await ctx.startRendering();
  const { lufs } = await normalize(buffer);
  return { buffer, lufs };
}

// The mix as a WAV, for the preview player.
export function toWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + length));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length, true);
  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let o = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, data[ch][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}
