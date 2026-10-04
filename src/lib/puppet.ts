// 3D-look characters as cut-out puppets: the layers Grok's Segments export from one picture (head, body, arms, mouth,
// eyes), lined up because they share one canvas. Each part turns around its pivot (the neck, a shoulder); the pose
// is a pure function of time, like the rest of the engine: breathing, a seeded blink, the gesture, and the mouth
// following the voice.
import type { MotionGesture } from "../../shared/motion.ts";
import type { Puppet, PuppetRole } from "../../shared/series.ts";
import { mulberry32, noise } from "./motion.ts";

type Box = { x: number; y: number; w: number; h: number };
export type PuppetPart = { role: PuppetRole; image: CanvasImageSource; box: Box; pivot: [number, number] };
// Coordinates are in the reference canvas (the first layer's size); bounds is where the character is.
export type PuppetAsset = { width: number; height: number; parts: PuppetPart[]; bounds: Box };

// Where a layer is not transparent.
function alphaBox(img: HTMLImageElement, width: number, height: number): Box {
  const scale = Math.min(1, 512 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: x0 / scale, y: y0 / scale, w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale };
}

// Where each part turns, found from its shape: the head at the neck, an arm at its shoulder (the upper end nearest
// the body), the body at its feet; mouth and eyes open and close around their middle.
function autoPivot(role: PuppetRole, box: Box, body: Box | null): [number, number] {
  const cx = box.x + box.w / 2;
  switch (role) {
    case "head":
      return [cx, box.y + box.h * 0.92];
    case "armL":
    case "armR": {
      const towardBody = body ? body.x + body.w / 2 > cx : role === "armL";
      return [towardBody ? box.x + box.w * 0.85 : box.x + box.w * 0.15, box.y + box.h * 0.08];
    }
    case "body":
    case "extra":
      return [cx, box.y + box.h];
    default:
      return [cx, box.y + box.h / 2];
  }
}

