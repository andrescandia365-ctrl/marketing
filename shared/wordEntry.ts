// "Entrar con la palabra" (explainers, idea 62): an element whose words the scene's voice says (a title, a label, an
// item, a number) enters when the voice says them, on the word times the subtitles use (heard by whisper-1 while they
// still fit the line and the file, else estimated). The word wins over the beat (snapElements leaves it alone); a
// time set by hand wins over both; an element whose words are not said keeps its own timing. Pure: the drawing, the
// sound and every check read the arranged copy's `onWord`, never saved. The word never costs reading time: an entrance
// that would leave a line on screen too briefly to read, or the scene still for too long, keeps its own timing
// (readableOnWords).
import { elementTimes, itemsOf, noticeParts, quietGaps, readingIssues, sceneElements, timeScenes, type MotionScene } from "./motion.ts";
import { plainWord, subtitleWords, voiceWordSpans, type HeardWordTimes } from "./subtitles.ts";

// On only when the piece says so: new pieces start with it on, older ones have none and do not change.
export const enterOnWordOn = (piece: { enterOnWord?: boolean }) => piece.enterOnWord === true;

// Small numbers written as words, so "3 pedidos" on screen meets "tres pedidos" in the voice.
const NUMBER_WORDS: Record<string, string> = {
  "0": "cero",
  "1": "uno",
  "2": "dos",
  "3": "tres",
  "4": "cuatro",
  "5": "cinco",
  "6": "seis",
  "7": "siete",
  "8": "ocho",
  "9": "nueve",
  "10": "diez",
  "11": "once",
  "12": "doce",
  "13": "trece",
  "14": "catorce",
  "15": "quince",
  "16": "dieciseis",
  "17": "diecisiete",
  "18": "dieciocho",
  "19": "diecinueve",
  "20": "veinte",
  "30": "treinta",
  "40": "cuarenta",
  "50": "cincuenta",
  "60": "sesenta",
  "70": "setenta",
  "80": "ochenta",
  "90": "noventa",
  "100": "cien",
};
const ONE = new Set(["un", "una"]);

// Words that never name an element on their own (articles, prepositions, conjunctions, pronouns).
const FILLER = new Set(
  (
    "el la los las un una unos unas lo le les de del al a y e o u ni en con sin por para que se su sus tu tus mi mis " +
    "me te nos yo vos es no si ya mas muy tan pero esto eso este esta the an of and to in on is it"
  ).split(" "),
);
const meaningful = (word: string) => {
  const plain = plainWord(word);
  return Boolean(plain) && !FILLER.has(plain);
};

// A word as compared: letters and digits, no accents or case; a small number and its written word are the same.
export function wordKey(word: string): string {
  const plain = plainWord(word);
  if (ONE.has(plain)) return "uno";
  return NUMBER_WORDS[plain] ?? plain;
}

// Two compared words are the same word: equal, or one is the other's plural (at least 4 letters).
export function sameWord(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 4 && (long === `${short}s` || long === `${short}es`);
}

// Where the voice says an element's words: the first voice word's index and how many voice words it takes, or null.
// The whole text said in a row (a text longer than four words: its first three, or up to its first word that carries
// meaning); else, for a short text, the earliest of its meaningful words (not an article, a preposition or a pronoun)
// that the voice says. A run of filler words alone never names anything. Voice words in `taken` are another element's.
export function findSaid(text: string, voiceWords: string[], taken: Set<number> = new Set()): { index: number; count: number } | null {
  const written = subtitleWords(text).filter((w) => plainWord(w));
  const said = voiceWords.map(wordKey);
  if (!written.length) return null;
  const firstMeaning = written.findIndex(meaningful);
  if (firstMeaning < 0) return null;
  const phrase = (written.length > 4 ? written.slice(0, Math.max(3, firstMeaning + 1)) : written).map(wordKey);
  for (let i = 0; i + phrase.length <= said.length; i++) {
    if (phrase.every((w, k) => !taken.has(i + k) && sameWord(w, said[i + k]))) return { index: i, count: phrase.length };
  }
  if (written.length > 4) return null;
  const keys = written.filter(meaningful).map(wordKey);
  const at = said.findIndex((w, i) => !taken.has(i) && keys.some((k) => sameWord(k, w)));
  return at >= 0 ? { index: at, count: 1 } : null;
}

