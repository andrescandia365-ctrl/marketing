// Elementos del gancho: the thing in the first 1–2 seconds. Empty stays empty and prompts stay as they were.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ELEMENT_LIBRARY_MAX,
  addElementSet,
  appendClause,
  commitHookElements,
  elementAxis,
  elementImageClause,
  elementProblems,
  elementosMarkdown,
  hookLibraryLine,
  hookPreviousLine,
  libraryAdd,
  libraryWithout,
  namesRealMark,
  normalizeHookElements,
  pieceWithSet,
  previousFrom,
  readHookLibraryLine,
  readHookPreviousLine,
  repeatedElements,
  sampleHookElements,
  stillSlotText,
  withElementPrompt,
  type ElementCarrier,
  type HookElement,
} from "../shared/hookElements.ts";

const mic: HookElement = {
  id: "he-mic",
  what: "a bubblegum-pink handheld microphone with glitter, no logo",
  label: "Micrófono rosa",
  why: "El rosa chicle corta el scroll.",
  tie: "Es el objeto del reclamo.",
  placement: "center",
};

test("normalizeHookElements reads a JSON string, an elements object, and stops at the cap", () => {
  const row = { id: "he-1", what: "a cracked timer, no brand", label: "Timer", why: "El cero.", tie: "El tiempo.", placement: "center" };
  assert.deepEqual(normalizeHookElements(""), []);
  assert.deepEqual(normalizeHookElements("not json"), []);
  assert.equal(normalizeHookElements(JSON.stringify([row]))[0]?.id, "he-1");
  assert.equal(normalizeHookElements({ elements: [row, { what: "" }] }).length, 1);
  const many = Array.from({ length: 5 }, (_, i) => ({ ...row, id: `he-${i}`, what: `a plain cup ${i}, no logo` }));
  assert.equal(normalizeHookElements(many, 2).length, 2);
  const library = Array.from({ length: 45 }, (_, i) => ({ ...row, id: `he-lib-${i}`, what: `a plain object ${i}, no logo` }));
  assert.equal(normalizeHookElements(library, ELEMENT_LIBRARY_MAX).length, 40);
  assert.equal(normalizeHookElements(JSON.stringify(library), ELEMENT_LIBRARY_MAX).length, 40);
});

test("previousFrom keeps what and label, trimmed, at most three", () => {
  assert.deepEqual(previousFrom(undefined), []);
  assert.deepEqual(
    previousFrom([
      { what: " a pink mic ", label: "Micrófono" },
      { what: "a timer", label: "Timer" },
    ]),
    ["a pink mic", "Micrófono", "a timer"],
  );
});

test("appendClause and the prompt helpers leave an empty list byte-identical", () => {
  const prompt = "A counter.";
  const clause = "a pink mic, in the center of the frame, clear of the corners";
  const once = appendClause(prompt, clause);
  assert.equal(appendClause(once, clause), once);
  assert.equal(appendClause(once, `${clause}.`), once);
  assert.equal(withElementPrompt(prompt, [], "image"), prompt);
  assert.equal(withElementPrompt(prompt, undefined, "video"), prompt);
  assert.equal(stillSlotText(prompt, undefined, 1), prompt);
  assert.equal(stillSlotText(prompt, [], 7), prompt);
  assert.equal(elementImageClause(mic), `${mic.what}, in the center of the frame, clear of the corners`);
  const withIt = withElementPrompt(prompt, [mic], "image");
  assert.match(withIt, /center of the frame, clear of the corners/);
  assert.equal(withElementPrompt(withIt, [mic], "image"), withIt);
});

test("a real logo fails and a negated one, or an ordinary center, does not", () => {
  assert.equal(namesRealMark("a generic police car with no real insignia"), false);
  assert.equal(namesRealMark("a plain cup, no logo"), false);
  assert.equal(namesRealMark("a mug without a logo"), false);
  assert.equal(namesRealMark("una taza sin insignia"), false);
  assert.equal(namesRealMark("a Nike swoosh logo"), true);
  assert.equal(namesRealMark("a police badge"), true);
  assert.deepEqual(elementProblems([mic]), []);
  assert.ok(elementProblems([{ ...mic, id: "he-logo", what: "a Nike swoosh logo" }]).some((p) => p.id === "elemento:marca:he-logo"));
  assert.ok(
    elementProblems([{ ...mic, id: "he-top", what: "a pink microphone in the top right corner, no logo" }]).some((p) => p.id === "elemento:zona:he-top"),
  );
  assert.ok(elementProblems([{ ...mic, tie: "  " }]).some((p) => p.id === "elemento:nexo:he-mic"));
});

