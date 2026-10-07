// A code-drawn lyric video. Every pixel is a function of the song time.
// The word lights when it is sung. The plate cuts on a downbeat, or on the word when the Reloj has no grid.
// One motif per plate, inside the scene. Flat colour, no gradient, no fade-in, no HUD that stays for the song.
import { LYRIC_FONT_FAMILY, type LyricLine, type LyricPiece, type LyricPlate, type LyricWord, type PlateLook } from "../../shared/lyrics.ts";
import { activePlate, plateSpans } from "../../shared/plates.ts";

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

function fontOf(piece: LyricPiece, size: number): string {
  const family = LYRIC_FONT_FAMILY[piece.style.font];
  const weight = piece.style.font === "display" ? 400 : 700;
  return `${weight} ${size}px ${family}`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, piece: LyricPiece, maxW: number, maxH: number): number {
  let size = Math.max(8, maxH);
  ctx.font = fontOf(piece, size);
  const width = ctx.measureText(text || " ").width || 1;
  if (width > maxW) size *= maxW / Math.max(width, 1);
  return Math.max(8, size);
}

function sung(word: LyricWord, t: number): number {
  if (t < word.start) return 0;
  const span = word.end - word.start;
  if (span <= 0.02) return 1;
  return clamp((t - word.start) / span);
}

function currentWord(lines: LyricLine[], t: number): { line: LyricLine; word: LyricWord } | null {
  let found: { line: LyricLine; word: LyricWord } | null = null;
  for (const line of lines) {
    for (const word of line.words) {
      if (t >= word.start) found = { line, word };
    }
  }
  if (found) return found;
  const line = lines[0];
  const word = line?.words[0];
  return line && word ? { line, word } : null;
}

function paintWord(
  ctx: CanvasRenderingContext2D,
  word: LyricWord,
  x: number,
  y: number,
  size: number,
  piece: LyricPiece,
  t: number,
  ink: string,
  accent: string,
) {
  ctx.font = fontOf(piece, size);
  ctx.fillStyle = ink;
  ctx.fillText(word.text, x, y);
  const lit = sung(word, t);
  if (lit <= 0) return;
  const width = ctx.measureText(word.text).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - size, Math.max(1, width * lit), size * 1.4);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillText(word.text, x, y);
  ctx.restore();
}

function plateLines(piece: LyricPiece, plate: LyricPlate): LyricLine[] {
  return piece.lines.slice(plate.from, Math.min(piece.lines.length, plate.to + 1));
}

function drawType(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, plate: LyricPlate, lines: LyricLine[]) {
  const { ink, accent } = colors(piece);
  const now = currentWord(lines, t);
  if (!now) return;
  const right = plate.from % 2 === 1;
  const size = fit(ctx, now.word.text, piece, w * 0.84, h * 0.42);
  ctx.font = fontOf(piece, size);
  const width = ctx.measureText(now.word.text).width;
  const x = right ? w * 0.92 - width : w * 0.08;
  paintWord(ctx, now.word, x, h * 0.62, size, piece, t, ink, accent);
  const rest = now.line.words.filter((word) => word !== now.word);
  const small = Math.min(h * 0.045, w * 0.04);
  ctx.font = fontOf(piece, small);
  let y = h * 0.16;
  const column = right ? w * 0.08 : w * 0.62;
  for (const word of rest) {
    paintWord(ctx, word, column, y, small, piece, t, ink, accent);
    y += small * 1.35;
    if (y > h * 0.46) break;
  }
  label(ctx, piece, plate.motif, w * 0.08, h * 0.08, ink);
}

function drawStack(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, plate: LyricPlate, lines: LyricLine[]) {
  const { ink, accent } = colors(piece);
  const now = currentWord(lines, t);
  const row = Math.min(h * 0.09, (h * 0.72) / Math.max(lines.length, 1));
  let y = h * 0.18;
  for (const line of lines) {
    const on = line === now?.line;
    const size = on ? row * 0.95 : row * 0.62;
    let x = w * 0.1;
    ctx.font = fontOf(piece, size);
    for (const word of line.words) {
      paintWord(ctx, word, x, y, size, piece, t, ink, on ? accent : ink);
      x += ctx.measureText(word.text).width + size * (word.gap ? 0.28 : 0.06);
      if (x > w * 0.92) break;
    }
    y += row;
  }
  const words = lines.flatMap((line) => line.words);
  const done = words.filter((word) => t >= word.start).length;
  const frac = words.length ? done / words.length : 0;
  ctx.fillStyle = accent;
  ctx.fillRect(w * 0.045, h * 0.16, Math.max(2, w * 0.012), h * 0.68 * frac);
  label(ctx, piece, plate.motif, w * 0.1, h * 0.92, ink);
}

