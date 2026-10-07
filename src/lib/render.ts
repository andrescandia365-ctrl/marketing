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
import type { TextStyle } from "../../shared/series.ts";
import { timeShots, totalSeconds, type TimedShot } from "../../shared/template.ts";
import { drawSketch, type SketchSetup } from "./sketch.ts";

const FPS = 30;
const FADE = 0.35;
const SAMPLE_RATE = 48000;
const FONT = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;

const BEAT_COLORS = {
  negative: ["#2a1410", "#8a2a12"],
  touching: ["#1a1636", "#4a3ba8"],
  good: ["#0b231d", "#0f6e56"],
} as const;

export type ShotMedia = { image?: string; clip?: Blob; voice?: Blob; sfx?: Blob };

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
  // Per shot (by index), how loud the clip's own sound plays: 1 whole, 0.3 low, 0 mute. Missing: whole.
  clipGain?: Record<number, number>;
  speakers: Record<string, Speaker>;
  // The headline at the top of each shot (the shot's onScreenText). Off hides it in the whole video.
  headlines: boolean;
  style: TextStyle;
  // Shots where someone is heard speaking (a voice file or Grok's own), so the music ducks under them.
  spoken: boolean[];
  music?: Blob;
  musicVolume: number;
  sfxVolume: number;
  // Move each cut to the nearest beat of the music.
  beatSync: boolean;
  // Always write an audio track (silent if nothing sounds), so files cut together (Publicidad's pieces).
  alwaysAudio?: boolean;
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

