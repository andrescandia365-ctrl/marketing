// "Episodios estudiados" (idea 57): the §2.6 episode log appended from the app, its numbering, the moves that repeat,
// and how the playbook snapshot records the append without letting the episode reach server/playbook.md.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendEpisode,
  entryMoves,
  episodeEntries,
  episodeMarkdown,
  episodeTemplate,
  moveTally,
  nextEpisodeNumber,
  playbookMoveNames,
  prepareEntry,
  spanDuration,
  type EpisodeWire,
} from "../shared/episodes.ts";
import { describeDrift, drift, recordAppend, sections, snapshot, trackedSections } from "../scripts/playbookSync.ts";
import { addEpisode } from "../server/episodes.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const PLAYBOOK = read("PLAYBOOK.md");
const SUMMARY = read("server/playbook.md");

const wire = (moves: string[], title = '"A made-up episode"'): EpisodeWire => ({
  title,
  source: "",
  runtime: "0:00–6:00",
  subject: "Satire of a city's parking rules, as given in the summary.",
  terminology: [],
  topics: [
    { time: "0:00–2:09", duration: "", topic: "Parking week", opens: "Calendar observation", beats: "The sign (1:10)", callback: "" },
    { time: "2:10–6:00", duration: "3:50", topic: "Field piece", opens: "Cut to a correspondent", beats: "The meter | the tow (4:00)", callback: "5:40, back to the sign" },
  ],
  moves,
  observations: ["Two topics, one bridge."],
  translation: ["Calendar peg → occasion hook."],
  check: ["URL/date", "who hosts."],
});

test("the episode log is read from §2.6: EP-01 with its moves, the template in its fence is not an episode", () => {
  const eps = episodeEntries(PLAYBOOK);
  assert.deepEqual(
    eps.map((e) => e.n),
    [1],
  );
  assert.deepEqual(eps[0].moves, ["The Callback", "The Contradiction", "The Remote Stand-up"]);
  assert.ok(eps[0].body.includes("**Check against the video:**"));
  assert.ok(!eps[0].body.trimEnd().endsWith("---"));
  assert.equal(nextEpisodeNumber(PLAYBOOK), 2);
  assert.ok(playbookMoveNames(PLAYBOOK).includes("The Clip Drop"));
  assert.ok(playbookMoveNames(PLAYBOOK).includes("The Remote Stand-up"));
});

