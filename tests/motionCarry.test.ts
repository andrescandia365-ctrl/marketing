// "Corte por continuidad": when two scenes in a row show the same main picture, the cut carries it from where it was
// to where it settles (a match move) instead of the tone's push. The matching rule, its timing in every check, and the
// carried picture's boxes (a pure function of the templates' layout) that land exactly where the scenes draw it.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blankScene,
  carriedAsset,
  carryOf,
  cutPush,
  entryOf,
  normalizeMotion,
  posterTime,
  pushOf,
  pushWindows,
  readingIssues,
  revealTimes,
  samePicture,
  timeScenes,
  type MotionScene,
  type MotionScript,
  type MotionTone,
} from "../shared/motion.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { carryBox, carryCurve, drawMotionFrame, landFor, lerpBox, mediaLayout, type CarryBox, type CarryLook, type MotionWorld } from "../src/lib/motion.ts";
import { soundHits } from "../src/lib/motionProject.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });

test("the main picture: a hook's, a real screen's, the callouts' and the product's image, what a character presents", () => {
  assert.deepEqual(carriedAsset(scene({ template: "screen", asset: "s" })), { id: "s", key: "media" });
  assert.deepEqual(carriedAsset(scene({ template: "zoom", asset: "s" })), { id: "s", key: "media" });
  assert.deepEqual(carriedAsset(scene({ template: "hook", asset: "layer:2" })), { id: "layer:2", key: "media" });
  assert.deepEqual(carriedAsset(scene({ template: "callouts", asset: "p" })), { id: "p", key: "media" });
  assert.deepEqual(carriedAsset(scene({ template: "product", asset: "p" })), { id: "p", key: "media" });
  assert.deepEqual(carriedAsset(scene({ template: "character", asset: "host", assetB: "s" })), { id: "s", key: "prop" });
  // A character's own figure is not carried; nor are steps, before/after or scenes with no picture.
  assert.equal(carriedAsset(scene({ template: "character", asset: "host", assetB: "" })), null);
  for (const template of ["steps", "beforeAfter", "type", "contradiction", "stat", "logo"] as const) {
    assert.equal(carriedAsset(scene({ template, asset: "p", assetB: "p" })), null, template);
  }
  assert.equal(carriedAsset(scene({ template: "screen", asset: "" })), null);
});

test("the cut carries the picture by itself only when both scenes show the same one, and the person's choice wins", () => {
  const a = scene({ template: "screen", asset: "s" });
  const same = scene({ template: "zoom", asset: "s" });
  const other = scene({ template: "zoom", asset: "t" });
  assert.equal(samePicture(a, same), true);
  assert.equal(samePicture(a, other), false);
  assert.equal(samePicture(undefined, same), false);
  // No entry: "Continuidad" when the pictures match, else the cut.
  assert.equal(entryOf(a, same), "match");
  assert.equal(entryOf(a, other), "cut");
  // The first scene always comes in by the cut.
  assert.equal(entryOf(undefined, same), "cut");
  // Picked by hand: the cut stays a cut, the journey stays a journey, and "Continuidad" falls back when they differ.
  assert.equal(entryOf(a, { ...same, entry: "cut" }), "cut");
  assert.equal(entryOf(a, { ...same, entry: "through" }), "through");
  assert.equal(entryOf(a, { ...same, entry: "match" }), "match");
  assert.equal(entryOf(a, { ...other, entry: "match" }), "cut");
  // The host presenting the screen, then the screen; the product, then its callouts.
  assert.equal(entryOf(scene({ template: "character", asset: "host", assetB: "s" }), scene({ template: "screen", asset: "s" })), "match");
  assert.equal(entryOf(scene({ template: "product", asset: "p" }), scene({ template: "callouts", asset: "p" })), "match");
  // Same picture but the old scene draws it greyed or not at all: no carry.
  assert.equal(entryOf(scene({ template: "beforeAfter", asset: "p", assetB: "p" }), scene({ template: "product", asset: "p" })), "cut");
});

test("timeScenes marks the carry, and works it out again on scenes that were timed before", () => {
  const scenes = [scene({ id: "a", asset: "s" }), scene({ id: "b", template: "zoom", asset: "s" }), scene({ id: "c", template: "zoom", asset: "t" })];
  const timed = timeScenes(scenes);
  assert.deepEqual(timed.map((s) => s.carryIn ?? false), [false, true, false]);
  // Old scenes saved before the carry existed have no carryIn; a stale one is dropped when the neighbour changes.
  const changed = timed.map((s, i) => (i === 0 ? { ...s, asset: "other" } : s));
  assert.deepEqual(timeScenes(changed).map((s) => s.carryIn ?? false), [false, false, false]);
});

