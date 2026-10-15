// "Entrar con la palabra" (shared/wordEntry.ts): an explainer element the voice names enters on that word. Matching
// is tolerant; a hand-set time wins over the word, the word over the beat, the beat over the template.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, cutPush, elementTimes, newMotionPiece, openMotionPiece, quietGaps, readingIssues, revealTimes, snapElements, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { enterOnWordOn, enterOnWords, findSaid, readableOnWords, sameWord, wordKey } from "../shared/wordEntry.ts";
import type { HeardWordTimes, WordSpan } from "../shared/subtitles.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { arrangeScenes, motionBeats, pieceWords, soundHits } from "../src/lib/motionProject.ts";

const said = (text: string, voice: string) => findSaid(text, voice.split(" "))?.index ?? null;

test("words compare without accents, case or punctuation, and small numbers meet their written word", () => {
  assert.equal(wordKey("¿Pedís?"), "pedis");
  assert.equal(wordKey("3"), "tres");
  assert.equal(wordKey("Tres"), "tres");
  assert.equal(wordKey("40%"), "cuarenta");
  assert.equal(wordKey("una"), "uno");
  assert.ok(sameWord("pedido", "pedidos"));
  assert.ok(sameWord("pantallas", "pantalla"));
  assert.ok(!sameWord("mes", "meses"), "too short to call it a plural");
  assert.ok(!sameWord("pan", "pago"));
});

test("an element is found where the voice names it", () => {
  assert.equal(said("Stock", "Mirá el stock que queda"), 2);
  assert.equal(said("Pedís", "Ahora pedís desde el celular"), 1);
  assert.equal(said("3 pedidos", "Llegan tres pedidos juntos"), 1);
  assert.equal(said("Lo que falta", "Y lo que falta aparece arriba"), 1);
  // A short text: its earliest meaningful word the voice says, never an article or a pronoun alone.
  assert.equal(said("Entra frío por abajo", "¿Sentís el frío que entra?"), 2);
  assert.equal(said("Yo te lo explico", "Te muestro cómo"), null);
  assert.equal(said("La", "La heladera"), null);
  // A long text needs its opening said in a row.
  assert.equal(said("Lo que queda, sin contar nada.", "Ves lo que queda hoy"), 1);
  assert.equal(said("Todo lo que queda sin contar", "queda todo"), null);
  assert.equal(said("Heladera", "Nada que ver"), null);
  // One voice word names one element.
  assert.equal(findSaid("Stock", "stock y más stock".split(" "), new Set([0]))?.index, 3);
});

// A callouts scene whose voice says two of its three labels, with heard word times.
const VOICE = "Mirá el stock y los pedidos";
const TIMES: WordSpan[] = [
  [0, 0.3],
  [0.3, 0.4],
  [0.4, 0.8],
  [0.8, 0.9],
  [0.9, 1.0],
  [1.05, 1.5],
];
const heard: HeardWordTimes = { text: VOICE, seconds: 2, times: TIMES, matched: 6 };
const scene = (extra: Partial<MotionScene> = {}): MotionScene => ({
  ...blankScene("callouts"),
  id: "a",
  seconds: 4,
  asset: "x",
  items: ["Stock", "Pedidos", "Ventas"],
  voice: VOICE,
  ...extra,
});
const input = { voiceSeconds: { a: 2 }, heard: { a: heard } };

test("an element the voice names enters on its word; the others keep their time", () => {
  const plain = elementTimes(scene());
  const [moved] = enterOnWords([scene()], input);
  const at = elementTimes(moved);
  const mark = plain.voice;
  assert.equal(at.item0, Math.round((mark + 0.4) * 1000) / 1000);
  assert.equal(at.item1, Math.round((mark + 1.05) * 1000) / 1000);
  assert.equal(at.item2, plain.item2, "not said: the template's time");
  assert.equal(at.voice, mark, "the voice never moves");
  // With no file, the words are estimated as the subtitles estimate them.
  const [guessed] = enterOnWords([scene()], { voiceSeconds: {} });
  assert.ok(guessed.onWord?.item0 !== undefined && guessed.onWord.item0 > mark);
  // A word said too late to be seen before the cut changes nothing.
  const [late] = enterOnWords([scene({ seconds: 1.4 })], input);
  assert.equal(late.onWord?.item1, undefined);
});