test("the library adds by what, drops by id, and the markdown is empty when there is nothing", () => {
  const added = libraryAdd([mic], { ...mic, label: "Otro" });
  assert.equal(added.length, 1);
  assert.equal(added[0]?.label, "Otro");
  const second = libraryAdd(added, { ...mic, id: "he-car", what: "a generic police car with no real insignia", label: "Auto" });
  assert.deepEqual(second.map((e) => e.id), ["he-mic", "he-car"]);
  assert.deepEqual(libraryWithout(second, "he-mic").map((e) => e.id), ["he-car"]);
  assert.equal(elementosMarkdown([]), "");
  assert.equal(elementosMarkdown(undefined), "");
  assert.match(elementosMarkdown([mic]), /^\n\*\*Elementos del gancho:\*\*\n/);
  assert.match(elementosMarkdown([mic]), /Micrófono rosa/);
  const line = hookLibraryLine([mic]);
  assert.equal(line.length, 1);
  assert.equal(readHookLibraryLine(`Serie\n${line[0]}\n## Elenco\n`)[0]?.what, mic.what);
  assert.deepEqual(readHookLibraryLine("sin linea"), []);
  assert.deepEqual(hookLibraryLine([]), []);
  const prev = hookPreviousLine(previousFrom([mic]));
  assert.deepEqual(readHookPreviousLine(prev.join("\n")), previousFrom([mic]));
});

test("the sample is three complete center things and one set does not rename the ad", () => {
  const sample = sampleHookElements("quedarse sin mercadería");
  assert.deepEqual(sample.map((e) => e.id), ["he-sample-1", "he-sample-2", "he-sample-3"]);
  assert.ok(sample.every((e) => e.placement === "center" && e.tie.trim() && !namesRealMark(e.what)));
  assert.equal(sample[0]?.what, "a bubblegum-pink handheld microphone with glitter, no logo");
  assert.deepEqual(elementProblems(sample), []);
  assert.deepEqual(elementAxis([]), [undefined]);
  assert.deepEqual(elementAxis(["e1"]), [undefined]);
  assert.deepEqual(elementAxis(undefined), [undefined]);
  const hook: ElementCarrier = { visualPrompt: "A counter.", videoPrompt: "Hold.", hookElements: sample.slice(0, 1) };
  const two = addElementSet(hook);
  assert.deepEqual(two.elementSets?.map((s) => s.id), ["e1", "e2"]);
  assert.equal(two.elementSets?.[1]?.elements[0]?.id, "he-sample-1-e2");
  assert.deepEqual(elementAxis(two.elementSets?.map((s) => s.id)), ["e1", "e2"]);
  assert.equal(pieceWithSet(hook, "e2"), hook);
  const rendered = pieceWithSet(two, "e2");
  assert.equal(rendered.hookElements?.[0]?.id, "he-sample-1-e2");
  assert.equal(pieceWithSet(two, "e9"), two);
  assert.equal(addElementSet(addElementSet(two)).elementSets?.length, 3);
});

test("a repeated what is named, and the hook shot is the only one rewritten", () => {
  const sample = sampleHookElements("el reclamo");
  assert.equal(repeatedElements(["micrófono rosa"], sample).length, 1);
  assert.deepEqual(repeatedElements([], sample), []);
  const board = { setups: [] as { id: string; name: string; identity: string; castId: string }[], shots: [{ kind: "single", setups: [] as string[], visualPrompt: "A counter.", videoPrompt: "Hold." }] };
  const one = sample.slice(0, 1);
  const committed = commitHookElements(board, [], one);
  assert.match(committed.board.shots[0]!.visualPrompt, /bubblegum-pink/);
  assert.match(committed.board.shots[0]!.visualPrompt, /center of the frame, clear of the corners/);
  assert.equal(committed.board.setups[0]?.id, "he-sample-1");
  assert.deepEqual(committed.board.shots[0]?.setups, ["he-sample-1"]);
  const again = commitHookElements(committed.board, one, one);
  assert.equal(again.board.shots[0]?.visualPrompt, committed.board.shots[0]?.visualPrompt);
  const transform = { setups: [], shots: [{ kind: "transform", setups: [], visualPrompt: "A counter.", videoPrompt: "Hold." }] };
  const skipped = commitHookElements(transform, [], one);
  assert.equal(skipped.board.shots[0]?.visualPrompt, "A counter.");
  assert.deepEqual(skipped.missing, ["la toma 1 no es una imagen única"]);
});
