// Slot names on the copied Grok prompt, and the preview table that matches a dropped file to a piece.
import assert from "node:assert/strict";
import { test } from "node:test";
import { grokSequence } from "../shared/adsSequence.ts";
import {
  bulkKindOf,
  bulkMimeOf,
  bulkWillUpload,
  imageSaveLine,
  matchBulkFile,
  parseSlotName,
  promptsWithSlots,
  slotChoices,
  slotName,
  videoSaveLine,
  withSlotLine,
  type BulkFile,
  type BulkPiece,
} from "../shared/adsBulk.ts";

const video = (name: string): BulkFile => ({ name, size: 1000, kind: "video" });
const image = (name: string): BulkFile => ({ name, size: 1000, kind: "image" });
const hook = (id: string, extra: Partial<BulkPiece> = {}): BulkPiece => ({
  id,
  kind: "hook",
  seconds: 3,
  image: false,
  clips: [false],
  ...extra,
});
const meat = (id: string, seconds: number, clips: boolean[]): BulkPiece => ({
  id,
  kind: "meat",
  seconds,
  image: false,
  clips,
});

test("slot names round-trip: one clip is the id, clip 2 is 1-based, a still is -img", () => {
  assert.equal(slotName("h12", { count: 1, index: 0 }), "H12");
  assert.equal(slotName("M3", { count: grokSequence(22).length, index: 1 }), "M3-c2");
  assert.equal(slotName("H12", { image: true }), "H12-img");
  assert.equal(videoSaveLine("H12"), "Guardá el video como: H12.mp4");
  assert.equal(imageSaveLine("H12-img"), "Guardá la imagen como: H12-img.png");
  assert.deepEqual(parseSlotName("H12.mp4"), { ok: true, pieceId: "H12", image: false, clip: null });
  assert.deepEqual(parseSlotName("M3-c2.mp4"), { ok: true, pieceId: "M3", image: false, clip: 2 });
  assert.deepEqual(parseSlotName("H12-img.png"), { ok: true, pieceId: "H12", image: true, clip: null });
  const parsed = parseSlotName("H12.mp4");
  assert.equal(parsed.ok && parsed.pieceId, "H12");
  assert.notEqual(parsed.ok && parsed.pieceId, "H1");
});

test("names are tolerant, and two codes or a missing separator are not a guess", () => {
  assert.deepEqual(parseSlotName("M3-c2 (1).mp4"), { ok: true, pieceId: "M3", image: false, clip: 2 });
  assert.deepEqual(parseSlotName("m3_c2-final.mp4"), { ok: true, pieceId: "M3", image: false, clip: 2 });
  assert.deepEqual(parseSlotName("carpeta/m3 c2.mov"), { ok: true, pieceId: "M3", image: false, clip: 2 });
  assert.deepEqual(parseSlotName("H12-imagen.jpg"), { ok: true, pieceId: "H12", image: true, clip: null });
  assert.deepEqual(parseSlotName("M3c2.mp4"), { ok: true, pieceId: "M3", image: false, clip: null });
  assert.deepEqual(parseSlotName("H12 y M3.mp4"), { ok: false, reason: "ambiguous" });
  assert.deepEqual(parseSlotName("H12-c2-c3.mp4"), { ok: false, reason: "clips" });
  assert.deepEqual(parseSlotName("H12-c2-img.mp4"), { ok: false, reason: "clips" });
  assert.deepEqual(parseSlotName("notas.mp4"), { ok: false, reason: "none" });
  assert.deepEqual(parseSlotName("H12 y C2.mp4"), { ok: false, reason: "ambiguous" });
});

test("the save line is appended once, one prompt per clip", () => {
  assert.equal(withSlotLine("Look.", "Guardá el video como: H12.mp4"), "Look.\nGuardá el video como: H12.mp4");
  assert.equal(withSlotLine("Look.\nGuardá el video como: H12.mp4\n", "Guardá el video como: H12.mp4"), "Look.\nGuardá el video como: H12.mp4");
  assert.equal(withSlotLine("", "Guardá el video como: H12.mp4"), "Guardá el video como: H12.mp4");
  const one = promptsWithSlots("h12", ["a prompt"]);
  assert.equal(one.length, 1);
  assert.match(one[0], /Guardá el video como: H12\.mp4$/);
  assert.doesNotMatch(one[0], /-c1/);
  const two = promptsWithSlots("M3", ["first", "second"]);
  assert.match(two[0], /M3-c1\.mp4$/);
  assert.match(two[1], /M3-c2\.mp4$/);
});

