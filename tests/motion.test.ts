// Explainer timing (shared/motion.ts): cuts on the beat, elements on the beat, the checks and the voice fit.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_SCENE,
  VOICE_TAIL,
  blankScene,
  elementTimes,
  kineticLeave,
  posterTime,
  quietGaps,
  readingIssues,
  revealTimes,
  sceneElements,
  settledAt,
  snapElements,
  snapScenes,
  timeScenes,
  voiceFitSeconds,
  voiceOverrun,
  type MotionScene,
} from "../shared/motion.ts";

// A small seeded generator so every run tests the same cases.
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
const grid = (bpm: number, seconds: number) => Array.from({ length: Math.floor(seconds / (60 / bpm)) + 1 }, (_, i) => (i * 60) / bpm);

test("snapping the cuts never leaves a scene under 1.5 s", () => {
  const rnd = seeded(7);
  for (let n = 0; n < 5000; n++) {
    const scenes = Array.from({ length: 3 + Math.floor(rnd() * 8) }, () => ({ ...blankScene("screen"), title: "Pantalla", seconds: Math.round((2 + rnd() * 6) * 10) / 10 }));
    const total = scenes.reduce((a, s) => a + s.seconds, 0) + 2;
    const beats: number[] = [];
    if (n % 2) beats.push(...grid(80 + Math.floor(rnd() * 51), total));
    else for (let t = 0; t < total; t += 0.3 + rnd() * 0.9) beats.push(t);
    for (const s of snapScenes(scenes, beats, [], 0)) assert.ok(s.seconds >= MIN_SCENE - 1e-9, `scene of ${s.seconds} s`);
  }
});

test("a cut does not move onto a beat that would leave the next scene short", () => {
  // The only beat near the first cut is 0.55 s later; the next scene has no beat near its own end, so taking it would
  // leave that scene 1.45 s. The cut stays where it was planned.
  const scenes = [3, 2, 3].map((seconds) => ({ ...blankScene("screen"), title: "Pantalla", seconds }));
  assert.deepEqual(snapScenes(scenes, [3.55, 100], [], 0).map((s) => s.seconds), [3, 2, 3]);
});

test("snapping keeps the total close and lands cuts on beats", () => {
  const beats = grid(120, 40);
  const scenes = [3.1, 4.2, 2.9, 5.3].map((seconds) => ({ ...blankScene("screen"), title: "Pantalla", seconds }));
  const timed = timeScenes(snapScenes(scenes, beats, [], 0.38));
  for (const s of timed.slice(1)) assert.ok(beats.some((b) => Math.abs(b - s.start) < 0.005), `cut at ${s.start}`);
});

test("element times move onto a beat within 0.1 s, never the voice nor a hand-set time", () => {
  const beats = grid(120, 30);
  const callouts: MotionScene = { ...blankScene("callouts"), seconds: 4, title: "Tres cosas", items: ["uno", "dos", "tres"], asset: "x", voice: "Hola, esto es una prueba" };
  const [snapped] = snapElements([callouts], beats);
  const before = elementTimes(callouts);
  for (const [key, at] of Object.entries(snapped.onBeat ?? {})) {
    assert.ok(Math.abs(at - before[key]) <= 0.1 + 1e-9);
    assert.ok(beats.some((b) => Math.abs(b - at) < 1e-6));
    assert.notEqual(key, "voice");
  }
  assert.equal(elementTimes(snapped).voice, before.voice);
  const [hand] = snapElements([{ ...callouts, tweaks: { item0: { at: 0.63 } } }], beats);
  assert.equal(elementTimes(hand).item0, 0.63);
  assert.equal(snapElements([callouts], [])[0], callouts);
});

