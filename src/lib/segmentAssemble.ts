// Grok's "Segmentos → Descargar todo" is one folder per thing it found (the person, the jacket, the hair),
// and every file inside is a tight crop of one view of the reference sheet. The crops do not share a canvas
// and do not say where they sat, so stacking them stretches each one over the others. A full figure
// (tall, one body) can be split at the neck into a head and a body that DO share a canvas.

export type FigureFile = { name: string; file: File; img: HTMLImageElement; url: string };

// The sheet's grey backdrop, not a piece of the character.
export function isSheetBackground(name: string): boolean {
  return /background|fondo/i.test(name.split(/[/\\]/).pop() ?? name);
}

// A standing figure: much taller than it is wide. Face close-ups and clothing crops are not.
export function isFullFigure(width: number, height: number): boolean {
  return height >= 400 && height / Math.max(width, 1) >= 2.3;
}

// Grok numbers the sheet left to right, so "-1" is the front full body when several qualify.
export function figureOrder(name: string): number {
  const base = name.split(/[/\\]/).pop() ?? name;
  const n = base.match(/-(\d+)\.[a-z0-9]+$/i);
  return n ? Number(n[1]) : 1000;
}

// The row where the shoulders open, as a fraction of the picture. `widths[y]` is the opaque span of that row.
export function neckRow(widths: number[]): number {
  const h = widths.length;
  let y0 = 0;
  while (y0 < h && widths[y0] === 0) y0++;
  let y1 = h - 1;
  while (y1 > y0 && widths[y1] === 0) y1--;
  const span = Math.max(1, y1 - y0);
  const from = Math.round(y0 + span * 0.12);
  const to = Math.round(y0 + span * 0.4);
  const window = Math.max(6, Math.round(span * 0.025));
  let bestY = Math.round(y0 + span * 0.2);
  let bestJump = 0;
  let maxW = 0;
  for (let y = y0; y <= y1; y++) if (widths[y] > maxW) maxW = widths[y];
  for (let y = from; y <= to - window; y++) {
    const jump = widths[y + window] - widths[y];
    if (jump > bestJump) {
      bestJump = jump;
      bestY = y;
    }
  }
  if (bestJump < maxW * 0.2) return Math.round(y0 + span * 0.22);
  return bestY;
}

function loadUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Full figures in a Grok export, front first. Crops and the grey background are counted and dropped.
export async function findFullFigures(files: File[]): Promise<{ figures: FigureFile[]; crops: number; backgrounds: number }> {
  const images = files.filter((f) => /\.(png|webp)$/i.test(f.name) || /image\/(png|webp)/.test(f.type));
  const backgrounds = images.filter((f) => isSheetBackground(f.name)).length;
  const rest = images.filter((f) => !isSheetBackground(f.name));
  const figures: FigureFile[] = [];
  let crops = 0;
  for (const file of rest) {
    const url = URL.createObjectURL(file);
    const img = await loadUrl(url);
    if (!img) {
      URL.revokeObjectURL(url);
      continue;
    }
    if (isFullFigure(img.naturalWidth, img.naturalHeight)) figures.push({ name: file.name, file, img, url });
    else {
      crops++;
      URL.revokeObjectURL(url);
    }
  }
  figures.sort((a, b) => figureOrder(a.name) - figureOrder(b.name) || a.name.localeCompare(b.name));
  return { figures, crops, backgrounds };
}

export function revokeFigures(figures: FigureFile[]) {
  for (const f of figures) URL.revokeObjectURL(f.url);
}

// Head and body on the SAME canvas, so the puppet lines them up. The neck fades from one into the other.
export function splitFigure(img: CanvasImageSource, width: number, height: number): { body: HTMLCanvasElement; head: HTMLCanvasElement } {
  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  const read = src.getContext("2d", { willReadFrequently: true });
  if (!read) throw new Error("El navegador no pudo leer la imagen.");
  read.drawImage(img, 0, 0, width, height);
  const image = read.getImageData(0, 0, width, height);
  const data = image.data;
  const widths = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let x0 = width;
    let x1 = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 30) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
    widths[y] = x1 >= 0 ? x1 - x0 + 1 : 0;
  }
  const neck = neckRow(widths);
  const overlap = Math.max(8, Math.round(height * 0.018));
  const bodyPx = new ImageData(width, height);
  const headPx = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    let bodyA = 1;
    let headA = 1;
    if (y < neck - overlap) bodyA = 0;
    else if (y <= neck + overlap) bodyA = (y - (neck - overlap)) / (2 * overlap);
    if (y > neck + overlap) headA = 0;
    else if (y >= neck - overlap) headA = 1 - (y - (neck - overlap)) / (2 * overlap);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      bodyPx.data[i] = data[i];
      bodyPx.data[i + 1] = data[i + 1];
      bodyPx.data[i + 2] = data[i + 2];
      bodyPx.data[i + 3] = Math.round(a * bodyA);
      headPx.data[i] = data[i];
      headPx.data[i + 1] = data[i + 1];
      headPx.data[i + 2] = data[i + 2];
      headPx.data[i + 3] = Math.round(a * headA);
    }
  }
  const paint = (pixels: ImageData) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo armar la capa.");
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  };
  return { body: paint(bodyPx), head: paint(headPx) };
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo armar la capa."))), "image/png");
  });
}
