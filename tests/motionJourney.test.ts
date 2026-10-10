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
import { BrandSchema, DEFAULT_BRAND } from "../shared/series.ts";
import { anchorOf, drawMotionFrame, landFor } from "../src/lib/motion.ts";

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

test("the brand's physics sets how things land; a dry piece never bounces", () => {
  const brands = ["even", "solid", "soft", "springy", undefined] as const;
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    for (const motion of brands) {
      const land = landFor(tone, motion);
      assert.equal(land(0), 0, `${tone} ${motion} starts at 0`);
      assert.equal(land(1), 1, `${tone} ${motion} ends at 1`);
      assert.ok(Math.abs(land(0.98) - 1) < 0.05, `${tone} ${motion} has settled by the end`);
      const peak = Math.max(...Array.from({ length: 101 }, (_, i) => land(i / 100)));
      if (tone === "dry" || motion === "solid" || motion === "soft") assert.ok(peak <= 1 + 1e-9, `${tone} ${motion} never overshoots`);
    }
  }
  const peak = (f: (x: number) => number) => Math.max(...Array.from({ length: 101 }, (_, i) => f(i / 100)));
  assert.ok(peak(landFor("warm", "springy")) > 1.05);
  assert.ok(peak(landFor("absurdist", "springy")) >= peak(landFor("warm", "springy")) - 0.01);
});

test("older series read as an even brand", () => {
  const { motion, ...old } = DEFAULT_BRAND;
  assert.equal(motion, "even");
  assert.equal(BrandSchema.parse(old).motion, "even");
  assert.equal(BrandSchema.parse({ ...old, motion: "soft" }).motion, "soft");
});

// A stand-in 2D context: keeps the transform (translate, scale, rotate, save, restore) and records where every piece of
// text lands; every other call does nothing.
function recorder() {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const texts: string[] = [];
  const mul = (b: M): M => [m[0] * b[0] + m[2] * b[1], m[1] * b[0] + m[3] * b[1], m[0] * b[2] + m[2] * b[3], m[1] * b[2] + m[3] * b[3], m[0] * b[4] + m[2] * b[5] + m[4], m[1] * b[4] + m[3] * b[5] + m[5]];
  const own: Record<string, unknown> = {
    save: () => stack.push([...m] as M),
    restore: () => (m = stack.pop() ?? m),
    translate: (x: number, y: number) => (m = mul([1, 0, 0, 1, x, y])),
    scale: (x: number, y: number) => (m = mul([x, 0, 0, y, 0, 0])),
    rotate: (a: number) => (m = mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
    fillText: (t: string, x: number, y: number) => texts.push(`${t}@${(m[0] * x + m[2] * y + m[4]).toFixed(1)},${(m[1] * x + m[3] * y + m[5]).toFixed(1)}`),
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

test("with a springy or soft brand, text never moves while it is read", () => {
  const picture = { image: {} as CanvasImageSource, width: 400, height: 400, name: "p" };
  const scenes: MotionScene[] = [
    { ...blankScene("type"), id: "t", seconds: 6, title: "yerba 1 kg", text: "Quedan 3", items: ["Buscar producto", "Buscar"] },
    { ...blankScene("beforeAfter"), id: "b", seconds: 6, title: "Antes y después", items: ["A ojo", "Con IMAN"], asset: "p", assetB: "p", reveal: "iris" },
    { ...blankScene("logo"), id: "l", seconds: 6, title: "IMAN", text: "El pedido, antes del corte" },
    { ...blankScene("product"), id: "p", seconds: 6, title: "Leche", items: ["Quedan 3"], asset: "p" },
  ];
  for (const motion of ["springy", "soft"] as const) {
    for (const sc of scenes) {
      const script = { problem: "", title: "", durationNote: "", note: "", scenes: [sc], music: { mood: "drive" as const, bpm: 110 }, tone: "warm" as const };
      const world = { brand: { ...DEFAULT_BRAND, motion }, assets: { p: picture }, logo: null, beats: [], seed: 7, disclosure: "" };
      const at = (t: number) => {
        const r = recorder();
        drawMotionFrame(r.ctx, 1080, 1920, t, script, world);
        return r.texts;
      };
      assert.deepEqual(at(4), at(5.3), `${motion} ${sc.template}`);
    }
  }
});
