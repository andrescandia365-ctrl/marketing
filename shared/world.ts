// "Un mundo ilustrado de la marca": an explainer scene can sit in a flat illustrated place (a store, a street, a home, a
// desk) instead of the plain background. The place is layered flat shapes in tints of the brand's colours (no gradient,
// no glow, no particles), laid out from a seed (deterministic), in three depth layers that follow the scene camera at
// their own depth (parallax). It must never hurt reading: every tone keeps the brand's text and accent contrast
// (worldPalette, measured with contrastRatio), and the small "busy" shapes are left out wherever the scene's words sit
// (busyClear). Pure: the renderer (src/lib/motion.ts) draws what this returns.
import { CONTRAST_ACCENT, CONTRAST_TEXT, STEP_DOWN_CONTRAST, contrastRatio, mixHex, stepDownColour, type Brand } from "./series.ts";

export const WORLD_PLACES = ["store", "street", "home", "desk"] as const;
export type WorldPlace = (typeof WORLD_PLACES)[number];
export const WORLD_PLACE_LABEL: Record<WorldPlace, string> = { store: "Negocio", street: "Calle", home: "Casa", desk: "Escritorio" };
// A scene's own choice: a place, or "none" (the plain background even when the piece has a place).
export type SceneWorld = WorldPlace | "none";

// The writer's word for a place, tolerant (English or Spanish). "none" when it says so; undefined when it gave none.
export function pickWorld(value: string | undefined): SceneWorld | undefined {
  const v = (value ?? "").toLowerCase().trim();
  if (!v) return undefined;
  if (/^(none|no|ninguno|nada|plain|liso|sin)\b/.test(v)) return "none";
  if (/store|shop|kiosk|kiosco|negocio|tienda|almac|super|counter|mostrador|góndola|gondola/.test(v)) return "store";
  if (/street|calle|vereda|sidewalk|city|ciudad|barrio|outside|afuera/.test(v)) return "street";
  if (/home|house|casa|hogar|living|room|cuarto|sofa|sofá|kitchen|cocina/.test(v)) return "home";
  if (/desk|office|oficina|escritorio|work|trabajo/.test(v)) return "desk";
  return undefined;
}

// The place a scene sits in: its own choice, else the piece's. Old pieces have neither: none (null).
export function worldOf(scene: { world?: SceneWorld }, piece: WorldPlace | undefined): WorldPlace | null {
  if (scene.world === "none") return null;
  return scene.world ?? piece ?? null;
}

// Where a series leans when the writer gives no place: software shows the store (or the desk), e-commerce the home.
export const worldLean = (seriesType: string | undefined): WorldPlace => (seriesType === "ecommerce" ? "home" : "store");

// ── Tones ─────────────────────────────────────────────────────────────────────────────
// The wall is the brand's background itself. The other tones are the background mixed a little toward a tint of the
// brand (its text with some accent; the detail toward the accent), as far as WORLD_MIX at most, and only as far as a
// tone keeps worldSafe. A brand whose tint direction would cost contrast tries the other way (toward black or white,
// away from its text) and takes whichever stands out more from the wall.
export type WorldTone = "far" | "mid" | "near" | "detail";
export const WORLD_MIX: Record<WorldTone, number> = { far: 0.05, mid: 0.09, near: 0.13, detail: 0.17 };
export type WorldPalette = Record<WorldTone, string> & { wall: string };

// A tone the brand's words can sit on: the text keeps 4.5:1 and the accent 3:1 on it (or, for a brand already under
// that on its own background, no less than it has there). A stepped-down label keeps its 3:1 through worldStepDown.
export function worldSafe(brand: Pick<Brand, "bg" | "text" | "accent">, tone: string): boolean {
  const keeps = (colour: string, need: number) => contrastRatio(colour, tone) >= Math.min(need, contrastRatio(colour, brand.bg)) - 1e-9;
  return keeps(brand.text, CONTRAST_TEXT) && keeps(brand.accent, CONTRAST_ACCENT);
}

