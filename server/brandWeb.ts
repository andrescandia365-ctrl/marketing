// "Traer la marca desde su web": reads the brand's own page and gathers what the brand kit needs (colours, fonts, a
// logo, the name, what the page says) and pictures for the cast (product photos, screenshots). Nothing here is
// applied: the app shows it and the person picks. What the page claims goes back as [VERIFY] until the person confirms
// it into "Lo que existe hoy".
// Only public web addresses: never this computer, the local network or a cloud metadata address, also after a redirect.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import type { WebPictureKind, WebPictureSource } from "../shared/webCast.ts";

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
  // Pictures for the cast (product photos, screenshots), likeliest first per kind; not fetched yet.
  pictures: PictureCandidate[];
};

export type PictureCandidate = { url: string; name: string; kind: WebPictureKind; source: WebPictureSource };

const MAX_PAGE = 2_000_000;
const MAX_CSS = 600_000;
const MAX_IMAGE = 3_000_000;
const TIMEOUT = 10_000;

// Loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges, IPv4 and IPv6.
export function privateAddress(ip: string): boolean {
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
  // An IPv4 address inside IPv6 (mapped, or the old compatible form): the URL parser writes it in hex ([::ffff:7f00:1]).
  const inner = v6.match(/^::(?:ffff:)?(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (inner) {
    const v4 = inner[1] ?? [inner[2], inner[3]].flatMap((h) => [parseInt(h, 16) >> 8, parseInt(h, 16) & 255]).join(".");
    return privateAddress(v4);
  }
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

export async function checkUrl(raw: string): Promise<URL> {
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

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

// The lookup the connection itself uses. checkUrl's own lookup is only a friendly early answer: a name can answer a
// public address there and a private one a moment later (DNS rebinding), so the socket resolves once more here and
// connects only to an address that passed the same check.
export function publicLookup(
  hostname: string,
  options: { family?: number; all?: boolean; hints?: number },
  callback: LookupCallback,
  resolve: typeof dnsLookup = dnsLookup,
) {
  resolve(hostname, { family: options.family ?? 0, hints: options.hints, all: true }, (error, addresses) => {
    if (error) return callback(error, options.all ? [] : "");
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => privateAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new BrandWebError(`${hostname} apunta a esta compu o a la red local.`);
      blocked.code = "EPRIVATE";
      return callback(blocked, options.all ? [] : "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

// Every connection of the brand reader goes through publicLookup, also after a redirect.
const publicOnly = new Agent({ connect: { lookup: publicLookup as never } });

// A GET that follows up to 3 redirects, checking every hop, and stops reading past `limit` bytes.
async function get(raw: string, limit: number, accept: string): Promise<{ url: URL; type: string; body: Buffer; truncated: boolean }> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        dispatcher: publicOnly,
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { accept, "user-agent": "PlaybookStudio/1.0 (brand kit reader)" },
      } as RequestInit);
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
    let truncated = false;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) {
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(chunk));
    }
    return { url, type: response.headers.get("content-type") ?? "", body: Buffer.concat(chunks), truncated };
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
    pictures: sitePictures(html, base),
  };
}

// One logo candidate as a data URL (PNG, JPEG, WebP, GIF or SVG; the browser rasterizes and cleans an SVG).
export async function fetchLogo(raw: string): Promise<string> {
  const { type, body, truncated } = await get(raw, MAX_IMAGE, "image/*");
  if (truncated) throw new BrandWebError("Ese logo pesa demasiado.");
  const kind = type.split(";")[0].trim().toLowerCase();
  const svg = kind === "image/svg+xml" || (kind.startsWith("text/") && /<svg\b/i.test(body.subarray(0, 2000).toString("utf8")));
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!svg && !allowed.includes(kind)) throw new BrandWebError("Ese archivo no es una imagen que la app pueda usar.");
  return `data:${svg ? "image/svg+xml" : kind};base64,${body.toString("base64")}`;
}

// ── Pictures for the cast ─────────────────────────────────────────────────────────────────────────────────────────
// Product photos (e-commerce) and screenshots (software) the page shows. Found from the product's schema.org data,
// the page's share image when the page is a product, and the images in its hero, feature or product parts. Logos,
// icons, avatars and tracking pixels are left out. A screenshot is only what the website shows: the person confirms
// it is the app today before it joins as a real screen (shared/webCast.ts).

const NOT_A_PICTURE = /logo|icon|favicon|avatar|sprite|badge|\bflags?\b|pixel|tracking|spacer|emoji|payment|social|placeholder|loader|spinner|arrow|chevron|rating/i;
const SCREEN_HINT = /screen|captura|pantalla|dashboard|\bapp\b|interface|interfaz|\bui\b|mockup|demo|panel|preview/i;
const PRODUCT_HINT = /product|producto|\bpdp\b|gallery|galer[ií]a|\bsku\b|catalog|cat[aá]logo/i;
const MAIN_PLACE = /\bhero|banner|feature|showcase|highlight|destacad/i;
const PRODUCT_TYPES = new Set(["Product", "ProductGroup", "IndividualProduct", "ProductModel"]);
const APP_TYPES = new Set(["SoftwareApplication", "WebApplication", "MobileApplication"]);
const PER_KIND = 8;

// The biggest picture a srcset offers ("a.jpg 640w, b.jpg 1280w" → b.jpg).
export function largestSrc(srcset: string): string {
  let best = "";
  let size = -1;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, d = "1x"] = part.trim().split(/\s+/);
    const n = Number.parseFloat(d) * (/x$/i.test(d) ? 1000 : 1);
    if (url && (Number.isFinite(n) ? n : 0) > size) {
      best = url;
      size = Number.isFinite(n) ? n : 0;
    }
  }
  return best;
}

