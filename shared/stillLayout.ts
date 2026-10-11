// "Imagen fija" (IDEAS 34, PLAYBOOK §3.2): the picture comes from the image tool with NO text and clear space where the
// words go; the app sets the words on top with the series brand's fonts and colours. This file is the pure part of
// that: the export formats and their full-resolution size, where the picture sits in each format without ever cropping
// or covering the tool's watermark, where the words go (inside the 9:16 safe zone, out of the watermark's keep-out
// area), which brand colour reads on the picture under them (WCAG 4.5:1, a solid box only when neither does), and the
// text variants (one picture × several headlines, calls and placements → many exports).
import { CONTRAST_TEXT, contrastRatio } from "./series.ts";
import { safeRect, type Rect } from "./safeZone.ts";

// ── Formats ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const STILL_FORMATS = ["9x16", "4x5", "1x1"] as const;
export type StillFormat = (typeof STILL_FORMATS)[number];
export const STILL_FORMAT_INFO: Record<StillFormat, { w: number; h: number; label: string }> = {
  "9x16": { w: 9, h: 16, label: "9:16 (Reels, TikTok, Historias)" },
  "4x5": { w: 4, h: 5, label: "4:5 (feed de Instagram y Facebook)" },
  "1x1": { w: 1, h: 1, label: "1:1 (cuadrada)" },
};
// Never smaller than this wide (the platforms' own width), never larger than this on any side.
export const MIN_EXPORT_WIDTH = 1080;
export const MAX_EXPORT_SIDE = 4096;

// How the picture sits in a format whose shape is not its own. "full": the whole picture, never cut, on the brand's
// background (the default, like "Cuadro completo" for Grok's videos). "crop": filled edge to edge, cut only on the
// sides away from the watermark, so the watermark is never cut.
export type StillFit = "full" | "crop";

