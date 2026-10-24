// Slot names on the copied Grok prompt, and the preview table that matches a dropped file to a piece.
import assert from "node:assert/strict";
import { test } from "node:test";
import { grokSequence } from "../shared/adsSequence.ts";
import {
  bulkKindOf,
  bulkMimeOf,
  bulkWillUpload,
  imageSaveLine,
  markRepeated,
  matchBulkFile,
  parseSlotName,
  pendingUploads,
  slotChoices,
  slotName,
  videoSaveLine,
  webmContainer,
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
const meat = (id: string, seconds: number, clips: boolean[], singleClip = false): BulkPiece => ({
  id,
  kind: "meat",
  seconds,
  image: false,
  clips,
  ...(singleClip && { singleClip }),
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
  assert.deepEqual(parseSlotName("H12-image.png"), { ok: true, pieceId: "H12", image: true, clip: null });
  assert.deepEqual(parseSlotName("H12-estatico.png"), { ok: true, pieceId: "H12", image: false, clip: null });
  assert.deepEqual(parseSlotName("clip-H12.mp4"), { ok: true, pieceId: "H12", image: false, clip: null });
  assert.deepEqual(parseSlotName("M3c2.mp4"), { ok: true, pieceId: "M3", image: false, clip: null });
  assert.deepEqual(parseSlotName("H12 y M3.mp4"), { ok: false, reason: "ambiguous" });
  assert.deepEqual(parseSlotName("H12-c2-c3.mp4"), { ok: false, reason: "clips" });
  assert.deepEqual(parseSlotName("H12-c2-img.mp4"), { ok: false, reason: "clips" });
  assert.deepEqual(parseSlotName("notas.mp4"), { ok: false, reason: "none" });
  assert.deepEqual(parseSlotName("H12 y C2.mp4"), { ok: false, reason: "ambiguous" });
});

test("the save line is appended once, and it is not how a prompt is built", () => {
  assert.equal(withSlotLine("Look.", "Guardá el video como: H12.mp4"), "Look.\nGuardá el video como: H12.mp4");
  assert.equal(withSlotLine("Look.\nGuardá el video como: H12.mp4\n", "Guardá el video como: H12.mp4"), "Look.\nGuardá el video como: H12.mp4");
  assert.equal(withSlotLine("", "Guardá el video como: H12.mp4"), "Guardá el video como: H12.mp4");
  assert.equal(slotName("M3", { count: 2, index: 0 }), "M3-c1");
  assert.equal(slotName("M3", { count: 2, index: 1 }), "M3-c2");
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
  webm.set([0x83, 0x81, 0x01], 40);
  const audioWebm = new Uint8Array(64);
  audioWebm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  audioWebm.set(text("webm"), 20);
  audioWebm.set([0x83, 0x81, 0x02], 40);
  const bareWebm = new Uint8Array(64);
  bareWebm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  bareWebm.set(text("webm"), 20);
  const m4a = text("\0\0\0\x18ftypM4A ");
  const heic = text("\0\0\0\x18ftypheic");
  const avif = text("\0\0\0\x18ftypavif");
  const mp41 = text("\0\0\0\x18ftypmp41");
  assert.equal(bulkMimeOf(png), "image/png");
  assert.equal(bulkMimeOf(jpeg), "image/jpeg");
  assert.equal(bulkMimeOf(webp), "image/webp");
  assert.equal(bulkMimeOf(mp4), "video/mp4");
  assert.equal(bulkMimeOf(mov), "video/quicktime");
  assert.equal(bulkMimeOf(webm), "video/webm");
  assert.equal(bulkMimeOf(audioWebm), null);
  assert.equal(bulkMimeOf(bareWebm), null);
  assert.equal(webmContainer(audioWebm), true);
  assert.equal(webmContainer(bareWebm), true);
  assert.equal(bulkMimeOf(m4a), null);
  assert.equal(bulkMimeOf(heic), null);
  assert.equal(bulkMimeOf(avif), null);
  assert.equal(bulkMimeOf(mp41), "video/mp4");
  assert.equal(bulkMimeOf(text("hola")), null);
  assert.equal(bulkKindOf(png), "image");
  assert.equal(bulkKindOf(mp4), "video");
  assert.equal(bulkKindOf(audioWebm), null);
  assert.equal(bulkKindOf(Uint8Array.of()), null);
});

test("a Grok download or a camera name is not a piece, even when that code exists", () => {
  const pieces = [hook("C41"), hook("C3"), hook("M100"), hook("H12")];
  for (const name of ["grok-video-3f2c41a9-8b2e-4d10-a1f0.mp4", "grok_8a1c3e.mp4", "DSC_M100.mp4"]) {
    assert.equal(parseSlotName(name).ok, false);
    assert.equal(matchBulkFile(video(name), pieces, "hook").status, "no encontré la pieza");
  }
});

test("a file that is not a picture or a video says formato no válido before the name is read", () => {
  const pieces = [hook("H12")];
  const bad = (name: string) => matchBulkFile({ name, size: 20, kind: null }, pieces, "hook").status;
  assert.equal(bad("notas.txt"), "formato no válido");
  assert.equal(bad("H12.txt"), "formato no válido");
  assert.equal(bad("H12-voz-v1.webm"), "formato no válido");
  assert.equal(matchBulkFile(image("H12-estatico.png"), pieces, "hook").status, "formato no válido");
  assert.equal(matchBulkFile(image("H12-image.png"), pieces, "hook").status, "nuevo");
  assert.equal(matchBulkFile(image("H12-image.png"), pieces, "hook").slot, "H12-img");
});

test("a second file for the same slot is repetido, and a row already listo is not uploaded again", () => {
  const pieces = [hook("H12")];
  const matches = markRepeated([
    matchBulkFile(video("H12.mp4"), pieces, "hook"),
    matchBulkFile(video("H12 (1).mp4"), pieces, "hook"),
    matchBulkFile(video("H4.mp4"), pieces, "hook"),
  ]);
  assert.equal(matches[0].status, "nuevo");
  assert.equal(matches[1].status, "repetido");
  assert.equal(matches[1].pick, true);
  assert.equal(bulkWillUpload(matches[1].status), false);
  assert.equal(matches[2].status, "no encontré la pieza");
  const rows = matches.map((m, i) => ({ key: String(i), status: m.status }));
  assert.deepEqual(
    pendingUploads(rows, { "0": "listo" }).map((r) => r.key),
    [],
  );
  const again = pendingUploads(
    [
      { key: "a", status: "reemplaza el actual" as const },
      { key: "b", status: "nuevo" as const },
    ],
    { a: "listo" },
  );
  assert.deepEqual(again.map((r) => r.key), ["b"]);
});

test("an explainer clip is one slot, even when the meat is longer than 15 s", () => {
  const pieces = [meat("M3", 22, [false, false], true)];
  assert.equal(matchBulkFile(video("M3.mp4"), pieces, "meat").status, "nuevo");
  assert.equal(matchBulkFile(video("M3.mp4"), pieces, "meat").slot, "M3");
  assert.equal(matchBulkFile(video("M3-c1.mp4"), pieces, "meat").slot, "M3");
  assert.equal(matchBulkFile(video("M3-c2.mp4"), pieces, "meat").status, "ese clip no existe en esta pieza");
  assert.deepEqual(
    slotChoices(pieces, "meat")
      .filter((s) => !s.image)
      .map((s) => s.label),
    ["M3 · clip"],
  );
});
