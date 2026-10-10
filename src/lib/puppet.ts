// 3D-look characters as cut-out puppets: the layers Grok's Segments export from one picture (head, body, arms, mouth,
// eyes), lined up because they share one canvas. Each part turns around its pivot (the neck, a shoulder); the pose
// is a pure function of time, like the rest of the engine: breathing, a seeded blink, the gesture, and the mouth
// following the voice.
import type { MotionGesture, MotionTone } from "../../shared/motion.ts";
import { PUPPET_FACES, PUPPET_MOUTHS, PUPPET_VIEWS, type BrandMotion, type Puppet, type PuppetPlace, type PuppetRole } from "../../shared/series.ts";
import { mulberry32, noise } from "./motion.ts";

type Box = { x: number; y: number; w: number; h: number };
// The sheet's alternates: swapped in by the pose, never part of the front figure's size.
export const isAlternate = (role: PuppetRole) =>
  (PUPPET_MOUTHS as readonly PuppetRole[]).includes(role) || (PUPPET_FACES as readonly PuppetRole[]).includes(role) || (PUPPET_VIEWS as readonly PuppetRole[]).includes(role);
// rect: where the picture is drawn on the reference canvas; box: its opaque part there; pivot: where it turns.
export type PuppetPart = { role: PuppetRole; image: CanvasImageSource; rect: Box; box: Box; pivot: [number, number] };
// Coordinates are in the reference canvas (the body's size, or the first layer's); bounds is where the character is.
export type PuppetAsset = { width: number; height: number; parts: PuppetPart[]; bounds: Box };

// Where a layer is not transparent, in the picture's own pixels. Kept per picture: the editor asks on every drag.
const boxes = new WeakMap<HTMLImageElement, Box>();
function alphaBox(img: HTMLImageElement, width: number, height: number): Box {
  const known = boxes.get(img);
  if (known && img.naturalWidth === width && img.naturalHeight === height) return known;
  const found = measureAlpha(img, width, height);
  if (img.naturalWidth === width && img.naturalHeight === height) boxes.set(img, found);
  return found;
}

function measureAlpha(img: HTMLImageElement, width: number, height: number): Box {
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
    case "faceHappy":
    case "faceSurprised":
    case "faceWorried":
      return [cx, box.y + box.h * 0.92];
    case "armL":
    case "armR": {
      const towardBody = body ? body.x + body.w / 2 > cx : role === "armL";
      return [towardBody ? box.x + box.w * 0.85 : box.x + box.w * 0.15, box.y + box.h * 0.08];
    }
    case "body":
    case "extra":
    case "view34":
    case "viewSide":
      return [cx, box.y + box.h];
    default:
      return [cx, box.y + box.h / 2];
  }
}

// A loose crop (Grok's Segments cut each thing to its own size) gets a starting place from what it is, next to the
// body and the head; "Armar a mano" moves it from there. Shares of the reference canvas, like PuppetPlace.
export function startingPlace(
  role: PuppetRole,
  aspect: number,
  ref: { width: number; height: number },
  body: Box,
  head: Box | null,
): PuppetPlace {
  const fit = (cx: number, top: number, w: number): PuppetPlace => ({ x: (cx - w / 2) / ref.width, y: top / ref.height, w: w / ref.width });
  const bodyCx = body.x + body.w / 2;
  // Without a head layer the head is painted on the body (a whole figure): its top fifth is the face.
  const face = head ?? { x: bodyCx - body.w * 0.3, y: body.y, w: body.w * 0.6, h: body.h * 0.2 };
  const faceCx = face.x + face.w / 2;
  const shoulders = head ? body.y : body.y + body.h * 0.22;
  switch (role) {
    case "head": {
      const w = body.w * 0.6;
      return fit(bodyCx, body.y - w * aspect * 0.85, w);
    }
    case "armL": {
      const w = body.w * 0.3;
      return fit(body.x + w * 0.2, shoulders + body.h * 0.02, w);
    }
    case "armR": {
      const w = body.w * 0.3;
      return fit(body.x + body.w - w * 0.2, shoulders + body.h * 0.02, w);
    }
    // A face from the sheet goes over the head (same place and size); the views stand next to the figure, out of the
    // way (the pose draws them at the figure's feet and height wherever they sit here).
    case "faceHappy":
    case "faceSurprised":
    case "faceWorried": {
      if (head) return fit(faceCx, face.y, face.w);
      const w = body.w * 0.6;
      return fit(bodyCx, body.y - w * aspect * 0.85, w);
    }
    case "view34":
    case "viewSide": {
      const w = body.h / Math.max(0.1, aspect);
      return fit(body.x + body.w + w * (role === "view34" ? 0.65 : 1.8), body.y, w);
    }
    case "mouth":
    case "mouthA":
    case "mouthO":
    case "mouthE": {
      const w = face.w * 0.3;
      return fit(faceCx, face.y + face.h * 0.7 - (w * aspect) / 2, w);
    }
    case "eyes": {
      const w = face.w * 0.6;
      return fit(faceCx, face.y + face.h * 0.42 - (w * aspect) / 2, w);
    }
    default:
      return fit(bodyCx, body.y, body.w);
  }
}

