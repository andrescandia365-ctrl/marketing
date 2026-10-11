// Every frame is a pure function of t (CLAUDE.md): the drawing code never reads a clock, never waits on a timer and
// never calls Math.random (noise is seeded). A static guard, so a later change cannot slip one in unnoticed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const DRAWING = [
  "src/lib/motion.ts",
  "shared/world.ts",
  "src/lib/puppet.ts",
  "src/lib/actor.ts",
  "src/lib/lyricRender.ts",
  "src/lib/plateDraw.ts",
  "shared/lyricPulse.ts",
  "shared/lyricAct.ts",
  "src/lib/sketch.ts",
  "shared/syncDraw.ts",
  "shared/subtitles.ts",
  "src/lib/motionStoryboard.ts",
];
const FORBIDDEN = /\bMath\.random\b|\bDate\.now\b|\bnew Date\(|\bperformance\.now\b|\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/;

// Comments may name what is banned; code may not.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("the drawing code never reads a clock or Math.random", () => {
  for (const file of DRAWING) {
    const lines = code(readFileSync(file, "utf8")).split("\n");
    const found = lines.flatMap((line, i) => (FORBIDDEN.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
    assert.deepEqual(found, [], `A frame must be a pure function of t:\n${found.join("\n")}`);
  }
});

test("the guard itself catches what it is meant to", () => {
  assert.ok(FORBIDDEN.test(code("const x = Math.random();")));
  assert.ok(FORBIDDEN.test(code("const t0 = performance.now()")));
  assert.ok(!FORBIDDEN.test(code("// never Math.random")));
  assert.ok(!FORBIDDEN.test(code("/* no setTimeout here */ const a = 1;")));
});
