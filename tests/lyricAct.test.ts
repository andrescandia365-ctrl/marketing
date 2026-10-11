import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HELD_MIN,
  LOUD_MIN_WORDS,
  SETTLE,
  SHAKE_MAX,
  STILL,
  STRETCH_MAX,
  actNote,
  levelsFor,
  loudCut,
  measuredWords,
  monoOf,
  pieceActs,
  shakeAt,
  stretchAt,
  withLevels,
  wordAct,
  wordLevels,
  wordSpans,
} from "../shared/lyricAct.ts";
import { alignLyrics, makeLine, type LyricLine, type LyricWord } from "../shared/lyrics.ts";

const word = (start: number, end: number, extra: Partial<LyricWord> = {}): LyricWord => ({ text: "amor", start, end, key: false, gap: true, heard: true, ...extra });
const lineOf = (words: LyricWord[]): LyricLine => ({ text: words.map((w) => w.text).join(" "), second: "", start: words[0].start, end: words.at(-1)!.end, words });

test("wordLevels reads the RMS of each span in dBFS, and nothing outside the signal or in silence", () => {
  const rate = 1000;
  const samples = new Float32Array(3000);
  // 0–1 s: a full-scale square (0 dBFS); 1–2 s: half (≈ -6 dB); 2–3 s: silence.
  for (let i = 0; i < 1000; i++) samples[i] = i % 2 ? 1 : -1;
  for (let i = 1000; i < 2000; i++) samples[i] = i % 2 ? 0.5 : -0.5;
  const levels = wordLevels({ samples, sampleRate: rate }, [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 2, end: 3 },
    { start: 5, end: 6 },
    { start: 1, end: 1 },
  ]);
  assert.equal(levels[0], 0);
  assert.equal(levels[1], -6);
  assert.equal(levels[2], null);
  assert.equal(levels[3], null);
  assert.equal(levels[4], null);
});

test("monoOf averages the channels; withLevels puts each level on its word and drops a stale one", () => {
  assert.deepEqual([...monoOf([new Float32Array([1, 0]), new Float32Array([0, 1])])], [0.5, 0.5]);
  const lines = [lineOf([word(0, 1, { level: -3 }), word(1, 2)]), lineOf([word(3, 4)])];
  assert.deepEqual(wordSpans(lines), [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 3, end: 4 },
  ]);
  const out = withLevels(lines, [null, -12, -20]);
  assert.equal(out[0].words[0].level, undefined);
  assert.ok(!("level" in out[0].words[0]));
  assert.equal(out[0].words[1].level, -12);
  assert.equal(out[1].words[0].level, -20);
  assert.equal(measuredWords(out), 2);
});

test("the loudness line is relative to the song: its loudest tenth, clearly above the median", () => {
  // Nineteen words at -20 dB and one at -10: only that one shouts.
  const words = Array.from({ length: 20 }, (_, i) => word(i, i + 0.4, { level: i === 7 ? -10 : -20 }));
  const cut = loudCut([lineOf(words)]);
  assert.ok(cut);
  assert.equal(cut.median, -20);
  const acts = pieceActs([lineOf(words)], "auto");
  assert.deepEqual(
    acts[0].map((a) => a.shout > 0),
    words.map((_, i) => i === 7),
  );
  // An even song (every word within a dB) shakes nothing, however its tenth falls.
  const even = Array.from({ length: 20 }, (_, i) => word(i, i + 0.4, { level: -20 + (i % 3) * 0.3 }));
  assert.equal(loudCut([lineOf(even)]), null);
  // Too few measured words say nothing about the song.
  assert.equal(loudCut([lineOf(words.slice(0, LOUD_MIN_WORDS - 1))]), null);
  // A quiet song is measured against itself: the same shape 20 dB lower shouts on the same word.
  const quiet = words.map((w) => ({ ...w, level: w.level! - 20 }));
  assert.deepEqual(
    pieceActs([lineOf(quiet)], "auto")[0].map((a) => a.shout > 0),
    words.map((_, i) => i === 7),
  );
});

test("only a word held long and heard by the sync stretches, and never past the cap", () => {
  assert.equal(wordAct(word(0, HELD_MIN - 0.05), "auto", null).peak, 1);
  const short = wordAct(word(0, HELD_MIN), "auto", null).peak;
  const long = wordAct(word(0, 3), "auto", null).peak;
  assert.ok(short > 1 && short < long);
  assert.ok(Math.abs(long - (1 + STRETCH_MAX)) < 1e-9);
  // Placed between neighbours, tapped or from an .lrc: its length is a guess, so it stays still.
  assert.equal(wordAct(word(0, 3, { heard: false }), "auto", null).peak, 1);
  assert.equal(wordAct(word(0, 3, { heard: undefined }), "tap", null).peak, 1);
  assert.equal(wordAct(word(0, 3, { heard: undefined }), "lrc", null).peak, 1);
  // Auto-synced before `heard` existed: trusted.
  assert.ok(wordAct(word(0, 3, { heard: undefined }), "auto", null).peak > 1);
  // Without a vocal stem there is no level, so only the stretch applies.
  assert.equal(wordAct(word(0, 3), "auto", { cut: -10 }).shout, 0);
});

