// The "clip seems to carry music" heuristic on synthetic signals: tones on a beat are music; speech-like bursts,
// hiss, a steady hum and silence are not (false alarms are worse than misses).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANALYSIS_RATE, beatStrength, likelyMusic, musicFeatures } from "../shared/musicLike.ts";
import { DEFAULT_AUDIO, clipMusicNotice, withClipMusic } from "../shared/audio.ts";

const SR = ANALYSIS_RATE;

// Seeded noise, so the tests are the same on every run.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Chords that change every 2 s (with a few harmonics) and a kick every 0.5 s (120 bpm).
function song(seconds: number, withKick = true): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
    [52, 55, 59],
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const chord = chords[Math.floor(t / 2) % chords.length];
    let s = 0;
    chord.forEach((m, j) => {
      const f = hz(m);
      const amp = j === 0 ? 0.18 : 0.1;
      for (let h = 1; h <= 3; h++) s += (amp / h) * Math.sin(2 * Math.PI * f * h * t);
    });
    if (withKick) {
      const k = t % 0.5;
      s += 0.5 * Math.exp(-k * 25) * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-k * 40)) * k);
    }
    out[i] = s;
  }
  return out;
}

// Syllables: short voiced bursts with a gliding pitch and a noisy consonant, at an irregular rate, with pauses.
function speech(seconds: number, seed = 7): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  const r = rng(seed);
  let t = 0.1;
  while (t < seconds - 0.4) {
    // A phrase of 3–7 syllables, then a pause.
    const n = 3 + Math.floor(r() * 5);
    for (let s = 0; s < n && t < seconds - 0.3; s++) {
      const consonant = 0.03 + r() * 0.05;
      const vowel = 0.08 + r() * 0.12;
      const f0 = 110 + r() * 80;
      const glide = (r() - 0.5) * 60;
      const start = Math.round(t * SR);
      const cEnd = start + Math.round(consonant * SR);
      const vEnd = cEnd + Math.round(vowel * SR);
      for (let i = start; i < cEnd && i < out.length; i++) out[i] += (r() * 2 - 1) * 0.15;
      let phase = 0;
      for (let i = cEnd; i < vEnd && i < out.length; i++) {
        const u = (i - cEnd) / (vEnd - cEnd);
        const f = f0 + glide * u;
        phase += (2 * Math.PI * f) / SR;
        const env = Math.sin(Math.PI * u);
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(h * phase) / h;
        out[i] += 0.25 * env * v;
      }
      t += consonant + vowel + 0.02 + r() * 0.12;
    }
    t += 0.25 + r() * 0.6;
  }
  return out;
}

function noise(seconds: number, level: number, seed = 3): Float32Array {
  const r = rng(seed);
  return Float32Array.from({ length: Math.round(seconds * SR) }, () => (r() * 2 - 1) * level);
}

function hum(seconds: number): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => {
    const t = i / SR;
    return 0.2 * Math.sin(2 * Math.PI * 120 * t) + 0.1 * Math.sin(2 * Math.PI * 240 * t) + 0.05 * Math.sin(2 * Math.PI * 360 * t);
  });
}

test("tones on a beat read as music", () => {
  const f = musicFeatures(song(10), SR);
  assert.ok(f.loud > 0.9, `loud ${f.loud}`);
  assert.ok(f.tonal > 0.6, `tonal ${f.tonal}`);
  assert.ok(f.sustain > 0.6, `sustain ${f.sustain}`);
  assert.ok(f.pitches >= 3, `pitches ${f.pitches}`);
  assert.ok(f.beat > 0.45, `beat ${f.beat}`);
  assert.equal(likelyMusic(f), true);
});

test("chords with no drums still read as music", () => {
  assert.equal(likelyMusic(musicFeatures(song(10, false), SR)), true);
});

test("music under room noise still reads as music", () => {
  const room = noise(10, 0.02);
  const mix = song(10).map((s, i) => s + room[i]);
  assert.equal(likelyMusic(musicFeatures(mix, SR)), true);
});

test("speech-like bursts are not music", () => {
  for (const seed of [1, 7, 42]) {
    const f = musicFeatures(speech(10, seed), SR);
    assert.ok(f.sustain < 0.4 || f.tonal < 0.5, `seed ${seed}: ${JSON.stringify(f)}`);
    assert.equal(likelyMusic(f), false, `seed ${seed}: ${JSON.stringify(f)}`);
  }
});

test("speech over a quiet room is not music", () => {
  const room = noise(10, 0.01);
  const mix = speech(10).map((s, i) => s + room[i]);
  assert.equal(likelyMusic(musicFeatures(mix, SR)), false);
});

test("hiss, a steady hum and silence are not music", () => {
  const hiss = musicFeatures(noise(10, 0.2), SR);
  assert.ok(hiss.tonal < 0.1, `hiss tonal ${hiss.tonal}`);
  assert.equal(likelyMusic(hiss), false);
  const drone = musicFeatures(hum(10), SR);
  assert.ok(drone.pitches <= 1, `hum pitches ${drone.pitches}`);
  assert.ok(drone.beat < 0.45, `hum beat ${drone.beat}`);
  assert.equal(likelyMusic(drone), false);
  const quiet = musicFeatures(new Float32Array(10 * SR), SR);
  assert.deepEqual([quiet.loud, quiet.tonal, quiet.beat], [0, 0, 0]);
  assert.equal(likelyMusic(quiet), false);
});

test("a very short or empty clip is never flagged", () => {
  assert.equal(likelyMusic(musicFeatures(song(2), SR)), false);
  assert.equal(likelyMusic(musicFeatures(new Float32Array(0), SR)), false);
});

test("the features are a pure function of the samples", () => {
  const s = song(6);
  assert.deepEqual(musicFeatures(s, SR), musicFeatures(s, SR));
});

test("beat strength: a regular pulse beats an irregular one", () => {
  const fps = SR / 512;
  const n = Math.round(10 * fps);
  const regular = new Float64Array(n);
  for (let i = 0; i < n; i += Math.round(0.5 * fps)) regular[i] = 1;
  const r = rng(9);
  const irregular = new Float64Array(n);
  for (let i = 0; i < n; i += 4 + Math.floor(r() * 30)) irregular[i] = 1;
  assert.ok(beatStrength(regular, fps) > 0.8);
  assert.ok(beatStrength(irregular, fps) < 0.45, `irregular ${beatStrength(irregular, fps)}`);
  assert.equal(beatStrength(new Float64Array(n), fps), 0);
});

test("the notice: shown for a likely clip until it is muted or cleared; older pieces say nothing", () => {
  const old = { ...DEFAULT_AUDIO, clipMusic: undefined };
  assert.equal(clipMusicNotice(old, 0), false);
  const likely = withClipMusic(DEFAULT_AUDIO, 2, "likely");
  assert.equal(clipMusicNotice(likely, 2), true);
  assert.equal(clipMusicNotice(likely, 1), false);
  assert.equal(clipMusicNotice({ ...likely, clipLevel: { 2: "mute" } }, 2), false);
  assert.equal(clipMusicNotice({ ...likely, clipLevel: { 2: "low" } }, 2), true);
  assert.equal(clipMusicNotice(withClipMusic(likely, 2, "ok"), 2), false);
  const cleared = withClipMusic(withClipMusic(likely, 3, "likely"), 2, null);
  assert.deepEqual(cleared.clipMusic, { 3: "likely" });
  assert.deepEqual(DEFAULT_AUDIO.clipMusic, undefined);
});
