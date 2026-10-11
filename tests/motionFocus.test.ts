// "Foco de a uno": in callouts and steps only the newest label is at full strength; the earlier ones step down toward
// the background while a newer one enters, and stay readable (never under 3:1 against the background).
import assert from "node:assert/strict";
import { test } from "node:test";
import { STEP_DOWN_OVER, blankScene, focusShare, sceneElements, stepDownShare, timeScenes, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { DEFAULT_BRAND, STEP_DOWN, STEP_DOWN_CONTRAST, contrastRatio, mixHex, stepDownColour, stepDownContrast, stepDownMix } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { drawMotionFrame } from "../src/lib/motion.ts";
import { measureFacts } from "../src/lib/motionQuality.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("only the newest label is at full strength, and the earlier ones step down as it arrives", () => {
  const times = [0.6, 1.5, 2.4];
  const over = 0.45;
  for (let lt = 0; lt <= 4; lt += 0.05) assert.equal(stepDownShare(times, 2, lt, over), 0, "the last one never steps down");
  // Before the next one arrives: full strength.
  assert.equal(stepDownShare(times, 0, 1.49, over), 0);
  assert.equal(stepDownShare(times, 0, 1.5, over), 0);
  // Halfway through the newcomer's entrance, halfway down (eased); all the way once it is in, and it stays down.
  close(stepDownShare(times, 0, 1.5 + over / 2, over), 0.5);
  assert.equal(stepDownShare(times, 0, 1.5 + over, over), 1);
  assert.equal(stepDownShare(times, 0, 3.9, over), 1);
  // The middle one is the newest until the third arrives.
  assert.equal(stepDownShare(times, 1, 2.39, over), 0);
  assert.equal(stepDownShare(times, 1, 2.4 + over, over), 1);
  // Smooth and never going back up.
  for (const i of [0, 1]) {
    let last = 0;
    for (let lt = 0; lt <= 4; lt += 0.01) {
      const v = stepDownShare(times, i, lt, over);
      assert.ok(v >= last - 1e-12 && v >= 0 && v <= 1);
      assert.ok(v - last < 0.06, "no jump");
      last = v;
    }
  }
});

test("the focus follows arrival time, not the order of the list", () => {
  // A hand-set time put the third label before the second: the second is the newest at the end.
  const times = [0.6, 2.4, 1.5];
  assert.equal(stepDownShare(times, 1, 3.5, 0.45), 0);
  assert.equal(stepDownShare(times, 2, 3.5, 0.45), 1);
  assert.equal(stepDownShare(times, 0, 1.6, 0.45) > 0, true, "the first steps down when the third arrives at 1.5 s");
  // Labels that arrive together share the focus; one that never arrives takes it from nobody.
  assert.equal(stepDownShare([1, 1], 0, 3, 0.45), 0);
  assert.equal(stepDownShare([1, 1], 1, 3, 0.45), 0);
  assert.equal(stepDownShare([0.6, Infinity], 0, 3, 0.45), 0);
  assert.equal(stepDownShare([Infinity, 0.6], 0, 3, 0.45), 0);
  // With no time to take, the step is immediate.
  assert.equal(stepDownShare([0.6, 1.5], 0, 1.5, 0), 1);
  assert.equal(stepDownShare([0.6], 3, 1.5, 0.45), 0);
});

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("callouts"), ...o });

test("a scene's labels and steps take turns; nothing else steps down", () => {
  const callouts = scene({ seconds: 4, title: "Cómo es", items: ["Se pega en un minuto", "Para cualquier puerta", "Se lava"] });
  const at = Object.fromEntries(sceneElements(callouts).map((e) => [e.key, e.at]));
  assert.equal(focusShare(callouts, "item0", at.item1 - 0.01), 0);
  assert.equal(focusShare(callouts, "item0", at.item1 + STEP_DOWN_OVER.callouts!), 1);
  assert.equal(focusShare(callouts, "item1", 3.9), 1);
  assert.equal(focusShare(callouts, "item2", 3.9), 0);
  for (const key of ["title", "media", "voice", "itemX", "item9"]) assert.equal(focusShare(callouts, key, 3.9), 0, key);
  // Steps take the step's own entrance; other templates with items never step down.
  const steps = { ...callouts, template: "steps" as const };
  close(focusShare(steps, "item0", at.item1 + STEP_DOWN_OVER.steps! / 2), 0.5);
  for (const template of ["contradiction", "beforeAfter", "product", "logo", "type"] as const)
    assert.equal(focusShare({ ...callouts, template }, "item0", 3.9), 0, template);
  // A hand-set time moves the hand-over with it; so does the beat (the arranged copy's onBeat).
  const moved = { ...callouts, tweaks: { item1: { at: 3 } } };
  // The third now arrives second: the first steps down for it, and it is the newest until the second comes in.
  assert.equal(focusShare(moved, "item0", at.item2 + 0.45), 1);
  assert.equal(focusShare(moved, "item2", 2.99), 0);
  assert.equal(focusShare(moved, "item2", 3 + 0.45), 1);
  assert.equal(focusShare(moved, "item1", 3.9), 0);
  const beat = { ...callouts, onBeat: { item1: at.item1 + 0.08 } };
  assert.equal(focusShare(beat, "item0", at.item1 + 0.05), 0);
  // An empty label (being typed) never takes the focus.
  const empty = { ...callouts, items: ["Se lava", " "] };
  assert.equal(focusShare(empty, "item0", 3.9), 0);
  // A single label is always the newest.
  assert.equal(focusShare({ ...callouts, items: ["Se lava"] }, "item0", 3.9), 0);
});

