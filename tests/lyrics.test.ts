// Lyric videos: section headers are not sung lines, and the alignment follows the heard words.
import assert from "node:assert/strict";
import { test } from "node:test";
import { alignLyrics, sectionHeaders, splitLyrics } from "../shared/lyrics.ts";

test("section headers and bracketed notes are skipped", () => {
  const text = "Chorus (Grimes):\nPrimera línea\n[instrumental]\nSegunda línea\nVerse 2\nTercera línea";
  assert.deepEqual(splitLyrics(text), ["Primera línea", "Segunda línea", "Tercera línea"]);
  assert.equal(sectionHeaders(text), 2);
});

test("each line starts where its first heard word starts", () => {
  const heard = [
    { word: "Hola", start: 1.0, end: 1.4 },
    { word: "mundo", start: 1.5, end: 2.0 },
    { word: "chau", start: 4.0, end: 4.5 },
    { word: "Ñandé", start: 4.6, end: 5.1 },
  ];
  const lines = alignLyrics(["Hola mundo", "Chau nande"], ["", ""], heard, 8);
  assert.ok(Math.abs(lines[0].start - 1.0) < 0.2, `first at ${lines[0].start}`);
  assert.ok(Math.abs(lines[1].start - 4.0) < 0.2, `second at ${lines[1].start}`);
  assert.ok(lines[0].end <= lines[1].start + 1e-9);
});
