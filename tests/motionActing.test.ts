// Puppets that anticipate (a small opposite move before each gesture, sized by how the piece lands) and cameras the
// writer chooses within the studio's rules (planCameras), never over the person's own choice.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOTION_CAMERAS,
  MOTION_CAMERA_LABEL,
  MOTION_GESTURES,
  MOTION_TEMPLATES,
  blankScene,
  cameraAt,
  cameraFits,
  normalizeMotion,
  pickCamera,
  planCameras,
  type MotionCamera,
  type MotionGesture,
  type MotionScene,
  type MotionScript,
  type MotionTemplate,
  type MotionTone,
} from "../shared/motion.ts";
import { applyFixes } from "../shared/motionQuality.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { drawMotionFrame, landFor } from "../src/lib/motion.ts";
import { RELEASE, WARM_ACTING, actingFor, puppetPose, windUp, type Acting, type Pose } from "../src/lib/puppet.ts";

// ── Puppets ──────────────────────────────────────────────────────────────────────

const AT = 2;
// The pose g seconds after the gesture's main move starts, already in the scene (no entrance), not talking.
const poseAt = (gesture: MotionGesture, g: number, acting: Acting, toward = 1): Pose => puppetPose(10 + AT + g, AT + g, -5, gesture, AT, 0, toward, 7, acting);
// What the gesture adds to the pose at that moment (the same moment with the gesture far away).
// The pose's continuous numbers (the face, mouth shape and view are swaps by design).
type NumericKey = { [K in keyof Pose]: Pose[K] extends number ? K : never }[keyof Pose];
const delta = (gesture: MotionGesture, g: number, acting: Acting, field: NumericKey, toward = 1) =>
  poseAt(gesture, g, acting, toward)[field] - puppetPose(10 + AT + g, AT + g, -5, gesture, 99, 0, toward, 7, acting)[field];

const DRY = actingFor("dry", "even");
const WARM = actingFor("warm", "even");
const ABSURD = actingFor("absurdist", "even");
const ALL_ACTING: [string, Acting][] = [
  ["dry", DRY],
  ["warm", WARM],
  ["absurdist", ABSURD],
  ["dry springy", actingFor("dry", "springy")],
  ["warm solid", actingFor("warm", "solid")],
  ["warm soft", actingFor("warm", "soft")],
  ["absurdist springy", actingFor("absurdist", "springy")],
];

// The field the gesture mostly moves and which way its main move goes (toward the right).
const MAIN: Record<MotionGesture, [NumericKey, 1 | -1][]> = {
  present: [["armL", 1], ["armR", -1]],
  wave: [["armR", -1]],
  point: [["armR", -1], ["lean", 1]],
  cheer: [["armL", 1], ["armR", -1]],
  surprise: [["armL", 1], ["armR", -1]],
};

test("before each gesture the puppet winds up the other way, then makes the move", () => {
  for (const [name, acting] of ALL_ACTING) {
    for (const gesture of MOTION_GESTURES) {
      for (const [field, way] of MAIN[gesture]) {
        const wound = delta(gesture, 0, acting, field);
        const done = delta(gesture, 0.7, acting, field);
        assert.ok(wound * way < 0, `${name} ${gesture} ${field}: winds up the other way (${wound})`);
        assert.ok(done * way > 0, `${name} ${gesture} ${field}: then moves its way (${done})`);
        // A small move next to the gesture itself.
        assert.ok(Math.abs(wound) < Math.abs(done) * 0.5, `${name} ${gesture} ${field}: the wind-up stays small`);
      }
    }
  }
  // Pointing to the left winds up with the left arm, leaning right first.
  assert.ok(delta("point", 0, WARM, "armL", -1) < 0 && delta("point", 0.7, WARM, "armL", -1) > 0);
  assert.ok(delta("point", 0, WARM, "lean", -1) > 0 && delta("point", 0.7, WARM, "lean", -1) < 0);
  // A cheer and a surprise crouch before they go up.
  assert.ok(delta("cheer", 0, WARM, "sy") < 0);
  assert.ok(delta("surprise", 0, WARM, "sy") < 0);
});