test("a stepped-down label stays readable against the background", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#123456", "#abcdef", 0), "#123456");
  assert.equal(mixHex("#123456", "#abcdef", 1), "#abcdef");
  // The default brand has room: the full 60 % (a 0.4 mix toward the background), as steps always had.
  close(stepDownMix(DEFAULT_BRAND.text, DEFAULT_BRAND.bg), STEP_DOWN);
  assert.equal(stepDownColour(DEFAULT_BRAND.text, DEFAULT_BRAND.bg, 1), mixHex(DEFAULT_BRAND.text, DEFAULT_BRAND.bg, STEP_DOWN));
  assert.equal(stepDownColour(DEFAULT_BRAND.text, DEFAULT_BRAND.bg, 0), DEFAULT_BRAND.text);
  const full = contrastRatio(DEFAULT_BRAND.text, DEFAULT_BRAND.bg);
  const down = stepDownContrast(DEFAULT_BRAND);
  assert.ok(down.text < full && down.text >= STEP_DOWN_CONTRAST);
  // Brands with less contrast step down less, never under the floor at any point on the way; a colour already under
  // the floor does not step down at all.
  const brands = [
    { bg: "#ffffff", text: "#767676" }, // 4.5:1
    { bg: "#f4f1ea", text: "#1d4ed8" },
    { bg: "#111418", text: "#ff5a36" },
    { bg: "#0b3d2e", text: "#9fe6c4" },
    { bg: "#fafafa", text: "#ff8a00" }, // under 3:1
    { bg: "#202020", text: "#4a4a4a" }, // under 3:1
  ];
  for (const { bg, text } of brands) {
    const start = contrastRatio(text, bg);
    const k = stepDownMix(text, bg);
    assert.ok(k >= 0 && k <= STEP_DOWN, `${text} on ${bg}`);
    if (start < STEP_DOWN_CONTRAST) assert.equal(stepDownColour(text, bg, 1), text, `${text} on ${bg} is already under the floor`);
    for (let share = 0; share <= 1.0001; share += 0.05)
      assert.ok(contrastRatio(stepDownColour(text, bg, share), bg) >= Math.min(start, STEP_DOWN_CONTRAST) - 1e-9, `${text} on ${bg} at ${share}`);
  }
  // The 4.5:1 grey steps down, but less than the full 0.4.
  const grey = stepDownMix("#767676", "#ffffff");
  assert.ok(grey > 0 && grey < STEP_DOWN);
});

