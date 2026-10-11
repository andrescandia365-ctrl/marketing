// Explainer subtitles word by word (shared/subtitles.ts): the estimate, the alignment to what whisper heard, the
// chunks and cues on the piece's clock, and the .srt file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, elementTimes, timeScenes, type MotionScene } from "../shared/motion.ts";
import {
  SUB_LINE,
  alignWordTimes,
  breakLines,
  cueAt,
  estimateWordTimes,
  litWord,
  sceneWordTimes,
  srtTime,
  subtitleChunks,
  subtitleCues,
  subtitleWords,
  toSrt,
  wordByWordOn,
  wordTimesFresh,
  type HeardWord,
} from "../shared/subtitles.ts";

const scene = (id: string, voice: string, seconds: number): MotionScene => ({ ...blankScene("screen"), id, voice, seconds });

test("the estimate shares the voice's length by letters, in order, ending on the length", () => {
  const words = subtitleWords("Un pedido llega tarde, otra vez.");
  const times = estimateWordTimes(words, 3);
  assert.equal(times.length, words.length);
  assert.equal(times[0][0], 0);
  assert.ok(Math.abs(times.at(-1)![1] - 3) < 0.01);
  for (let i = 0; i < times.length; i++) {
    assert.ok(times[i][1] > times[i][0], "every word takes some time");
    if (i) assert.ok(times[i][0] >= times[i - 1][1] - 1e-9, "in order, never overlapping");
  }
  // "pedido" (6 letters) takes longer than "Un" (2).
  assert.ok(times[1][1] - times[1][0] > times[0][1] - times[0][0]);
  // A comma leaves a breath before the next word.
  assert.ok(times[4][0] - times[3][1] > 0.05);
  assert.deepEqual(estimateWordTimes([], 2), []);
});

test("no voice file: the spoken pace (2.5 words a second); fresh heard times win", () => {
  const s = scene("a", "uno dos tres cuatro cinco", 4);
  assert.ok(Math.abs(sceneWordTimes(s, undefined).at(-1)![1] - 2) < 0.01);
  assert.ok(Math.abs(sceneWordTimes(s, 3).at(-1)![1] - 3) < 0.01);
  const heard = { text: "uno dos tres cuatro cinco", seconds: 3, matched: 5, times: [[0.1, 0.3], [0.4, 0.6], [0.7, 0.9], [1, 1.2], [1.3, 1.5]] as [number, number][] };
  assert.deepEqual(sceneWordTimes(s, 3, heard), heard.times);
  // A new line or a new file: the heard times are stale.
  assert.ok(wordTimesFresh(heard, s.voice, 3.02));
  assert.ok(!wordTimesFresh(heard, "uno dos tres", 3));
  assert.ok(!wordTimesFresh(heard, s.voice, 3.5));
  assert.ok(!wordTimesFresh(heard, s.voice, undefined));
  assert.ok(Math.abs(sceneWordTimes(s, 3.5, heard).at(-1)![1] - 3.5) < 0.01);
});

test("alignment keeps heard times and fills what was not heard between its neighbours", () => {
  const written = subtitleWords("Tenés 24 pedidos, ¿y el stock?");
  const heard: HeardWord[] = [
    { word: "Tenés", start: 0.2, end: 0.5 },
    { word: "veinticuatro", start: 0.55, end: 1.2 },
    { word: "pedidos", start: 1.25, end: 1.7 },
    { word: "y", start: 1.9, end: 2.0 },
    { word: "el", start: 2.0, end: 2.1 },
    { word: "estok", start: 2.1, end: 2.6 },
  ];
  const out = alignWordTimes(written, heard, 3)!;
  assert.ok(out);
  assert.equal(out.times.length, written.length);
  assert.equal(out.matched, 5, "accents, case and punctuation do not matter; 'stock' ~ 'estok'");
  assert.deepEqual(out.times[0], [0.2, 0.5]);
  assert.deepEqual(out.times[2], [1.25, 1.7]);
  // "24" was heard as a word it does not match: it takes the gap between "Tenés" and "pedidos".
  assert.ok(out.times[1][0] >= 0.5 - 1e-9 && out.times[1][1] <= 1.25 + 1e-9);
  assert.deepEqual(out.times[5], [2.1, 2.6]);
});