// The export's size in pixels: the picture keeps its own resolution (never scaled down), at least MIN_EXPORT_WIDTH wide.
export function exportSize(format: StillFormat, picW: number, picH: number, fit: StillFit = "full"): { w: number; h: number } {
  const { w: fw, h: fh } = STILL_FORMAT_INFO[format];
  const ratio = fw / fh;
  const pw = Math.max(1, picW);
  const ph = Math.max(1, picH);
  // full: the canvas holds the whole picture at 1:1; crop: the picture covers the canvas at 1:1.
  let w = fit === "full" ? Math.max(pw, ph * ratio) : Math.min(pw, ph * ratio);
  w = Math.max(MIN_EXPORT_WIDTH, w);
  let h = w / ratio;
  const over = Math.max(w, h) / MAX_EXPORT_SIDE;
  if (over > 1) {
    w /= over;
    h /= over;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

// ── The watermark's keep-out area ───────────────────────────────────────────────────────────────────────────────────
export const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type Corner = (typeof CORNERS)[number];
export const CORNER_LABEL: Record<Corner, string> = {
  "bottom-right": "abajo a la derecha",
  "bottom-left": "abajo a la izquierda",
  "top-right": "arriba a la derecha",
  "top-left": "arriba a la izquierda",
};
// The share of the PICTURE (not of the export) the mark takes, from its corner; "none" when the picture has no mark.
export type KeepOut = { corner: Corner | "none"; w: number; h: number };
export const NO_KEEP_OUT: KeepOut = { corner: "none", w: 0, h: 0 };

// The tool profile's line, e.g. "- [NOT SURE] Watermark keep-out: bottom-right, 20% of the width, 6% of the height."
// null when the profile names none.
export function watermarkKeepOut(profile: string): KeepOut | null {
  const m = profile.match(/Watermark keep-out:\s*(bottom|top)[- ](right|left),\s*(\d+(?:\.\d+)?)\s*%\s*of the width,\s*(\d+(?:\.\d+)?)\s*%\s*of the height/i);
  if (!m) return null;
  const w = Number(m[3]) / 100;
  const h = Number(m[4]) / 100;
  if (!(w > 0 && w <= 0.6 && h > 0 && h <= 0.6)) return null;
  return { corner: `${m[1].toLowerCase()}-${m[2].toLowerCase()}` as Corner, w, h };
}

// The keep-out as a rectangle of a picture drawn at (x, y, w, h).
export function keepOutRect(k: KeepOut, pic: Rect): Rect | null {
  if (k.corner === "none" || k.w <= 0 || k.h <= 0) return null;
  const w = pic.w * k.w;
  const h = pic.h * k.h;
  return {
    x: k.corner.endsWith("right") ? pic.x + pic.w - w : pic.x,
    y: k.corner.startsWith("bottom") ? pic.y + pic.h - h : pic.y,
    w,
    h,
  };
}

const inside = (a: Rect, b: Rect, slack = 0.5) =>
  a.x >= b.x - slack && a.y >= b.y - slack && a.x + a.w <= b.x + b.w + slack && a.y + a.h <= b.y + b.h + slack;
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Where the picture goes on a w×h canvas. "crop" is anchored on the watermark's corner, so whatever is cut is on the
// far side; with no mark it is centred. keepOut is the mark's area on the canvas, and whole says it is all on it.
export function fitPicture(w: number, h: number, picW: number, picH: number, fit: StillFit, k: KeepOut): { pic: Rect; keepOut: Rect | null; whole: boolean } {
  const scale = fit === "full" ? Math.min(w / picW, h / picH) : Math.max(w / picW, h / picH);
  const dw = picW * scale;
  const dh = picH * scale;
  let x = (w - dw) / 2;
  let y = (h - dh) / 2;
  if (fit === "crop" && k.corner !== "none") {
    x = k.corner.endsWith("right") ? w - dw : 0;
    y = k.corner.startsWith("bottom") ? h - dh : 0;
  }
  const pic = { x, y, w: dw, h: dh };
  const keepOut = keepOutRect(k, pic);
  return { pic, keepOut, whole: !keepOut || inside(keepOut, { x: 0, y: 0, w, h }) };
}

// ── Where the words go ──────────────────────────────────────────────────────────────────────────────────────────────
export const PLACEMENTS = ["top", "middle", "bottom"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABEL: Record<Placement, string> = { top: "Arriba", middle: "En el medio", bottom: "Abajo" };
// Left by default: centred text is the stock default the studios avoid.
export const ALIGNS = ["left", "right", "center"] as const;
export type Align = (typeof ALIGNS)[number];
export const ALIGN_LABEL: Record<Align, string> = { left: "A la izquierda", right: "A la derecha", center: "Centrado" };

export type OverlayCopy = { headline: string; sub: string; cta: string; placement: Placement; align: Align };
export type FontSpec = { family: string; weight: number; size: number };
// The width of a line of text in a font (the canvas's measureText in the browser).
export type Measure = (text: string, font: FontSpec) => number;

export type TextBox = {
  kind: "headline" | "sub" | "cta";
  lines: string[];
  font: FontSpec;
  lineHeight: number;
  // The box of the lines as set (x is the block's left edge; each line is aligned inside w).
  x: number;
  y: number;
  w: number;
  h: number;
};
export type OverlayLayout = {
  boxes: TextBox[];
  // Everything the words take, with the box padding around it (where a solid box would go).
  block: Rect;
  fits: boolean;
  problems: string[];
};

// Sizes as shares of the canvas's short side.
export const HEADLINE_MAX = 0.09;
export const HEADLINE_MIN = 0.045;
export const SMALL_MIN = 0.03;
const HEADLINE_LINES = 4;
const SUB_LINES = 3;
// The padding around the words, as a share of the headline's size (it is also the solid box's padding).
export const BOX_PAD = 0.4;

// Greedy word wrap. null when one word alone is wider than the line.
export function wrapText(text: string, width: number, font: FontSpec, measure: Measure): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (measure(word, font) > width) return null;
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next, font) <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The room the words have on a w×h canvas: the platform's safe zone (9:16 only), a margin, and never the band the
// watermark's keep-out sits in (the words run the full width, so the whole band is left free).
export function textArea(w: number, h: number, keepOut: Rect | null): Rect {
  const short = Math.min(w, h);
  const m = short * 0.06;
  const s = safeRect(w, h);
  let top = s.y + m;
  let bottom = s.y + s.h - m;
  if (keepOut) {
    const gap = m * 0.5;
    if (keepOut.y + keepOut.h / 2 > h / 2) bottom = Math.min(bottom, keepOut.y - gap);
    else top = Math.max(top, keepOut.y + keepOut.h + gap);
  }
  return { x: s.x + m, y: top, w: Math.max(0, s.w - 2 * m), h: Math.max(0, bottom - top) };
}

// Sets headline, sub-line and call to action: the biggest headline that fits its share of the room (at most 4
// lines), the others scaled from it, the block placed at the top, middle or bottom of the room. Words that cannot fit
// at the smallest readable size do not fit, and the export is blocked until they are shortened.
export function layoutOverlay(o: {
  w: number;
  h: number;
  copy: OverlayCopy;
  fonts: { display: string; ui: string };
  keepOut: Rect | null;
  measure: Measure;
}): OverlayLayout {
  const { w, h, copy, measure } = o;
  const short = Math.min(w, h);
  const area = textArea(w, h, o.keepOut);
  const share = copy.placement === "middle" ? 0.6 : 0.45;
  const maxH = area.h * share;
  const colW = copy.align === "center" ? area.w : area.w * 0.88;
  const headline = copy.headline.trim();
  const sub = copy.sub.trim();
  const cta = copy.cta.trim();
  const problems: string[] = [];
  if (!headline) problems.push("Falta el título.");

  const tryAt = (size: number): { boxes: Omit<TextBox, "x" | "y">[]; height: number; width: number } | null => {
    const out: Omit<TextBox, "x" | "y">[] = [];
    const parts: { kind: TextBox["kind"]; text: string; font: FontSpec; max: number; lh: number; gap: number }[] = [];
    if (headline) parts.push({ kind: "headline", text: headline, font: { family: o.fonts.display, weight: 700, size }, max: HEADLINE_LINES, lh: 1.1, gap: 0 });
    const small = Math.max(size * 0.5, short * SMALL_MIN);
    if (sub) parts.push({ kind: "sub", text: sub, font: { family: o.fonts.ui, weight: 400, size: small }, max: SUB_LINES, lh: 1.3, gap: size * 0.35 });
    if (cta) parts.push({ kind: "cta", text: cta, font: { family: o.fonts.ui, weight: 600, size: Math.max(size * 0.42, short * SMALL_MIN) }, max: 1, lh: 1.3, gap: size * 0.6 });
    let height = 0;
    let width = 0;
    for (const p of parts) {
      const lines = wrapText(p.text, colW, p.font, measure);
      if (!lines || lines.length > p.max) return null;
      const lineHeight = p.font.size * p.lh;
      const bw = Math.max(...lines.map((l) => measure(l, p.font)));
      height += (out.length ? p.gap : 0) + lines.length * lineHeight;
      width = Math.max(width, bw);
      out.push({ kind: p.kind, lines, font: p.font, lineHeight, w: bw, h: lines.length * lineHeight });
    }
    return height <= maxH ? { boxes: out, height, width } : null;
  };

  let size = short * HEADLINE_MAX;
  let set = tryAt(size);
  while (!set && size > short * HEADLINE_MIN) {
    size = Math.max(short * HEADLINE_MIN, size * 0.94);
    set = tryAt(size);
    if (size === short * HEADLINE_MIN) break;
  }
  if (!set) {
    problems.push(
      area.h < short * 0.2
        ? "No queda lugar para el texto fuera de la marca de agua y de la zona que tapa la plataforma."
        : "El texto no entra en letra legible: acortá el título, la bajada o el llamado.",
    );
    return { boxes: [], block: { x: area.x, y: area.y, w: 0, h: 0 }, fits: false, problems };
  }
  const x0 = copy.align === "left" ? area.x : copy.align === "right" ? area.x + area.w - set.width : area.x + (area.w - set.width) / 2;
  const y0 = copy.placement === "top" ? area.y : copy.placement === "bottom" ? area.y + area.h - set.height : area.y + (area.h - set.height) / 2;
  let y = y0;
  const gaps: Record<TextBox["kind"], number> = { headline: 0, sub: size * 0.35, cta: size * 0.6 };
  const boxes: TextBox[] = set.boxes.map((b, i) => {
    if (i > 0) y += gaps[b.kind];
    const box = { ...b, x: x0, y, w: set!.width };
    y += b.h;
    return box;
  });
  const pad = size * BOX_PAD;
  const block = { x: x0 - pad, y: y0 - pad, w: set.width + 2 * pad, h: set.height + 2 * pad };
  if (o.keepOut && boxes.some((b) => intersects(b, o.keepOut!))) problems.push("El texto pisa la marca de agua.");
  return { boxes, block, fits: problems.length === 0, problems };
}

// ── Which colour reads ──────────────────────────────────────────────────────────────────────────────────────────────
export type TextStyleChoice = {
  colour: string;
  // A solid box behind the words, only when neither brand colour reads on the picture. No gradient, no glow.
  box: string | null;
  // The contrast the words get: against the box, or the low end of what is under them.
  ratio: number;
};

// The contrast a colour gets on the picture under the words: its 10th-percentile contrast against the sampled pixels,
// so a few bright spots do not decide it but a tenth of the area that does not read does.
export function lowContrast(colour: string, samples: string[]): number {
  if (!samples.length) return 1;
  const all = samples.map((s) => contrastRatio(colour, s)).sort((a, b) => a - b);
  return all[Math.floor(all.length * 0.1)];
}

// The brand's text colour, else its background colour, when one reads at 4.5:1 on what is under the words; otherwise a
// solid box in the brand's background with its text colour (or black and white when the brand's pair does not read).
export function pickTextStyle(samples: string[], brand: { text: string; bg: string }): TextStyleChoice {
  const options = [brand.text, brand.bg].map((colour) => ({ colour, ratio: lowContrast(colour, samples) }));
  const best = options.sort((a, b) => b.ratio - a.ratio)[0];
  if (best.ratio >= CONTRAST_TEXT) return { colour: best.colour, box: null, ratio: best.ratio };
  const pair = contrastRatio(brand.text, brand.bg);
  if (pair >= CONTRAST_TEXT) return { colour: brand.text, box: brand.bg, ratio: pair };
  return { colour: "#ffffff", box: "#111111", ratio: contrastRatio("#ffffff", "#111111") };
}

// ── Variants ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MAX_VARIANTS = 48;
export type StillVariant = OverlayCopy & { n: number };

// "título | bajada" per line.
export function headlineLines(text: string): { headline: string; sub: string }[] {
  const out: { headline: string; sub: string }[] = [];
  for (const raw of text.split("\n")) {
    const [headline = "", ...rest] = raw.split("|");
    const h = headline.replace(/\s+/g, " ").trim();
    if (!h) continue;
    const sub = rest.join(" ").replace(/\s+/g, " ").trim();
    if (!out.some((x) => x.headline === h && x.sub === sub)) out.push({ headline: h, sub });
  }
  return out;
}
export const ctaLines = (text: string): string[] => [...new Set(text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean))];

// Every headline × call × placement, numbered from 1, at most MAX_VARIANTS. No call: the variants go without one.
export function variantGrid(headlines: { headline: string; sub: string }[], ctas: string[], placements: Placement[], align: Align): StillVariant[] {
  const out: StillVariant[] = [];
  const calls = ctas.length ? ctas : [""];
  const places = placements.length ? [...new Set(placements)] : (["bottom"] as Placement[]);
  for (const h of headlines)
    for (const cta of calls)
      for (const placement of places) {
        if (out.length === MAX_VARIANTS) return out;
        out.push({ n: out.length + 1, headline: h.headline, sub: h.sub, cta, placement, align });
      }
  return out;
}
// How many the grid would make before the cap (to say how many were left out).
export const gridCount = (headlines: number, ctas: number, placements: number) => headlines * Math.max(1, ctas) * Math.max(1, placements);

export type ExportJob = { variant: StillVariant; format: StillFormat; file: string };
export const STILL_EXPORT = /^fija-(\d{2})-(9x16|4x5|1x1)\.(png|jpg)$/;
export const exportFile = (n: number, format: StillFormat, type: "png" | "jpg") => `fija-${String(n).padStart(2, "0")}-${format}.${type}`;

// One file per variant and format.
export function exportJobs(variants: StillVariant[], formats: StillFormat[], type: "png" | "jpg"): ExportJob[] {
  const fs = STILL_FORMATS.filter((f) => formats.includes(f));
  return variants.flatMap((variant) => fs.map((format) => ({ variant, format, file: exportFile(variant.n, format, type) })));
}
