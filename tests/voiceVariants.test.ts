// Variantes de voz: ids, the old single voice, ad ids, the combination count, the CSV and the length check.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AdComboSchema,
  AdsMediaSchema,
  AdsStateSchema,
  combine,
  ctasFromWire,
  defaultSplit,
  emptyAds,
  estimate,
  exportCsv,
  hooksFromWire,
  meatsFromWire,
  parseCsv,
  parseMetricsCsv,
  pieceStats,
} from "../shared/ads.ts";
import {
  adId,
  adsCountWarning,
  cleanVoiceName,
  formatSeconds,
  isAdId,
  nextVoiceId,
  parseAdId,
  renderKey,
  renderNameForKey,
  voiceCachePlan,
  voiceColumn,
  voiceCutBlock,
  voiceFileName,
  voiceLengthWarning,
  voicePicks,
  voiceTypeOf,
  voiceUploadError,
  VOICE_MAX_BYTES,
} from "../shared/voiceVariants.ts";

const prompts = { onScreenText: "", visualPrompt: "", videoPrompt: "" };

function catalogue() {
  const s = emptyAds("iman");
  const hooks = hooksFromWire(
    s,
    {
      hooks: [
        { text: "¿Otra vez el proveedor cerró antes del pedido?", level: 2, angle: "pain", formula: "question", ...prompts },
        { text: "Hasta el viernes el primer mes no se paga", level: 5, angle: "proof", formula: "number", ...prompts },
      ],
      note: "",
    },
    defaultSplit(15).hook,
    "ai",
    "approved",
  );
  s.hooks.push(...hooks);
  const meats = meatsFromWire(
    s,
    { meats: [{ text: "m1", format: "demo", levels: [1, 2, 3], ...prompts }, { text: "m2", format: "testimonial", levels: [4, 5], ...prompts }], note: "" },
    defaultSplit(15).meat,
    "",
    [2],
  );
  meats.forEach((m) => (m.status = "approved"));
  s.meats.push(...meats);
  const ctas = ctasFromWire(s, { ctas: [{ text: "c1", levels: [1, 2, 3, 4, 5], what: "", why: "", when: "", easy: "", ...prompts }], note: "" }, defaultSplit(15).cta, [2]);
  ctas.forEach((c) => (c.status = "approved"));
  s.ctas.push(...ctas);
  return s;
}

const mp3 = new Uint8Array([0xff, 0xe0, 0x00, 0x00]);

test("variant ids stop at 10 and a deleted number is not reused", () => {
  assert.deepEqual(nextVoiceId(0, 0), { id: "v1" });
  assert.deepEqual(nextVoiceId(9, 9), { id: "v10" });
  assert.deepEqual(nextVoiceId(10, 3), { error: "Esta pieza ya usó las 10 voces (v1 a v10). Borrar una no libera el número." });
  assert.deepEqual(nextVoiceId(4, 10), { error: "Esta pieza ya tiene 10 voces." });
  assert.equal(voiceFileName("H12", "v3", "mp3"), "H12-voz-v3.mp3");
  assert.equal(cleanVoiceName("carpeta/toma final.mp3", "H1-voz-v1"), "toma final.mp3");
  assert.equal(cleanVoiceName("   ", "H1-voz-v2"), "H1-voz-v2");
});

test("an old single voice becomes v1 and an old ad id stays the same", () => {
  const media = AdsMediaSchema.parse({ voice: { file: "media/H1-voice.mp3", name: "calma.mp3", duration: 2.4 } });
  assert.equal(media.voices?.[0]?.id, "v1");
  assert.equal(media.voices?.[0]?.name, "calma.mp3");
  assert.equal(media.voices?.[0]?.seconds, 2.4);
  assert.equal(media.voice?.file, "media/H1-voice.mp3");
  assert.equal(media.voice?.duration, 2.4);
  assert.equal(media.voiceSeq, 1);
  const bare = AdsMediaSchema.parse({ image: "media/H1.png" });
  assert.equal(bare.voices, undefined);
  assert.equal(bare.voice, undefined);
  const state = AdsStateSchema.parse({
    ...emptyAds("iman"),
    media: { H3: { voice: { file: "media/H3-voice.wav", name: "firme.wav", duration: 1 } } },
  });
  assert.equal(state.media.H3.voices?.[0]?.id, "v1");
  const old = AdComboSchema.parse({ id: "H12-M3-C2", hookId: "H12", meatId: "M3", ctaId: "C2", level: 2 });
  assert.equal(old.id, "H12-M3-C2");
  assert.equal(old.hookVoice, undefined);
  assert.equal(adId("H12", "M3", "C2"), "H12-M3-C2");
});