// A name from the file when the page gives none: ".../taza-azul_grande.jpg?v=2" → "taza azul grande".
function nameFromFile(url: string): string {
  try {
    const stem = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
    return /[a-z]{3}/i.test(stem) && !/^[0-9a-f-]{16,}$/i.test(stem) ? stem.replace(/[-_+.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  } catch {
    return "";
  }
}

function imagesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imagesOf);
  if (value && typeof value === "object") {
    const v = value as { url?: unknown; contentUrl?: unknown };
    return imagesOf(v.url ?? v.contentUrl);
  }
  return [];
}

// Products (and an app's screenshots) from the page's schema.org JSON-LD.
function jsonLdPictures(html: string, abs: (href: string) => string): PictureCandidate[] {
  const found: PictureCandidate[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    const name = typeof o.name === "string" ? decode(o.name).replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (types.some((t) => PRODUCT_TYPES.has(t))) {
      for (const src of imagesOf(o.image)) {
        const url = abs(src);
        if (url) found.push({ url, name, kind: "product", source: "jsonld" });
      }
    }
    if (types.some((t) => APP_TYPES.has(t))) {
      for (const src of imagesOf(o.screenshot)) {
        const url = abs(src);
        if (url) found.push({ url, name: name ? `${name}, pantalla` : "", kind: "screen", source: "jsonld" });
      }
    }
    for (const [key, value] of Object.entries(o)) if (key !== "image" && key !== "screenshot") walk(value, depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()), 0);
    } catch {
      // A broken JSON-LD block is skipped.
    }
  }
  return found;
}