test("a writer draft becomes an EP entry in the template's shape", () => {
  const md = episodeMarkdown(2, wire(["The Callback", "Calendar peg"]));
  assert.match(md, /^#### EP-02 — "A made-up episode" `\[EP\]`/);
  assert.match(md, /\| 1 \| 0:00–2:09 \| 2:09 \| Parking week \|/);
  assert.ok(md.includes("The meter \\| the tow (4:00)"), "a pipe in a cell is escaped");
  assert.ok(md.includes("| None listed |"));
  assert.ok(md.includes("**Check against the video:** URL/date; who hosts."));
  assert.deepEqual(entryMoves(md), ["The Callback", "Calendar peg"]);
  assert.equal(spanDuration("2:09–4:47"), "2:38");
  assert.equal(spanDuration("bad"), "");
  assert.match(episodeTemplate(5), /^#### EP-05 — /);
});

test("appending puts the entry at the end of §2.6, before the rule that closes it, as the next number", () => {
  const draft = episodeMarkdown(7, wire(["The Callback"])); // the draft's number is not trusted
  const { text, n, entry } = appendEpisode(PLAYBOOK, draft);
  assert.equal(n, 2);
  assert.match(entry, /^#### EP-02 — /);
  const at = text.indexOf("#### EP-02");
  assert.ok(at > text.indexOf("#### EP-01"));
  assert.ok(at < text.indexOf("## 3. Writing rules"));
  assert.match(text.slice(at), /\n\n---\n\n## 3\. Writing rules/);
  // Nothing but §2.6 changes.
  const other = (md: string) => sections(md).filter((s) => !s.title.startsWith("2.6 "));
  assert.deepEqual(other(text), other(PLAYBOOK));
  assert.deepEqual(
    episodeEntries(text).map((e) => e.n),
    [1, 2],
  );
  const third = appendEpisode(text, draft);
  assert.equal(third.n, 3);
  assert.deepEqual(
    episodeEntries(third.text).map((e) => e.n),
    [1, 2, 3],
  );
});

test("an edited entry is made safe: no big headings, no second EP heading, closed fences, not empty", () => {
  const ready = prepareEntry("### EP-9 — Title [EP]\n## Topics\n#### EP-03 again\n- line", 4);
  assert.deepEqual(ready.split("\n"), ["#### EP-04 — Title `[EP]`", "#### Topics", "**EP-03 again**", "- line"]);
  assert.match(prepareEntry("- **Source:** x\n- more", 2), /^#### EP-02 — Untitled episode `\[EP\]`\n- \*\*Source:\*\* x/);
  assert.throws(() => prepareEntry("   ", 2), /vacía/);
  assert.throws(() => prepareEntry("#### EP-02 — Only a title", 2), /solo el título/);
  assert.throws(() => prepareEntry("#### EP-02 — T\n```\ncode", 2), /no lo cierra/);
  assert.throws(() => appendEpisode("# P\n\n## 1. Uno\n\nx\n", "#### EP-01 — T\n- x"), /2\.6/);
});

test("a move in 3+ episodes is proposed for §2.5 only when §2.5 does not have it", () => {
  let md = PLAYBOOK;
  for (let i = 0; i < 2; i++) md = appendEpisode(md, episodeMarkdown(0, wire(["Calendar peg", "The Callback"]))).text;
  let tally = moveTally(md);
  assert.equal(tally.find((t) => t.name === "Callback")?.episodes.length, 3);
  assert.equal(tally.find((t) => t.name === "Callback")?.propose, false);
  assert.equal(tally.find((t) => t.name === "Callback")?.inPlaybook, true);
  assert.equal(tally.find((t) => t.name === "Calendar peg")?.propose, false, "two episodes are not a pattern yet");
  md = appendEpisode(md, episodeMarkdown(0, wire(["calendar peg"]))).text;
  tally = moveTally(md);
  const peg = tally.find((t) => t.name === "Calendar peg");
  assert.deepEqual(peg?.episodes, [2, 3, 4]);
  assert.equal(peg?.propose, true);
  assert.equal(peg?.inPlaybook, false);
});

test("the snapshot records an append without the episode reaching the summary, and keeps other drift visible", () => {
  const snap = read("scripts/playbook.snapshot.md");
  const after = appendEpisode(PLAYBOOK, episodeMarkdown(0, wire(["The Callback"]))).text;

  // In step before → written again exactly like `npm run playbook -- --write`.
  const rec = recordAppend(snap, PLAYBOOK, after, SUMMARY);
  assert.equal(rec.status, "recorded");
  assert.equal(rec.snapshot, snapshot(after, SUMMARY));
  assert.equal(describeDrift(drift(rec.snapshot!, after, SUMMARY)), "");
  // Without recording, the append would be drift: §2.6 stays tracked.
  assert.deepEqual(
    drift(snap, after, SUMMARY).sections.map((s) => s.title),
    [trackedSections(PLAYBOOK).find((s) => s.title.startsWith("2.6 "))!.title],
  );

  // The summary had changed (or another section): only §2.6 is recorded; the rest still drifts.
  const otherDrift = recordAppend(snap, PLAYBOOK, after, `${SUMMARY}\nA new rule.\n`);
  assert.equal(otherDrift.status, "patched");
  const d = drift(otherDrift.snapshot!, after, `${SUMMARY}\nA new rule.\n`);
  assert.equal(d.summaryChanged, true);
  assert.equal(d.sections.length, 0);
  const edited = PLAYBOOK.replace("Concrete beats clever.", "Concrete beats cute.");
  const editedAfter = appendEpisode(edited, episodeMarkdown(0, wire([]))).text;
  const patched = recordAppend(snap, edited, editedAfter, SUMMARY);
  assert.equal(patched.status, "patched");
  assert.deepEqual(
    drift(patched.snapshot!, editedAfter, SUMMARY).sections.map((s) => s.title),
    ["3. Writing rules for Claude (voice and structure)"],
  );

  // A hand edit to the log nobody recorded: nothing is recorded, the check keeps saying so.
  const handEdited = PLAYBOOK.replace("Runtime covered: 0:00–10:44", "Runtime covered: 0:00–10:45");
  const left = recordAppend(snap, handEdited, appendEpisode(handEdited, episodeMarkdown(0, wire([]))).text, SUMMARY);
  assert.deepEqual(left, { snapshot: null, status: "left" });
});

test("addEpisode writes PLAYBOOK.md and the snapshot, and never server/playbook.md", () => {
  const root = mkdtempSync(join(tmpdir(), "episodes-"));
  mkdirSync(join(root, "server"));
  mkdirSync(join(root, "scripts"));
  for (const f of ["PLAYBOOK.md", "server/playbook.md", "scripts/playbook.snapshot.md"]) copyFileSync(new URL(`../${f}`, import.meta.url), join(root, f));
  const r = addEpisode(episodeMarkdown(0, wire(["Calendar peg"])), root);
  assert.equal(r.n, 2);
  assert.equal(r.record, "recorded");
  assert.equal(readFileSync(join(root, "server/playbook.md"), "utf8"), SUMMARY);
  const research = readFileSync(join(root, "PLAYBOOK.md"), "utf8");
  assert.ok(research.includes("#### EP-02 — "));
  assert.equal(describeDrift(drift(readFileSync(join(root, "scripts/playbook.snapshot.md"), "utf8"), research, SUMMARY)), "");
  assert.equal(r.view.next, 3);
  assert.equal(r.view.drift, "");
  assert.deepEqual(
    r.view.episodes.map((e) => e.n),
    [1, 2],
  );
  // A later hand edit to an earlier episode still shows as drift.
  const hand = research.replace("Runtime covered: 0:00–10:44", "Runtime covered: 0:00–10:45");
  assert.ok(drift(readFileSync(join(root, "scripts/playbook.snapshot.md"), "utf8"), hand, SUMMARY).sections.length > 0);
});