test("ad ids add the variant only for a piece with more than one voice, and v10 stays whole", () => {
  assert.equal(adId("H12", "M3", "C2", { hook: "v3", meat: "v1", cta: "v2" }), "H12v3-M3v1-C2v2");
  assert.equal(adId("H12", "M3", "C2", { hook: "v3" }), "H12v3-M3-C2");
  assert.equal(adId("H12", "M3", "C2", { hook: "v10", meat: "v10", cta: "v10" }), "H12v10-M3v10-C2v10");
  assert.equal(parseAdId("campaña H12v10-M3v1-C2 y")?.hookVoice, "v10");
  assert.equal(parseAdId("H12v10-M3v1-C2")?.hookVoice, "v10");
  assert.notEqual(parseAdId("H12v10-M3-C2")?.hookVoice, "v1");
  assert.equal(parseAdId("H12-M3-C2")?.hookVoice, undefined);
  assert.equal(isAdId("H12v3-M3v1-C2v2"), true);
  assert.equal(isAdId("H12-M3-C2"), true);
  assert.equal(isAdId("H12v01-M3-C2"), false);
  assert.equal(isAdId("../H1-M1-C1"), false);
});

test("the combination counts each chosen voice and leaves a one-voice piece on the old id", () => {
  const s = catalogue();
  const plain = combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }).map((a) => a.id);
  assert.deepEqual(plain.sort(), ["H1-M1-C1", "H2-M2-C1"]);
  s.media.H1 = AdsMediaSchema.parse({
    voices: [
      { id: "v1", file: "a", name: "Calma", seconds: 2 },
      { id: "v2", file: "b", name: "Firme", seconds: 2 },
    ],
    voiceSeq: 2,
  });
  s.media.M1 = AdsMediaSchema.parse({
    voices: [
      { id: "v1", file: "c", name: "Una", seconds: 2 },
      { id: "v3", file: "d", name: "Tres", seconds: 2 },
    ],
    voiceSeq: 3,
  });
  // Voices on the media do nothing until the batch picks them. Old ids stay.
  assert.deepEqual(combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }).map((a) => a.id).sort(), plain.sort());
  const picks = voicePicks(s.media);
  const ads = combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }, picks);
  assert.equal(ads.filter((a) => a.hookId === "H1" && a.meatId === "M1").length, 4);
  assert.ok(ads.some((a) => a.id === "H1v2-M1v3-C1"));
  assert.ok(ads.some((a) => a.id === "H3-M1-C1") === false);
  assert.ok(ads.some((a) => a.id === "H2-M2-C1"));
  assert.ok(ads.some((a) => a.id === "H1-M1v1-C1") === false);
  const subset = voicePicks(s.media, { H1: ["v2"], M1: ["v3"] });
  assert.deepEqual(
    combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }, subset)
      .filter((a) => a.hookId === "H1")
      .map((a) => a.id),
    ["H1v2-M1v3-C1"],
  );
  const none = voicePicks(s.media, { H1: [] });
  assert.equal(combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }, none).some((a) => a.hookId === "H1"), false);
  const seconds = Object.fromEntries([...s.hooks, ...s.meats, ...s.ctas].map((p) => [p.id, p.seconds]));
  const est = estimate(ads, new Set(["H1.v1"]), seconds);
  assert.ok(est.pieces > plain.length);
  assert.equal(est.toRender, est.pieces - 1);
});

test("the CSV names each voice and a metrics file still matches the new ids", () => {
  const s = catalogue();
  s.media.H1 = AdsMediaSchema.parse({
    voices: [
      { id: "v1", file: "a", name: "Calma", seconds: 1 },
      { id: "v2", file: "b", name: "Firme", seconds: 1 },
    ],
    voiceSeq: 2,
  });
  s.media.C1 = AdsMediaSchema.parse({ voice: { file: "c", name: "Cierre", duration: 1 } });
  const ads = combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 }, voicePicks(s.media));
  const rowAd = ads.find((a) => a.id === "H1v2-M1-C1");
  assert.ok(rowAd);
  const csv = exportCsv(
    { id: "tanda-1", createdAt: new Date().toISOString(), seconds: 15, mode: "full", rules: { sameLevel: true }, ads: rowAd ? [rowAd] : [], copies: {}, files: {} },
    s.hooks,
    s.meats,
    s.ctas,
    s.media,
  );
  const table = parseCsv(csv);
  assert.deepEqual(table[0].slice(-3), ["voz_hook", "voz_meat", "voz_cta"]);
  assert.equal(voiceColumn(s.media.H1, "v2"), "Firme");
  assert.equal(voiceColumn(s.media.C1), "Cierre");
  assert.deepEqual(table[1].slice(-3), ["Firme", "", "Cierre"]);
  const report = parseMetricsCsv("Ad name,Impressions,3-second video plays\nH12v10-M3v1-C2v2,100,40\nH1-M1-C1,50,10\n");
  assert.equal(report.rows[0].adId, "H12v10-M3v1-C2v2");
  assert.equal(report.rows[1].adId, "H1-M1-C1");
  const stats = pieceStats(report.rows);
  assert.equal(stats.H12.impressions, 100);
  assert.equal(stats.M3.ads, 1);
  assert.equal(stats.C2.ads, 1);
});