export function buildPuppet(puppet: Puppet, images: (HTMLImageElement | null)[]): PuppetAsset | null {
  const loaded = puppet.layers.map((l, i) => ({ layer: l, img: images[i] })).filter((x): x is { layer: (typeof puppet.layers)[number]; img: HTMLImageElement } => Boolean(x.img));
  if (!loaded.length) return null;
  const width = loaded[0].img.naturalWidth;
  const height = loaded[0].img.naturalHeight;
  // Every layer is fitted to the first one's canvas (they come from the same picture).
  const parts = loaded.map(({ layer, img }) => {
    const box = alphaBox(img, width, height);
    return { role: layer.role, image: img as CanvasImageSource, box, pivotShare: layer.pivot };
  });
  const body = parts.find((p) => p.role === "body")?.box ?? null;
  const done: PuppetPart[] = parts.map((p) => ({
    role: p.role,
    image: p.image,
    box: p.box,
    pivot: p.pivotShare ? [p.pivotShare[0] * width, p.pivotShare[1] * height] : autoPivot(p.role, p.box, body),
  }));
  const x0 = Math.min(...done.map((p) => p.box.x));
  const y0 = Math.min(...done.map((p) => p.box.y));
  const x1 = Math.max(...done.map((p) => p.box.x + p.box.w));
  const y1 = Math.max(...done.map((p) => p.box.y + p.box.h));
  return { width, height, parts: done, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// One picture as a puppet of one piece (a character with an image but no parts): it still breathes and moves.
export function singlePuppet(img: HTMLImageElement): PuppetAsset {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const box = alphaBox(img, width, height);
  return { width, height, parts: [{ role: "body", image: img, box, pivot: [box.x + box.w / 2, box.y + box.h] }], bounds: box };
}

// ── The pose at a moment ─────────────────────────────────────────────────────────
export type Pose = {
  // The whole character: rise (share of its height), squash and lean.
  rise: number;
  sx: number;
  sy: number;
  lean: number;
  head: number;
  headRise: number;
  armL: number;
  armR: number;
  mouth: number;
  blink: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const outBack = (x: number) => {
  const v = clamp01(x);
  return 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2;
};

// t: seconds into the piece (breathing and blinks run on it); lt: seconds into the scene; enterAt and gestureAt
// from the scene's start; talk 0..1; toward: +1 when what it shows is on its right (screen right), -1 on its left.
export function puppetPose(t: number, lt: number, enterAt: number, gesture: MotionGesture, gestureAt: number, talk: number, toward: number, seed: number): Pose {
  const enter = outBack((lt - enterAt) / 0.55);
  const pose: Pose = {
    rise: -(1 - clamp01(enter)) * 0.45,
    sx: 1,
    sy: 1 + 0.012 * Math.sin((t * Math.PI * 2) / 3.1),
    lean: 0.012 * noise(seed, t * 0.35),
    head: 0.035 * noise(seed + 3, t * 0.5) + talk * 0.03 * Math.sin(t * 9),
    headRise: talk * 0.006,
    // At rest the arms hang a little out.
    armL: 0.08,
    armR: -0.08,
    mouth: talk,
    blink: 0,
  };
  // Landing after the entrance: a quick squash.
  const land = (lt - enterAt - 0.45) / 0.25;
  if (land > 0 && land < 1) {
    const k = Math.sin(land * Math.PI) * 0.06;
    pose.sy -= k;
    pose.sx += k * 0.7;
  }
  // A blink every three seconds or so, at a seeded moment.
  const block = Math.floor(t / 3.2);
  const start = block * 3.2 + mulberry32(seed * 31 + block)() * 1.6;
  const b = (t - start) / 0.16;
  if (b > 0 && b < 1) pose.blink = Math.sin(b * Math.PI);

  const g = lt - gestureAt;
  if (g > 0) {
    const raise = ease(g / 0.4);
    switch (gesture) {
      case "present": {
        const open = ease(g / 0.5) * 0.45;
        pose.armL += open;
        pose.armR -= open;
        break;
      }
      case "wave": {
        const up = raise * (1 - ease((g - 2.0) / 0.4));
        const swing = g > 0.35 && g < 2.0 ? Math.sin((g - 0.35) * Math.PI * 2 * 2.6) * 0.32 : 0;
        if (toward >= 0) pose.armR -= up * 2.3 + swing;
        else pose.armL += up * 2.3 + swing;
        pose.head += up * 0.06 * toward;
        break;
      }
      case "point": {
        if (toward >= 0) pose.armR -= raise * 1.25;
        else pose.armL += raise * 1.25;
        pose.lean += raise * 0.035 * toward;
        pose.head += raise * 0.05 * toward;
        break;
      }
      case "cheer": {
        const up = ease(g / 0.3);
        pose.armL += up * 2.55;
        pose.armR -= up * 2.55;
        const hop = g < 1.5 ? Math.abs(Math.sin(g * Math.PI * 2.4)) : 0;
        pose.rise += hop * 0.06;
        pose.sy += hop * 0.03;
        break;
      }
      case "surprise": {
        const jump = g < 0.5 ? Math.sin((g / 0.5) * Math.PI) : 0;
        pose.rise += jump * 0.08;
        pose.sy += jump * 0.06;
        pose.sx -= jump * 0.03;
        const out = ease(g / 0.25) * 0.95;
        pose.armL += out;
        pose.armR -= out;
        pose.head -= ease(g / 0.25) * 0.08 * (toward || 1);
        pose.mouth = Math.max(pose.mouth, g < 1.2 ? 0.7 * (1 - ease((g - 0.6) / 0.6)) : 0);
        break;
      }
    }
  }
  return pose;
}

// Draws the puppet with its feet at (cx, bottom) and `height` tall. Returns where it ended up.
export function drawPuppet(ctx: CanvasRenderingContext2D, puppet: PuppetAsset, cx: number, bottom: number, height: number, pose: Pose, alpha = 1): Box {
  const k = height / puppet.bounds.h;
  const feetX = puppet.bounds.x + puppet.bounds.w / 2;
  const feetY = puppet.bounds.y + puppet.bounds.h;
  const part = (role: PuppetRole) => puppet.parts.filter((p) => p.role === role);
  const head = part("head")[0];

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, bottom - pose.rise * height);
  ctx.rotate(pose.lean);
  ctx.scale(k * pose.sx, k * pose.sy);
  ctx.translate(-feetX, -feetY);

  const drawPart = (p: PuppetPart, rot = 0, sy = 1) => {
    ctx.save();
    ctx.translate(p.pivot[0], p.pivot[1]);
    ctx.rotate(rot);
    if (sy !== 1) ctx.scale(1 + (1 - sy) * 0.15, sy);
    ctx.translate(-p.pivot[0], -p.pivot[1]);
    ctx.drawImage(p.image, 0, 0, puppet.width, puppet.height);
    ctx.restore();
  };

  for (const p of part("extra")) drawPart(p);
  for (const p of part("body")) drawPart(p);
  for (const p of part("armL")) drawPart(p, pose.armL);
  for (const p of part("armR")) drawPart(p, pose.armR);
  // Head, eyes and mouth turn together around the neck.
  ctx.save();
  if (head) {
    ctx.translate(0, -pose.headRise * puppet.bounds.h);
    ctx.translate(head.pivot[0], head.pivot[1]);
    ctx.rotate(pose.head);
    ctx.translate(-head.pivot[0], -head.pivot[1]);
  }
  for (const p of part("head")) drawPart(p);
  for (const p of part("eyes")) drawPart(p, 0, 1 - pose.blink * 0.88);
  for (const p of part("mouth")) drawPart(p, 0, 1 + pose.mouth * 0.9);
  ctx.restore();
  ctx.restore();

  return { x: cx - (puppet.bounds.w / 2) * k, y: bottom - height, w: puppet.bounds.w * k, h: height };
}
