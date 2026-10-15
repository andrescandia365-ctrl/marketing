// "Sin clave": the prompt for claude.ai, and the pasted reply read tolerantly and checked with the writer's own schema.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  ANSWER_LINE,
  HandoffSchema,
  NO_JSON,
  assemblePrompt,
  dropTrailingCommas,
  promptSizeText,
  readReply,
  replyErrorText,
} from "../shared/handoff.ts";
import { MenuSchema, normalizeStory } from "../shared/schema.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { DEMO_BOARD, DEMO_MENU, DEMO_STORY } from "../server/demo.ts";
import { PasteError, boardTask, menuTask, reviseStoryTask, taskFromPaste, taskPrompt } from "../server/claude.ts";

const menuJson = JSON.stringify(DEMO_MENU);

test("a reply in a code fence with prose around it is read", () => {
  const text = `Acá va el menú:\n\n\`\`\`json\n${JSON.stringify(DEMO_MENU, null, 2)}\n\`\`\`\n\n¿Querés que cambie algo?`;
  const read = readReply(text, MenuSchema);
  assert.ok(read.ok);
  assert.deepEqual(read.ok && read.value, DEMO_MENU);
});

test("<think> blocks, a lone closing tag and a wrapper object are tolerated", () => {
  const think = `<think>The {draft} could be {"ideas": []}…</think>${menuJson}`;
  assert.ok(readReply(think, MenuSchema).ok);
  const closing = `reasoning with {braces}</think>\n${menuJson}`;
  assert.ok(readReply(closing, MenuSchema).ok);
  const wrapped = `{"menu": ${menuJson}}`;
  const read = readReply(wrapped, MenuSchema);
  assert.ok(read.ok);
  assert.equal(read.ok && read.value.ideas.length, DEMO_MENU.ideas.length);
});

test("trailing commas are dropped outside strings only", () => {
  assert.equal(dropTrailingCommas('{"a": [1, 2,], "b": "x,}",}'), '{"a": [1, 2], "b": "x,}"}');
  const sloppy = menuJson.replace(/\]\}$/, ",]}").replace('"questions":', '"questions" :');
  assert.ok(readReply(sloppy, MenuSchema).ok);
});

test("no JSON at all, or a cut-off reply, says to copy the whole answer", () => {
  assert.equal(replyErrorText(readReply("Perdón, no puedo con eso.", MenuSchema)), NO_JSON);
  assert.equal(replyErrorText(readReply(menuJson.slice(0, 200), MenuSchema)), NO_JSON);
});

test("a reply with the wrong shape names the field, in Spanish", () => {
  const broken = { ...DEMO_MENU, ideas: DEMO_MENU.ideas.map((idea, i) => (i === 1 ? { ...idea, title: undefined } : idea)) };
  const text = replyErrorText(readReply(JSON.stringify(broken), MenuSchema));
  assert.match(text ?? "", /^La respuesta pegada no tiene la forma que espera la app: falta «ideas\.2\.title»/);
  const wrong = replyErrorText(readReply('{"ideas": "seis", "questions": []}', MenuSchema));
  assert.match(wrong ?? "", /«ideas» tendría que ser una lista/);
});

test("the closest candidate's error is the one reported (a wrapper with a near miss inside)", () => {
  const inner = { ...DEMO_MENU, questions: "ninguna" };
  const text = replyErrorText(readReply(JSON.stringify({ reply: inner }), MenuSchema));
  assert.match(text ?? "", /«questions»/);
});

test("the handoff field takes prompt or paste, and an empty paste says what to do", () => {
  assert.ok(HandoffSchema.safeParse({ mode: "prompt" }).success);
  assert.ok(HandoffSchema.safeParse({ mode: "paste", reply: "{}" }).success);
  const empty = HandoffSchema.safeParse({ mode: "paste", reply: "" });
  assert.ok(!empty.success);
  assert.match(empty.error.issues[0].message, /Pegá la respuesta/);
});

test("assemblePrompt puts the system blocks, the request, the answer line and the schema in order", () => {
  const schema = z.object({ word: z.string() });
  const text = assemblePrompt(["SYSTEM ONE", "SYSTEM TWO"], "Say a word.", schema);
  const at = (s: string) => text.indexOf(s);
  assert.ok(at("SYSTEM ONE") < at("SYSTEM TWO"));
  assert.ok(at("SYSTEM TWO") < at("Say a word."));
  assert.ok(at("Say a word.") < at(ANSWER_LINE));
  assert.ok(text.trimEnd().endsWith(JSON.stringify(z.toJSONSchema(schema)).replace('"$schema":"https://json-schema.org/draft/2020-12/schema",', "")));
  assert.ok(!text.includes("$schema"));
});

test("the menu task's prompt carries the engine, the playbook, the series bible, the brief and the schema", () => {
  const { prompt, chars } = taskPrompt(menuTask(EXAMPLE_BRIEF));
  assert.equal(chars, prompt.length);
  assert.match(prompt, /writers' room of a content studio/);
  assert.match(prompt, /Propose six topic ideas/);
  assert.match(prompt, /Series: /);
  assert.ok(prompt.includes(ANSWER_LINE));
  assert.ok(prompt.includes('"ideas"') && prompt.includes('"questions"'));
  // The menu does not use the tool profile.
  assert.ok(!prompt.includes("Write visualPrompt and videoPrompt in the format this tool profile describes"));
  // The board does.
  assert.ok(taskPrompt(boardTask(EXAMPLE_BRIEF, DEMO_STORY)).prompt.includes("Write visualPrompt and videoPrompt in the format this tool profile describes"));
});

test("a pasted reply goes through the task's own normalisation", () => {
  const story = taskFromPaste(reviseStoryTask(EXAMPLE_BRIEF, DEMO_STORY, "más corto"), `\`\`\`\n${JSON.stringify(DEMO_STORY)}\n\`\`\``);
  assert.equal(story.title, DEMO_STORY.title);
  // normalizeStory ran (it puts the moves in the playbook's order).
  assert.deepEqual(story.topics[0].moves, normalizeStory(DEMO_STORY as never).topics[0].moves);
  const board = taskFromPaste(boardTask(EXAMPLE_BRIEF, DEMO_STORY), JSON.stringify(DEMO_BOARD));
  assert.equal(board.shots.length, DEMO_BOARD.shots.length);
  assert.ok(board.shots.every((s) => [6, 10, 15].includes(s.seconds)));
  assert.throws(() => taskFromPaste(menuTask(EXAMPLE_BRIEF), "nada"), (e: unknown) => e instanceof PasteError && e.message === NO_JSON);
});

test("the prompt's size is said plainly, and a very long one says so", () => {
  assert.match(promptSizeText(800), /^800 caracteres\. Pegalo entero/);
  assert.match(promptSizeText(52_000), /^Es largo \(52 mil caracteres\)/);
  assert.match(promptSizeText(200_000), /^Es muy largo/);
});
