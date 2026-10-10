// Guards around the explainer studio's review loop and its voices: a scene the reviewer flags in the same run stops
// that render, a voice dropped by a note keeps its file's slot for undo, a late answer for an older voice never
// overwrites the new voice's word times, and a puppet part whose file name has "34" in a number is not a 3/4 view.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, flagBeyond, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { conceptsBlockRender } from "../shared/motionQuality.ts";
import { keepHeard, type HeardWordTimes } from "../shared/subtitles.ts";
import { guessRole } from "../shared/series.ts";
import { nextVoiceSlot } from "../src/lib/motionProject.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const script = (scenes: MotionScene[]): MotionScript => ({
  problem: "",
  title: "",
  durationNote: "",
  note: "",
  scenes,
  music: { mood: "drive", bpm: 110 },
  tone: "warm",
});

test("a scene the reviewer flags in this run blocks the render that ran the review", () => {
  const s = script([scene({ id: "a", title: "Pedidos" }), scene({ id: "b", title: "Repositor" })]);
  assert.equal(conceptsBlockRender(s, []), "");
  const flagged = flagBeyond(s, [{ scene: 2, what: "robot repositor" }]);
  assert.match(conceptsBlockRender(flagged, []), /Lo que existe hoy/);
  assert.equal(conceptsBlockRender({ ...flagged, scenes: flagged.scenes.map((x) => ({ ...x, disclosure: "concept" as const })) }, []), "");
});

test("a new voice never reuses a slot an undo can still bring back", () => {
  // s2 (slot 1) was dropped by a note and is kept for undo: the new voice must not overwrite slot 1.
  assert.equal(nextVoiceSlot({ s1: 0 }, [{ s2: 1 }]), 2);
  assert.equal(nextVoiceSlot({ s1: 0 }, []), 1);
  assert.equal(nextVoiceSlot({}, []), 0);
  assert.equal(nextVoiceSlot({ s1: 1 }, [{ s2: 0 }]), 2);
});

test("a late answer for an older voice does not overwrite the current voice's word times", () => {
  const v2: HeardWordTimes = { text: "hola mundo", seconds: 4.1, times: [[0, 1], [1, 2]], matched: 2 };
  const v1: HeardWordTimes = { ...v2, seconds: 3.2 };
  const now = { s1: v2 };
  assert.equal(keepHeard(now, "s1", v1, "hola mundo", 4.1), now);
  assert.equal(keepHeard({}, "s1", v2, "hola mundo", 4.1).s1, v2);
  // The line changed since the voice was sent: stale too.
  assert.equal(keepHeard(now, "s1", v2, "otra línea", 4.1), now);
});

test("a number with 34 in a puppet file name is not the 3/4 view", () => {
  assert.equal(guessRole("cabeza_1734.png"), "head");
  assert.equal(guessRole("body-2034.png"), "body");
  assert.equal(guessRole("grok-image-34ab-body.png"), "body");
  assert.equal(guessRole("head_20261003_134512.png"), "head");
  assert.equal(guessRole("cuerpo 3-4.png"), "view34");
  assert.equal(guessRole("cuerpo 3_4.png"), "view34");
  assert.equal(guessRole("vista 34.png"), "view34");
  assert.equal(guessRole("tres cuartos.png"), "view34");
});
