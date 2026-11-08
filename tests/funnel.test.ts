// Embudo: three floors on top of awareness levels 1–5. A missing floor leaves prompts, checks and pieza.md as they are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_OFFER, embudoOfLevel, levelsOf as adsLevelsOf, suggestedSeconds, type Level, type MeatFormat } from "../shared/ads.ts";
import { boardProblems, storyProblems } from "../shared/checks.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import {
  FLOOR_INFO,
  FLOORS,
  embudoMarkdown,
  exactFloor,
  floorCovers,
  floorOf,
  floorTally,
  floorTallyLine,
  floorTallyWriter,
  funnelBlock,
  funnelProblems,
  hardSell,
  hasProof,
  isFloor,
  levelsOf,
  namesBrandFirst,
  openFunnelProblems,
  shownTally,
  tagFloor,
  type Floor,
} from "../shared/funnel.ts";
import { roomBrief, storyCard } from "../shared/room.ts";
import { BriefSchema, normalizeHookVariants } from "../shared/schema.ts";
import { newStillPiece, parseStillPaste, stillCopyPrompt, stillMarkdown, stillMenuPrompt } from "../shared/still.ts";
import { NO_KEEP_OUT } from "../shared/stillLayout.ts";
import { STILL_SAMPLE_MENU } from "../shared/stillSample.ts";
import { DEMO_BOARD, DEMO_STORY } from "../server/demo.ts";
import { describeBrief, hookVariantsTask, menuTask, motionTask, storyTask, taskPrompt } from "../server/claude.ts";
import { copiesTask, ctasTask, hooksTask, meatsTask, reviewTask } from "../server/adsWriter.ts";
import { storyToMarkdown } from "../src/lib/markdown.ts";
import { pieceMarkdown } from "../src/lib/motionMarkdown.ts";
import { blankScene, newMotionPiece, type MotionScript } from "../shared/motion.ts";
import type { Story } from "../shared/schema.ts";

const brand = { name: "Máshogar", type: "E-commerce", what: "Tienda para el hogar", audience: "", rules: "", bad: "", good: "", worksToday: [] as string[], practices: [] as string[] };
const bits = { product: "", angle: "", notes: "", tone: "cálido", language: "es" as const };

function onlyTheBlock(plain: string, floored: string, floor: Floor) {
  assert.doesNotMatch(plain, /Funnel floor/);
  assert.match(floored, new RegExp(`Funnel floor: ${floor} \\(${FLOOR_INFO[floor].label}\\)`));
  assert.equal(floored.replace(`\n\n---\n\n${funnelBlock(floor)}`, ""), plain);
}

test("levels and floors match, and an empty or mixed set is no floor", () => {
  assert.deepEqual(levelsOf("arriba"), [1, 2]);
  assert.deepEqual(levelsOf("medio"), [3]);
  assert.deepEqual(levelsOf("abajo"), [4, 5]);
  for (const floor of FLOORS) {
    for (const level of levelsOf(floor)) assert.equal(floorOf(level), floor);
    const suggestion = suggestedSeconds(levelsOf(floor));
    assert.equal(suggestion?.seconds, FLOOR_INFO[floor].seconds);
    assert.equal(suggestion?.range, FLOOR_INFO[floor].range);
  }
  assert.equal(floorOf(0), null);
  assert.equal(floorOf(9), null);
  assert.equal(exactFloor([2, 1, 1]), "arriba");
  assert.equal(exactFloor([3]), "medio");
  assert.equal(exactFloor([5, 4]), "abajo");
  assert.equal(exactFloor([1]), null);
  assert.equal(exactFloor([1, 2, 3]), null);
  assert.equal(exactFloor([]), null);
  assert.deepEqual(adsLevelsOf([]), [1, 2, 3, 4, 5]);
  assert.equal(exactFloor(adsLevelsOf([])), null);
  assert.equal(suggestedSeconds([]), null);
  assert.equal(suggestedSeconds([1, 5]), null);
  assert.equal(floorCovers("arriba", []), false);
  assert.equal(floorCovers("arriba", [1]), true);
  assert.equal(floorCovers("arriba", [1, 2]), true);
  assert.equal(floorCovers("arriba", [1, 3]), false);
  assert.equal(floorCovers(undefined, [4, 5]), false);
  assert.equal(tagFloor([1]), "arriba");
  assert.equal(tagFloor([4, 5]), "abajo");
  assert.equal(tagFloor([3, 4]), null);
  assert.equal(tagFloor([]), null);
  for (const n of [0, 1, 2, 3, 4, 5, 9]) assert.equal(embudoOfLevel(n), floorOf(n) ?? "");
});