function drawMargin(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, plate: LyricPlate, lines: LyricLine[]) {
  const { ink, accent } = colors(piece);
  const letter = [...(plate.motif || " ")][0] || " ";
  const left = plate.from % 2 === 0;
  const size = fit(ctx, letter, piece, w * 0.7, h * 0.9);
  ctx.font = fontOf(piece, size);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.9;
  ctx.fillText(letter, left ? w * 0.42 : -size * 0.18, h * 0.78);
  ctx.globalAlpha = 1;
  const now = currentWord(lines, t);
  const line = now?.line ?? lines[0];
  if (!line) return;
  let x = left ? w * 0.06 : w * 0.48;
  const edge = left ? w * 0.4 : w * 0.94;
  let y = h * 0.2;
  const wordSize = Math.min(h * 0.07, w * 0.055);
  ctx.font = fontOf(piece, wordSize);
  for (const word of line.words) {
    const width = ctx.measureText(word.text).width;
    if (x + width > edge) {
      x = left ? w * 0.06 : w * 0.48;
      y += wordSize * 1.35;
    }
    paintWord(ctx, word, x, y, wordSize, piece, t, ink, accent);
    x += width + wordSize * (word.gap ? 0.3 : 0.06);
  }
  label(ctx, piece, plate.motif, left ? w * 0.06 : w * 0.48, h * 0.9, accent);
}

function drawCount(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, plate: LyricPlate, lines: LyricLine[]) {
  const { ink, accent } = colors(piece);
  const words = lines.flatMap((line) => line.words);
  const done = words.filter((word) => t >= word.start).length;
  const numeral = String(done);
  const size = fit(ctx, numeral, piece, w * 0.62, h * 0.5);
  const x = w * 0.08;
  ctx.font = fontOf(piece, size);
  ctx.fillStyle = ink;
  ctx.fillText(numeral, x, h * 0.58);
  const numeralWidth = ctx.measureText(numeral).width;
  const small = size * 0.28;
  ctx.font = fontOf(piece, small);
  ctx.fillStyle = accent;
  ctx.fillText(`/${words.length}`, x + numeralWidth + small * 0.2, h * 0.58);
  label(ctx, piece, plate.motif, x, h * 0.16, accent);
  const now = currentWord(lines, t);
  if (!now) return;
  let cursor = w * 0.08;
  const wordSize = Math.min(h * 0.055, w * 0.045);
  const y = h * 0.84;
  for (const word of now.line.words) {
    ctx.font = fontOf(piece, wordSize);
    paintWord(ctx, word, cursor, y, wordSize, piece, t, ink, accent);
    cursor += ctx.measureText(word.text).width + wordSize * (word.gap ? 0.3 : 0.06);
    if (cursor > w * 0.92) break;
  }
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, plate: LyricPlate, lines: LyricLine[]) {
  const { ink, accent } = colors(piece);
  const motif = (plate.motif || "marca").toUpperCase();
  const size = fit(ctx, motif, piece, w * 1.35, h * 0.5);
  ctx.font = fontOf(piece, size);
  ctx.fillStyle = ink;
  const width = ctx.measureText(motif).width;
  ctx.fillText(motif, w * 0.04 - width * 0.08, h * 0.48);
  ctx.fillStyle = colors(piece).bg;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);
  const now = currentWord(lines, t);
  if (!now) return;
  let x = w * 0.08;
  const wordSize = Math.min(h * 0.06, w * 0.05);
  const y = h * 0.84;
  for (const word of now.line.words) {
    ctx.font = fontOf(piece, wordSize);
    paintWord(ctx, word, x, y, wordSize, piece, t, ink, accent);
    x += ctx.measureText(word.text).width + wordSize * (word.gap ? 0.3 : 0.06);
    if (x > w * 0.92) break;
  }
}

function colors(piece: LyricPiece): { bg: string; ink: string; accent: string } {
  return {
    bg: piece.style.palette[0] || "#15171c",
    ink: piece.style.textColor || "#f4f4f1",
    accent: piece.style.highlightColor || "#ffd166",
  };
}

function label(ctx: CanvasRenderingContext2D, piece: LyricPiece, text: string, x: number, y: number, color: string) {
  const size = Math.max(11, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.028);
  ctx.font = fontOf(piece, size);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const DRAW: Record<PlateLook, typeof drawType> = {
  type: drawType,
  stack: drawStack,
  margin: drawMargin,
  count: drawCount,
  stamp: drawStamp,
};

// The plate for this instant, flat, with the lyric on the word. The song credit sits in the last plate only.
export function drawPlateFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, cuts: number[]) {
  const { bg, ink } = colors(piece);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const duration = piece.lines.at(-1)?.end ?? t;
  const spans = plateSpans(piece.plates, piece.lines, cuts, duration);
  const span = activePlate(spans, t);
  if (!span) {
    label(ctx, piece, "Primero pegá la letra.", w * 0.08, h * 0.5, ink);
    return;
  }
  const lines = plateLines(piece, span.plate);
  DRAW[span.plate.look](ctx, w, h, t, piece, span.plate, lines);
  const last = spans[spans.length - 1];
  if (piece.credit && span === last && (piece.title || piece.artist)) {
    const size = Math.max(11, Math.min(w, h) * 0.028);
    ctx.font = `500 ${size}px ${LYRIC_FONT_FAMILY.sans}`;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.8;
    ctx.fillText(`♪ ${[piece.title, piece.artist].filter(Boolean).join(" — ")}`, w * 0.08, h - size);
    ctx.globalAlpha = 1;
  }
}
