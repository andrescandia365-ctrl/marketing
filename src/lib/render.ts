// Turns the storyboard into a video in the browser. Each shot plays its uploaded clip, or its still with a
// slow push-in, or a colour card; shots crossfade; the caption, the speaker's name and line, and the
// disclosure line are drawn on top. Clips' own sound can be mixed in. Encoded with WebCodecs through mediabunny, faster than real time.
import {
  ALL_FORMATS,
  AudioBufferSink,
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
  type WrappedCanvas,
} from "mediabunny";
import type { Board, Brief, Role } from "../../shared/schema.ts";
import { timeShots, totalSeconds, type TimedShot } from "../../shared/template.ts";

const FPS = 30;
const FADE = 0.35;
const SAMPLE_RATE = 48000;
const FONT = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;

const BEAT_COLORS = {
  negative: ["#2a1410", "#8a2a12"],
  touching: ["#1a1636", "#4a3ba8"],
  good: ["#0b231d", "#0f6e56"],
} as const;

export type ShotMedia = { image?: string; clip?: Blob };

export type Speaker = { name: string; role: Role };

// Speaker names are tinted by role so the Good-vs-Bad argument reads with the sound off.
const ROLE_COLOR: Record<Role, string> = {
  good: "#7fe3bf",
  bad: "#ff9c85",
  human: "#c9bfff",
  narrator: "#ffffff",
};

export type RenderOptions = {
  format: Brief["format"];
  disclosure: string;
  // Show each still or clip whole, with no zoom or crop, so a tool's watermark stays visible.
  fullFrame: boolean;
  keepSound: boolean;
  speakers: Record<string, Speaker>;
};

export type RenderResult = { blob: Blob; extension: string; mimeType: string; notes: string[] };

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

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  weight: number,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lineHeight = size * 1.18;
  wrapLines(ctx, text, maxWidth).forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
}

function fitRect(sw: number, sh: number, w: number, h: number, mode: "contain" | "cover", zoom = 1) {
  const scale = (mode === "contain" ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh)) * zoom;
  return { dw: sw * scale, dh: sh * scale };
}

// One layer per shot holds that shot's latest picture, so the crossfade can show the previous shot's last frame.
function paintStill(
  layer: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  shot: TimedShot,
  t: number,
  fullFrame: boolean,
) {
  const { width: w, height: h } = layer.canvas;
  layer.fillStyle = "#000";
  layer.fillRect(0, 0, w, h);
  if (!img) {
    const [a, b] = BEAT_COLORS[shot.beat];
    const g = layer.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    layer.fillStyle = g;
    layer.fillRect(0, 0, w, h);
    return;
  }
  if (fullFrame) {
    const { dw, dh } = fitRect(img.naturalWidth, img.naturalHeight, w, h, "contain");
    layer.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  const progress = Math.min(Math.max((t - shot.start) / (shot.end - shot.start), 0), 1);
  const { dw, dh } = fitRect(img.naturalWidth, img.naturalHeight, w, h, "cover", 1.04 + 0.08 * progress);
  const drift = (shot.index % 2 === 0 ? 1 : -1) * (dw - w) * 0.25 * (progress - 0.5);
  layer.drawImage(img, (w - dw) / 2 + drift, (h - dh) / 2, dw, dh);
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  shot: TimedShot,
  speaker: Speaker | undefined,
  t: number,
  disclosure: string,
) {
  const { width: w, height: h } = ctx.canvas;
  const unit = Math.min(w, h);

  // Shade top and bottom so white text reads on any picture.
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

  if (shot.onScreenText) drawText(ctx, shot.onScreenText, w / 2, h * 0.08, unit * 0.075, w * 0.86, 700);

  if (shot.disclosure !== "none") {
    ctx.shadowBlur = 0;
    ctx.font = `700 ${unit * 0.028}px ${FONT}`;
    const label = shot.disclosure === "concept" ? "CONCEPTO" : "SIMULACIÓN";
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
  if (speaker && shot.voiceover) {
    ctx.font = `700 ${unit * 0.032}px ${FONT}`;
    ctx.fillStyle = ROLE_COLOR[speaker.role];
    ctx.fillText(speaker.name.toUpperCase(), w / 2, subtitleTop - unit * 0.05);
    ctx.fillStyle = "#ffffff";
  }

  const subtitle = subtitleAt(shot, t);
  if (subtitle) drawText(ctx, subtitle, w / 2, subtitleTop, unit * 0.045, w * 0.84, 600);

  // Small, always-visible note such as "Imágenes ilustrativas", for platforms that ask for AI disclosure.
  if (disclosure) {
    ctx.globalAlpha = 0.8;
    ctx.textBaseline = "bottom";
    drawText(ctx, disclosure, w / 2, h - unit * 0.06, unit * 0.026, w * 0.9, 500);
    ctx.textBaseline = "top";
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

type OpenClip = { input: Input; frames: AsyncGenerator<WrappedCanvas | null, void, unknown> };

// Frames of a clip at exactly the times its shot needs; a clip shorter than its shot holds its last frame.
async function openClip(blob: Blob, shot: TimedShot, w: number, h: number, fullFrame: boolean): Promise<OpenClip> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(`El clip de la toma ${shot.index + 1} no tiene video.`);
  if (!(await track.canDecode())) {
    throw new Error(`Este navegador no puede leer el clip de la toma ${shot.index + 1}. Probá con Chrome o Edge.`);
  }
  const duration = await track.computeDuration();
  const sink = new CanvasSink(track, { width: w, height: h, fit: fullFrame ? "contain" : "cover" });
  const times: number[] = [];
  const frames = Math.round((shot.end - shot.start) * FPS);
  for (let f = 0; f < frames; f++) times.push(Math.min(f / FPS, Math.max(duration - 1 / FPS, 0)));
  return { input, frames: sink.canvasesAtTimestamps(times) };
}

// Mixes each clip's own sound onto the 75-second timeline, cut to its shot with short fades.
async function mixSound(shots: TimedShot[], media: Record<number, ShotMedia>, total: number): Promise<AudioBuffer | null> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * total), SAMPLE_RATE);
  let any = false;
  for (const shot of shots) {
    const clip = media[shot.index]?.clip;
    if (!clip) continue;
    const input = new Input({ source: new BlobSource(clip), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, shot.start);
      gain.gain.linearRampToValueAtTime(1, shot.start + 0.08);
      gain.gain.setValueAtTime(1, Math.max(shot.end - 0.08, shot.start + 0.08));
      gain.gain.linearRampToValueAtTime(0, shot.end);
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(0, shot.end - shot.start)) {
        const when = shot.start + timestamp;
        if (when >= shot.end) break;
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.start(when, 0, Math.min(buffer.duration, shot.end - when));
        any = true;
      }
    } finally {
      input.dispose();
    }
  }
  return any ? ctx.startRendering() : null;
}