test("the carry takes its own time per tone (dry short), and every check waits for it", () => {
  const [a, b, c] = timeScenes([scene({ id: "a", asset: "s" }), scene({ id: "b", template: "zoom", asset: "s" }), scene({ id: "c", asset: "t" })]);
  const lengths: Record<MotionTone, number> = { dry: 0, warm: 0, absurdist: 0 };
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const push = cutPush(tone);
    lengths[tone] = carryOf(push);
    assert.equal(pushOf(a, push), 0);
    assert.equal(pushOf(b, push), carryOf(push));
    assert.equal(pushOf(c, push), push);
  }
  assert.ok(lengths.dry > 0 && lengths.dry < lengths.absurdist && lengths.absurdist < lengths.warm);
  assert.ok(lengths.warm <= 0.7);
  // A dry piece's hard cut has no push, but its carry does: the blur, the poster and the reading check all see it.
  const scenes = [scene({ id: "a", seconds: 3, asset: "s" }), scene({ id: "b", template: "zoom", seconds: 3, asset: "s" })];
  assert.deepEqual(pushWindows(scenes, 0), [{ start: 3, end: 3 + carryOf(0) }]);
  assert.ok(posterTime(scenes, { t: 3.1 }, 0) >= 3 + carryOf(0));
  // A short title in the incoming scene is read only once the carry is done (warm: 0.6 s instead of the 0.38 s push).
  const short = [scene({ id: "a", seconds: 3, asset: "s" }), scene({ id: "b", template: "hook", seconds: 1.3, asset: "s", title: "Ojo" })];
  assert.equal(readingIssues(short.map((s, i) => (i ? { ...s, asset: "t" } : s)), cutPush("warm")).length, 0);
  assert.equal(readingIssues(short, cutPush("warm")).length, 1);
});

test("a carried picture arrives with the cut: the 2-to-4-seconds check and the sound know it", () => {
  // A hook's picture enters at 0.3 s on its own; carried, it is there from the cut.
  const [, b] = timeScenes([scene({ id: "a", asset: "p" }), scene({ id: "b", template: "hook", title: "Hola", asset: "p" })]);
  assert.ok(b.carryIn);
  assert.ok(!revealTimes(b, 0).includes(0.3));
  const script = (tone: MotionTone): MotionScript => ({
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    tone,
    music: { mood: "drive", bpm: 110 },
    scenes: [scene({ id: "a", template: "product", asset: "p", seconds: 3 }), scene({ id: "b", template: "callouts", asset: "p", seconds: 3, items: ["Uno"] }), scene({ id: "c", template: "product", asset: "q", seconds: 3 })],
  });
  for (const tone of ["warm", "absurdist"] as const) {
    const hits = soundHits(script(tone));
    // A soft move cue in the middle of the carry, no whoosh on it; the next plain cut keeps its whoosh.
    assert.deepEqual(hits.filter((h) => h.kind === "glide").map((h) => h.at), [3 + carryOf(cutPush(tone)) / 2]);
    assert.deepEqual(hits.filter((h) => h.kind === "whoosh").map((h) => h.at), [6]);
  }
  // Dry: no move cue (and no whoosh).
  assert.equal(soundHits(script("dry")).filter((h) => h.kind === "glide" || h.kind === "whoosh").length, 0);
  // A product carried into a product scene does not sound its reveal again.
  const twice = { ...script("warm"), scenes: [scene({ id: "a", template: "product", asset: "p" }), scene({ id: "b", template: "product", asset: "p" })] };
  assert.equal(soundHits(twice).filter((h) => h.kind === "reveal").length, 1);
});

test("the writer's word for the carry comes back as a value; its plain cut lets the carry happen by itself", () => {
  const wire = {
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    caption: "",
    music: { mood: "drive", bpm: 110 },
    scenes: ["cut", "match", "continuidad", "through", ""].map((entry) => ({ ...scene({}), template: "screen", gesture: "", move: "", reveal: "", entry })),
  };
  assert.deepEqual(
    normalizeMotion(wire).scenes.map((s) => s.entry),
    [undefined, "match", "match", "through", undefined],
  );
});

