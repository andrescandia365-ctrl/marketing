// The preview's smooth clock over a media element (src/lib/playClock.ts): continuous between readings, never
// backwards while playing, follows a seek.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaClock } from "../src/lib/playClock.ts";

test("between coarse readings the clock keeps moving, and never goes back", (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const el = { currentTime: 0, paused: false, seeking: false, ended: false, readyState: 4, playbackRate: 1 } as unknown as HTMLMediaElement;
  const clock = mediaClock();
  const out: number[] = [];
  for (let frame = 0; frame < 60; frame++) {
    now += 1000 / 60;
    // The element only updates every 250 ms, and a little behind.
    if (frame % 15 === 0) (el as { currentTime: number }).currentTime = Math.max(0, (now - 1000) / 1000 - 0.01);
    out.push(clock(el));
  }
  for (let i = 1; i < out.length; i++) assert.ok(out[i] >= out[i - 1], `went back at frame ${i}`);
  const repeated = out.slice(1).filter((v, i) => v === out[i]).length;
  assert.ok(repeated < 5, `${repeated} frames did not move`);
  // A seek backwards is followed.
  (el as { currentTime: number }).currentTime = 0.2;
  now += 16;
  assert.ok(clock(el) < 0.3);
});
