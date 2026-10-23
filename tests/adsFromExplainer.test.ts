// "Usar como cuerpo o llamado": which explainer video goes, which pieces it can go into, how its length fits the
// piece's budget, the words said in the chosen stretch, and the way back ("Hacelo como explicativo").
import assert from "node:assert/strict";
import { test } from "node:test";
import { AdsMediaSchema, defaultSplit, emptyAds, type Cta, type Meat } from "../shared/ads.ts";
import {
  MOTION_BATCH_MAX,
  explainerPiece,
  explainerTargets,
  explainerVideos,
  fitClip,
  meatScenePlan,
  pickExplainerVideo,
  pieceSecondsFor,
  problemOf,
  projectForPiece,
  seedNotes,
  seedPieceId,
  sentencesOf,
  splitSpoken,
  starterPiece,
  starterScript,
  titleOf,
  voiceInRange,
  withSeedNotes,
} from "../shared/adsFromExplainer.ts";

const meat = (id: string, status: Meat["status"], seconds = 9): Meat => ({
  id,
  kind: "meat",
  text: `texto ${id}`,
  onScreenText: "",
  visualPrompt: "",
  videoPrompt: "",
  seconds,
  status,
  source: "ai",
  createdAt: "",
  note: "",
  format: "demo",
  levels: [1],
  hookId: "",
});

test("the folder's videos: final render first, then the browser's, mp4 before webm; other files are not videos", () => {
  const list = explainerVideos(["project.json", "video-vertical.webm", "video-final-horizontal.mp4", "video-horizontal.mp4", "video-final-vertical.mp4", "video-final-vertical.srt", "video.mp4", "portada-vertical.jpg"]);
  assert.deepEqual(
    list.map((v) => v.file),
    ["video-final-horizontal.mp4", "video-final-vertical.mp4", "video-horizontal.mp4", "video-vertical.webm"],
  );
  assert.deepEqual(list[0], { file: "video-final-horizontal.mp4", format: "horizontal", final: true });
});

test("the chosen video: the final render in the format, else the browser's in the format, else the best of any", () => {
  const all = explainerVideos(["video-vertical.mp4", "video-final-horizontal.mp4"]);
  assert.equal(pickExplainerVideo(all, "vertical")?.file, "video-vertical.mp4");
  assert.equal(pickExplainerVideo(all, "horizontal")?.file, "video-final-horizontal.mp4");
  assert.equal(pickExplainerVideo(explainerVideos(["video-final-vertical.mp4", "video-vertical.mp4"]), "vertical")?.file, "video-final-vertical.mp4");
  assert.equal(pickExplainerVideo(explainerVideos(["video-final-horizontal.mp4"]), "vertical")?.file, "video-final-horizontal.mp4");
  assert.equal(pickExplainerVideo([], "vertical"), null);
});

test("targets are the approved meats or CTAs, the ones still without a clip first", () => {
  const s = emptyAds("iman");
  s.meats = [meat("M1", "approved"), meat("M2", "pending"), meat("M3", "approved"), meat("M4", "rejected")];
  s.media.M1 = { clip: { file: "media/M1-clip.mp4", name: "x.mp4", duration: 9, explainer: { project: "p", file: "video-vertical.mp4", title: "T" } } };
  const t = explainerTargets(s, "meat");
  assert.deepEqual(
    t.map((x) => [x.piece.id, x.hasClip, x.fromExplainer]),
    [
      ["M3", false, false],
      ["M1", true, true],
    ],
  );
  assert.deepEqual(explainerTargets(s, "cta"), []);
});

test("a new piece takes its share of the ad's budget", () => {
  assert.equal(pieceSecondsFor("meat", 15), defaultSplit(15).meat);
  // A 6 s ad is 2 + 2 + 2. Newly written pieces use that; older pieces keep the seconds they were saved with.
  assert.equal(pieceSecondsFor("cta", 6), 2);
  assert.equal(pieceSecondsFor("meat", 6), 2);
  assert.equal(pieceSecondsFor("meat", 7), defaultSplit(7).meat, "7 s is a real ad length");
  assert.equal(pieceSecondsFor("meat", 5), defaultSplit(15).meat, "a length outside 6 to 120 s is a 15 s ad");
});