test("alignment: unheard words at the edges get time, nothing matched gives null", () => {
  const written = subtitleWords("Hola che, mirá esto ahora");
  const heard: HeardWord[] = [
    { word: "mira", start: 0.3, end: 0.6 },
    { word: "esto", start: 0.6, end: 0.9 },
  ];
  const out = alignWordTimes(written, heard, 2)!;
  assert.equal(out.matched, 2);
  for (const [s, e] of out.times) assert.ok(e > s && s >= 0, "every word has a span");
  assert.ok(out.times[1][1] <= 0.3 + 1e-9, "the words before end on the first match");
  assert.ok(out.times[4][0] >= 0.9 - 1e-9, "the words after start after the last");
  assert.equal(alignWordTimes(written, [{ word: "zzz", start: 0, end: 1 }], 1), null);
  assert.equal(alignWordTimes([], heard, 1), null);
});

test("lines stay within 37 characters and chunks within two lines, a chunk breaking after a sentence", () => {
  const words = subtitleWords(
    "Cada lunes a la mañana alguien cuenta las cajas a mano. Después lo pasa a una planilla que nadie más abre, y el martes ya no coincide con el depósito.",
  );
  for (const [from, to] of subtitleChunks(words)) {
    const lines = breakLines(words.slice(from, to));
    assert.ok(lines.length <= 2, "two lines at most");
    for (const l of lines) assert.ok(l.map((i) => words.slice(from, to)[i]).join(" ").length <= SUB_LINE);
  }
  const chunks = subtitleChunks(words);
  assert.equal(chunks[0][0], 0);
  assert.equal(chunks.at(-1)![1], words.length);
  for (let k = 1; k < chunks.length; k++) assert.equal(chunks[k][0], chunks[k - 1][1], "chunks follow each other");
  assert.ok(chunks.some(([from]) => words[from - 1]?.endsWith(".")), "a chunk starts after the full stop");
  // A word longer than a line is a line of its own.
  assert.deepEqual(breakLines(["a", "x".repeat(50), "b"]), [[0], [1], [2]]);
});

test("cues: the first chunk from the cut, the next from its first word, the last to the next cut; never past the scene", () => {
  const scenes = timeScenes([
    scene("a", "Cada lunes alguien cuenta las cajas a mano y lo anota en una planilla que nadie más abre nunca.", 6),
    scene("b", "", 3),
    scene("c", "Listo.", 2),
  ]);
  const cues = subtitleCues(scenes, { karaoke: true, voiceSeconds: { a: 5.2 } });
  const a = cues.filter((c) => c.sceneId === "a");
  assert.ok(a.length >= 2, "a long line is shown in chunks");
  assert.equal(a[0].start, 0);
  assert.equal(a.at(-1)!.end, 6);
  for (let k = 1; k < a.length; k++) {
    assert.equal(a[k].start, a[k].words[0].start);
    assert.equal(a[k - 1].end, a[k].start);
  }
  const voiceAt = elementTimes(scenes[0]).voice ?? 0.25;
  assert.ok(Math.abs(a[0].words[0].start - voiceAt) < 1e-6, "the first word starts at the voice mark");
  assert.equal(cues.filter((c) => c.sceneId === "b").length, 0, "a silent scene has no subtitle");
  const c = cues.find((x) => x.sceneId === "c")!;
  assert.deepEqual([c.start, c.end], [scenes[2].start, scenes[2].end]);
  for (const cue of cues) for (const w of cue.words) {
    const s = scenes.find((x) => x.id === cue.sceneId)!;
    assert.ok(w.start >= s.start && w.end <= s.end, "no word outlives its scene");
  }
  // At any t the cue on screen belongs to the scene on screen, and its text never changes while it is up.
  assert.equal(cueAt(cues, "a", 0.1), a[0]);
  assert.equal(cueAt(cues, "a", a[1].start + 0.01), a[1]);
});