// "Foco de a uno" over a world: an earlier label steps down toward the background as far as stepDownColour takes it,
// but only as far as it keeps STEP_DOWN_CONTRAST on every tone of the world too (a colour already under that on one
// of them steps down no further than it can keep what it has). `share` as in stepDownColour.
export function worldStepDown(colour: string, brand: Pick<Brand, "bg">, palette: WorldPalette, share: number): string {
  const full = stepDownColour(colour, brand.bg, share);
  if (full === colour) return colour;
  const tones = [palette.wall, palette.far, palette.mid, palette.near, palette.detail];
  const keeps = (c: string) => tones.every((t) => contrastRatio(c, t) >= Math.min(STEP_DOWN_CONTRAST, contrastRatio(colour, t)) - 1e-9);
  if (keeps(full)) return full;
  // The furthest point toward the full step that still keeps it (20 steps along the way).
  let best = colour;
  for (let n = 1; n <= 20; n++) {
    const c = mixHex(colour, full, n / 20);
    if (!keeps(c)) break;
    best = c;
  }
  return best;
}

function toneToward(brand: Pick<Brand, "bg" | "text" | "accent">, toward: string, most: number): { tone: string; k: number } {
  for (let k = most; k > 0.0001; k -= 0.005) {
    const tone = mixHex(brand.bg, toward, k);
    if (worldSafe(brand, tone)) return { tone, k };
  }
  return { tone: brand.bg, k: 0 };
}

export function worldPalette(brand: Pick<Brand, "bg" | "text" | "accent">): WorldPalette {
  const tint = mixHex(brand.text, brand.accent, 0.3);
  // Away from the text: darker under light text, lighter under dark text.
  const away = contrastRatio(brand.text, "#000000") > contrastRatio(brand.text, "#ffffff") ? "#000000" : "#ffffff";
  const tone = (key: WorldTone) => {
    const most = WORLD_MIX[key];
    const first = toneToward(brand, key === "detail" ? brand.accent : tint, most);
    if (first.k >= most / 2) return first.tone;
    const other = toneToward(brand, away, most);
    return contrastRatio(other.tone, brand.bg) > contrastRatio(first.tone, brand.bg) ? other.tone : first.tone;
  };
  return { wall: brand.bg, far: tone("far"), mid: tone("mid"), near: tone("near"), detail: tone("detail") };
}

// ── Shapes ────────────────────────────────────────────────────────────────────────────
// Depth of the three layers: how much of the scene camera's move each one takes (the scene's own elements take all of
// it). The back moves least, so the place reads as depth behind the words.
export const WORLD_DEPTH = [0.3, 0.6, 1] as const;
// A flat shape in frame pixels (before the camera). `busy`: a small or detailed shape (a product on a shelf, a window
// pane, a book), never drawn where the scene's words are (busyClear). Planes (a wall unit, the counter, the sofa) are
// flat, in safe tones, and may run behind text.
export type WorldShape = {
  layer: 0 | 1 | 2;
  tone: WorldTone;
  kind: "rect" | "round" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  // round: the corner radius.
  r?: number;
  busy: boolean;
  // The parts of one object (a monitor's bezel, screen and stand; a board and its notes): when busyClear leaves a busy
  // part out, the whole object goes, so a bezel never stays behind as an empty slab.
  group?: number;
};

