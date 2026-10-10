// "Desenfoque en los cortes": during the push between scenes a frame is the average of subframes over the shutter
// before it; everywhere else it is drawn once, exactly as without the blur. Still a pure function of t.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLUR_SHUTTER,
  BLUR_SUBFRAMES,
  THROUGH,
  blankScene,
  blurSamples,
  cutBlurOn,
  cutPush,
  newMotionPiece,
  pushWindowAt,
  pushWindows,
  type MotionScene,
  type MotionScript,
  type MotionTone,
} from "../shared/motion.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { drawMotionFrame, type MotionWorld } from "../src/lib/motion.ts";
import { measureFacts } from "../src/lib/motionQuality.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
// Three scenes: 0–3 s, 3–7 s (a cut), 7–10 s (a camera journey).
const SCENES = [
  scene({ id: "a", template: "hook", seconds: 3, title: "El corte es a las 18", voice: "El proveedor corta a las seis." }),
  scene({ id: "b", seconds: 4, title: "Stock en el celular", text: "Lo que queda, sin contar.", voice: "En el celular ves lo que queda." }),
  scene({ id: "c", template: "stat", seconds: 3, title: "3 minutos", entry: "through" }),
];

test("the shutter: 4 to 8 subframes over half a frame at 30 fps", () => {
  assert.ok(BLUR_SUBFRAMES >= 4 && BLUR_SUBFRAMES <= 8);
  close(BLUR_SHUTTER, 1 / 30 / 2);
});

test("the pushes are the tone's cuts and the camera journeys, never past a scene's end", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const push = cutPush(tone);
    const windows = pushWindows(SCENES, push);
    // The journey takes THROUGH in every tone; a dry cut is hard, so it has no push.
    const expected = [...(push > 0 ? [{ start: 3, end: 3 + push }] : []), { start: 7, end: 7 + THROUGH }];
    assert.equal(windows.length, expected.length, tone);
    windows.forEach((w, i) => {
      close(w.start, expected[i].start);
      close(w.end, expected[i].end);
    });
  }
  // A scene shorter than its push is all push, and no more.
  const short = [scene({ seconds: 2 }), scene({ seconds: 0.3 })];
  assert.deepEqual(pushWindows(short, 0.38), [{ start: 2, end: 2.3 }]);
  // The first scene never comes in over anything.
  assert.deepEqual(pushWindows([scene({ seconds: 3, entry: "through" })], 0.38), []);
  assert.deepEqual(pushWindows([], 0.38), []);
});

test("which t are inside a push", () => {
  const push = cutPush("warm");
  assert.equal(pushWindowAt(SCENES, push, 0), null);
  assert.equal(pushWindowAt(SCENES, push, 2.999), null, "the end of the scene before the cut is sharp");
  assert.deepEqual(pushWindowAt(SCENES, push, 3), { start: 3, end: 3 + push });
  assert.deepEqual(pushWindowAt(SCENES, push, 3 + push - 1e-6), { start: 3, end: 3 + push });
  // The window reads scene time against the push, as the drawing does (3.38 - 3 rounds just under 0.38).
  assert.equal(pushWindowAt(SCENES, push, 3 + push + 1e-6), null, "the push is over");
  assert.equal(pushWindowAt(SCENES, push, 5), null);
  assert.deepEqual(pushWindowAt(SCENES, push, 7.5), { start: 7, end: 7 + THROUGH });
  assert.equal(pushWindowAt(SCENES, push, 7 + THROUGH), null);
  assert.equal(pushWindowAt(SCENES, push, -1), null);
  // Dry: the cut is hard, the journey still moves.
  assert.equal(pushWindowAt(SCENES, 0, 3), null);
  assert.equal(pushWindowAt(SCENES, 0, 3.1), null);
  assert.deepEqual(pushWindowAt(SCENES, 0, 7.2), { start: 7, end: 7 + THROUGH });
  assert.equal(pushWindowAt([], 0.38, 1), null);
});

