// The explainer's subtitles, word by word: when each written word of a scene's voice is said, the chunks the line is
// shown in, the cues on the piece's clock, and the same cues as an .srt file. Pure: the studio, the render page, the
// contact sheet and render.mjs's .srt all read what these return, so the subtitle on screen and the file agree.
import { elementTimes, type MotionScene, type TimedScene } from "./motion.ts";

// A word's time in seconds from the start of its voice: [start, end].
export type WordSpan = [number, number];

// Word times heard in a scene's voice file (whisper-1, aligned to the written words). Kept with the piece so the render
// page uses the same times. `text` and `seconds` say which line and which file they belong to: when either changed,
// the times are stale and the estimate takes over (wordTimesFresh).
export type HeardWordTimes = { text: string; seconds: number; times: WordSpan[]; matched: number };

// A word as the transcription returns it.
export type HeardWord = { word: string; start: number; end: number };

// The voice's words as written (split on spaces; punctuation stays with its word).
export const subtitleWords = (text: string): string[] => text.split(/\s+/).filter(Boolean);

// Letters and digits only, lowercase and without accents: "¿Pedís?" and "pedis" compare equal.
export function plainWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const letterCount = (word: string) => plainWord(word).length;
const pauseAfter = (word: string): number => (/[.!?…]["»”)]*$/.test(word) ? 3 : /[,;:—–]["»”)]*$/.test(word) ? 1.5 : 0);

// Speaking pace when there is no voice file (the same 2.5 words a second the mouths and the timeline use).
export const SPOKEN_WORDS_PER_SECOND = 2.5;

// Word times with no transcription: the voice's length (or the spoken estimate) shared by letters, with a short
// breath after a comma and a longer one after a full stop. Every word gets at least one letter's share, so a number
// or a dash is never instant. Contiguous and in order, ending on `span`.
export function estimateWordTimes(words: string[], span: number): WordSpan[] {
  if (!words.length) return [];
  const weights = words.map((w) => Math.max(1, letterCount(w)) + 0.6);
  const pauses = words.map((w, i) => (i < words.length - 1 ? pauseAfter(w) : 0));
  const sum = weights.reduce((n, x) => n + x, 0) + pauses.reduce((n, x) => n + x, 0);
  const k = Math.max(0, span) / sum;
  const out: WordSpan[] = [];
  let at = 0;
  words.forEach((_, i) => {
    const end = at + weights[i] * k;
    out.push([round(at), round(end)]);
    at = end + pauses[i] * k;
  });
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

// How alike two plain words are (0..1): 1 minus the edit distance over the longer one.
function likeness(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// Matches the written words to the heard ones in order (the most and best matches, a word with a word at least 60 %
// alike), then gives each written word its time: a matched word keeps the heard time; a run of unmatched words
// ("24" said "veinticuatro", a word it misheard) shares the gap between its matched neighbours by letters. Before the
// first match the run ends on it; after the last it runs to the end of what was heard (or the voice's length).
// Null when nothing matched: the estimate is better than a guess. `matched`: how many written words were heard.
export function alignWordTimes(written: string[], heard: HeardWord[], seconds = 0): { times: WordSpan[]; matched: number } | null {
  const a = written.map(plainWord);
  const b = heard.map((h) => plainWord(h.word));
  const n = a.length;
  const m = b.length;
  if (!n || !m) return null;
  // score[i][j]: the best alignment of a[i..] with b[j..].
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const like = likeness(a[i], b[j]);
      const take = like >= 0.6 ? 1 + like + score[i + 1][j + 1] : -Infinity;
      score[i][j] = Math.max(take, score[i + 1][j], score[i][j + 1]);
    }
  }
  const pair: (number | null)[] = Array(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const like = likeness(a[i], b[j]);
    if (like >= 0.6 && Math.abs(score[i][j] - (1 + like + score[i + 1][j + 1])) < 1e-9) {
      pair[i++] = j++;
    } else if (score[i + 1][j] >= score[i][j + 1]) i++;
    else j++;
  }
  const matched = pair.filter((p) => p !== null).length;
  if (!matched) return null;
  const heardEnd = Math.max(...heard.map((h) => h.end));
  const end = Math.max(heardEnd, Math.min(seconds || heardEnd, heardEnd + 0.6));
  const times: (WordSpan | null)[] = pair.map((p) => (p === null ? null : [round(heard[p].start), round(Math.max(heard[p].start, heard[p].end))]));
  for (let k = 0; k < n; ) {
    if (times[k]) {
      k++;
      continue;
    }
    let stop = k;
    while (stop < n && !times[stop]) stop++;
    const words = written.slice(k, stop);
    // What the run would take at the spoken pace, at least: a run with no room of its own is never instant.
    const need = (words.length / SPOKEN_WORDS_PER_SECOND) * 0.5;
    let from = k > 0 ? times[k - 1]![1] : Math.min(...heard.map((h) => h.start), times[stop]?.[0] ?? Infinity);
    let to = stop < n ? times[stop]![0] : end;
    if (to - from < need) {
      if (k === 0) from = Math.max(0, to - need);
      else if (stop === n) to = from + need;
      else {
        // Squeezed between two heard words: it takes the second half of the one before.
        const prev = times[k - 1]!;
        from = Math.min(from, round((prev[0] + prev[1]) / 2));
        times[k - 1] = [prev[0], from];
      }
    }
    from = Math.max(0, from);
    const run = estimateWordTimes(words, Math.max(0, to - from));
    run.forEach(([s, e], r) => (times[k + r] = [round(from + s), round(from + e)]));
    k = stop;
  }
  return { times: times as WordSpan[], matched };
}

