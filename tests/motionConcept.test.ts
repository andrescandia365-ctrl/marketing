// CONCEPTO / SIMULACIÓN in the explainers: a scene that shows something not on the series' "Lo que existe hoy" carries
// a label on screen; a flagged scene with no label blocks the render until it is labelled, changed or confirmed.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MotionScriptSchema,
  blankScene,
  conceptIssues,
  conceptKey,
  cutPush,
  disclosureAt,
  flagBeyond,
  normalizeMotion,
  pickDisclosure,
  showsSig,
  withBeyond,
  type MotionScene,
  type MotionScript,
} from "../shared/motion.ts";
import { describeScenes, normalizeReview, type MotionReviewWire } from "../shared/motionQuality.ts";
import { safeRect } from "../shared/safeZone.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion, demoMotionReview } from "../server/demo.ts";
import { disclosureBox, drawMotionFrame, labelFloor, type Box } from "../src/lib/motion.ts";
import { measureFacts } from "../src/lib/motionQuality.ts";
import type { z } from "zod";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const script = (scenes: MotionScene[], tone: MotionScript["tone"] = "warm"): MotionScript => ({
  problem: "",
  title: "",
  durationNote: "",
  note: "",
  scenes,
  music: { mood: "drive", bpm: 110 },
  tone,
});

test("the writer's word for a label is read tolerantly; anything else is real", () => {
  for (const v of ["concept", "Concepto", "CONCEPT (roadmap)", "roadmap", "idea"]) assert.equal(pickDisclosure(v), "concept", v);
  for (const v of ["simulation", "Simulación", "simulacion", "mock-up"]) assert.equal(pickDisclosure(v), "simulation", v);
  for (const v of ["real", "", undefined, "none", "live"]) assert.equal(pickDisclosure(v), undefined, String(v));
});

const wireScene = (o: Record<string, unknown>) => ({
  template: "screen",
  seconds: 3,
  title: "Stock",
  text: "",
  items: [],
  asset: "",
  assetB: "",
  gesture: "",
  focusX: 0.5,
  focusY: 0.5,
  zoom: 2,
  voice: "",
  emotion: "",
  ...o,
});
const wire = (scenes: Record<string, unknown>[]): z.infer<typeof MotionScriptSchema> => ({
  problem: "p",
  title: "t",
  durationNote: "",
  scenes: scenes.map(wireScene) as z.infer<typeof MotionScriptSchema>["scenes"],
  music: { mood: "drive", bpm: 110 },
  note: "",
  caption: "",
});

test("normalizeMotion keeps the writer's label and its own grading; an old script has neither", () => {
  const m = normalizeMotion(
    wire([
      { disclosure: "concept", beyondToday: "El robot encargado" },
      { disclosure: "real", beyondToday: "  " },
      { beyondToday: "Predice las ventas" },
      {},
    ]),
    "warm",
  );
  const [a, b, c, d] = m.scenes;
  assert.equal(a.disclosure, "concept");
  assert.deepEqual(a.beyond && { what: a.beyond.what, by: a.beyond.by }, { what: "El robot encargado", by: "ia" });
  assert.equal(b.disclosure, undefined);
  assert.equal(b.beyond, undefined);
  assert.equal(c.disclosure, undefined);
  assert.equal(c.beyond?.what, "Predice las ventas");
  assert.equal(d.beyond, undefined);
  // The wire's own field names never reach the saved scene.
  assert.ok(m.scenes.every((s) => !("beyondToday" in s)));
  // Only the flagged scene with no label is a problem.
  assert.deepEqual(
    conceptIssues(m.scenes).map((i) => i.index),
    [2],
  );
  // The writer's wire schema still parses an old reply with no label fields.
  assert.ok(MotionScriptSchema.safeParse(wire([{}])).success);
});