test("the subframes: t alone outside a push; inside, t first and evenly back over the shutter", () => {
  const push = cutPush("warm");
  for (const t of [0, 1.5, 2.99, 3 + push + 1e-6, 5, 9.9]) assert.deepEqual(blurSamples(SCENES, push, t), [{ at: t, weight: 1 }], `${t}`);
  const t = 3.2;
  const samples = blurSamples(SCENES, push, t);
  assert.equal(samples.length, BLUR_SUBFRAMES);
  assert.equal(samples[0].at, t, "the first sample is the frame at t itself");
  samples.forEach((s, k) => {
    close(s.at, t - (BLUR_SHUTTER * k) / (BLUR_SUBFRAMES - 1));
    close(s.weight, 1 / BLUR_SUBFRAMES);
    assert.ok(s.at <= t, "never after t");
  });
  close(samples.at(-1)!.at, t - BLUR_SHUTTER);
  close(
    samples.reduce((n, s) => n + s.weight, 0),
    1,
  );
});

test("the subframes never reach back before the push: they land on its start, merged", () => {
  const push = cutPush("absurdist");
  // At the push's first instant there is nothing before it to blend.
  assert.deepEqual(blurSamples(SCENES, push, 3), [{ at: 3, weight: 1 }]);
  for (const lt of [0.001, 0.005, 0.01, 0.016]) {
    const t = 3 + lt;
    const samples = blurSamples(SCENES, push, t);
    assert.equal(samples[0].at, t);
    assert.ok(samples.every((s) => s.at >= 3 && s.at <= t), `${lt}`);
    // Times only go back, and no two are the same.
    samples.slice(1).forEach((s, k) => assert.ok(s.at < samples[k].at));
    close(
      samples.reduce((n, s) => n + s.weight, 0),
      1,
    );
    // Those that would fall before the cut all sit on its start, together.
    const before = Array.from({ length: BLUR_SUBFRAMES }, (_, k) => t - (BLUR_SHUTTER * k) / (BLUR_SUBFRAMES - 1)).filter((x) => x <= 3).length;
    if (before) {
      assert.equal(samples.at(-1)!.at, 3);
      close(samples.at(-1)!.weight, before / BLUR_SUBFRAMES);
      assert.equal(samples.length, BLUR_SUBFRAMES - before + 1);
    } else assert.equal(samples.length, BLUR_SUBFRAMES);
  }
  // A camera journey blurs in a dry piece too: it is the only thing that moves between scenes there.
  assert.equal(blurSamples(SCENES, 0, 7.35).length, BLUR_SUBFRAMES);
  assert.equal(blurSamples(SCENES, 0, 3.1).length, 1);
});

test("the piece's switch is on by default, and an old piece counts as on", () => {
  assert.equal(newMotionPiece("vertical").cutBlur, true);
  assert.equal(cutBlurOn({}), true);
  assert.equal(cutBlurOn({ cutBlur: undefined }), true);
  assert.equal(cutBlurOn({ cutBlur: true }), true);
  assert.equal(cutBlurOn({ cutBlur: false }), false);
  const { cutBlur: _, ...old } = newMotionPiece("horizontal");
  assert.equal(cutBlurOn({ ...newMotionPiece("horizontal"), ...old }), true);
  assert.equal(cutBlurOn({ ...newMotionPiece("horizontal"), ...old, cutBlur: false }), false);
});

test("the sample pieces have pushes to blur in every tone (the warm and absurdist cuts, and the journey)", () => {
  for (const series of ["iman", "masogar"]) {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone, narrator: "with" }, null);
      const windows = pushWindows(script.scenes, cutPush(tone));
      if (tone !== "dry") assert.equal(windows.length, script.scenes.length - 1, `${series} ${tone}`);
      else assert.equal(windows.length, script.scenes.filter((s) => s.entry === "through").length, `${series} ${tone}`);
    }
  }
});

// A canvas context that writes down what it is asked to draw, with the alpha each call was made at.
type Op = { op: string; args: unknown[]; alpha: number };
function recorder() {
  const ops: Op[] = [];
  let alpha = 1;
  const stack: number[] = [];
  const canvas = { width: 0, height: 0 };
  const own: Record<string, unknown> = {
    canvas,
    save: () => {
      stack.push(alpha);
      ops.push({ op: "save", args: [], alpha });
    },
    restore: () => {
      alpha = stack.pop() ?? alpha;
      ops.push({ op: "restore", args: [], alpha });
    },
    reset: () => {
      alpha = 1;
      stack.length = 0;
      ops.push({ op: "reset", args: [], alpha });
    },
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k === "globalAlpha" ? alpha : k in o ? o[k] : (...args: unknown[]) => ops.push({ op: k, args, alpha })),
    set: (_o, k: string, v: unknown) => {
      if (k === "globalAlpha") alpha = v as number;
      else ops.push({ op: `${k}=`, args: [v], alpha });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, canvas };
}