function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The place's shapes for a w×h frame and a seed (the piece's), back to front. The floor and the big planes reach well
// past the frame so the camera, the parallax and "Pasar a través" never uncover an edge.
export function worldShapes(place: WorldPlace, w: number, h: number, seed: number): WorldShape[] {
  const r = rng(seed * 7919 + WORLD_PLACES.indexOf(place) * 104729 + 13);
  const vertical = h > w;
  const u = Math.min(w, h);
  const out: WorldShape[] = [];
  // One object's parts share a group (startGroup … endGroup); everything else has none.
  let group: number | undefined;
  let groups = 0;
  const startGroup = () => (group = ++groups);
  const endGroup = () => (group = undefined);
  const add = (s: Omit<WorldShape, "kind" | "busy"> & { kind?: WorldShape["kind"]; busy?: boolean }) =>
    out.push({ kind: "rect", busy: false, ...s, w: Math.max(1, s.w), h: Math.max(1, s.h), ...(group !== undefined && { group }) });
  const fy = h * (vertical ? 0.8 : 0.78);
  const left = -w * 0.6;
  const wide = w * 2.2;
  const deep = h * 1.6 - fy;
  // The floor, from the floor line down.
  add({ layer: 0, tone: "far", x: left, y: fy, w: wide, h: deep });
  // A row of small boxes along a board (products, books, binders), seeded sizes, at least `gap` apart.
  const row = (layer: 0 | 1 | 2, x0: number, x1: number, base: number, tall: number, tone: WorldTone = "detail") => {
    let x = x0 + u * 0.01;
    while (x < x1 - u * 0.02) {
      const bw = u * (0.022 + r() * 0.03);
      const bh = tall * (0.55 + r() * 0.45);
      if (x + bw > x1) break;
      add({ layer, tone, x, y: base - bh, w: bw, h: bh, busy: true });
      x += bw + u * (0.008 + r() * 0.012);
    }
  };
  if (place === "store") {
    // Back: shelving units along the wall, each with its boards and products.
    const unitW = vertical ? w * 0.42 : w * 0.24;
    const top = h * (vertical ? 0.16 : 0.14);
    for (let x = left + r() * unitW * 0.5; x < w * 1.6; x += unitW + u * 0.04) {
      add({ layer: 0, tone: "mid", x, y: top, w: unitW, h: fy - top });
      const boards = 4;
      for (let b = 1; b <= boards; b++) {
        const by = top + ((fy - top) * b) / (boards + 0.4);
        add({ layer: 0, tone: "near", x, y: by, w: unitW, h: u * 0.012, busy: true });
        row(0, x, x + unitW, by, (fy - top) / (boards + 0.4) - u * 0.03);
      }
    }
    // Middle: a fridge at one side, its door line and handle.
    const side = r() < 0.5;
    const fw = vertical ? w * 0.3 : w * 0.16;
    const fx = side ? -fw * 0.25 : w - fw * 0.75;
    startGroup();
    add({ layer: 1, tone: "near", kind: "round", r: u * 0.02, x: fx, y: h * 0.1, w: fw, h: fy - h * 0.1 + u * 0.03 });
    add({ layer: 1, tone: "mid", x: fx + fw * 0.08, y: h * 0.13, w: fw * 0.84, h: (fy - h * 0.13) * 0.94, busy: true });
    add({ layer: 1, tone: "detail", kind: "round", r: u * 0.006, x: side ? fx + fw * 0.82 : fx + fw * 0.12, y: h * 0.35, w: u * 0.012, h: h * 0.14, busy: true });
    endGroup();
    // Front: the counter, and the till on it.
    const cy = h * (vertical ? 0.86 : 0.85);
    add({ layer: 2, tone: "near", x: left, y: cy, w: wide, h: h * 1.6 - cy });
    add({ layer: 2, tone: "mid", x: left, y: cy, w: wide, h: u * 0.014 });
    const tx = w * (0.62 + r() * 0.2);
    add({ layer: 2, tone: "detail", kind: "round", r: u * 0.01, x: tx, y: cy - u * 0.07, w: u * 0.11, h: u * 0.07, busy: true });
  } else if (place === "street") {
    // Back: the far block, building tops at seeded heights.
    for (let x = left; x < w * 1.6; ) {
      const bw = u * (0.35 + r() * 0.35);
      const top = h * (0.12 + r() * 0.2);
      add({ layer: 0, tone: "far", x, y: top, w: bw + 1, h: fy - top });
      x += bw;
    }
    // Middle: the near fronts, with windows, and an awning over one door.
    let awning = false;
    for (let x = left + r() * u * 0.2; x < w * 1.6; ) {
      const bw = u * (0.45 + r() * 0.3);
      const top = h * (0.3 + r() * 0.15);
      add({ layer: 1, tone: "mid", x, y: top, w: bw, h: fy - top });
      const cols = 3;
      const ww = (bw * 0.6) / cols;
      for (let row = 0; top + u * 0.06 + row * ww * 1.8 + ww * 1.2 < fy - u * 0.2; row++)
        for (let c = 0; c < cols; c++)
          add({ layer: 1, tone: "far", x: x + bw * 0.12 + c * ((bw * 0.76) / cols), y: top + u * 0.06 + row * ww * 1.8, w: ww, h: ww * 1.2, busy: true });
      if (!awning && x + bw > w * 0.2 && x < w * 0.6) {
        awning = true;
        const ay = fy - u * 0.32;
        add({ layer: 1, tone: "near", x: x + bw * 0.1, y: ay, w: bw * 0.8, h: u * 0.07 });
        const n = 6;
        for (let k = 0; k < n; k++)
          add({ layer: 1, tone: "near", kind: "circle", x: x + bw * 0.1 + (k * bw * 0.8) / n, y: ay + u * 0.07 - (bw * 0.8) / n / 2, w: (bw * 0.8) / n, h: (bw * 0.8) / n, busy: true });
        add({ layer: 1, tone: "far", x: x + bw * 0.38, y: ay + u * 0.09, w: bw * 0.24, h: fy - ay - u * 0.09 });
      }
      x += bw + u * (0.02 + r() * 0.04);
    }
    // Front: the sidewalk's curb and a lamp post.
    const cy = h * (vertical ? 0.9 : 0.9);
    add({ layer: 2, tone: "near", x: left, y: cy, w: wide, h: h * 1.6 - cy });
    const px = w * (r() < 0.5 ? 0.08 + r() * 0.1 : 0.82 + r() * 0.1);
    startGroup();
    add({ layer: 2, tone: "detail", x: px, y: h * 0.18, w: u * 0.014, h: cy - h * 0.18, busy: true });
    add({ layer: 2, tone: "detail", kind: "round", r: u * 0.01, x: px - u * 0.04, y: h * 0.16, w: u * 0.094, h: u * 0.03, busy: true });
    endGroup();
  } else if (place === "home") {
    // Back: a window with its bars, a picture, the skirting.
    const side = r() < 0.5;
    const ww = vertical ? w * 0.46 : w * 0.26;
    const wx = side ? w * 0.06 : w * 0.94 - ww;
    const wy = h * (vertical ? 0.14 : 0.12);
    const wh = vertical ? h * 0.3 : h * 0.46;
    startGroup();
    add({ layer: 0, tone: "mid", kind: "round", r: u * 0.01, x: wx, y: wy, w: ww, h: wh });
    add({ layer: 0, tone: "far", x: wx + u * 0.02, y: wy + u * 0.02, w: ww - u * 0.04, h: wh - u * 0.04 });
    add({ layer: 0, tone: "mid", x: wx + ww / 2 - u * 0.007, y: wy, w: u * 0.014, h: wh, busy: true });
    add({ layer: 0, tone: "mid", x: wx, y: wy + wh / 2 - u * 0.007, w: ww, h: u * 0.014, busy: true });
    endGroup();
    const pw = u * (0.16 + r() * 0.06);
    add({ layer: 0, tone: "mid", x: side ? w * 0.7 : w * 0.14, y: h * (vertical ? 0.2 : 0.18), w: pw, h: pw * 0.75, busy: true });
    add({ layer: 0, tone: "mid", x: left, y: fy - u * 0.02, w: wide, h: u * 0.02 });
    // Middle: a wall shelf with books.
    const sx = side ? w * 0.62 : w * 0.08;
    const sw = vertical ? w * 0.34 : w * 0.24;
    const sy = h * (vertical ? 0.5 : 0.52);
    add({ layer: 1, tone: "near", x: sx, y: sy, w: sw, h: u * 0.014, busy: true });
    row(1, sx, sx + sw, sy, u * 0.12);
    // Front: the sofa (back, seat, arms) and two cushions.
    const so = vertical ? w * 0.9 : w * 0.56;
    const sxx = w / 2 - so / 2 + (r() - 0.5) * w * 0.2;
    const top = h * (vertical ? 0.8 : 0.72);
    add({ layer: 2, tone: "near", kind: "round", r: u * 0.05, x: sxx, y: top, w: so, h: h * 1.6 - top });
    add({ layer: 2, tone: "mid", kind: "round", r: u * 0.03, x: sxx - u * 0.04, y: top + u * 0.08, w: u * 0.12, h: h * 1.6 - top });
    add({ layer: 2, tone: "mid", kind: "round", r: u * 0.03, x: sxx + so - u * 0.08, y: top + u * 0.08, w: u * 0.12, h: h * 1.6 - top });
    add({ layer: 2, tone: "detail", kind: "round", r: u * 0.03, x: sxx + so * 0.12, y: top - u * 0.05, w: u * 0.16, h: u * 0.13, busy: true });
    add({ layer: 2, tone: "detail", kind: "round", r: u * 0.03, x: sxx + so * 0.7, y: top - u * 0.04, w: u * 0.15, h: u * 0.12, busy: true });
  } else {
    // desk. Back: a board with notes and a shelf with binders.
    const side = r() < 0.5;
    const bw = vertical ? w * 0.5 : w * 0.28;
    const bx = side ? w * 0.06 : w * 0.94 - bw;
    const by = h * (vertical ? 0.14 : 0.12);
    const bh = vertical ? h * 0.22 : h * 0.34;
    startGroup();
    add({ layer: 0, tone: "mid", kind: "round", r: u * 0.01, x: bx, y: by, w: bw, h: bh });
    for (let k = 0; k < 5; k++) {
      const nw = u * (0.06 + r() * 0.03);
      add({ layer: 0, tone: "detail", x: bx + u * 0.03 + r() * (bw - nw - u * 0.06), y: by + u * 0.03 + r() * (bh - nw - u * 0.06), w: nw, h: nw, busy: true });
    }
    endGroup();
    const sx = side ? w * 0.66 : w * 0.08;
    const sw = vertical ? w * 0.3 : w * 0.22;
    const sy = h * (vertical ? 0.3 : 0.3);
    add({ layer: 0, tone: "near", x: sx, y: sy, w: sw, h: u * 0.012, busy: true });
    row(0, sx, sx + sw, sy, u * 0.14, "mid");
    // Middle: a monitor and a lamp on the desk.
    const dy = h * (vertical ? 0.84 : 0.8);
    const mw = vertical ? w * 0.5 : w * 0.3;
    const mx = side ? w * 0.94 - mw : w * 0.06;
    const mh = mw * 0.6;
    startGroup();
    add({ layer: 1, tone: "near", kind: "round", r: u * 0.012, x: mx, y: dy - u * 0.06 - mh, w: mw, h: mh });
    add({ layer: 1, tone: "mid", x: mx + u * 0.015, y: dy - u * 0.06 - mh + u * 0.015, w: mw - u * 0.03, h: mh - u * 0.03, busy: true });
    add({ layer: 1, tone: "near", x: mx + mw / 2 - u * 0.015, y: dy - u * 0.06, w: u * 0.03, h: u * 0.06 });
    endGroup();
    const lx = side ? mx - u * 0.12 : mx + mw + u * 0.06;
    startGroup();
    add({ layer: 1, tone: "detail", x: lx, y: dy - u * 0.22, w: u * 0.012, h: u * 0.22, busy: true });
    add({ layer: 1, tone: "detail", kind: "round", r: u * 0.02, x: lx - u * 0.035, y: dy - u * 0.25, w: u * 0.08, h: u * 0.045, busy: true });
    endGroup();
    // Front: the desk top, a mug and papers.
    add({ layer: 2, tone: "near", x: left, y: dy, w: wide, h: h * 1.6 - dy });
    add({ layer: 2, tone: "mid", x: left, y: dy, w: wide, h: u * 0.014 });
    add({ layer: 2, tone: "detail", kind: "round", r: u * 0.01, x: w * (0.2 + r() * 0.15), y: dy - u * 0.07, w: u * 0.055, h: u * 0.07, busy: true });
    add({ layer: 2, tone: "mid", x: w * (0.45 + r() * 0.1), y: dy - u * 0.012, w: u * 0.18, h: u * 0.012, busy: true });
  }
  return out;
}