// Draws wrapped, centred text with the series' backing (shadow, outline or box) and returns its height.
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  weight: number,
  color: string,
  style: TextStyle,
): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lineHeight = size * 1.18;
  const lines = wrapLines(ctx, text, maxWidth);
  const height = lines.length * lineHeight;
  ctx.save();
  if (style.backing === "box") {
    const pad = size * 0.32;
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.68;
    ctx.fillStyle = style.backingColor;
    ctx.beginPath();
    const [bx, by, bw, bh] = [x - width / 2 - pad, y - pad * 0.55, width + pad * 2, height + pad * 1.1];
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, pad * 0.6);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.restore();
    ctx.save();
  }
  lines.forEach((line, i) => {
    const ly = y + i * lineHeight;
    if (style.backing === "outline") {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = style.backingColor;
      ctx.strokeText(line, x, ly);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.fillText(line, x, ly);
  });
  ctx.restore();
  return height;
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
  speakers: Record<string, Speaker>,
  t: number,
  options: Pick<RenderOptions, "disclosure" | "headlines" | "style">,
) {
  const { width: w, height: h } = ctx.canvas;
  const unit = Math.min(w, h);
  const { style } = options;
  const disclosure = options.disclosure.trim();

  // Shade top and bottom so the text reads on any picture.
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
  ctx.shadowColor = style.backing === "shadow" ? style.backingColor : "transparent";
  ctx.shadowBlur = style.backing === "shadow" ? unit * 0.012 : 0;

  if (options.headlines && shot.onScreenText) {
    const size = unit * 0.075 * (style.headlineSize / 100);
    drawText(ctx, shot.onScreenText, w / 2, h * 0.08, size, w * 0.86, 700, style.headlineColor, style);
  }

  if (shot.disclosure !== "none") {
    ctx.save();
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
    ctx.restore();
  }

  // A continuous take says who speaks and what beat by beat; a one-line shot splits its line by sentence.
  const beat = shot.timeline?.find((b) => t - shot.start >= b.from && t - shot.start < b.to);
  const speaker = speakers[beat ? beat.speaker : shot.speaker];
  // The subtitle block sits low but grows upward when large type wraps to more lines.
  const subtitle = beat ? beat.line : shot.timeline?.length ? "" : subtitleAt(shot, t);
  const subSize = unit * 0.045 * (style.subtitleSize / 100);
  ctx.font = `600 ${subSize}px ${FONT}`;
  const subHeight = subtitle ? wrapLines(ctx, subtitle, w * 0.84).length * subSize * 1.18 : 0;
  const floor = h - unit * (disclosure ? 0.13 : 0.08);
  const subtitleTop = Math.min(h * 0.8, floor - subHeight);

  if (speaker && subtitle) {
    const nameSize = unit * 0.032 * Math.max(style.subtitleSize / 100, 0.8);
    drawText(ctx, speaker.name.toUpperCase(), w / 2, subtitleTop - nameSize * 1.5, nameSize, w * 0.84, 700, ROLE_COLOR[speaker.role], style);
  }
  if (subtitle) drawText(ctx, subtitle, w / 2, subtitleTop, subSize, w * 0.84, 600, style.textColor, style);

  // Small, always-visible note such as "Imágenes ilustrativas", for platforms that ask for AI disclosure.
  if (disclosure) {
    ctx.globalAlpha = 0.8;
    const size = unit * 0.026;
    drawText(ctx, disclosure, w / 2, h - unit * 0.06 - size * 1.18, size, w * 0.9, 500, style.textColor, { ...style, backing: "shadow" });
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

// One shot at a moment, drawn exactly as the video draws it (picture, headline, speaker and line). The storyboard
// and its "Ver la pieza" playback use it, so the board looks like the finished piece.
export function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: TimedShot,
  img: HTMLImageElement | null,
  speakers: Record<string, Speaker>,
  t: number,
  options: Pick<RenderOptions, "disclosure" | "fullFrame" | "headlines" | "style"> & {
    // The storyboard's drawn sketch: with no picture, the shot's setups as a pencil sketch instead of the colour card.
    sketch?: SketchSetup[] | null;
  },
) {
  if (!img && options.sketch) drawSketch(ctx, shot, options.sketch);
  else paintStill(ctx, img, shot, t, options.fullFrame);
  drawOverlay(ctx, shot, speakers, t, options);
}

export { loadImage };

// A still of one shot with its type on top, for the style preview. Uses the shot's image, or its colour card.
export async function renderPreview(
  canvas: HTMLCanvasElement,
  board: Board,
  media: Record<number, ShotMedia>,
  options: Pick<RenderOptions, "format" | "disclosure" | "fullFrame" | "headlines" | "style" | "speakers">,
  index: number,
) {
  const shots = timeShots(board.shots);
  const shot = shots[index];
  if (!shot) return;
  const [w, h] = options.format === "vertical" ? [360, 640] : [640, 360];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = await loadImage(media[shot.index]?.image);
  await document.fonts?.load(`600 24px "IBM Plex Sans"`).catch(() => []);
  const mid = (shot.start + shot.end) / 2;
  paintStill(ctx, img, shot, mid, options.fullFrame);
  drawOverlay(ctx, shot, options.speakers, mid, options);
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

async function decodeAudio(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer | null> {
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

// Plays a decoded sound at `when`, cut at `until`, through a gain node.
function place(ctx: OfflineAudioContext, buffer: AudioBuffer, when: number, until: number, gain: AudioNode) {
  if (until <= when) return;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(gain);
  node.start(when, 0, Math.min(buffer.duration, until - when));
}

// The beats of the music: peaks of rising loudness (onsets), at least a quarter second apart.
export function findBeats(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const hop = 512;
  const energy: number[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + hop; j++) sum += data[j] * data[j];
    energy.push(Math.sqrt(sum / hop));
  }
  const flux = energy.map((e, i) => Math.max(0, e - (energy[i - 1] ?? 0)));
  const beats: number[] = [];
  const span = 20;
  let last = -1;
  for (let i = 1; i < flux.length - 1; i++) {
    let avg = 0;
    const from = Math.max(0, i - span);
    const to = Math.min(flux.length, i + span);
    for (let j = from; j < to; j++) avg += flux[j];
    avg /= to - from;
    const t = (i * hop) / buffer.sampleRate;
    if (flux[i] > avg * 1.6 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > 0.01 && t - last > 0.25) {
      beats.push(t);
      last = t;
    }
  }
  return beats;
}

// Moves each cut to the nearest beat within a third of a second, keeping every shot at least a second long.
export function alignCuts(shots: TimedShot[], beats: number[], window = 0.35): TimedShot[] {
  const out = shots.map((s) => ({ ...s }));
  for (let i = 1; i < out.length; i++) {
    const cut = out[i].start;
    const near = beats.reduce((best, b) => (Math.abs(b - cut) < Math.abs(best - cut) ? b : best), Infinity);
    if (Math.abs(near - cut) <= window && near > out[i - 1].start + 1 && near < out[i].end - 1) {
      out[i - 1].end = near;
      out[i].start = near;
    }
  }
  return out;
}

// The soundtrack: each clip's own sound, the voices, the sound effects and the music (ducked under speech).
async function mixSound(
  shots: TimedShot[],
  media: Record<number, ShotMedia>,
  total: number,
  options: RenderOptions,
  music: AudioBuffer | null,
): Promise<AudioBuffer | null> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * total), SAMPLE_RATE);
  let any = Boolean(options.alwaysAudio);
  for (const shot of shots) {
    const m = media[shot.index] ?? {};
    // A voice laid on top lowers the clip's own sound while it plays.
    const voice = m.voice ? await decodeAudio(ctx, m.voice) : null;
    if (voice) {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      place(ctx, voice, shot.start + 0.15, shot.end, gain);
      any = true;
    }
    const sfx = m.sfx ? await decodeAudio(ctx, m.sfx) : null;
    if (sfx) {
      const gain = ctx.createGain();
      gain.gain.value = options.sfxVolume;
      gain.connect(ctx.destination);
      place(ctx, sfx, shot.start, shot.end, gain);
      any = true;
    }
    const clipGain = options.clipGain?.[shot.index] ?? 1;
    if (!options.keepSound || !m.clip || clipGain <= 0) continue;
    const input = new Input({ source: new BlobSource(m.clip), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const level = (voice ? 0.3 : 1) * clipGain;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, shot.start);
      gain.gain.linearRampToValueAtTime(level, shot.start + 0.08);
      gain.gain.setValueAtTime(level, Math.max(shot.end - 0.08, shot.start + 0.08));
      gain.gain.linearRampToValueAtTime(0, shot.end);
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(0, shot.end - shot.start)) {
        const when = shot.start + timestamp;
        if (when >= shot.end) break;
        place(ctx, buffer, when, shot.end, gain);
        any = true;
      }
    } finally {
      input.dispose();
    }
  }
  if (music) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const full = options.musicVolume;
    const low = full * 0.35;
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(full, 0.5);
    for (const shot of shots) {
      const level = options.spoken[shot.index] ? low : full;
      gain.gain.setTargetAtTime(level, Math.max(shot.start - 0.1, 0.5), 0.08);
    }
    gain.gain.setTargetAtTime(0, Math.max(total - 1.5, 0), 0.4);
    place(ctx, music, 0, total, gain);
    any = true;
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

  const total = totalSeconds(board.shots);
  // The music is decoded once: it is mixed in, and its beats can move the cuts.
  const music = options.music ? await decodeAudio(new OfflineAudioContext(2, 1, SAMPLE_RATE), options.music) : null;
  if (options.music && !music) notes.push("La música no se pudo leer; el video salió sin ella.");
  let shots = timeShots(board.shots);
  if (music && options.beatSync) {
    shots = alignCuts(shots, findBeats(music));
    notes.push("Los cortes se movieron al ritmo de la música.");
  }
  const stills = await Promise.all(shots.map((s) => loadImage(media[s.index]?.image)));
  // Canvas text only uses a web font once it has loaded; without this the first frames fall back.
  await Promise.all(
    ["500", "600", "700"].map((weight) => document.fonts?.load(`${weight} 48px "IBM Plex Sans"`).catch(() => [])),
  );

  let sound: AudioBuffer | null = null;
  const hasAudio = shots.some((s) => media[s.index]?.voice || media[s.index]?.sfx || (options.keepSound && media[s.index]?.clip));
  if (hasAudio || music || options.alwaysAudio) {
    sound = await mixSound(shots, media, total, options, music);
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
      drawOverlay(ctx, shot, options.speakers, t, options);

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
