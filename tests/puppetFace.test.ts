import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTION_GESTURES } from "../shared/motion.ts";
import { guessRole, PuppetSchema, type PuppetRole } from "../shared/series.ts";
import {
  MOUTH_CLOSED,
  MOUTH_HOLD,
  drawPuppet,
  expressionFor,
  faceLayer,
  mouthBlockStart,
  mouthLayer,
  mouthShape,
  puppetPose,
  viewFor,
  viewLayer,
  type PuppetAsset,
  type PuppetPart,
} from "../src/lib/puppet.ts";

test("silence closes the mouth at once; a voice opens it by its level", () => {
  for (let t = 0; t < 5; t += 0.013) {
    assert.equal(mouthShape(0, 0.9, t, 3), "closed");
    assert.equal(mouthShape(MOUTH_CLOSED - 0.01, 0.9, t, 3), "closed");
    assert.notEqual(mouthShape(0.5, 0.5, t, 3), "closed");
  }
  const count = (level: number) => {
    const n = { A: 0, O: 0, E: 0, closed: 0 };
    for (let b = 0; b < 400; b++) n[mouthShape(level, level, b * MOUTH_HOLD + 0.03, 9)]++;
    return n;
  };
  const loud = count(0.9);
  const soft = count(0.2);
  assert.ok(loud.A > loud.O && loud.E === 0, `loud: ${JSON.stringify(loud)}`);
  assert.ok(soft.E > soft.O && soft.A === 0, `soft: ${JSON.stringify(soft)}`);
  const mid = count(0.45);
  assert.ok(mid.O > 0 && mid.E > 0 && mid.A === 0, `mid: ${JSON.stringify(mid)}`);
});

test("the open shape holds through its block and is the same on every call", () => {
  for (let b = 0; b < 50; b++) {
    const start = b * MOUTH_HOLD;
    const first = mouthShape(0.7, 0.7, start + 0.001, 4);
    for (let dt = 0.001; dt < MOUTH_HOLD - 0.002; dt += 0.01) {
      // The level moves inside the block; the shape follows the level held at its start.
      assert.equal(mouthShape(0.3 + dt * 3, 0.7, start + dt, 4), first);
    }
    assert.equal(mouthShape(0.7, 0.7, start + 0.05, 4), mouthShape(0.7, 0.7, start + 0.05, 4));
  }
  assert.ok(Math.abs(mouthBlockStart(1.234) - 1.2) < 1e-9);
  assert.ok(Math.abs(mouthBlockStart(0.3) - 0.3) < 1e-9);
  // Not the same shape for ever: it alternates between blocks.
  const shapes = new Set(Array.from({ length: 40 }, (_, b) => mouthShape(0.45, 0.45, b * MOUTH_HOLD + 0.02, 1)));
  assert.ok(shapes.size > 1);
});

test("a shape falls back to the nearest open mouth the puppet has", () => {
  const has = (roles: PuppetRole[]) => (r: PuppetRole) => roles.includes(r);
  assert.equal(mouthLayer("closed", has([])), "mouth");
  assert.equal(mouthLayer("A", has(["mouthA", "mouthO"])), "mouthA");
  assert.equal(mouthLayer("A", has(["mouthE"])), "mouthE");
  assert.equal(mouthLayer("E", has(["mouthO", "mouthA"])), "mouthO");
  assert.equal(mouthLayer("O", has([])), null);
});

test("the line's emotion picks the face, in Spanish or English, neutral otherwise", () => {
  const cases: [string, string][] = [
    ["contenta", "happy"],
    ["Cálida", "happy"],
    ["con una sonrisa", "happy"],
    ["excited", "happy"],
    ["sorprendido", "surprised"],
    ["desconcertado", "surprised"],
    ["amazed", "surprised"],
    ["preocupada", "worried"],
    ["cansada", "worried"],
    ["anxious, tired", "worried"],
    ["tranquilo", "neutral"],
    ["segura", "neutral"],
    ["", "neutral"],
    ["contenta pero nerviosa", "happy"],
    ["nerviosa pero contenta", "worried"],
    ["sin miedo, tranquila", "neutral"],
    ["no preocupada, contenta", "happy"],
  ];
  for (const [emotion, face] of cases) assert.equal(expressionFor(emotion), face, emotion);
  assert.equal(faceLayer("neutral"), null);
  assert.equal(faceLayer("worried"), "faceWorried");
});

test("the figure turns toward what it points at, from the gesture's move on", () => {
  assert.equal(viewFor("point", -0.05, false), "front");
  assert.equal(viewFor("point", 0.01, false), "side");
  assert.equal(viewFor("present", 0.5, true), "threeQuarter");
  assert.equal(viewFor("present", 0.5, false), "front");
  for (const g of ["wave", "cheer", "surprise"] as const) assert.equal(viewFor(g, 1, true), "front");
  const has = (roles: PuppetRole[]) => (r: PuppetRole) => roles.includes(r);
  assert.equal(viewLayer("side", has(["view34"])), "view34");
  assert.equal(viewLayer("threeQuarter", has(["viewSide"])), "viewSide");
  assert.equal(viewLayer("side", has([])), null);
  assert.equal(viewLayer("front", has(["viewSide"])), null);
});

