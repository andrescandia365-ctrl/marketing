// "Sin clave", part 2: explainers by copy and paste with claude.ai. The script, the director's note and the quality
// review give the exact prompt (the review asks for its contact sheet as an attached image) and read the pasted reply
// with the writer's own schema and post-processing; a pasted review goes through the same takeReview as the loop.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { ANSWER_LINE } from "../shared/handoff.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { MotionNoteSchema, MotionScriptSchema, blankScene, type MotionScene, type MotionScript } from "../shared/motion.ts";
import {
  MAX_ROUNDS,
  NO_SHEET_REPLY,
  nextRound,
  saysNoSheet,
  sheetFileName,
  takeReview,
  type QualityState,
} from "../shared/motionQuality.ts";
import { PasteError, motionTask, reviewMotionTask, reviseMotionTask, taskFromPaste, taskPrompt } from "../server/claude.ts";

type WireScene = z.infer<typeof MotionScriptSchema>["scenes"][number];
const wireScene = (o: Partial<WireScene>): WireScene => ({
  template: "hook",
  seconds: 3,
  title: "¿Otra vez sin leche?",
  text: "",
  items: [],
  asset: "",
  assetB: "",
  gesture: "",
  move: "",
  entry: "cut",
  reveal: "",
  camera: "hold",
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
  voice: "¿Otra vez sin leche a las seis?",
  emotion: "cansado",
  disclosure: "real",
  beyondToday: "",
  ...o,
});
const wireScript: z.infer<typeof MotionScriptSchema> = {
  problem: "Se acaba la leche a la tarde",
  title: "La leche de las seis",
  durationNote: "Un problema, tres pasos.",
  scenes: [
    wireScene({}),
    wireScene({ template: "steps", title: "Así se arregla", items: ["Mirá el stock", "Pedí a tiempo"], voice: "Mirás el stock y pedís a tiempo.", emotion: "tranquilo" }),
    wireScene({ template: "logo", title: "IMAN", items: ["Probalo"], voice: "Y a las seis, hay leche.", emotion: "contento" }),
  ],
  world: "store",
  music: { mood: "drive", bpm: 110 },
  note: "",
  caption: "A las seis ya no falta leche.",
};

test("the explainer script: the prompt closes with the answer line and its schema", () => {
  const { prompt, chars } = taskPrompt(motionTask(EXAMPLE_BRIEF, 30, 0));
  assert.equal(chars, prompt.length);
  assert.ok(prompt.includes("Write a motion-graphics explainer"));
  assert.ok(prompt.includes("It lasts 30 seconds in total."));
  assert.ok(prompt.includes(ANSWER_LINE));
  assert.ok(prompt.includes('"durationNote"'));
});

test("a pasted explainer script, in a fence with prose around it, becomes the studio's script", () => {
  const reply = `Acá va el guion:\n\n\`\`\`json\n${JSON.stringify(wireScript, null, 2)}\n\`\`\`\n\nAvisame si querés otro tono.`;
  const script = taskFromPaste(motionTask(EXAMPLE_BRIEF, 30, 0), reply);
  assert.equal(script.scenes.length, 3);
  assert.equal(script.scenes[0].template, "hook");
  assert.equal(script.scenes[2].template, "logo");
  assert.ok(script.scenes.every((s) => s.id), "every scene gets its id");
  assert.equal(script.tone, EXAMPLE_BRIEF.tone);
  assert.equal(script.world, "store");
});

test("a pasted script with the wrong shape names the field in Spanish", () => {
  const broken = { ...wireScript, scenes: "tres" };
  assert.throws(
    () => taskFromPaste(motionTask(EXAMPLE_BRIEF, null, 0), JSON.stringify(broken)),
    (e: unknown) => e instanceof PasteError && /«scenes» tendría que ser una lista/.test(e.message),
  );
  assert.throws(() => taskFromPaste(motionTask(EXAMPLE_BRIEF, null, 0), "No puedo."), (e: unknown) => e instanceof PasteError && /No encontré la respuesta/.test(e.message));
});

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const current: MotionScript = {
  problem: "Se acaba la leche",
  title: "La leche",
  durationNote: "",
  note: "",
  caption: "Texto",
  scenes: [
    scene({ id: "a", template: "hook", title: "¿Otra vez?", voice: "¿Otra vez sin leche?", seconds: 3 }),
    scene({ id: "b", template: "logo", title: "IMAN", items: ["Probalo"], voice: "Probalo.", seconds: 3 }),
  ],
  music: { mood: "drive", bpm: 110 },
  tone: "warm",
};

test("the director's note: the prompt carries the note and the scene ids; a pasted reply is merged", () => {
  const t = reviseMotionTask(EXAMPLE_BRIEF, current, "el gancho más corto", 0);
  const { prompt } = taskPrompt(t);
  assert.ok(prompt.includes('The director\'s note on this script: "el gancho más corto"'));
  assert.ok(prompt.includes(ANSWER_LINE));
  const wire: z.infer<typeof MotionNoteSchema> = {
    ...wireScript,
    scenes: [
      { ...wireScene({ title: "¿Otra vez?", voice: "¿Otra vez sin leche?", seconds: 2 }), from: "a" },
      { ...wireScene({ template: "logo", title: "IMAN", items: ["Probalo"], voice: "Probalo." }), from: "b" },
    ],
  };
  const merge = taskFromPaste(t, JSON.stringify({ script: wire }));
  assert.deepEqual(
    merge.script.scenes.map((s) => s.id),
    ["a", "b"],
    "the scenes keep their ids",
  );
  assert.ok(merge.changed.includes("a"));
  assert.equal(merge.script.scenes[0].seconds, 2);
  assert.deepEqual(merge.voiceChanged, []);
});

