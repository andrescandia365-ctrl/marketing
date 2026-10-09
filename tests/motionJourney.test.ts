// Idea 63, from what Kurzgesagt does well (never its look): camera journeys between scenes ("Pasar a través"), the
// brand's physics (how it lands and breathes), and the circle reveal in "Antes / después".
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOTION_TEMPLATES,
  THROUGH,
  blankScene,
  cutPush,
  normalizeMotion,
  posterTime,
  pushOf,
  readingIssues,
  sceneElements,
  settledAt,
  timeScenes,
  type MotionScene,
} from "../shared/motion.ts";
import { anchorOf } from "../src/lib/motion.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });

test("a camera journey takes its own time, whatever the tone", () => {
  const [a, b, c] = timeScenes([scene({ id: "a" }), scene({ id: "b", entry: "through" }), scene({ id: "c" })]);
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const push = cutPush(tone);
    assert.equal(pushOf(a, push), 0);
    assert.equal(pushOf(b, push), THROUGH);
    assert.equal(pushOf(c, push), push);
  }
  // Nothing in the scene is readable before the journey ends.
  const title = sceneElements(b).find((e) => e.key === "title");
  if (title) assert.ok(settledAt(b, title, pushOf(b, 0)) >= THROUGH);
});

test("the checks and the poster wait for the journey", () => {
  // A one-word hook title enters at 0 and is in at 0.45 s; a journey keeps it from being read until 0.7 s.
  const scenes = [scene({ id: "a", seconds: 3 }), scene({ id: "b", template: "hook", seconds: 1.3, title: "Ojo", entry: "through" })];
  // With a hard cut (dry) the short title reads in time; a journey eats 0.7 s of it.
  assert.equal(readingIssues(scenes.map((s) => ({ ...s, entry: undefined })), 0).length, 0);
  assert.equal(readingIssues(scenes, 0).length, 1);
  // A poster chosen in the middle of the journey moves past it.
  const t = posterTime(scenes, { t: 3.2 }, 0);
  assert.ok(t >= 3 + THROUGH);
});

test("the writer's words for entry and reveal come back as values", () => {
  const wire = {
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    caption: "",
    music: { mood: "drive", bpm: 110 },
    scenes: [
      { ...scene({}), template: "screen", gesture: "", move: "", entry: "cut", reveal: "" },
      { ...scene({}), template: "zoom", gesture: "", move: "", entry: "through", reveal: "iris" },
      { ...scene({}), template: "beforeAfter", gesture: "", move: "", entry: "pasar a través", reveal: "iris" },
    ],
  };
  const out = normalizeMotion(wire).scenes;
  assert.deepEqual(
    out.map((s) => [s.entry, s.reveal]),
    [
      [undefined, undefined],
      ["through", undefined],
      ["through", "iris"],
    ],
  );
});

test("every template has a main thing inside the frame to dive into", () => {
  for (const [w, h] of [
    [1080, 1920],
    [1920, 1080],
  ]) {
    for (const template of MOTION_TEMPLATES) {
      for (const camera of ["hold", "push", "pan", "drift"] as const) {
        const [s] = timeScenes([{ ...blankScene(template), asset: "x", camera }]);
        const a = anchorOf(s, w, h);
        assert.ok(a.x > 0 && a.x < w && a.y > 0 && a.y < h, `${template} ${camera} ${w}x${h}`);
      }
    }
  }
});
