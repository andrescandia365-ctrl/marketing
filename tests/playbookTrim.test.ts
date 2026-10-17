// The operative playbook (server/playbook.md) stays short but keeps every hard rule (idea 52), the playbook's
// examples are not business facts (idea 26), and Grok's profile carries the tested Audio panel notes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SUMMARY = read("server/playbook.md");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

test("the operative playbook stays trimmed: no sources, evidence tags or ad template", () => {
  assert.ok(words(SUMMARY) < 1800, `server/playbook.md tiene ${words(SUMMARY)} palabras`);
  for (const gone of ["http", "[V]", "[BK]", "[INF]", "Script template", "75 s", "STEPPS", "Pew"]) assert.ok(!SUMMARY.includes(gone), gone);
});

test("the operative playbook keeps every hard rule, the frame, the moves and the checklist", () => {
  for (const kept of ["[VERIFY]", "concept", "simulation", "politic", "likeness", "Negative", "Touching", "Good", "Turn", "Hook in the first 2 seconds", "Image prompt slots", "Borrow the structure, never the ad", "Checklist", "Never sell fear, shame or guilt"]) {
    assert.ok(SUMMARY.includes(kept), kept);
  }
  const moves = ["Clip Drop", "Contradiction", "Slow Reaction", "Escalator", "Turn", "Button", "Curiosity Gap", "Field Visit", "Callback", "Remote Stand-up"];
  for (const m of moves) assert.ok(SUMMARY.includes(`| ${m} |`), m);
});

test("no writer prompt quotes the old Contradiction example as if it were a fact", () => {
  for (const f of ["PLAYBOOK.md", "server/playbook.md", "server/engine.md", "server/ads.md", "server/claude.ts", "server/adsWriter.ts"]) {
    assert.ok(!/40 in stock|shelf says 3/i.test(read(f)), f);
  }
  assert.match(read("PLAYBOOK.md"), /The Contradiction\*\* \|[^\n]*Illustrative only/);
});

test("Grok's profile has the tested Audio panel notes", () => {
  const grok = read("server/tools/grok-imagine.md");
  assert.match(grok, /\[TESTED\] Audio panel: sample voices \(Ara, Eve, Leo, Rex, Sal/);
  assert.match(grok, /\[TESTED\] The audio alone cannot be downloaded/);
});
