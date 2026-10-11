// A transform shot can start or end on a real screen from the cast: the screenshot is that frame (never generated),
// the video prompt says the clip moves into it, and old boards and writer output keep working.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_BOARD } from "../server/demo.ts";
import { migrateBoard, normalizeShot, type Board, type Shot, type ShotWireSchema } from "../shared/schema.ts";
import { boardProblems } from "../shared/checks.ts";
import { editsFrom, generatesImage, screenMoveLine, settleEditFrom, settleScreenShot, shotFrames, withScreenMove } from "../shared/transformScreen.ts";
import type { z } from "zod";

const transform = (): Shot => structuredClone(DEMO_BOARD.shots.find((s) => s.kind === "transform")!);
const wire = (over: Partial<z.infer<typeof ShotWireSchema>>): z.infer<typeof ShotWireSchema> => ({
  ...(transform() as unknown as z.infer<typeof ShotWireSchema>),
  ...over,
});

test("a transform ending on a real screen uses the cast screenshot as its final frame, not a prompt", () => {
  const shot = { ...transform(), screenAt: "end" as const, screen: "stock", endPrompt: "" };
  const frames = shotFrames(shot);
  assert.deepEqual(frames.start, { from: "prompt", prompt: shot.visualPrompt });
  assert.deepEqual(frames.end, { from: "screen", screen: "stock" });
  // The initial AI frame is still generated.
  assert.equal(generatesImage(shot), true);
});

test("a transform starting on a real screen is never generated; its end is the scene", () => {
  const shot = { ...transform(), screenAt: "start" as const, screen: "stock" };
  const frames = shotFrames(shot);
  assert.deepEqual(frames.start, { from: "screen", screen: "stock" });
  assert.deepEqual(frames.end, { from: "prompt", prompt: shot.endPrompt });
  assert.equal(generatesImage(shot), false);
});

test("plain shots keep their frames: single from its prompt, screen from the cast, transform both prompts", () => {
  const t = transform();
  assert.equal(shotFrames(t).end?.from, "prompt");
  assert.equal(shotFrames({ ...t, kind: "single" }).end, null);
  assert.equal(generatesImage({ ...t, kind: "screen", screen: "stock" }), false);
  // A screenAt without a screen id is ignored.
  assert.equal(shotFrames({ ...t, screenAt: "end", screen: "" }).end?.from, "prompt");
});

test("the video prompt gets the move into the real screen before its Audio line, once", () => {
  const base = "The hand sets the cup aside on the counter. Locked-off camera. Audio: soft plastic tap, no music.";
  const once = withScreenMove(base, "end", "Stock");
  assert.match(once, /^The hand sets the cup aside.*Locked-off camera\. Frames \(real screen\): the final frame is a real screenshot of the product \(Stock\)/);
  assert.match(once, /never redraw, retype or animate its text.*as uploaded\. Audio: soft plastic tap, no music\.$/);
  assert.equal(withScreenMove(once, "end", "Stock"), once, "idempotent");
  // Switching to the start replaces the sentence; none takes it out and gives the original back.
  const start = withScreenMove(once, "start", "Vence");
  assert.equal(start.match(/Frames \(real screen\)/g)?.length, 1);
  assert.match(start, /initial frame is a real screenshot of the product \(Vence\).*pulls back out/);
  assert.equal(withScreenMove(start, "", ""), base);
  // A prompt with no Audio line gets it at the end; an empty prompt gets just the sentence.
  assert.equal(withScreenMove("Slow push in", "end", "Stock"), `Slow push in. ${screenMoveLine("end", "Stock")}`);
  assert.equal(withScreenMove("", "end", "Stock"), screenMoveLine("end", "Stock"));
  // The screenshot itself is never described as something to draw.
  assert.doesNotMatch(screenMoveLine("end", "Stock"), /draw (a|the) (screen|interface)/i);
});