test("the pose carries the face: emotion, gesture overrides and facing", () => {
  const at = (gesture: (typeof MOTION_GESTURES)[number], lt: number, emotion: string, toward = 1, aiming = false) =>
    puppetPose(10 + lt, lt, -5, gesture, 2, 0, toward, 7, undefined, { emotion, aiming });
  assert.equal(at("present", 1, "preocupada").expression, "worried");
  assert.equal(at("surprise", 2.3, "tranquila").expression, "surprised");
  assert.equal(at("surprise", 4, "tranquila").expression, "neutral");
  assert.equal(at("cheer", 2.5, "").expression, "happy");
  assert.equal(at("point", 2.5, "", -1).view, "side");
  assert.equal(at("point", 2.5, "", -1).facing, -1);
  assert.equal(at("present", 2.5, "", 1, true).view, "threeQuarter");
  // Old callers (no face) still get a full pose, the same at the same t.
  assert.deepEqual(puppetPose(3, 1, 0, "wave", 0.5, 0.4, 1, 2), puppetPose(3, 1, 0, "wave", 0.5, 0.4, 1, 2));
  assert.equal(puppetPose(3, 1, 0, "wave", 0.5, 0, 1, 2).expression, "neutral");
});

test("old puppets keep loading; the new roles are allowed and guessed from file names", () => {
  const old = PuppetSchema.parse({ layers: [{ file: "a.png", role: "mouth" }] });
  assert.equal(old.layers[0].role, "mouth");
  assert.ok(PuppetSchema.safeParse({ layers: Array.from({ length: 15 }, (_, i) => ({ file: `${i}.png`, role: "extra" })) }).success);
  assert.equal(guessRole("boca.png"), "mouth");
  assert.equal(guessRole("boca-A.png"), "mouthA");
  assert.equal(guessRole("mouth_o.png"), "mouthO");
  assert.equal(guessRole("Boca E.png"), "mouthE");
  assert.equal(guessRole("cara contenta.png"), "faceHappy");
  assert.equal(guessRole("cara-sorprendida.png"), "faceSurprised");
  assert.equal(guessRole("worried face.png"), "faceWorried");
  assert.equal(guessRole("cuerpo 3-4.png"), "view34");
  assert.equal(guessRole("perfil.png"), "viewSide");
  assert.equal(guessRole("cabeza.png"), "head");
  assert.equal(guessRole("brazo izq.png"), "armL");
});

// ── Drawing: which pictures go on the canvas ─────────────────────────────────────
function recorder() {
  const drawn: string[] = [];
  const noop = () => {};
  const ctx = {
    globalAlpha: 1,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: (img: { name: string }) => drawn.push(img.name),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}
function asset(roles: PuppetRole[]): PuppetAsset {
  const box = { x: 0, y: 0, w: 100, h: 200 };
  const parts: PuppetPart[] = roles.map((role) => ({ role, image: { name: role } as unknown as CanvasImageSource, rect: box, box, pivot: [50, 100] }));
  return { width: 100, height: 200, parts, bounds: box };
}
const FRONT: PuppetRole[] = ["body", "armL", "armR", "head", "eyes", "mouth"];
const draw = (roles: PuppetRole[], pose: ReturnType<typeof puppetPose>) => {
  const r = recorder();
  drawPuppet(r.ctx, asset(roles), 0, 0, 100, pose);
  return r.drawn;
};

test("without the new layers the puppet draws exactly its front parts, whatever the face says", () => {
  for (const lt of [1, 2.2, 2.6, 3.5]) {
    for (const gesture of MOTION_GESTURES) {
      const pose = puppetPose(10 + lt, lt, -5, gesture, 2, 0.8, 1, 7, undefined, { emotion: "sorprendida", aiming: true, held: 0.8 });
      assert.deepEqual(draw(FRONT, pose), ["body", "armL", "armR", "head", "eyes", "mouth"]);
    }
  }
});

test("with the sheet's layers it swaps the mouth, the face and the view", () => {
  const all: PuppetRole[] = [...FRONT, "mouthA", "mouthO", "mouthE", "faceHappy", "faceSurprised", "faceWorried", "view34", "viewSide"];
  const base = puppetPose(10.02, 1, -5, "present", 2, 0, 1, 7);
  // Silent and neutral: the plain head, eyes and closed mouth.
  assert.deepEqual(draw(all, base), ["body", "armL", "armR", "head", "eyes", "mouth"]);
  // Talking loud: an open shape instead of the closed mouth.
  const talking = draw(all, { ...base, mouth: 0.9, shape: "A" });
  assert.deepEqual(talking.slice(-1), ["mouthA"]);
  assert.ok(!talking.includes("mouth"));
  // A face over the head, no eyes; silent: its own mouth, so no mouth layer.
  assert.deepEqual(draw(all, { ...base, expression: "happy" }), ["body", "armL", "armR", "head", "faceHappy"]);
  // A face while talking: the shape goes over it.
  assert.deepEqual(draw(all, { ...base, expression: "worried", mouth: 0.5, shape: "E" }), ["body", "armL", "armR", "head", "faceWorried", "mouthE"]);
  // Pointing: the whole figure in profile, nothing else.
  assert.deepEqual(draw(all, { ...base, view: "side" }), ["viewSide"]);
  assert.deepEqual(draw(all, { ...base, view: "threeQuarter" }), ["view34"]);
  // Only mouths, no closed one: silence draws no mouth layer (it is painted on the head).
  assert.deepEqual(draw(["body", "head", "mouthO"], base), ["body", "head"]);
});