// ── Keeping the words clear ───────────────────────────────────────────────────────────
export type Rect = { x: number; y: number; w: number; h: number };
export type Cam = { z: number; x: number; y: number };

// Where a rect drawn at layer depth d lands on the frame under the scene camera `cam` (the scene's own elements: d = 1).
export function onFrame(rect: Rect, cam: Cam, depth: number, w: number, h: number): Rect {
  const z = 1 + (cam.z - 1) * depth;
  return { x: w / 2 + cam.x * depth * w + (rect.x - w / 2) * z, y: h / 2 + cam.y * depth * h + (rect.y - h / 2) * z, w: rect.w * z, h: rect.h * z };
}

const touches = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// The shapes to draw for a scene: every plane, and only the busy shapes that stay clear of the scene's words by `pad`
// pixels on the frame at every camera position the scene goes through (`cams`, sampled over the scene), so nothing busy
// ever sits behind text and nothing appears or goes mid-scene. `words` move with the scene camera (scene coordinates);
// `fixed` (the subtitle, the AI notice) stay where they are on the frame.
export function busyClear(shapes: WorldShape[], words: Rect[], cams: Cam[], w: number, h: number, pad: number, fixed: Rect[] = []): WorldShape[] {
  if (!words.length && !fixed.length) return shapes;
  const views = cams.length ? cams : [{ z: 1, x: 0, y: 0 }];
  const clear = (s: WorldShape) =>
    !s.busy ||
    !views.some((cam) => {
      const at = onFrame(s, cam, WORLD_DEPTH[s.layer], w, h);
      return words.some((b) => touches(at, onFrame(b, cam, 1, w, h), pad)) || fixed.some((b) => touches(at, b, pad));
    });
  const keep = shapes.map(clear);
  // An object that lost a part goes whole (its plane would read as an empty slab).
  const broken = new Set(shapes.filter((s, i) => !keep[i] && s.group !== undefined).map((s) => s.group));
  return shapes.filter((s, i) => keep[i] && !(s.group !== undefined && broken.has(s.group)));
}
