// Reading time on explainers (shared/motion.ts readingNeed): the word rule of PLAYBOOK §3.1, and letters for long
// Spanish words. The sample pieces (no AI key) must still pass the reading and the 2-to-4-seconds checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_LETTERS_PER_SECOND, blankScene, cutPush, quietGaps, readingIssues, readingNeed, type MotionScene } from "../shared/motion.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { arrangeScenes, motionBeats } from "../src/lib/motionProject.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("short labels and ordinary lines keep the word rule", () => {
  // 1-3 word labels: 0.8 s.
  for (const label of ["Se lava", "Antes", "Lo que falta", "Mirá el link", "Abrí Stock", "3 minutos", "Precio [VERIFY]"]) close(readingNeed(label), 0.8);
  // Sentences: 0.3 s per word, at least 1.2 s.
  close(readingNeed("Stock en el celular"), 1.2);
  close(readingNeed("Pedí antes del corte"), 1.2);
  close(readingNeed("El proveedor corta a las seis."), 1.8);
  close(readingNeed("¿Sentís el frío que entra por abajo de la puerta?"), 3);
  close(readingNeed("Una frase bastante larga para leer en tan poco tiempo de pantalla"), 3.6);
});

test("long words take longer than their word count says", () => {
  // Two words, 25 letters: a label by count, a sentence to read (25 / 15 s, to the tenth).
  assert.equal(READ_LETTERS_PER_SECOND, 15);
  close(readingNeed("Planificación automatizada"), 1.7);
  // Three words of 19 letters: more than a label's 0.8 s.
  close(readingNeed("Para cualquier puerta"), 1.3);
  close(readingNeed("Buscar producto"), 0.9);
  // Four long words go past the sentence minimum.
  close(readingNeed("Reabastecimiento automático garantizado siempre"), 2.9);
  // Spaces and punctuation are free; digits count.
  close(readingNeed("¡Planificación,   automatizada!"), readingNeed("Planificación automatizada"));
  close(readingNeed("1234567890123456789012345"), 1.7);
  // The minimums never go down.
  close(readingNeed("Ya"), 0.8);
  close(readingNeed("a b c d"), 1.2);
});

test("a long-word label that a short one would get away with is flagged", () => {
  // A callout label enters at 0.6 s and is in at 1.1 s: a 2 s scene leaves it 0.9 s.
  const scene = (label: string): MotionScene => ({ ...blankScene("callouts"), seconds: 2, title: "", items: [label] });
  const flagged = (label: string) => readingIssues([scene(label)], 0).filter((r) => r.key === "item0");
  assert.equal(flagged("Se lava").length, 0);
  const long = flagged("Planificación automatizada");
  assert.equal(long.length, 1);
  close(long[0].needs, readingNeed("Planificación automatizada"));
});

test("the sample explainers still read in time and never go still", () => {
  // IMAN (a host and real screens), Máshogar (e-commerce) and a new series with nothing in its cast yet.
  for (const series of ["iman", "masogar", "serie-nueva"]) {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      for (const narrator of ["with", "without"] as const) {
        const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone, narrator }, null);
        const push = cutPush(script.tone);
        for (const music of ["synth", "none"] as const) {
          for (const snap of [true, false]) {
            const scenes = arrangeScenes(script, motionBeats(script, music, null), snap, music, null);
            const where = `${series} ${tone} ${narrator} ${music} ${snap ? "snap" : "free"}`;
            assert.deepEqual(readingIssues(scenes, push).map((r) => `${r.index}:${r.key}`), [], where);
            assert.deepEqual(quietGaps(scenes, push), [], where);
          }
        }
      }
    }
  }
});