// Every picture worth offering for the cast, both kinds, likeliest first per kind (not fetched: `fetchPicture` checks
// each one when it is brought).
export function sitePictures(html: string, base: URL): PictureCandidate[] {
  const abs = (href: string) => {
    try {
      const u = new URL(href.trim(), base);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
    } catch {
      return "";
    }
  };
  const ranked: { c: PictureCandidate; rank: number }[] = [];
  jsonLdPictures(html, abs).forEach((c) => ranked.push({ c, rank: 0 }));

  const og = abs(meta(html, "og:image:secure_url") || meta(html, "og:image"));
  if (og && !/\.svg(\?|$)/i.test(og)) {
    const isProduct = /product/i.test(meta(html, "og:type")) || Boolean(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
    ranked.push({ c: { url: og, name: meta(html, "og:title").slice(0, 60), kind: "product", source: "og" }, rank: isProduct ? 1 : 4 });
  }

  const body = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, (m) => " ".repeat(m.length));
  // Walk the page's elements keeping the open ones, so each image knows the parts it sits in.
  const open: { tag: string; hint: string }[] = [];
  for (const m of body.matchAll(/<(\/?)(section|div|header|main|figure|article|picture|li|ul|a|nav|footer|aside|img)\b[^>]*>/gi)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const at = open.map((o) => o.tag).lastIndexOf(tag);
      if (at >= 0) open.length = at;
      continue;
    }
    if (tag !== "img") {
      if (!/\/>$/.test(m[0])) open.push({ tag, hint: `${attr(m[0], "class")} ${attr(m[0], "id")} ${attr(m[0], "aria-label")}` });
      continue;
    }
    const img = m[0];
    const src = abs(largestSrc(attr(img, "srcset") || attr(img, "data-srcset")) || attr(img, "src") || attr(img, "data-src") || attr(img, "data-lazy-src"));
    if (!src || /\.svg(\?|$)/i.test(src)) continue;
    const w = Number(attr(img, "width"));
    const h = Number(attr(img, "height"));
    if ((w && w < 120) || (h && h < 120)) continue;
    const alt = attr(img, "alt").replace(/\s+/g, " ").trim();
    const own = `${alt} ${attr(img, "class")} ${attr(img, "id")} ${src}`;
    if (NOT_A_PICTURE.test(own)) continue;
    // Navigation, footers, side bars and the parts for people or partners hold no product or screen.
    if (open.some((o) => /^(nav|footer|aside)$/.test(o.tag) || /\b(?:nav|navbar|menu|footer|logos?|avatars?|testimonials?|reviews?|partners?|clients?|cookies?|team)\b/i.test(o.hint))) continue;
    const place = open.slice(-8).map((o) => o.hint).join(" ");
    const name = alt.slice(0, 60) || nameFromFile(src);
    const main = MAIN_PLACE.test(place) || MAIN_PLACE.test(own);
    const screen = SCREEN_HINT.test(own) || SCREEN_HINT.test(place);
    const product = PRODUCT_HINT.test(own) || PRODUCT_HINT.test(place);
    if (screen) ranked.push({ c: { url: src, name, kind: "screen", source: "page" }, rank: 2 });
    if (product) ranked.push({ c: { url: src, name, kind: "product", source: "page" }, rank: 2 });
    if (main && !screen) ranked.push({ c: { url: src, name, kind: "screen", source: "page" }, rank: 3 });
    if (main && !product) ranked.push({ c: { url: src, name, kind: "product", source: "page" }, rank: 3 });
    // A big picture anywhere else in the page, last.
    if (!main && !screen && !product && w >= 400) {
      ranked.push({ c: { url: src, name, kind: "screen", source: "page" }, rank: 5 });
      ranked.push({ c: { url: src, name, kind: "product", source: "page" }, rank: 5 });
    }
  }

  // One per picture and kind (a resized copy on a CDN is the same picture), PER_KIND each.
  const key = (c: PictureCandidate) => {
    try {
      const u = new URL(c.url);
      return `${c.kind} ${u.host}${u.pathname}`.toLowerCase();
    } catch {
      return `${c.kind} ${c.url}`;
    }
  };
  const seen = new Set<string>();
  const count = { product: 0, screen: 0 };
  return ranked
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((r) => r.c)
    .filter((c) => {
      const k = key(c);
      if (seen.has(k) || count[c.kind] >= PER_KIND) return false;
      seen.add(k);
      count[c.kind]++;
      return true;
    });
}

