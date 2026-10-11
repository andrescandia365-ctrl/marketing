// pieza.md shows each shot's sketch: the uploaded one, or the app's pencil sketch saved next to it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_BOARD, DEMO_STORY } from "../server/demo.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { APP_SKETCH, appSketchFile } from "../shared/prompt.ts";
import { migrateBoard } from "../shared/schema.ts";
import { pieceToMarkdown, sketchLine } from "../src/lib/markdown.ts";
import { sketchJobs } from "../src/lib/sketchFiles.ts";

const board = migrateBoard(DEMO_BOARD);

test("the app's sketch file name is per shot, two digits, and matches its pattern", () => {
  assert.equal(appSketchFile(0), "boceto-app-01.png");
  assert.equal(appSketchFile(11), "boceto-app-12.png");
  assert.equal(APP_SKETCH.exec(appSketchFile(4))?.[1], "05");
  assert.equal(APP_SKETCH.test("boceto-05.png"), false);
});

test("an uploaded sketch is linked; otherwise the app's", () => {
  const md = pieceToMarkdown(EXAMPLE_BRIEF, DEMO_STORY, board, "Grok", [], undefined, { uploaded: { 1: "boceto-02.jpg" } });
  assert.match(md, /!\[Boceto de la toma 1\]\(boceto-app-01\.png\)/);
  assert.match(md, /!\[Boceto de la toma 2\]\(boceto-02\.jpg\)/);
  assert.doesNotMatch(md, /boceto-app-02\.png/);
  for (let i = 0; i < board.shots.length; i++) assert.match(md, new RegExp(`Boceto de la toma ${i + 1}\\]`));
  assert.match(sketchLine(0, { uploaded: {} }), /dibujado por la app/);
  assert.doesNotMatch(sketchLine(0, { uploaded: { 0: "boceto-01.png" } }), /dibujado por la app/);
  // Saved next to the files: no note about the folder.
  assert.doesNotMatch(md, /carpeta del proyecto/);
});

test("the image sits right before the sketch prompt of its shot", () => {
  const md = pieceToMarkdown(EXAMPLE_BRIEF, DEMO_STORY, board, "Grok", [], undefined, { uploaded: {} });
  const shot = md.slice(md.indexOf("### Toma 1 "), md.indexOf("### Toma 2 "));
  const image = shot.indexOf("](boceto-app-01.png)");
  assert.ok(image > 0);
  const prompt = shot.indexOf("**Prompt de boceto:**");
  if (prompt >= 0) assert.ok(image < prompt);
});

test("downloaded on its own, the .md says the sketches are in the project folder", () => {
  const md = pieceToMarkdown(EXAMPLE_BRIEF, DEMO_STORY, board, "Grok", [], undefined, { uploaded: {}, folder: "2026-10-10-1200-iman" });
  assert.match(md, /carpeta del proyecto \(2026-10-10-1200-iman\)/);
  assert.match(md, /\]\(boceto-app-01\.png\)/);
});

test("without sketch links (no project folder) the markdown is as before", () => {
  const md = pieceToMarkdown(EXAMPLE_BRIEF, DEMO_STORY, board, "Grok", []);
  assert.doesNotMatch(md, /!\[Boceto/);
  assert.doesNotMatch(md, /carpeta del proyecto/);
});

test("sketch jobs skip uploaded sketches and their key follows what the drawing reads", () => {
  const all = sketchJobs(board, {}, "vertical", {});
  assert.equal(all.length, board.shots.length);
  assert.deepEqual(
    sketchJobs(board, {}, "vertical", { 0: "boceto-01.jpg" }).map((j) => j.index),
    all.slice(1).map((j) => j.index),
  );
  // Same input, same key (the drawing is deterministic).
  assert.deepEqual(
    sketchJobs(board, {}, "vertical", {}).map((j) => j.key),
    all.map((j) => j.key),
  );
  assert.notEqual(sketchJobs(board, {}, "horizontal", {})[0].key, all[0].key);
  const edited = { ...board, shots: board.shots.map((s, i) => (i === 0 ? { ...s, visualPrompt: `${s.visualPrompt} wide shot` } : s)) };
  const keys = sketchJobs(edited, {}, "vertical", {}).map((j) => j.key);
  assert.notEqual(keys[0], all[0].key);
  assert.deepEqual(keys.slice(1), all.slice(1).map((j) => j.key));
});