export async function renderVideo(
  board: Board,
  media: Record<number, ShotMedia>,
  options: RenderOptions,
  onProgress: (fraction: number) => void,
): Promise<RenderResult> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Este navegador no puede generar video. Usá una versión reciente de Chrome, Edge o Safari.");
  }
  const notes: string[] = [];
  const [w, h] = options.format === "vertical" ? [1080, 1920] : [1920, 1080];
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], { width: w, height: h });
  if (!codec) throw new Error("Este navegador no tiene un codificador de video disponible.");
  const mp4 = codec === "avc";

  const shots = timeShots(board.shots);
  const total = totalSeconds(board.shots);
  const stills = await Promise.all(shots.map((s) => loadImage(media[s.index]?.image)));
  // Canvas text only uses a web font once it has loaded; without this the first frames fall back.
  await Promise.all(
    ["500", "600", "700"].map((weight) => document.fonts?.load(`${weight} 48px "IBM Plex Sans"`).catch(() => [])),
  );

  let sound: AudioBuffer | null = null;
  if (options.keepSound && shots.some((s) => media[s.index]?.clip)) {
    sound = await mixSound(shots, media, total);
    if (!sound) notes.push("Los clips no traían sonido que este navegador pueda leer.");
  }
  onProgress(0.05);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const layers = shots.map(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c.getContext("2d")!;
  });

  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });

  let audio: AudioBufferSource | null = null;
  if (sound) {
    const audioCodec = await getFirstEncodableAudioCodec(mp4 ? ["aac", "opus"] : ["opus", "vorbis"], {
      numberOfChannels: 2,
      sampleRate: SAMPLE_RATE,
    });
    if (audioCodec) {
      audio = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
      output.addAudioTrack(audio);
    } else notes.push("El sonido quedó afuera: este navegador no puede codificar audio.");
  }

  await output.start();
  if (audio && sound) await audio.add(sound);

  const open = new Map<number, OpenClip>();
  try {
    const frames = Math.round(total * FPS);
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      const i = Math.max(
        shots.findIndex((s) => t >= s.start && t < s.end),
        0,
      );
      const shot = shots[i];
      const layer = layers[i];
      const clip = media[shot.index]?.clip;

      if (clip) {
        let reader = open.get(i);
        if (!reader) {
          reader = await openClip(clip, shot, w, h, options.fullFrame);
          open.set(i, reader);
        }
        const next = await reader.frames.next();
        if (!next.done && next.value) {
          layer.fillStyle = "#000";
          layer.fillRect(0, 0, w, h);
          layer.drawImage(next.value.canvas, 0, 0, w, h);
        }
      } else {
        paintStill(layer, stills[i], shot, t, options.fullFrame);
      }

      ctx.globalAlpha = 1;
      if (i > 0 && t - shot.start < FADE) {
        ctx.drawImage(layers[i - 1].canvas, 0, 0);
        ctx.globalAlpha = (t - shot.start) / FADE;
      }
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.globalAlpha = 1;
      drawOverlay(ctx, shot, options.speakers[shot.speaker], t, options.disclosure.trim());

      await video.add(t, 1 / FPS);
      if (f % 15 === 0) onProgress(0.05 + 0.95 * (f / frames));
    }
    await output.finalize();
  } finally {
    for (const reader of open.values()) {
      await reader.frames.return(undefined);
      reader.input.dispose();
    }
  }
  onProgress(1);

  const mimeType = mp4 ? "video/mp4" : "video/webm";
  return {
    blob: new Blob([output.target.buffer!], { type: mimeType }),
    extension: mp4 ? "mp4" : "webm",
    mimeType,
    notes,
  };
}
