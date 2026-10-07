// Plates for a code-drawn lyric video. A plate is one stretch of the song: one look, one motif.
// The lyric still lights on the word. A cut lands on a downbeat only when the Reloj has one.
import { z } from "zod";
import { lyricBlocks, PLATE_LOOKS, type LyricBlock, type LyricPlate, type PlateLook } from "./lyrics.ts";

const MAX_PLATES = 10;

function clip(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function pickLook(value: string): PlateLook {
  const v = value.trim().toLowerCase();
  if ((PLATE_LOOKS as readonly string[]).includes(v)) return v as PlateLook;
  const word = PLATE_LOOKS.find((look) => v.split(/[^a-z]+/).includes(look));
  return word ?? "type";
}

function plateId(from: number): string {
  return `p${from}`;
}

// A chorus can hold more lines than a verse. The same image has to be recognisable.
function chunkSize(title: string): number {
  return /coro|chorus|estribillo|hook|refrain/i.test(title) ? 8 : 4;
}

function lookFor(title: string, index: number): PlateLook {
  const t = title.toLowerCase();
  if (/coro|chorus|estribillo|hook|refrain/.test(t)) return "stamp";
  if (/puente|bridge/.test(t)) return "count";
  if (/^intro/.test(t)) return "type";
  if (/final|outro|coda/.test(t)) return "stack";
  return (["margin", "type", "stack", "count"] as const)[index % 4];
}

function motifFor(title: string, line: string): string {
  const named = clip(title, 32);
  if (named) return named;
  const word = line
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .sort((a, b) => [...b].length - [...a].length)[0];
  return clip(word && [...word].length >= 3 ? word : "marca", 32);
}

function spansOf(block: LyricBlock): { from: number; to: number; part: number; parts: number }[] {
  const size = chunkSize(block.title);
  const parts = Math.max(1, Math.ceil(block.lines.length / size));
  const out: { from: number; to: number; part: number; parts: number }[] = [];
  for (let i = 0; i < block.lines.length; i += size) {
    const slice = block.lines.slice(i, i + size);
    out.push({ from: slice[0], to: slice[slice.length - 1], part: out.length + 1, parts });
  }
  return out;
}

// One plate per section. A long section splits, and a chorus keeps its name so the next one can rhyme with it.
export function buildPlates(text: string, lines: string[]): LyricPlate[] {
  const blocks = lyricBlocks(text);
  const source = blocks.length ? blocks : lines.length ? [{ title: "", lines: lines.map((_, i) => i) }] : [];
  const plates: LyricPlate[] = [];
  source.forEach((block, index) => {
    for (const span of spansOf(block)) {
      const title = block.title ? (span.parts > 1 ? `${block.title} · ${span.part}` : block.title) : `Placa ${plates.length + 1}`;
      plates.push({
        id: plateId(span.from),
        title: clip(title, 48) || `Placa ${plates.length + 1}`,
        from: span.from,
        to: span.to,
        look: lookFor(block.title, index),
        motif: motifFor(block.title, lines[span.from] ?? ""),
      });
    }
  });
  return cover(plates, lines.length);
}

// The latest downbeat at or before the word, and not before the previous line has finished.
export function cutTime(word: number, floor: number, cuts: number[]): number {
  let start = word;
  const sorted = [...cuts].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  for (const beat of sorted) {
    if (beat > word + 0.02) break;
    if (beat >= floor - 0.04) start = beat;
  }
  return start;
}

export type PlateSpan = { plate: LyricPlate; start: number; end: number };

// When each plate is on screen. The first one starts at 0. Later ones cut on a downbeat when the Reloj has one.
export function plateSpans(
  plates: LyricPlate[],
  lines: { start: number; end: number }[],
  cuts: number[],
  duration: number,
): PlateSpan[] {
  const ordered = plates
    .filter((plate) => plate.from >= 0 && plate.from < lines.length && plate.to >= plate.from)
    .sort((a, b) => a.from - b.from);
  const starts = ordered.map((plate, i) => {
    if (i === 0) return 0;
    const word = lines[plate.from]?.start ?? 0;
    const prev = ordered[i - 1];
    const floor = lines[Math.min(prev.to, lines.length - 1)]?.end ?? 0;
    return cutTime(word, floor, cuts);
  });
  return ordered.map((plate, i) => {
    const next = starts[i + 1];
    const lineEnd = lines[Math.min(plate.to, lines.length - 1)]?.end ?? 0;
    const end = next ?? Math.max(duration, lineEnd, starts[i]);
    return { plate, start: starts[i], end };
  });
}

export function activePlate(spans: PlateSpan[], t: number): PlateSpan | null {
  if (!spans.length) return null;
  for (let i = spans.length - 1; i >= 0; i--) {
    if (t >= spans[i].start) return spans[i];
  }
  return spans[0];
}

function asPlate(row: { title: string; from: number; to: number; look: PlateLook; motif: string }): LyricPlate {
  return { id: plateId(row.from), title: row.title, from: row.from, to: row.to, look: row.look, motif: row.motif };
}

// Every sung line belongs to one plate. Gaps get a plate, overlaps get trimmed, and the tail folds into the last.
export function cleanPlates(
  raw: { title: string; from: number; to: number; look: string; motif: string }[],
  lines: string[],
): LyricPlate[] {
  const lineCount = lines.length;
  if (lineCount <= 0) return [];
  const rows = (raw ?? [])
    .map((plate) => ({
      title: clip(plate.title, 48) || "Placa",
      from: Math.round(plate.from),
      to: Math.round(plate.to),
      look: pickLook(plate.look),
      motif: clip(plate.motif, 32) || "marca",
    }))
    .filter((plate) => Number.isFinite(plate.from) && plate.from >= 0 && plate.from < lineCount && plate.to >= plate.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const kept: typeof rows = [];
  for (const row of rows) {
    const prev = kept[kept.length - 1];
    if (prev && row.from <= prev.to) {
      if (row.from <= prev.from) continue;
      prev.to = row.from - 1;
      if (prev.to < prev.from) kept.pop();
    }
    kept.push({ ...row, to: Math.min(row.to, lineCount - 1) });
  }
  const out: LyricPlate[] = [];
  let cursor = 0;
  for (const row of kept) {
    if (row.from > cursor) out.push(...buildPlates("", lines.slice(cursor, row.from)).map((plate) => shift(plate, cursor, lines)));
    out.push(asPlate(row));
    cursor = row.to + 1;
  }
  if (cursor < lineCount) out.push(...buildPlates("", lines.slice(cursor)).map((plate) => shift(plate, cursor, lines)));
  return cover(out.filter((plate) => plate.to >= plate.from), lineCount);
}

function shift(plate: LyricPlate, by: number, lines: string[]): LyricPlate {
  const from = plate.from + by;
  return { ...plate, id: plateId(from), from, to: plate.to + by, motif: plate.motif || motifFor("", lines[from] ?? "") };
}

// Fold extras into the last plate so the song is covered and the list stays short.
function cover(plates: LyricPlate[], lineCount: number): LyricPlate[] {
  const out = plates.filter((plate) => plate.from >= 0 && plate.from < lineCount && plate.to >= plate.from);
  while (out.length > MAX_PLATES) {
    const last = out.pop();
    const prev = out[out.length - 1];
    if (!last || !prev) break;
    prev.to = Math.max(prev.to, last.to);
  }
  if (out.length) out[out.length - 1].to = lineCount - 1;
  return out.map((plate) => ({ ...plate, id: plateId(plate.from), to: Math.min(plate.to, lineCount - 1) }));
}

export function splitPlate(plates: LyricPlate[], id: string, at: number): LyricPlate[] {
  const next: LyricPlate[] = [];
  for (const plate of plates) {
    if (plate.id !== id || at <= plate.from || at > plate.to) {
      next.push(plate);
      continue;
    }
    next.push({ ...plate, to: at - 1 });
    next.push({ ...plate, id: plateId(at), from: at, title: `${plate.title} · 2`.slice(0, 48) });
  }
  return next;
}

export function joinPlate(plates: LyricPlate[], id: string): LyricPlate[] {
  const index = plates.findIndex((plate) => plate.id === id);
  const plate = plates[index];
  const after = plates[index + 1];
  if (!plate || !after) return plates;
  return plates
    .filter((item) => item.id !== after.id)
    .map((item) => (item.id === id ? { ...item, to: after.to, title: item.title.replace(/ · \d+$/, "") } : item));
}

export const LyricPlatesSchema = z.object({
  idea: z.string().describe("One sentence in Spanish (Rioplatense): what the video is about. Not a list of scenes."),
  plates: z
    .array(
      z.object({
        title: z.string().describe("Short plate name, in the language of the lyrics."),
        from: z.number().int().describe("First lyric line, from 0, inclusive."),
        to: z.number().int().describe("Last lyric line, inclusive. Plates cover every line once, in order."),
        look: z.string().describe("type, stack, margin, count or stamp."),
        motif: z.string().describe("Two or three words: one concrete thing this plate is built around. Not a description of the line and not a camera move."),
      }),
    )
    .describe("At most 8 plates. Choruses that repeat share a motif and change it."),
  note: z.string().describe("One sentence in Spanish (Rioplatense) on what to look at. Empty if nothing."),
});
export type LyricPlatesDraft = z.infer<typeof LyricPlatesSchema>;
