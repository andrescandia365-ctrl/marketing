// The story's moves (PLAYBOOK §2.5), the checks that gate approval, hook variants and the writers' room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { storyProblems, boardChecks, boardProblems, borrowedNames, actionWords, polishWords } from "../shared/checks.ts";
import { MOVES, moveCounts, pickMove, pickMoves } from "../shared/moves.ts";
import { overusedMoves, roomBrief, storyCard } from "../shared/room.ts";
import { migrateStory, normalizeHookVariants, normalizeStory, type Story } from "../shared/schema.ts";
import { DEMO_BOARD, DEMO_STORY } from "../server/demo.ts";

const story = (patch: Partial<Story> = {}): Story => ({ ...DEMO_STORY, ...patch });

test("moves are read from ids, the playbook's English names and the Spanish labels", () => {
  assert.deepEqual(pickMoves(["The Turn", "clip drop", "Botón", "remote stand-up", "nonsense", "turn"]), ["clipDrop", "turn", "button", "remoteStandup"]);
  assert.equal(pickMove("Reacción lenta"), "slowReaction");
  assert.equal(pickMove("?"), null);
  const counts = moveCounts([["turn", "button"], ["turn"], []]);
  assert.equal(counts.turn, 2);
  assert.equal(counts.button, 1);
  assert.equal(MOVES.length, 10);
});

test("normalizeStory maps each topic's moves; old stories get an empty list", () => {
  const wire = { ...DEMO_STORY, topics: DEMO_STORY.topics.map((t) => ({ ...t, moves: ["Clip Drop", "escalator", "giro", "bogus"] })) } as never;
  assert.deepEqual(normalizeStory(wire).topics[0].moves, ["clipDrop", "escalator", "turn"]);
  const old = { ...DEMO_STORY, topics: DEMO_STORY.topics.map(({ moves: _moves, ...t }) => t) } as unknown as Story;
  assert.deepEqual(migrateStory(old).topics[0].moves, []);
});

test("a story with moves needs a Turn and a Button; one without moves is not judged on them", () => {
  const ids = (s: Story) => storyProblems(s).map((p) => p.id);
  assert.ok(!ids(story()).some((id) => id.startsWith("jugada:")));
  const noTurn = story({ topics: DEMO_STORY.topics.map((t) => ({ ...t, moves: ["clipDrop", "button"] })) });
  assert.ok(ids(noTurn).includes("jugada:giro"));
  assert.ok(!ids(noTurn).includes("jugada:boton"));
  const untagged = story({ topics: DEMO_STORY.topics.map((t) => ({ ...t, moves: [] })) });
  assert.ok(!ids(untagged).some((id) => id.startsWith("jugada:")));
});

test("a piece without a narrator blocks narrator lines", () => {
  const withNarrator = story({
    characters: [...DEMO_STORY.characters, { id: "nar", name: "Narrador", role: "narrator", voice: "", identity: "" }],
    topics: DEMO_STORY.topics.map((t) => ({ ...t, lines: [...t.lines, { beat: "good", speaker: "nar", text: "Y así termina.", emotion: "", direction: "" }] })),
  });
  assert.ok(storyProblems(withNarrator, { narrator: "without" }).some((p) => p.label === "Sin narrador"));
  assert.ok(!storyProblems(withNarrator, { narrator: "with" }).some((p) => p.label === "Sin narrador"));
});

test("board issues become problems tied to their shot", () => {
  const problems = boardProblems({ ...DEMO_BOARD, issues: [{ shot: 2, kind: "continuity", note: "No sigue." }] });
  const issue = problems.find((p) => p.id.startsWith("board:"))!;
  assert.equal(issue.shot, 1);
  assert.match(issue.label, /Continuidad/);
});

test("checklist §7.4: the brand never opens the piece", () => {
  const brandFirst = story({
    topics: DEMO_STORY.topics.map((t, i) => (i === 0 ? { ...t, lines: [{ ...t.lines[0], speaker: "iman" }, ...t.lines.slice(1)] } : t)),
  });
  assert.ok(storyProblems(brandFirst).some((p) => p.id === "cliente-heroe"));
  assert.ok(!storyProblems(story()).some((p) => p.id === "cliente-heroe"));
});

