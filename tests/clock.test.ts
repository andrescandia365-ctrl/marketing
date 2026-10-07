// The two clocks: kicks measured on a drums stem (shared/clock.ts), and an explainer's own track that only gets a
// beat grid from its stem, never from itself (idea 44).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitKicks, synthDrumStem } from "../shared/clock.ts";
import { blankScene, timeScenes, type MotionScript } from "../shared/motion.ts";
import { arrangeScenes, motionBeats, strongBeats, trackKicks } from "../src/lib/motionProject.ts";

const period = 60 / 112;
const kicksAt = Array.from({ length: 60 }, (_, i) => 0.31 + i * period);
const stem = synthDrumStem(44100, kicksAt, kicksAt.map((k) => k + period / 2), 34);

test("the kicks of a drums stem are found within a few milliseconds, hats left out", () => {
  const grid = fitKicks(stem, 30);
  assert.equal(grid.kicks.length, 60);
  assert.ok(Math.abs(grid.bpm - 112) < 0.5);
  for (const k of grid.kicks) assert.ok(Math.min(...kicksAt.map((x) => Math.abs(x - k))) < 0.005);
});

const script: MotionScript = {
  problem: "",
  title: "",
  durationNote: "",
  note: "",
  tone: "warm",
  music: { mood: "drive", bpm: 100 },
  scenes: [
    { ...blankScene("hook"), title: "El corte es a las 18", seconds: 3.4 },
    { ...blankScene("screen"), title: "Stock", seconds: 4.2 },
    { ...blankScene("steps"), title: "Tres pasos", items: ["uno", "dos", "tres"], seconds: 5.1 },
    { ...blankScene("product"), title: "IMAN", items: ["Gratis"], seconds: 3.3 },
    { ...blankScene("logo"), items: ["Probalo"], seconds: 3 },
  ],
};

test("a track with no drums stem has no beat grid, so nothing moves", () => {
  assert.deepEqual(motionBeats(script, "track", null), []);
  assert.deepEqual(arrangeScenes(script, [], true, "track", null).map((s) => s.seconds), script.scenes.map((s) => s.seconds));
});

test("with the stem's kicks every cut lands on a kick and the product on a downbeat", () => {
  const kicks = trackKicks(stem, "stem", "bateria.wav");
  const beats = motionBeats(script, "track", kicks);
  const strong = strongBeats(beats, "track", kicks);
  assert.deepEqual(strong, kicks.downbeats);
  const timed = timeScenes(arrangeScenes(script, beats, true, "track", kicks));
  for (const s of timed.slice(1)) assert.ok(kicks.kicks.some((k) => Math.abs(k - s.start) < 0.005), `cut at ${s.start}`);
  const product = timed.find((s) => s.template === "product")!;
  assert.ok(strong.some((d) => Math.abs(d - product.start) < 0.005));
});

test("the synthesized score keeps its own grid and bar starts", () => {
  const beats = motionBeats(script, "synth", null);
  assert.ok(Math.abs(beats[1] - 0.6) < 1e-9);
  assert.deepEqual(strongBeats(beats, "synth", null).slice(0, 3), [beats[0], beats[4], beats[8]]);
  assert.deepEqual(motionBeats(script, "none", null), []);
});