test("the sample pieces show the carry (the product into its callouts, the host's screen into the screen)", () => {
  for (const series of ["iman", "masogar"]) {
    const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone: "warm", narrator: "with" }, null);
    const timed = timeScenes(script.scenes);
    // IMAN: the host presents the real screen, then the screen. Máshogar: the product into its callouts, when its cast
    // has a product.
    const product = timed.find((s) => s.template === "product")?.asset;
    if (series === "iman" || product) assert.ok(timed.some((s) => s.carryIn), series);
    // Never on a journey.
    assert.ok(timed.every((s) => !(s.carryIn && s.entry === "through")), series);
  }
});

// ── The boxes ────────────────────────────────────────────────────────────────────

const LOOK: CarryLook = { aspect: 0.5, screen: true, notice: true, seed: 3 };
const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) <= by;
const sameBox = (a: Pick<CarryBox, "x" | "y" | "w" | "h">, b: Pick<CarryBox, "x" | "y" | "w" | "h">, by = 0.5) =>
  near(a.x, b.x, by) && near(a.y, b.y, by) && near(a.w, b.w, by) && near(a.h, b.h, by);

test("the boxes come from the templates' layout: a device's screen, an image fitted in its box", () => {
  for (const [w, h] of [
    [1080, 1920],
    [1920, 1080],
  ]) {
    const [s] = timeScenes([scene({ template: "screen", asset: "p", camera: "hold" })]);
    const L = mediaLayout(s, w, h, true)!;
    const b = carryBox(s, 2, w, h, LOOK)!;
    // A portrait screen fills the device's height, centred on the layout's centre.
    assert.ok(near(b.h, L.maxH) && near(b.w, L.maxH * 0.5) && near(b.x + b.w / 2, L.cx) && near(b.y + b.h / 2, L.cy), `${w}x${h}`);
    assert.ok(b.bezel > 0 && b.inner > 0);
    // Callouts fit the image inside their box, with no device.
    const [c] = timeScenes([scene({ template: "callouts", asset: "p" })]);
    const Lc = mediaLayout(c, w, h, true)!;
    const bc = carryBox(c, 2, w, h, LOOK)!;
    assert.ok(bc.w <= Lc.maxW + 0.5 && bc.h <= Lc.maxH + 0.5 && (near(bc.w, Lc.maxW) || near(bc.h, Lc.maxH)), `${w}x${h}`);
    assert.equal(bc.bezel, 0);
  }
});

test("the zoom, the hand adjustment and the camera move the box as they move the picture", () => {
  const w = 1080;
  const h = 1920;
  const [z] = timeScenes([scene({ template: "zoom", asset: "p", zoom: 2, focusX: 0.5, focusY: 0.5, seconds: 4 })]);
  const before = carryBox(z, 0, w, h, LOOK)!;
  const after = carryBox(z, 3.9, w, h, LOOK)!;
  // Zoomed in twice on the centre: twice as big, same centre.
  assert.ok(near(after.w, before.w * 2, 1) && near(after.x + after.w / 2, before.x + before.w / 2, 1));
  const [moved] = timeScenes([scene({ template: "screen", asset: "p", tweaks: { media: { v: { dx: 0.1, scale: 0.5 } } } })]);
  const [plain] = timeScenes([scene({ template: "screen", asset: "p" })]);
  const m = carryBox(moved, 3, w, h, LOOK)!;
  const p = carryBox(plain, 3, w, h, LOOK)!;
  assert.ok(near(m.w, p.w / 2) && near(m.x + m.w / 2, p.x + p.w / 2 + 0.1 * w));
  const [pushed] = timeScenes([scene({ template: "screen", asset: "p", camera: "push", seconds: 3 })]);
  assert.ok(carryBox(pushed, 3, w, h, LOOK)!.w > p.w * 1.1);
});

test("the interpolation runs from one box to the other, and a dry carry never overshoots", () => {
  const a: CarryBox = { x: 0, y: 0, w: 100, h: 200, rot: 0, bezel: 10, outer: 20, inner: 16, base: 0 };
  const b: CarryBox = { x: 300, y: 100, w: 200, h: 100, rot: 0.04, bezel: 0, outer: 0, inner: 0, base: 0 };
  assert.deepEqual(lerpBox(a, b, 0), a);
  assert.deepEqual(lerpBox(a, b, 1), b);
  const mid = lerpBox(a, b, 0.5);
  assert.deepEqual([mid.x, mid.y, mid.w, mid.h, mid.bezel, mid.rot], [150, 50, 150, 150, 5, 0.02]);
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const curve = carryCurve(landFor(tone, undefined));
    assert.equal(curve(0), 0);
    assert.ok(near(curve(1), 1, 1e-9));
    // It starts gently (no jump at the cut).
    assert.ok(curve(0.05) < 0.1, tone);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => curve(i / 100)));
    if (tone === "dry") assert.ok(peak <= 1 + 1e-9);
  }
});