test("a flagged scene blocks until it is labelled, changed or confirmed", () => {
  const flagged = withBeyond(scene({ id: "a", title: "El robot repone" }), "Un robot que repone", "ia");
  const [issue] = conceptIssues([flagged]);
  assert.deepEqual({ ...issue }, { sceneId: "a", index: 0, what: "Un robot que repone", by: "ia" });
  // Labelled: no problem, as concept or as simulation.
  assert.equal(conceptIssues([{ ...flagged, disclosure: "concept" }]).length, 0);
  assert.equal(conceptIssues([{ ...flagged, disclosure: "simulation" }]).length, 0);
  // Labelled real by hand is still a problem.
  assert.equal(conceptIssues([{ ...flagged, disclosure: "real" }]).length, 1);
  // Changed what it shows or says: the flag no longer applies.
  for (const change of [{ title: "Stock en el celular" }, { text: "otro" }, { items: ["x"] }, { asset: "screen-1" }, { voice: "Otra línea" }, { template: "zoom" as const }])
    assert.equal(conceptIssues([{ ...flagged, ...change }]).length, 0, JSON.stringify(change));
  // Changing only its timing, camera or place keeps it.
  assert.equal(conceptIssues([{ ...flagged, seconds: 5, camera: "push", tweaks: { title: { at: 0.5 } } }]).length, 1);
  // Confirmed by the person.
  assert.equal(conceptIssues([flagged], [conceptKey(issue)]).length, 0);
  // Scenes saved before the label existed are real and never a problem.
  assert.equal(conceptIssues([scene({ id: "old" })]).length, 0);
  assert.equal(withBeyond(scene({}), "   ", "ia").beyond, undefined);
  const longer: MotionScene = { ...flagged, seconds: 7 };
  assert.equal(showsSig(flagged), showsSig(longer));
});

test("the reviewer's flags land on their scenes; the writer's own flag is kept", () => {
  const base = script([scene({ id: "a" }), withBeyond(scene({ id: "b", title: "Robot" }), "Robot del writer", "ia"), scene({ id: "c" })]);
  const out = flagBeyond(base, [
    { scene: 1, what: "Pantalla que no existe" },
    { scene: 2, what: "Otra palabra" },
    { scene: 9, what: "fuera de rango" },
    { scene: 3, what: "  " },
  ]);
  assert.deepEqual(
    out.scenes.map((s) => s.beyond && [s.beyond.what, s.beyond.by]),
    [["Pantalla que no existe", "revisor"], ["Robot del writer", "ia"], undefined],
  );
  // Nothing to flag: the same script back (the studio saves only on a change).
  assert.equal(flagBeyond(base, []), base);
  assert.equal(flagBeyond(out, [{ scene: 1, what: "Pantalla que no existe" }]), out);
  // A stale flag (the scene changed since) is replaced by the new one.
  const stale = { ...base, scenes: [{ ...base.scenes[1], title: "Cambió" }] };
  assert.equal(flagBeyond(stale, [{ scene: 1, what: "Nuevo" }]).scenes[0].beyond?.what, "Nuevo");
});

test("the review's flags are read tolerantly, and an old review with none has none", () => {
  const base: MotionReviewWire = { scores: [], fixes: [], summary: "", poster: 1 };
  assert.deepEqual(normalizeReview(base).beyond, []);
  const r = normalizeReview({
    ...base,
    beyondToday: [
      { scene: 2.2, what: " Un robot " },
      { scene: 0, what: "no" },
      { scene: 3, what: "" },
    ],
  });
  assert.deepEqual(r.beyond, [{ scene: 2, what: "Un robot" }]);
  assert.deepEqual(demoMotionReview(1).beyond ?? [], []);
});

test("the label shows while its scene is on screen, and carries over a push into an unlabelled scene", () => {
  const scenes = [scene({ id: "a", seconds: 3 }), scene({ id: "b", seconds: 3, disclosure: "concept" }), scene({ id: "c", seconds: 3 }), scene({ id: "d", seconds: 3, disclosure: "simulation", entry: "through" })];
  const warm = cutPush("warm");
  assert.equal(disclosureAt(scenes, warm, 1), null);
  assert.equal(disclosureAt(scenes, warm, 3), "concept");
  assert.equal(disclosureAt(scenes, warm, 5.9), "concept");
  // The next scene slides in over the concept: the label stays until the push is over.
  assert.equal(disclosureAt(scenes, warm, 6 + warm / 2), "concept");
  assert.equal(disclosureAt(scenes, warm, 6 + warm + 0.01), null);
  // A hard cut (dry) drops it at the cut.
  assert.equal(disclosureAt(scenes, cutPush("dry"), 6.01), null);
  // A camera journey into a labelled scene shows its label from the start; the last scene keeps it to the end.
  assert.equal(disclosureAt(scenes, warm, 9), "simulation");
  assert.equal(disclosureAt(scenes, warm, 12.5), "simulation");
  assert.equal(disclosureAt([], warm, 1), null);
});

