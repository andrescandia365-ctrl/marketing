// Ad length 6–120 s: the split, the Grok clip sequence, the awareness suggestion, and old saved pieces still loading.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AD_MAX_SECONDS,
  AD_PRESETS,
  AdsStateSchema,
  BatchSchema,
  HookSchema,
  RENDER_VERSION,
  adLengthChoices,
  defaultSplit,
  emptyAds,
  hooksFromWire,
  isAdSeconds,
  meatGapNote,
  noShareNote,
  pieceShare,
  splitIssue,
  splitOf,
  suggestedSeconds,
  wordsFor,
} from "../shared/ads.ts";
import { clipContinuity, grokSequence, sequencePromptsFromPiece, stretchText } from "../shared/adsSequence.ts";
import { seedPieceId, starterPiece, starterScript, wordChunks } from "../shared/adsFromExplainer.ts";
import { speakerFit, speakerIssues } from "../shared/adsSpeaker.ts";
import { kineticAssemble, kineticHookSeconds, kineticLeave, readingNeed } from "../shared/motion.ts";

const prompts = { onScreenText: "", visualPrompt: "A counter.", videoPrompt: "She looks up." };

test("presets and any whole second from 6 to 120", () => {
  assert.deepEqual(AD_PRESETS, [6, 10, 15, 30, 45, 60, 90]);
  assert.equal(isAdSeconds(6), true);
  assert.equal(isAdSeconds(22), true);
  assert.equal(isAdSeconds(120), true);
  assert.equal(isAdSeconds(5), false);
  assert.equal(isAdSeconds(121), false);
  assert.equal(isAdSeconds(15.5), false);
  assert.deepEqual(adLengthChoices(22), [6, 10, 15, 22, 30, 45, 60, 90]);
  assert.equal(RENDER_VERSION, "l2");
});

test("the default split: short hook, short call, the meat takes the rest", () => {
  assert.deepEqual(defaultSplit(6), { hook: 3, meat: 0, cta: 3 });
  assert.deepEqual(defaultSplit(10), { hook: 3, meat: 4, cta: 3 });
  assert.deepEqual(defaultSplit(15), { hook: 3, meat: 9, cta: 3 });
  assert.deepEqual(defaultSplit(29), { hook: 3, meat: 22, cta: 4 });
  assert.deepEqual(defaultSplit(30), { hook: 4, meat: 22, cta: 4 });
  assert.deepEqual(defaultSplit(45), { hook: 4, meat: 37, cta: 4 });
  assert.deepEqual(defaultSplit(46), { hook: 4, meat: 36, cta: 6 });
  assert.deepEqual(defaultSplit(60), { hook: 4, meat: 50, cta: 6 });
  assert.deepEqual(defaultSplit(90), { hook: 4, meat: 80, cta: 6 });
  assert.deepEqual(defaultSplit(120), { hook: 4, meat: 110, cta: 6 });
  assert.equal(wordsFor(50), 135);
  assert.match(meatGapNote(defaultSplit(6)) ?? "", /no tiene cuerpo/);
  assert.equal(meatGapNote(defaultSplit(15)), null);
});

test("a hand split has to be whole seconds that add up to the ad", () => {
  const bad = splitIssue(60, { hook: 4.5, meat: 50, cta: 6 });
  assert.match(bad ?? "", /el gancho/);
  assert.match(splitIssue(60, { hook: 4, meat: 40, cta: 6 }) ?? "", /suman 50 s/);
  assert.equal(splitIssue(60, { hook: 4, meat: 50, cta: 6 }), null);
  assert.deepEqual(splitOf(60, { hook: 5, meat: 49, cta: 6 }), { hook: 5, meat: 49, cta: 6 });
  assert.deepEqual(splitOf(60, { hook: 1, meat: 1, cta: 1 }), defaultSplit(60), "a split that does not add up is dropped");
  assert.deepEqual(splitOf(7), defaultSplit(7), "7 s is a real ad length");
  assert.deepEqual(splitOf(5), defaultSplit(15), "a length under 6 s is a 15 s ad");
  assert.deepEqual(splitOf(121), defaultSplit(15), "a length over 120 s is a 15 s ad");
  assert.equal(pieceShare(60, "meat"), 50);
  assert.match(noShareNote("meat", 6) ?? "", /el cuerpo/);
  assert.equal(noShareNote("hook", 60), null);
});

