// Where Reels, TikTok and Shorts draw their own interface over a 9:16 video: the top bar, the caption, handle and
// sound line at the bottom, and the button column on the right. The app keeps its own text (subtitles, the AI
// notice, the CONCEPTO / SIMULACIÓN label, credits) inside the rest, and measures what the templates put there.
// [NOT SURE] Approximate shares of the frame, the middle of what seven open-source video skills use (IDEAS.md idea 62:
// top 10-19 %, bottom 17-26 %, right 11-13 %, left 5-8 %). The platforms move their interface: check against the apps.
export const PHONE_SAFE = { top: 0.1, bottom: 0.2, left: 0.05, right: 0.12 } as const;
// The button column sits on the lower part of the right edge, from about here down.
export const BUTTONS_FROM = 0.4;

export type Rect = { x: number; y: number; w: number; h: number };
export type SafeBand = "top" | "bottom" | "left" | "right";
export const SAFE_BAND_LABEL: Record<SafeBand, string> = {
  top: "arriba (barra de la app)",
  bottom: "abajo (texto y nombre de la cuenta)",
  left: "borde izquierdo",
  right: "columna de botones",
};

// A 9:16 frame (taller than 3:2): the only one the platforms cover. Feeds in 1:1, 4:5 and 16:9 keep their full frame.
export const isPhoneFrame = (w: number, h: number) => h > w * 1.5;

// The part of a w×h frame the platform leaves alone (its right edge is the button column's, the strictest); the
// whole frame when it is not a phone frame.
export function safeRect(w: number, h: number): Rect {
  if (!isPhoneFrame(w, h)) return { x: 0, y: 0, w, h };
  const x = w * PHONE_SAFE.left;
  const y = h * PHONE_SAFE.top;
  return { x, y, w: w * (1 - PHONE_SAFE.left - PHONE_SAFE.right), h: h * (1 - PHONE_SAFE.top - PHONE_SAFE.bottom) };
}

// The bands a box reaches into (empty when it is inside, or when the frame is not a phone frame). A box must reach
// in by more than `slack` (in pixels) to count, so an antialiased edge is not a problem.
export function safeBands(box: Rect, w: number, h: number, slack = 2): SafeBand[] {
  if (!isPhoneFrame(w, h) || box.w <= 0 || box.h <= 0) return [];
  const s = safeRect(w, h);
  const bands: SafeBand[] = [];
  if (box.y < s.y - slack) bands.push("top");
  if (box.y + box.h > s.y + s.h + slack) bands.push("bottom");
  if (box.x < s.x - slack) bands.push("left");
  if (box.x + box.w > s.x + s.w + slack && box.y + box.h > h * BUTTONS_FROM) bands.push("right");
  return bands;
}

// How much of the smaller box two boxes share (0 to 1).
export function overlapShare(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? (x * y) / smaller : 0;
}

// Shared by more than this, two lines of text are on top of each other (boxes just touching are not).
export const OVERLAP = 0.12;
