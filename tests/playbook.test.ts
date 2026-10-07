// PLAYBOOK.md (the research) and server/playbook.md (what the writer reads) never drift apart silently (idea 48).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeDrift, drift, sections, snapshot, trackedSections } from "../scripts/playbookSync.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the two playbooks are in step (else: update the other one, then npm run playbook -- --write)", () => {
  const d = drift(read("scripts/playbook.snapshot.md"), read("PLAYBOOK.md"), read("server/playbook.md"));
  assert.equal(describeDrift(d), "");
});

test("the tracked sections are §1 to §7 without the show's business facts", () => {
  const titles = trackedSections(read("PLAYBOOK.md")).map((s) => s.title);
  assert.ok(titles.some((t) => t.startsWith("2.5 ")));
  assert.ok(titles.some((t) => t.startsWith("3.1 ")));
  assert.ok(titles.some((t) => t.startsWith("7. ")));
  assert.ok(!titles.some((t) => t.startsWith("2.1 ")));
  assert.ok(!titles.some((t) => /^(8|9|10)\. /.test(t)));
});

test("a change on either side is reported, with the lines that changed", () => {
  const research = "# P\n\n## 1. Uno\n\nRegla A\n\n## 2. Dos\n\n### 2.1 Datos\n\nNúmeros\n\n### 2.2 Motor\n\nRegla B\n\n## 8. Preguntas\n\n¿?\n";
  const summary = "# Operativo\n\nRegla A y B\n";
  const snap = snapshot(research, summary);
  assert.deepEqual(sections(snap).map((s) => s.title), ["1. Uno", "2. Dos", "2.2 Motor"]);
  assert.equal(describeDrift(drift(snap, research, summary)), "");
  const edited = drift(snap, research.replace("Regla B", "Regla C"), summary);
  assert.deepEqual(edited.sections.map((s) => [s.title, s.status]), [["2.2 Motor", "changed"]]);
  assert.deepEqual(edited.sections[0].lines, ["- Regla B", "+ Regla C"]);
  assert.equal(drift(snap, research.replace("Números", "Otros"), summary).sections.length, 0);
  assert.equal(drift(snap, research, `${summary}Regla D\n`).summaryChanged, true);
});