test("a meat longer than 15 s is Grok clips of 6, 10 or 15, and the last one can play shorter", () => {
  const lengths = (n: number) => grokSequence(n).map((s) => s.length);
  const plays = (n: number) => grokSequence(n).map((s) => s.play);
  assert.deepEqual(grokSequence(0), []);
  assert.deepEqual(lengths(11), [15]);
  assert.deepEqual(plays(11), [11]);
  assert.deepEqual(lengths(7), [10]);
  assert.deepEqual(plays(7), [7]);
  assert.deepEqual(lengths(16), [10, 6]);
  assert.deepEqual(lengths(50), [15, 15, 10, 10]);
  assert.deepEqual(plays(50), [15, 15, 10, 10]);
  assert.deepEqual(lengths(21), [15, 6]);
  assert.deepEqual(lengths(17), [6, 6, 6]);
  assert.deepEqual(plays(17), [6, 6, 5]);
  assert.deepEqual(lengths(19), [10, 10]);
  assert.deepEqual(plays(19), [10, 9]);
  assert.deepEqual(lengths(23), [6, 6, 6, 6]);
  assert.deepEqual(plays(23), [6, 6, 6, 5]);
  assert.deepEqual(lengths(29), [15, 15]);
  assert.deepEqual(plays(29), [15, 14]);
  assert.deepEqual(lengths(31), [15, 10, 6]);
  assert.deepEqual(lengths(110), [15, 15, 15, 15, 15, 15, 10, 10]);
  assert.deepEqual(lengths(120), [15, 15, 15, 15, 15, 15, 15, 15]);
  assert.equal(grokSequence(50).reduce((n, s) => n + s.play, 0), 50);
});

test("each clip gets its stretch of the words, and the prompts keep the same place", () => {
  const slots = grokSequence(50);
  const words = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const parts = stretchText(words.join(" "), slots);
  assert.equal(parts.join(" "), words.join(" "));
  assert.equal(parts.length, 4);
  assert.equal(stretchText("uno dos tres", [{ length: 15, play: 1 }, { length: 6, play: 1 }]).at(-1), "dos tres");
  assert.match(clipContinuity(0, 4), /Clip 1 of 4/);
  assert.match(clipContinuity(2, 4), /where clip 2 ended/);
  const prompts = sequencePromptsFromPiece({ text: "uno dos tres cuatro cinco seis", seconds: 16, visualPrompt: "the same counter", videoPrompt: "she keeps counting" });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Continues exactly/);
  assert.match(prompts[0], /Length: 10 s/);
  assert.equal(sequencePromptsFromPiece({ text: "hola", seconds: 9, visualPrompt: "", videoPrompt: "" }).length, 0);
});

test("cold audiences suggest 30 to 60 s and retargeting suggests 15 s", () => {
  assert.equal(suggestedSeconds([1, 2])?.seconds, 45);
  assert.match(suggestedSeconds([1])?.note ?? "", /sugerencia/);
  assert.equal(suggestedSeconds([4, 5])?.seconds, 15);
  assert.equal(suggestedSeconds([2, 5]), null);
  assert.equal(suggestedSeconds([]), null);
});

