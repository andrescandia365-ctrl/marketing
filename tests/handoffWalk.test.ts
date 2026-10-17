// Publicidad "Sin clave": a walk of several prompts (50 hooks → 4) and the count typed for it outlive the panel,
// which unmounts when the person opens another tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWalk, rememberCount, rememberedCount, saveWalk, takePreset } from "../src/lib/handoffWalk.ts";

test("a walk comes back after a remount, and starts again only when its request changed", () => {
  assert.deepEqual(loadWalk("iman:hooks", "50-1,2"), { resetKey: "50-1,2", part: 1, done: [] });
  saveWalk("iman:hooks", { resetKey: "50-1,2", part: 2, done: [1] });
  assert.deepEqual(loadWalk("iman:hooks", "50-1,2"), { resetKey: "50-1,2", part: 2, done: [1] });
  assert.deepEqual(loadWalk("iman:hooks", "30-1,2"), { resetKey: "30-1,2", part: 1, done: [] });
  // Another series has its own walk.
  assert.deepEqual(loadWalk("mashogar:hooks", "50-1,2").done, []);
});

test("the typed count survives a remount; a preset applies once, not on every mount", () => {
  assert.equal(rememberedCount("iman:hooks-count", 50), 50);
  rememberCount("iman:hooks-count", 30);
  assert.equal(rememberedCount("iman:hooks-count", 50), 30);
  assert.equal(takePreset("iman:hooks-count", 40), true);
  assert.equal(takePreset("iman:hooks-count", 40), false);
  assert.equal(takePreset("iman:hooks-count", undefined), false);
  assert.equal(takePreset("iman:hooks-count", 20), true);
});
