// The motion engine. Every frame is a pure function of time: drawMotionFrame(t) paints frame t from the script,
// the brand and preloaded images only. No timers, no state carried between frames; noise is seeded (mulberry32),
// never Math.random. The studio's banned defaults are not here: no centred title on a gradient, no
// everything-fades-in, no corner labels or frame borders, no glow, no particle bursts.
import { actingFor, drawPuppet, mouthBlockStart, puppetPose, type Acting, type PuppetAsset } from "./puppet.ts";
import type { ActorAsset } from "./actor.ts";
import {
  STAT_COUNT,
  TYPE_CPS,
  blurSamples,
  cameraAt,
  carriedAsset,
  DISCLOSURE_TAG,
  cutPush,
  disclosureAt,
  elementTimes,
  focusShare,
  itemsOf,
  labelled,
  noticeParts,
  pushOf,
  slotsPlan,
  statCountText,
  timeScenes,
  typingSeconds,
  type MotionScene,
  type MotionScript,
  type MotionTemplate,
  type MotionTone,
  type TimedScene,
} from "../../shared/motion.ts";
import { BUTTONS_FROM, PHONE_SAFE, isPhoneFrame, safeRect } from "../../shared/safeZone.ts";
import { stepDownColour, type Brand, type BrandMotion } from "../../shared/series.ts";
import { cueAt, litWord, type SubtitleCue } from "../../shared/subtitles.ts";
import { videoAssetOf } from "../../shared/screenVideo.ts";
import { WORLD_DEPTH, busyClear, worldOf, worldPalette, worldShapes, worldStepDown, type WorldPlace } from "../../shared/world.ts";

// screen: a real screenshot of the app (shown inside a phone or laptop). video: the screen's recording ("Videos de la
// app funcionando"), its address, length and size; a scene with a clip plays it (assetOf). note: a short line drawn
// on the picture when its recording could not be read and the still stands in for it.
export type MotionAsset = {
  image: CanvasImageSource;
  width: number;
  height: number;
  name: string;
  screen?: boolean;
  video?: { url: string; seconds: number; width: number; height: number; poster?: CanvasImageSource };
  note?: string;
};
// The players of the screens' recordings (src/lib/screenVideo.ts): each scene's own player, already sought to the
// second frame t shows before the frame is drawn. frame() is null while it is not there (still loading, or failed).
export type VideoFrames = { frame(sceneId: string): CanvasImageSource | null; failed(asset: string): boolean };
export const VIDEO_FAILED_NOTE = "No se pudo leer el video: va la imagen fija";
// "Escena de código" (src/lib/codeSandbox.ts): the frames the pasted animation painted in its sandbox, already asked
// for scene time lt before an exact capture draws (drawReady); the preview shows the latest one. frame() is null
// while there is none yet; problem() says why, when it failed.
export type CodeFrames = {
  frame(sceneId: string, lt: number, w: number, h: number): CanvasImageSource | null;
  problem(sceneId: string): string | null;
  // Asks every code frame frame t draws and resolves when they are in hand (CodeDeck.ready).
  ready?(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }): Promise<void>;
  // The live preview: asks frame t without waiting (CodeDeck.follow).
  follow?(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }): void;
};
export type MotionWorld = {
  brand: Brand;
  // By cast id, or "layer:N".
  assets: Record<string, MotionAsset>;
  logo: MotionAsset | null;
  beats: number[];
  seed: number;
  disclosure: string;
  // Characters' 3D-look puppets, by cast id (a character with an image but no parts is a puppet of one piece).
  puppets?: Record<string, PuppetAsset>;
  // Rigged humanoids (GLB) by cast id. When present, the character scene walks and turns instead of using the puppet.
  actors?: Record<string, ActorAsset>;
  // How loud the voices are, `rate` values a second over the whole piece (0..1), and the scenes that have a voice
  // file; other scenes with a line move the mouth to the rhythm of the words.
  speech?: { rate: number; data: Float32Array; scenes: string[] };
  // Motion blur during the push between scenes (the piece's "Desenfoque en los cortes", blurSamples). Absent: none.
  cutBlur?: boolean;
  // The subtitle cues (pieceSubtitles): word by word, or each scene's whole line. Absent: each scene's whole line.
  subtitles?: SubtitleCue[];
  // The screens' recordings, sought for frame t by the caller before it draws (VideoFrames). Absent: the stills.
  videos?: VideoFrames;
  // The code scenes' frames (CodeFrames). Absent: a code scene shows what is missing.
  code?: CodeFrames;
};

// The picture a scene draws for one of its elements: its cast image, or, when the scene plays its screen's recording
// (scene.recording), that scene's player at the second frame t shows, in the recording's own size. While the player has no
// frame the still stands in (the poster); when the recording could not be read it says so on the picture.
export function assetOf(world: MotionWorld, s: Pick<MotionScene, "id" | "template" | "asset" | "assetB" | "recording">, key: "media" | "prop"): MotionAsset | undefined {
  const id = key === "prop" ? s.assetB : s.asset;
  const base = id ? world.assets[id] : undefined;
  if (!base?.video || !s.recording || !playsRecording(s, key)) return base;
  const sized = { ...base, image: base.video.poster ?? base.image, width: base.video.width, height: base.video.height };
  const frame = world.videos?.frame(s.id);
  if (frame) return { ...sized, image: frame };
  return world.videos?.failed(id) ? { ...sized, note: VIDEO_FAILED_NOTE } : sized;
}
const playsRecording = (s: Pick<MotionScene, "template" | "asset" | "assetB">, key: "media" | "prop") => videoAssetOf(s)?.key === key;

// How open a character's mouth is at piece time t in scene s (scene time lt).
function talkLevel(world: MotionWorld, s: TimedScene, t: number, lt: number): number {
  const line = s.voice.trim();
  if (!line) return 0;
  if (world.speech && world.speech.scenes.includes(s.id)) {
    const i = Math.floor(t * world.speech.rate);
    const v = world.speech.data[i] ?? 0;
    return Math.min(1, Math.max(0, (v - 0.08) * 1.4));
  }
  const at = elementTimes(s).voice ?? 0.25;
  const length = line.split(/\s+/).filter(Boolean).length / 2.5;
  if (lt < at || lt > at + length) return 0;
  const syllables = Math.max(0, Math.sin((lt - at) * Math.PI * 2 * 4.4 + noise(world.seed + 11, lt * 1.7) * 2));
  return syllables * (0.6 + 0.4 * noise(world.seed + 13, lt * 3));
}

// ── Seeded noise ────────────────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (seed: number, i: number) => mulberry32(seed * 7919 + i * 104729)();

// Smooth value noise in -1..1.
export function noise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(seed, i) * (1 - u) + hash(seed, i + 1) * u) * 2 - 1;
}

// ── Easing ──────────────────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const inOutCubic = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const outBack = (x: number) => {
  const v = clamp01(x);
  return 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2;
};
// A bigger overshoot, for the absurdist tone's pop.
const outBackBig = (x: number) => {
  const v = clamp01(x);
  return 1 + 3.4 * (v - 1) ** 3 + 2.4 * (v - 1) ** 2;
};
// A damped spring that starts at 0, overshoots and settles on 1 by the end of the entrance (absurdist: livelier).
const spring = (bounce: number) => {
  // What the decay leaves at the end is taken out evenly along the way, so the curve lands on 1 with no snap.
  const tail = Math.exp(-6) * Math.cos(bounce);
  return (x: number) => {
    const v = clamp01(x);
    return 1 - Math.exp(-6 * v) * Math.cos(bounce * v) + tail * v;
  };
};
const outQuart = (x: number) => 1 - (1 - clamp01(x)) ** 4;
const inOutSine = (x: number) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
// How things land. The brand's physics decides when it has one (firm, soft, springy); otherwise the tone: dry settles
// with no overshoot, warm with a small one, absurdist pops. A dry piece never bounces, whatever the brand. Every curve
// ends on 1 when the entrance ends, so the reading times stay the same.
export const landFor = (tone: MotionTone | undefined, motion: BrandMotion | undefined) => {
  if (motion === "solid") return outQuart;
  if (motion === "soft") return inOutSine;
  if (motion === "springy") return tone === "dry" ? outCubic : spring(tone === "absurdist" ? 13 : 10.5);
  return tone === "dry" ? outCubic : tone === "absurdist" ? outBackBig : outBack;
};

// Templates whose main element holds words to read (a real screen, the typed field, the before/after labels, a logo
// that may be a wordmark): it never breathes there.
const STILL_MEDIA: readonly MotionTemplate[] = ["screen", "zoom", "type", "steps", "beforeAfter", "logo", "contradiction", "notify", "flow", "slots", "stat"];

// Pictures breathe once they are in (soft: a slow drift; springy: a small breath and bob): a photo, the product, a
// picture in a hook or under callouts, what a character holds. Text never moves while it is read, so nothing with
// words in it breathes (real screens included), and nothing breathes for a firm or even brand. A pure function of t,
// seeded per element.
function idleLife(f: Frame, s: TimedScene, key: string): { dx: number; dy: number; k: number } {
  const still = { dx: 0, dy: 0, k: 1 };
  const motion = f.world.brand.motion;
  if ((motion !== "soft" && motion !== "springy") || (key !== "media" && key !== "prop")) return still;
  if (key === "media" && STILL_MEDIA.includes(s.template)) return still;
  const asset = f.world.assets[key === "prop" ? s.assetB : s.asset];
  if (!asset || asset.screen) return still;
  const lt = f.t - s.start;
  const ease = clamp01((lt - (elementTimes(s)[key] ?? 0) - 0.6) / 0.8);
  if (ease <= 0) return { dx: 0, dy: 0, k: 1 };
  const seed = f.world.seed + s.index * 31 + (key === "prop" ? 17 : 0);
  if (motion === "soft")
    return { dx: noise(seed, f.t * 0.12) * f.unit * 0.008 * ease, dy: noise(seed + 5, f.t * 0.1) * f.unit * 0.006 * ease, k: 1 };
  const phase = (seed % 97) / 97;
  const breath = Math.sin((f.t / 2.8 + phase) * Math.PI * 2);
  return { dx: 0, dy: breath * f.unit * 0.004 * ease, k: 1 + breath * 0.012 * ease };
}
const span = (t: number, from: number, dur: number) => clamp01((t - from) / dur);

// "Foco de a uno": the colours of a label or step (`item0`…) at scene time lt. The newest is at full strength; an
// earlier one steps down toward the background while a newer one enters (focusShare), and stays readable
// (stepDownColour keeps STEP_DOWN_CONTRAST). Anything that is not a label of a callouts or steps scene: the brand's own.
function focus(f: Frame, s: TimedScene, key: string, lt: number): { text: string; accent: string } {
  const { text, accent, bg } = f.world.brand;
  const share = focusShare(s, key, lt);
  // Over an illustrated world the step also keeps its contrast on the world's tones (worldStepDown).
  if (share > 0 && worldOf(s, f.pieceWorld)) {
    const palette = worldPalette(f.world.brand);
    return { text: worldStepDown(text, f.world.brand, palette, share), accent: worldStepDown(accent, f.world.brand, palette, share) };
  }
  return { text: stepDownColour(text, bg, share), accent: stepDownColour(accent, bg, share) };
}

function beatPulse(beats: number[], t: number): number {
  let last = -1;
  for (const b of beats) {
    if (b > t) break;
    last = b;
  }
  return last < 0 ? 0 : Math.exp(-(t - last) * 7);
}

function hexA(hex: string, alpha: number): string {
  return `${hex}${Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export type Box = { x: number; y: number; w: number; h: number };
// Where each visible element of the current scene ended up, for the editor's hit test. Drawing never reads it.
export type Probe = (sceneId: string, key: string, box: Box) => void;

type Frame = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  unit: number;
  vertical: boolean;
  world: MotionWorld;
  t: number;
  probe?: Probe;
  // The tone's landing curve (landFor).
  land: (x: number) => number;
  // How a puppet acts (actingFor): its anticipation and overshoot follow the same brand and tone.
  acting: Acting;
  // "Continuidad": the element (key) the carry draws instead of the scene, while it travels across the cut.
  hide?: string;
  // "Un mundo ilustrado": the piece's place (script.world); a scene's own choice wins (worldOf).
  pieceWorld?: WorldPlace;
  // A measuring pass (wordBoxes): nothing is painted, so the costly drawers (a rigged character) are skipped.
  dry?: boolean;
};

const display = (f: Frame, size: number, weight = 700) => `${weight} ${size}px "${f.world.brand.displayFont}", "Inter", system-ui, sans-serif`;
const ui = (f: Frame, size: number, weight = 500) => `${weight} ${size}px "${f.world.brand.uiFont}", "Inter", system-ui, sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Words rise out of a mask one after the other; the last word takes the accent.
function kineticTitle(f: Frame, text: string, x: number, y: number, size: number, max: number, lt: number, start: number) {
  const { ctx } = f;
  ctx.font = display(f, size);
  const lines = wrap(ctx, text, max);
  const lh = size * 1.02;
  const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  let k = 0;
  const total = text.split(/\s+/).filter(Boolean).length;
  lines.forEach((line, li) => {
    let cx = x;
    const baseline = y + li * lh;
    for (const word of line.split(" ")) {
      const p = outCubic(span(lt, start + k * 0.11, 0.45));
      const ww = ctx.measureText(word).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - size * 0.05, baseline - size * 0.95, ww + size * 0.1, size * 1.25);
      ctx.clip();
      ctx.fillStyle = k === total - 1 ? f.world.brand.accent : f.world.brand.text;
      ctx.fillText(word, cx, baseline + (1 - p) * size * 1.1);
      ctx.restore();
      cx += ww + ctx.measureText(" ").width;
      k++;
    }
  });
  return { w: width, h: lines.length * lh };
}

