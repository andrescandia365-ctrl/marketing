import assert from "node:assert/strict";
import { test } from "node:test";
import { KICK_ACCENT, NO_PULSE, envelope, layerHits, lyricPulse, pulseAt, pulseNote } from "../shared/lyricPulse.ts";

const grid = { usable: true, kicks: [1.5, 1, 2, 2.5, 3], downbeats: [3, 1] };

test("a usable kick grid wins over the master's peaks", () => {
  const p = lyricPulse([0.2, 0.7], grid);
  assert.equal(p.source, "kick");
  assert.deepEqual(p.beats, [1, 1.5, 2, 2.5, 3]);
  assert.deepEqual(p.downbeats, [1, 3]);
  assert.deepEqual(layerHits(p), [1, 3]);
});

test("no grid, an unusable one or one without kicks falls back to the master; nothing gives no pulse", () => {
  assert.equal(lyricPulse([0.5], null).source, "master");
  assert.equal(lyricPulse([0.5], { ...grid, usable: false }).source, "master");
  assert.equal(lyricPulse([0.5], { usable: true, kicks: [], downbeats: [] }).source, "master");
  assert.deepEqual(lyricPulse([], null), NO_PULSE);
  assert.equal(pulseAt(NO_PULSE, 1), 0);
  assert.deepEqual(layerHits(lyricPulse([0.5, 1], null)), [0.5, 1]);
});

test("a downbeat is the big move, a plain kick a small accent", () => {
  const p = lyricPulse([], grid);
  assert.equal(pulseAt(p, 1), 1);
  assert.equal(pulseAt(p, 3), 1);
  // Half a second after a downbeat its tail is below a kick's accent, so the kick sets it.
  assert.ok(Math.abs(pulseAt(p, 1.5) - KICK_ACCENT) < 1e-9);
  assert.ok(Math.abs(pulseAt(p, 2) - KICK_ACCENT) < 1e-9);
  assert.equal(pulseAt(p, 0.5), 0);
  // It settles between hits.
  assert.ok(pulseAt(p, 1.2) < pulseAt(p, 1.0));
});

test("the master fallback keeps today's envelope", () => {
  const p = lyricPulse([1, 2], null);
  assert.equal(pulseAt(p, 1), 1);
  assert.ok(Math.abs(pulseAt(p, 1.2) - Math.exp(-1)) < 1e-9);
  assert.equal(pulseAt(p, 0.9), 0);
});

test("the pulse is a pure function of t", () => {
  const p = lyricPulse([], grid);
  const a = [0, 0.99, 1, 1.3, 2.01, 2.9, 3.4].map((t) => pulseAt(p, t));
  const b = [3.4, 2.9, 2.01, 1.3, 1, 0.99, 0].map((t) => pulseAt(p, t)).reverse();
  assert.deepEqual(a, b);
});

test("envelope finds the last hit at or before t", () => {
  assert.equal(envelope([], 1, 5), 0);
  assert.equal(envelope([1, 2, 3], 2, 5), 1);
  assert.ok(Math.abs(envelope([1, 2, 3], 2.5, 2) - Math.exp(-1)) < 1e-9);
});

test("the studio says what the pulse follows", () => {
  assert.match(pulseNote("kick"), /kick/);
  assert.match(pulseNote("master"), /Reloj/);
  assert.equal(pulseNote("none"), "");
});
