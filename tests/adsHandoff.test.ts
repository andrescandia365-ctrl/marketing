// "Sin clave", part 3: Publicidad by copy and paste with claude.ai. A request whose reply would be too long is split
// into several prompts (50 hooks → 4), each asking for its share of the levels; a pasted reply goes through the same
// schema and normalizers as the writer's answer, and the next prompt, built after it was saved, never repeats it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER_LINE } from "../shared/handoff.ts";
import { BUDGETS, EMPTY_OFFER, emptyAds, flagsFromWire, hooksFromWire, type Cta, type Hook, type Level } from "../shared/ads.ts";
import {
  PASTE_PER_PROMPT,
  copiesFromWire,
  copyChunks,
  copyPairs,
  countParts,
  hookParts,
  partOf,
  partsText,
  promptCount,
  splitCount,
} from "../shared/adsHandoff.ts";
import { PasteError, taskFromPaste, taskPrompt } from "../server/claude.ts";
import { clipTask, copiesTask, hooksTask, reviewTask, type HookRequest } from "../server/adsWriter.ts";

const ALL: Level[] = [1, 2, 3, 4, 5];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("splitCount: as even as possible, never over the limit", () => {
  assert.deepEqual(splitCount(50, 15), [13, 13, 12, 12]);
  assert.deepEqual(splitCount(15, 15), [15]);
  assert.deepEqual(splitCount(16, 15), [8, 8]);
  assert.deepEqual(splitCount(0, 15), []);
  assert.equal(promptCount("hook", 50), 4);
  assert.equal(promptCount("hook", 10), 1);
  assert.equal(promptCount("meat", 8), 1);
  assert.equal(promptCount("copy", 95), 3);
});

test("50 hooks over five levels: four prompts, each with whole runs of levels, ten per level overall", () => {
  const parts = hookParts(50, ALL);
  assert.equal(parts.length, 4);
  assert.deepEqual(
    parts.map((p) => p.count),
    [13, 13, 12, 12],
  );
  for (const p of parts) {
    assert.equal(p.parts, 4);
    assert.ok(p.count <= PASTE_PER_PROMPT.hook);
    assert.equal(sum(p.perLevel.map((l) => l.count)), p.count);
    // Levels go in order inside a prompt and never repeat.
    const lv = p.perLevel.map((l) => l.level);
    assert.deepEqual(lv, [...new Set(lv)].sort());
  }
  const perLevel = new Map<Level, number>();
  for (const p of parts) for (const l of p.perLevel) perLevel.set(l.level, (perLevel.get(l.level) ?? 0) + l.count);
  assert.deepEqual([...perLevel.entries()], ALL.map((l) => [l, 10]));
});

test("few hooks: the first levels get one each; one level: one run", () => {
  const small = hookParts(3, ALL);
  assert.equal(small.length, 1);
  assert.deepEqual(small[0].perLevel, [
    { level: 1, count: 1 },
    { level: 2, count: 1 },
    { level: 3, count: 1 },
  ]);
  const one = hookParts(40, [2]);
  assert.equal(one.length, 3);
  assert.ok(one.every((p) => p.perLevel.length === 1 && p.perLevel[0].level === 2));
  assert.equal(sum(one.map((p) => p.count)), 40);
});

test("partOf clamps; meats and CTAs split only by count", () => {
  const parts = hookParts(50, ALL);
  assert.equal(partOf(parts, 0).part, 1);
  assert.equal(partOf(parts, 9).part, 4);
  assert.throws(() => partOf([], 1));
  assert.deepEqual(countParts("cta", 5), [{ part: 1, parts: 1, count: 5, perLevel: [] }]);
  assert.match(partsText(4, "los hooks"), /Son 4 prompts/);
  assert.match(partsText(1, "los hooks"), /Un solo prompt/);
});

const hookReq = (o: Partial<HookRequest> = {}): HookRequest => ({
  levels: [1, 2],
  count: 13,
  seconds: 15,
  winners: [],
  existing: [],
  language: "es",
  ...o,
});

test("a hooks prompt part names each level's exact count and closes with the schema", () => {
  const [first] = hookParts(50, ALL);
  const { prompt, chars } = taskPrompt(hooksTask("iman", EMPTY_OFFER, "grok-imagine", hookReq({ count: first.count, perLevel: first.perLevel })));
  assert.equal(chars, prompt.length);
  assert.match(prompt, /Write 13 hooks/);
  assert.match(prompt, /\(10 hooks\)/);
  assert.match(prompt, /\(3 hooks\)/);
  assert.ok(prompt.includes(ANSWER_LINE));
  assert.ok(prompt.includes('"hooks"'));
});

test("paste round trip: a hooks reply in a fence with prose becomes pending hooks, and the next prompt avoids them", () => {
  const req = hookReq({ count: 2, perLevel: [{ level: 1, count: 1 }, { level: 2, count: 1 }] });
  const reply = [
    "Acá van los hooks:",
    "```json",
    JSON.stringify({
      hooks: [
        { text: "¿Cuántas veces abriste la heladera hoy?", level: 1, angle: "pain", formula: "question", onScreenText: "La heladera", visualPrompt: "A fridge", videoPrompt: "She opens it" },
        { text: "Cuarenta en el sistema, tres en la góndola.", level: 2, angle: "curiosity", formula: "number", onScreenText: "40 vs 3", visualPrompt: "A shelf", videoPrompt: "Pan left" },
      ],
      note: "",
    }),
    "```",
  ].join("\n");
  const wire = taskFromPaste(hooksTask("iman", EMPTY_OFFER, "grok-imagine", req), reply);
  const state = emptyAds("iman");
  const hooks = hooksFromWire(state, wire, BUDGETS[15].hook, "ai");
  state.hooks.push(...hooks);
  assert.deepEqual(
    hooks.map((h) => [h.id, h.level, h.status]),
    [
      ["H1", 1, "pending"],
      ["H2", 2, "pending"],
    ],
  );
  // The next prompt is built from the saved state: the pasted hooks are listed as existing.
  const next = taskPrompt(hooksTask("iman", EMPTY_OFFER, "grok-imagine", hookReq({ existing: state.hooks.map((h) => h.text) })));
  assert.ok(next.prompt.includes("Cuarenta en el sistema, tres en la góndola."));
});