test("the wind-up starts 0.12 to 0.2 s before the move and nothing moves earlier", () => {
  for (const [name, acting] of ALL_ACTING) {
    assert.ok(acting.lead >= 0.12 && acting.lead <= 0.2, `${name}: ${acting.lead}`);
    for (const gesture of MOTION_GESTURES) {
      const before = poseAt(gesture, -acting.lead - 0.005, acting);
      const rest = puppetPose(10 + AT - acting.lead - 0.005, AT - acting.lead - 0.005, -5, gesture, 99, 0, 1, 7, acting);
      assert.deepEqual(before, rest, `${name} ${gesture}: still before the wind-up`);
      assert.notDeepEqual(poseAt(gesture, -acting.lead / 2, acting), puppetPose(10 + AT - acting.lead / 2, AT - acting.lead / 2, -5, gesture, 99, 0, 1, 7, acting));
    }
  }
  // Fully wound when the move starts, let go by RELEASE.
  assert.equal(windUp(0, 0.16), 1);
  assert.equal(windUp(-0.16, 0.16), 0);
  assert.equal(windUp(RELEASE, 0.16), 0);
});

test("the pose never jumps: wind-up, move, waving, hops and the gasp are all continuous", () => {
  const dt = 1 / 1000;
  const limit: Partial<Record<keyof Pose, number>> = { armL: 0.06, armR: 0.06, blink: 0.03, mouth: 0.03 };
  for (const [name, acting] of ALL_ACTING) {
    for (const gesture of MOTION_GESTURES) {
      for (const toward of [1, -1]) {
        let last = poseAt(gesture, -0.5, acting, toward);
        for (let g = -0.5 + dt; g <= 3.5; g += dt) {
          const now = poseAt(gesture, g, acting, toward);
          for (const k of Object.keys(now) as NumericKey[]) {
            if (typeof now[k] !== "number") continue;
            const step = Math.abs(now[k] - last[k]);
            assert.ok(step <= (limit[k] ?? 0.01), `${name} ${gesture} ${toward}: ${k} jumps ${step.toFixed(4)} at ${g.toFixed(3)} s`);
          }
          last = now;
        }
      }
    }
  }
});

test("a dry piece winds up small and never passes its mark; an absurd one goes further", () => {
  const wound = (a: Acting) => Math.abs(delta("present", 0, a, "armL"));
  assert.ok(wound(DRY) < wound(WARM) && wound(WARM) < wound(ABSURD));
  const peak = (a: Acting, gesture: MotionGesture, field: NumericKey, way: 1 | -1) =>
    Math.max(...Array.from({ length: 300 }, (_, i) => way * delta(gesture, i / 100, a, field)));
  for (const dry of [DRY, actingFor("dry", "springy"), actingFor("dry", "soft"), actingFor("warm", "solid")]) {
    assert.equal(dry.overshoot, 0);
    assert.ok(peak(dry, "present", "armL", 1) <= 0.45 + 1e-9, "presents exactly to its mark");
    assert.ok(peak(dry, "point", "armR", -1) <= 1.25 + 1e-9, "points exactly to its mark");
  }
  assert.ok(peak(ABSURD, "present", "armL", 1) > 0.45 * 1.05, "an absurd piece overshoots and settles");
  assert.ok(peak(ABSURD, "point", "armR", -1) > peak(WARM, "point", "armR", -1));
  // It settles on the mark.
  assert.ok(Math.abs(delta("present", 2, ABSURD, "armL") - 0.45) < 1e-9);
  // The landing squash is smaller in a dry piece.
  const squash = (a: Acting) => 1 + 0.012 * Math.sin(((10 + 0.575) * Math.PI * 2) / 3.1) - puppetPose(10 + 0.575, 0.575, 0, "present", 99, 0, 1, 7, a).sy;
  assert.ok(squash(DRY) > 0 && squash(DRY) < squash(WARM) && squash(WARM) < squash(ABSURD));
  // Older callers (the editor's loop) act warm.
  assert.deepEqual(WARM, WARM_ACTING);
});