test("the preview table: new, replace, missing, wrong clip, bad type, pick, other tab", () => {
  const pieces = [
    hook("H12"),
    hook("H4", { image: true, clips: [true] }),
    meat("M3", 22, [true, false]),
  ];
  assert.equal(grokSequence(22).length, 2);
  assert.deepEqual(matchBulkFile(video("H12.mp4"), pieces, "hook"), {
    status: "nuevo",
    pieceId: "H12",
    image: false,
    index: null,
    slot: "H12",
    pick: false,
  });
  assert.equal(matchBulkFile(video("H12-c1.mp4"), pieces, "hook").status, "nuevo");
  assert.equal(matchBulkFile(video("H12-c1.mp4"), pieces, "hook").index, null);
  assert.equal(matchBulkFile(video("H12-c1.mp4"), pieces, "hook").slot, "H12");
  assert.equal(matchBulkFile(video("H12-c2.mp4"), pieces, "hook").status, "ese clip no existe en esta pieza");
  assert.equal(matchBulkFile(video("H4.mp4"), pieces, "hook").status, "reemplaza el actual");
  assert.equal(matchBulkFile(image("H12-img.png"), pieces, "hook").status, "nuevo");
  assert.equal(matchBulkFile(image("H12-img.png"), pieces, "hook").slot, "H12-img");
  assert.equal(matchBulkFile(image("H4-img.png"), pieces, "hook").status, "reemplaza el actual");
  assert.equal(matchBulkFile(video("H12-img.mp4"), pieces, "hook").status, "formato no válido");
  assert.equal(matchBulkFile(image("H12.png"), pieces, "hook").status, "formato no válido");
  assert.equal(matchBulkFile(video("M3.mp4"), pieces, "meat").status, "elegí el lugar");
  assert.equal(matchBulkFile(video("M3c2.mp4"), pieces, "meat").status, "elegí el lugar");
  assert.equal(matchBulkFile(video("M3-c2.mp4"), pieces, "meat").status, "nuevo");
  assert.equal(matchBulkFile(video("M3-c2.mp4"), pieces, "meat").index, 1);
  assert.equal(matchBulkFile(video("M3-c1.mp4"), pieces, "meat").status, "reemplaza el actual");
  assert.equal(matchBulkFile(video("M3-c3.mp4"), pieces, "meat").status, "ese clip no existe en esta pieza");
  assert.equal(matchBulkFile(video("H99.mp4"), pieces, "hook").status, "no encontré la pieza");
  assert.equal(matchBulkFile(video("notas.mp4"), pieces, "hook").status, "no encontré la pieza");
  assert.equal(matchBulkFile(video("H12 y M3.mp4"), pieces, "all").status, "hay más de una pieza en el nombre");
  assert.equal(matchBulkFile(video("H12-c2-c3.mp4"), pieces, "hook").status, "elegí el lugar");
  assert.equal(matchBulkFile(video("M3-c2.mp4"), pieces, "hook").status, "esa pieza es de otra pestaña");
  assert.equal(matchBulkFile({ name: "H12.mp4", size: 0, kind: null }, pieces, "hook").status, "formato no válido");
  assert.equal(matchBulkFile({ name: "H12.mp4", size: 9_000_000, kind: "video" }, pieces, "hook").status, "nuevo");
  const forced = matchBulkFile(video("notas.mp4"), pieces, "hook", { pieceId: "H12", image: false, index: null });
  assert.equal(forced.status, "nuevo");
  assert.equal(forced.slot, "H12");
  assert.equal(matchBulkFile(image("notas.png"), pieces, "hook", { pieceId: "H12", image: false, index: null }).status, "formato no válido");
  assert.equal(bulkWillUpload("nuevo"), true);
  assert.equal(bulkWillUpload("reemplaza el actual"), true);
  assert.equal(bulkWillUpload("elegí el lugar"), false);
  const labels = slotChoices(pieces, "hook").map((s) => s.label);
  assert.ok(labels.includes("H12 · clip"));
  assert.ok(labels.includes("H12-img · imagen"));
  assert.equal(labels.some((l) => l.startsWith("M3")), false);
  assert.ok(slotChoices(pieces, "all").some((s) => s.label.startsWith("M3-c2")));
});

test("type comes from the first bytes: png, jpeg, webp, mp4, mov, webm", () => {
  const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0);
  const webp = text("RIFF----WEBP");
  const mp4 = text("\0\0\0\x18ftypisom");
  const mov = text("\0\0\0\x14ftypqt  ");
  const webm = new Uint8Array(64);
  webm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  webm.set(text("webm"), 20);
  assert.equal(bulkMimeOf(png), "image/png");
  assert.equal(bulkMimeOf(jpeg), "image/jpeg");
  assert.equal(bulkMimeOf(webp), "image/webp");
  assert.equal(bulkMimeOf(mp4), "video/mp4");
  assert.equal(bulkMimeOf(mov), "video/quicktime");
  assert.equal(bulkMimeOf(webm), "video/webm");
  assert.equal(bulkMimeOf(text("hola")), null);
  assert.equal(bulkKindOf(png), "image");
  assert.equal(bulkKindOf(mp4), "video");
  assert.equal(bulkKindOf(Uint8Array.of()), null);
});
