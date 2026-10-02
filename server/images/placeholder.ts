// Works with no API key: a flat card in the beat's colour with the shot description, so the
// whole pipeline (storyboard → video) can be tried before any image generator is connected.
import type { Beat } from "../../shared/schema.ts";
import { BEAT_INFO } from "../../shared/template.ts";
import type { ImageProvider } from "./util.ts";

const COLORS: Record<string, [string, string]> = {
  negative: ["#3a1a12", "#b52f12"],
  touching: ["#1f1a3d", "#5b49c9"],
  good: ["#0d2b23", "#0f6e56"],
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 9);
}

export const placeholder: ImageProvider = {
  id: "placeholder",
  label: "Bocetos (sin clave)",
  hint: "Siempre disponible. Muestra la descripción de la toma en lugar de una imagen.",
  available: () => true,
  async generate({ prompt, aspect, beat }) {
    const [w, h] = aspect === "vertical" ? [1080, 1920] : [1920, 1080];
    const [dark, light] = COLORS[beat] ?? COLORS.negative;
    const lines = wrap(prompt, aspect === "vertical" ? 30 : 48);
    const top = h * 0.3;
    const text = lines
      .map((l, i) => `<text x="${w / 2}" y="${top + i * 64}" text-anchor="middle">${escape(l)}</text>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="${w / 2}" y="${top - 110}" text-anchor="middle" font-family="sans-serif" font-size="34" letter-spacing="6" fill="#ffffff" fill-opacity="0.6">BOCETO · ${escape((BEAT_INFO[beat as Beat]?.label ?? beat).toUpperCase())}</text>
<g font-family="sans-serif" font-size="46" fill="#ffffff" fill-opacity="0.92">${text}</g>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  },
};