test("an old brief loads with no floor, and null is rejected", () => {
  const saved = JSON.parse(JSON.stringify(EXAMPLE_BRIEF)) as Record<string, unknown>;
  delete saved.funnel;
  const old = BriefSchema.parse(saved);
  assert.equal(old.funnel, undefined);
  assert.equal(JSON.stringify(old).includes("funnel"), false);
  assert.equal(BriefSchema.parse({ ...EXAMPLE_BRIEF, funnel: "abajo" }).funnel, "abajo");
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, funnel: null }).success, false);
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, funnel: "todos" }).success, false);
});

test("the guidance block is appended only when a floor is set, and the brief line stays the same", () => {
  const plainMenu = taskPrompt(menuTask(EXAMPLE_BRIEF)).prompt;
  const medioMenu = taskPrompt(menuTask({ ...EXAMPLE_BRIEF, funnel: "medio" })).prompt;
  onlyTheBlock(plainMenu, medioMenu, "medio");
  assert.equal(describeBrief({ ...EXAMPLE_BRIEF, funnel: "abajo" }), describeBrief(EXAMPLE_BRIEF));

  const topic = { problem: "El pan se termina", title: "A las seis", pain: "La góndola vacía", bad: "El desorden", good: "El pedido", peg: "", why: "" };
  onlyTheBlock(taskPrompt(storyTask(EXAMPLE_BRIEF, [topic])).prompt, taskPrompt(storyTask({ ...EXAMPLE_BRIEF, funnel: "arriba" }, [topic])).prompt, "arriba");
  onlyTheBlock(
    taskPrompt(hookVariantsTask(EXAMPLE_BRIEF, DEMO_STORY)).prompt,
    taskPrompt(hookVariantsTask({ ...EXAMPLE_BRIEF, funnel: "abajo" }, DEMO_STORY)).prompt,
    "abajo",
  );
  onlyTheBlock(taskPrompt(motionTask(EXAMPLE_BRIEF, 30, 0)).prompt, taskPrompt(motionTask({ ...EXAMPLE_BRIEF, funnel: "medio" }, 30, 0)).prompt, "medio");

  const menu = stillMenuPrompt({ brand, brief: bits, references: [] });
  const flooredMenu = stillMenuPrompt({ brand, brief: { ...bits, funnel: "medio" }, references: [] });
  assert.equal(flooredMenu.replace(`\n\n${funnelBlock("medio")}`, ""), menu);
  assert.doesNotMatch(menu, /Funnel floor/);
  const concept = parseStillPaste(STILL_SAMPLE_MENU).concepts[0];
  assert.doesNotMatch(stillCopyPrompt({ brand, brief: { ...bits, funnel: "abajo" }, concept }), /Funnel floor/);

  const hookReq = { levels: [1, 2] as Level[], count: 4, seconds: 15 as const, winners: [], existing: [], language: "es" as const };
  onlyTheBlock(
    taskPrompt(hooksTask("iman", EMPTY_OFFER, "grok-imagine", hookReq)).prompt,
    taskPrompt(hooksTask("iman", EMPTY_OFFER, "grok-imagine", { ...hookReq, funnel: "arriba" })).prompt,
    "arriba",
  );
  const meatReq = { levels: [3] as Level[], formats: ["demo"] as MeatFormat[], count: 1, seconds: 45 as const, hooks: [], language: "es" as const };
  onlyTheBlock(
    taskPrompt(meatsTask("iman", EMPTY_OFFER, "grok-imagine", meatReq)).prompt,
    taskPrompt(meatsTask("iman", EMPTY_OFFER, "grok-imagine", { ...meatReq, funnel: "medio" })).prompt,
    "medio",
  );
  const ctaReq = { levels: [4, 5] as Level[], count: 1, seconds: 15 as const, hooks: [], language: "es" as const };
  onlyTheBlock(
    taskPrompt(ctasTask("iman", EMPTY_OFFER, "grok-imagine", ctaReq)).prompt,
    taskPrompt(ctasTask("iman", EMPTY_OFFER, "grok-imagine", { ...ctaReq, funnel: "abajo" })).prompt,
    "abajo",
  );
  const pairs = [{ key: "H1-C1", hook: "¿Otra vez sin pan?", cta: "Probalo", level: 2 as const }];
  onlyTheBlock(taskPrompt(copiesTask("iman", EMPTY_OFFER, pairs)).prompt, taskPrompt(copiesTask("iman", EMPTY_OFFER, pairs, "arriba")).prompt, "arriba");
  assert.doesNotMatch(taskPrompt(reviewTask("iman", EMPTY_OFFER, [], [], [])).prompt, /Funnel floor/);
});

