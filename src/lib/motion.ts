// The motion engine. Every frame is a pure function of time: drawMotionFrame(t) paints frame t from the script,
// the brand and preloaded images only. No timers, no state carried between frames; noise is seeded (mulberry32),
// never Math.random. The studio's banned defaults are not here: no centred title on a gradient, no
// everything-fades-in, no corner labels or frame borders, no glow, no particle bursts.
import { drawPuppet, puppetPose, type PuppetAsset } from "./puppet.ts";
import type { ActorAsset } from "./actor.ts";
import { TYPE_CPS, cameraAt, cutPush, elementTimes, timeScenes, typingSeconds, type MotionScene, type MotionScript, type TimedScene } from "../../shared/motion.ts";
import type { Brand } from "../../shared/series.ts";

// screen: a real screenshot of the app (shown inside a phone or laptop).
export type MotionAsset = { image: CanvasImageSource; width: number; height: number; name: string; screen?: boolean };
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
};

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
const span = (t: number, from: number, dur: number) => clamp01((t - from) / dur);

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
  ctx.restore();
  if (landscape) {
    ctx.fillStyle = "#1a1a1e";
    roundRect(ctx, x - sw * 0.08, y + sh + bezel, sw * 1.16, unit * 0.022, unit * 0.008);
    ctx.fill();
  }
  ctx.restore();
  return { x, y, w: sw, h: sh };
}

function drawImage(f: Frame, asset: MotionAsset | undefined, cx: number, cy: number, maxW: number, maxH: number, label: string) {
  if (!asset) {
    placeholder(f, cx - maxW / 2, cy - maxH / 2, maxW, maxH, label);
    return { x: cx - maxW / 2, y: cy - maxH / 2, w: maxW, h: maxH };
  }
  const s = fitInto(asset, maxW, maxH, "contain");
  f.ctx.drawImage(asset.image, cx - s.w / 2, cy - s.h / 2, s.w, s.h);
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

function subtitle(f: Frame, text: string) {
  if (!text.trim()) return;
  const { ctx, w, h, unit } = f;
  const size = unit * 0.038;
  ctx.font = ui(f, size, 600);
  const lines = wrap(ctx, text, w * 0.84);
  const y0 = h - unit * (f.world.disclosure ? 0.14 : 0.1) - lines.length * size * 1.25;
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = f.world.brand.text;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, y0 + (i + 1) * size * 1.25));
  ctx.restore();
}

function footer(f: Frame) {
  if (!f.world.disclosure) return;
  const { ctx, w, h, unit } = f;
  ctx.save();
  ctx.font = ui(f, unit * 0.022);
  ctx.textAlign = "center";
  ctx.fillStyle = hexA(f.world.brand.text, 0.65);
  ctx.fillText(f.world.disclosure, w / 2, h - unit * 0.05);
  ctx.restore();
}

// Draws one element with the person's hand adjustment: moved by (dx, dy) and scaled around its anchor (ax, ay).
// `draw` returns the element's box in frame coordinates without the adjustment; the adjusted box goes to the probe
// when the element is on screen, and back to the caller.
function place(f: Frame, s: TimedScene, key: string, ax: number, ay: number, shown: boolean, draw: () => Box): Box {
  const spot = f.vertical ? s.tweaks?.[key]?.v : s.tweaks?.[key]?.h;
  const dx = (spot?.dx ?? 0) * f.unit;
  const dy = (spot?.dy ?? 0) * f.unit;
  const k = spot?.scale ?? 1;
  const { ctx } = f;
  ctx.save();
  ctx.translate(ax + dx, ay + dy);
  ctx.scale(k, k);
  ctx.translate(-ax, -ay);
  const box = draw();
  ctx.restore();
  const out = { x: ax + dx + (box.x - ax) * k, y: ay + dy + (box.y - ay) * k, w: box.w * k, h: box.h * k };
  if (shown && f.probe && out.w > 0 && out.h > 0) f.probe(s.id, key, out);
  return out;
}

const titleBox = (x: number, y: number, size: number, r: { w: number; h: number }): Box => ({ x, y: y - size * 0.95, w: r.w, h: r.h + size * 0.1 });