test("a puppet passes its mark exactly where the piece's landings bounce (landFor)", () => {
  for (const tone of ["dry", "warm", "absurdist", undefined] as const) {
    for (const motion of ["even", "solid", "soft", "springy", undefined] as const) {
      const land = landFor(tone, motion);
      const bounces = Array.from({ length: 101 }, (_, i) => land(i / 100)).some((v) => v > 1 + 1e-9);
      assert.equal(actingFor(tone, motion).overshoot > 0, bounces, `${tone} ${motion}`);
    }
  }
});

// ── Cameras ──────────────────────────────────────────────────────────────────────

test("the writer's words for a camera come back as values", () => {
  for (const c of MOTION_CAMERAS) assert.equal(pickCamera(c), c);
  for (const c of MOTION_CAMERAS) assert.equal(pickCamera(MOTION_CAMERA_LABEL[c]), c, MOTION_CAMERA_LABEL[c]);
  assert.equal(pickCamera("Slow push-in"), "push");
  assert.equal(pickCamera("pull back to the whole"), "pull");
  assert.equal(pickCamera("zoom out"), "pull");
  assert.equal(pickCamera("pan across"), "pan");
  assert.equal(pickCamera("floats"), "drift");
  assert.equal(pickCamera("static"), "hold");
  assert.equal(pickCamera(""), undefined);
  assert.equal(pickCamera(undefined), undefined);
  assert.equal(pickCamera("expand"), undefined);
});

const wire = (scenes: { template: string; camera?: string; asset?: string }[]) => ({
  problem: "",
  title: "",
  durationNote: "",
  note: "",
  caption: "",
  music: { mood: "drive", bpm: 110 },
  scenes: scenes.map((s) => ({ ...blankScene("screen"), gesture: "", move: "", entry: "", reveal: "", camera: "", asset: "x", ...s })),
});

test("the writer's cameras follow the rules: words to read hold, the product and the screen push in", () => {
  const scenes = [
    { template: "hook", camera: "pan", asset: "" },
    { template: "screen" },
    { template: "type", camera: "push" },
    { template: "product", camera: "drift" },
    { template: "callouts", camera: "pan" },
    { template: "beforeAfter", camera: "pull" },
    { template: "character", camera: "drift" },
    { template: "zoom", camera: "push" },
    { template: "steps", camera: "drift" },
    { template: "contradiction", camera: "pan" },
    { template: "stat", camera: "push" },
    { template: "logo", camera: "drift" },
    { template: "product" },
  ];
  const warm = normalizeMotion(wire(scenes), "warm").scenes.map((s) => s.camera);
  assert.deepEqual(warm, ["hold", "push", "hold", "drift", "hold", "pull", "drift", "hold", "hold", "hold", "hold", "hold", "push"]);
  // A dry piece mostly holds, with a slow push on the product or the screen.
  const dry = normalizeMotion(wire(scenes), "dry").scenes.map((s) => s.camera);
  assert.deepEqual(dry, ["hold", "push", "hold", "push", "hold", "hold", "hold", "hold", "hold", "hold", "hold", "hold", "push"]);
  // Every camera is the writer's until the person picks one; a hook with a picture can move.
  const out = normalizeMotion(wire([{ template: "hook", camera: "drift" }]), "warm").scenes;
  assert.equal(out[0].cameraBy, "ai");
  assert.equal(out[0].camera, "drift");
});