test("the block names the floor, the call and the length, and it does not invent a price", () => {
  for (const floor of FLOORS) {
    const block = funnelBlock(floor);
    const info = FLOOR_INFO[floor];
    assert.match(block, new RegExp(`^Funnel floor: ${floor} \\(${info.label}\\)\\.`));
    assert.match(block, new RegExp(`awareness levels ${info.levels.join(", ")}`));
    assert.ok(block.includes(info.purpose));
    assert.ok(block.includes(info.cta));
    assert.match(block, /The story's Button and the explainer's caption/);
    assert.match(block, /Do not change a length the person already chose/);
    assert.match(block, new RegExp(`Each variant's awareness level is one of ${info.levels.join(", ")}`));
    assert.match(block, /Do not invent a price, a discount or a deadline/);
  }
  assert.match(funnelBlock("abajo"), /only with a real offer or a confirmed proof/);
  assert.match(funnelBlock("arriba"), /Do not ask them to buy/);
  assert.match(funnelBlock("medio"), /Do not ask them to buy/);
});

test("abajo needs a confirmed proof, arriba rejects a hard sell and a brand that opens", () => {
  assert.equal(hardSell("Seguí, guardá o compartí"), false);
  assert.equal(hardSell("Vos andá a esconderle el pan a otro."), false);
  assert.equal(hardSell("Probalo gratis hoy: en diez segundos tenés el pedido de mañana."), false);
  assert.equal(hardSell("Comprá ya"), true);
  assert.equal(hardSell("compra ya el pack"), true);
  assert.equal(hardSell("hay un descuento"), true);
  assert.equal(hardSell("oferta por tiempo limitado"), true);
  assert.equal(hardSell("últimas unidades"), true);
  assert.equal(hardSell("20%"), true);
  assert.equal(hardSell("sale $ 9"), true);
  assert.equal(namesBrandFirst("IMAN abre el local", "Imán"), true);
  assert.equal(namesBrandFirst("imán abre", "IMAN"), true);
  assert.equal(namesBrandFirst("La góndola de IMAN", "IMAN"), false);
  assert.equal(namesBrandFirst("IMANX abre", "IMAN"), false);
  assert.equal(namesBrandFirst("IMAN", "IMAN"), true);
  assert.equal(namesBrandFirst("algo", ""), false);
  assert.equal(hasProof({ proofs: ["  "], landing: "  " }), false);
  assert.equal(hasProof({ proofs: ["Una dueña"] }), true);
  assert.equal(hasProof({ landing: " https://iman.example " }), true);
  assert.equal(hasProof({ proofOk: true }), true);

  assert.deepEqual(funnelProblems({}), []);
  assert.deepEqual(funnelProblems({ floor: "medio" }), []);
  const prueba = funnelProblems({ floor: "abajo", brandName: "IMAN" });
  assert.deepEqual(prueba.map((p) => p.id), ["embudo:prueba"]);
  assert.match(prueba[0].detail, /falta una prueba confirmada o una oferta real/);
  assert.deepEqual(funnelProblems({ floor: "abajo", proofs: ["Lo usa Marta"] }), []);
  assert.deepEqual(funnelProblems({ floor: "abajo", landing: "https://iman.example" }), []);
  assert.deepEqual(funnelProblems({ floor: "abajo", proofOk: true }), []);
  assert.deepEqual(funnelProblems({ floor: "arriba", sellText: "Comprá ya con 20%" }).map((p) => p.id), ["embudo:venta"]);
  assert.deepEqual(funnelProblems({ floor: "medio", sellText: "Comprá ya" }), []);
  assert.deepEqual(funnelProblems({ floor: "abajo", sellText: "Comprá ya", proofs: ["real"] }), []);
  assert.deepEqual(funnelProblems({ floor: "arriba", openingText: "IMAN abre", brandName: "IMAN" }).map((p) => p.id), ["embudo:marca"]);
  assert.deepEqual(funnelProblems({ floor: "arriba", openingText: "La góndola de IMAN", brandName: "IMAN" }), []);
  assert.deepEqual(funnelProblems({ floor: "arriba", brandSpeaksFirst: true }).map((p) => p.id), ["embudo:marca"]);
  assert.deepEqual(funnelProblems({ floor: "medio", brandSpeaksFirst: true, openingText: "IMAN abre", brandName: "IMAN" }), []);

  const dismissed = openFunnelProblems(
    { funnel: "abajo", text: "Probalo", funnelDismissed: ["embudo:prueba"] },
    {},
  );
  assert.deepEqual(dismissed, []);
  assert.deepEqual(openFunnelProblems({ text: "Comprá ya", onScreenText: "20%" }, {}).map((p) => p.id), []);
  assert.deepEqual(openFunnelProblems({ funnel: "arriba", text: "Comprá ya" }, {}).map((p) => p.id), ["embudo:venta"]);
});

