// The drawn storyboard: each shot as a grey pencil sketch made from what the shot already says (who is in frame,
// the place, a real screen, the framing in its image prompt), before anything is generated. Free and instant. Every
// line is a pure function of the shot (seeded wobble, no Math.random), so the sketch never changes between draws.
import type { Setup } from "../../shared/schema.ts";
import type { TimedShot } from "../../shared/template.ts";

export type SketchKind = "character" | "place" | "product" | "screen" | "other";
export type SketchSetup = { name: string; kind: SketchKind };
export type Framing = "close" | "medium" | "wide";

export const FRAMING_LABEL: Record<Framing, string> = { close: "Primer plano", medium: "Plano medio", wide: "Plano general" };

// What a shot's setups are, for its sketch: the cast says it; a new setup that sounds like a place is drawn as one.
export function sketchSetups(shot: TimedShot, setups: Record<string, Setup>, castKinds: Record<string, string>): SketchSetup[] {
  const list: SketchSetup[] = shot.setups.flatMap((id) => {
    const s = setups[id];
    if (!s) return [];
    const known = s.castId ? castKinds[s.castId] : undefined;
    // A person first (an owner "of a corner store" is still a person), then a place, else a thing or someone unnamed.
    const person = /\b(man|woman|person|owner|girl|boy|guy|lady|kid|child|he|she|his|her|years? old|\d{2}s)\b/i.test(s.identity);
    const place = /\b(store|shop|kiosk|room|kitchen|street|office|counter|aisle|house|living)\b/i.test(s.identity);
    const kind = (["character", "place", "product", "screen"].includes(known ?? "") ? known : person ? "character" : place ? "place" : "other") as SketchSetup["kind"];
    return [{ name: s.name, kind }];
  });
  // A transform that starts or ends on a real screen shows it too.
  if ((shot.kind === "screen" || (shot.kind === "transform" && shot.screenAt)) && !list.some((s) => s.kind === "screen"))
    list.push({ name: "Pantalla real", kind: "screen" });
  return list;
}