// Supporting text slides in from the left (never a plain fade).
function slideText(f: Frame, text: string, x: number, y: number, size: number, max: number, p: number): Box {
  const { ctx } = f;
  ctx.font = ui(f, size);
  const lines = text ? wrap(ctx, text, max) : [];
  const box = { x, y: y - size, w: Math.max(0, ...lines.map((l) => ctx.measureText(l).width)), h: lines.length * size * 1.3 };
  if (!text || p <= 0) return box;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, p * 1.6);
  ctx.fillStyle = hexA(f.world.brand.text, 0.86);
  lines.forEach((l, i) => ctx.fillText(l, x - (1 - p) * f.unit * 0.08, y + i * size * 1.3));
  ctx.restore();
  return box;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function fitInto(a: { width: number; height: number }, w: number, h: number, mode: "contain" | "cover") {
  const s = mode === "contain" ? Math.min(w / a.width, h / a.height) : Math.max(w / a.width, h / a.height);
  return { w: a.width * s, h: a.height * s };
}

function placeholder(f: Frame, x: number, y: number, w: number, h: number, label: string) {
  const { ctx } = f;
  ctx.save();
  ctx.fillStyle = hexA(f.world.brand.text, 0.08);
  roundRect(ctx, x, y, w, h, f.unit * 0.02);
  ctx.fill();
  ctx.fillStyle = hexA(f.world.brand.text, 0.55);
  ctx.font = ui(f, f.unit * 0.028);
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

// A real screen inside a device: a phone for portrait screens, a laptop for landscape ones.
function device(f: Frame, asset: MotionAsset | undefined, cx: number, cy: number, height: number, label: string) {
  const { ctx, unit } = f;
  const landscape = asset ? asset.width > asset.height : false;
  const ratio = asset ? asset.width / asset.height : 9 / 19.5;
  const sh = landscape ? height * 0.62 : height;
  const sw = sh * ratio;
  const bezel = unit * (landscape ? 0.012 : 0.016);
  const x = cx - sw / 2;
  const y = cy - sh / 2;
  ctx.save();
  ctx.fillStyle = "#0b0b0d";
  roundRect(ctx, x - bezel, y - bezel, sw + bezel * 2, sh + bezel * 2, landscape ? unit * 0.012 : unit * 0.05);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, sw, sh, landscape ? unit * 0.004 : unit * 0.04);
  ctx.clip();
  if (asset) ctx.drawImage(asset.image, x, y, sw, sh);
  else placeholder(f, x, y, sw, sh, label);
  if (asset?.note) pictureNote(f, asset.note, x, y, sw, sh);
  ctx.restore();
  if (landscape) {
    ctx.fillStyle = "#1a1a1e";
    roundRect(ctx, x - sw * 0.08, y + sh + bezel, sw * 1.16, unit * 0.022, unit * 0.008);
    ctx.fill();
  }
  ctx.restore();
  return { x, y, w: sw, h: sh };
}

// A short line across the bottom of a picture (a recording that could not be read), so nobody takes the still for it.
function pictureNote(f: Frame, text: string, x: number, y: number, w: number, h: number) {
  const { ctx } = f;
  const size = Math.max(9, Math.min(f.unit * 0.026, w * 0.07));
  ctx.save();
  ctx.font = ui(f, size, 600);
  const lines = wrap(ctx, text, w * 0.86);
  const bh = lines.length * size * 1.25 + size * 0.7;
  ctx.fillStyle = "rgba(11, 11, 13, 0.82)";
  ctx.fillRect(x, y + h - bh, w, bh);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h - bh + size * 0.35 + size * (i + 1) * 1.15));
  ctx.restore();
}

function drawImage(f: Frame, asset: MotionAsset | undefined, cx: number, cy: number, maxW: number, maxH: number, label: string) {
  if (!asset) {
    placeholder(f, cx - maxW / 2, cy - maxH / 2, maxW, maxH, label);
    return { x: cx - maxW / 2, y: cy - maxH / 2, w: maxW, h: maxH };
  }
  const s = fitInto(asset, maxW, maxH, "contain");
  f.ctx.drawImage(asset.image, cx - s.w / 2, cy - s.h / 2, s.w, s.h);
  if (asset.note) pictureNote(f, asset.note, cx - s.w / 2, cy - s.h / 2, s.w, s.h);
  return { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h };
}