test("a voice that runs past the cut: the words it cuts off are not shown, the last chunk stays to the cut", () => {
  const scenes = timeScenes([scene("a", "Una línea larguísima que la voz no llega a decir entera antes del corte de la escena, ni de casualidad.", 3)]);
  const cues = subtitleCues(scenes, { karaoke: true, voiceSeconds: { a: 9 } });
  assert.ok(cues.length >= 1);
  assert.equal(cues.at(-1)!.end, 3);
  for (const c of cues) assert.ok(c.start < 3 && c.end <= 3);
});

test("off: each scene's whole line all through its scene, as before", () => {
  const scenes = timeScenes([scene("a", "Una línea con varias palabras para leer de una vez y ya.", 4)]);
  const cues = subtitleCues(scenes, { karaoke: false, voiceSeconds: {} });
  assert.equal(cues.length, 1);
  assert.deepEqual([cues[0].start, cues[0].end, cues[0].karaoke], [0, 4, false]);
  assert.equal(litWord(cues[0], 1), -1);
  assert.equal(wordByWordOn({}), true, "pieces saved before the switch count as on");
  assert.equal(wordByWordOn({ wordByWord: false }), false);
});

test("the lit word follows the voice, holds through a pause, and lets go after the last word", () => {
  const [cue] = subtitleCues(timeScenes([scene("a", "uno dos tres", 4)]), { karaoke: true, voiceSeconds: { a: 1.5 } });
  const w = cue.words;
  assert.equal(litWord(cue, w[0].start - 0.05), -1, "nothing said yet");
  assert.equal(litWord(cue, w[0].start + 0.01), 0);
  assert.equal(litWord(cue, w[1].start + 0.01), 1);
  assert.equal(litWord(cue, w[2].end + 0.1), 2);
  assert.equal(litWord(cue, w[2].end + 1), -1, "all said");
});

test("SRT: HH:MM:SS,mmm, numbered from 1, blank line between cues, lines within 37 characters", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(3.2), "00:00:03,200");
  assert.equal(srtTime(61.0456), "00:01:01,046");
  assert.equal(srtTime(3723.5), "01:02:03,500");
  assert.equal(srtTime(-1), "00:00:00,000");
  const scenes = timeScenes([
    scene("a", "Cada lunes alguien cuenta las cajas a mano y lo anota en una planilla que nadie más abre nunca.", 6),
    scene("b", "Ahora lo ves en el celular.", 3),
  ]);
  const cues = subtitleCues(scenes, { karaoke: true, voiceSeconds: {} });
  const srt = toSrt(cues);
  assert.ok(srt.endsWith("\r\n"));
  const blocks = srt.trim().split("\r\n\r\n");
  assert.equal(blocks.length, cues.length);
  blocks.forEach((b, k) => {
    const [n, time, ...lines] = b.split("\r\n");
    assert.equal(n, String(k + 1));
    assert.match(time, /^\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}$/);
    assert.ok(lines.length >= 1 && lines.length <= 2);
    for (const l of lines) assert.ok(l.length <= SUB_LINE, l);
  });
  assert.ok(blocks.at(-1)!.includes("00:00:09,000"), "the last cue ends on the last cut");
  // Every written word appears once, in order.
  const said = blocks.flatMap((b) => b.split("\r\n").slice(2).join(" ").split(" "));
  assert.deepEqual(said, [...subtitleWords(scenes[0].voice), ...subtitleWords(scenes[1].voice)]);
  assert.equal(toSrt([]), "");
});