// A stand-in 2D context: keeps the transform and a clip to nothing (what hides a carried element), and records where
// each picture is drawn, in frame coordinates (no rotation in these scenes).
function recorder(image: object) {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  let empty = false;
  let lastRect: number[] | null = null;
  const stack: [M, boolean][] = [];
  const drawn: { x: number; y: number; w: number; h: number }[] = [];
  const mul = (b: M): M => [m[0] * b[0] + m[2] * b[1], m[1] * b[0] + m[3] * b[1], m[0] * b[2] + m[2] * b[3], m[1] * b[2] + m[3] * b[3], m[0] * b[4] + m[2] * b[5] + m[4], m[1] * b[4] + m[3] * b[5] + m[5]];
  const own: Record<string, unknown> = {
    save: () => stack.push([[...m] as M, empty]),
    restore: () => ([m, empty] = stack.pop() ?? [m, empty]),
    translate: (x: number, y: number) => (m = mul([1, 0, 0, 1, x, y])),
    scale: (x: number, y: number) => (m = mul([x, 0, 0, y, 0, 0])),
    rotate: (a: number) => (m = mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
    beginPath: () => (lastRect = null),
    rect: (...r: number[]) => (lastRect = r),
    roundRect: (...r: number[]) => (lastRect = r),
    clip: () => {
      if (lastRect && lastRect[2] === 0 && lastRect[3] === 0) empty = true;
    },
    measureText: (t: string) => ({ width: t.length * 20 }),
    drawImage: (img: object, x: number, y: number, w: number, h: number) => {
      if (img !== image || empty) return;
      drawn.push({ x: m[0] * x + m[4], y: m[3] * y + m[5], w: m[0] * w, h: m[3] * h });
    },
  };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, drawn };
}

test("the carry starts where the old scene left the picture and lands where the new one draws it, drawn once", () => {
  const image = {};
  const picture = { image: image as CanvasImageSource, width: 400, height: 800, name: "p", screen: true };
  for (const [w, h] of [
    [1080, 1920],
    [1920, 1080],
  ]) {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const script: MotionScript = {
        problem: "",
        title: "",
        durationNote: "",
        note: "",
        tone,
        music: { mood: "drive", bpm: 110 },
        scenes: [
          scene({ id: "a", template: "screen", asset: "p", seconds: 3, camera: "hold", title: "Stock" }),
          scene({ id: "b", template: "callouts", asset: "p", seconds: 3, camera: "hold", title: "Lo que falta", items: ["Uno"] }),
        ],
      };
      const world: MotionWorld = { brand: DEFAULT_BRAND, assets: { p: picture }, logo: null, beats: [], seed: 7, disclosure: "Hecho con IA" };
      const at = (t: number) => {
        const r = recorder(image);
        drawMotionFrame(r.ctx, w, h, t, script, world);
        return r.drawn;
      };
      const coming = carryOf(cutPush(tone));
      const timed = timeScenes(script.scenes);
      const look: CarryLook = { aspect: 0.5, screen: true, notice: true, seed: 7 };
      const from = carryBox(timed[0], 3 - 0.001, w, h, look)!;
      // Settled at the end of the old scene, the screen sits where the carry starts.
      const [last] = at(2.99);
      assert.ok(sameBox(last, from, 1), `${tone} ${w}x${h} old scene`);
      // Inside the carry, the picture is drawn once (both scenes hide their own copy), on its way.
      const start = at(3.0001);
      assert.equal(start.length, 1, `${tone} ${w}x${h} drawn once`);
      assert.ok(sameBox(start[0], from, 1), `${tone} ${w}x${h} starts where it was`);
      const middle = at(3 + coming / 2);
      assert.equal(middle.length, 1);
      // Just after the carry, the new scene draws it itself, right where the carry landed.
      const [settled] = at(3 + coming + 0.01);
      assert.ok(sameBox(settled, carryBox(timed[1], coming + 0.01, w, h, look)!, 1), `${tone} ${w}x${h} lands`);
      const [end] = at(3 + coming - 0.0001);
      assert.ok(sameBox(end, settled, 2), `${tone} ${w}x${h} no jump at the end`);
    }
  }
});
