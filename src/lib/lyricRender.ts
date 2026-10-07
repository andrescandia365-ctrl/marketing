// Draws and encodes lyric videos: a soft, moving colour background (or the piece's own photo or video), the line
// being sung with the karaoke fill, its entrance, the key words bigger, and the romanization or translation under
// it. The same drawing feeds the live preview and the encoder (WebCodecs through mediabunny).
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { LYRIC_FONT_FAMILY, elementWindow, type LyricElement, type LyricLine, type LyricMotif, type LyricPiece } from "../../shared/lyrics.ts";
import { drawPlateFrame } from "./plateDraw.ts";
import { drawLayers, type MotionAsset } from "./motion.ts";
import { findBeats, type RenderResult } from "./render.ts";

const FPS = 30;
const SAMPLE_RATE = 48000;
const ENTER = 0.35;
const EXIT = 0.3;

export type Backdrop = { source: CanvasImageSource; width: number; height: number } | null;
// A pasted picture for one element slot. Drawn whole (contain), so a watermark stays in frame.
export type ElementGlyph = { source: CanvasImageSource; width: number; height: number };

export function videoSize(format: LyricPiece["format"]): [number, number] {
  return format === "vertical" ? [1080, 1920] : [1920, 1080];
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

// How much the background swells: 1 right on a beat, fading in a fifth of a second.
function beatEnvelope(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return last < 0 ? 0 : Math.exp(-(t - beats[last]) * 5);
}

let field: HTMLCanvasElement | null = null;

// Colour fields drawn on a tiny canvas and stretched, which blurs them for free.
function drawOrganic(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, piece: LyricPiece, beats: number[]) {
  const { palette, mood, pulse } = piece.style;
  const sw = 64;
  const sh = Math.max(16, Math.round((64 * h) / w));
  field ??= document.createElement("canvas");
  if (field.width !== sw || field.height !== sh) {
    field.width = sw;
    field.height = sh;
  }
  const f = field.getContext("2d")!;
  f.globalCompositeOperation = "source-over";
  f.fillStyle = palette[0];
  f.fillRect(0, 0, sw, sh);
  const speed = mood === "lively" ? 0.45 : 0.14;
  const swell = pulse ? beatEnvelope(beats, t) * (mood === "lively" ? 0.22 : 0.12) : 0;
  const colors = [palette[1], palette[2], palette[1], palette[2], palette[0]];
  colors.forEach((color, i) => {
    const phase = i * 1.7;
    const x = sw * (0.5 + 0.42 * Math.sin(t * speed * (1 + i * 0.23) + phase));
    const y = sh * (0.5 + 0.42 * Math.cos(t * speed * (0.8 + i * 0.17) + phase * 1.3));
    const r = Math.max(sw, sh) * (0.42 + 0.1 * Math.sin(t * speed * 0.7 + i)) * (1 + swell);
    const g = f.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${color}d9`);
    g.addColorStop(1, `${color}00`);
    f.fillStyle = g;
    f.fillRect(0, 0, sw, sh);
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(field, 0, 0, w, h);
  // A soft vignette keeps the eye in the middle, where the words are.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, bg: NonNullable<Backdrop>, fullFrame: boolean) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const scale = fullFrame ? Math.min(w / bg.width, h / bg.height) : Math.max(w / bg.width, h / bg.height);
  const dw = bg.width * scale;
  const dh = bg.height * scale;
  ctx.drawImage(bg.source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  // Darker, so the words read on any picture.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, w, h);
}

type Placed = { text: string; x: number; width: number; size: number; start: number; end: number; key: boolean };

function wrap(
  ctx: CanvasRenderingContext2D,
  words: { text: string; gap: boolean; size: number; start: number; end: number; key: boolean }[],
  font: (size: number) => string,
  maxWidth: number,
): { words: Placed[]; width: number; size: number }[] {
  const rows: { words: Placed[]; width: number; size: number }[] = [];
  let row: { words: Placed[]; width: number; size: number } = { words: [], width: 0, size: 0 };
  let pendingGap = 0;
  for (const w of words) {
    ctx.font = font(w.size);
    const width = ctx.measureText(w.text).width;
    if (row.words.length && row.width + pendingGap + width > maxWidth) {
      rows.push(row);
      row = { words: [], width: 0, size: 0 };
      pendingGap = 0;
    }
    const x = row.width + (row.words.length ? pendingGap : 0);
    row.words.push({ text: w.text, x, width, size: w.size, start: w.start, end: w.end, key: w.key });
    row.width = x + width;
    row.size = Math.max(row.size, w.size);
    pendingGap = w.gap ? ctx.measureText(" ").width : 0;
  }
  if (row.words.length) rows.push(row);
  return rows;
}

// How a graphic moves across its own window. Pure function of t.
function elementPose(motion: LyricElement["motion"], t: number, start: number, end: number, beats: number[]): { alpha: number; scale: number; dy: number } {
  const dur = Math.max(0.4, end - start);
  const u = clamp((t - start) / dur);
  const edge = Math.min(clamp(u / 0.18), clamp((1 - u) / 0.18));
  if (motion === "enter") {
    const p = easeOut(clamp(u / 0.3));
    return { alpha: edge, scale: 0.62 + 0.38 * p, dy: (1 - p) * 0.35 };
  }
  if (motion === "pulse") return { alpha: edge, scale: 1 + 0.07 * Math.sin(t * 6.2), dy: 0 };
  // Same beat list the background swells on. The hit is a pop, not a fade-in, and the words stay on their own times.
  if (motion === "beat") {
    const hit = beatEnvelope(beats, t);
    return { alpha: Math.max(edge, hit > 0.15 ? 1 : edge), scale: 1 + 0.42 * hit, dy: -0.22 * hit };
  }
  if (motion === "leave") {
    const p = easeOut(clamp((u - 0.5) / 0.5));
    return { alpha: edge, scale: 1, dy: -p * 0.45 };
  }
  return { alpha: edge, scale: 1, dy: 0 };
}

function traceMotif(ctx: CanvasRenderingContext2D, motif: LyricMotif, s: number) {
  ctx.beginPath();
  if (motif === "circle") {
    ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    return;
  }
  if (motif === "ring") {
    ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    return;
  }
  if (motif === "star") {
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? s * 0.4 : s * 0.17;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  if (motif === "heart") {
    ctx.moveTo(0, s * 0.28);
    ctx.bezierCurveTo(-s * 0.46, -s * 0.22, -s * 0.22, -s * 0.42, 0, -s * 0.12);
    ctx.bezierCurveTo(s * 0.22, -s * 0.42, s * 0.46, -s * 0.22, 0, s * 0.28);
    return;
  }
  if (motif === "diamond") {
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(s * 0.34, 0);
    ctx.lineTo(0, s * 0.4);
    ctx.lineTo(-s * 0.34, 0);
    ctx.closePath();
    return;
  }
  if (motif === "note") {
    ctx.ellipse(-s * 0.08, s * 0.14, s * 0.2, s * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(s * 0.08, -s * 0.36, s * 0.07, s * 0.52);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.15, -s * 0.36);
    ctx.quadraticCurveTo(s * 0.46, -s * 0.22, s * 0.34, 0);
    ctx.lineTo(s * 0.15, -s * 0.08);
    ctx.closePath();
    ctx.fill();
  }
}

// Where a graphic sits. Same place means a row along that edge, outside the lyric block, so twelve of them
// do not pile through the words. The index is stable (every mate, not only the ones on screen now).
function elementSpot(place: LyricElement["place"], index: number, count: number, w: number, h: number): { x: number; y: number } {
  const n = Math.max(1, count);
  const i = Math.min(Math.max(0, index), n - 1);
  if (place === "top") {
    const gap = (w * 0.86) / n;
    return { x: w * 0.07 + gap * (i + 0.5), y: h * 0.12 };
  }
  const above = i % 2 === 0;
  const slot = Math.floor(i / 2);
  const slots = Math.ceil(n / 2);
  const bandTop = above ? h * 0.2 : h * 0.7;
  const bandBot = above ? h * 0.36 : h * 0.9;
  const y = bandTop + ((bandBot - bandTop) / slots) * (slot + 0.5);
  return { x: place === "left" ? w * 0.12 : w * 0.88, y };
}

function drawOneElement(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  piece: LyricPiece,
  element: LyricElement,
  glyph: ElementGlyph | undefined,
  beats: number[],
) {
  const win = elementWindow(element, piece.lines);
  if (!win || t < win.start || t >= win.end) return;
  const pose = elementPose(element.motion, t, win.start, win.end, beats);
  if (pose.alpha <= 0.01) return;
  const mates = (piece.elements ?? []).filter((e) => e.place === element.place);
  const count = Math.max(1, mates.length);
  const index = Math.max(0, mates.findIndex((e) => e.id === element.id));
  const unit = Math.min(w, h);
  const crowd = count > 6 ? 0.62 : count > 3 ? 0.8 : 1;
  const box = unit * (element.motif === "word" ? 0.16 : 0.14) * crowd;
  const spot = elementSpot(element.place, index, count, w, h);
  const x = spot.x;
  const y = spot.y + pose.dy * box;
  const family = LYRIC_FONT_FAMILY[piece.style.font];
  const label = element.label.replace(/\s+/g, " ").trim().slice(0, 22);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pose.scale, pose.scale);
  ctx.globalAlpha = pose.alpha;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = unit * 0.012;
  ctx.fillStyle = piece.style.highlightColor;
  ctx.strokeStyle = piece.style.highlightColor;
  ctx.lineWidth = Math.max(2, unit * 0.006);
  if (glyph && glyph.width > 0 && glyph.height > 0) {
    const fit = Math.min(box / glyph.width, box / glyph.height);
    const dw = glyph.width * fit;
    const dh = glyph.height * fit;
    ctx.shadowBlur = 0;
    ctx.drawImage(glyph.source, -dw / 2, -dh / 2, dw, dh);
  } else if (element.motif !== "word") {
    traceMotif(ctx, element.motif, box);
    if (element.motif === "ring") ctx.stroke();
    else if (element.motif !== "note") ctx.fill();
  }
  if (label && !glyph && (element.motif === "word" || count <= 3)) {
    const size = unit * (element.motif === "word" ? 0.055 : 0.03);
    ctx.font = `600 ${size}px ${family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = element.motif === "word" ? piece.style.highlightColor : piece.style.textColor;
    ctx.fillText(label, 0, element.motif === "word" ? 0 : box * 0.52);
  }
  ctx.restore();
}

function drawElements(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  piece: LyricPiece,
  glyphs: Record<number, ElementGlyph>,
  beats: number[],
) {
  for (const element of piece.elements ?? []) {
    const win = elementWindow(element, piece.lines);
    if (!win || t < win.start || t >= win.end) continue;
    drawOneElement(ctx, w, h, t, piece, element, element.slot ? glyphs[element.slot] : undefined, beats);
  }
}

type LineLook = { alpha: number; dy: number; dx: number; clip: number; scale: number };

// How a lyric line arrives and leaves. Cut, rise, wipe and the default slide stay opaque on the way in:
// the move is the transition. Fundido is the one that fades.
function lyricLook(entrance: LyricPiece["style"]["entrance"], t: number, line: LyricLine, unit: number): LineLook | null {
  const enter = easeOut(clamp((t - line.start) / ENTER));
  const past = t > line.end;
  const exit = past ? 1 - clamp((t - line.end) / EXIT) : 1;
  const still: LineLook = { alpha: 1, dy: 0, dx: 0, clip: 1, scale: 1 };
  if (entrance === "cut") {
    if (t < line.start || t >= line.end) return null;
    return still;
  }
  if (entrance === "rise") {
    if (t < line.start || t >= line.end) return null;
    return { ...still, dy: (1 - enter) * unit * 0.2 };
  }
  if (t < line.start || exit <= 0) return null;
  if (entrance === "wipe") return { ...still, alpha: past ? exit : 1, dx: (1 - enter) * -unit * 0.08, clip: enter };
  if (entrance === "pop") {
    return { ...still, alpha: past ? exit : Math.min(1, clamp((t - line.start) / 0.08)), scale: 0.7 + 0.3 * easeOutBack(clamp((t - line.start) / ENTER)) };
  }
  if (entrance === "fade") return { ...still, alpha: Math.min(enter, exit) };
  return { ...still, alpha: past ? exit : 1, dy: (1 - enter) * unit * 0.08 };
}

function paintLyricLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  piece: LyricPiece,
  line: LyricLine,
  font: (size: number) => string,
  look: LineLook,
) {
  if (look.alpha <= 0.01) return;
  const style = piece.style;
  const unit = Math.min(w, h);
  const base = unit * 0.075 * (style.size / 100);
  const rows = wrap(
    ctx,
    line.words.map((word) => ({ ...word, size: style.keywords && word.key ? base * 1.4 : base })),
    font,
    w * 0.84,
  );
  const secondSize = base * 0.5;
  ctx.font = font(secondSize);
  const second = line.second.trim()
    ? wrap(ctx, line.second.split(/\s+/).map((text) => ({ text, gap: true, size: secondSize, start: 0, end: 0, key: false })), font, w * 0.84)
    : [];
  const rowHeights = rows.map((r) => r.size * 1.18);
  const blockHeight = rowHeights.reduce((a, b) => a + b, 0) + second.length * secondSize * 1.4 + (second.length ? secondSize * 0.6 : 0);
  const centerY = style.position === "center" ? h * 0.5 : h * (w < h ? 0.72 : 0.74);
  let y = centerY - blockHeight / 2;

  ctx.save();
  if (look.clip < 1) {
    ctx.beginPath();
    ctx.rect(0, 0, w * look.clip, h);
    ctx.clip();
  }
  ctx.globalAlpha = look.alpha;
  ctx.translate(look.dx, look.dy);
  if (look.scale !== 1) {
    ctx.translate(w / 2, centerY);
    ctx.scale(look.scale, look.scale);
    ctx.translate(-w / 2, -centerY);
  }
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  rows.forEach((row, r) => {
    const baseline = y + rowHeights[r] * 0.82;
    const left = (w - row.width) / 2;
    for (const word of row.words) {
      ctx.font = font(word.size);
      ctx.shadowBlur = word.size * 0.25;
      const x = left + word.x;
      const lit = style.karaoke ? clamp((t - word.start) / Math.max(word.end - word.start, 0.05)) : style.keywords && word.key ? 1 : 0;
      ctx.fillStyle = style.textColor;
      if (lit < 1) ctx.fillText(word.text, x, baseline);
      if (lit > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - word.size * 0.1, baseline - word.size * 1.2, (word.width + word.size * 0.2) * lit, word.size * 1.6);
        ctx.clip();
        ctx.fillStyle = style.highlightColor;
        ctx.fillText(word.text, x, baseline);
        ctx.restore();
      }
    }
    y += rowHeights[r];
  });
  if (second.length) {
    y += secondSize * 0.6;
    ctx.font = font(secondSize);
    ctx.shadowBlur = secondSize * 0.3;
    ctx.fillStyle = style.textColor;
    ctx.globalAlpha *= 0.8;
    for (const row of second) {
      const left = (w - row.width) / 2;
      for (const word of row.words) ctx.fillText(word.text, left + word.x, y + secondSize * 1.1);
      y += secondSize * 1.4;
    }
  }
  ctx.restore();
}

export function drawLyricFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  piece: LyricPiece,
  bg: Backdrop,
  beats: number[],
  layers: MotionAsset[] = [],
  glyphs: Record<number, ElementGlyph> = {},
  // Downbeats from the Reloj. Empty means a plate cuts on its first word.
  cuts: number[] = [],
) {
  if (piece.plateOn && piece.plates?.length) {
    drawPlateFrame(ctx, w, h, t, piece, cuts);
    return;
  }
  const style = piece.style;
  if (style.background === "layers" && layers.length) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawLayers(ctx, w, h, t, layers, beats, 1003);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, w, h);
  } else if (style.background === "media" && bg) drawBackdrop(ctx, w, h, bg, piece.fullFrame);
  else drawOrganic(ctx, w, h, t, piece, beats);

  drawElements(ctx, w, h, t, piece, glyphs, beats);

  const unit = Math.min(w, h);
  const family = LYRIC_FONT_FAMILY[style.font];
  const weight = style.font === "display" ? 400 : 600;
  const font = (size: number) => `${weight} ${size}px ${family}`;

  // The line on screen: the last one that started. Rise also keeps the previous line for the handoff.
  let index = -1;
  for (let k = piece.lines.length - 1; k >= 0; k--) {
    if (t >= piece.lines[k].start) {
      index = k;
      break;
    }
  }
  const line = piece.lines[index];
  if (style.entrance === "rise" && line && index > 0) {
    const u = clamp((t - line.start) / ENTER);
    if (u > 0 && u < 1) paintLyricLine(ctx, w, h, t, piece, piece.lines[index - 1], font, { alpha: 1 - u, dy: -u * unit * 0.2, dx: 0, clip: 1, scale: 1 });
  }
  const look = line ? lyricLook(style.entrance, t, line, unit) : null;
  if (line && look) paintLyricLine(ctx, w, h, t, piece, line, font, look);

  // The song's credit, and the AI notice when the own background was made with AI.
  const notes = [
    ((style.background === "media" && bg) || (style.background === "layers" && layers.length)) && piece.aiBackground ? "Fondo hecho con IA" : "",
    piece.credit && (piece.title || piece.artist) ? `♪ ${[piece.title, piece.artist].filter(Boolean).join(" — ")}` : "",
  ].filter(Boolean);
  if (notes.length) {
    const size = unit * 0.026;
    ctx.save();
    ctx.font = `500 ${size}px ${LYRIC_FONT_FAMILY.sans}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = size * 0.4;
    notes.forEach((text, i) => ctx.fillText(text, w / 2, h - unit * 0.05 - (notes.length - 1 - i) * size * 1.5));
    ctx.restore();
  }
}

// Loads the piece's fonts, with the glyphs its lyrics need (Japanese and Korean fonts come in slices).
export async function loadLyricFonts(piece: LyricPiece) {
  const sample = piece.lines.map((l) => `${l.text} ${l.second}`).join(" ").slice(0, 4000) || "Aa";
  const families = ["IBM Plex Sans", "Fraunces", "Bebas Neue", "Noto Sans", "Noto Sans JP", "Noto Sans KR"];
  await Promise.all(
    families.flatMap((f) => ["400", "600"].map((weight) => document.fonts?.load(`${weight} 48px "${f}"`, sample).catch(() => []))),
  );
}

export async function decodeSong(song: Blob): Promise<AudioBuffer> {
  try {
    return await new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await song.arrayBuffer());
  } catch {
    throw new Error("No se pudo leer la canción. Probá con un .mp3 o un .wav.");
  }
}

export function songBeats(buffer: AudioBuffer): number[] {
  return findBeats(buffer);
}

// The part of the song that goes into the video, in stereo, with a short fade where it is cut.
function cutSong(buffer: AudioBuffer, from: number, to: number): AudioBuffer {
  const start = Math.floor(from * buffer.sampleRate);
  const length = Math.max(1, Math.floor((to - from) * buffer.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: buffer.sampleRate });
  const fadeIn = from > 0 ? Math.floor(0.4 * buffer.sampleRate) : 0;
  const fadeOut = to < buffer.duration - 0.05 ? Math.floor(1.5 * buffer.sampleRate) : 0;
  for (let ch = 0; ch < 2; ch++) {
    const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
    const dst = out.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      let gain = 1;
      if (i < fadeIn) gain = i / fadeIn;
      if (i > length - fadeOut) gain = Math.min(gain, (length - i) / fadeOut);
      dst[i] = (src[start + i] ?? 0) * gain;
    }
  }
  return out;
}

export async function renderLyricVideo(
  song: Blob,
  background: { image?: HTMLImageElement; clips?: Blob[]; layers?: HTMLImageElement[]; elements?: Record<number, HTMLImageElement> },
  piece: LyricPiece,
  onProgress: (fraction: number) => void,
  cuts: number[] = [],
): Promise<RenderResult> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Este navegador no puede generar video. Usá una versión reciente de Chrome, Edge o Safari.");
  }
  const notes: string[] = [];
  const [w, h] = videoSize(piece.format);
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], { width: w, height: h });
  if (!codec) throw new Error("Este navegador no tiene un codificador de video disponible.");
  const mp4 = codec === "avc";

  const full = await decodeSong(song);
  const from = Math.min(Math.max(0, piece.from), full.duration - 1);
  const to = piece.to > from ? Math.min(piece.to, full.duration) : full.duration;
  const sound = cutSong(full, from, to);
  const beats = songBeats(full);
  await loadLyricFonts(piece);
  onProgress(0.03);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  const audioCodec = await getFirstEncodableAudioCodec(mp4 ? ["aac", "opus"] : ["opus", "vorbis"], {
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
  });
  let audio: AudioBufferSource | null = null;
  if (audioCodec) {
    audio = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
    output.addAudioTrack(audio);
  } else notes.push("La canción quedó afuera: este navegador no puede codificar audio.");

  const useMedia = piece.style.background === "media";
  const layerAssets: MotionAsset[] = (background.layers ?? []).map((img, k) => ({ image: img, width: img.naturalWidth, height: img.naturalHeight, name: `layer:${k}` }));
  const glyphs: Record<number, ElementGlyph> = {};
  for (const [slot, img] of Object.entries(background.elements ?? {})) {
    if (img.naturalWidth) glyphs[Number(slot)] = { source: img, width: img.naturalWidth, height: img.naturalHeight };
  }
  let still: Backdrop = null;
  if (useMedia && background.image) {
    still = { source: background.image, width: background.image.naturalWidth, height: background.image.naturalHeight };
  }
  const frames = Math.round((to - from) * FPS);
  // The own clips play one after the other, in a loop, under the whole song.
  const inputs: Input[] = [];
  const tracks: { sink: CanvasSink; duration: number }[] = [];
  for (const clip of useMedia ? (background.clips ?? []) : []) {
    const input = new Input({ source: new BlobSource(clip), formats: ALL_FORMATS });
    inputs.push(input);
    const track = await input.getPrimaryVideoTrack();
    if (track && (await track.canDecode())) {
      const duration = Math.max(await track.computeDuration(), 1 / FPS);
      tracks.push({ sink: new CanvasSink(track, { width: w, height: h, fit: piece.fullFrame ? "contain" : "cover" }), duration });
    } else notes.push("Este navegador no puede leer uno de los videos de fondo; se saltó.");
  }
  // Which clip each frame shows, and each clip's own times in the order they are needed.
  const order: number[] = [];
  const clipFrames = tracks.map(() => [] as number[]);
  const loop = tracks.reduce((a, t) => a + t.duration, 0);
  for (let f = 0; f < frames && loop > 0; f++) {
    let g = (f / FPS) % loop;
    let k = 0;
    while (g >= tracks[k].duration && k < tracks.length - 1) g -= tracks[k++].duration;
    order.push(k);
    clipFrames[k].push(Math.min(g, tracks[k].duration - 1 / FPS));
  }
  const readers = tracks.map((t, k) => t.sink.canvasesAtTimestamps(clipFrames[k]));
  if (useMedia && !still && !readers.length) notes.push("No hay foto ni video de fondo; se usó el fondo orgánico.");

  await output.start();
  if (audio) await audio.add(sound);
  try {
    for (let f = 0; f < frames; f++) {
      const t = from + f / FPS;
      let bg = still;
      if (readers.length) {
        const next = await readers[order[f]].next();
        if (!next.done && next.value) bg = { source: next.value.canvas, width: w, height: h };
      }
      drawLyricFrame(ctx, w, h, t, piece, bg, beats, layerAssets, glyphs, cuts);
      await video.add(f / FPS, 1 / FPS);
      if (f % 15 === 0) onProgress(0.03 + 0.97 * (f / frames));
    }
    await output.finalize();
  } finally {
    for (const reader of readers) await reader.return(undefined);
    for (const input of inputs) input.dispose();
  }
  onProgress(1);
  const mimeType = mp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([output.target.buffer!], { type: mimeType }), extension: mp4 ? "mp4" : "webm", mimeType, notes };
}