test("a pasted note with no scenes is the reply's problem (400), not the writer's", () => {
  const t = reviseMotionTask(EXAMPLE_BRIEF, current, "sacá todo", 0);
  assert.throws(() => taskFromPaste(t, JSON.stringify({ ...wireScript, scenes: [] })), (e: unknown) => e instanceof PasteError && /sin escenas/.test(e.message));
});

const reviewWire = {
  scores: [
    { criterion: "hook", score: 6, note: "El gancho tarda." },
    { criterion: "readability", score: 9, note: "Se lee." },
    { criterion: "motion", score: 8, note: "Bien." },
    { criterion: "variety", score: 8, note: "Bien." },
    { criterion: "brand", score: 9, note: "Bien." },
    { criterion: "sync", score: 8, note: "Bien." },
  ],
  fixes: [
    {
      criterion: "hook",
      problem: "El gancho dura mucho.",
      scene: 1,
      title: "",
      text: "",
      items: [],
      seconds: 2,
      template: "",
      element: "",
      at: -1,
      scale: 0,
      dx: 0,
      dy: 0,
      format: "both",
    },
  ],
  beyondToday: [{ scene: 2, what: "un robot que repone" }],
  summary: "Va bien, el gancho tarda.",
  poster: 1.2,
};

test("the review prompt by copy and paste asks for the attached contact sheet by its file name, and sends no picture", () => {
  const t = reviewMotionTask(EXAMPLE_BRIEF, "1. hook…", "facts…", [{ format: "vertical" }], 1, "", true);
  const { prompt } = taskPrompt(t);
  assert.ok(prompt.includes("ATTACH THIS IMAGE"));
  assert.ok(prompt.includes(sheetFileName("vertical")));
  assert.equal(sheetFileName("vertical"), "hoja-de-cuadros-9x16.jpg");
  assert.ok(prompt.includes(`reply only "${NO_SHEET_REPLY}"`));
  assert.ok(prompt.includes("The attached contact sheet"));
  assert.ok(!prompt.includes("contact sheet above"));
  assert.deepEqual(t.pictures, []);
  // With the writer connected the sheet goes along as a picture, and the prompt says "above".
  const live = reviewMotionTask(EXAMPLE_BRIEF, "1. hook…", "facts…", [{ format: "horizontal", jpeg: "abc" }], 1, "");
  assert.equal(live.pictures?.length, 1);
  assert.ok(taskPrompt(live).prompt.includes("The contact sheet above shows"));
  assert.ok(!taskPrompt(live).prompt.includes("ATTACH THIS IMAGE"));
});

test("a pasted review goes through the reviewer's schema and the loop's takeReview: flags, fixes, pending", () => {
  const t = reviewMotionTask(EXAMPLE_BRIEF, "", "", [{ format: "vertical" }], 1, "", true);
  const review = taskFromPaste(t, `<think>miro la hoja</think>\n\`\`\`json\n${JSON.stringify(reviewWire)}\n\`\`\``);
  assert.equal(review.scores.hook.score, 6);
  assert.equal(review.poster, 1.2);
  const step = takeReview(current, review, 1, ["vertical"], null, []);
  assert.equal(step.passed, false);
  assert.equal(step.flagged, true);
  assert.equal(step.script.scenes[1].beyond?.what, "un robot que repone");
  assert.equal(step.applied.length, 1);
  assert.equal(step.script.scenes[0].seconds, 2);
  assert.deepEqual(step.pending, []);
  // The last round fixes nothing: what is left is pending.
  const last = takeReview(current, review, MAX_ROUNDS, ["vertical"], null, []);
  assert.deepEqual(last.applied, []);
  assert.deepEqual(last.pending, ["Escena 1: El gancho dura mucho."]);
  assert.equal(last.script.scenes[0].seconds, 3);
});

test("a review missing a score field is refused in Spanish; claude.ai saying the sheet did not arrive is recognised", () => {
  const t = reviewMotionTask(EXAMPLE_BRIEF, "", "", [{ format: "vertical" }], 1, "", true);
  const { summary: _summary, ...noSummary } = reviewWire;
  assert.throws(() => taskFromPaste(t, JSON.stringify(noSummary)), (e: unknown) => e instanceof PasteError && /«summary»/.test(e.message));
  assert.ok(saysNoSheet(`${NO_SHEET_REPLY}.`));
  assert.ok(saysNoSheet("falta la hoja de cuadros: no veo ninguna imagen"));
  assert.ok(!saysNoSheet(JSON.stringify({ ...reviewWire, summary: "Falta la hoja de cuadros en el logo" })));
});

test("a pasted round continues the rounds already taken on the same piece", () => {
  const round = (n: number, applied: string[]) => ({ round: n, scores: {} as QualityState["rounds"][number]["scores"], summary: "", applied, pending: [], demo: false });
  const q: QualityState = { key: "k", formats: ["vertical"], passed: false, accepted: false, rounds: [round(1, ["Escena 1: más corto"])] };
  assert.deepEqual(nextRound(q, "k"), { round: 2, earlier: ["Escena 1: más corto"] });
  assert.deepEqual(nextRound(q, "otro"), { round: 1, earlier: [] });
  assert.deepEqual(nextRound({ ...q, passed: true }, "k"), { round: 1, earlier: [] });
  assert.deepEqual(nextRound({ ...q, rounds: [round(1, []), round(2, []), round(3, [])] }, "k"), { round: 1, earlier: [] });
  assert.deepEqual(nextRound(null, "k"), { round: 1, earlier: [] });
});