// A page's document that hands out recording canvases, for the scratch the blur draws its subframes on.
function withDocument<T>(run: (scratches: ReturnType<typeof recorder>[]) => T): T {
  const scratches: ReturnType<typeof recorder>[] = [];
  const g = globalThis as { document?: unknown };
  g.document = {
    createElement: () => {
      const r = recorder();
      scratches.push(r);
      return Object.assign(r.canvas, { getContext: () => r.ctx });
    },
  };
  try {
    return run(scratches);
  } finally {
    delete g.document;
  }
}

const script = (tone: MotionTone): MotionScript => ({ problem: "", title: "", durationNote: "", note: "", scenes: SCENES, music: { mood: "drive", bpm: 110 }, tone });
const world = (cutBlur: boolean): MotionWorld => ({ brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 7, disclosure: "Algunas imágenes están hechas con IA", cutBlur });
const inOutCubic = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const json = (ops: Op[]) => JSON.stringify(ops);

test("outside a push the frame is drawn exactly as without the blur, with no scratch", () => {
  withDocument((scratches) => {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      for (const [w, h] of [
        [1080, 1920],
        [1920, 1080],
      ]) {
        const push = cutPush(tone);
        for (const t of [0.5, 2.99, 3 + push + 0.01, 5, 6.99, 7 + THROUGH, 9.5]) {
          if (pushWindowAt(SCENES, push, t)) continue;
          const off = recorder();
          const on = recorder();
          const boxesOff: string[] = [];
          const boxesOn: string[] = [];
          drawMotionFrame(off.ctx, w, h, t, script(tone), world(false), (id, key, box) => boxesOff.push(`${id}:${key}:${JSON.stringify(box)}`));
          drawMotionFrame(on.ctx, w, h, t, script(tone), world(true), (id, key, box) => boxesOn.push(`${id}:${key}:${JSON.stringify(box)}`));
          assert.equal(json(on.ops), json(off.ops), `${tone} ${w}x${h} at ${t}`);
          assert.deepEqual(boxesOn, boxesOff);
          assert.ok(boxesOn.length > 0, "the editor's hit test still hears the scene");
        }
      }
    }
    assert.equal(scratches.length, 0, "no scratch canvas was ever needed");
  });
});

test("inside a push the frame is the running mean of the subframes, with the subtitle and the notice drawn once, sharp", () => {
  withDocument((scratches) => {
    for (const tone of ["warm", "absurdist"] as const) {
      const push = cutPush(tone);
      const [w, h] = [1080, 1920];
      const t = 3 + push / 2;
      const samples = blurSamples(SCENES, push, t);
      assert.equal(samples.length, BLUR_SUBFRAMES);
      const target = recorder();
      drawMotionFrame(target.ctx, w, h, t, script(tone), world(true));
      const scratch = scratches.at(-1)!;
      assert.equal(scratch.canvas.width, w);
      assert.equal(scratch.canvas.height, h);
      // The target only receives the blended subframes, then the subtitle and the AI notice on top.
      const blends = target.ops.filter((o) => o.op === "drawImage");
      assert.equal(blends.length, BLUR_SUBFRAMES);
      blends.forEach((b, k) => {
        assert.equal(b.args[0], scratch.canvas);
        assert.deepEqual(b.args.slice(1), [0, 0, w, h]);
        close(b.alpha, 1 / (k + 1));
      });
      const lastBlend = target.ops.lastIndexOf(blends.at(-1)!);
      const texts = target.ops.flatMap((o, i) => (o.op === "fillText" ? [{ text: o.args[0], i }] : []));
      assert.deepEqual(
        texts.map((x) => x.text),
        ["En el celular ves lo que queda.", "Algunas imágenes están hechas con IA"],
      );
      assert.ok(texts.every((x) => x.i > lastBlend), "drawn over the blended picture");
      assert.ok(texts.every((x) => target.ops[x.i].alpha === 1), "at full strength");
      // Each subframe starts from a wiped scratch, and shows the push at its own time: the accent bar's place.
      const resets = scratch.ops.flatMap((o, i) => (o.op === "reset" ? [i] : []));
      assert.equal(resets.length, BLUR_SUBFRAMES);
      const unit = Math.min(w, h);
      resets.forEach((from, k) => {
        const to = resets[k + 1] ?? scratch.ops.length;
        const bar = scratch.ops.slice(from, to).filter((o) => o.op === "fillRect" && o.args[1] === 0 && o.args[2] === unit * 0.02 && o.args[3] === h);
        assert.equal(bar.length, 1);
        close(bar[0].args[0] as number, w * (1 - inOutCubic((samples[k].at - 3) / push)) - unit * 0.02, 1e-6);
      });
      // The subtitle never goes into the scratch: it is not blurred.
      assert.ok(!scratch.ops.some((o) => o.op === "fillText" && o.args[0] === "En el celular ves lo que queda."));
    }
  });
});