test("the stretch grows while the word is sung, peaks at its end and settles without overshoot", () => {
  const w = word(1, 2.6);
  const act = wordAct(w, "auto", null);
  assert.equal(stretchAt(act, w, 0.5), 1);
  assert.equal(stretchAt(act, w, 1), 1);
  let prev = 1;
  for (let t = 1; t <= 2.6; t += 0.05) {
    const s = stretchAt(act, w, t);
    assert.ok(s >= prev - 1e-12 && s <= act.peak + 1e-12);
    prev = s;
  }
  assert.ok(Math.abs(stretchAt(act, w, 2.6) - act.peak) < 1e-9);
  for (let t = 2.6; t <= 2.6 + SETTLE; t += 0.02) {
    const s = stretchAt(act, w, t);
    assert.ok(s <= prev + 1e-12 && s >= 1);
    prev = s;
  }
  assert.equal(stretchAt(act, w, 2.6 + SETTLE), 1);
  assert.equal(stretchAt(STILL, w, 2), 1);
  // Same t, same answer: a pure function.
  assert.equal(stretchAt(act, w, 1.8), stretchAt(act, w, 1.8));
});

test("the shake is small, starts with the word, rings out after it, and is half on a calm piece", () => {
  const w = word(4, 4.5);
  const act = { peak: 1, shout: 1 };
  assert.deepEqual(shakeAt(act, w, 3.9, false), { dx: 0, dy: 0 });
  assert.deepEqual(shakeAt(act, w, 4.5 + 0.3, false), { dx: 0, dy: 0 });
  assert.deepEqual(shakeAt(STILL, w, 4.2, false), { dx: 0, dy: 0 });
  let moved = 0;
  for (let t = 4; t <= 4.75; t += 1 / 30) {
    const s = shakeAt(act, w, t, false);
    assert.ok(Math.abs(s.dx) <= SHAKE_MAX + 1e-12 && Math.abs(s.dy) <= SHAKE_MAX + 1e-12);
    const c = shakeAt(act, w, t, true);
    assert.ok(Math.abs(c.dx - s.dx / 2) < 1e-12 && Math.abs(c.dy - s.dy / 2) < 1e-12);
    moved = Math.max(moved, Math.hypot(s.dx, s.dy));
    assert.deepEqual(shakeAt(act, w, t, false), s);
  }
  assert.ok(moved > SHAKE_MAX * 0.3, `it shakes (${moved})`);
});

test("alignLyrics marks which words were heard and which were placed between neighbours", () => {
  const heard = [
    { word: "Hola", start: 1.0, end: 1.4 },
    { word: "mundo", start: 2.5, end: 4.0 },
  ];
  const lines = alignLyrics(["Hola querido mundo"], [""], heard, 8);
  assert.deepEqual(
    lines[0].words.map((w) => w.heard),
    [true, false, true],
  );
  // A tapped line spreads its words by letters: no `heard`, so nothing stretches.
  assert.equal(makeLine("Hola mundo", "", 0, 4).words[0].heard, undefined);
});

test("the studio's note says what the piece has", () => {
  const plain = [makeLine("Hola mundo", "", 0, 4)];
  assert.match(actNote(plain, "tap"), /sincronización automática/);
  assert.match(actNote(plain, "auto"), /medí la fuerza/);
  const loud = [lineOf(Array.from({ length: 10 }, (_, i) => word(i, i + 0.5, { level: -20 })))];
  assert.match(actNote(loud, "auto"), /gritos la sacuden/);
});

test("levels measured on old word times are not written over lines edited while measuring", () => {
  const word = (text: string, start: number, end: number) => ({ text, start, end });
  const lines = [{ text: "hola mundo", start: 0, end: 2, words: [word("hola", 0, 1), word("mundo", 1, 2)] }] as unknown as Parameters<typeof wordSpans>[0];
  const spans = wordSpans(lines);
  const same = levelsFor(lines, spans, [0.5, 0.2]);
  assert.deepEqual(same?.[0].words.map((w) => w.level), [0.5, 0.2]);
  const moved = structuredClone(lines);
  moved[0].words[0].start = 0.3;
  assert.equal(levelsFor(moved, spans, [0.5, 0.2]), null);
});