// A stand-in 2D context that records each fill and each piece of text with the colour it was painted in.
function recorder() {
  const ops: { op: "fill" | "text"; style: string; text?: string }[] = [];
  const own: Record<string, unknown> = {
    fillStyle: "#000000",
    fill() {
      ops.push({ op: "fill", style: String(own.fillStyle) });
    },
    fillText(t: string) {
      ops.push({ op: "text", style: String(own.fillStyle), text: t });
    },
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : () => undefined),
    set: (o, k: string, v) => {
      o[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

test("the renderer paints the earlier labels and steps stepped down, the newest at full strength", () => {
  const picture = { image: {} as CanvasImageSource, width: 400, height: 400, name: "p" };
  const items = ["Se pega en un minuto", "Para cualquier puerta", "Se lava"];
  const { text, bg, accent } = DEFAULT_BRAND;
  const downText = stepDownColour(text, bg, 1);
  for (const template of ["callouts", "steps"] as const) {
    const sc = scene({ id: "c", template, seconds: 4, title: "Cómo es", items, asset: "p" });
    const at = Object.fromEntries(sceneElements(sc).map((e) => [e.key, e.at]));
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const script: MotionScript = { problem: "", title: "", durationNote: "", note: "", scenes: [sc], music: { mood: "drive", bpm: 110 }, tone };
      const world = { brand: DEFAULT_BRAND, assets: { p: picture }, logo: null, beats: [], seed: 7, disclosure: "" };
      for (const [w, h] of [
        [1080, 1920],
        [1920, 1080],
      ]) {
        const paint = (t: number) => {
          const r = recorder();
          drawMotionFrame(r.ctx, w, h, t, script, world);
          return r.ops;
        };
        // The colour each label's words (steps) or box (callouts: the fill right before its words) were painted in.
        const look = (ops: ReturnType<typeof paint>, item: string) => {
          const i = ops.findIndex((o) => o.op === "text" && o.text === item);
          assert.ok(i >= 0, `${item} is drawn`);
          return template === "steps" ? ops[i].style : ops.slice(0, i).filter((o) => o.op === "fill").at(-1)!.style;
        };
        const where = `${template} ${tone} ${w}x${h}`;
        const end = paint(3.9);
        assert.equal(look(end, items[0]), downText, where);
        assert.equal(look(end, items[1]), downText, where);
        assert.equal(look(end, items[2]), text, where);
        // Callouts keep their words in the background colour, on the stepped-down box.
        if (template === "callouts") assert.equal(end[end.findIndex((o) => o.op === "text" && o.text === items[0])].style, bg, where);
        // Steps: the earlier number's dot steps down with it; the newest keeps the accent.
        if (template === "steps") {
          const dot = (item: string) => end.slice(0, end.findIndex((o) => o.op === "text" && o.text === item)).filter((o) => o.op === "fill").at(-1)!.style;
          assert.equal(dot(items[0]), stepDownColour(accent, bg, 1), where);
          assert.equal(dot(items[2]), accent, where);
        }
        // Before the second arrives, the first is the newest; during its entrance, on the way down.
        assert.equal(look(paint(at.item1 - 0.02), items[0]), text, where);
        const mid = look(paint(at.item1 + 0.2), items[0]);
        assert.notEqual(mid, text, where);
        assert.notEqual(mid, downText, where);
        // A pure function of t.
        assert.deepEqual(paint(2.7), paint(2.7), where);
      }
    }
  }
});

test("the reviewer is told the dimmer labels are on purpose, with the contrast they keep", () => {
  const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series: "masogar", tone: "warm", narrator: "with" }, null);
  const facts = measureFacts(script, [], "none", {}, [], [], [], DEFAULT_BRAND);
  const line = facts.split("\n").find((l) => l.startsWith("Focus one at a time"));
  assert.ok(line, facts);
  const callouts = timeScenes(script.scenes).find((s) => s.template === "callouts")!;
  assert.ok(line.includes(`scene ${callouts.index + 1} callouts`));
  assert.ok(line.includes(`${stepDownContrast(DEFAULT_BRAND).text.toFixed(1)}:1`));
  // No labels taking turns: no line. No brand: nothing to measure.
  const plain = { ...script, scenes: script.scenes.filter((s) => s.template !== "callouts" && s.template !== "steps") };
  assert.ok(!measureFacts(plain, [], "none", {}, [], [], [], DEFAULT_BRAND).includes("Focus one at a time"));
  assert.ok(!measureFacts(script, [], "none", {}, []).includes("Focus one at a time"));
  // An overlap with a stepped-down label says so, so the reviewer moves the right one.
  const covered = measureFacts(script, [], "none", {}, [], [], [{ t: 9, scene: 3, a: "item0", b: "item2", format: "vertical", down: ["item0"] }], DEFAULT_BRAND);
  assert.ok(covered.includes("scene 3 item0 (stepped down) over item2"));
});

test("the sample pieces show it: IMAN's steps and Máshogar's callouts take turns", () => {
  for (const [series, template] of [
    ["iman", "steps"],
    ["masogar", "callouts"],
  ] as const) {
    const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone: "warm", narrator: "with" }, null);
    const s = script.scenes.find((x) => x.template === template);
    assert.ok(s && s.items.length > 1, series);
    assert.equal(focusShare(s, "item0", s.seconds - 0.01), 1, series);
    assert.equal(focusShare(s, `item${s.items.length - 1}`, s.seconds - 0.01), 0, series);
  }
});
