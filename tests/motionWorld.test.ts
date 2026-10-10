// "Un mundo ilustrado de la marca": the place behind an explainer scene is seeded (the same frame every time), keeps the
// brand's text and accent contrast on every tone, never puts busy shapes behind words, and old pieces have none.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, cameraAt, MOTION_CAMERAS, normalizeMotion, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { mergeNote, noteView } from "../shared/motionNote.ts";
import { CONTRAST_ACCENT, CONTRAST_TEXT, DEFAULT_BRAND, STEP_DOWN_CONTRAST, contrastRatio } from "../shared/series.ts";
import {
  WORLD_DEPTH,
  WORLD_PLACES,
  busyClear,
  onFrame,
  pickWorld,
  worldOf,
  worldPalette,
  worldSafe,
  worldShapes,
  worldStepDown,
  type Rect,
} from "../shared/world.ts";
import { drawMotionFrame } from "../src/lib/motion.ts";

const FORMATS: [number, number][] = [
  [1080, 1920],
  [1920, 1080],
];

test("the same place, size and seed always give the same shapes; another seed another layout", () => {
  for (const place of WORLD_PLACES)
    for (const [w, h] of FORMATS) {
      const a = worldShapes(place, w, h, 42);
      assert.deepEqual(a, worldShapes(place, w, h, 42), place);
      assert.ok(a.length > 5, `${place} has shapes`);
      assert.deepEqual([...new Set(a.map((s) => s.layer))].sort(), [0, 1, 2], `${place} has three depth layers`);
      assert.ok(a.some((s) => s.busy) && a.some((s) => !s.busy), `${place} has planes and details`);
      assert.ok(a.every((s) => [s.x, s.y, s.w, s.h].every(Number.isFinite) && s.w > 0 && s.h > 0));
    }
  assert.notDeepEqual(worldShapes("store", 1080, 1920, 1), worldShapes("store", 1080, 1920, 2));
});

test("the floor and the big planes cover the frame past its edges, so the camera never uncovers one", () => {
  for (const place of WORLD_PLACES)
    for (const [w, h] of FORMATS) {
      const floor = worldShapes(place, w, h, 3)[0];
      assert.ok(floor.x <= -w * 0.5 && floor.x + floor.w >= w * 1.5 && floor.y + floor.h >= h * 1.5, place);
    }
});

const BRANDS = [
  DEFAULT_BRAND,
  // IMAN, Máshogar and the music series' kits.
  { bg: "#111418", text: "#f4f1ea", accent: "#00bd74" },
  { bg: "#2c4463", text: "#f4f1ea", accent: "#ff5a36" },
  // Light, with an accent just over 3:1.
  { bg: "#f6f1e7", text: "#1d1d1d", accent: "#c4501e" },
  // Text just over 4.5:1 and an accent just over 3:1 on a mid background.
  { bg: "#5a6b7c", text: "#ffffff", accent: "#e8f4ff" },
  // Already under the thresholds: the world may not make it worse.
  { bg: "#777777", text: "#ffffff", accent: "#999999" },
];