test("what enters during the push between scenes arrives with the cut", () => {
  const hook: MotionScene = { ...blankScene("hook"), seconds: 3, title: "El pan se acaba a las seis", text: "Y nadie lo ve", asset: "x" };
  assert.deepEqual(revealTimes(hook, 0), [0, 0.3, 0.8]);
  assert.deepEqual(revealTimes(hook, 0.38), [0, 0.8]);
  const media = sceneElements(hook).find((e) => e.key === "media")!;
  assert.ok(settledAt(hook, media, 0.38) >= 0.38);
  const s1: MotionScene = { ...blankScene("stat"), seconds: 2, title: "3 minutos" };
  const s2: MotionScene = { ...blankScene("hook"), seconds: 4.3, title: "Listo", asset: "x" };
  assert.equal(quietGaps([s1, s2], 0).length, 0);
  assert.equal(quietGaps([s1, s2], 0.38).length, 1);
});

test("a kinetic hook's fall counts as something new on screen", () => {
  const still: MotionScene = { ...blankScene("hook"), seconds: 4.4, title: "Hola" };
  const falling: MotionScene = { ...still, kineticExit: true };
  const leave = kineticLeave("Hola", 4.4);
  assert.ok(leave != null && Math.abs(leave - 3.85) < 1e-9);
  const times = revealTimes(falling, 0);
  assert.equal(times[0], 0);
  assert.ok(times[1] != null && Math.abs(times[1] - 3.85) < 1e-9);
  assert.equal(quietGaps([falling], 0).length, 0);
  assert.deepEqual(revealTimes(still, 0), [0]);
  assert.equal(quietGaps([still], 0).length, 1);
});

test("a line that does not stay long enough to read is flagged", () => {
  const short: MotionScene = { ...blankScene("hook"), seconds: 2, title: "Una frase bastante larga para leer en tan poco tiempo de pantalla" };
  assert.equal(readingIssues([short], 0).length, 1);
  const fine: MotionScene = { ...short, seconds: 6 };
  assert.equal(readingIssues([fine], 0).length, 0);
});

test("the poster is the hook's settled frame, never inside a cut", () => {
  const scenes = [
    { ...blankScene("hook"), seconds: 3, title: "El corte es a las 18" },
    { ...blankScene("screen"), seconds: 3, title: "Stock" },
  ];
  const t = posterTime(scenes, null, 0.38);
  assert.ok(t > 0 && t < 3);
  const chosen = posterTime(scenes, { t: 3.1 }, 0.38);
  assert.ok(chosen >= 3 + 0.38);
});

test("Ajustar al largo de la voz fits the voice with its cut on a beat", () => {
  const rnd = seeded(3);
  let checked = 0;
  for (let n = 0; n < 600; n++) {
    const scenes = Array.from({ length: 5 }, () => ({ ...blankScene("screen"), title: "Pantalla", voice: "una línea", seconds: Math.round((2 + rnd() * 5) * 10) / 10 }));
    const i = 1 + Math.floor(rnd() * 3);
    const voice = 1 + rnd() * 6;
    const step = 60 / (80 + Math.floor(rnd() * 51));
    const beatsFor = (list: MotionScene[]) => grid(60 / step, list.reduce((a, s) => a + s.seconds, 0) + 2);
    const arrange = (list: MotionScene[]) => snapElements(snapScenes(list, beatsFor(list), [], 0.38), beatsFor(list));
    if (voiceOverrun(timeScenes(arrange(scenes))[i], voice) <= 0) continue;
    const seconds = voiceFitSeconds(scenes, arrange(scenes), scenes[i].id, voice, beatsFor(scenes))!;
    if (seconds >= 8) continue;
    const next = scenes.map((s, k) => (k === i ? { ...s, seconds } : s));
    const after = timeScenes(arrange(next))[i];
    assert.ok(voiceOverrun(after, voice) <= 1e-6, "voice still overruns");
    assert.ok(-voiceOverrun(after, voice) <= VOICE_TAIL + step + 0.01, "too much room left");
    assert.ok(beatsFor(next).some((b) => Math.abs(b - after.end) < 0.005), "cut not on a beat");
    checked++;
  }
  assert.ok(checked > 100);
});