test("the length budget: whole, cut from an in point that never runs past the end, or short (last frame holds)", () => {
  const whole = fitClip(9.04, 9);
  assert.equal(whole.fit, "whole");
  assert.equal(whole.start, 0);

  const cut = fitClip(30, 9, 12.34);
  assert.deepEqual([cut.fit, cut.start, cut.end], ["cut", 12.3, 21.3]);
  assert.match(cut.note, /de 12,3 s a 21,3 s/);

  const late = fitClip(30, 9, 28);
  assert.deepEqual([late.start, late.end], [21, 30], "the in point is clamped so the piece fits");
  assert.equal(fitClip(30, 9, -4).start, 0);
  assert.equal(fitClip(30, 9, Number.NaN).start, 0);

  const short = fitClip(2, 3);
  assert.equal(short.fit, "short");
  assert.equal(short.end, 2);
  assert.match(short.note, /queda quieto 1 s/);
});

test("the words said in the stretch: scenes that really overlap it", () => {
  const spans = [
    { start: 0, end: 3, voice: "Otra vez sin leche." },
    { start: 3, end: 7, voice: "El pedido se arma solo." },
    { start: 7, end: 10, voice: "" },
    { start: 10, end: 13, voice: "Probalo hoy." },
  ];
  assert.equal(voiceInRange(spans, 2.9, 11.9), "El pedido se arma solo. Probalo hoy.");
  assert.equal(voiceInRange(spans, 0, 13), "Otra vez sin leche. El pedido se arma solo. Probalo hoy.");
  assert.equal(voiceInRange(spans, 7.1, 9.9), "");
});

test("a new meat or CTA from the explainer: approved, by hand, all levels, the next id, its note", () => {
  const s = emptyAds("mashogar");
  s.counters.meat = 4;
  const m = explainerPiece(s, "meat", 9, "  El pedido se arma solo.  ", "Antes del corte") as Meat;
  assert.equal(m.id, "M5");
  assert.equal(m.kind, "meat");
  assert.equal(m.text, "El pedido se arma solo.");
  assert.equal(m.status, "approved");
  assert.equal(m.source, "manual");
  assert.deepEqual(m.levels, [1, 2, 3, 4, 5]);
  assert.match(m.note, /«Antes del corte»/);
  const c = explainerPiece(s, "cta", 3, "Probalo hoy.", "") as Cta;
  assert.equal(c.id, "C1");
  assert.equal(c.kind, "cta");
  assert.equal(c.note, "Hecho como explicativo.");
});

test("the saved clip keeps its in point and where it came from", () => {
  const parsed = AdsMediaSchema.parse({ clip: { file: "media/M1-clip.mp4", name: "v.mp4", duration: 30, from: 12.3, explainer: { project: "p-1", file: "video-final-vertical.mp4", title: "T" } } });
  assert.equal(parsed.clip?.from, 12.3);
  assert.equal(parsed.clip?.explainer?.project, "p-1");
  assert.equal(AdsMediaSchema.parse({ clip: { file: "a", name: "b", duration: 1 } }).clip?.from, undefined, "older clips have none");
});

test("the way back: the piece's text becomes the brief's note and a starting script, with no AI", () => {
  const seed = { id: "C2", kind: "cta" as const, text: "¿Te quedaste sin stock? Armá el pedido en dos toques. Probalo gratis hoy.", onScreenText: "Probalo gratis", seconds: 3 };
  assert.match(seedNotes(seed), /^Desde Publicidad \(C2, llamado \(CTA\), 3 s en el anuncio\): «¿Te quedaste/);
  assert.deepEqual(sentencesOf(seed.text), ["¿Te quedaste sin stock?", "Armá el pedido en dos toques.", "Probalo gratis hoy."]);
  assert.equal(titleOf("¿Te quedaste sin stock hoy a la mañana?"), "Te quedaste sin stock hoy a");
  const script = starterScript(seed, "dry");
  assert.deepEqual(
    script.scenes.map((x) => x.template),
    ["hook", "hook", "logo"],
  );
  assert.equal(script.scenes[0].title, "Probalo gratis", "the first scene shows the piece's headline");
  assert.equal(script.scenes[2].voice, "Probalo gratis hoy.");
  assert.deepEqual(script.scenes[2].items, ["Probalo gratis"]);
  assert.equal(script.tone, "dry");
  for (const sc of script.scenes) assert.ok(sc.seconds >= 2 && sc.seconds <= 8);
  const meatScript = starterScript({ ...seed, kind: "meat", onScreenText: "" });
  assert.ok(meatScript.scenes.every((x) => x.template === "hook"));
  assert.equal(meatScript.scenes[0].title, "Te quedaste sin stock");
  assert.equal(starterScript({ ...seed, text: "" }).scenes.length, 1, "an empty text still opens a script");
  const piece = starterPiece(seed, "vertical", "warm");
  assert.equal(piece.format, "vertical");
  assert.equal(piece.script?.scenes.length, 3);
  assert.equal(piece.script?.problem, seed.text);
});

