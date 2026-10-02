// Turns the storyboard into a video in the browser: each shot's image with a slow push-in,
// a short crossfade between shots, the caption on top, subtitles at the bottom, and the CTA on the
// last shot. Encoded with WebCodecs through mediabunny, so it runs faster than real time.
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { Brief, Script } from "../../shared/schema.ts";
import { TEMPLATE, TOTAL_SECONDS, timeShots, type TimedShot } from "../../shared/template.ts";

const FPS = 30;
const FADE = 0.35;

const BEAT_COLORS = {
  negative: ["#2a1410", "#8a2a12"],
  touching: ["#1a1636", "#4a3ba8"],
  good: ["#0b231d", "#0f6e56"],
} as const;

export type RenderResult = { blob: Blob; extension: string; mimeType: string };

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Splits a voiceover into sentences and gives each a share of the shot's time by length.
function subtitleAt(shot: TimedShot, t: number): string {
  const parts = shot.voiceover.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (parts.length <= 1) return shot.voiceover;
  const total = parts.reduce((n, p) => n + p.length, 0);
  let cursor = shot.start;
  for (const part of parts) {
    cursor += ((shot.end - shot.start) * part.length) / total;
    if (t < cursor) return part;
  }
  return parts[parts.length - 1];
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  shot: TimedShot,
  t: number,
  w: number,
  h: number,
) {
  const progress = Math.min(Math.max((t - shot.start) / (shot.end - shot.start), 0), 1);
  if (!img) {
    const [a, b] = BEAT_COLORS[TEMPLATE[shot.section].beat];
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (1.04 + 0.08 * progress);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const drift = (shot.index % 2 === 0 ? 1 : -1) * (dw - w) * 0.25 * (progress - 0.5);
  ctx.drawImage(img, (w - dw) / 2 + drift, (h - dh) / 2, dw, dh);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  weight: number,
): number {
  ctx.font = `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const lines = wrapLines(ctx, text, maxWidth);
  const lineHeight = size * 1.18;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  shots: TimedShot[],
  images: (HTMLImageElement | null)[],
  script: Script,
  t: number,
  w: number,
  h: number,
) {
  const i = Math.max(
    shots.findIndex((s) => t >= s.start && t < s.end),
    t >= TOTAL_SECONDS ? shots.length - 1 : 0,
  );
  const shot = shots[i];
  const unit = Math.min(w, h);

  ctx.globalAlpha = 1;
  if (i > 0 && t - shot.start < FADE) {
    drawCover(ctx, images[i - 1], shots[i - 1], t, w, h);
    ctx.globalAlpha = (t - shot.start) / FADE;
  }
  drawCover(ctx, images[i], shot, t, w, h);
  ctx.globalAlpha = 1;

  // Shade top and bottom so white text reads on any image.
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  top.addColorStop(0, "rgba(0,0,0,0.55)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.3);
  const bottom = ctx.createLinearGradient(0, h * 0.55, 0, h);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = unit * 0.012;
  ctx.fillStyle = "#ffffff";

  if (shot.onScreenText) {
    drawText(ctx, shot.onScreenText, w / 2, h * 0.08, unit * 0.075, w * 0.86, 800);
  }

  if (shot.disclosure !== "none") {
    ctx.shadowBlur = 0;
    ctx.font = `700 ${unit * 0.028}px Inter, system-ui, sans-serif`;
    const label = shot.disclosure.toUpperCase();
    const pad = unit * 0.018;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(w - tw - pad * 3, pad * 2, tw + pad * 2, unit * 0.028 + pad * 1.4);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(label, w - tw - pad * 2, pad * 2.7);
    ctx.textAlign = "center";
    ctx.shadowBlur = unit * 0.012;
  }

  let subtitleTop = h * 0.8;
  if (shot.section === "button" && script.cta) {
    ctx.shadowBlur = 0;
    const size = unit * 0.05;
    ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
    const tw = Math.min(ctx.measureText(script.cta).width, w * 0.8);
    const pillH = size * 1.9;
    const pillY = h * 0.62;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(w / 2 - tw / 2 - size, pillY, tw + size * 2, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = "#15171c";
    ctx.textBaseline = "middle";
    ctx.fillText(script.cta, w / 2, pillY + pillH / 2, w * 0.8);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = unit * 0.012;
    subtitleTop = Math.max(subtitleTop, pillY + pillH + size);
  }

  const subtitle = subtitleAt(shot, t);
  if (subtitle) drawText(ctx, subtitle, w / 2, subtitleTop, unit * 0.045, w * 0.84, 600);
  ctx.shadowBlur = 0;
}

export async function renderVideo(
  script: Script,
  images: Record<number, string>,
  format: Brief["format"],
  onProgress: (fraction: number) => void,
): Promise<RenderResult> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser cannot encode video. Use a recent Chrome, Edge or Safari.");
  }
  const [w, h] = format === "vertical" ? [1080, 1920] : [1920, 1080];
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], { width: w, height: h });
  if (!codec) throw new Error("No video encoder is available in this browser.");

  const shots = timeShots(script.shots);
  const loaded = await Promise.all(shots.map((s) => loadImage(images[s.index])));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const mp4 = codec === "avc";
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const frames = TOTAL_SECONDS * FPS;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    drawFrame(ctx, shots, loaded, script, t, w, h);
    await source.add(t, 1 / FPS);
    if (f % 15 === 0) onProgress(f / frames);
  }
  await output.finalize();
  onProgress(1);

  const mimeType = mp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([output.target.buffer!], { type: mimeType }), extension: mp4 ? "mp4" : "webm", mimeType };
}