// The background: the brand's flat colour and one large accent form that drifts on seeded noise and breathes with
// the beat. No gradient, no particles.
function backdrop(f: Frame) {
  const { ctx, w, h, unit, world, t } = f;
  ctx.fillStyle = world.brand.bg;
  ctx.fillRect(0, 0, w, h);
  const pulse = beatPulse(world.beats, t);
  const r = unit * (0.55 + 0.025 * pulse);
  const x = w * (0.82 + 0.06 * noise(world.seed, t * 0.15));
  const y = h * (0.18 + 0.05 * noise(world.seed + 1, t * 0.12));
  ctx.save();
  ctx.fillStyle = hexA(world.brand.accent, 0.13);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Un mundo ilustrado ──────────────────────────────────────────────────────────
// A 2D context that paints nothing: it keeps its own state (font, alignment, the save/restore stack) and measures
// text on the real context with that font. A measuring pass of a scene draws on it.
function dryContext(real: CanvasRenderingContext2D): CanvasRenderingContext2D {
  let props: Record<string | symbol, unknown> = {};
  const stack: Record<string | symbol, unknown>[] = [];
  const own: Record<string | symbol, unknown> = {
    save: () => stack.push({ ...props }),
    restore: () => {
      props = stack.pop() ?? props;
    },
    measureText: (text: string) => {
      real.save();
      if (typeof props.font === "string") real.font = props.font;
      const m = real.measureText(text);
      real.restore();
      return m;
    },
    canvas: real.canvas,
  };
  return new Proxy(own, {
    get: (o, k) => {
      if (k in o) return o[k];
      if (k in props) return props[k];
      const v = (real as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === "function" ? () => undefined : v;
    },
    set: (_o, k, v) => {
      props[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

// Where a scene's words sit, in scene coordinates (before the camera): the boxes a measuring pass of the scene reports
// for everything but its pictures, once most of its words are in and again at its end. A pure function of the scene and
// the frame size, so the world leaves the same shapes out for the whole scene.
function wordBoxes(f: Frame, s: TimedScene): Box[] {
  const boxes: Box[] = [];
  const ctx = dryContext(f.ctx);
  // "Escribir" draws its text field and "Casilleros" its named boxes under "media": they hold words, so they count.
  const wordy = s.template === "type" || s.template === "slots";
  const probe: Probe = (_id, key, box) => {
    if (key === "prop" || (key === "media" && !wordy)) return;
    boxes.push(box);
  };
  for (const lt of [s.seconds * 0.6, s.seconds - 0.001]) {
    ctx.save();
    drawScene({ ...f, ctx, probe, hide: undefined, dry: true }, s, lt);
    ctx.restore();
  }
  return boxes;
}

// What stays put on the frame whatever the camera does: the scene's subtitle (all of its line) and the AI notice.
function fixedBoxes(f: Frame, s: TimedScene): Box[] {
  const ctx = dryContext(f.ctx);
  const out: Box[] = [];
  const { box, noticeY } = overlayLayout({ ...f, ctx }, s.voice);
  if (s.voice.trim()) out.push(box);
  if (f.world.disclosure) out.push({ x: 0, y: noticeY - f.unit * 0.03, w: f.w, h: f.unit * 0.045 });
  return out;
}

// The scene's place, behind everything it draws: the wall (the brand's background), then three layers of flat shapes
// in the brand's tints (worldPalette keeps the text and accent contrast on every tone), each taking its share of the
// scene camera's move (WORLD_DEPTH: parallax). Busy shapes never sit behind the scene's words (busyClear, checked over
// the camera's whole move, so nothing appears or goes mid-scene). No gradient, no glow, no particles, nothing moves
// but the camera.
function drawWorld(f: Frame, s: TimedScene, lt: number, place: WorldPlace) {
  const { ctx, w, h, unit, world } = f;
  const tones = worldPalette(world.brand);
  const cams = [0, 0.25, 0.5, 0.75, 1].map((u) => cameraAt(s.camera, u));
  const shapes = busyClear(worldShapes(place, w, h, world.seed), wordBoxes(f, s), cams, w, h, unit * 0.03, fixedBoxes(f, s));
  const cam = cameraAt(s.camera, lt / Math.max(0.2, s.seconds));
  ctx.save();
  // The place stays inside the scene's own frame, so in a push or a carry it slides with its scene and never covers
  // the other one (the layers' reach past the frame is for the camera, inside this rect).
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = tones.wall;
  ctx.fillRect(0, 0, w, h);
  for (const layer of [0, 1, 2] as const) {
    const d = WORLD_DEPTH[layer];
    const z = 1 + (cam.z - 1) * d;
    ctx.save();
    ctx.translate(w / 2 + cam.x * d * w, h / 2 + cam.y * d * h);
    ctx.scale(z, z);
    ctx.translate(-w / 2, -h / 2);
    for (const sh of shapes) {
      if (sh.layer !== layer) continue;
      ctx.fillStyle = tones[sh.tone];
      if (sh.kind === "rect") ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
      else {
        if (sh.kind === "circle") {
          ctx.beginPath();
          ctx.arc(sh.x + sh.w / 2, sh.y + sh.h / 2, Math.min(sh.w, sh.h) / 2, 0, Math.PI * 2);
        } else roundRect(ctx, sh.x, sh.y, sh.w, sh.h, Math.min(sh.r ?? 0, sh.w / 2, sh.h / 2));
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

// Grok's separated layers (back to front), each drifting by its depth: parallax.
export function drawLayers(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, layers: MotionAsset[], beats: number[], seed: number) {
  const pulse = beatPulse(beats, t);
  layers.forEach((layer, i) => {
    const depth = (i + 1) / layers.length;
    const s = fitInto(layer, w, h, "cover");
    const scale = 1.06 + 0.04 * depth + 0.015 * depth * pulse;
    const dx = noise(seed + i * 13, t * 0.09) * w * 0.035 * depth;
    const dy = noise(seed + i * 29, t * 0.07) * h * 0.02 * depth;
    ctx.drawImage(layer.image, (w - s.w * scale) / 2 + dx, (h - s.h * scale) / 2 + dy, s.w * scale, s.h * scale);
  });
}

// Where the voice's subtitle and the AI notice go. On a 9:16 frame both stay inside the part the platforms leave
// alone (shared/safeZone.ts): above their caption and left of their buttons. Other formats keep them low.
function overlayLayout(f: Pick<Frame, "ctx" | "w" | "h" | "unit" | "world">, text: string) {
  const { ctx, w, h, unit, world } = f;
  const size = unit * 0.038;
  const phone = isPhoneFrame(w, h);
  const safe = safeRect(w, h);
  const cx = phone ? safe.x + safe.w / 2 : w / 2;
  ctx.font = `600 ${size}px "${world.brand.uiFont}", "Inter", system-ui, sans-serif`;
  const lines = text.trim() ? wrap(ctx, text, phone ? safe.w * 0.96 : w * 0.84) : [];
  const noticeY = phone ? safe.y + safe.h - unit * 0.008 : h - unit * 0.05;
  const lastLine = phone ? safe.y + safe.h - unit * (world.disclosure ? 0.045 : 0.01) : h - unit * (world.disclosure ? 0.14 : 0.1);
  const y0 = lastLine - lines.length * size * 1.25;
  const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  const box: Box = { x: cx - width / 2, y: y0 + size * 0.25, w: width, h: lines.length * size * 1.25 };
  return { size, cx, lines, y0, noticeY, box };
}

function subtitle(f: Frame, text: string) {
  if (!text.trim()) return;
  const { ctx } = f;
  const { size, cx, lines, y0 } = overlayLayout(f, text);
  ctx.save();
  ctx.font = ui(f, size, 600);
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = f.world.brand.text;
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + (i + 1) * size * 1.25));
  ctx.restore();
}

// The cue's text at frame t. Word by word, the chunk stays put while it is read and only the colours change: the
// word being said in the full text colour with a short accent bar under it, the others dimmer; before the first word
// all are dim, and once the last is said all are full. Words keep their places (each line laid out once, left to
// right from its centred start), so nothing moves while it is read.
function subtitleCue(f: Frame, cue: SubtitleCue) {
  const text = cue.words.map((w) => w.text).join(" ");
  if (!cue.karaoke) return subtitle(f, text);
  const { ctx, t, world } = f;
  const { size, cx, lines, y0 } = overlayLayout(f, text);
  const lit = litWord(cue, t);
  const after = lit < 0 && t >= (cue.words[0]?.start ?? 0);
  ctx.save();
  ctx.font = ui(f, size, 600);
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = size * 0.35;
  const space = ctx.measureText(" ").width;
  let k = 0;
  lines.forEach((line, row) => {
    const y = y0 + (row + 1) * size * 1.25;
    let x = cx - ctx.measureText(line).width / 2;
    for (const word of line.split(" ")) {
      const wide = ctx.measureText(word).width;
      const on = after || k === lit;
      ctx.fillStyle = on ? world.brand.text : hexA(world.brand.text, 0.55);
      ctx.fillText(word, x, y);
      if (k === lit) {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = world.brand.accent;
        ctx.fillRect(x, y + size * 0.22, wide, Math.max(2, size * 0.07));
        ctx.restore();
      }
      x += wide + space;
      k++;
    }
  });
  ctx.restore();
}

// The subtitle on screen at frame t: the piece's cue for the scene on screen, or its whole line when the world has no cues.
function subtitleAt(f: Frame, scene: TimedScene) {
  if (!f.world.subtitles) return subtitle(f, scene.voice);
  const cue = cueAt(f.world.subtitles, scene.id, f.t);
  if (cue) subtitleCue(f, cue);
}

// The text of the subtitle on screen at t (empty when silent).
function subtitleText(world: MotionWorld, scene: TimedScene, t: number): string {
  if (!world.subtitles) return scene.voice;
  return cueAt(world.subtitles, scene.id, t)?.words.map((w) => w.text).join(" ") ?? "";
}

function footer(f: Frame) {
  if (!f.world.disclosure) return;
  const { ctx, unit } = f;
  const { cx, noticeY } = overlayLayout(f, "");
  ctx.save();
  ctx.font = ui(f, unit * 0.022);
  ctx.textAlign = "center";
  ctx.fillStyle = hexA(f.world.brand.text, 0.65);
  ctx.fillText(f.world.disclosure, cx, noticeY);
  ctx.restore();
}

// The CONCEPTO / SIMULACIÓN label (a hard rule), the story's look: white capitals on a dark box in the top right
// corner, inside the 9:16 safe zone (below the top bar, left of the button column). It never moves with the camera
// or the cut, and it appears with its scene (disclosureAt).
function labelLayout(ctx: CanvasRenderingContext2D, w: number, h: number, world: MotionWorld, tag: string) {
  const unit = Math.min(w, h);
  const size = unit * 0.028;
  const pad = unit * 0.018;
  const phone = isPhoneFrame(w, h);
  const safe = safeRect(w, h);
  ctx.font = `700 ${size}px "${world.brand.uiFont}", "Inter", system-ui, sans-serif`;
  const tw = ctx.measureText(tag).width;
  const right = phone ? safe.x + safe.w : w;
  const top = phone ? safe.y : 0;
  const box: Box = { x: right - tw - pad * 3, y: top + pad * 2, w: tw + pad * 2, h: size + pad * 1.4 };
  return { box, size, textX: right - tw - pad * 2, textY: top + pad * 2.7 };
}

// Where a labelled scene's own words start at the latest: under the label (labelLayout's box and a small gap).
export function labelFloor(w: number, h: number): number {
  const unit = Math.min(w, h);
  return (isPhoneFrame(w, h) ? safeRect(w, h).y : 0) + unit * (0.018 * 2 + 0.028 + 0.018 * 1.4 + 0.02);
}

function disclosureLabel(f: Frame, scenes: TimedScene[], push: number) {
  const which = disclosureAt(scenes, push, f.t);
  if (!which) return;
  const { ctx, w, h, world } = f;
  const tag = DISCLOSURE_TAG[which];
  ctx.save();
  const { box, textX, textY } = labelLayout(ctx, w, h, world, tag);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(tag, textX, textY);
  ctx.restore();
}

// The label's box at piece time t, for the overlap check. Null when frame t has no label.
export function disclosureBox(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, script: MotionScript, world: MotionWorld): Box | null {
  const which = disclosureAt(script.scenes, cutPush(script.tone), t);
  if (!which) return null;
  ctx.save();
  const { box } = labelLayout(ctx, w, h, world, DISCLOSURE_TAG[which]);
  ctx.restore();
  return box;
}

// The subtitle's box at piece time t (the voice of the scene on screen), for the overlap check. Empty when silent.
export function subtitleBox(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, script: MotionScript, world: MotionWorld): Box | null {
  const scenes = timeScenes(script.scenes);
  if (!scenes.length) return null;
  const voice = subtitleText(world, scenes[sceneAt(scenes, t)], t);
  if (!voice.trim()) return null;
  ctx.save();
  const { box } = overlayLayout({ ctx, w, h, unit: Math.min(w, h), world }, voice);
  ctx.restore();
  return box;
}

// Draws one element with the person's hand adjustment: moved by (dx, dy) and scaled around its anchor (ax, ay).
// `draw` returns the element's box in frame coordinates without the adjustment; the adjusted box goes to the probe
// when the element is on screen, and back to the caller.
function place(f: Frame, s: TimedScene, key: string, ax: number, ay: number, shown: boolean, draw: () => Box): Box {
  const spot = f.vertical ? s.tweaks?.[key]?.v : s.tweaks?.[key]?.h;
  const life = idleLife(f, s, key);
  const dx = (spot?.dx ?? 0) * f.unit + life.dx;
  const dy = (spot?.dy ?? 0) * f.unit + life.dy;
  const k = (spot?.scale ?? 1) * life.k;
  const { ctx } = f;
  ctx.save();
  // Hidden while the carry draws it: laid out (its box still places what hangs off it), but clipped to nothing.
  if (f.hide === key) {
    ctx.beginPath();
    ctx.rect(0, 0, 0, 0);
    ctx.clip();
  }
  ctx.translate(ax + dx, ay + dy);
  ctx.scale(k, k);
  ctx.translate(-ax, -ay);
  const box = draw();
  ctx.restore();
  const out = { x: ax + dx + (box.x - ax) * k, y: ay + dy + (box.y - ay) * k, w: box.w * k, h: box.h * k };
  if (shown && f.hide !== key && f.probe && out.w > 0 && out.h > 0) f.probe(s.id, key, out);
  return out;
}

const titleBox = (x: number, y: number, size: number, r: { w: number; h: number }): Box => ({ x, y: y - size * 0.95, w: r.w, h: r.h + size * 0.1 });

// On a 9:16 frame the subtitle and the AI notice sit at the bottom of the safe zone (overlayLayout). The templates'
// own words end above them: the floor leaves room for a two-line subtitle when the scene has a voice. Pictures may
// still run behind the subtitle, as captions do over a picture. Other formats: the frame's bottom.
export function floorOf(s: Pick<MotionScene, "voice">, w: number, h: number, notice: boolean): number {
  if (!isPhoneFrame(w, h)) return h;
  const unit = Math.min(w, h);
  const safe = safeRect(w, h);
  return safe.y + safe.h - unit * (notice ? 0.045 : 0.01) - (s.voice.trim() ? 2 * unit * 0.038 * 1.25 : 0) - unit * 0.02;
}

// Where a template puts its main picture (the one "Continuidad" carries, carriedAsset): its centre, which is also the
// anchor of the hand adjustment, and the box it fits in. A device (a real screen in a phone or laptop) is maxH tall; an
// image fits inside maxW x maxH. The templates draw from this, and the carry reads it, so both agree. Null: the
// template has no such picture.
export type MediaLayout = { key: "media" | "prop"; cx: number; cy: number; maxW: number; maxH: number; device: boolean };
export function mediaLayout(s: Pick<MotionScene, "template" | "assetB" | "items" | "voice">, w: number, h: number, notice: boolean, screen = false): MediaLayout | null {
  const vertical = h > w;
  const unit = Math.min(w, h);
  switch (s.template) {
    case "hook":
      return { key: "media", cx: vertical ? w / 2 : w * 0.75, cy: vertical ? h * 0.72 : h / 2, maxW: vertical ? w * 0.6 : w * 0.35, maxH: vertical ? h * 0.3 : h * 0.6, device: false };
    case "screen": {
      const maxH = vertical ? h * 0.52 : h * 0.62;
      return { key: "media", cx: vertical ? w / 2 : w * 0.66, cy: vertical ? h * 0.58 : h * 0.44, maxW: maxH, maxH, device: true };
    }
    case "zoom": {
      const maxH = vertical ? h * 0.55 : h * 0.72;
      return { key: "media", cx: w / 2, cy: vertical ? h * 0.58 : h * 0.55, maxW: maxH, maxH, device: true };
    }
    case "callouts":
      return { key: "media", cx: vertical ? w / 2 : w * 0.42, cy: vertical ? h * 0.5 : h * 0.55, maxW: vertical ? w * 0.62 : w * 0.38, maxH: vertical ? h * 0.38 : h * 0.6, device: false };
    case "product": {
      const phone = isPhoneFrame(w, h);
      // On a phone frame the product and its price both end above the subtitle.
      const imageH = phone ? Math.min(h * 0.45, floorOf(s, w, h, notice) - (s.items[0] ? unit * 0.12 : 0) - h * 0.27) : vertical ? h * 0.45 : h * 0.6;
      const cy = vertical ? (phone ? h * 0.27 + imageH / 2 : h * 0.52) : h * 0.55;
      return { key: "media", cx: w / 2, cy, maxW: vertical ? w * 0.75 : w * 0.45, maxH: imageH, device: false };
    }
    case "character": {
      if (!s.assetB) return null;
      const size = vertical ? h * 0.3 : h * 0.5;
      return { key: "prop", cx: vertical ? w * 0.7 : w * 0.47, cy: vertical ? h * 0.5 : h * 0.47, maxW: size, maxH: size, device: screen };
    }
    default:
      return null;
  }
}

// The product floats and tilts a little on seeded noise (a pure function of piece time t).
export function productWobble(seed: number, index: number, t: number, unit: number): { dy: number; rot: number } {
  return { dy: noise(seed + index, t * 0.5) * unit * 0.012, rot: noise(seed + 7, t * 0.3) * 0.04 };
}

// How far the zoom template has zoomed in at scene time lt.
function zoomAt(s: MotionScene, lt: number): { zoomP: number; z: number } {
  const zoomP = inOutCubic(span(lt, elementTimes(s).zoom ?? 0, 0.9));
  return { zoomP, z: 1 + (s.zoom - 1) * zoomP };
}

// ── "Continuidad": the carried picture ─────────────────────────────────────────────
// The picture's box at one end of the carry, in frame coordinates: the picture itself (x, y, w, h; inside the device
// when there is one), its tilt, and the device's bezel, corners and laptop base (0 for a bare image), so that every
// part can be interpolated and the picture lands exactly where the scene draws it.
export type CarryBox = { x: number; y: number; w: number; h: number; rot: number; bezel: number; outer: number; inner: number; base: number };
// What the carry knows of the picture: its shape (null: not loaded, drawn as the placeholder box) and whether it is a
// real screen (a character presents a real screen in a device).
export type CarryLook = { aspect: number | null; screen: boolean; notice: boolean; seed: number };

// Where scene s draws its main picture at scene time lt, settled (its own entrance done, as a carried picture is),
// after the zoom, the hand adjustment and the camera. A pure function of the templates' layout, never of drawing
// state. Null when the scene has no main picture. The idle breath of soft and springy brands is left out (under 1 %).
export function carryBox(s: TimedScene, lt: number, w: number, h: number, look: CarryLook): CarryBox | null {
  const L = mediaLayout(s, w, h, look.notice, look.screen);
  if (!L || !carriedAsset(s)) return null;
  const vertical = h > w;
  const unit = Math.min(w, h);
  let x: number, y: number, bw: number, bh: number;
  let bezel = 0, outer = 0, inner = 0, base = 0, rot = 0;
  if (L.device) {
    const ratio = look.aspect ?? 9 / 19.5;
    const landscape = look.aspect !== null && look.aspect > 1;
    bh = landscape ? L.maxH * 0.62 : L.maxH;
    bw = bh * ratio;
    bezel = unit * (landscape ? 0.012 : 0.016);
    outer = landscape ? unit * 0.012 : unit * 0.05;
    inner = landscape ? unit * 0.004 : unit * 0.04;
    base = landscape ? unit * 0.022 : 0;
  } else if (look.aspect) {
    const k = Math.min(L.maxW / look.aspect, L.maxH);
    bh = k;
    bw = k * look.aspect;
  } else {
    bw = L.maxW;
    bh = L.maxH;
  }
  x = L.cx - bw / 2;
  y = L.cy - bh / 2;
  let k = 1;
  if (s.template === "zoom") {
    const { zoomP, z } = zoomAt(s, lt);
    const fx = (s.focusX - 0.5) * bw;
    const fy = (s.focusY - 0.5) * bh;
    x = L.cx - fx * z * zoomP - (bw / 2) * z;
    y = L.cy - fy * z * zoomP - (bh / 2) * z;
    k = z;
  }
  if (s.template === "product") {
    const wob = productWobble(look.seed, s.index, s.start + lt, unit);
    y += wob.dy;
    rot = wob.rot;
  }
  bw *= k;
  bh *= k;
  // The hand adjustment, around the element's anchor.
  const spot = vertical ? s.tweaks?.[L.key]?.v : s.tweaks?.[L.key]?.h;
  const sk = spot?.scale ?? 1;
  const ax = L.cx;
  const ay = L.cy;
  x = ax + (spot?.dx ?? 0) * unit + (x - ax) * sk;
  y = ay + (spot?.dy ?? 0) * unit + (y - ay) * sk;
  bw *= sk;
  bh *= sk;
  k *= sk;
  // The scene's camera at that moment.
  const cam = cameraAt(s.camera, lt / Math.max(0.2, s.seconds));
  x = w / 2 + cam.x * w + (x - w / 2) * cam.z;
  y = h / 2 + cam.y * h + (y - h / 2) * cam.z;
  bw *= cam.z;
  bh *= cam.z;
  k *= cam.z;
  return { x, y, w: bw, h: bh, rot, bezel: bezel * k, outer: outer * k, inner: inner * k, base: base * k };
}

// The box part e of the way from a to b (e may overshoot 1 a little: the brand's or tone's landing).
export function lerpBox(a: CarryBox, b: CarryBox, e: number): CarryBox {
  const mix = (p: number, q: number) => p + (q - p) * e;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    w: Math.max(1, mix(a.w, b.w)),
    h: Math.max(1, mix(a.h, b.h)),
    rot: mix(a.rot, b.rot),
    bezel: Math.max(0, mix(a.bezel, b.bezel)),
    outer: Math.max(0, mix(a.outer, b.outer)),
    inner: Math.max(0, mix(a.inner, b.inner)),
    base: Math.max(0, mix(a.base, b.base)),
  };
}

// The carry's curve: it starts gently and lands as the piece lands things (landFor): a dry piece never overshoots.
export const carryCurve = (land: (x: number) => number) => (x: number) => land(inOutSine(x));

function drawCarried(f: Frame, asset: MotionAsset | undefined, b: CarryBox) {
  const { ctx, unit, world } = f;
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(b.rot);
  ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
  if (b.bezel > 0.3) {
    ctx.fillStyle = "#0b0b0d";
    roundRect(ctx, b.x - b.bezel, b.y - b.bezel, b.w + b.bezel * 2, b.h + b.bezel * 2, b.outer);
    ctx.fill();
  }
  if (b.base > 0.3) {
    ctx.fillStyle = "#1a1a1e";
    roundRect(ctx, b.x - b.w * 0.08, b.y + b.h + b.bezel, b.w * 1.16, b.base, unit * 0.008);
    ctx.fill();
  }
  roundRect(ctx, b.x, b.y, b.w, b.h, b.inner);
  ctx.clip();
  if (asset) ctx.drawImage(asset.image, b.x, b.y, b.w, b.h);
  else {
    ctx.fillStyle = hexA(world.brand.text, 0.08);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  if (asset?.note) pictureNote(f, asset.note, b.x, b.y, b.w, b.h);
  ctx.restore();
}

// ── Avisos, Flujo y Casilleros: where things go ────────────────────────────────────
// Pure functions of the frame's size and the band the template may use (top to bottom, the 9:16 floor included), so
// the drawing and the tests read the same boxes. On 9:16 everything stays left of the platform's buttons.
export type Pt = { x: number; y: number };

function listColumn(w: number, h: number): { left: number; right: number; unit: number; m: number } {
  const unit = Math.min(w, h);
  const m = unit * 0.08;
  if (!isPhoneFrame(w, h)) return { left: m, right: w - m, unit, m };
  const safe = safeRect(w, h);
  return { left: Math.max(m, safe.x), right: Math.min(w - m, safe.x + safe.w), unit, m };
}

// "Avisos": one card per notification, one below the other from `top` (a new one never pushes the others), each as
// tall as fits the band, up to a fifth of the short side. 16:9: the right half (the title holds the left).
export function noticeLayout(n: number, w: number, h: number, top: number, bottom: number): Box[] {
  if (n <= 0) return [];
  const { left, right, unit } = listColumn(w, h);
  const vertical = h > w;
  const x = vertical ? left : w * 0.46;
  const gap = unit * 0.03;
  const ch = Math.max(unit * 0.08, Math.min(unit * 0.19, (bottom - top - gap * (n - 1)) / n));
  return Array.from({ length: n }, (_, i) => ({ x, y: top + i * (ch + gap), w: right - x, h: ch }));
}

// "Flujo": the source and where it goes. 16:9: the source on the left, the places in a column on the right, each line
// an elbow through the middle. 9:16: the source across the top, a trunk down its left side and a branch to each place.
export function flowLayout(n: number, w: number, h: number, top: number, bottom: number): { source: Box; places: Box[]; paths: Pt[][] } {
  const { left, right, unit, m } = listColumn(w, h);
  if (w >= h) {
    const sh = unit * 0.17;
    const mid = (top + bottom) / 2;
    const source = { x: m, y: mid - sh / 2, w: w * 0.28, h: sh };
    const px = w * 0.56;
    const gap = unit * 0.04;
    const ph = n ? Math.max(unit * 0.06, Math.min(unit * 0.12, (bottom - top - gap * (n - 1)) / n)) : 0;
    const y0 = mid - (n * ph + (n - 1) * gap) / 2;
    const places = Array.from({ length: n }, (_, i) => ({ x: px, y: y0 + i * (ph + gap), w: right - px, h: ph }));
    const sx = source.x + source.w;
    const mx = (sx + px) / 2;
    const paths = places.map((p) => [
      { x: sx, y: mid },
      { x: mx, y: mid },
      { x: mx, y: p.y + p.h / 2 },
      { x: px, y: p.y + p.h / 2 },
    ]);
    return { source, places, paths };
  }
  const source = { x: left, y: top, w: right - left, h: unit * 0.15 };
  const trunk = left + unit * 0.07;
  const px = left + unit * 0.17;
  const from = source.y + source.h + unit * 0.07;
  const gap = unit * 0.035;
  const ph = n ? Math.max(unit * 0.06, Math.min(unit * 0.12, (bottom - from - gap * (n - 1)) / n)) : 0;
  const places = Array.from({ length: n }, (_, i) => ({ x: px, y: from + i * (ph + gap), w: right - px, h: ph }));
  const paths = places.map((p) => [
    { x: trunk, y: source.y + source.h },
    { x: trunk, y: p.y + p.h / 2 },
    { x: px, y: p.y + p.h / 2 },
  ]);
  return { source, places, paths };
}

// "Casilleros": the boxes, with `label` of room under each for its name. 16:9: one row from the left margin. 9:16: two
// columns (one box alone), as many rows as it takes, shorter when the band is short.
export function slotsLayout(n: number, w: number, h: number, top: number, bottom: number): { boxes: Box[]; label: number } {
  const { left, right, unit } = listColumn(w, h);
  const label = unit * 0.1;
  const gap = unit * 0.04;
  if (n <= 0) return { boxes: [], label };
  if (w >= h) {
    const bw = Math.min(unit * 0.32, (right - left - gap * (n - 1)) / n);
    const bh = Math.max(unit * 0.06, Math.min(bw * 0.7, bottom - top - label));
    const y = top + Math.max(0, (bottom - top - bh - label) / 2);
    return { boxes: Array.from({ length: n }, (_, i) => ({ x: left + i * (bw + gap), y, w: bw, h: bh })), label };
  }
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const bw = Math.min(unit * 0.4, (right - left - gap * (cols - 1)) / cols);
  const bh = Math.max(unit * 0.06, Math.min(bw * 0.6, (bottom - top - gap * (rows - 1)) / rows - label));
  const boxes = Array.from({ length: n }, (_, i) => ({ x: left + (i % cols) * (bw + gap), y: top + Math.floor(i / cols) * (bh + label + gap), w: bw, h: bh }));
  return { boxes, label };
}

// The first part p (0 to 1) of a line through `points`, by length: a line that draws itself in.
export function partialPath(points: Pt[], p: number): Pt[] {
  if (points.length < 2) return points.slice();
  const lengths = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
  let left = Math.max(0, Math.min(1, p)) * lengths.reduce((a, b) => a + b, 0);
  const out = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (left >= lengths[i]) {
      out.push(b);
      left -= lengths[i];
      continue;
    }
    const k = lengths[i] > 0 ? left / lengths[i] : 0;
    if (k > 0) out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    break;
  }
  return out;
}

// ── Templates ───────────────────────────────────────────────────────────────────
function drawScene(f: Frame, s: TimedScene, lt: number) {
  const { ctx, w, h, unit, vertical, world } = f;
  const m = unit * 0.08;
  const T = elementTimes(s);
  const at = (key: string) => T[key] ?? 0;
  // "Continuidad": the picture carried in from the scene before is already in, settled, from the cut.
  const carried = s.carryIn ? carriedAsset(s)?.key : undefined;
  const enter = (key: string, dur: number, ease: (x: number) => number = f.land) => (key === carried ? 1 : ease(span(lt, at(key), dur)));
  const put = (key: string, ax: number, ay: number, draw: () => Box) => place(f, s, key, ax, ay, lt >= at(key) || key === carried, draw);
  const offset = (key: string) => {
    const spot = vertical ? s.tweaks?.[key]?.v : s.tweaks?.[key]?.h;
    return { dx: (spot?.dx ?? 0) * unit, dy: (spot?.dy ?? 0) * unit };
  };
  const asset = assetOf(world, s, "media");
  const missing = s.asset ? `Falta la imagen: ${s.asset}` : "Sin imagen";
  const land = f.land;
  // On a 9:16 frame the subtitle and the AI notice sit at the bottom of the safe zone (overlayLayout). The templates'
  // own words end above them: `floor` leaves room for a two-line subtitle when the scene has a voice. Pictures may
  // still run behind the subtitle, as captions do over a picture.
  const phone = isPhoneFrame(w, h);
  const safe = safeRect(w, h);
  const floor = floorOf(s, w, h, Boolean(world.disclosure));
  const lay = mediaLayout(s, w, h, Boolean(world.disclosure));
  const titleSize = unit * (vertical ? 0.1 : 0.085);
  // On a 9:16 frame a title near the top starts below the platforms' top bar (shared/safeZone.ts).
  // A scene labelled CONCEPTO or SIMULACIÓN keeps its title under the label, on both formats.
  const topSafe = (y: number, size: number) =>
    Math.max(isPhoneFrame(w, h) ? Math.max(y, h * PHONE_SAFE.top + size * 0.95) : y, labelled(s) ? labelFloor(w, h) + size * 0.95 : 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // A title that rises in word by word, with its box.
  const title = (x: number, y: number, size: number, max: number, extra?: (r: { w: number; h: number }) => void) => {
    let height = 0;
    put("title", x, y, () => {
      const r = kineticTitle(f, s.title, x, y, size, max, lt, at("title"));
      height = r.h;
      extra?.(r);
      return titleBox(x, y, size, r);
    });
    return height;
  };
  const text = (x: number, y: number, size: number, max: number, p: number) => put("text", x, y, () => slideText(f, s.text, x, y, size, max, p));

  switch (s.template) {
    case "code": {
      // The pasted animation paints the whole frame in its sandbox; the subtitle and the notice go on top as always.
      const img = world.code?.frame(s.id, lt, w, h) ?? null;
      put("media", w / 2, h / 2, () => {
        if (img) ctx.drawImage(img, 0, 0, w, h);
        else {
          const why = world.code?.problem(s.id) ?? (s.code?.source.trim() ? (s.code.error ? `La animación falló: ${s.code.error}` : "Preparando la animación…") : "Escena de código: pegá el código de la animación");
          placeholder(f, m, h * 0.3, w - m * 2, h * 0.3, why.length > 64 ? `${why.slice(0, 62)}…` : why);
        }
        return { x: 0, y: 0, w, h };
      });
      break;
    }
    case "hook": {
      const ty = vertical ? h * 0.36 : h * 0.4;
      const hTitle = title(m, ty, unit * (vertical ? 0.13 : 0.11), w - m * 2, (r) => {
        // The accent bar draws under the title.
        const bar = outCubic(span(lt, at("title") + 0.45, 0.5));
        ctx.fillStyle = world.brand.accent;
        ctx.fillRect(m, ty + r.h - unit * 0.05, (w - m * 2) * 0.35 * bar, unit * 0.014);
      });
      text(m, ty + hTitle + unit * 0.04, unit * 0.045, w - m * 2, outCubic(span(lt, at("text"), 0.5)));
      if (asset && lay) {
        const p = enter("media", 0.6);
        const { cx, cy } = lay;
        put("media", cx, cy, () => {
          ctx.globalAlpha = clamp01(p);
          return drawImage(f, asset, cx, cy + (vertical ? (1 - p) * unit * 0.2 : 0), lay.maxW, lay.maxH, missing);
        });
      }
      break;
    }
    case "screen": {
      const p = enter("media", 0.6);
      const { cx, cy } = lay!;
      put("media", cx, cy, () => {
        ctx.translate(cx, cy + (1 - p) * h * 0.6);
        ctx.rotate((1 - enter("media", 0.8, outCubic)) * 0.1);
        const b = device(f, asset, 0, 0, lay!.maxH, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      const titleY = topSafe(vertical ? h * 0.12 : h * 0.3, titleSize);
      const hTitle = title(m, titleY, titleSize, vertical ? w - m * 2 : w * 0.38);
      text(m, titleY + hTitle, unit * 0.04, vertical ? w - m * 2 : w * 0.36, outCubic(span(lt, at("text"), 0.5)));
      break;
    }
    case "zoom": {
      const { zoomP, z } = zoomAt(s, lt);
      const dh = lay!.maxH;
      const landscape = asset ? asset.width > asset.height : false;
      const ratio = asset ? asset.width / asset.height : 9 / 19.5;
      const devH = landscape ? dh * 0.62 : dh;
      const dw = devH * ratio;
      const { cx, cy } = lay!;
      const fx = (s.focusX - 0.5) * dw;
      const fy = (s.focusY - 0.5) * devH;
      put("media", cx, cy, () => {
        ctx.translate(cx - fx * z * zoomP, cy - fy * z * zoomP);
        ctx.scale(z, z);
        device(f, asset, 0, 0, dh, missing);
        // The ring draws itself around the feature, then a tap ripples.
        const ring = outCubic(span(lt, at("ring"), 0.5));
        ctx.strokeStyle = world.brand.accent;
        ctx.lineWidth = (unit * 0.008) / z;
        ctx.beginPath();
        ctx.arc(fx, fy, (unit * 0.07) / z, -Math.PI / 2, -Math.PI / 2 + ring * Math.PI * 2);
        ctx.stroke();
        const tap = span(lt, at("ring") + 0.5, 0.7);
        if (tap > 0 && tap < 1) {
          ctx.globalAlpha = 1 - tap;
          ctx.beginPath();
          ctx.arc(fx, fy, ((unit * 0.03) / z) * (1 + tap * 2), 0, Math.PI * 2);
          ctx.stroke();
        }
        return { x: cx - dw / 2, y: cy - devH / 2, w: dw, h: devH };
      });
      title(m, topSafe(vertical ? h * 0.15 : h * 0.16, titleSize * 0.9), titleSize * 0.9, w - m * 2);
      break;
    }
    case "character": {
      // A 3D-look puppet says the line (its mouth follows the voice) and makes its gesture; it can point at or
      // present a real screen or the product (assetB).
      const actor = s.asset ? world.actors?.[s.asset] : undefined;
      const puppet = s.asset ? world.puppets?.[s.asset] : undefined;
      const prop = assetOf(world, s, "prop");
      const hasProp = Boolean(s.assetB);
      const cx = vertical ? (hasProp ? w * 0.3 : w / 2) : hasProp ? w * 0.8 : w * 0.72;
      const bottom = vertical ? h * 0.87 : h * 0.97;
      const height = vertical ? h * (hasProp ? 0.46 : 0.52) : h * 0.8;
      const toward = hasProp ? (vertical ? 1 : -1) : 1;
      if (hasProp) {
        const p = enter("prop", 0.55);
        const { cx: px, cy: py, maxH: size } = lay!;
        put("prop", px, py, () => {
          ctx.translate(px, py + (1 - clamp01(p)) * unit * 0.2);
          ctx.rotate((1 - clamp01(p)) * -0.12);
          ctx.globalAlpha *= clamp01(p * 1.5);
          const b = prop?.screen
            ? device(f, prop, 0, 0, size, `Falta la imagen: ${s.assetB}`)
            : drawImage(f, prop, 0, 0, size, size, `Falta la imagen: ${s.assetB}`);
          return { x: px + b.x, y: py + b.y, w: b.w, h: b.h };
        });
      }
      put("media", cx, bottom, () => {
        if (actor && !f.dry) {
          return actor.draw(ctx, cx, bottom, height, Math.max(0, lt - at("media")), s.seconds, s.move ?? "walk", talkLevel(world, s, f.t, lt));
        }
        if (!puppet) {
          placeholder(f, cx - height * 0.3, bottom - height, height * 0.6, height, s.asset ? `Falta el personaje: ${s.asset}` : "Elegí un personaje");
          return { x: cx - height * 0.3, y: bottom - height, w: height * 0.6, h: height };
        }
        // The face reads the line's emotion; the mouth's shape is picked from the voice at the start of its block.
        const back = f.t - mouthBlockStart(f.t);
        const face = { emotion: s.emotion ?? "", aiming: hasProp, held: talkLevel(world, s, f.t - back, lt - back) };
        const pose = puppetPose(f.t, lt, at("media"), s.gesture ?? "present", at("gesture"), talkLevel(world, s, f.t, lt), toward, world.seed + s.index * 7, f.acting, face);
        return drawPuppet(ctx, puppet, cx, bottom, height, pose);
      });
      const titleY = topSafe(vertical ? h * 0.13 : h * 0.2, titleSize);
      const hTitle = title(m, titleY, titleSize, vertical ? w - m * 2 : w * 0.4);
      text(m, titleY + hTitle + unit * 0.02, unit * 0.042, vertical ? w - m * 2 : w * 0.38, outCubic(span(lt, at("text"), 0.5)));
      break;
    }
    case "type": {
      // The product in use: a field appears, the title is typed into it letter by letter, a button is tapped and
      // the result (the text) arrives below.
      const fw = vertical ? w - m * 2 : w * 0.62;
      const fh = unit * 0.14;
      const fx = m;
      const fy = vertical ? h * 0.36 : h * 0.38;
      const p = land(span(lt, at("media"), 0.55));
      const size = unit * 0.05;
      const typedEnd = at("title") + typingSeconds(s.title);
      const field = put("media", fx + fw / 2, fy + fh / 2, () => {
        ctx.globalAlpha = clamp01(p);
        ctx.translate(0, (1 - clamp01(p)) * unit * 0.06);
        ctx.fillStyle = hexA(world.brand.text, 0.07);
        roundRect(ctx, fx, fy, fw, fh, fh / 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, unit * 0.004);
        ctx.strokeStyle = hexA(world.brand.text, lt >= at("title") ? 0.6 : 0.3);
        ctx.stroke();
        return { x: fx, y: fy, w: fw, h: fh };
      });
      const shown = Math.max(0, Math.min(s.title.length, Math.floor((lt - at("title")) * TYPE_CPS)));
      const placeholder = s.items[0] ?? "";
      put("title", fx + fh * 0.45, fy + fh / 2, () => {
        ctx.save();
        roundRect(ctx, field.x, field.y, field.w, field.h, field.h / 2);
        ctx.clip();
        ctx.textBaseline = "middle";
        ctx.font = ui(f, size, 500);
        const tx = field.x + fh * 0.45;
        const ty = field.y + field.h / 2;
        if (shown === 0 && placeholder && p > 0.5) {
          ctx.fillStyle = hexA(world.brand.text, 0.4);
          ctx.fillText(placeholder, tx, ty);
        }
        const typed = s.title.slice(0, shown);
        ctx.fillStyle = world.brand.text;
        ctx.fillText(typed, tx, ty);
        // The caret: steady while typing, then blinking (a pure function of the scene time).
        const typing = lt >= at("title") && lt < typedEnd;
        if (p > 0.5 && (typing || Math.floor(lt * 2.5) % 2 === 0)) {
          ctx.fillStyle = world.brand.accent;
          ctx.fillRect(tx + ctx.measureText(typed).width + unit * 0.006, ty - size * 0.6, Math.max(2, unit * 0.005), size * 1.2);
        }
        ctx.restore();
        ctx.font = ui(f, size, 500);
        return { x: tx, y: ty - size * 0.7, w: Math.max(ctx.measureText(s.title).width, ctx.measureText(placeholder).width, unit * 0.1), h: size * 1.4 };
      });
      const button = s.items[1];
      if (button) {
        const q = land(span(lt, at("tag"), 0.45));
        ctx.font = ui(f, unit * 0.042, 700);
        const bw = ctx.measureText(button).width + unit * 0.08;
        const bh = unit * 0.085;
        const bx = vertical ? fx + fw - bw : fx + fw + unit * 0.03;
        const by = vertical ? fy + fh + unit * 0.035 : fy + (fh - bh) / 2;
        put("tag", bx + bw / 2, by + bh / 2, () => {
          ctx.translate(bx + bw / 2, by + bh / 2);
          ctx.scale(Math.max(0, q), Math.max(0, q));
          ctx.fillStyle = world.brand.accent;
          roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = ui(f, unit * 0.042, 700);
          ctx.fillText(button, 0, 0);
          // The tap: a ring that grows and fades.
          const tap = span(lt, at("tag") + 0.25, 0.6);
          if (tap > 0 && tap < 1) {
            ctx.globalAlpha = 1 - tap;
            ctx.strokeStyle = world.brand.text;
            ctx.lineWidth = unit * 0.005;
            ctx.beginPath();
            ctx.arc(0, 0, bh * (0.4 + tap * 0.9), 0, Math.PI * 2);
            ctx.stroke();
          }
          return { x: bx, y: by, w: bw, h: bh };
        });
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      const resultY = fy + fh + unit * (vertical && button ? 0.2 : 0.11);
      text(m, resultY, unit * 0.048, vertical ? w - m * 2 : w * 0.62, outCubic(span(lt, at("text"), 0.5)));
      break;
    }
    case "callouts": {
      const p = enter("media", 0.6);
      const { cx, cy } = lay!;
      const box = put("media", cx, cy, () => {
        ctx.translate(cx, cy);
        ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
        const b = drawImage(f, asset, 0, 0, lay!.maxW, lay!.maxH, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      title(m, topSafe(vertical ? h * 0.14 : h * 0.15, titleSize * 0.85), titleSize * 0.85, w - m * 2);
      s.items.forEach((item, i) => {
        const key = `item${i}`;
        const q = outCubic(span(lt, at(key), 0.45));
        if (q <= 0) return;
        const rnd = mulberry32(world.seed + s.index * 31 + i);
        const ax = box.x + box.w * (0.25 + 0.5 * rnd());
        const ay = box.y + box.h * (0.2 + 0.6 * rnd());
        const right = vertical ? i % 2 === 1 : true;
        const lx = vertical ? (right ? w - m : m) : w * 0.68;
        const low = phone ? Math.min(h * 0.72, floor - unit * 0.115) : h * 0.72;
        const ly = vertical ? (i < 2 ? h * 0.27 + i * unit * 0.09 : low + (i - 2) * unit * 0.09) : h * 0.3 + i * unit * 0.12;
        // Only the newest label is at full strength: the earlier ones, their lines and dots step down as it arrives.
        const look = focus(f, s, key, lt);
        // The line runs from the dot on the image to wherever the label is.
        const { dx, dy } = offset(key);
        ctx.strokeStyle = look.accent;
        ctx.lineWidth = unit * 0.004;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (lx + dx - ax) * q, ay + (ly + dy - ay) * q);
        ctx.stroke();
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.arc(ax, ay, unit * 0.01, 0, Math.PI * 2);
        ctx.fill();
        put(key, lx, ly, () => {
          ctx.font = ui(f, unit * 0.036, 600);
          const tw = ctx.measureText(item).width;
          const pad = unit * 0.018;
          const bx = right ? lx - tw - pad * 2 : lx;
          const slide = (right ? 1 : -1) * (1 - q) * unit * 0.06;
          ctx.globalAlpha *= q;
          // The label stays opaque (it may sit over the picture); its words keep the background colour, so they read
          // against the stepped-down box as well as the box does against the background.
          ctx.fillStyle = look.text;
          roundRect(ctx, bx + slide, ly - unit * 0.035, tw + pad * 2, unit * 0.06, unit * 0.012);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.fillText(item, bx + pad + slide, ly + unit * 0.008);
          return { x: bx, y: ly - unit * 0.035, w: tw + pad * 2, h: unit * 0.06 };
        });
      });
      break;
    }
    case "contradiction": {
      // The Contradiction (PLAYBOOK §2.5): what is said, then what really happens, and the first gets struck
      // through. Each statement rises out of its own mask; the real one carries the accent bar.
      title(m, topSafe(vertical ? h * 0.16 : h * 0.18, titleSize * 0.9), titleSize * 0.9, w - m * 2);
      const size = unit * (vertical ? 0.07 : 0.06);
      // On a phone frame the statements stay left of the platform's buttons.
      const maxW = phone ? Math.min(w - m * 2, safe.x + safe.w - m) : vertical ? w - m * 2 : w * 0.62;
      const tops = vertical ? [h * 0.34, h * 0.52] : [h * 0.36, h * 0.6];
      const strike = "strike" in T ? outCubic(span(lt, at("strike"), 0.35)) : 0;
      [0, 1].forEach((i) => {
        const item = s.items[i];
        const p = item ? outCubic(span(lt, at(`item${i}`), 0.5)) : 0;
        if (!item || p <= 0) return;
        const y = tops[i];
        put(`item${i}`, m, y, () => {
          ctx.font = ui(f, size, 700);
          const lines = wrap(ctx, item, maxW - unit * 0.06);
          const lh = size * 1.15;
          const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
          const boxH = lines.length * lh + unit * 0.04;
          const textX = m + unit * 0.04;
          const baseline = (k: number) => y + unit * 0.02 + size * 0.88 + k * lh;
          ctx.save();
          ctx.beginPath();
          ctx.rect(m - unit * 0.02, y - unit * 0.02, maxW + unit * 0.04, boxH + unit * 0.04);
          ctx.clip();
          ctx.translate(0, (1 - p) * boxH);
          ctx.fillStyle = i === 1 ? world.brand.accent : hexA(world.brand.text, 0.35);
          ctx.fillRect(m, y, unit * 0.012, boxH);
          ctx.save();
          ctx.globalAlpha *= i === 0 ? 1 - 0.45 * strike : 1;
          ctx.fillStyle = world.brand.text;
          lines.forEach((l, k) => ctx.fillText(l, textX, baseline(k)));
          ctx.restore();
          // The strike runs through each line in turn, left to right, slightly off level like a pen.
          if (i === 0 && strike > 0) {
            ctx.strokeStyle = world.brand.accent;
            ctx.lineWidth = unit * 0.009;
            ctx.lineCap = "round";
            lines.forEach((l, k) => {
              const share = clamp01(strike * lines.length - k);
              if (share <= 0) return;
              const len = (ctx.measureText(l).width + unit * 0.02) * share;
              const yy = baseline(k) - size * 0.3;
              ctx.beginPath();
              ctx.moveTo(textX - unit * 0.01, yy + size * 0.04);
              ctx.lineTo(textX - unit * 0.01 + len, yy + size * 0.04 - size * 0.08 * share);
              ctx.stroke();
            });
          }
          ctx.restore();
          return { x: m, y, w: unit * 0.04 + width, h: boxH };
        });
      });
      break;
    }
    case "steps": {
      title(m, topSafe(vertical ? h * 0.16 : h * 0.18, titleSize * 0.9), titleSize * 0.9, w - m * 2);
      const top = vertical ? h * 0.3 : h * 0.34;
      const gap = unit * (vertical ? 0.13 : 0.12);
      const dotX = m + unit * 0.035;
      const centre = (i: number) => {
        const { dx, dy } = offset(`item${i}`);
        return { x: dotX + dx, y: top + i * gap + dy };
      };
      const current = s.items.reduce((n, _, i) => (lt >= at(`item${i}`) ? i : n), -1);
      // The progress line runs from step to step as they arrive.
      ctx.strokeStyle = hexA(world.brand.accent, 0.5);
      ctx.lineWidth = unit * 0.006;
      for (let k = 0; k < current; k++) {
        const a = centre(k);
        const b = centre(k + 1);
        const g = k === current - 1 ? outCubic(span(lt, at(`item${current}`), 0.4)) : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * g, a.y + (b.y - a.y) * g);
        ctx.stroke();
      }
      s.items.forEach((item, i) => {
        const q = land(span(lt, at(`item${i}`), 0.5));
        if (q <= 0) return;
        const y = top + i * gap;
        // Only the newest step is at full strength; the earlier ones step down as it arrives.
        const look = focus(f, s, `item${i}`, lt);
        put(`item${i}`, dotX, y, () => {
          ctx.translate(-(1 - clamp01(q)) * unit * 0.1, 0);
          ctx.fillStyle = look.accent;
          ctx.beginPath();
          ctx.arc(dotX, y, unit * 0.035 * q, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.font = display(f, unit * 0.04);
          ctx.textAlign = "center";
          ctx.fillText(String(i + 1), dotX, y + unit * 0.014);
          ctx.textAlign = "left";
          ctx.fillStyle = look.text;
          ctx.font = ui(f, unit * 0.045, 600);
          ctx.fillText(item, m + unit * 0.1, y + unit * 0.016);
          return { x: m, y: y - unit * 0.04, w: unit * 0.1 + ctx.measureText(item).width, h: unit * 0.08 };
        });
      });
      if (asset && !vertical) {
        const p = land(span(lt, at("media"), 0.6));
        put("media", w * 0.76, h * 0.55, () => device(f, asset, w * 0.76, h * 0.55 + (1 - p) * h * 0.5, h * 0.68, missing));
      }
      break;
    }
    case "beforeAfter": {
      title(m, topSafe(vertical ? h * 0.14 : h * 0.15, titleSize * 0.85), titleSize * 0.85, w - m * 2);
      const areaY = vertical ? h * 0.22 : h * 0.24;
      const area = { x: m, y: areaY, w: w - m * 2, h: vertical ? Math.min(h * 0.55, floor - unit * 0.1 - areaY) : h * 0.6 };
      put("media", area.x + area.w / 2, area.y + area.h / 2, () => {
        const wipe = inOutCubic(span(lt, at("wipe"), 1.2));
        const before = s.asset ? world.assets[s.asset] : undefined;
        const after = s.assetB ? world.assets[s.assetB] : undefined;
        ctx.save();
        roundRect(ctx, area.x, area.y, area.w, area.h, unit * 0.02);
        ctx.clip();
        ctx.fillStyle = hexA(world.brand.text, 0.06);
        ctx.fillRect(area.x, area.y, area.w, area.h);
        ctx.save();
        ctx.filter = "grayscale(1) brightness(0.8)";
        drawImage(f, before ?? after, area.x + area.w / 2, area.y + area.h / 2, area.w, area.h, s.asset ? `Falta la imagen: ${s.asset}` : "Antes");
        ctx.restore();
        const split = area.x + area.w * (1 - wipe);
        // "Círculo que crece": the change spreads from one spot (focusX, focusY) until it fills the frame.
        const iris = s.reveal === "iris";
        const ox = area.x + area.w * clamp01(s.focusX);
        const oy = area.y + area.h * clamp01(s.focusY);
        const radius = wipe * Math.hypot(Math.max(ox - area.x, area.x + area.w - ox), Math.max(oy - area.y, area.y + area.h - oy));
        ctx.beginPath();
        if (iris) ctx.arc(ox, oy, Math.max(0, radius), 0, Math.PI * 2);
        else ctx.rect(split, area.y, area.x + area.w - split, area.h);
        ctx.clip();
        drawImage(f, after, area.x + area.w / 2, area.y + area.h / 2, area.w, area.h, s.assetB ? `Falta la imagen: ${s.assetB}` : "Después");
        ctx.restore();
        if (iris) {
          if (wipe > 0 && wipe < 1) {
            ctx.save();
            roundRect(ctx, area.x, area.y, area.w, area.h, unit * 0.02);
            ctx.clip();
            ctx.strokeStyle = world.brand.accent;
            ctx.lineWidth = unit * 0.008;
            ctx.beginPath();
            ctx.arc(ox, oy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        } else {
          ctx.fillStyle = world.brand.accent;
          ctx.fillRect(split - unit * 0.004, area.y, unit * 0.008, area.h);
        }
        ctx.font = ui(f, unit * 0.036, 700);
        ctx.fillStyle = world.brand.text;
        ctx.fillText(s.items[0] || "Antes", area.x, area.y + area.h + unit * 0.06);
        ctx.textAlign = "right";
        ctx.fillStyle = world.brand.accent;
        ctx.fillText(s.items[1] || "Después", area.x + area.w, area.y + area.h + unit * 0.06);
        ctx.textAlign = "left";
        return { x: area.x, y: area.y, w: area.w, h: area.h + unit * 0.08 };
      });
      break;
    }
    case "notify": {
      // "Avisos": the notifications arrive one by one, each card below the last (nothing already there moves), and
      // only the newest is at full strength ("Foco de a uno"). 16:9: the title on the left, the cards on the right.
      const list = itemsOf(s);
      const size = titleSize * 0.85;
      const tMax = vertical ? (phone ? safe.x + safe.w - m : w - m * 2) : w * 0.34;
      const ty = topSafe(vertical ? h * 0.15 : h * 0.36, size);
      const hTitle = title(m, ty, size, tMax);
      const tb = text(m, ty + hTitle + unit * 0.01, unit * 0.04, tMax, outCubic(span(lt, at("text"), 0.5)));
      const below = s.text.trim() ? tb.y + tb.h : s.title.trim() ? ty + hTitle - size * 0.7 : 0;
      const top = vertical ? Math.max(h * 0.28, below + unit * 0.06) : Math.max(h * 0.16, labelled(s) ? labelFloor(w, h) : 0);
      const cards = noticeLayout(list.length, w, h, top, phone ? floor - unit * 0.02 : h * 0.9);
      list.forEach((item, i) => {
        const key = `item${i}`;
        if (lt < at(key)) return;
        const q = land(span(lt, at(key), 0.5));
        const c = cards[i];
        const look = focus(f, s, key, lt);
        const { title: head, body } = noticeParts(item);
        put(key, c.x, c.y, () => {
          // It drops in from just above its place, quickly opaque (a card, not a fade).
          ctx.globalAlpha *= clamp01(span(lt, at(key), 0.2));
          ctx.translate(0, -(1 - q) * unit * 0.05);
          ctx.fillStyle = hexA(world.brand.text, 0.09);
          roundRect(ctx, c.x, c.y, c.w, c.h, Math.min(unit * 0.03, c.h * 0.2));
          ctx.fill();
          // The app's badge: the accent, with the logo in it when the brand has one.
          const b = c.h * 0.36;
          const bx = c.x + c.h * 0.16;
          const by = c.y + c.h * 0.16;
          ctx.fillStyle = look.accent;
          roundRect(ctx, bx, by, b, b, b * 0.28);
          ctx.fill();
          if (world.logo) drawImage(f, world.logo, bx + b / 2, by + b / 2, b * 0.72, b * 0.72, "");
          const tx = bx + b + c.h * 0.14;
          const room = Math.max(unit * 0.05, c.x + c.w - c.h * 0.14 - tx);
          let ts = c.h * 0.19;
          ctx.font = ui(f, ts, 700);
          const tw = ctx.measureText(head).width;
          if (tw > room) ts *= Math.max(0.6, room / tw);
          ctx.font = ui(f, ts, 700);
          ctx.fillStyle = look.text;
          ctx.fillText(head, tx, by + ts * 0.85);
          let bs = c.h * 0.16;
          ctx.font = ui(f, bs, 500);
          let lines = wrap(ctx, body, room);
          while (lines.length > 2 && bs > c.h * 0.1) {
            bs *= 0.9;
            ctx.font = ui(f, bs, 500);
            lines = wrap(ctx, body, room);
          }
          lines.forEach((l, k) => ctx.fillText(l, tx, by + ts * 0.85 + bs * 1.35 * (k + 1)));
          return c;
        });
      });
      break;
    }
    case "flow": {
      // "Flujo": the source (the title, with its picture), then a line draws to each place in turn and its label
      // arrives as the line gets there; the earlier lines and places step down for the newest ("Foco de a uno").
      const list = itemsOf(s);
      const tMax = vertical ? (phone ? safe.x + safe.w - m : w - m * 2) : w - m * 2;
      const ty = topSafe(vertical ? h * 0.15 : h * 0.16, unit * 0.045);
      const tb = text(m, ty, unit * 0.045, tMax, outCubic(span(lt, at("text"), 0.5)));
      const top = Math.max(vertical ? h * 0.22 : h * 0.26, s.text.trim() ? tb.y + tb.h + unit * 0.05 : 0, labelled(s) ? labelFloor(w, h) : 0);
      const L = flowLayout(list.length, w, h, top, phone ? floor - unit * 0.02 : h - m * 0.8);
      list.forEach((_, i) => {
        const key = `item${i}`;
        if (lt < at(key)) return;
        const g = outCubic(span(lt, at(key), 0.4));
        const look = focus(f, s, key, lt);
        // A place moved by hand takes its line's last bend and end with it.
        const { dx, dy } = offset(key);
        const path = L.paths[i].map((p, k, all) => (k === all.length - 1 ? { x: p.x + dx, y: p.y + dy } : k === all.length - 2 ? { x: p.x, y: p.y + dy } : p));
        const drawn = partialPath(path, g);
        ctx.save();
        ctx.strokeStyle = look.accent;
        ctx.lineWidth = unit * 0.006;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        drawn.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        const tip = drawn[drawn.length - 1];
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, unit * 0.011, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      if (s.title.trim() || asset) {
        const src = L.source;
        put("title", src.x + src.w / 2, src.y + src.h / 2, () => {
          const q = land(span(lt, at("title"), 0.45));
          ctx.globalAlpha *= clamp01(span(lt, at("title"), 0.2));
          ctx.translate(0, (1 - q) * unit * 0.05);
          ctx.fillStyle = world.brand.accent;
          roundRect(ctx, src.x, src.y, src.w, src.h, src.h * 0.3);
          ctx.fill();
          let tx = src.x + src.h * 0.3;
          if (s.asset) {
            const side = src.h * 0.72;
            ctx.save();
            roundRect(ctx, tx - src.h * 0.12, src.y + (src.h - side) / 2, side, side, side * 0.2);
            ctx.clip();
            drawImage(f, asset, tx - src.h * 0.12 + side / 2, src.y + src.h / 2, side, side, "");
            ctx.restore();
            tx += side;
          }
          const room = src.x + src.w - src.h * 0.3 - tx;
          let size = src.h * 0.4;
          ctx.font = display(f, size);
          const tw = ctx.measureText(s.title).width;
          if (tw > room) size *= Math.max(0.45, room / Math.max(1, tw));
          ctx.font = display(f, size);
          ctx.fillStyle = world.brand.bg;
          ctx.textBaseline = "middle";
          ctx.fillText(s.title, tx, src.y + src.h / 2);
          ctx.textBaseline = "alphabetic";
          return src;
        });
      }
      list.forEach((item, i) => {
        const key = `item${i}`;
        // The label arrives as its line reaches it, and is fully in when the line's entrance is done.
        const arrive = at(key) + 0.25;
        if (lt < arrive) return;
        const q = land(span(lt, arrive, 0.25));
        const look = focus(f, s, key, lt);
        const b = L.places[i];
        put(key, b.x, b.y + b.h / 2, () => {
          ctx.globalAlpha *= clamp01(span(lt, arrive, 0.12));
          ctx.translate(-(1 - q) * unit * 0.03, 0);
          ctx.fillStyle = hexA(world.brand.text, 0.09);
          roundRect(ctx, b.x, b.y, b.w, b.h, b.h * 0.3);
          ctx.fill();
          const room = b.w - b.h * 0.6;
          let size = b.h * 0.38;
          ctx.font = ui(f, size, 600);
          const tw = ctx.measureText(item).width;
          if (tw > room) size *= Math.max(0.5, room / Math.max(1, tw));
          ctx.font = ui(f, size, 600);
          ctx.fillStyle = look.text;
          ctx.textBaseline = "middle";
          ctx.fillText(item, b.x + b.h * 0.3, b.y + b.h / 2);
          ctx.textBaseline = "alphabetic";
          return b;
        });
      });
      break;
    }
    case "slots": {
      // "Casilleros": the open loop on screen. The scene that names the boxes brings them in one by one, empty; each
      // later slots scene shows the row as it stands (the boxes filled before already filled) and fills the next one.
      const row = s.slots ?? slotsPlan([s], 0)!;
      const names = row.naming ? itemsOf(s) : row.names;
      const size = titleSize * 0.85;
      const tMax = vertical ? (phone ? safe.x + safe.w - m : w - m * 2) : w - m * 2;
      const ty = topSafe(vertical ? h * 0.16 : h * 0.2, size);
      const hTitle = title(m, ty, size, tMax);
      const tb = text(m, ty + hTitle + unit * 0.01, unit * 0.042, tMax, outCubic(span(lt, at("text"), 0.5)));
      const below = s.text.trim() ? tb.y + tb.h : s.title.trim() ? ty + hTitle - size * 0.7 : 0;
      const top = Math.max(vertical ? h * 0.32 : h * 0.36, below + unit * 0.07);
      const L = slotsLayout(names.length, w, h, top, phone ? floor - unit * 0.02 : h - m * 0.6);
      const nameSize = unit * (vertical ? 0.038 : 0.034);
      // One box: its dashed outline, the accent filling it from the bottom, the check, and its name under it.
      const box = (i: number, fill: number, check: number, colour: string) => {
        const b = L.boxes[i];
        const r = Math.min(unit * 0.025, b.h * 0.2);
        ctx.save();
        ctx.setLineDash([unit * 0.018, unit * 0.012]);
        ctx.lineWidth = unit * 0.005;
        ctx.strokeStyle = hexA(colour, 0.6);
        roundRect(ctx, b.x, b.y, b.w, b.h, r);
        ctx.stroke();
        ctx.restore();
        if (fill > 0) {
          ctx.save();
          roundRect(ctx, b.x, b.y, b.w, b.h, r);
          ctx.clip();
          ctx.fillStyle = world.brand.accent;
          ctx.fillRect(b.x, b.y + b.h * (1 - clamp01(fill)), b.w, b.h * clamp01(fill));
          ctx.restore();
        }
        if (check > 0) {
          const k = Math.min(b.w, b.h) * 0.5;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const mark = partialPath(
            [
              { x: cx - k * 0.5, y: cy },
              { x: cx - k * 0.15, y: cy + k * 0.35 },
              { x: cx + k * 0.55, y: cy - k * 0.35 },
            ],
            check,
          );
          ctx.save();
          ctx.strokeStyle = world.brand.bg;
          ctx.lineWidth = k * 0.16;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          mark.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();
        }
        let ns = nameSize;
        ctx.font = ui(f, ns, 600);
        const widest = Math.max(1, ...names[i].split(/\s+/).map((word) => ctx.measureText(word).width));
        if (widest > b.w) ns *= Math.max(0.6, b.w / widest);
        ctx.font = ui(f, ns, 600);
        ctx.fillStyle = colour;
        wrap(ctx, names[i], b.w)
          .slice(0, 2)
          .forEach((l, n) => ctx.fillText(l, b.x, b.y + b.h + ns * 1.25 * (n + 1)));
        return { x: b.x, y: b.y, w: b.w, h: b.h + L.label };
      };
      if (row.naming) {
        names.forEach((_, i) => {
          const key = `item${i}`;
          if (lt < at(key)) return;
          const q = land(span(lt, at(key), 0.5));
          const look = focus(f, s, key, lt);
          const b = L.boxes[i];
          put(key, b.x + b.w / 2, b.y + b.h / 2, () => {
            ctx.globalAlpha *= clamp01(span(lt, at(key), 0.2));
            ctx.translate(0, (1 - q) * unit * 0.04);
            return box(i, 0, 0, look.text);
          });
        });
      } else if (names.length) {
        const first = L.boxes[0];
        const last = L.boxes[L.boxes.length - 1];
        const all = { x: first.x, y: first.y, w: Math.max(...L.boxes.map((b) => b.x + b.w)) - first.x, h: last.y + last.h + L.label - first.y };
        put("media", all.x + all.w / 2, all.y + all.h / 2, () => {
          // The row is there with the cut; the box this scene fills fills, then gets its check.
          const fillAt = at("fill");
          names.forEach((_, i) => {
            const fill = i < row.filled ? 1 : i === row.fills ? outCubic(span(lt, fillAt, 0.45)) : 0;
            const check = i < row.filled ? 1 : i === row.fills ? outCubic(span(lt, fillAt + 0.3, 0.3)) : 0;
            box(i, fill, check, world.brand.text);
          });
          return all;
        });
      }
      break;
    }
    case "product": {
      const p = enter("media", 0.7);
      const wobble = productWobble(world.seed, s.index, f.t, unit);
      // On a phone frame the product and its price both end above the subtitle (mediaLayout).
      const { cx, cy } = lay!;
      put("media", cx, cy, () => {
        ctx.translate(cx, cy + wobble.dy);
        ctx.rotate(wobble.rot);
        ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
        const b = drawImage(f, asset, 0, 0, lay!.maxW, lay!.maxH, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      title(m, topSafe(vertical ? h * 0.15 : h * 0.18, titleSize), titleSize, w - m * 2);
      const tag = s.items[0];
      if (tag) {
        const q = land(span(lt, at("tag"), 0.5));
        const tx = vertical ? w / 2 : w * 0.78;
        const ty = vertical ? (phone ? Math.min(h * 0.78, floor - unit * 0.04) : h * 0.78) : h * 0.72;
        put("tag", tx, ty, () => {
          ctx.font = display(f, unit * 0.06);
          const tw = ctx.measureText(tag).width;
          const pad = unit * 0.03;
          ctx.translate(tx, ty);
          ctx.rotate(-0.05);
          ctx.scale(Math.max(0, q), Math.max(0, q));
          ctx.fillStyle = world.brand.accent;
          roundRect(ctx, -tw / 2 - pad, -unit * 0.055, tw + pad * 2, unit * 0.09, unit * 0.045);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.textAlign = "center";
          ctx.fillText(tag, 0, unit * 0.017);
          return { x: tx - tw / 2 - pad, y: ty - unit * 0.055, w: tw + pad * 2, h: unit * 0.09 };
        });
      }
      break;
    }
    case "stat": {
      // Counts up in the title's own format and settles on the title exactly as written.
      const shown = statCountText(s.title, lt < at("title") ? 0 : outCubic(span(lt, at("title"), STAT_COUNT)));
      // As big as fits the width.
      let size = unit * 0.2;
      ctx.font = display(f, size);
      const full = ctx.measureText(s.title).width;
      if (full > w - m * 2) size *= (w - m * 2) / full;
      const y = vertical ? h * 0.48 : h * 0.52;
      put("title", m, y, () => {
        ctx.font = display(f, size);
        ctx.fillStyle = world.brand.accent;
        ctx.fillText(shown, m, y);
        return { x: m, y: y - size * 0.8, w: Math.min(full, w - m * 2), h: size };
      });
      text(m, y + unit * 0.09, unit * 0.05, w - m * 2, outCubic(span(lt, at("text"), 0.5)));
      break;
    }
    case "logo": {
      const p = land(span(lt, at("media"), 0.6));
      const cx = w / 2;
      const cy = vertical ? h * 0.42 : h * 0.36;
      put("media", cx, cy, () => {
        // An accent ring draws itself around the logo; the logo sits on the background, so it shows whatever its colour.
        ctx.strokeStyle = world.brand.accent;
        ctx.lineWidth = unit * 0.012;
        ctx.beginPath();
        ctx.arc(cx, cy, unit * 0.2, -Math.PI / 2, -Math.PI / 2 + outCubic(span(lt, at("media"), 0.7)) * Math.PI * 2);
        ctx.stroke();
        // It grows from 60 %, never from nothing, and is fully there within the first part of its entrance.
        ctx.translate(cx, cy);
        ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
        ctx.globalAlpha *= clamp01(span(lt, at("media"), 0.15));
        if (world.logo) drawImage(f, world.logo, 0, 0, unit * 0.26, unit * 0.26, "");
        else {
          ctx.font = display(f, unit * 0.08);
          ctx.fillStyle = world.brand.text;
          ctx.textAlign = "center";
          ctx.fillText(s.title, 0, unit * 0.03);
        }
        return { x: cx - unit * 0.21, y: cy - unit * 0.21, w: unit * 0.42, h: unit * 0.42 };
      });
      if (s.text) {
        const q = outCubic(span(lt, at("text"), 0.5));
        const ty = cy + unit * (vertical ? 0.32 : 0.29);
        put("text", cx, ty, () => {
          ctx.globalAlpha = q;
          ctx.font = ui(f, unit * 0.045, 600);
          ctx.fillStyle = world.brand.text;
          ctx.textAlign = "center";
          ctx.fillText(s.text, cx, ty + (1 - q) * unit * 0.05);
          const tw = ctx.measureText(s.text).width;
          return { x: cx - tw / 2, y: ty - unit * 0.045, w: tw, h: unit * 0.06 };
        });
      }
      const cta = s.items[0];
      if (cta) {
        const r = land(span(lt, at("tag"), 0.5));
        const ty = cy + unit * (vertical ? 0.43 : 0.39);
        put("tag", cx, ty, () => {
          ctx.font = ui(f, unit * 0.04, 700);
          const tw = ctx.measureText(cta).width;
          ctx.translate(cx, ty);
          ctx.scale(Math.max(0, r), Math.max(0, r));
          ctx.fillStyle = world.brand.text;
          roundRect(ctx, -tw / 2 - unit * 0.035, -unit * 0.045, tw + unit * 0.07, unit * 0.075, unit * 0.04);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.textAlign = "center";
          ctx.fillText(cta, 0, unit * 0.008);
          return { x: cx - tw / 2 - unit * 0.035, y: ty - unit * 0.045, w: tw + unit * 0.07, h: unit * 0.075 };
        });
      }
      ctx.textAlign = "left";
      break;
    }
  }
}

export function sceneAt(scenes: TimedScene[], t: number): number {
  const i = scenes.findIndex((s) => t >= s.start && t < s.end);
  return i < 0 ? scenes.length - 1 : i;
}

// Where a scene's main thing sits (the picture, the screen, the product, the number, what really happens), in frame
// coordinates at its last moment, after the hand adjustment and the camera. A camera journey ("through") dives here.
export function anchorOf(scene: TimedScene, w: number, h: number): { x: number; y: number } {
  const vertical = h > w;
  const unit = Math.min(w, h);
  const has = Boolean(scene.asset);
  const P: Record<MotionTemplate, [number, number]> = {
    hook: has ? (vertical ? [0.5, 0.72] : [0.75, 0.5]) : vertical ? [0.5, 0.4] : [0.4, 0.45],
    screen: vertical ? [0.5, 0.58] : [0.66, 0.44],
    zoom: vertical ? [0.5, 0.58] : [0.5, 0.55],
    type: vertical ? [0.5, 0.42] : [0.4, 0.45],
    character: vertical ? [scene.assetB ? 0.3 : 0.5, 0.62] : [scene.assetB ? 0.8 : 0.72, 0.57],
    callouts: vertical ? [0.5, 0.5] : [0.42, 0.55],
    steps: has && !vertical ? [0.76, 0.55] : [0.3, vertical ? 0.42 : 0.45],
    beforeAfter: vertical ? [0.5, 0.48] : [0.5, 0.54],
    contradiction: vertical ? [0.32, 0.56] : [0.3, 0.64],
    notify: vertical ? [0.5, 0.5] : [0.69, 0.45],
    flow: vertical ? [0.5, 0.26] : [0.2, 0.56],
    slots: vertical ? [0.45, 0.48] : [0.5, 0.55],
    product: vertical ? [0.5, 0.47] : [0.5, 0.55],
    stat: vertical ? [0.4, 0.45] : [0.4, 0.48],
    logo: vertical ? [0.5, 0.42] : [0.5, 0.36],
    code: [0.5, 0.5],
  };
  const [fx, fy] = P[scene.template];
  const key = scene.template === "stat" || scene.template === "flow" ? "title" : scene.template === "contradiction" ? "item1" : "media";
  const spot = vertical ? scene.tweaks?.[key]?.v : scene.tweaks?.[key]?.h;
  const x = w * fx + (spot?.dx ?? 0) * unit;
  const y = h * fy + (spot?.dy ?? 0) * unit;
  const cam = cameraAt(scene.camera, 1);
  return { x: w / 2 + cam.x * w + (x - w / 2) * cam.z, y: h / 2 + cam.y * h + (y - h / 2) * cam.z };
}

// One scratch canvas per target canvas, for the motion blur on the cut. It is not state between frames: every
// subframe wipes it whole (pixels and drawing state) before drawing, so frame t never depends on what it held.
const scratches = new WeakMap<object, CanvasRenderingContext2D>();
function scratchFor(target: object, w: number, h: number): CanvasRenderingContext2D | null {
  let c = scratches.get(target);
  if (!c) {
    // Outside a page (the unit tests) there is no canvas to borrow: the frame is drawn at t alone.
    if (typeof document === "undefined") return null;
    const made = document.createElement("canvas").getContext("2d");
    if (!made) return null;
    c = made;
    scratches.set(target, c);
  }
  const [cw, ch] = [Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))];
  if (c.canvas.width !== cw || c.canvas.height !== ch) {
    c.canvas.width = cw;
    c.canvas.height = ch;
  }
  return c;
}

function wipe(c: CanvasRenderingContext2D) {
  if (typeof c.reset === "function") c.reset();
  else {
    // Setting the size clears the pixels and resets the state, as reset() does.
    const { width, height } = c.canvas;
    c.canvas.width = width;
    c.canvas.height = height;
  }
}

// Frame t of the explainer. Scenes change with a push: the old one slides out, the new one in, behind an accent bar.
// `probe` (the editor only) hears where each visible element of the current scene is; not during a push.
// With the piece's motion blur on (world.cutBlur), a frame inside a push is the average of subframes over the shutter
// before t (blurSamples), each drawn whole on a scratch canvas and blended in with its weight (a running mean: alpha =
// weight / weights so far). Outside a push, and for a hard cut, the frame is drawn once, exactly as without the blur.
// The subtitle and the AI notice are drawn once on top, from t: they never move with the cut.
export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  script: MotionScript,
  world: MotionWorld,
  probe?: Probe,
) {
  const scenes = timeScenes(script.scenes);
  const f: Frame = {
    ctx,
    w,
    h,
    unit: Math.min(w, h),
    vertical: h > w,
    world,
    t,
    probe,
    land: landFor(script.tone, world.brand.motion),
    acting: actingFor(script.tone, world.brand.motion),
    pieceWorld: script.world,
  };
  if (!scenes.length) {
    backdrop(f);
    return;
  }
  // The change between scenes follows the tone: a push (warm, fast when absurd) or a hard cut (dry).
  const push = cutPush(script.tone);
  const samples = world.cutBlur ? blurSamples(scenes, push, t) : [];
  const scratch = samples.length > 1 ? scratchFor(ctx, w, h) : null;
  if (scratch) {
    let sum = 0;
    samples.forEach(({ at, weight }, k) => {
      wipe(scratch);
      // The probe hears the frame at t itself (the first sample), never a subframe.
      drawPicture({ ...f, ctx: scratch, t: at, probe: k === 0 ? probe : undefined }, scenes, push);
      sum += weight;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = weight / sum;
      ctx.drawImage(scratch.canvas, 0, 0, w, h);
      ctx.restore();
    });
  } else drawPicture(f, scenes, push);
  subtitleAt(f, scenes[sceneAt(scenes, t)]);
  footer(f);
  disclosureLabel(f, scenes, push);
}

// The picture of frame f.t without the subtitle and the AI notice: the set, then the scene on screen or the change
// between two scenes.
function drawPicture(f: Frame, scenes: TimedScene[], push: number) {
  const { ctx, w, h, t, world, probe } = f;
  backdrop(f);
  const i = sceneAt(scenes, t);
  const s = scenes[i];
  const lt = t - s.start;
  // moveSet redraws the backdrop inside the camera, so a push or a pan moves the set and not only the type.
  // During a scene change the backdrop stays put, the same as before the camera existed.
  const drawShot = (scene: TimedScene, sceneTime: number, hit: boolean, moveSet: boolean, hide?: string) => {
    const cam = cameraAt(scene.camera, sceneTime / Math.max(0.2, scene.seconds));
    // "Un mundo ilustrado": the scene's place is part of its set, so it moves with it in every change (the push, the
    // carry, "Pasar a través") and takes the camera layer by layer.
    const place = worldOf(scene, f.pieceWorld);
    if (place) drawWorld(f, scene, sceneTime, place);
    ctx.save();
    ctx.translate(w / 2 + cam.x * w, h / 2 + cam.y * h);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-w / 2, -h / 2);
    const shot: Frame = {
      ...f,
      hide,
      probe:
        hit && probe
          ? (id, key, box) => {
              probe(id, key, {
                x: w / 2 + cam.x * w + (box.x - w / 2) * cam.z,
                y: h / 2 + cam.y * h + (box.y - h / 2) * cam.z,
                w: box.w * cam.z,
                h: box.h * cam.z,
              });
            }
          : undefined,
    };
    if (moveSet && !place) backdrop(shot);
    drawScene(shot, scene, sceneTime);
    ctx.restore();
  };
  const coming = pushOf(s, push);
  const carry = i > 0 && lt < coming && s.carryIn ? carryEnds(f, scenes[i - 1], s, lt) : null;
  if (carry) {
    // "Continuidad": the new scene is in place behind (its other elements enter as usual), the rest of the old one
    // leaves (at once on a hard cut, else sliding out), and the shared picture travels from where it was to where it
    // settles, on top of both.
    const prev = scenes[i - 1];
    drawShot(s, lt, false, false, carry.keyB);
    if (push > 0) {
      ctx.save();
      ctx.translate(-w * inOutCubic(lt / coming), 0);
      drawShot(prev, prev.seconds - 0.001, false, false, carry.keyA);
      ctx.restore();
    }
    drawCarried(f, carry.asset, lerpBox(carry.from, carry.to, carryCurve(f.land)(lt / coming)));
  } else if (i > 0 && lt < coming && s.entry === "through") {
    // A camera journey: the camera dives into the previous scene's main thing, faster and faster, and this scene opens
    // from inside it in a circle that grows from that spot, ringed in the accent, until it fills the frame.
    const prev = scenes[i - 1];
    const p = clamp01(lt / coming);
    const a = anchorOf(prev, w, h);
    const dive = 1 + 7 * p * p * p;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(dive, dive);
    ctx.translate(-a.x, -a.y);
    drawShot(prev, prev.seconds - 0.001, false, true);
    ctx.restore();
    const q = inOutCubic(clamp01((p - 0.15) / 0.85));
    if (q > 0) {
      const r = q * Math.hypot(Math.max(a.x, w - a.x), Math.max(a.y, h - a.y));
      const k = 0.55 + 0.45 * outCubic(q);
      ctx.save();
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.clip();
      // The circle is the new scene all the way to its edge, even where its scaled set does not reach yet.
      ctx.fillStyle = world.brand.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.translate(a.x + (w / 2 - a.x) * q, a.y + (h / 2 - a.y) * q);
      ctx.scale(k, k);
      ctx.translate(-w / 2, -h / 2);
      drawShot(s, lt, false, true);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = world.brand.accent;
      ctx.lineWidth = f.unit * 0.01 * (1 - q * 0.6);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (i > 0 && lt < coming && !(s.carryIn && push === 0)) {
    // (A carry with nothing to draw falls back to the tone's change: a push, or on a dry piece the hard cut below.)
    const p = inOutCubic(lt / coming);
    const prev = scenes[i - 1];
    ctx.save();
    ctx.translate(-w * p, 0);
    drawShot(prev, prev.seconds - 0.001, false, false);
    ctx.restore();
    ctx.save();
    ctx.translate(w * (1 - p), 0);
    drawShot(s, lt, false, false);
    ctx.restore();
    ctx.fillStyle = world.brand.accent;
    ctx.fillRect(w * (1 - p) - f.unit * 0.02, 0, f.unit * 0.02, h);
  } else drawShot(s, lt, true, true);
}

// The two ends of a carry at scene time lt of the incoming scene b: where the picture was at the end of a, and where
// b draws it now (b may still be moving it: a zoom, a camera move), with the elements each scene hides meanwhile.
// Null when there is nothing to carry (the picture is not loaded and one end is a hook, which draws none then).
function carryEnds(f: Frame, a: TimedScene, b: TimedScene, lt: number) {
  const id = carriedAsset(b)?.id;
  const keyA = carriedAsset(a)?.key;
  const keyB = carriedAsset(b)?.key;
  if (!id || !keyA || !keyB) return null;
  // The incoming scene's picture: its recording at this moment when it plays one.
  const asset = assetOf(f.world, b, keyB);
  if (!asset && (a.template === "hook" || b.template === "hook")) return null;
  const look: CarryLook = { aspect: asset ? asset.width / Math.max(1, asset.height) : null, screen: Boolean(asset?.screen), notice: Boolean(f.world.disclosure), seed: f.world.seed };
  const from = carryBox(a, a.seconds - 0.001, f.w, f.h, look);
  const to = carryBox(b, lt, f.w, f.h, look);
  return from && to ? { asset, from, to, keyA, keyB } : null;
}

// The editor's guide (never in the video): where a phone's top bar, caption and buttons will cover a 9:16 frame.
export function drawPhoneGuides(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!isPhoneFrame(w, h)) return;
  const safe = safeRect(w, h);
  const bands: [number, number, number, number, string][] = [
    [0, 0, w, safe.y, "Barra de la app"],
    [0, safe.y + safe.h, w, h - safe.y - safe.h, "Texto y cuenta de la app"],
    [safe.x + safe.w, h * BUTTONS_FROM, w - safe.x - safe.w, safe.y + safe.h - h * BUTTONS_FROM, "Botones"],
  ];
  ctx.save();
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.028)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (const [x, y, bw, bh, label] of bands) {
    ctx.fillStyle = "rgba(20, 22, 28, 0.32)";
    ctx.fillRect(x, y, bw, bh);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.strokeRect(x + 0.75, y + 0.75, bw - 1.5, bh - 1.5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    if (bw > bh) {
      ctx.textAlign = "left";
      ctx.fillText(label, x + w * 0.04, y + bh / 2);
    } else {
      ctx.save();
      ctx.translate(x + bw / 2, y + bh / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

// The beat grid of the synthesized score.
export function beatGrid(duration: number, bpm: number): number[] {
  const step = 60 / bpm;
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
}

export function scriptDuration(script: MotionScript | null): number {
  return script ? script.scenes.reduce((n, s) => n + s.seconds, 0) : 0;
}

export type { MotionScene };
