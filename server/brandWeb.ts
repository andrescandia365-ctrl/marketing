// "Traer la marca desde su web": reads the brand's own page and gathers what the brand kit needs (colours, fonts, a
// logo, the name, what the page says). Nothing here is applied: the app shows it and the person picks. What the page
// claims goes back as [VERIFY] until the person confirms it into "Lo que existe hoy".
// Only public web addresses: never this computer, the local network or a cloud metadata address, also after a redirect.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BrandWebError extends Error {}

export type SiteFacts = {
  url: string;
  title: string;
  siteName: string;
  description: string;
  themeColor: string;
  // Colours the page and its styles use, most used first (#rrggbb).
  colors: { hex: string; count: number }[];
  // Font families the styles name, most used first, and the Google Fonts families it loads.
  fonts: { family: string; count: number }[];
  googleFonts: string[];
  // Logo candidates, likeliest first.
  logos: { url: string; kind: "logo" | "icon" | "og" }[];
  // Headings and the first paragraphs, as plain text.
  text: string;
};

const MAX_PAGE = 2_000_000;
const MAX_CSS = 600_000;
const MAX_IMAGE = 3_000_000;
const TIMEOUT = 10_000;

// Loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges, IPv4 and IPv6.
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return privateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BrandWebError("Esa dirección no es válida. Pegala entera, con https://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BrandWebError("Solo direcciones web (https://).");
  if (url.username || url.password) throw new BrandWebError("La dirección no puede llevar usuario ni contraseña.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new BrandWebError("Esa dirección es de esta compu o de la red local.");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new BrandWebError(`No encontré ${host}. Revisá la dirección.`);
  if (addresses.some(privateAddress)) throw new BrandWebError("Esa dirección es de esta compu o de la red local.");
  return url;
}

// A GET that follows up to 3 redirects, checking every hop, and stops reading past `limit` bytes.
async function get(raw: string, limit: number, accept: string): Promise<{ url: URL; type: string; body: Buffer }> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { accept, "user-agent": "PlaybookStudio/1.0 (brand kit reader)" },
      });
    } catch (error) {
      throw new BrandWebError(`No pude abrir ${url.host}: ${(error as Error).message}`);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await checkUrl(new URL(response.headers.get("location")!, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new BrandWebError(`${url.host} respondió ${response.status}.`);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) break;
      chunks.push(Buffer.from(chunk));
    }
    return { url, type: response.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new BrandWebError("La página redirige demasiadas veces.");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ");

const attr = (tag: string, name: string) => decode(tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined) ?? "");

function meta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "property") || attr(tag, "name")).toLowerCase() === key) return attr(tag, "content").trim();
  }
  return "";
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