test("every tone of the world keeps the brand's text and accent contrast (or what the brand already has)", () => {
  for (const brand of BRANDS) {
    const p = worldPalette(brand);
    for (const tone of [p.wall, p.far, p.mid, p.near, p.detail]) {
      assert.match(tone, /^#[0-9a-f]{6}$/);
      assert.ok(worldSafe(brand, tone), `${brand.bg} ${tone}`);
      assert.ok(contrastRatio(brand.text, tone) >= Math.min(CONTRAST_TEXT, contrastRatio(brand.text, brand.bg)) - 1e-9);
      assert.ok(contrastRatio(brand.accent, tone) >= Math.min(CONTRAST_ACCENT, contrastRatio(brand.accent, brand.bg)) - 1e-9);
    }
  }
});

test("on the series' dark kits the world is really there, a little off the background", () => {
  for (const brand of BRANDS.slice(0, 3)) {
    const p = worldPalette(brand);
    assert.equal(p.wall, brand.bg);
    for (const tone of [p.far, p.mid, p.near, p.detail]) {
      assert.notEqual(tone, brand.bg);
      // Close to the background: a tint, never a second picture.
      assert.ok(contrastRatio(tone, brand.bg) < 1.6, `${tone} on ${brand.bg}`);
    }
    assert.ok(contrastRatio(p.near, brand.bg) > contrastRatio(p.far, brand.bg), "nearer layers stand out more");
  }
});

test("busy shapes stay clear of the words at every camera position; planes stay", () => {
  const [w, h] = [1080, 1920];
  const words: Rect[] = [
    { x: 86, y: 260, w: 800, h: 220 },
    { x: 86, y: 900, w: 600, h: 120 },
  ];
  const fixed: Rect[] = [{ x: 100, y: 1400, w: 700, h: 110 }];
  for (const place of WORLD_PLACES)
    for (const camera of MOTION_CAMERAS) {
      const cams = [0, 0.25, 0.5, 0.75, 1].map((u) => cameraAt(camera, u));
      const all = worldShapes(place, w, h, 9);
      const kept = busyClear(all, words, cams, w, h, 30, fixed);
      assert.equal(kept.filter((s) => !s.busy).length, all.filter((s) => !s.busy).length);
      assert.ok(kept.length < all.length, `${place} ${camera}: something was left out`);
      for (const s of kept.filter((x) => x.busy))
        for (const u of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
          const cam = cameraAt(camera, u);
          const at = onFrame(s, cam, WORLD_DEPTH[s.layer], w, h);
          const hit = (b: Rect) => at.x < b.x + b.w && b.x < at.x + at.w && at.y < b.y + b.h && b.y < at.y + at.h;
          assert.ok(!words.map((b) => onFrame(b, cam, 1, w, h)).some(hit), `${place} ${camera} ${u}`);
          assert.ok(!fixed.some(hit));
        }
    }
  assert.deepEqual(busyClear(worldShapes("home", w, h, 9), [], [], w, h, 30), worldShapes("home", w, h, 9));
});

test("the writer's place is read tolerantly; a scene keeps its own only where it differs", () => {
  assert.equal(pickWorld("Store"), "store");
  assert.equal(pickWorld("kiosco"), "store");
  assert.equal(pickWorld("la calle"), "street");
  assert.equal(pickWorld("casa"), "home");
  assert.equal(pickWorld("office"), "desk");
  assert.equal(pickWorld("none"), "none");
  assert.equal(pickWorld(""), undefined);
  assert.equal(pickWorld("nothing in particular"), undefined);
  const wire = (world: string | undefined, sceneWorlds: (string | undefined)[]) => ({
    problem: "p",
    title: "t",
    durationNote: "",
    note: "",
    caption: "",
    ...(world !== undefined && { world }),
    music: { mood: "drive", bpm: 110 },
    scenes: sceneWorlds.map((w) => ({ template: "hook", seconds: 3, title: "Hola", text: "", items: [], asset: "", assetB: "", gesture: "", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "", ...(w !== undefined && { world: w }) })),
  });
  const m = normalizeMotion(wire("tienda", ["store", "desk", "none", ""]));
  assert.equal(m.world, "store");
  assert.deepEqual(m.scenes.map((s) => s.world), [undefined, "desk", "none", undefined]);
  assert.deepEqual(m.scenes.map((s) => worldOf(s, m.world)), ["store", "desk", null, "store"]);
  const none = normalizeMotion(wire("none", ["none", "home"]));
  assert.equal(none.world, undefined);
  assert.equal("world" in none, false);
  assert.deepEqual(none.scenes.map((s) => worldOf(s, none.world)), [null, "home"]);
  // Old pieces: no place anywhere.
  const old = normalizeMotion(wire(undefined, [undefined]));
  assert.equal(worldOf(old.scenes[0], old.world), null);
});

const script = (scenes: MotionScene[], extra: Partial<MotionScript> = {}): MotionScript => ({
  problem: "",
  title: "",
  durationNote: "",
  note: "",
  scenes,
  music: { mood: "drive", bpm: 110 },
  tone: "warm",
  ...extra,
});

test("a director's note keeps the piece's place; a scene it moves carries its own", () => {
  const current = script([{ ...blankScene("hook"), id: "a", title: "Uno" }, { ...blankScene("stat"), id: "b", title: "3 minutos" }], { world: "store" });
  assert.match(noteView(current), /"world": "store"/);
  const revised = script([{ ...blankScene("hook"), id: "x", title: "Uno" }, { ...blankScene("stat"), id: "y", title: "3 minutos", world: "street" }], { world: "home" });
  const merged = mergeNote(current, revised, [{ from: "a" }, { from: "b" }]);
  assert.equal(merged.script.world, "store");
  // Scene a now resolves to home (the writer's piece place) and b to the street: both carry their own.
  assert.deepEqual(merged.script.scenes.map((s) => worldOf(s, merged.script.world)), ["home", "street"]);
  // An echo of the same places changes nothing.
  const echo = mergeNote(current, script([{ ...blankScene("hook"), id: "x", title: "Uno" }, { ...blankScene("stat"), id: "y", title: "3 minutos" }], { world: "store" }), [{ from: "a" }, { from: "b" }]);
  assert.deepEqual(echo.changed, []);
});

// A stand-in 2D context that records every call (with its arguments) and measures text at 20 px a letter.
function recorder() {
  const calls: string[] = [];
  const own: Record<string, unknown> = { measureText: (t: string) => ({ width: t.length * 20 }) };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : (...args: unknown[]) => calls.push(`${k}(${args.map((a) => (typeof a === "number" ? a.toFixed(2) : typeof a)).join(",")})`)),
    set: (_o, k: string, v) => {
      calls.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test("frames with a world are a pure function of t, in every template, format, tone and entry", () => {
  const templates: MotionScene[] = [
    { ...blankScene("hook"), id: "h", title: "El corte es a las 18", text: "Y se arma a ojo", voice: "El proveedor corta a las seis." },
    { ...blankScene("steps"), id: "s", title: "Pedí antes", items: ["Abrí Stock", "Marcá", "Mandá"], camera: "push", world: "desk" },
    { ...blankScene("stat"), id: "n", title: "3 minutos", entry: "through", world: "none" },
    { ...blankScene("callouts"), id: "c", title: "Cómo es", items: ["Uno", "Dos"], camera: "pull", world: "street" },
    { ...blankScene("logo"), id: "l", title: "IMAN", text: "Números claros", items: ["Probalo"], camera: "drift" },
  ];
  for (const tone of ["dry", "warm", "absurdist"] as const)
    for (const [w, h] of FORMATS) {
      const sc = script(templates, { tone, world: "store" });
      const world = { brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 5, disclosure: "Hecho con IA" };
      for (const t of [0.2, 3.1, 6.15, 9.05, 13.4]) {
        const a = recorder();
        const b = recorder();
        drawMotionFrame(a.ctx, w, h, t, sc, world);
        drawMotionFrame(b.ctx, w, h, t, sc, world);
        assert.deepEqual(a.calls, b.calls, `${tone} ${w}x${h} at ${t}`);
      }
    }
});

test("the world draws only the brand's tints, and nothing when the piece has none", () => {
  const scenes: MotionScene[] = [{ ...blankScene("hook"), id: "h", title: "Hola", camera: "push" }];
  const world = { brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 5, disclosure: "" };
  const fills = (sc: MotionScript) => {
    const r = recorder();
    drawMotionFrame(r.ctx, 1080, 1920, 1.5, sc, world);
    return r.calls.filter((c) => c.startsWith("fillStyle=")).map((c) => c.slice(10));
  };
  const p = worldPalette(DEFAULT_BRAND);
  const tones = new Set([p.wall, p.far, p.mid, p.near, p.detail]);
  const placed = fills(script(scenes, { world: "store" }));
  for (const t of tones) if (t !== p.detail) assert.ok(placed.includes(t), `${t} drawn`);
  const plain = fills(script(scenes));
  assert.ok(!plain.includes(p.mid) && !plain.includes(p.near));
  // No gradient anywhere.
  const r = recorder();
  drawMotionFrame(r.ctx, 1920, 1080, 1.5, script(scenes, { world: "home" }), world);
  assert.ok(!r.calls.some((c) => /Gradient|shadowBlur/.test(c)));
});

test("over a world, an earlier label steps down only as far as it keeps 3:1 on every tone", () => {
  for (const brand of BRANDS) {
    const p = worldPalette(brand);
    for (const colour of [brand.text, brand.accent])
      for (const share of [0.3, 1]) {
        const c = worldStepDown(colour, brand, p, share);
        for (const tone of [p.wall, p.far, p.mid, p.near, p.detail])
          assert.ok(contrastRatio(c, tone) >= Math.min(STEP_DOWN_CONTRAST, contrastRatio(colour, tone)) - 1e-9, `${colour} over ${tone}`);
      }
    assert.equal(worldStepDown(brand.text, brand, p, 0), brand.text);
  }
});