// The heard times still belong to this line and this voice file.
export function wordTimesFresh(stored: HeardWordTimes | undefined, voice: string, seconds: number | undefined): stored is HeardWordTimes {
  return Boolean(
    stored &&
      seconds !== undefined &&
      Array.isArray(stored.times) &&
      stored.text === voice.trim() &&
      Math.abs(stored.seconds - seconds) < 0.05 &&
      stored.times.length === subtitleWords(voice).length,
  );
}

// A scene's word times from its voice start: heard when fresh, else estimated from the voice file's length, or from
// the spoken pace with no file.
export function sceneWordTimes(scene: Pick<MotionScene, "voice">, voiceSeconds: number | undefined, stored?: HeardWordTimes): WordSpan[] {
  const words = subtitleWords(scene.voice);
  if (wordTimesFresh(stored, scene.voice, voiceSeconds)) return stored.times;
  return estimateWordTimes(words, voiceSeconds ?? words.length / SPOKEN_WORDS_PER_SECOND);
}

// Subtitle lines: at most 37 characters (inside the 42 subtitle guides allow, and two of them fit the 9:16 band at the
// subtitle's size), at most two lines a chunk.
export const SUB_LINE = 37;
export const SUB_LINES = 2;

// Splits the words into lines (word indices) of at most `max` characters; a word longer than that is a line of its own.
export function breakLines(words: string[], max = SUB_LINE): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let length = 0;
  words.forEach((w, i) => {
    const next = line.length ? length + 1 + w.length : w.length;
    if (line.length && next > max) {
      lines.push(line);
      line = [i];
      length = w.length;
    } else {
      line.push(i);
      length = next;
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

// The chunks a long line is shown in, each at most two lines: word indices [from, to). A new chunk starts after a
// sentence ends when the chunk already has a few words, so a chunk rarely starts mid-sentence.
export function subtitleChunks(words: string[], max = SUB_LINE, lines = SUB_LINES): [number, number][] {
  const chunks: [number, number][] = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const tooLong = breakLines(words.slice(from, i + 1), max).length > lines;
    if (tooLong && i > from) {
      chunks.push([from, i]);
      from = i;
    }
    if (/[.!?…]["»”)]*$/.test(words[i]) && i + 1 - from >= 4 && i < words.length - 1) {
      chunks.push([from, i + 1]);
      from = i + 1;
    }
  }
  if (from < words.length) chunks.push([from, words.length]);
  return chunks;
}

// One subtitle on the piece's clock. `words` carry their absolute times (clamped to the scene); `karaoke`: the word
// being said is lit and the rest dimmer. `lines`: the .srt's line breaks (indices into `words`).
export type SubtitleCue = {
  sceneId: string;
  start: number;
  end: number;
  words: { text: string; start: number; end: number }[];
  lines: number[][];
  karaoke: boolean;
};

// "Palabra por palabra": on unless the person turned it off (pieces saved before it existed count as on).
export const wordByWordOn = (piece: { wordByWord?: boolean }) => piece.wordByWord !== false;

// The cues of the whole piece. `voiceSeconds`: each voice file's length by scene id (none: no file, or no voice). A
// scene's voice starts at its voice mark; the first chunk is on from the scene's start,
// each next one from its first word, and the last stays to the cut. Nothing outlives its scene: the mix fades a voice
// that runs past the cut (80 ms), and the words it cuts off are not shown. Off ("Palabra por palabra" off), the scene's
// whole line is one cue all through the scene, as before.
export function subtitleCues(
  scenes: TimedScene[],
  options: { karaoke: boolean; voiceSeconds: Record<string, number | undefined>; heard?: Record<string, HeardWordTimes> },
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const s of scenes) {
    const text = subtitleWords(s.voice);
    if (!text.length || s.end <= s.start) continue;
    const mark = elementTimes(s).voice ?? 0.25;
    const at = s.start + mark;
    const known = options.voiceSeconds[s.id];
    // With no voice file nothing is cut off at the cut: the estimate fits the line into its scene.
    const spans =
      known === undefined
        ? estimateWordTimes(text, Math.max(0.1, Math.min(text.length / SPOKEN_WORDS_PER_SECOND, s.seconds - mark - 0.1)))
        : sceneWordTimes(s, known, options.heard?.[s.id]);
    const clamp = (x: number) => Math.min(s.end, Math.max(s.start, x));
    const words = text.map((w, i) => ({ text: w, start: round(clamp(at + spans[i][0])), end: round(clamp(at + spans[i][1])) }));
    if (!options.karaoke) {
      cues.push({ sceneId: s.id, start: s.start, end: s.end, words, lines: breakLines(text, 42), karaoke: false });
      continue;
    }
    const chunks = subtitleChunks(text).filter(([from], k) => k === 0 || words[from].start < s.end - 0.05);
    chunks.forEach(([from, to], k) => {
      const start = k === 0 ? s.start : words[from].start;
      const end = k === chunks.length - 1 ? s.end : words[chunks[k + 1][0]].start;
      const own = words.slice(from, to);
      cues.push({ sceneId: s.id, start, end, words: own, lines: breakLines(own.map((w) => w.text)), karaoke: true });
    });
  }
  return cues;
}

// The cue on screen at piece time t in the scene on screen: the last of its cues that has begun.
export function cueAt(cues: SubtitleCue[], sceneId: string, t: number): SubtitleCue | null {
  let found: SubtitleCue | null = null;
  for (const c of cues) if (c.sceneId === sceneId && c.start <= t + 1e-9) found = c;
  return found;
}

// The word being said at t (its index in the cue), or -1: none yet, or the cue's words are all said. A word stays lit
// through the pause after it, until the next one starts; after the last word it stays lit a moment, then all are full.
export const LIT_AFTER = 0.25;
export function litWord(cue: SubtitleCue, t: number): number {
  if (!cue.karaoke) return -1;
  let lit = -1;
  cue.words.forEach((w, i) => {
    if (w.start <= t + 1e-9) lit = i;
  });
  if (lit < 0) return -1;
  if (lit === cue.words.length - 1 && t > cue.words[lit].end + LIT_AFTER) return -1;
  return lit;
}

// HH:MM:SS,mmm
export function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (x: number, n = 2) => String(x).padStart(n, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

// The cues as an .srt file: numbered from 1, a blank line between cues, CRLF line ends (what players expect), each
// cue at most its lines (37 characters word by word, 42 with the whole line). Cues shorter than a frame are left out.
export function toSrt(cues: SubtitleCue[]): string {
  const blocks = cues
    .filter((c) => c.end - c.start >= 0.034 && c.words.length)
    .map((c, k) => [String(k + 1), `${srtTime(c.start)} --> ${srtTime(c.end)}`, ...c.lines.map((l) => l.map((i) => c.words[i].text).join(" "))].join("\r\n"));
  return blocks.length ? `${blocks.join("\r\n\r\n")}\r\n` : "";
}