// The reference canvas: the body's picture (or the first layer's). Layers of that same size sit on it as they are.
function referenceIndex(puppet: Puppet, images: (HTMLImageElement | null)[]): number {
  const body = puppet.layers.findIndex((l, i) => l.role === "body" && images[i]);
  return body >= 0 ? body : images.findIndex(Boolean);
}

const sameSize = (img: HTMLImageElement, w: number, h: number) =>
  Math.abs(img.naturalWidth - w) <= w * 0.01 && Math.abs(img.naturalHeight - h) <= h * 0.01;

// Where every layer goes on the reference canvas: its hand-set place, the whole canvas for a layer of the same size,
// or a starting place for a loose crop. Shared by the puppet and the "Armar a mano" editor so both match.
export function layerRects(puppet: Puppet, images: (HTMLImageElement | null)[]): { width: number; height: number; rects: (Box | null)[] } | null {
  const r = referenceIndex(puppet, images);
  if (r < 0) return null;
  const ref = images[r]!;
  const width = ref.naturalWidth;
  const height = ref.naturalHeight;
  const toRect = (p: PuppetPlace, img: HTMLImageElement): Box => {
    const w = p.w * width;
    return { x: p.x * width, y: p.y * height, w, h: (w * img.naturalHeight) / Math.max(1, img.naturalWidth) };
  };
  const rects: (Box | null)[] = puppet.layers.map((l, i) => {
    const img = images[i];
    if (!img) return null;
    if (l.place) return toRect(l.place, img);
    // A view is another picture of the whole figure: it stands aside even when its canvas is the body's size.
    const aside = (PUPPET_VIEWS as readonly PuppetRole[]).includes(l.role);
    return i === r || (!aside && sameSize(img, width, height)) ? { x: 0, y: 0, w: width, h: height } : null;
  });
  // Opaque boxes of what is already placed, to start the loose crops next to them.
  const boxOf = (i: number) => {
    const img = images[i]!;
    const rect = rects[i]!;
    const a = alphaBox(img, img.naturalWidth, img.naturalHeight);
    const kx = rect.w / img.naturalWidth;
    const ky = rect.h / img.naturalHeight;
    return { x: rect.x + a.x * kx, y: rect.y + a.y * ky, w: a.w * kx, h: a.h * ky };
  };
  const body = boxOf(r);
  const headIndex = puppet.layers.findIndex((l, i) => l.role === "head" && rects[i]);
  const head = headIndex >= 0 ? boxOf(headIndex) : null;
  puppet.layers.forEach((l, i) => {
    const img = images[i];
    if (rects[i] || !img) return;
    rects[i] = toRect(startingPlace(l.role, img.naturalHeight / Math.max(1, img.naturalWidth), { width, height }, body, head), img);
  });
  return { width, height, rects };
}