test("never the same move three scenes in a row, and planning twice changes nothing", () => {
  const out = normalizeMotion(wire(["screen", "product", "character", "product", "screen"].map((template) => ({ template, camera: "push" }))), "warm").scenes;
  const cams = out.map((s) => s.camera);
  assert.deepEqual(cams.slice(0, 2), ["push", "push"]);
  assert.notEqual(cams[2], "push");
  // Seeded fuzz over every template, camera word and tone.
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const words = [...MOTION_CAMERAS, "", "zoom", "se acerca", "paneo"];
  for (let n = 0; n < 400; n++) {
    const tone = (["dry", "warm", "absurdist"] as const)[n % 3];
    const list = Array.from({ length: 3 + Math.floor(rnd() * 8) }, () => ({
      template: MOTION_TEMPLATES[Math.floor(rnd() * MOTION_TEMPLATES.length)],
      camera: words[Math.floor(rnd() * words.length)],
      asset: rnd() < 0.8 ? "x" : "",
    }));
    const planned = normalizeMotion(wire(list), tone).scenes;
    planned.forEach((s, i) => {
      assert.ok(cameraFits(s, tone).includes(s.camera!), `${tone} ${s.template} ${s.camera}`);
      if (i >= 2 && s.camera !== "hold") assert.ok(!(planned[i - 1].camera === s.camera && planned[i - 2].camera === s.camera), `three ${s.camera} in a row`);
    });
    assert.equal(planCameras(planned, tone), planned, "a planned list comes back as it is");
  }
});

test("the person's camera is never changed, and still counts as a neighbour", () => {
  const ai = (template: MotionTemplate, camera: MotionCamera): MotionScene => ({ ...blankScene(template), asset: "x", camera, cameraBy: "ai" });
  const hand = (template: MotionTemplate, camera: MotionCamera): MotionScene => ({ ...blankScene(template), asset: "x", camera });
  // A pan on a stat, picked by hand, stays (the rules are for the writer's choices).
  const kept = [hand("stat", "pan"), hand("logo", "drift")];
  assert.equal(planCameras(kept, "dry"), kept);
  // Two hand pushes: the writer's push after them moves; the person's stay.
  const out = planCameras([hand("screen", "push"), hand("product", "push"), ai("product", "push")], "warm");
  assert.deepEqual(out.map((s) => s.camera), ["push", "push", "drift"]);
  // The person pushes on the third scene: the writer's push before it gives way.
  const after = planCameras([ai("screen", "push"), ai("product", "push"), hand("character", "push")], "warm");
  assert.deepEqual(after.map((s) => s.camera), ["push", "drift", "push"]);
  // Older scenes (no cameraBy) keep what they had, even with the tone changed.
  const old: MotionScene[] = [{ ...blankScene("type"), camera: "pan" }];
  assert.equal(planCameras(old, "dry"), old);
});

test("a fix that changes a scene's template re-plans only the writer's camera", () => {
  const script: MotionScript = {
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    music: { mood: "drive", bpm: 110 },
    tone: "warm",
    scenes: [
      { ...blankScene("screen"), asset: "x", title: "Stock", camera: "push", cameraBy: "ai" },
      { ...blankScene("screen"), asset: "x", title: "Pedido", camera: "push" },
    ],
  };
  const fix = (scene: number) => ({
    criterion: "variety",
    problem: "Dos pantallas iguales.",
    scene,
    title: "",
    text: "",
    items: [],
    seconds: 0,
    template: "stat",
    element: "",
    at: -1,
    scale: 0,
    dx: 0,
    dy: 0,
    format: "",
  });
  const { script: fixed } = applyFixes(script, [fix(1), fix(2)], ["vertical"]);
  assert.deepEqual(
    fixed.scenes.map((s) => [s.template, s.camera]),
    [
      ["stat", "hold"],
      ["stat", "push"],
    ],
  );
});

// A stand-in 2D context that keeps the transform and records where every piece of text lands (as in motionJourney).
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