test("a reply that does not fit says so in Spanish, naming the problem", () => {
  const t = hooksTask("iman", EMPTY_OFFER, "grok-imagine", hookReq());
  assert.throws(() => taskFromPaste(t, "No puedo ayudar con eso."), (e: unknown) => e instanceof PasteError && /JSON completo/.test(e.message));
  assert.throws(
    () => taskFromPaste(t, JSON.stringify({ hooks: [{ text: "hola" }], note: "" })),
    (e: unknown) => e instanceof PasteError && /level|angle|formula/.test(e.message),
  );
});

const hook = (id: string, text: string, level: Level = 2): Hook =>
  ({ id, kind: "hook", text, level, status: "approved" }) as unknown as Hook;
const cta = (id: string, text: string): Cta => ({ id, kind: "cta", text, levels: [2], status: "approved" }) as unknown as Cta;

test("platform texts: one pair per hook + CTA, cut in prompts, and only the asked keys come back", () => {
  const hooks = Array.from({ length: 95 }, (_, i) => hook(`H${i + 1}`, `Hook ${i + 1}`));
  const ctas = [cta("C1", "Probalo hoy")];
  const ads = hooks.flatMap((h) => [
    { hookId: h.id, ctaId: "C1" },
    { hookId: h.id, ctaId: "C1" },
  ]);
  const pairs = copyPairs([...ads, { hookId: "H999", ctaId: "C1" }], hooks, ctas);
  assert.equal(pairs.length, 95);
  const chunks = copyChunks(pairs);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [32, 32, 31],
  );
  const { prompt } = taskPrompt(copiesTask("iman", EMPTY_OFFER, chunks[0]));
  assert.ok(prompt.includes("H1-C1") && !prompt.includes("H40-C1"));
  const reply = JSON.stringify({
    copies: [
      { key: "H1-C1", primary: "x".repeat(700), headline: "Pedí a tiempo", button: "Más información" },
      { key: "H90-C1", primary: "No era de este prompt", headline: "", button: "" },
    ],
  });
  const copies = copiesFromWire(taskFromPaste(copiesTask("iman", EMPTY_OFFER, chunks[0]), reply), chunks[0].map((p) => p.key));
  assert.deepEqual(Object.keys(copies), ["H1-C1"]);
  assert.equal(copies["H1-C1"].primary.length, 600);
});

test("review and transcript split by paste use the writer's schema", () => {
  const hooks = [hook("H1", "Te curamos la espalda en una semana")];
  const t = reviewTask("iman", EMPTY_OFFER, hooks, [], []);
  assert.ok(taskPrompt(t).prompt.includes("H1 (hook"));
  const wire = taskFromPaste(t, JSON.stringify({ flags: [{ pieceId: "H1", kind: "policy", note: "Promesa de salud", fix: "" }, { pieceId: "H9", kind: "claim", note: "", fix: "" }], note: "Una a corregir" }));
  assert.deepEqual(flagsFromWire(wire, new Set(["H1"])), [{ pieceId: "H1", kind: "policy", note: "Promesa de salud", fix: "" }]);

  const clip = taskFromPaste(
    clipTask("iman", EMPTY_OFFER, "[0:00] ¿Otra vez sin pan? [0:04] Con IMAN pedís a tiempo. [0:12] Probalo hoy.", "anuncio 1"),
    `<think>corto</think>{"hook":"¿Otra vez sin pan?","meat":"Con IMAN pedís a tiempo.","cta":"Probalo hoy.","hookEndsAt":4,"level":2,"format":"education","angle":"pain","formula":"question","note":"Directo",}`,
  );
  assert.equal(clip.hookEndsAt, 4);
  assert.equal(clip.cta, "Probalo hoy.");
});

test("pasted platform texts count only while their hook and CTA text are the ones they were written for", async () => {
  const { freshCopies, withSigs } = await import("../shared/adsHandoff.ts");
  const ctas = [cta("C1", "Probalo hoy")];
  const before = copyPairs([{ hookId: "H1", ctaId: "C1" }], [hook("H1", "Se venció la leche")], ctas);
  const pasted = withSigs({ "H1-C1": { primary: "Leche", headline: "Pedí a tiempo", button: "Más información" } }, before);
  assert.deepEqual(Object.keys(freshCopies(before, pasted)), ["H1-C1"]);
  assert.equal("sig" in freshCopies(before, pasted)["H1-C1"], false);
  // The hook was edited after the paste: its texts describe the old hook and are not used.
  const after = copyPairs([{ hookId: "H1", ctaId: "C1" }], [hook("H1", "Faltó pan a las 6")], ctas);
  assert.deepEqual(freshCopies(after, pasted), {});
  assert.deepEqual(freshCopies(after, undefined), {});
});