export function buildPuppet(puppet: Puppet, images: (HTMLImageElement | null)[]): PuppetAsset | null {
  const placed = layerRects(puppet, images);
  if (!placed) return null;
  const { width, height, rects } = placed;
  const parts = puppet.layers.flatMap((layer, i) => {
    const img = images[i];
    const rect = rects[i];
    if (!img || !rect) return [];
    const a = alphaBox(img, img.naturalWidth, img.naturalHeight);
    const kx = rect.w / img.naturalWidth;
    const ky = rect.h / img.naturalHeight;
    const box = { x: rect.x + a.x * kx, y: rect.y + a.y * ky, w: a.w * kx, h: a.h * ky };
    return [{ role: layer.role, image: img as CanvasImageSource, rect, box, pivotShare: layer.pivot }];
  });
  if (!parts.length) return null;
  const body = parts.find((p) => p.role === "body")?.box ?? null;
  const done: PuppetPart[] = parts.map((p) => ({
    role: p.role,
    image: p.image,
    rect: p.rect,
    box: p.box,
    pivot: p.pivotShare ? [p.pivotShare[0] * width, p.pivotShare[1] * height] : autoPivot(p.role, p.box, body),
  }));
  // Where the character is: its front figure (the alternates only swap in; a view stands aside in "Armar a mano").
  const front = done.some((p) => !isAlternate(p.role)) ? done.filter((p) => !isAlternate(p.role)) : done;
  const x0 = Math.min(...front.map((p) => p.box.x));
  const y0 = Math.min(...front.map((p) => p.box.y));
  const x1 = Math.max(...front.map((p) => p.box.x + p.box.w));
  const y1 = Math.max(...front.map((p) => p.box.y + p.box.h));
  return { width, height, parts: done, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// One picture as a puppet of one piece (a character with an image but no parts): it still breathes and moves.
export function singlePuppet(img: HTMLImageElement): PuppetAsset {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const box = alphaBox(img, width, height);
  return { width, height, parts: [{ role: "body", image: img, rect: { x: 0, y: 0, w: width, h: height }, box, pivot: [box.x + box.w / 2, box.y + box.h] }], bounds: box };
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
  // The sheet's alternates, drawn only when the puppet has those layers: the mouth's shape, the face and the view.
  shape: MouthShape;
  expression: Expression;
  view: PuppetView;
  // +1: it faces screen right (the views are drawn that way), -1: mirrored.
  facing: number;
};

// ── Face, mouth and view: pure selectors ────────────────────────────────────────
export type MouthShape = "closed" | "A" | "O" | "E";
export type Expression = "neutral" | "happy" | "surprised" | "worried";
export type PuppetView = "front" | "threeQuarter" | "side";

// The mouth holds a shape for MOUTH_HOLD seconds (blocks on the piece's clock) so it reads as syllables, not as
// flicker; under MOUTH_CLOSED it is closed at once (silence never waits for the block to end).
export const MOUTH_HOLD = 0.1;
export const MOUTH_CLOSED = 0.12;
export const mouthBlockStart = (t: number) => Math.floor(t / MOUTH_HOLD + 1e-9) * MOUTH_HOLD;

// level: the voice now; held: the voice at the start of the block (what the shape is chosen from). Loud: mostly A;
// middle: O or E; soft: mostly E. Which one inside a band is a seeded draw per block.
export function mouthShape(level: number, held: number, t: number, seed: number): MouthShape {
  if (level < MOUTH_CLOSED) return "closed";
  const v = held >= MOUTH_CLOSED ? held : level;
  const block = Math.floor(t / MOUTH_HOLD + 1e-9);
  const r = mulberry32(seed * 977 + block * 31 + 5)();
  if (v > 0.62) return r < 0.75 ? "A" : "O";
  if (v > 0.32) return r < 0.5 ? "O" : "E";
  return r < 0.7 ? "E" : "O";
}

// The layer that shows a shape, from those the puppet has: the shape's own, else the nearest open one; null when it
// has none (the plain mouth is stretched, as before), "mouth" for closed.
const MOUTH_FALLBACK: Record<Exclude<MouthShape, "closed">, PuppetRole[]> = {
  A: ["mouthA", "mouthO", "mouthE"],
  O: ["mouthO", "mouthA", "mouthE"],
  E: ["mouthE", "mouthO", "mouthA"],
};
export function mouthLayer(shape: MouthShape, has: (role: PuppetRole) => boolean): PuppetRole | null {
  if (shape === "closed") return "mouth";
  return MOUTH_FALLBACK[shape].find(has) ?? null;
}

// The scene's emotion (free text from the writer, Spanish or English) to one of the sheet's faces. The earliest word
// that names one wins ("contenta pero nerviosa" is happy), a negated one does not count; anything else is neutral.
const FACE_WORDS: [Expression, RegExp][] = [
  ["happy", /\b(feliz|alegr|content|entusias|sonri|sonrisa|risa|divert|orgullos|aliviad|calid|celebr|happy|joy|glad|excit|cheer|proud|reliev|warm|smil|amus|delight)/g],
  ["surprised", /\b(sorpre|asombr|increibl|impactad|atonit|perplej|desconcert|incredul|wow|surpris|amaz|astonish|shock|stunn|baffl)/g],
  ["worried", /\b(preocup|ansios|nervios|trist|frustr|cansad|agobi|estresad|mied|angusti|molest|enojad|hart|apurad|worr|anxi|nervous|sad|tired|stress|afraid|scared|fear|annoy|angry|upset|overwhelm|tense)/g],
];
export function expressionFor(emotion: string): Expression {
  const text = emotion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let best: Expression = "neutral";
  let at = Infinity;
  for (const [face, words] of FACE_WORDS) {
    words.lastIndex = 0;
    for (let m = words.exec(text); m; m = words.exec(text)) {
      // "sin miedo", "no preocupada", "not worried" do not name that face.
      if (/\b(sin|no|not|nada|never|nunca) +$/.test(text.slice(Math.max(0, m.index - 7), m.index))) continue;
      if (m.index < at) {
        at = m.index;
        best = face;
      }
      break;
    }
  }
  return best;
}
const FACE_LAYER: Record<Exclude<Expression, "neutral">, PuppetRole> = { happy: "faceHappy", surprised: "faceSurprised", worried: "faceWorried" };
export const faceLayer = (e: Expression): PuppetRole | null => (e === "neutral" ? null : FACE_LAYER[e]);

// While a gesture points at something (point always; present only when there is something to present), the figure
// turns toward it: profile for pointing, 3/4 for presenting. From the gesture's main move on; before, it faces us.
export function viewFor(gesture: MotionGesture, g: number, aiming: boolean): PuppetView {
  if (g <= 0) return "front";
  if (gesture === "point") return "side";
  if (gesture === "present" && aiming) return "threeQuarter";
  return "front";
}
// The view's layer, from those it has (profile falls back to 3/4 and back); null: the front figure.
export function viewLayer(view: PuppetView, has: (role: PuppetRole) => boolean): PuppetRole | null {
  if (view === "front") return null;
  const order: PuppetRole[] = view === "side" ? ["viewSide", "view34"] : ["view34", "viewSide"];
  return order.find(has) ?? null;
}

// What the face reads from the scene: its emotion, whether the gesture aims at something, and the voice at the start
// of the mouth's block (see mouthShape). All optional: a puppet given none acts as before.
export type PuppetFace = { emotion?: string; aiming?: boolean; held?: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
// Ends on 1, passing it on the way by about 4 % with c = 1, 7 % with 1.4, 10 % with 1.7, 13 % with 2.
const outBack = (x: number, c = 1.4) => {
  const v = clamp01(x);
  return 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2;
};

// How a puppet acts, from how the piece lands (the brand's physics, else the tone, as landFor): `wind` scales the
// anticipation (the small opposite move before a gesture), `lead` is how long before the gesture it starts, in
// seconds; `overshoot` is how far the gesture's main move passes its mark before it settles (0: never); `squash`
// scales the squash when it lands from its entrance. A dry piece stays small and never overshoots, whatever the brand.
export type Acting = { wind: number; lead: number; overshoot: number; squash: number };
export const WARM_ACTING: Acting = { wind: 1, lead: 0.16, overshoot: 1, squash: 1 };
export function actingFor(tone: MotionTone | undefined, motion: BrandMotion | undefined): Acting {
  if (tone === "dry") return { wind: 0.45, lead: 0.12, overshoot: 0, squash: 0.5 };
  if (motion === "solid") return { wind: 0.6, lead: 0.12, overshoot: 0, squash: 0.6 };
  if (motion === "soft") return { wind: 0.8, lead: 0.2, overshoot: 0, squash: 0.8 };
  if (motion === "springy") return tone === "absurdist" ? { wind: 1.5, lead: 0.18, overshoot: 2, squash: 1.4 } : { wind: 1.2, lead: 0.17, overshoot: 1.4, squash: 1.2 };
  return tone === "absurdist" ? { wind: 1.6, lead: 0.2, overshoot: 1.7, squash: 1.4 } : WARM_ACTING;
}

// The anticipation at gesture time g (0 when the main move starts): it winds up over `lead` seconds before the move,
// is fully wound when the move starts and lets go while the move takes over, so the pose never jumps.
export const RELEASE = 0.2;
export function windUp(g: number, lead: number): number {
  if (g <= -lead || g >= RELEASE) return 0;
  return g < 0 ? ease((g + lead) / lead) : 1 - ease(g / RELEASE);
}

// t: seconds into the piece (breathing and blinks run on it); lt: seconds into the scene; enterAt and gestureAt
// from the scene's start; talk 0..1; toward: +1 when what it shows is on its right (screen right), -1 on its left.
// The gesture's main move starts at gestureAt (on its beat, with its sound); its anticipation comes just before.
export function puppetPose(
  t: number,
  lt: number,
  enterAt: number,
  gesture: MotionGesture,
  gestureAt: number,
  talk: number,
  toward: number,
  seed: number,
  acting: Acting = WARM_ACTING,
  face: PuppetFace = {},
): Pose {
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
    shape: mouthShape(talk, face.held ?? talk, t, seed),
    expression: expressionFor(face.emotion ?? ""),
    view: "front",
    facing: toward < 0 ? -1 : 1,
  };
  // Landing after the entrance: a quick squash.
  const land = (lt - enterAt - 0.45) / 0.25;
  if (land > 0 && land < 1) {
    const k = Math.sin(land * Math.PI) * 0.06 * acting.squash;
    pose.sy -= k;
    pose.sx += k * 0.7;
  }
  // A blink every three seconds or so, at a seeded moment.
  const block = Math.floor(t / 3.2);
  const start = block * 3.2 + mulberry32(seed * 31 + block)() * 1.6;
  const b = (t - start) / 0.16;
  if (b > 0 && b < 1) pose.blink = Math.sin(b * Math.PI);

  const g = lt - gestureAt;
  const lead = Math.max(0.05, acting.lead);
  if (g > -lead) {
    // w: how wound up it is (0..1) times how much this piece acts; reach: the main move, 0 → 1 (with its overshoot).
    const w = windUp(g, lead) * acting.wind;
    const reach = (seconds: number) => (g <= 0 ? 0 : acting.overshoot > 0 ? outBack(g / seconds, acting.overshoot) : ease(g / seconds));
    const side = toward || 1;
    switch (gesture) {
      case "present": {
        // Before opening, the arms come in a little and the body dips.
        const open = reach(0.5) * 0.45 - w * 0.14;
        pose.armL += open;
        pose.armR -= open;
        pose.sy -= w * 0.015;
        pose.sx += w * 0.01;
        break;
      }
      case "wave": {
        // Before it goes up, the arm swings in and the head tips away. The waving swells in and out, so it never jumps.
        const up = reach(0.4) * (1 - ease((g - 2.0) / 0.4));
        const envelope = Math.min(ease((g - 0.35) / 0.2), 1 - ease((g - 1.7) / 0.3));
        const swing = g > 0.35 && g < 2.0 ? Math.sin((g - 0.35) * Math.PI * 2 * 2.6) * 0.32 * envelope : 0;
        if (toward >= 0) pose.armR -= up * 2.3 + swing - w * 0.22;
        else pose.armL += up * 2.3 + swing - w * 0.22;
        pose.head += (up * 0.06 - w * 0.03) * toward;
        break;
      }
      case "point": {
        // Before it points, the arm draws back and the body leans away from what it shows.
        const raise = reach(0.4);
        if (toward >= 0) pose.armR -= raise * 1.25 - w * 0.2;
        else pose.armL += raise * 1.25 - w * 0.2;
        pose.lean += (raise * 0.035 - w * 0.01) * toward;
        pose.head += (raise * 0.05 - w * 0.03) * toward;
        break;
      }
      case "cheer": {
        // A crouch with the arms down, then up. Three whole hops, so the last one lands on the floor.
        const up = reach(0.3) * 2.55 - w * 0.15;
        pose.armL += up;
        pose.armR -= up;
        pose.sy -= w * 0.05;
        pose.sx += w * 0.035;
        const hop = g > 0 && g < 3 / 2.4 ? Math.abs(Math.sin(g * Math.PI * 2.4)) : 0;
        pose.rise += hop * 0.06;
        pose.sy += hop * 0.03;
        break;
      }
      case "surprise": {
        // A small flinch in (arms in, head forward, a crouch), then the jump back with the arms out.
        const jump = g > 0 && g < 0.5 ? Math.sin((g / 0.5) * Math.PI) : 0;
        pose.rise += jump * 0.08;
        pose.sy += jump * 0.06 - w * 0.035;
        pose.sx += w * 0.02 - jump * 0.03;
        const out = reach(0.25) * 0.95 - w * 0.12;
        pose.armL += out;
        pose.armR -= out;
        pose.head -= (reach(0.25) * 0.08 - w * 0.04) * side;
        if (g > 0) pose.mouth = Math.max(pose.mouth, g < 1.2 ? 0.7 * ease(g / 0.1) * (1 - ease((g - 0.6) / 0.6)) : 0);
        // The surprise shows on the face while it lasts, mouth in an O unless it is talking.
        if (g > 0 && g < 1.2) {
          pose.expression = "surprised";
          if (pose.shape === "closed" && pose.mouth >= MOUTH_CLOSED) pose.shape = "O";
        }
        break;
      }
    }
    if (gesture === "cheer" && g > 0) pose.expression = "happy";
    pose.view = viewFor(gesture, g, face.aiming ?? false);
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
    ctx.drawImage(p.image, p.rect.x, p.rect.y, p.rect.w, p.rect.h);
    ctx.restore();
  };

  const has = (role: PuppetRole) => puppet.parts.some((p) => p.role === role);
  // A view of the whole figure (3/4, profile) stands in for every front part while it is shown: its feet on the
  // figure's feet, as tall as the figure, mirrored when what it looks at is on its left.
  const viewRole = viewLayer(pose.view, has);
  const view = viewRole ? part(viewRole)[0] : undefined;
  if (view) {
    const kv = puppet.bounds.h / Math.max(1, view.box.h);
    ctx.translate(feetX, feetY);
    ctx.scale(kv * pose.facing, kv);
    ctx.translate(-(view.box.x + view.box.w / 2), -(view.box.y + view.box.h));
    ctx.drawImage(view.image, view.rect.x, view.rect.y, view.rect.w, view.rect.h);
    ctx.restore();
    return { x: cx - (puppet.bounds.w / 2) * k, y: bottom - height, w: puppet.bounds.w * k, h: height };
  }

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
  // A face from the sheet goes over the head with its own eyes (no blink) and, while silent, its own mouth.
  const faceRole = faceLayer(pose.expression);
  const face = faceRole ? part(faceRole) : [];
  for (const p of face) drawPart(p);
  if (!face.length) for (const p of part("eyes")) drawPart(p, 0, 1 - pose.blink * 0.88);
  const shapes = (["mouthA", "mouthO", "mouthE"] as const).some(has);
  if (!shapes) {
    // No mouth shapes: the plain mouth stretches with the voice, as it always did.
    if (!face.length || pose.mouth >= MOUTH_CLOSED) for (const p of part("mouth")) drawPart(p, 0, 1 + pose.mouth * 0.9);
  } else {
    const role = mouthLayer(pose.shape, has);
    if (role && (role !== "mouth" || !face.length)) for (const p of part(role)) drawPart(p);
  }
  ctx.restore();
  ctx.restore();

  return { x: cx - (puppet.bounds.w / 2) * k, y: bottom - height, w: puppet.bounds.w * k, h: height };
}