// The framing and camera height the image prompt asks for.
export function framingOf(prompt: string): { framing: Framing; angle: "low" | "eye" | "high" } {
  const p = prompt.toLowerCase();
  const framing: Framing = /extreme close|close[- ]?up|macro|detail shot|tight on/.test(p)
    ? "close"
    : /wide|establishing|full[- ]body|long shot|whole (store|room|shop)/.test(p)
      ? "wide"
      : "medium";
  const angle = /low[- ]angle|from below|worm'?s/.test(p) ? "low" : /high[- ]angle|overhead|top[- ]down|from above|bird'?s/.test(p) ? "high" : "eye";
  return { framing, angle };
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawSketch(ctx: CanvasRenderingContext2D, shot: TimedShot, setups: SketchSetup[]) {
  const { width: w, height: h } = ctx.canvas;
  const unit = Math.min(w, h);
  const rand = seeded(shot.index * 7919 + 17);
  const wob = (n: number) => (rand() - 0.5) * n * unit * 0.01;
  const { framing, angle } = framingOf(`${shot.visualPrompt} ${shot.action}`);

  // Paper.
  ctx.fillStyle = "#f3f1ea";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pencil = (width: number, shade = "#55534d") => {
    ctx.strokeStyle = shade;
    ctx.lineWidth = Math.max(1, unit * width);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1 + wob(1), y1 + wob(1));
    ctx.lineTo(x2 + wob(1), y2 + wob(1));
    ctx.stroke();
  };
  const hatch = (x: number, y: number, bw: number, bh: number, gap: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, bw, bh);
    ctx.clip();
    pencil(0.003, "#9a978e");
    for (let k = -bh; k < bw; k += gap) line(x + k, y + bh, x + k + bh, y);
    ctx.restore();
  };
  const label = (text: string, x: number, y: number) => {
    ctx.font = `600 ${Math.round(unit * 0.034)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#3d3b36";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text.length > 22 ? `${text.slice(0, 21)}…` : text, x, y);
  };

  // Horizon and floor: lower for a low camera, higher from above.
  const horizon = h * (angle === "low" ? 0.72 : angle === "high" ? 0.4 : 0.58);
  const place = setups.find((s) => s.kind === "place");
  pencil(0.004);
  line(0, horizon, w, horizon + wob(2));
  if (framing !== "close") {
    // A place: shelves or a counter behind, kept generic.
    const shelfX = w * (shot.index % 2 ? 0.62 : 0.06);
    const shelfW = w * 0.32;
    for (let k = 0; k < 4; k++) line(shelfX, horizon - h * (0.1 + k * 0.1), shelfX + shelfW, horizon - h * (0.1 + k * 0.1));
    line(shelfX, horizon, shelfX, horizon - h * 0.42);
    line(shelfX + shelfW, horizon, shelfX + shelfW, horizon - h * 0.42);
    hatch(0, horizon, w, h - horizon, unit * 0.05);
  }

  const people = setups.filter((s) => s.kind === "character" || s.kind === "other").slice(0, 3);
  const things = setups.filter((s) => s.kind === "product" || s.kind === "screen").slice(0, 2);
  const scale = framing === "close" ? 2.4 : framing === "medium" ? 1.45 : 0.75;
  const figureH = h * 0.42 * scale;
  const slots = people.length || (things.length ? 0 : 1);
  for (let k = 0; k < slots; k++) {
    const who = people[k];
    // One person stands off-centre, alternating sides from shot to shot; more share the frame.
    const cx = (slots === 1 ? w * (shot.index % 2 ? 0.36 : 0.62) : w * ((k + 1) / (slots + 1))) + wob(4);
    const feet = framing === "wide" ? horizon + h * 0.12 : h + figureH * (framing === "close" ? 0.55 : 0.18);
    const headR = figureH * 0.11;
    const headY = feet - figureH + headR;
    // Body.
    pencil(0.006);
    ctx.beginPath();
    ctx.moveTo(cx - headR * 1.7 + wob(1), headY + headR * 1.4);
    ctx.lineTo(cx + headR * 1.7 + wob(1), headY + headR * 1.4);
    ctx.lineTo(cx + headR * 1.4 + wob(1), feet - figureH * 0.42);
    ctx.lineTo(cx - headR * 1.4 + wob(1), feet - figureH * 0.42);
    ctx.closePath();
    ctx.stroke();
    hatch(cx - headR * 1.7, headY + headR * 1.4, headR * 3.4, figureH * 0.4, unit * 0.022);
    line(cx - headR * 0.8, feet - figureH * 0.42, cx - headR * 0.9, feet);
    line(cx + headR * 0.8, feet - figureH * 0.42, cx + headR * 0.9, feet);
    // Head: a plain oval, never a likeness.
    pencil(0.006);
    ctx.beginPath();
    ctx.ellipse(cx + wob(1), headY, headR, headR * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (who) label(who.name, cx, Math.min(h - unit * 0.06, Math.max(unit * 0.02, headY - headR * 1.15 - unit * 0.05)));
  }

  things.forEach((t, k) => {
    const bw = w * (framing === "close" ? 0.42 : 0.24);
    const cx = w * (people.length ? 0.78 - k * 0.2 : 0.5 - (things.length - 1) * 0.15 + k * 0.3);
    const top = horizon - bw * (t.kind === "screen" ? 1.6 : 0.9);
    pencil(0.007);
    if (t.kind === "screen") {
      // A phone with its screen lines: the real screenshot goes here, never drawn by AI.
      const bh = bw * 1.9;
      ctx.strokeRect(cx - bw / 2, top, bw, bh);
      pencil(0.003, "#8a877f");
      for (let r = 1; r < 6; r++) line(cx - bw * 0.35, top + (bh * r) / 6.5, cx + bw * (0.1 + (r % 3) * 0.08), top + (bh * r) / 6.5);
      label("Pantalla real", cx, top + bh + unit * 0.01);
    } else {
      const bh = bw * 0.8;
      ctx.strokeRect(cx - bw / 2, top, bw, bh);
      hatch(cx - bw / 2, top, bw, bh, unit * 0.03);
      label(t.name, cx, top + bh + unit * 0.01);
    }
  });

  // What kind of shot it is, in the corner the overlay leaves free.
  ctx.font = `700 ${Math.round(unit * 0.03)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillStyle = "#7a776f";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const tags = [`BOCETO · ${FRAMING_LABEL[framing]}`, place ? place.name : "", shot.kind === "transform" ? "Transformación →" : ""].filter(Boolean);
  tags.forEach((t, k) => ctx.fillText(t, unit * 0.04, h * 0.2 + k * unit * 0.045));
}