// The words an element shows, by its key (none for pictures, moves and the voice).
export function elementText(scene: MotionScene, key: string): string {
  if (key === "title") return scene.title;
  if (key === "text") return scene.text;
  const item = /^item(\d+)$/.exec(key);
  if (item) {
    const i = Number(item[1]);
    if (scene.template === "notify") return noticeParts(itemsOf(scene)[i] ?? "").title;
    if (scene.template === "flow" || scene.template === "slots") return itemsOf(scene)[i] ?? "";
    return scene.items[i] ?? "";
  }
  if (key === "tag") return scene.template === "type" ? (scene.items[1] ?? "") : (scene.items[0] ?? "");
  return "";
}

export type WordEntryInput = {
  // Each voice file's length by scene id (none: no file).
  voiceSeconds: Record<string, number | undefined>;
  heard?: Record<string, HeardWordTimes>;
};

// Each scene's elements that the voice names, put on the start of the word that names them (scene time). Elements
// set by hand are left alone; a word said too late for the element to be seen (past 0.3 s before the cut) changes
// nothing. In template order, each voice word names one element at most. Returns scenes with `onWord` (never saved).
export function enterOnWords(scenes: MotionScene[], input: WordEntryInput): MotionScene[] {
  return scenes.map((scene) => {
    const voiceWords = subtitleWords(scene.voice);
    if (!voiceWords.length || scene.template === "code") return scene;
    const mark = elementTimes(scene).voice ?? 0.25;
    const spans = voiceWordSpans(scene, mark, input.voiceSeconds[scene.id], input.heard?.[scene.id]);
    const taken = new Set<number>();
    const onWord: Record<string, number> = {};
    const elements = sceneElements(scene)
      .filter((e) => e.lane !== "voice" && e.lane !== "moves" && e.lane !== "media" && scene.tweaks?.[e.key]?.at === undefined)
      .sort((a, b) => a.at - b.at);
    for (const e of elements) {
      const text = elementText(scene, e.key).trim();
      if (!text) continue;
      const found = findSaid(text, voiceWords, taken);
      const span = found && spans[found.index];
      if (!found || !span) continue;
      const at = Math.round((mark + span[0]) * 1000) / 1000;
      if (at < 0 || at > scene.seconds - 0.3) continue;
      for (let k = 0; k < found.count; k++) taken.add(found.index + k);
      onWord[e.key] = at;
    }
    return Object.keys(onWord).length ? { ...scene, onWord } : scene;
  });
}

// Issues by scene index: the lines too briefly on screen to read (by element key) and the still stretches.
function sceneTrouble(scenes: MotionScene[], push: number): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (i: number, what: string) => out.set(i, [...(out.get(i) ?? []), what]);
  for (const r of readingIssues(scenes, push)) add(r.index, r.key);
  const timed = timeScenes(scenes);
  for (const g of quietGaps(scenes, push)) {
    const s = timed.find((x) => g.from >= x.start - 1e-6 && g.from < x.end) ?? timed.at(-1);
    if (s) add(s.index, `gap:${Math.round(g.from * 1000)}`);
  }
  return out;
}

// The word never costs reading time. `said`: the scenes with their words (enterOnWords); `arrange`: the rest of the
// arrangement (the beat snap of the other elements). Where the arranged result has a reading or still-gap problem the
// same scenes without words did not have, that scene's word entrances are given up, the one the problem names first,
// else its latest, until nothing new is wrong. Returns the arranged scenes.
export function readableOnWords(
  said: MotionScene[],
  push: number,
  arrange: (scenes: MotionScene[]) => MotionScene[] = (x) => x,
): MotionScene[] {
  const plain = arrange(said.map(({ onWord: _onWord, ...s }) => s));
  const before = sceneTrouble(plain, push);
  let current = said;
  for (let round = 0; round < 64; round++) {
    const arranged = arrange(current);
    const fresh = [...sceneTrouble(arranged, push)]
      .map(([i, list]) => [i, list.filter((what) => !(before.get(i) ?? []).includes(what))] as const)
      .filter(([i, list]) => list.length && current[i]?.onWord);
    if (!fresh.length) return arranged;
    current = current.map((s, i) => {
      const found = fresh.find(([k]) => k === i);
      if (!found || !s.onWord) return s;
      const named = found[1].find((what) => what in s.onWord!);
      const drop = named ?? Object.entries(s.onWord).sort((a, b) => b[1] - a[1])[0][0];
      const { [drop]: _gone, ...rest } = s.onWord;
      if (Object.keys(rest).length) return { ...s, onWord: rest };
      const { onWord: _onWord, ...bare } = s;
      return bare;
    });
  }
  return arrange(current.map(({ onWord: _onWord, ...s }) => s));
}