export const MAX_PICTURE = 2_500_000;
export const MAX_PICTURES_TOTAL = 9_000_000;
export const MIN_PICTURE_SIDE = 200;
export const MAX_PICTURE_SIDE = 12_000;
export const PICTURES_PER_KIND = 4;

// The picture's real type and size, read from its first bytes (PNG, JPEG, WebP, GIF), or null.
export function imageInfo(b: Buffer): { type: string; width: number; height: number } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString("ascii", 12, 16) === "IHDR") {
    return { type: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 10 && /^GIF8[79]a$/.test(b.toString("ascii", 0, 6))) {
    return { type: "image/gif", width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { type: "image/webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return { type: "image/webp", width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === "VP8X") return { type: "image/webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "image/jpeg", width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Whether a fetched file can be offered as a cast picture: whole, really a PNG/JPEG/WebP/GIF by its bytes (not an
// error page or an SVG that says it is an image), and big enough to be a photo or a screen, not an icon.
export function checkPicture(body: Buffer, declared: string, truncated: boolean): { type: string; width: number; height: number } {
  if (truncated) throw new BrandWebError(`Esa imagen pesa más de ${Math.round(MAX_PICTURE / 1_000_000)} MB.`);
  const kind = declared.split(";")[0].trim().toLowerCase();
  if (kind && !kind.startsWith("image/") && kind !== "application/octet-stream" && kind !== "binary/octet-stream") {
    throw new BrandWebError("Esa dirección no es una imagen.");
  }
  const info = imageInfo(body);
  if (!info) throw new BrandWebError("Esa imagen no es PNG, JPG, WebP ni GIF.");
  if (Math.min(info.width, info.height) < MIN_PICTURE_SIDE) throw new BrandWebError("Esa imagen es muy chica para el elenco.");
  if (Math.max(info.width, info.height) > MAX_PICTURE_SIDE) throw new BrandWebError("Esa imagen es demasiado grande.");
  return info;
}

export type FetchedPicture = PictureCandidate & { image: string; width: number; height: number; bytes: number };

// One picture brought with the same address and redirect checks as the page, as a data URL typed by its bytes.
export async function fetchPicture(c: PictureCandidate): Promise<FetchedPicture> {
  const { type, body, truncated } = await get(c.url, MAX_PICTURE, "image/webp,image/png,image/jpeg,image/gif;q=0.9");
  const info = checkPicture(body, type, truncated);
  return { ...c, image: `data:${info.type};base64,${body.toString("base64")}`, width: info.width, height: info.height, bytes: body.length };
}

// The pictures of the kinds asked for: the likeliest few of each are brought at once; those that fail are dropped,
// and the answer stays under MAX_PICTURES_TOTAL.
export async function bringPictures(
  candidates: PictureCandidate[],
  kinds: WebPictureKind[],
  fetcher: (c: PictureCandidate) => Promise<FetchedPicture> = fetchPicture,
): Promise<FetchedPicture[]> {
  const tries = kinds.flatMap((k) => candidates.filter((c) => c.kind === k).slice(0, PICTURES_PER_KIND + 2));
  // A picture offered as both kinds is brought once.
  const once = new Map<string, Promise<FetchedPicture>>();
  const bring = (c: PictureCandidate) => {
    if (!once.has(c.url)) once.set(c.url, fetcher(c));
    return once.get(c.url)!.then((p) => ({ ...p, ...c }));
  };
  const settled = await Promise.allSettled(tries.map(bring));
  const out: FetchedPicture[] = [];
  const count: Record<WebPictureKind, number> = { product: 0, screen: 0 };
  let total = 0;
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const p = r.value;
    if (count[p.kind] >= PICTURES_PER_KIND || total + p.bytes > MAX_PICTURES_TOTAL) continue;
    count[p.kind]++;
    total += p.bytes;
    out.push(p);
  }
  return out;
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