test("old pieces with fractional seconds still load, and a piece cannot pass 120 s", () => {
  const base = {
    id: "H1",
    kind: "hook" as const,
    text: "Hola",
    onScreenText: "",
    visualPrompt: "",
    videoPrompt: "",
    seconds: 2.5,
    status: "pending" as const,
    source: "ai" as const,
    createdAt: "2026-10-01",
    level: 2,
    angle: "pain" as const,
    formula: "question" as const,
  };
  assert.equal(HookSchema.parse(base).seconds, 2.5);
  assert.equal(HookSchema.safeParse({ ...base, seconds: 121 }).success, false);
  assert.equal(HookSchema.safeParse({ ...base, seconds: AD_MAX_SECONDS }).success, true);
  const batch = BatchSchema.parse({
    id: "tanda",
    createdAt: "2026-10-01",
    seconds: 15,
    mode: "full",
    rules: { sameLevel: true },
    ads: [],
    copies: {},
    files: {},
  });
  assert.equal(batch.split, undefined);
  const state = emptyAds("iman");
  const long = `${"palabra ".repeat(80)}fin.`;
  assert.ok(long.length > 600 && long.length < 4000);
  const hooks = hooksFromWire(state, { hooks: [{ text: long, level: 1, angle: "pain", formula: "question", ...prompts }], note: "" }, 4, "ai");
  assert.ok(hooks[0].text.length > 600);
  const saved = AdsStateSchema.parse({ ...state, hooks: [{ ...base, seconds: 1.5 }] });
  assert.equal(saved.hooks[0].seconds, 1.5);
});

test("a kinetic hook stays readable, and a long meat becomes short explainer scenes aimed at its seconds", () => {
  assert.ok(kineticLeave("Hola", 3) != null);
  assert.ok(kineticLeave("Hola.", 3) != null);
  const eight = Array.from({ length: 8 }, () => "palabra").join(" ");
  assert.equal(kineticLeave(eight, 3), null);
  assert.equal(kineticHookSeconds(eight, 3), 5.5);
  const leave = kineticLeave(eight, 5.5);
  assert.ok(leave != null);
  assert.ok(leave - kineticAssemble(eight) >= readingNeed(eight) - 0.001);
  const hook = starterScript({ id: "H2", kind: "hook", text: "Hola.", onScreenText: "", seconds: 3 });
  assert.equal(hook.scenes.length, 1);
  assert.equal(hook.scenes[0].template, "hook");
  assert.equal(hook.scenes[0].kineticExit, true);
  assert.equal(hook.problem, "H2");
  const piece = starterPiece({ id: "H2", kind: "hook", text: "Hola.", onScreenText: "", seconds: 3 }, "vertical");
  assert.equal(piece.durationMode, "manual");
  assert.equal(piece.target, 3);
  const meatText = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
  assert.equal(wordChunks(meatText).length, 5);
  const meat = starterScript({ id: "M9", kind: "meat", text: meatText, onScreenText: "", seconds: 50 });
  assert.equal(meat.problem, "M9");
  assert.ok(meat.scenes.length >= 5);
  assert.ok(meat.scenes.every((s) => s.template === "hook" && s.seconds <= 8 && s.seconds >= 2));
  const aimed = starterPiece({ id: "M9", kind: "meat", text: meatText, onScreenText: "", seconds: 50 }, "vertical", "dry");
  assert.equal(aimed.target, 50);
  assert.equal(aimed.durationMode, "manual");
  assert.equal(seedPieceId("Desde Publicidad (M9, cuerpo (meat), 50 s en el anuncio): «hola»"), "M9");
});

test("a long meat's spoken line is too long only when it does not fit the meat", () => {
  const forty = Array.from({ length: 40 }, () => "palabra").join(" ");
  const fit = speakerFit(forty, 50);
  assert.equal(fit.tooLong, false);
  assert.equal(fit.fits, true);
  assert.equal(fit.clip, 15);
  const twoHundred = Array.from({ length: 200 }, () => "palabra").join(" ");
  assert.equal(speakerFit(twoHundred, 50).tooLong, true);
  assert.ok(speakerIssues(twoHundred, 50).some((i) => i.includes("50 s")));
});