// Every colour written in the text: #rgb, #rrggbb (#rrggbbaa drops its alpha) and rgb()/rgba() with some opacity.
function colorsIn(css: string, into: Map<string, number>) {
  for (const m of css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const v = m[1];
    const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v.slice(0, 6);
    const key = `#${full.toLowerCase()}`;
    into.set(key, (into.get(key) ?? 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    if (alpha < 0.5) continue;
    const key = hex(Number(m[1]), Number(m[2]), Number(m[3]));
    into.set(key, (into.get(key) ?? 0) + 1);
  }
}

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset|-apple-system|blinkmacsystemfont|var\(.*)$/i;

function fontsIn(css: string, into: Map<string, number>) {
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1]
      .split(",")
      .map((f) => f.trim().replace(/^["']|["']$/g, "").trim())
      .find((f) => f && !GENERIC.test(f));
    if (first && first.length <= 60) into.set(first, (into.get(first) ?? 0) + 1);
  }
}

function googleFamilies(href: string): string[] {
  try {
    const url = new URL(href);
    if (!/fonts\.googleapis\.com$/i.test(url.hostname)) return [];
    return url.searchParams
      .getAll("family")
      .flatMap((f) => f.split("|"))
      .map((f) => f.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function plainText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const pick = (tag: string, n: number) =>
    [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
      .map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 2)
      .slice(0, n);
  const lines = [...pick("h1", 3), ...pick("h2", 8), ...pick("h3", 8), ...pick("li", 12), ...pick("p", 12)];
  return [...new Set(lines)].join("\n").slice(0, 3500);
}

export async function readBrandSite(raw: string): Promise<SiteFacts> {
  const page = await get(raw, MAX_PAGE, "text/html,application/xhtml+xml");
  if (!/html|xml|text\/plain/i.test(page.type)) throw new BrandWebError("Esa dirección no es una página web.");
  return parseBrandPage(page.body.toString("utf8"), page.url, async (href) => (await get(href, MAX_CSS, "text/css")).body.toString("utf8"));
}

// What a page uses and says, from its HTML and the stylesheets `loadCss` brings (the first three).
export async function parseBrandPage(html: string, base: URL, loadCss: (href: string) => Promise<string>): Promise<SiteFacts> {
  const abs = (href: string) => {
    try {
      const u = new URL(href, base);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
    } catch {
      return "";
    }
  };

  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const google = new Set<string>();
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const styleAttrs = [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";");
  colorsIn(inline + "\n" + styleAttrs, colors);
  fontsIn(inline + "\n" + styleAttrs, fonts);
  for (const m of inline.matchAll(/@import\s+(?:url\()?["']?([^"')]+)/gi)) googleFamilies(abs(m[1])).forEach((f) => google.add(f));

  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const sheets: string[] = [];
  const icons: { url: string; size: number; svg: boolean; apple: boolean }[] = [];
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = abs(attr(tag, "href"));
    if (!href) continue;
    if (rel.includes("stylesheet")) {
      const families = googleFamilies(href);
      if (families.length) families.forEach((f) => google.add(f));
      else sheets.push(href);
    }
    if (rel.includes("icon")) {
      const size = Math.max(0, ...(attr(tag, "sizes").match(/\d+/g) ?? ["0"]).map(Number));
      icons.push({ url: href, size, svg: /svg/i.test(attr(tag, "type")) || /\.svg(\?|$)/i.test(href), apple: rel.includes("apple") });
    }
  }
  // The first three stylesheets: enough to see the brand's colours and type, not the whole site.
  for (const href of sheets.slice(0, 3)) {
    try {
      const css = await loadCss(href);
      colorsIn(css, colors);
      fontsIn(css, fonts);
      for (const m of css.matchAll(/@import\s+(?:url\()?["']?([^"')]+)/gi)) googleFamilies(abs(m[1])).forEach((f) => google.add(f));
    } catch {
      // A stylesheet that does not load leaves its colours out.
    }
  }

  const logos: SiteFacts["logos"] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = abs(attr(tag, "src") || attr(tag, "data-src"));
    const hint = `${attr(tag, "alt")} ${attr(tag, "class")} ${attr(tag, "id")} ${src}`.toLowerCase();
    if (src && /logo|brand|marca/.test(hint)) logos.push({ url: src, kind: "logo" });
  }
  icons
    .sort((a, b) => Number(b.svg) - Number(a.svg) || Number(b.apple) - Number(a.apple) || b.size - a.size)
    .forEach((i) => logos.push({ url: i.url, kind: "icon" }));
  const og = abs(meta(html, "og:image"));
  if (og) logos.push({ url: og, kind: "og" });

  const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const theme = meta(html, "theme-color");
  const themeColor = /^#[0-9a-f]{6}$/i.test(theme) ? theme.toLowerCase() : /^#[0-9a-f]{3}$/i.test(theme) ? `#${[...theme.slice(1)].map((c) => c + c).join("")}`.toLowerCase() : "";
  return {
    url: base.toString(),
    title: title.slice(0, 200),
    siteName: meta(html, "og:site_name").slice(0, 100),
    description: (meta(html, "description") || meta(html, "og:description")).slice(0, 400),
    themeColor,
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([hex, count]) => ({ hex, count })),
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([family, count]) => ({ family, count })),
    googleFonts: [...google].slice(0, 8),
    logos: logos.filter((l, i) => logos.findIndex((x) => x.url === l.url) === i).slice(0, 6),
    text: plainText(html),
  };
}

// One logo candidate as a data URL (PNG, JPEG, WebP, GIF or SVG; the browser rasterizes and cleans an SVG).
export async function fetchLogo(raw: string): Promise<string> {
  const { type, body } = await get(raw, MAX_IMAGE, "image/*");
  const kind = type.split(";")[0].trim().toLowerCase();
  const svg = kind === "image/svg+xml" || (kind.startsWith("text/") && /<svg\b/i.test(body.subarray(0, 2000).toString("utf8")));
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!svg && !allowed.includes(kind)) throw new BrandWebError("Ese archivo no es una imagen que la app pueda usar.");
  return `data:${svg ? "image/svg+xml" : kind};base64,${body.toString("base64")}`;
}

// Without a model: the brand kit guessed from the numbers alone.
const light = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturation = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

export function guessBrand(facts: SiteFacts): { bg: string; text: string; accent: string; displayFont: string; uiFont: string } {
  const list = facts.colors.map((c) => c.hex);
  const bg = list.find((h) => light(h) > 0.85) ?? "#ffffff";
  const text = list.find((h) => light(h) < 0.25) ?? "#111111";
  const accent = (facts.themeColor && saturation(facts.themeColor) > 0.35 ? facts.themeColor : "") || list.find((h) => saturation(h) > 0.45 && light(h) > 0.2 && light(h) < 0.8) || "#ff5a36";
  // Only Google Fonts families load in the app; anything else keeps the defaults.
  const display = facts.googleFonts[0] ?? "Space Grotesk";
  const ui = facts.googleFonts[1] ?? (facts.googleFonts[0] ? display : "Inter");
  return { bg, text, accent, displayFont: display, uiFont: ui };
}