test("story and board checks add the floor only when the piece has one", () => {
  const ids = (facts?: { floor?: string; proofs?: string[]; landing?: string; brandName?: string }) =>
    storyProblems(DEMO_STORY, undefined, [], facts).map((p) => p.id);
  assert.ok(!ids().some((id) => id.startsWith("embudo:")));
  assert.ok(ids({ floor: "abajo" }).includes("embudo:prueba"));
  assert.ok(!ids({ floor: "abajo", proofs: ["Una dueña lo confirmó"] }).includes("embudo:prueba"));
  assert.ok(!ids({ floor: "abajo", landing: " https://iman.example " }).includes("embudo:prueba"));
  assert.ok(!ids({ floor: "arriba", brandName: "IMAN" }).some((id) => id.startsWith("embudo:")));
  const selling: Story = { ...DEMO_STORY, close: "Comprá ya, últimas unidades." };
  assert.ok(storyProblems(selling, undefined, [], { floor: "arriba" }).some((p) => p.id === "embudo:venta"));
  assert.ok(!storyProblems(selling).some((p) => p.id.startsWith("embudo:")));

  const brandOpens: Story = {
    ...DEMO_STORY,
    topics: DEMO_STORY.topics.map((t, i) =>
      i === 0 ? { ...t, lines: t.lines.map((l, j) => (j === 0 ? { ...l, speaker: "iman", text: "El pedido llegó." } : l)) } : t,
    ),
  };
  const opened = storyProblems(brandOpens, undefined, [], { floor: "arriba", brandName: "IMAN" });
  assert.ok(opened.some((p) => p.id === "cliente-heroe"));
  assert.ok(opened.some((p) => p.id === "embudo:marca"));
  const named: Story = {
    ...DEMO_STORY,
    topics: DEMO_STORY.topics.map((t, i) =>
      i === 0 ? { ...t, lines: t.lines.map((l, j) => (j === 0 ? { ...l, text: "IMAN abre el local." } : l)) } : t,
    ),
  };
  const byName = storyProblems(named, undefined, [], { floor: "arriba", brandName: "Imán" });
  assert.ok(!byName.some((p) => p.id === "cliente-heroe"));
  assert.ok(byName.some((p) => p.id === "embudo:marca"));

  const boardIds = boardProblems(DEMO_BOARD).map((p) => p.id);
  assert.deepEqual(boardProblems(DEMO_BOARD, {}, { floor: "no" }).map((p) => p.id), boardIds);
  assert.ok(boardProblems(DEMO_BOARD, {}, { floor: "abajo" }).some((p) => p.id === "embudo:prueba"));
  assert.ok(boardProblems(DEMO_BOARD, {}, { floor: "arriba", openingText: "IMAN abre", brandName: "IMAN" }).some((p) => p.id === "embudo:marca"));
  assert.ok(!boardProblems(DEMO_BOARD, {}, { floor: "arriba", sellText: "guardalo" }).some((p) => p.id === "embudo:venta"));
});