// ── Templates ───────────────────────────────────────────────────────────────────
function drawScene(f: Frame, s: TimedScene, lt: number) {
  const { ctx, w, h, unit, vertical, world } = f;
  const m = unit * 0.08;
  const T = elementTimes(s);
  const at = (key: string) => T[key] ?? 0;
  const put = (key: string, ax: number, ay: number, draw: () => Box) => place(f, s, key, ax, ay, lt >= at(key), draw);
  const offset = (key: string) => {
    const spot = vertical ? s.tweaks?.[key]?.v : s.tweaks?.[key]?.h;
    return { dx: (spot?.dx ?? 0) * unit, dy: (spot?.dy ?? 0) * unit };
  };
  const asset = s.asset ? world.assets[s.asset] : undefined;
  const missing = s.asset ? `Falta la imagen: ${s.asset}` : "Sin imagen";
  const titleSize = unit * (vertical ? 0.1 : 0.085);
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
    case "hook": {
      const ty = vertical ? h * 0.36 : h * 0.4;
      const hTitle = title(m, ty, unit * (vertical ? 0.13 : 0.11), w - m * 2, (r) => {
        // The accent bar draws under the title.
        const bar = outCubic(span(lt, at("title") + 0.45, 0.5));
        ctx.fillStyle = world.brand.accent;
        ctx.fillRect(m, ty + r.h - unit * 0.05, (w - m * 2) * 0.35 * bar, unit * 0.014);
      });
      text(m, ty + hTitle + unit * 0.04, unit * 0.045, w - m * 2, outCubic(span(lt, at("text"), 0.5)));
      if (asset) {
        const p = outBack(span(lt, at("media"), 0.6));
        const cx = vertical ? w / 2 : w * 0.75;
        const cy = vertical ? h * 0.72 : h / 2;
        put("media", cx, cy, () => {
          ctx.globalAlpha = clamp01(p);
          return drawImage(f, asset, cx, cy + (vertical ? (1 - p) * unit * 0.2 : 0), vertical ? w * 0.6 : w * 0.35, vertical ? h * 0.3 : h * 0.6, missing);
        });
      }
      break;
    }
    case "screen": {
      const p = outBack(span(lt, at("media"), 0.6));
      const cx = vertical ? w / 2 : w * 0.66;
      const cy = vertical ? h * 0.58 : h * 0.44;
      put("media", cx, cy, () => {
        ctx.translate(cx, cy + (1 - p) * h * 0.6);
        ctx.rotate((1 - outCubic(span(lt, at("media"), 0.8))) * 0.1);
        const b = device(f, asset, 0, 0, vertical ? h * 0.52 : h * 0.62, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      const titleY = vertical ? h * 0.12 : h * 0.3;
      const hTitle = title(m, titleY, titleSize, vertical ? w - m * 2 : w * 0.38);
      text(m, titleY + hTitle, unit * 0.04, vertical ? w - m * 2 : w * 0.36, outCubic(span(lt, at("text"), 0.5)));
      break;
    }
    case "zoom": {
      const zoomP = inOutCubic(span(lt, at("zoom"), 0.9));
      const z = 1 + (s.zoom - 1) * zoomP;
      const dh = vertical ? h * 0.55 : h * 0.72;
      const landscape = asset ? asset.width > asset.height : false;
      const ratio = asset ? asset.width / asset.height : 9 / 19.5;
      const devH = landscape ? dh * 0.62 : dh;
      const dw = devH * ratio;
      const cx = w / 2;
      const cy = vertical ? h * 0.58 : h * 0.55;
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
      title(m, vertical ? h * 0.15 : h * 0.16, titleSize * 0.9, w - m * 2);
      break;
    }
    case "character": {
      // A 3D-look puppet says the line (its mouth follows the voice) and makes its gesture; it can point at or
      // present a real screen or the product (assetB).
      const actor = s.asset ? world.actors?.[s.asset] : undefined;
      const puppet = s.asset ? world.puppets?.[s.asset] : undefined;
      const prop = s.assetB ? world.assets[s.assetB] : undefined;
      const hasProp = Boolean(s.assetB);
      const cx = vertical ? (hasProp ? w * 0.3 : w / 2) : hasProp ? w * 0.8 : w * 0.72;
      const bottom = vertical ? h * 0.87 : h * 0.97;
      const height = vertical ? h * (hasProp ? 0.46 : 0.52) : h * 0.8;
      const toward = hasProp ? (vertical ? 1 : -1) : 1;
      if (hasProp) {
        const p = outBack(span(lt, at("prop"), 0.55));
        const px = vertical ? w * 0.7 : w * 0.47;
        const py = vertical ? h * 0.5 : h * 0.47;
        const size = vertical ? h * 0.3 : h * 0.5;
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
        if (actor) {
          return actor.draw(ctx, cx, bottom, height, Math.max(0, lt - at("media")), s.seconds, s.move ?? "walk", talkLevel(world, s, f.t, lt));
        }
        if (!puppet) {
          placeholder(f, cx - height * 0.3, bottom - height, height * 0.6, height, s.asset ? `Falta el personaje: ${s.asset}` : "Elegí un personaje");
          return { x: cx - height * 0.3, y: bottom - height, w: height * 0.6, h: height };
        }
        const pose = puppetPose(f.t, lt, at("media"), s.gesture ?? "present", at("gesture"), talkLevel(world, s, f.t, lt), toward, world.seed + s.index * 7);
        return drawPuppet(ctx, puppet, cx, bottom, height, pose);
      });
      const titleY = vertical ? h * 0.13 : h * 0.2;
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
      const p = outBack(span(lt, at("media"), 0.55));
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
        return { x: tx, y: ty - size * 0.7, w: Math.max(ctx.measureText(s.title).width, unit * 0.1), h: size * 1.4 };
      });
      const button = s.items[1];
      if (button) {
        const q = outBack(span(lt, at("tag"), 0.45));
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
      const p = outBack(span(lt, at("media"), 0.6));
      const cx = vertical ? w / 2 : w * 0.42;
      const cy = vertical ? h * 0.5 : h * 0.55;
      const box = put("media", cx, cy, () => {
        ctx.translate(cx, cy);
        ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
        const b = drawImage(f, asset, 0, 0, vertical ? w * 0.62 : w * 0.38, vertical ? h * 0.38 : h * 0.6, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      title(m, vertical ? h * 0.14 : h * 0.15, titleSize * 0.85, w - m * 2);
      s.items.forEach((item, i) => {
        const key = `item${i}`;
        const q = outCubic(span(lt, at(key), 0.45));
        if (q <= 0) return;
        const rnd = mulberry32(world.seed + s.index * 31 + i);
        const ax = box.x + box.w * (0.25 + 0.5 * rnd());
        const ay = box.y + box.h * (0.2 + 0.6 * rnd());
        const right = vertical ? i % 2 === 1 : true;
        const lx = vertical ? (right ? w - m : m) : w * 0.68;
        const ly = vertical ? (i < 2 ? h * 0.27 + i * unit * 0.09 : h * 0.72 + (i - 2) * unit * 0.09) : h * 0.3 + i * unit * 0.12;
        // The line runs from the dot on the image to wherever the label is.
        const { dx, dy } = offset(key);
        ctx.strokeStyle = world.brand.accent;
        ctx.lineWidth = unit * 0.004;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (lx + dx - ax) * q, ay + (ly + dy - ay) * q);
        ctx.stroke();
        ctx.fillStyle = world.brand.accent;
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
          ctx.fillStyle = world.brand.text;
          roundRect(ctx, bx + slide, ly - unit * 0.035, tw + pad * 2, unit * 0.06, unit * 0.012);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.fillText(item, bx + pad + slide, ly + unit * 0.008);
          return { x: bx, y: ly - unit * 0.035, w: tw + pad * 2, h: unit * 0.06 };
        });
      });
      break;
    }
    case "steps": {
      title(m, vertical ? h * 0.16 : h * 0.18, titleSize * 0.9, w - m * 2);
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
        const q = outBack(span(lt, at(`item${i}`), 0.5));
        if (q <= 0) return;
        const y = top + i * gap;
        put(`item${i}`, dotX, y, () => {
          ctx.globalAlpha = i < current ? 0.6 : 1;
          ctx.translate(-(1 - clamp01(q)) * unit * 0.1, 0);
          ctx.fillStyle = world.brand.accent;
          ctx.beginPath();
          ctx.arc(dotX, y, unit * 0.035 * q, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = world.brand.bg;
          ctx.font = display(f, unit * 0.04);
          ctx.textAlign = "center";
          ctx.fillText(String(i + 1), dotX, y + unit * 0.014);
          ctx.textAlign = "left";
          ctx.fillStyle = world.brand.text;
          ctx.font = ui(f, unit * 0.045, 600);
          ctx.fillText(item, m + unit * 0.1, y + unit * 0.016);
          return { x: m, y: y - unit * 0.04, w: unit * 0.1 + ctx.measureText(item).width, h: unit * 0.08 };
        });
      });
      if (asset && !vertical) {
        const p = outBack(span(lt, at("media"), 0.6));
        put("media", w * 0.76, h * 0.55, () => device(f, asset, w * 0.76, h * 0.55 + (1 - p) * h * 0.5, h * 0.68, missing));
      }
      break;
    }
    case "beforeAfter": {
      title(m, vertical ? h * 0.14 : h * 0.15, titleSize * 0.85, w - m * 2);
      const area = { x: m, y: vertical ? h * 0.22 : h * 0.24, w: w - m * 2, h: vertical ? h * 0.55 : h * 0.6 };
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
        ctx.beginPath();
        ctx.rect(split, area.y, area.x + area.w - split, area.h);
        ctx.clip();
        drawImage(f, after, area.x + area.w / 2, area.y + area.h / 2, area.w, area.h, s.assetB ? `Falta la imagen: ${s.assetB}` : "Después");
        ctx.restore();
        ctx.fillStyle = world.brand.accent;
        ctx.fillRect(split - unit * 0.004, area.y, unit * 0.008, area.h);
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
    case "product": {
      const p = outBack(span(lt, at("media"), 0.7));
      const float = noise(world.seed + s.index, f.t * 0.5) * unit * 0.012;
      const cx = w / 2;
      const cy = vertical ? h * 0.52 : h * 0.55;
      put("media", cx, cy, () => {
        ctx.translate(cx, cy + float);
        ctx.rotate(noise(world.seed + 7, f.t * 0.3) * 0.04);
        ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
        const b = drawImage(f, asset, 0, 0, vertical ? w * 0.75 : w * 0.45, vertical ? h * 0.45 : h * 0.6, missing);
        return { x: cx + b.x, y: cy + b.y, w: b.w, h: b.h };
      });
      title(m, vertical ? h * 0.15 : h * 0.18, titleSize, w - m * 2);
      const tag = s.items[0];
      if (tag) {
        const q = outBack(span(lt, at("tag"), 0.5));
        const tx = vertical ? w / 2 : w * 0.78;
        const ty = vertical ? h * 0.78 : h * 0.72;
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
      const match = s.title.match(/^([\d.,]+)\s*(.*)$/);
      const value = match ? Number(match[1].replace(/\./g, "").replace(",", ".")) : NaN;
      const count = outCubic(span(lt, at("title"), 1.2));
      const shown = Number.isFinite(value)
        ? `${(value * count).toFixed(Number.isInteger(value) ? 0 : 1)}${match![2] ? ` ${match![2]}` : ""}`
        : s.title;
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
      const p = outBack(span(lt, at("media"), 0.6));
      const cx = w / 2;
      const cy = vertical ? h * 0.42 : h * 0.36;
      put("media", cx, cy, () => {
        // An accent ring draws itself around the logo; the logo sits on the background, so it shows whatever its colour.
        ctx.strokeStyle = world.brand.accent;
        ctx.lineWidth = unit * 0.012;
        ctx.beginPath();
        ctx.arc(cx, cy, unit * 0.2, -Math.PI / 2, -Math.PI / 2 + outCubic(span(lt, at("media"), 0.7)) * Math.PI * 2);
        ctx.stroke();
        ctx.translate(cx, cy);
        ctx.scale(Math.max(0, p), Math.max(0, p));
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
        const r = outBack(span(lt, at("tag"), 0.5));
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

// Frame t of the explainer. Scenes change with a push: the old one slides out, the new one in, behind an accent bar.
// `probe` (the editor only) hears where each visible element of the current scene is; not during a push.
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
  const f: Frame = { ctx, w, h, unit: Math.min(w, h), vertical: h > w, world, t, probe };
  backdrop(f);
  if (!scenes.length) return;
  const i = sceneAt(scenes, t);
  const s = scenes[i];
  const lt = t - s.start;
  // The change between scenes follows the tone: a push (warm, fast when absurd) or a hard cut (dry).
  const push = cutPush(script.tone);
  // moveSet redraws the backdrop inside the camera, so a push or a pan moves the set and not only the type.
  // During a scene change the backdrop stays put, the same as before the camera existed.
  const drawShot = (scene: TimedScene, sceneTime: number, hit: boolean, moveSet: boolean) => {
    const cam = cameraAt(scene.camera, sceneTime / Math.max(0.2, scene.seconds));
    ctx.save();
    ctx.translate(w / 2 + cam.x * w, h / 2 + cam.y * h);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-w / 2, -h / 2);
    const shot: Frame = {
      ...f,
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
    if (moveSet) backdrop(shot);
    drawScene(shot, scene, sceneTime);
    ctx.restore();
  };
  if (i > 0 && lt < push) {
    const p = inOutCubic(lt / push);
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
  subtitle(f, s.voice);
  footer(f);
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