test("checklist §7.4: nothing borrowed from the show, in the story or the board", () => {
  assert.deepEqual(borrowedNames("Como en The Daily Show, Jon  Stewart diría…"), ["daily show", "jon stewart"]);
  assert.deepEqual(borrowedNames("Snlaguna no cuenta; dostoievski tampoco"), []);
  const borrowed = story({ title: "Al estilo SNL" });
  assert.ok(storyProblems(borrowed).some((p) => p.label === "Nada prestado"));
  const board = { ...DEMO_BOARD, shots: DEMO_BOARD.shots.map((s, i) => (i === 1 ? { ...s, visualPrompt: `${s.visualPrompt} Colbert style desk.` } : s)) };
  assert.ok(boardChecks(board).some((p) => p.label === "Nada prestado"));
});

test("checklist §7.4: the hook shows the pain in 2 s, and the Good shows the product in use", () => {
  const base = { ...DEMO_BOARD, issues: [] };
  assert.deepEqual(boardChecks(base).map((p) => p.id), []);
  const goodFirst = { ...base, shots: [{ ...base.shots[0], beat: "good" as const }, ...base.shots.slice(1)] };
  assert.deepEqual(boardChecks(goodFirst).map((p) => p.id), ["gancho:dolor"]);
  const silent = { ...base, shots: [{ ...base.shots[0], voiceover: "", onScreenText: "" }, ...base.shots.slice(1)] };
  assert.deepEqual(boardChecks(silent).map((p) => p.id), ["gancho:mudo"]);
  // With a real screen in the series' cast, a Good with no screen shot and no product setup is flagged…
  assert.deepEqual(boardChecks(base, { app: "screen" }).map((p) => p.id), ["producto-en-uso"]);
  // …and a Good shot of the real screen clears it.
  const withScreen = { ...base, shots: base.shots.map((s) => (s.beat === "good" ? { ...s, kind: "screen" as const, screen: "app" } : s)) };
  assert.deepEqual(boardChecks(withScreen, { app: "screen" }).map((p) => p.id), []);
});

test("an image prompt with an action or a polished look is caught", () => {
  assert.deepEqual(actionWords("A woman lifts a yogurt, then smiles"), ["then", "lifts"]);
  assert.deepEqual(polishWords("Cinematic shot, 8k"), ["cinematic", "8k"]);
});

test("hook variants: five at most, each with a known move and a level from 1 to 5", () => {
  const variants = normalizeHookVariants({
    variants: [
      { title: "Uno", move: "The Contradiction", level: 7, why: "" },
      { title: "Dos", move: "???", level: 0, why: "" },
      { title: " ", move: "turn", level: 2, why: "" },
      ...Array.from({ length: 5 }, (_, i) => ({ title: `Extra ${i}`, move: "callback", level: 3, why: "" })),
    ],
  });
  assert.equal(variants.length, 5);
  assert.deepEqual([variants[0].move, variants[0].level], ["contradiction", 5]);
  assert.deepEqual([variants[1].move, variants[1].level], ["curiosityGap", 1]);
});

test("the writers' room counts the moves each piece used and names the ones the series leans on", () => {
  const card = (id: string, moves: string[]) => storyCard(id, "2026-10-07", { problem: `Problema ${id}`, topics: [{ moves }] })!;
  const cards = [card("a", ["clipDrop", "turn"]), card("b", ["Clip Drop", "button"]), card("c", ["clipDrop", "escalator"])];
  assert.deepEqual(cards[1].moves, ["clipDrop", "button"]);
  assert.deepEqual(overusedMoves(cards).map((m) => m.move), ["clipDrop"]);
  assert.match(roomBrief(cards), /clipDrop \(3 of 3\)/);
  assert.equal(overusedMoves(cards.slice(0, 2)).length, 0);
});