test("a long meat's scenes add up to its seconds and do not cut a sentence", () => {
  assert.deepEqual(splitSpoken("Aaa bbb. Ccc ddd.", 2), ["Aaa bbb.", "Ccc ddd."]);
  const spoken = (n: number) => Array.from({ length: n }, (_, i) => (i % 8 === 7 ? `w${i}.` : `w${i}`)).join(" ");
  for (const target of [30, 60, 113]) {
    const plan = meatScenePlan(spoken(Math.ceil(target * 2.7)), target);
    const sum = plan.reduce((n, s) => n + s.seconds, 0);
    assert.ok(Math.abs(sum - target) <= 1, `${target} s summed ${sum}`);
    assert.ok(plan.every((s) => s.seconds === 2 || s.seconds === 2.5));
    assert.equal(plan.map((s) => s.voice).join(" "), spoken(Math.ceil(target * 2.7)));
  }
});

test("the script's problem is the piece's text, and a later seed line replaces the earlier one", () => {
  assert.equal(problemOf("  hola   mundo "), "hola mundo");
  assert.equal(problemOf("   "), "Sin texto todavía");
  const long = `${"a".repeat(170)} ${"b".repeat(100)}`;
  assert.ok(problemOf(long).endsWith("…"));
  assert.ok(problemOf(long).length <= 241);
  const seed = { id: "M9", kind: "meat" as const, text: "El pedido se arma solo.", onScreenText: "", seconds: 50 };
  const next = withSeedNotes("Nota vieja.\nDesde Publicidad (M1, cuerpo (meat), 9 s en el anuncio): «viejo»\nOtra nota.", seed);
  assert.equal(seedPieceId(next), "M9");
  assert.doesNotMatch(next, /\(M1,/);
  assert.match(next, /Nota vieja/);
  assert.match(next, /Otra nota/);
  assert.equal(MOTION_BATCH_MAX, 20);
  const projects = [
    { id: "20261023-iman-m1", series: "iman" },
    { id: "20261023-iman-m9", series: "iman" },
    { id: "20261023-iman-m9-2", series: "iman" },
    { id: "20261023-iman-m9", series: "otra" },
    { id: "20261023-otra-m9", series: "otra" },
    { id: "titulo-con-m9", series: "iman" },
  ];
  assert.equal(projectForPiece(projects, "iman", "M9")?.id, "20261023-iman-m9-2");
  assert.equal(projectForPiece(projects, "iman", "M1")?.id, "20261023-iman-m1");
  assert.equal(projectForPiece(projects, "otra", "M9")?.id, "20261023-otra-m9");
  assert.equal(projectForPiece(projects, "iman", ""), null);
});

test("a kinetic hook also fits its voice, and a share longer than the scene does not fall", () => {
  const voice = Array.from({ length: 12 }, () => "palabra").join(" ");
  const grown = starterScript({ id: "H2", kind: "hook", text: voice, onScreenText: "Hola", seconds: 3 });
  assert.equal(grown.scenes[0].seconds, 6.5);
  assert.ok(grown.scenes[0].seconds >= 5.85);
  assert.equal(grown.scenes[0].kineticExit, true);
  assert.equal(grown.problem, voice);
  const longTitle = Array.from({ length: 20 }, () => "palabra").join(" ");
  const held = starterScript({ id: "H9", kind: "hook", text: "Hola.", onScreenText: longTitle, seconds: 15 });
  assert.equal(held.scenes[0].seconds, 8);
  assert.equal(held.scenes[0].kineticExit, undefined);
  assert.equal(held.problem, "Hola.");
});
