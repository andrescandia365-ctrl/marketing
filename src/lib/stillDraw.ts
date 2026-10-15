// "Imagen fija": draws one export on a canvas: the brand's background, the picture (whole, or cropped away from the
// watermark), then the words with the brand's fonts in the colour that reads on what is under them (a solid box only
// when neither brand colour does). The layout and the colour choice are pure (shared/stillLayout.ts); this file only
// measures, samples pixels and paints.
import { contrastRatio, type Brand } from "../../shared/series.ts";
import {
  exportSize,
  fitPicture,
  layoutOverlay,
  pickTextStyle,
  type FontSpec,
  type KeepOut,
  type Measure,
  type OverlayCopy,
  type OverlayLayout,
  type StillFit,
  type StillFormat,
  type TextStyleChoice,
} from "../../shared/stillLayout.ts";

const fontCss = (f: FontSpec) => `${f.weight} ${f.size}px "${f.family}", system-ui, sans-serif`;

export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, font) => {
    ctx.font = fontCss(font);
    return ctx.measureText(text).width;
  };
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

// Up to ~400 pixels of the area, read from what is painted now (the picture, before the words).
function sample(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number): string[] {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const sx = Math.max(0, Math.floor(x * scale));
  const sy = Math.max(0, Math.floor(y * scale));
  const sw = Math.max(1, Math.min(W - sx, Math.ceil(w * scale)));
  const sh = Math.max(1, Math.min(H - sy, Math.ceil(h * scale)));
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  const step = Math.max(1, Math.floor(Math.sqrt((sw * sh) / 400)));
  const out: string[] = [];
  for (let j = 0; j < sh; j += step) for (let i = 0; i < sw; i += step) {
    const k = (j * sw + i) * 4;
    out.push(hex(data[k], data[k + 1], data[k + 2]));
  }
  return out;
}

export type StillDrawReport = {
  w: number;
  h: number;
  layout: OverlayLayout;
  style: TextStyleChoice | null;
  watermarkWhole: boolean;
};

// Draws the export at its full size times `scale` (1 for the file, smaller for previews) and reports what it set.
export function drawStill(
  canvas: HTMLCanvasElement,
  o: {
    format: StillFormat;
    picture: HTMLImageElement | null;
    pictureSize: { w: number; h: number };
    fit: StillFit;
    keepOut: KeepOut;
    copy: OverlayCopy;
    brand: Brand;
    scale?: number;
    // Shows the watermark's keep-out (previews only, never in a file).
    showKeepOut?: boolean;
  },
): StillDrawReport {
  const { w, h } = exportSize(o.format, o.pictureSize.w, o.pictureSize.h, o.fit);
  const scale = o.scale ?? 1;
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = o.brand.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const placed = fitPicture(w, h, o.pictureSize.w, o.pictureSize.h, o.fit, o.keepOut);
  if (o.picture) ctx.drawImage(o.picture, placed.pic.x, placed.pic.y, placed.pic.w, placed.pic.h);
  const layout = layoutOverlay({
    w,
    h,
    copy: o.copy,
    fonts: { display: o.brand.displayFont, ui: o.brand.uiFont },
    keepOut: placed.keepOut,
    measure: canvasMeasure(ctx),
  });
  let style: TextStyleChoice | null = null;
  if (layout.boxes.length) {
    const b = layout.block;
    style = pickTextStyle(sample(ctx, b.x, b.y, b.w, b.h, scale), o.brand);
    if (style.box) {
      ctx.fillStyle = style.box;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.textBaseline = "alphabetic";
    for (const box of layout.boxes) {
      ctx.font = fontCss(box.font);
      ctx.fillStyle = style.colour;
      box.lines.forEach((line, i) => {
        const lw = ctx.measureText(line).width;
        const x = o.copy.align === "left" ? box.x : o.copy.align === "right" ? box.x + box.w - lw : box.x + (box.w - lw) / 2;
        // The baseline sits at ~80 % of the line box.
        const y = box.y + i * box.lineHeight + box.lineHeight * 0.5 + box.font.size * 0.35;
        ctx.fillText(line, x, y);
        // The call to action gets one underline in the accent when the accent reads (3:1) on what is behind it.
        if (box.kind === "cta") {
          const behind = style!.box ?? null;
          const accentOk = behind ? contrastRatio(o.brand.accent, behind) >= 3 : false;
          ctx.fillStyle = accentOk ? o.brand.accent : style!.colour;
          ctx.fillRect(x, y + box.font.size * 0.18, lw, Math.max(2, box.font.size * 0.08));
          ctx.fillStyle = style!.colour;
        }
      });
    }
  }
  if (o.showKeepOut && placed.keepOut) {
    const k = placed.keepOut;
    ctx.strokeStyle = "#ff3b30";
    ctx.lineWidth = Math.max(2, 3 / scale);
    ctx.setLineDash([12 / scale, 8 / scale]);
    ctx.strokeRect(k.x, k.y, k.w, k.h);
    ctx.setLineDash([]);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { w, h, layout, style, watermarkWhole: placed.whole };
}

// The layout alone (no pixels), to check every variant and format before exporting.
export function layoutOnly(
  ctx: CanvasRenderingContext2D,
  o: { format: StillFormat; pictureSize: { w: number; h: number }; fit: StillFit; keepOut: KeepOut; copy: OverlayCopy; brand: Brand },
): { layout: OverlayLayout; watermarkWhole: boolean } {
  const { w, h } = exportSize(o.format, o.pictureSize.w, o.pictureSize.h, o.fit);
  const placed = fitPicture(w, h, o.pictureSize.w, o.pictureSize.h, o.fit, o.keepOut);
  const layout = layoutOverlay({ w, h, copy: o.copy, fonts: { display: o.brand.displayFont, ui: o.brand.uiFont }, keepOut: placed.keepOut, measure: canvasMeasure(ctx) });
  return { layout, watermarkWhole: placed.whole };
}

// Everything a preview of a still draws, as one key: it is drawn again when any of it changes, the brand fonts
// arriving included (until then the words are measured and painted in the fallback face).
export const previewKey = (parts: {
  format: StillFormat;
  fit: StillFit;
  keepOut: KeepOut;
  copies: OverlayCopy[];
  selected: number;
  pictureSize: { w: number; h: number };
  brand: Brand;
  open: boolean;
  fontsReady: boolean;
}): string => JSON.stringify([parts.format, parts.fit, parts.keepOut, parts.copies, parts.selected, parts.pictureSize, parts.brand, parts.open, parts.fontsReady]);

export function canvasBlob(canvas: HTMLCanvasElement, type: "png" | "jpg"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo armar la imagen."))), type === "png" ? "image/png" : "image/jpeg", 0.92),
  );
}