// A stand-in 2D context that records the text drawn and where.
function recorder() {
  const texts: { text: string; x: number; y: number }[] = [];
  const own: Record<string, unknown> = {
    fillText(t: string, x: number, y: number) {
      texts.push({ text: t, x, y });
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
  return { ctx, texts };
}

const world = { brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 7, disclosure: "Imágenes hechas con IA" };

test("the renderer draws the label inside the safe zone on both formats and every tone, and keeps the title under it", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    for (const disclosure of ["concept", "simulation"] as const) {
      for (const template of ["screen", "zoom", "steps", "product", "callouts", "beforeAfter", "contradiction"] as const) {
        const sc = script([scene({ id: "a", template, seconds: 4, title: "Un título bastante largo para dos líneas", items: ["uno", "dos"], disclosure })], tone);
        for (const [w, h] of [
          [1080, 1920],
          [1920, 1080],
        ]) {
          const where = `${tone} ${disclosure} ${template} ${w}x${h}`;
          const r = recorder();
          const boxes = new Map<string, Box>();
          drawMotionFrame(r.ctx, w, h, 3, sc, world, (_id, key, box) => boxes.set(key, box));
          const tag = disclosure === "concept" ? "CONCEPTO" : "SIMULACIÓN";
          assert.ok(r.texts.some((t) => t.text === tag), where);
          const box = disclosureBox(recorder().ctx, w, h, 3, sc, world)!;
          const safe = safeRect(w, h);
          assert.ok(box.x >= safe.x && box.y >= safe.y && box.x + box.w <= safe.x + safe.w && box.y + box.h <= safe.y + safe.h, `${where} ${JSON.stringify(box)}`);
          // The scene's title starts under the label.
          const title = boxes.get("title");
          assert.ok(title, where);
          assert.ok(title.y >= box.y + box.h - 1, `${where}: title at ${title.y}, label ends at ${box.y + box.h}`);
          assert.ok(labelFloor(w, h) > box.y + box.h);
        }
      }
    }
    // An unlabelled scene draws no label and keeps its layout.
    const plain = script([scene({ id: "a", seconds: 4, title: "Stock" })], tone);
    const r = recorder();
    drawMotionFrame(r.ctx, 1080, 1920, 3, plain, world);
    assert.ok(!r.texts.some((t) => t.text === "CONCEPTO" || t.text === "SIMULACIÓN"));
    assert.equal(disclosureBox(recorder().ctx, 1080, 1920, 3, plain, world), null);
  }
});

test("the reviewer reads which scenes are labelled and which are flagged", () => {
  const sc = script([scene({ id: "a", disclosure: "simulation" }), withBeyond(scene({ id: "b", title: "Robot" }), "Un robot que repone", "ia"), scene({ id: "c" })]);
  const text = describeScenes(sc.scenes);
  assert.match(text, /Scene 1 [^\n]*labelled SIMULACIÓN/);
  assert.match(text, /Scene 2 [^\n]*flagged by the writer [^\n]*"Un robot que repone"/);
  assert.doesNotMatch(text.split("\n")[2], /labelled|flagged/);
  const facts = measureFacts(sc, [], "none", {}, []);
  const line = facts.split("\n").find((l) => l.startsWith("Concept / simulation labels"));
  assert.ok(line, facts);
  assert.match(line, /scene 1 SIMULACIÓN/);
  assert.match(line, /scene 2 \("Un robot que repone"\)/);
});

test("the sample pieces: IMAN shows its unlisted feature as a labelled concept; nothing blocks", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const iman = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series: "iman", tone, narrator: "with" }, null);
    const concept = iman.scenes.filter((s) => s.disclosure === "concept");
    assert.equal(concept.length, 1, tone);
    assert.ok(concept[0].beyond?.what);
    assert.equal(conceptIssues(iman.scenes).length, 0);
    const shop = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series: "masogar", tone, narrator: "with" }, null);
    assert.ok(shop.scenes.every((s) => s.disclosure === undefined && !s.beyond));
  }
});