test("normalizeShot keeps screenAt only on a transform with a screen id; an end screen needs no endPrompt", () => {
  const ends = normalizeShot(wire({ kind: "transform", screenAt: "END", screen: " stock ", endPrompt: "" }));
  assert.equal(ends.kind, "transform");
  assert.equal(ends.screenAt, "end");
  assert.equal(normalizeShot(wire({ kind: "transform", screenAt: "end", screen: "", endPrompt: "" })).kind, "single");
  const start = normalizeShot(wire({ kind: "transform", screenAt: "start", screen: "stock" }));
  assert.equal(start.screenAt, "start");
  // A start screen still needs the scene as its final frame.
  assert.equal(normalizeShot(wire({ kind: "transform", screenAt: "start", screen: "stock", endPrompt: "" })).kind, "single");
  assert.equal(normalizeShot(wire({ kind: "single", screenAt: "end", screen: "stock" })).screenAt, "");
  assert.equal(normalizeShot(wire({ kind: "transform", screenAt: "", screen: "stock" })).screenAt, "");
});

test("after the writer: a known screen gets the move sentence; an unknown one goes back to AI frames", () => {
  const shot = { ...transform(), screenAt: "end" as const, screen: "stock", endPrompt: "" };
  const kept = settleScreenShot(shot, { stock: "Stock" });
  assert.equal(kept.screenAt, "end");
  assert.match(kept.videoPrompt, /Frames \(real screen\).*\(Stock\)/);
  const dropped = settleScreenShot(shot, { vence: "Vence" });
  assert.equal(dropped.screenAt, "");
  assert.equal(dropped.screen, "");
  assert.equal(dropped.kind, "single", "no final prompt left, so it is one image");
  assert.doesNotMatch(dropped.videoPrompt, /Frames \(real screen\)/);
  const withEnd = settleScreenShot({ ...shot, endPrompt: "A tidy fridge." }, {});
  assert.equal(withEnd.kind, "transform");
  // Shots with no real screen pass through as the same object.
  const plain = transform();
  assert.equal(settleScreenShot(plain, { stock: "Stock" }), plain);
});

test("old saved boards open with no real screen in their transforms", () => {
  const old = structuredClone(DEMO_BOARD) as Board;
  for (const s of old.shots) delete (s as Partial<Shot>).screenAt;
  const migrated = migrateBoard(old);
  assert.ok(migrated.shots.every((s) => s.screenAt === ""));
  const t = migrated.shots.find((s) => s.kind === "transform")!;
  assert.equal(shotFrames(t).end?.from, "prompt");
});

test("a Good transform that ends on a real screen counts as the product in use", () => {
  const board = structuredClone(DEMO_BOARD) as Board;
  board.shots = board.shots.map((s) => (s.beat === "good" ? { ...s, setups: [] } : s));
  const kinds = { stock: "screen" as const };
  const without = boardProblems(board, kinds).some((p) => p.id === "producto-en-uso");
  assert.equal(without, true);
  board.shots = board.shots.map((s) => (s.kind === "transform" ? { ...s, screenAt: "end", screen: "stock" } : s));
  assert.equal(boardProblems(board, kinds).some((p) => p.id === "producto-en-uso"), false);
});

test("editFrom never points at a real screenshot: a transform starting on a screen or a screen shot clears it", () => {
  const single = (): Shot => ({ ...structuredClone(DEMO_BOARD.shots.find((s) => s.kind === "single")!), editFrom: 0, editPrompt: "" });
  const fromScreen = { ...transform(), screenAt: "start" as const, screen: "stock", editFrom: 0, editPrompt: "" };
  const screen = { ...single(), kind: "screen" as const, screen: "stock" };
  const later = { ...single(), editFrom: 1, editPrompt: "Add a cup; keep everything else." };
  assert.equal(editsFrom([fromScreen, later], 1), false);
  assert.equal(editsFrom([screen, later], 1), false);
  assert.equal(editsFrom([single(), later], 1), true);
  assert.equal(editsFrom([later], 3), false);
  const [, settled] = settleEditFrom([fromScreen, later]);
  assert.equal(settled.editFrom, 0);
  assert.equal(settled.editPrompt, "");
  const [, kept] = settleEditFrom([single(), later]);
  assert.equal(kept.editFrom, 1);
  assert.equal(kept.editPrompt, later.editPrompt);
});