test("a voice that runs past the piece is named with both lengths", () => {
  assert.equal(formatSeconds(3), "3");
  assert.equal(formatSeconds(4.2), "4,2");
  assert.equal(voiceLengthWarning(3, 4.2, 3), "La voz 3 dura 4,2 s y la pieza 3 s");
  assert.equal(voiceLengthWarning(1, 2, 3), null);
  const block = voiceCutBlock({ id: "v3", seconds: 4.2 }, 3);
  assert.equal(block, "La voz 3 dura 4,2 s y la pieza 3 s. Se corta al final de la pieza. Aceptá el corte o reemplazala antes de renderizar.");
  assert.equal(voiceCutBlock({ id: "v3", seconds: 4.2, cutOk: true }, 3), null);
});

test("the upload route rejects a bad id, an 11th file, a used-up number, an empty file and a wrong type", () => {
  const ok = { pieceId: "H1", vid: "v1", count: 0, seq: 0, byteLength: mp3.length, bytes: mp3, replacing: false };
  assert.equal(voiceUploadError(ok), null);
  assert.equal(voiceUploadError({ ...ok, pieceId: "../H1" }), "Esa pieza no existe.");
  assert.equal(voiceUploadError({ ...ok, vid: "v0" }), "Esa voz no existe.");
  assert.equal(voiceUploadError({ ...ok, vid: "v11" }), "Esa voz no existe.");
  assert.equal(voiceUploadError({ ...ok, vid: "v01" }), "Esa voz no existe.");
  assert.equal(voiceUploadError({ ...ok, vid: "../v1" }), "Esa voz no existe.");
  assert.equal(voiceUploadError({ ...ok, count: 10, vid: "v1" }), "Esta pieza ya tiene 10 voces.");
  assert.equal(voiceUploadError({ ...ok, seq: 10, count: 0, vid: "v1" }), "Esta pieza ya usó las 10 voces (v1 a v10). Borrar una no libera el número.");
  assert.equal(voiceUploadError({ ...ok, vid: "v3", seq: 1, count: 1 }), "Esa voz no es la que sigue. La próxima es v2.");
  assert.equal(voiceUploadError({ ...ok, byteLength: 0, bytes: new Uint8Array() }), "El archivo está vacío.");
  assert.equal(voiceUploadError({ ...ok, byteLength: VOICE_MAX_BYTES + 1 }), "La voz pesa más de 25 MB.");
  assert.equal(voiceUploadError({ ...ok, bytes: Uint8Array.from("hola", (c) => c.charCodeAt(0)), byteLength: 4 }), "Ese archivo no es un audio (mp3, wav, m4a, ogg o webm).");
  assert.equal(voiceUploadError({ ...ok, vid: "v9", replacing: true }), null);
  const wav = new Uint8Array(12);
  wav.set(Uint8Array.from("RIFF", (c) => c.charCodeAt(0)), 0);
  wav.set(Uint8Array.from("WAVE", (c) => c.charCodeAt(0)), 8);
  assert.equal(voiceTypeOf(wav), "wav");
  const m4a = new Uint8Array(8);
  m4a.set(Uint8Array.from("ftyp", (c) => c.charCodeAt(0)), 4);
  assert.equal(voiceTypeOf(m4a), "m4a");
  assert.equal(voiceTypeOf(Uint8Array.from("OggS", (c) => c.charCodeAt(0))), "ogg");
  assert.equal(voiceTypeOf(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), "webm");
  assert.equal(voiceTypeOf(Uint8Array.from("fLaC", (c) => c.charCodeAt(0))), null);
});

test("the render cache keeps the old file name for one voice and moves it when a second voice arrives", () => {
  assert.equal(renderKey("H3", "v2", false), "H3");
  assert.equal(renderKey("H3", "v2", true), "H3.v2");
  assert.equal(renderNameForKey("H3", "mp4"), "H3.l2.mp4");
  assert.equal(renderNameForKey("H3.v2", "mp4"), "H3.v2.l2.mp4");
  assert.equal(renderNameForKey("H3.v10", "webm"), "H3.v10.l2.webm");
  assert.deepEqual(voiceCachePlan("H3", [], ["v1"], "v1", "add"), { drop: ["H3"] });
  assert.deepEqual(voiceCachePlan("H3", ["v1"], ["v1", "v2"], "v2", "add"), { drop: [], move: { from: "H3", to: "H3.v1" } });
  assert.deepEqual(voiceCachePlan("H3", ["v1", "v2"], ["v1", "v2"], "v2", "replace"), { drop: ["H3.v2"] });
  assert.deepEqual(voiceCachePlan("H3", ["v1", "v2"], ["v1"], "v2", "delete"), { drop: ["H3.v2"], move: { from: "H3.v1", to: "H3" } });
  assert.equal(renderNameForKey("H12", "mp4"), "H12.l2.mp4");
  assert.equal(renderKey("H1", undefined, false) === "H12", false);
});

test("a very large batch is warned and one past 1000 is blocked", () => {
  assert.deepEqual(adsCountWarning(300), { block: null, warn: null });
  assert.match(adsCountWarning(301).warn ?? "", /301 anuncios/);
  assert.equal(adsCountWarning(301).block, null);
  assert.match(adsCountWarning(1001).block ?? "", /1000/);
  assert.equal(adsCountWarning(1001).warn, null);
});
