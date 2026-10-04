// Lyric videos (series of type "music"): the song's lines with their times, how they look, and the helpers that
// split, sync and retime them. Lyrics can be in any language: Spanish, Guaraní, Japanese, Korean or romanized.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const LYRIC_FONTS = ["sans", "serif", "display"] as const;
export type LyricFont = (typeof LYRIC_FONTS)[number];
export const LYRIC_FONT_LABEL: Record<LyricFont, string> = { sans: "Sans", serif: "Serif", display: "Display" };
// Noto Sans JP/KR come after each font so Japanese and Korean always have glyphs.
// Noto Sans fills Latin gaps (Guaraní's ã, g̃) when the display face lacks them. JP/KR follow for those scripts.
const CJK = `"Noto Sans", "Noto Sans JP", "Noto Sans KR", "Hiragino Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
export const LYRIC_FONT_FAMILY: Record<LyricFont, string> = {
  sans: `"IBM Plex Sans", ${CJK}`,
  serif: `"Fraunces", Georgia, "Noto Serif JP", ${CJK}`,
  display: `"Bebas Neue", Impact, ${CJK}`,
};

export const LyricStyleSchema = z.object({
  // organic: moving colour fields drawn by the app. media: the piece's own photo or video. layers: Grok's separated
  // layers, moving by depth (parallax).
  background: z.enum(["organic", "media", "layers"]),
  palette: z.array(hex).length(3),
  mood: z.enum(["calm", "lively"]),
  // The background swells on each beat of the song.
  pulse: z.boolean(),
  font: z.enum(LYRIC_FONTS),
  // Percent of the default size.
  size: z.number().min(50).max(200),
  textColor: hex,
  highlightColor: hex,
  position: z.enum(["center", "lower"]),
  // The word being sung lights up.
  karaoke: z.boolean(),
  entrance: z.enum(["fade", "slide", "pop"]),
  // Words marked as key are drawn bigger, in the highlight colour.
  keywords: z.boolean(),
});
export type LyricStyle = z.infer<typeof LyricStyleSchema>;

export const DEFAULT_LYRIC_STYLE: LyricStyle = {
  background: "organic",
  palette: ["#1d3b53", "#e07a5f", "#81b29a"],
  mood: "calm",
  pulse: true,
  font: "sans",
  size: 100,
  textColor: "#ffffff",
  highlightColor: "#ffd166",
  position: "center",
  karaoke: true,
  // Not "fade": the studio's rules ban everything fading in.
  entrance: "slide",
  keywords: true,
};

// The language of the lyrics. It picks how the transcription listens; "auto" lets it guess.
export const LYRIC_LANGUAGES = ["es", "gn", "ja", "ko", "en", "auto"] as const;
export type LyricLanguage = (typeof LYRIC_LANGUAGES)[number];
export const LYRIC_LANGUAGE_LABEL: Record<LyricLanguage, string> = {
  es: "Español",
  gn: "Guaraní",
  ja: "Japonés",
  ko: "Coreano",
  en: "Inglés",
  auto: "Otro / mezcla",
};

// Where a translation of the second line can land. "auto" stays a source-lyric option only; "otro" is a language the
// person types (`secondOther`).
export const SECOND_LANGUAGES = ["es", "gn", "en", "pt", "ja", "ko", "fr", "it", "otro"] as const;
export type SecondLanguage = (typeof SECOND_LANGUAGES)[number];
export const SECOND_LANGUAGE_LABEL: Record<SecondLanguage, string> = {
  es: "Español",
  gn: "Guaraní",
  en: "Inglés",
  pt: "Portugués",
  ja: "Japonés",
  ko: "Coreano",
  fr: "Francés",
  it: "Italiano",
  otro: "Otro…",
};

// Graphics on a lyric line. The app draws the motif; a pasted picture replaces it (same canvas, never cropped).
export const LYRIC_MOTIFS = ["word", "circle", "ring", "star", "heart", "note"] as const;
export type LyricMotif = (typeof LYRIC_MOTIFS)[number];
export const LYRIC_MOTIF_LABEL: Record<LyricMotif, string> = {
  word: "Palabra",
  circle: "Círculo",
  ring: "Aro",
  star: "Estrella",
  heart: "Corazón",
  note: "Nota",
};
export const LYRIC_MOTIONS = ["enter", "pulse", "hold", "leave"] as const;
export type LyricMotion = (typeof LYRIC_MOTIONS)[number];
export const LYRIC_MOTION_LABEL: Record<LyricMotion, string> = {
  enter: "Entra",
  pulse: "Late",
  hold: "Se queda",
  leave: "Se va",
};
export const LYRIC_PLACES = ["top", "left", "right"] as const;
export type LyricPlace = (typeof LYRIC_PLACES)[number];
export const LYRIC_PLACE_LABEL: Record<LyricPlace, string> = {
  top: "Arriba",
  left: "Izquierda",
  right: "Derecha",
};
// Project media slots for pasted pictures. Background clips use 0–3 and Grok's layers use 200+.
export const LYRIC_ELEMENT_SLOT = 300;
export const LYRIC_ELEMENT_SLOTS = 12;

export type LyricElement = {
  id: string;
  label: string;
  motif: LyricMotif;
  motion: LyricMotion;
  place: LyricPlace;
  line: number;
  seconds: number;
  // 0 until a picture is pasted; then a slot at LYRIC_ELEMENT_SLOT or above.
  slot: number;
};

export type LyricWord = { text: string; start: number; end: number; key: boolean; gap: boolean };
export type LyricLine = {
  text: string;
  // An optional smaller line under it: the romanization or a translation.
  second: string;
  start: number;
  end: number;
  words: LyricWord[];
};

export type LyricPiece = {
  title: string;
  artist: string;
  // The person confirmed the song is theirs or licensed.
  rights: boolean;
  language: LyricLanguage;
  // The lyrics as pasted, one line per line.
  text: string;
  // The romanization or translation as pasted, line by line with the lyrics.
  secondText: string;
  // Language the translation button writes into.
  secondLanguage: SecondLanguage;
  // The language typed when secondLanguage is "otro".
  secondOther: string;
  lines: LyricLine[];
  // Graphics timed to a line. Empty on pieces saved before the Elementos tab.
  elements: LyricElement[];
  synced: "none" | "auto" | "tap" | "lrc";
  style: LyricStyle;
  format: "vertical" | "horizontal";
  // Seconds of the song that go into the video; `to` 0 means the end.
  from: number;
  to: number;
  credit: boolean;
  // Fit the own video or photo whole (never crop a tool's watermark).
  fullFrame: boolean;
  // Say on screen that the own background was made with AI.
  aiBackground: boolean;
  // How many of Grok's layers the piece has (project media slots 200 + n), back to front.
  layers: number;
};

export function newLyricPiece(style: LyricStyle, format: "vertical" | "horizontal"): LyricPiece {
  return {
    title: "",
    artist: "",
    rights: false,
    language: "es",
    text: "",
    secondText: "",
    secondLanguage: "es",
    secondOther: "",
    lines: [],
    elements: [],
    synced: "none",
    style,
    format,
    from: 0,
    to: 0,
    credit: true,
    fullFrame: true,
    aiBackground: true,
    layers: 0,
  };
}

// A section header as lyric sites write it: "Chorus (Hatsune Miku):", "Verse 2", "Estribillo:". Only the label, a
// number and who sings it, so a sung line that starts with one of these words ("Bridge over the river") stays.
const SECTION =
  /^(?:pre-?|post-?)?(?:chorus|verse|bridge|refrain|interlude|intro|outro|hook|break|breakdown|drop|coda|instrumental|ad-?libs?|estribillo|coro|precoro|verso|estrofa|puente|interludio|introducci[oó]n|final|parte)(?:\s*\d+)?(?:\s*[-–]\s*[^:()]{1,30})?(?:\s*\([^)]*\))?\s*:?$/i;

// Not sung: a blank line, a label like [Estribillo] or (repeated four times), or a section header like "Chorus:".
function skipped(line: string): boolean {
  return !line || /^\[[^\]]*\]$/.test(line) || /^\([^)]*\)$/.test(line) || SECTION.test(line);
}

// Lyric lines without blanks, labels or section headers.
export function splitLyrics(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !skipped(l));
}

// How many section headers ("Chorus (…):", "Verse 1") the lyrics have, so the studio can say it left them out.
export function sectionHeaders(text: string): number {
  return text.split("\n").filter((l) => SECTION.test(l.trim())).length;
}

const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

// The words of a line: spaces split them, except in Japanese (and Chinese), which has none and is split by word.
// Punctuation stays with the word before it. `gap` says whether a space follows.
export function splitWords(line: string): { text: string; gap: boolean }[] {
  if (!NO_SPACES.test(line) || typeof Intl.Segmenter === "undefined") {
    return line
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, gap: true }));
  }
  const out: { text: string; gap: boolean }[] = [];
  for (const s of new Intl.Segmenter("ja", { granularity: "word" }).segment(line)) {
    if (/^\s+$/.test(s.segment)) {
      if (out.length) out[out.length - 1].gap = true;
    } else if (!s.isWordLike && out.length) out[out.length - 1].text += s.segment;
    else out.push({ text: s.segment, gap: false });
  }
  return out;
}

// Spreads a line's words over its time by length (a sung word takes about as long as it has letters).
export function makeLine(text: string, second: string, start: number, end: number, keys: string[] = []): LyricLine {
  const parts = splitWords(text);
  const weights = parts.map((p) => [...p.text].length + 1);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let t = start;
  const words = parts.map((p, i) => {
    const d = ((end - start) * weights[i]) / sum;
    const word = { ...p, start: t, end: t + d, key: keys.includes(p.text) };
    t += d;
    return word;
  });
  return { text, second, start, end, words };
}

// Moves a line to new times, keeping where each word falls inside it.
export function retimeLine(line: LyricLine, start: number, end: number): LyricLine {
  const span = line.end - line.start || 1;
  const map = (t: number) => start + ((t - line.start) / span) * (end - start);
  return { ...line, start, end, words: line.words.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })) };
}

// Synced by hand: the person tapped when each line starts. A line lasts until the next one (at most 8 s).
export function tapLines(texts: string[], seconds: string[], starts: number[], songEnd: number): LyricLine[] {
  return texts.map((text, i) => {
    const start = starts[i] ?? (starts[i - 1] ?? 0) + 2;
    const next = starts[i + 1];
    const end = next !== undefined ? Math.max(start + 0.3, next - 0.05) : Math.min(start + 8, Math.max(songEnd, start + 1));
    return makeLine(text, seconds[i] ?? "", start, Math.min(end, start + 8));
  });
}

export type HeardWord = { word: string; start: number; end: number };

// Letters and digits only, lowercase and without accents, so "Ñandé," and "nande" compare equal.
function letters(text: string): string[] {
  return [
    ...text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
  ];
}

// Synced automatically: the transcription's timed words are matched to the pasted lyrics letter by letter
// (works for Japanese and Korean too, where words don't line up), and each lyric word takes the times of its
// matched letters. Words the transcription missed are placed between their neighbours.
export function alignLyrics(texts: string[], seconds: string[], heard: HeardWord[], songEnd: number): LyricLine[] {
  // Every heard letter with its time, spread evenly inside its word.
  const heardChars: { c: string; t: number }[] = [];
  for (const h of heard) {
    const cs = letters(h.word);
    cs.forEach((c, i) => heardChars.push({ c, t: h.start + ((h.end - h.start) * (i + 0.5)) / cs.length }));
  }
  const lines = texts.map((t, i) => makeLine(t, seconds[i] ?? "", 0, 0));
  const lyricChars: { c: string; line: number; word: number }[] = [];
  lines.forEach((l, li) => l.words.forEach((w, wi) => letters(w.text).forEach((c) => lyricChars.push({ c, line: li, word: wi }))));

  // Longest common subsequence of letters, with a byte table of moves (fine for a few thousand letters).
  const n = lyricChars.length;
  const m = heardChars.length;
  const matchTime: (number | undefined)[] = new Array(n);
  // Past this the table gets too big; the words are then spread evenly instead.
  if (n && m && n * m <= 60_000_000) {
    const moves = new Uint8Array((n + 1) * (m + 1));
    let prev = new Uint16Array(m + 1);
    let cur = new Uint16Array(m + 1);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (lyricChars[i - 1].c === heardChars[j - 1].c) {
          cur[j] = prev[j - 1] + 1;
          moves[i * (m + 1) + j] = 1;
        } else if (prev[j] >= cur[j - 1]) {
          cur[j] = prev[j];
          moves[i * (m + 1) + j] = 2;
        } else {
          cur[j] = cur[j - 1];
          moves[i * (m + 1) + j] = 3;
        }
      }
      [prev, cur] = [cur, prev];
      cur.fill(0);
    }
    for (let i = n, j = m; i > 0 && j > 0; ) {
      const move = moves[i * (m + 1) + j];
      if (move === 1) {
        matchTime[i - 1] = heardChars[j - 1].t;
        i--;
        j--;
      } else if (move === 2) i--;
      else j--;
    }
  }

  // Each word's time: from its first to its last matched letter.
  type Slot = { line: number; word: number; start?: number; end?: number };
  const slots: Slot[] = [];
  lines.forEach((l, li) => l.words.forEach((_, wi) => slots.push({ line: li, word: wi })));
  const slotOf = new Map(slots.map((s, i) => [`${s.line}:${s.word}`, i]));
  lyricChars.forEach((ch, i) => {
    const t = matchTime[i];
    if (t === undefined) return;
    const s = slots[slotOf.get(`${ch.line}:${ch.word}`)!];
    s.start = s.start === undefined ? t : Math.min(s.start, t);
    s.end = s.end === undefined ? t : Math.max(s.end, t);
  });
  // A word whose letters were matched far apart (stray letters) is not trusted; neither is time going backwards.
  let last = 0;
  for (const s of slots) {
    if (s.start === undefined) continue;
    const length = letters(lines[s.line].words[s.word].text).length;
    if (s.start < last || s.end! - s.start > 2 + 0.4 * length) {
      s.start = s.end = undefined;
      continue;
    }
    last = s.end!;
  }
  // Fill the gaps between known words.
  const known = slots.map((s, i) => (s.start !== undefined ? i : -1)).filter((i) => i >= 0);
  const PER_WORD = 0.35;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.start !== undefined) continue;
    const before = [...known].reverse().find((k) => k < i);
    const after = known.find((k) => k > i);
    if (before !== undefined && after !== undefined) {
      const from = slots[before].end!;
      const to = slots[after].start!;
      const step = (to - from) / (after - before);
      s.start = from + step * (i - before - 0.5);
      s.end = s.start + Math.max(step * 0.9, 0.05);
    } else if (after !== undefined) {
      s.start = Math.max(0, slots[after].start! - PER_WORD * (after - i));
      s.end = s.start + PER_WORD * 0.9;
    } else {
      const from = before !== undefined ? slots[before].end! : 0;
      s.start = Math.min(songEnd, from + PER_WORD * (i - (before ?? -1) - 1));
      s.end = Math.min(songEnd, s.start + PER_WORD * 0.9);
    }
  }
  // Words get a little length so the karaoke has something to fill.
  for (const s of slots) if (s.end! - s.start! < 0.12) s.end = s.start! + 0.12;
  slots.forEach((s) => {
    const w = lines[s.line].words[s.word];
    w.start = s.start!;
    w.end = s.end!;
  });
  return lines.map((l) => {
    if (!l.words.length) return l;
    return { ...l, start: l.words[0].start, end: l.words[l.words.length - 1].end + 0.25 };
  });
}

// The line on screen at a time, or -1.
export function lineAt(lines: LyricLine[], t: number): number {
  for (let i = lines.length - 1; i >= 0; i--) if (t >= lines[i].start) return t < lines[i].end ? i : -1;
  return -1;
}

export function markKeywords(lines: LyricLine[], keywords: { line: number; words: string[] }[]): LyricLine[] {
  return lines.map((l, i) => {
    const keys = keywords.find((k) => k.line === i)?.words ?? [];
    return { ...l, words: l.words.map((w) => ({ ...w, key: keys.some((k) => letters(k).join("") === letters(w.text).join("")) })) };
  });
}

function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// The synced lyrics as an .lrc file, also used for pieza.md.
export function toLrc(piece: LyricPiece): string {
  const head = [piece.title && `[ti:${piece.title}]`, piece.artist && `[ar:${piece.artist}]`].filter(Boolean);
  const body = piece.lines.flatMap((l) => [`[${clock(l.start)}]${l.text}`, ...(l.second ? [`[${clock(l.start)}]${l.second}`] : [])]);
  return [...head, ...body].join("\n");
}

// What the writer suggests for a lyric video: the background's colours and pace, and the words to stand out.
export const LyricIdeasSchema = z.object({
  palette: z
    .array(z.string())
    .describe("Exactly three colours as #rrggbb for the moving background, from the song's feeling: a dark base, a main colour, an accent."),
  mood: z.string().describe("calm or lively: how fast the background moves."),
  keywords: z
    .array(z.object({ line: z.number().int().describe("Line number, from 0."), words: z.array(z.string()) }))
    .describe("Lines that carry the feeling, each with one or two of its words copied exactly as written. Not every line."),
  note: z.string().describe("One sentence in Spanish (Rioplatense) on the look and why."),
});
export type LyricIdeas = z.infer<typeof LyricIdeasSchema>;

export const SecondLinesSchema = z.object({
  lines: z.array(z.string()).describe("One per lyric line, in the same order; the same count as the lyrics."),
  note: z.string().describe("In Spanish: anything the person should check (readings, words with more than one meaning). Empty if none."),
});

// What the writer proposes for the Elementos tab. Motif and motion arrive as plain strings and are coerced.
export const LyricElementsSchema = z.object({
  elements: z
    .array(
      z.object({
        label: z.string().describe("One to three words copied exactly from that lyric line."),
        motif: z.string().describe("word, circle, ring, star, heart or note."),
        motion: z.string().describe("enter, pulse, hold or leave."),
        place: z.string().describe("top, left or right."),
        line: z.number().describe("Line number, from 0."),
        seconds: z.number().describe("How long it stays, between 1.5 and 4."),
      }),
    )
    .describe("Three to six graphics. Not every line."),
  note: z.string().describe("One sentence in Spanish (Rioplatense) on why these."),
});
export type LyricElements = z.infer<typeof LyricElementsSchema>;

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const v = value.trim().toLowerCase();
  if ((allowed as readonly string[]).includes(v)) return v as T;
  const word = allowed.find((a) => v.split(/[^a-z]+/).includes(a));
  return word ?? fallback;
}

// Drops graphics that point at no line, and keeps at most six.
export function cleanElements(raw: { elements: { label: string; motif: string; motion: string; place: string; line: number; seconds: number }[] }, lineCount: number): Omit<LyricElement, "id" | "slot">[] {
  const out: Omit<LyricElement, "id" | "slot">[] = [];
  for (const e of raw.elements ?? []) {
    if (out.length >= 6) break;
    const line = Math.round(e.line);
    if (!Number.isFinite(line) || line < 0 || line >= lineCount) continue;
    const seconds = Number.isFinite(e.seconds) ? Math.min(6, Math.max(0.8, e.seconds)) : 2.5;
    const label = e.label.replace(/\s+/g, " ").trim().slice(0, 40);
    out.push({
      label: label || "texto",
      motif: pick(e.motif, LYRIC_MOTIFS, "word"),
      motion: pick(e.motion, LYRIC_MOTIONS, "enter"),
      place: pick(e.place, LYRIC_PLACES, "top"),
      line,
      seconds,
    });
  }
  return out;
}

// When a graphic is on screen: from the start of its line, for its own length.
export function elementWindow(element: LyricElement, lines: { start: number }[]): { start: number; end: number } | null {
  const line = lines[element.line];
  if (!line || !Number.isFinite(line.start)) return null;
  const seconds = Math.min(8, Math.max(0.4, element.seconds));
  return { start: line.start, end: line.start + seconds };
}

export function cleanIdeas(ideas: LyricIdeas, fallback: LyricStyle): Pick<LyricStyle, "palette" | "mood"> {
  const palette = ideas.palette.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
  return {
    palette: palette.length === 3 ? palette : fallback.palette,
    mood: ideas.mood.toLowerCase().includes("live") ? "lively" : "calm",
  };
}

// An .lrc file: [mm:ss.xx]line, with [ti:]/[ar:] tags. A line can carry several times (a repeated chorus), and two
// lines at the same time are the lyric and its second line (this app's own export). Word times <mm:ss.xx> are dropped.
export function parseLrc(text: string): { title: string; artist: string; texts: string[]; seconds: string[]; starts: number[] } {
  const tag = (name: string) => text.match(new RegExp(`^\\[${name}:([^\\]]*)\\]`, "im"))?.[1].trim() ?? "";
  const entries: { t: number; text: string; order: number }[] = [];
  text.split("\n").forEach((raw, order) => {
    const times = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!times.length) return;
    const words = raw
      .replace(/\[[^\]]*\]/g, "")
      .replace(/<\d+:\d+(?:[.:]\d+)?>/g, "")
      .trim();
    if (!words) return;
    for (const m of times) entries.push({ t: Number(m[1]) * 60 + Number(m[2].replace(":", ".")), text: words, order });
  });
  entries.sort((a, b) => a.t - b.t || a.order - b.order);
  const texts: string[] = [];
  const seconds: string[] = [];
  const starts: number[] = [];
  for (const e of entries) {
    if (starts.length && Math.abs(starts[starts.length - 1] - e.t) < 0.005 && !seconds[seconds.length - 1]) {
      seconds[seconds.length - 1] = e.text;
      continue;
    }
    texts.push(e.text);
    seconds.push("");
    starts.push(e.t);
  }
  return { title: tag("ti"), artist: tag("ar"), texts, seconds, starts };
}

// Prompts for background clips the person makes in Grok and uploads: abstract, organic, loopable, no people or text.
export const BackgroundPromptsSchema = z.object({
  prompts: z
    .array(
      z.object({
        title: z.string().describe("A few words in Spanish naming the clip and the part of the song it suits."),
        image: z.string().describe("The first frame, in English, in the tool's format: one frozen moment."),
        video: z.string().describe("The motion, in English: slow, continuous, loopable; no cuts."),
        seconds: z.number().describe("6, 10 or 15."),
      }),
    )
    .describe("Three background clips: one for the verses, one for the chorus, one for the bridge or the end."),
  note: z.string().describe("One sentence in Spanish on how they fit the song."),
});
export type BackgroundPrompts = z.infer<typeof BackgroundPromptsSchema>;
