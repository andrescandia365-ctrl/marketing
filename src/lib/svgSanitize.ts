// Turns a pasted SVG into a PNG the lyric canvas can draw. Scripts and embedded HTML never reach the picture.

const ALLOWED = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "use",
  "title",
  "desc",
]);

function safeUrl(value: string): boolean {
  const v = value.trim();
  return v.startsWith("#") || v.startsWith("url(#");
}

export function sanitizeSvg(source: string): string {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("Ese SVG no se pudo leer.");
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") throw new Error("Ese archivo no es un SVG.");
  const clean = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase().replace(/^.*:/, "");
      if (!ALLOWED.has(tag)) {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith("on") || name === "style") {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === "href" || name.endsWith(":href")) {
          if (!safeUrl(value)) child.removeAttribute(attr.name);
        }
      }
      clean(child);
    }
  };
  for (const attr of [...svg.attributes]) {
    if (attr.name.toLowerCase().startsWith("on")) svg.removeAttribute(attr.name);
  }
  clean(svg);
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!svg.getAttribute("width")) {
    const box = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? [];
    const w = box[2];
    const h = box[3];
    svg.setAttribute("width", String(w > 0 ? w : 512));
    svg.setAttribute("height", String(h > 0 ? h : 512));
  }
  return new XMLSerializer().serializeToString(svg);
}

export async function rasterSvg(source: string): Promise<Blob> {
  const clean = sanitizeSvg(source);
  const url = URL.createObjectURL(new Blob([clean], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 512;
    const nh = img.naturalHeight || 512;
    const scale = Math.min(1, 800 / Math.max(nw, nh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(nw * scale));
    canvas.height = Math.max(1, Math.round(nh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar el SVG.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo guardar el SVG.");
    return blob;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No se pudo")) throw e;
    throw new Error("Ese SVG no se pudo dibujar.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