test("whatever the writer asks, words in a scene to read never move once they are in", () => {
  const picture = { image: {} as CanvasImageSource, width: 400, height: 400, name: "p" };
  const scenes: { template: MotionTemplate; title: string; text?: string; items?: string[]; asset?: string }[] = [
    { template: "hook", title: "El pan se acaba a las seis", text: "Y nadie lo ve", asset: "" },
    { template: "type", title: "yerba 1 kg", text: "Quedan 3", items: ["Buscar producto", "Buscar"], asset: "" },
    { template: "steps", title: "Tres pasos", items: ["Abrí Stock", "Marcá", "Mandá"], asset: "" },
    { template: "contradiction", title: "El pedido", items: ["La planilla dice 40", "La góndola tiene 3"], asset: "" },
    { template: "stat", title: "3 minutos", text: "para el pedido", asset: "" },
    { template: "logo", title: "IMAN", text: "El pedido, antes del corte", items: ["Probalo"], asset: "" },
    { template: "zoom", title: "Lo que falta", asset: "p" },
  ];
  for (const tone of ["dry", "warm", "absurdist"] as MotionTone[]) {
    for (const camera of ["pan", "drift", "push", "pull"]) {
      for (const sc of scenes) {
        const planned = normalizeMotion(wire([{ ...sc, camera, seconds: 6 } as never]), tone);
        assert.equal(planned.scenes[0].camera, "hold", `${tone} ${sc.template} ${camera}`);
        const script = { ...planned, scenes: planned.scenes.map((s) => ({ ...s, seconds: 6, text: sc.text ?? "", items: sc.items ?? [] })), tone };
        const world = { brand: DEFAULT_BRAND, assets: { p: picture, x: picture }, logo: null, beats: [], seed: 7, disclosure: "" };
        const at = (t: number) => {
          const r = recorder();
          drawMotionFrame(r.ctx, 1080, 1920, t, script, world);
          return r.texts;
        };
        assert.deepEqual(at(4), at(5.5), `${tone} ${sc.template} ${camera}`);
      }
    }
  }
});

test("labels pinned to a picture only move in depth, and no camera moves faster than it always did", () => {
  for (const c of cameraFits({ template: "callouts", asset: "x" })) {
    for (let u = 0; u <= 1; u += 0.05) {
      const cam = cameraAt(c, u);
      assert.equal(cam.x, 0);
      assert.equal(cam.y, 0);
    }
  }
  // The fastest each move goes, per scene length (the presets this item does not touch).
  const fastest = (c: MotionCamera, k: "x" | "y" | "z") =>
    Math.max(...Array.from({ length: 1000 }, (_, i) => Math.abs(cameraAt(c, (i + 1) / 1000)[k] - cameraAt(c, i / 1000)[k]) * 1000));
  for (const c of MOTION_CAMERAS) {
    assert.ok(fastest(c, "z") <= 0.14 * 1.5 + 1e-3, `${c} z`);
    assert.ok(fastest(c, "x") <= 0.12 * 1.5 + 1e-3, `${c} x`);
    assert.ok(fastest(c, "y") <= 0.035 + 1e-3, `${c} y`);
  }
});

test("the sample pieces vary their cameras, and a dry one mostly holds", () => {
  for (const series of ["iman", "masogar"]) {
    const warm = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone: "warm", narrator: "with" }, null).scenes;
    const moves = new Set(warm.map((s) => s.camera).filter((c) => c !== "hold"));
    assert.ok(moves.size >= 2, `${series}: ${[...moves].join(", ")}`);
    assert.ok(warm.every((s) => s.cameraBy === "ai" && cameraFits(s, "warm").includes(s.camera!)));
    const dry = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone: "dry", narrator: "with" }, null).scenes;
    assert.ok(dry.every((s) => s.camera === "hold" || s.camera === "push"), `${series} dry`);
    assert.ok(dry.some((s) => s.camera === "push"));
  }
});