test("a camera journey blurs in every tone, and the probe hears the frame at t only", () => {
  withDocument((scratches) => {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const t = 7 + THROUGH * 0.6;
      const boxes: string[] = [];
      const plain: string[] = [];
      const target = recorder();
      drawMotionFrame(target.ctx, 1920, 1080, t, script(tone), world(true), (id, key) => boxes.push(`${id}:${key}`));
      drawMotionFrame(recorder().ctx, 1920, 1080, t, script(tone), world(false), (id, key) => plain.push(`${id}:${key}`));
      assert.equal(target.ops.filter((o) => o.op === "drawImage").length, BLUR_SUBFRAMES, tone);
      // During a push nothing is hit-testable, with or without the blur: no subframe ever reports a box.
      assert.deepEqual(boxes, plain);
    }
    assert.ok(scratches.length > 0);
  });
});

test("a blurred frame is a pure function of t: the scratch carries nothing from one frame to the next", () => {
  withDocument((scratches) => {
    const push = cutPush("warm");
    const target = recorder();
    const paint = (t: number) => {
      const from = target.ops.length;
      const scratchFrom = scratches[0]?.ops.length ?? 0;
      drawMotionFrame(target.ctx, 1080, 1920, t, script("warm"), world(true));
      return { target: json(target.ops.slice(from)), scratch: json((scratches[0]?.ops ?? []).slice(scratchFrom)) };
    };
    const first = paint(3 + push * 0.4);
    paint(3 + push * 0.8);
    paint(7.3);
    paint(1);
    assert.equal(scratches.length, 1, "one scratch per target, reused");
    assert.deepEqual(paint(3 + push * 0.4), first);
    // A fresh target paints the same frame the same way.
    const other = recorder();
    drawMotionFrame(other.ctx, 1080, 1920, 3 + push * 0.4, script("warm"), world(true));
    assert.equal(json(other.ops), first.target);
  });
});

test("with no page to borrow a canvas from, the frame is drawn at t alone", () => {
  const push = cutPush("warm");
  const t = 3 + push / 2;
  const on = recorder();
  const off = recorder();
  drawMotionFrame(on.ctx, 1080, 1920, t, script("warm"), world(true));
  drawMotionFrame(off.ctx, 1080, 1920, t, script("warm"), world(false));
  assert.equal(json(on.ops), json(off.ops));
});

test("the reviewer is told the cuts are blurred on purpose, only when they are", () => {
  const line = "Motion blur on the cuts";
  assert.ok(measureFacts(script("warm"), [], "none", {}, [], [], [], DEFAULT_BRAND, true).includes(line));
  assert.ok(!measureFacts(script("warm"), [], "none", {}, [], [], [], DEFAULT_BRAND, false).includes(line));
  assert.ok(!measureFacts(script("warm"), [], "none", {}, []).includes(line));
  // A dry piece with no journey has only hard cuts: nothing is blurred, nothing to say.
  const dry = { ...script("dry"), scenes: SCENES.map((s) => ({ ...s, entry: undefined })) };
  assert.ok(!measureFacts(dry, [], "none", {}, [], [], [], DEFAULT_BRAND, true).includes(line));
  assert.ok(measureFacts(script("dry"), [], "none", {}, [], [], [], DEFAULT_BRAND, true).includes(line));
});
