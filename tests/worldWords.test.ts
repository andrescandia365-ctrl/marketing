// Revisión del mundo ilustrado: the type template's field and a later "Casilleros" row are words, so busy world shapes
// stay out from behind them; an object that loses a busy part goes whole (no empty monitor bezel as a slab).
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { busyClear, worldShapes, type Rect } from "../shared/world.ts";
import { drawMotionFrame } from "../src/lib/motion.ts";

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

const script = (scenes: MotionScene[]): MotionScript => ({ problem: "", title: "", durationNote: "", note: "", scenes, music: { mood: "drive", bpm: 110 }, tone: "warm", world: "store" });
const world = (seed: number) => ({ brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed, disclosure: "Hecho con IA" });
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmt = (n: number) => n.toFixed(2);

// The busy rects of the store (camera "hold": drawn where worldShapes puts them) that the frame drew inside `area`.
function busyDrawnIn(calls: string[], area: Rect, w: number, h: number, seed: number) {
  const busy = worldShapes("store", w, h, seed).filter((s) => s.busy && s.kind === "rect" && hit(s, area));
  return { candidates: busy.length, drawn: busy.filter((s) => calls.includes(`fillRect(${fmt(s.x)},${fmt(s.y)},${fmt(s.w)},${fmt(s.h)})`)).length };
}

test("the type template's field keeps busy world shapes out from behind it (and its placeholder)", () => {
  const [w, h] = [1080, 1920];
  const scene: MotionScene = { ...blankScene("type"), id: "t", seconds: 4.5, title: "yerba 1 kg", items: ["Buscar producto", "Buscar"] };
  for (const seed of [3, 7, 11]) {
    const boxes: Record<string, Rect> = {};
    const r = recorder();
    drawMotionFrame(r.ctx, w, h, 3, script([scene]), world(seed), (_id, key, box) => (boxes[key] = box));
    assert.ok(boxes.media, "the field is reported");
    const { candidates, drawn } = busyDrawnIn(r.calls, boxes.media, w, h, seed);
    assert.ok(candidates > 0, `seed ${seed}: the store has busy shapes where the field is`);
    assert.equal(drawn, 0, `seed ${seed}: busy shapes drawn inside the field`);
  }
});

test("a later Casilleros scene keeps busy world shapes out from behind its box names", () => {
  const [w, h] = [1080, 1920];
  const scenes: MotionScene[] = [
    { ...blankScene("slots"), id: "a", seconds: 3, title: "Antes del corte", items: ["Qué queda", "Qué falta"] },
    { ...blankScene("slots"), id: "b", seconds: 3, title: "Ya sabés qué queda", items: [] },
  ];
  for (const seed of [3, 7, 11]) {
    const boxes: Record<string, Rect> = {};
    const r = recorder();
    drawMotionFrame(r.ctx, w, h, 4.5, script(scenes), world(seed), (id, key, box) => {
      if (id === "b") boxes[key] = box;
    });
    assert.ok(boxes.media, "the row is reported");
    const { candidates, drawn } = busyDrawnIn(r.calls, boxes.media, w, h, seed);
    assert.ok(candidates > 0, `seed ${seed}: the store has busy shapes where the row is`);
    assert.equal(drawn, 0, `seed ${seed}: busy shapes drawn behind the row`);
  }
});

test("an object that loses a busy part goes whole: no monitor bezel left as a slab behind the subtitle", () => {
  for (const [w, h] of [
    [1080, 1920],
    [1920, 1080],
  ])
    for (const seed of [1, 7, 9]) {
      const all = worldShapes("desk", w, h, seed);
      const groups = new Set(all.filter((s) => s.group !== undefined).map((s) => s.group));
      assert.ok(groups.size >= 3, "the board, the monitor and the lamp are objects");
      // A band across the monitor's screen (the subtitle and the notice on 9:16).
      const monitor = all.filter((s) => s.layer === 1 && s.group !== undefined && !s.busy && s.kind === "round")[0];
      const band: Rect = { x: 0, y: monitor.y + monitor.h * 0.6, w, h: 40 };
      const kept = busyClear(all, [], [{ z: 1, x: 0, y: 0 }], w, h, 10, [band]);
      for (const g of groups) {
        const parts = all.filter((s) => s.group === g).length;
        const left = kept.filter((s) => s.group === g).length;
        assert.ok(left === 0 || left === parts, `seed ${seed} group ${g}: ${left} of ${parts} parts`);
      }
      assert.ok(!kept.includes(monitor), "the bezel goes with its screen");
      // Shapes outside any object still go one by one, and planes stay.
      assert.ok(kept.some((s) => !s.busy && s.group === undefined));
    }
});