test("timing precedence: by hand, then the word, then the beat, then the template", () => {
  const beats = Array.from({ length: 20 }, (_, i) => i * 0.5);
  const template = elementTimes(scene());
  // The beat alone: item1's template time (about 1.53 s) moves onto 1.5.
  const beat = elementTimes(snapElements([scene()], beats)[0]);
  assert.equal(beat.item1, 1.5);
  // The word wins over the beat.
  const word = elementTimes(snapElements(enterOnWords([scene()], input), beats)[0]);
  assert.equal(word.item1, Math.round((template.voice + 1.05) * 1000) / 1000);
  // The person's time wins over both, even on a word that is said.
  const hand = elementTimes(snapElements(enterOnWords([scene({ tweaks: { item1: { at: 2.2 } } })], input), beats)[0]);
  assert.equal(hand.item1, 2.2);
  // What nobody placed keeps the template's time when no beat is near.
  const free = elementTimes(enterOnWords([scene()], input)[0]);
  assert.equal(free.item2, template.item2);
});

test("the checks, the reveals and the sound read the word's time", () => {
  const script = { title: "", tone: "warm", music: { mood: "calm", bpm: 120 }, scenes: [scene()] } as unknown as MotionScript;
  const arranged = arrangeScenes(script, [], false, "none", null, input);
  const wordAt = arranged[0].onWord?.item1;
  assert.ok(wordAt !== undefined);
  assert.ok(revealTimes(arranged[0]).includes(wordAt));
  // The first label's pop sounds on its word.
  const first = arranged[0].onWord?.item0;
  assert.ok(first !== undefined);
  assert.ok(soundHits({ ...script, scenes: arranged }).some((h) => Math.abs(h.at - first) < 1e-6), "a sound at the word");
  // Off (null input): exactly as before.
  assert.deepEqual(arrangeScenes(script, [], false, "none", null, null), script.scenes);
});

test("the word never costs reading time", () => {
  // The voice says the long text late: entering on it would leave it too briefly on screen, so it keeps its time.
  const late: MotionScene = { ...blankScene("screen"), id: "b", seconds: 3, asset: "x", title: "", text: "Lo que queda sin contar", voice: "Esto es lo que queda sin contar" };
  const times: WordSpan[] = [
    [0, 0.2],
    [0.2, 0.3],
    [1.9, 2.0],
    [2.0, 2.1],
    [2.1, 2.3],
    [2.3, 2.4],
    [2.4, 2.6],
  ];
  const words = { voiceSeconds: { b: 2.7 }, heard: { b: { text: late.voice, seconds: 2.7, times, matched: 7 } } };
  assert.ok(enterOnWords([late], words)[0].onWord?.text !== undefined, "the word was found");
  const kept = readableOnWords(enterOnWords([late], words), 0.38);
  assert.equal(kept[0].onWord, undefined);
  assert.deepEqual(readingIssues(kept, 0.38), []);
});

test("the sample explainers still read in time with the words on", () => {
  for (const series of ["iman", "masogar", "serie-nueva"]) {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone, narrator: "with" }, null);
      const push = cutPush(script.tone);
      for (const music of ["synth", "none"] as const) {
        for (const snap of [true, false]) {
          const scenes = arrangeScenes(script, motionBeats(script, music, null), snap, music, null, { voiceSeconds: {} });
          const where = `${series} ${tone} ${music} ${snap ? "snap" : "free"}`;
          assert.ok(scenes.some((s) => s.onWord), `${where}: something enters on its word`);
          assert.deepEqual(readingIssues(scenes, push).map((r) => `${r.index}:${r.key}`), [], where);
          assert.deepEqual(quietGaps(scenes, push), [], where);
        }
      }
    }
  }
});

test("on for new pieces, off for pieces saved before it existed", () => {
  assert.equal(enterOnWordOn(newMotionPiece("vertical")), true);
  assert.equal(enterOnWordOn(openMotionPiece("vertical", {})), false);
  assert.equal(enterOnWordOn(openMotionPiece("vertical", { enterOnWord: true })), true);
  assert.equal(enterOnWordOn(openMotionPiece("vertical", { enterOnWord: false })), false);
  const piece = newMotionPiece("vertical");
  assert.ok(pieceWords(piece, {}));
  assert.equal(pieceWords({ ...piece, enterOnWord: false }, {}), null);
  assert.equal(pieceWords({ ...piece, voice: "none" }, {}), null);
});
