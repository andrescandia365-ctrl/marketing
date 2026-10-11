// Extra reference images of one cast member: a part cut from its sheet (the face by default) or a loose view of the
// sheet made on its own. Each one is its own named reference in the image tool (Grok: @MartaCara), saved next to the
// member's approved image in biblioteca/<series>/. Pure helpers: the crop rectangle, the names and the cap.
import { castRef } from "./series.ts";

export type Rect = { x: number; y: number; w: number; h: number };

// Smallest crop side worth keeping as a reference, in image pixels.
export const MIN_CROP = 32;
// Longest side of a saved crop: larger crops are scaled down, smaller ones are kept as they are (upscaling adds nothing).
export const CROP_MAX_SIDE = 1024;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Keeps a rectangle inside the image and at least MIN_CROP on each side (or the whole image, if smaller), in whole pixels.
export function clampRect(r: Rect, width: number, height: number): Rect {
  const w = Math.round(clamp(Math.abs(r.w), Math.min(MIN_CROP, width), width));
  const h = Math.round(clamp(Math.abs(r.h), Math.min(MIN_CROP, height), height));
  const left = r.w < 0 ? r.x + r.w : r.x;
  const top = r.h < 0 ? r.y + r.h : r.y;
  return { x: Math.round(clamp(left, 0, width - w)), y: Math.round(clamp(top, 0, height - h)), w, h };
}

// The rectangle dragged from one corner to the other (in image pixels), whatever the direction.
export function rectFromDrag(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): Rect {
  const x0 = clamp(Math.min(a.x, b.x), 0, width);
  const y0 = clamp(Math.min(a.y, b.y), 0, height);
  const x1 = clamp(Math.max(a.x, b.x), 0, width);
  const y1 = clamp(Math.max(a.y, b.y), 0, height);
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, width, height);
}

// A point on the picture as shown (CSS pixels inside its box) in the image's own pixels.
export function toImagePoint(
  p: { x: number; y: number },
  shown: { w: number; h: number },
  natural: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: clamp((p.x / Math.max(1, shown.w)) * natural.w, 0, natural.w),
    y: clamp((p.y / Math.max(1, shown.h)) * natural.h, 0, natural.h),
  };
}

// Where the face usually is. A wide sheet (16:9: the app's sheets) keeps its close-ups in the bottom row, the front
// face first, at the left: a square in that first panel (7 panels for a person's row, 8 for the 3D look's faces and
// mouths). A tall or square picture (a single portrait or view) has the face in its upper middle. A starting point
// only: the person drags another one when the tool laid the sheet out differently.
export function defaultFaceRect(width: number, height: number, template: "girl" | "boy" | "puppet" | "place" | "" = ""): Rect {
  if (width / Math.max(1, height) >= 1.5) {
    const panels = template === "puppet" ? 8 : 7;
    const side = Math.min(width / panels, height / 2) * 0.9;
    const cx = width / panels / 2;
    const cy = height * 0.75;
    return clampRect({ x: cx - side / 2, y: cy - side / 2, w: side, h: side }, width, height);
  }
  const side = Math.min(width, height) * 0.45;
  return clampRect({ x: width / 2 - side / 2, y: height * 0.08, w: side, h: side }, width, height);
}

// The size the crop is saved at: the rectangle's own size, scaled down so its longest side is at most CROP_MAX_SIDE.
export function cropOutputSize(r: Rect, maxSide = CROP_MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(r.w, r.h, 1));
  return { w: Math.max(1, Math.round(r.w * scale)), h: Math.max(1, Math.round(r.h * scale)) };
}

// The reference name of an extra image: the member's own @ref plus the part ("Marta" + "cara" → "MartaCara"),
// at most 30 characters, never one the series already uses (any case): "MartaCara2", "MartaCara3"…
export function extraRefName(memberRef: string, label: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((r) => r.toLowerCase()));
  const base = `${memberRef}${castRef(label)}`.slice(0, 30);
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const name = `${base.slice(0, 30 - suffix.length)}${suffix}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

// Every reference name the series uses: each member's @ref and its extra ones.
export function seriesRefNames(cast: { ref: string; refs?: { ref: string }[] }[]): string[] {
  return cast.flatMap((m) => [m.ref, ...(m.refs ?? []).map((r) => r.ref)]);
}

// The library file of an extra reference: <castId>-ref-<ref>-<stamp>.<ext>, lowercase, within the library's
// 60-character name rule. A new stamp each time, so the browser never shows an old crop from its cache.
export function refFileName(castId: string, ref: string, stamp: string, ext: string): string {
  const part = ref.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "ref";
  const tail = stamp.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "0";
  return `${castId.slice(0, 24)}-ref-${part}-${tail}.${ext}`;
}

// How many reference images a member brings to the tool: its approved image and each extra one with a picture.
export function memberRefCount(m: { image: string; refs?: { image: string }[] }): number {
  return (m.image ? 1 : 0) + (m.refs ?? []).filter((r) => r.image).length;
}

// The tool's cap on reference images, read from its profile in server/tools/ ("Up to 14 reference images").
// null when the profile names none.
export function referenceCap(profile: string): number | null {
  const n = profile.match(/up to (\d{1,3}) reference images/i)?.[1];
  return n ? Number(n) : null;
}

// The @ references a shot can call for the members in its frame: each member's approved image and every extra one
// with a picture, in frame order, without repeats.
export function shotReferences(members: { ref: string; image: string; refs?: { ref: string; image: string }[] }[]): string[] {
  const out: string[] = [];
  for (const m of members) {
    if (m.image) out.push(m.ref);
    for (const r of m.refs ?? []) if (r.image) out.push(r.ref);
  }
  return [...new Set(out)];
}

// The strictest cap among the tools' profiles that name one, or null (the client's copy of server/tools.ts').
export function toolsRefCap(tools: { maxRefs?: number | null }[]): number | null {
  const caps = tools.map((t) => t.maxRefs).filter((n): n is number => typeof n === "number" && n > 0);
  return caps.length ? Math.min(...caps) : null;
}