test("a floor snaps a hook variant that lands outside it; without a floor the old clamp stays", () => {
  const wire = {
    variants: [
      { title: "Uno", move: "turn", level: 7, why: "" },
      { title: "Dos", move: "turn", level: 0, why: "" },
      { title: "Tres", move: "turn", level: Number.NaN, why: "" },
      { title: "Cuatro", move: "turn", level: 5, why: "" },
      { title: "Cinco", move: "turn", level: 2, why: "" },
    ],
  };
  assert.deepEqual(normalizeHookVariants(wire).map((v) => v.level), [5, 1, 2, 5, 2]);
  assert.deepEqual(normalizeHookVariants(wire, "abajo").map((v) => v.level), [5, 4, 4, 5, 4]);
  assert.deepEqual(normalizeHookVariants(wire, "arriba").map((v) => v.level), [1, 1, 1, 1, 2]);
  assert.deepEqual(normalizeHookVariants(wire, "medio").map((v) => v.level), [3, 3, 3, 3, 3]);
  assert.equal(isFloor("abajo"), true);
  assert.equal(isFloor("todos"), false);
});

test("the writers' room tally is extra, and a series with no floor shows nothing", () => {
  const card = storyCard("a", "2026-10-07", { problem: "El pan", topics: [{ moves: ["turn"] }] })!;
  assert.equal(roomBrief([card], []), roomBrief([card]));
  assert.equal(roomBrief([], undefined, "   "), "");
  assert.equal(roomBrief([], undefined, "  arriba 1 · medio 0 · abajo 0  "), "arriba 1 · medio 0 · abajo 0");
  const withCards = roomBrief([card], undefined, "arriba 1 · medio 0 · abajo 0");
  assert.match(withCards, /arriba 1 · medio 0 · abajo 0/);
  assert.equal(roomBrief([card], undefined, "  "), roomBrief([card]));
  const counts = floorTally(["arriba", "arriba", "no", null, "abajo"]);
  assert.deepEqual(counts, { arriba: 2, medio: 0, abajo: 1 });
  assert.equal(floorTallyLine(counts), "arriba 2 · medio 0 · abajo 1");
  assert.equal(shownTally([undefined, "no"]), null);
  assert.equal(shownTally(["medio"]), "arriba 0 · medio 1 · abajo 0");
  assert.match(floorTallyWriter(counts), /pieces with no floor are not counted/);
  assert.match(floorTallyWriter(counts), /arriba 2 · medio 0 · abajo 1/);
});

test("pieza.md names the floor only when the piece has one", () => {
  assert.equal(embudoMarkdown(undefined), "");
  assert.equal(embudoMarkdown("todos"), "");
  assert.equal(embudoMarkdown("abajo"), "\n**Embudo:** Decidir (abajo)\n");
  assert.equal(storyToMarkdown(DEMO_STORY), storyToMarkdown(DEMO_STORY, undefined));
  assert.doesNotMatch(storyToMarkdown(DEMO_STORY), /Embudo/);
  assert.match(storyToMarkdown(DEMO_STORY, "abajo"), /\*\*Embudo:\*\* Decidir \(abajo\)/);
  assert.equal(pieceMarkdown(newMotionPiece("vertical"), [], "medio"), "# Explicativo sin guion todavía\n");
  const scenes = [{ ...blankScene("hook"), id: "a", title: "El pedido", seconds: 3, voice: "Tarde.", emotion: "cansada" }];
  const script: MotionScript = { problem: "Tarde", title: "Antes", durationNote: "", scenes, music: { mood: "calm", bpm: 100 }, note: "", caption: "", tone: "warm" };
  const piece = { ...newMotionPiece("vertical"), script };
  assert.doesNotMatch(pieceMarkdown(piece, scenes), /Embudo/);
  assert.match(pieceMarkdown(piece, scenes, "medio"), /\*\*Embudo:\*\* Considerar \(medio\)/);
  const concepts = parseStillPaste(STILL_SAMPLE_MENU).concepts;
  const still = { ...newStillPiece(NO_KEEP_OUT), concepts, picked: concepts[0].id };
  assert.doesNotMatch(stillMarkdown(still, { prompt: "PROMPT", variants: [] }), /Embudo/);
  assert.match(stillMarkdown(still, { prompt: "PROMPT", variants: [], funnel: "arriba" }), /\*\*Embudo:\*\* Descubrir \(arriba\)/);
  assert.doesNotMatch(stillMarkdown(newStillPiece(NO_KEEP_OUT), { prompt: "", variants: [], funnel: "abajo" }), /Embudo/);
});
