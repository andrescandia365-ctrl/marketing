// "Fuentes propias de la marca": font files a series uploads (Editar serie → Marca) next to the Google Fonts list.
// Each file is one face (a family name, a weight, normal or italic) with a role: títulos, interfaz or otra. They live in
// biblioteca/<series>/fuentes/ and are listed in the brand line of the bible (`brand.fonts`). The brand's displayFont
// and uiFont stay family names: one that names an uploaded family is loaded from its files, any other from Google Fonts.
// Pure: the server checks the bytes and names here, the browser resolves what to load here.
import { z } from "zod";

// woff2, woff, TrueType and OpenType, read from the first bytes (the name and the browser's type are not trusted).
export const FONT_EXTS = ["woff2", "woff", "ttf", "otf"] as const;
export type FontExt = (typeof FONT_EXTS)[number];
export const FONT_TYPES: Record<FontExt, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
// A full family with every script rarely passes 2 MB; 8 MB leaves room for a big CJK face.
export const FONT_MAX_BYTES = 8 * 1024 * 1024;
// Several brands' worth of faces in one series: titles, body and a couple of extras, each with its weights.
export const BRAND_FONT_MAX = 24;
export const FONT_LICENCE_NOTE = "Usá fuentes que tengas permiso de usar: la app no puede revisar la licencia de un archivo.";

export const FONT_ROLES = ["display", "ui", "other"] as const;
export type FontRole = (typeof FONT_ROLES)[number];
export const FONT_ROLE_LABEL: Record<FontRole, string> = { display: "Títulos", ui: "Interfaz", other: "Otra" };
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

// What a family name may hold: it goes into CSS (`700 48px "Family"`), so no quotes, backslashes, braces or semicolons.
const FAMILY = /^[\p{L}\p{N} _.&+-]{1,60}$/u;
export const FONT_FILE = /^[a-z0-9-]{1,60}\.(woff2|woff|ttf|otf)$/;

export const BrandFontSchema = z.object({
  // The saved name in biblioteca/<series>/fuentes/.
  file: z.string().regex(FONT_FILE, "El nombre del archivo de la fuente no es válido."),
  family: z.string().trim().regex(FAMILY, "El nombre de la familia lleva letras, números, espacios y - _ . & + (hasta 60)."),
  role: z.enum(FONT_ROLES),
  weight: z.number().int().min(100).max(900),
  style: z.enum(["normal", "italic"]).default("normal"),
  // The original file name, so the person recognises it in the list.
  name: z.string().max(120).default(""),
});
export type BrandFont = z.infer<typeof BrandFontSchema>;

// The type of a font file from its first bytes; null when it is not one we take (a font collection .ttc included).
export function fontTypeOf(bytes: Uint8Array): FontExt | null {
  if (bytes.length < 12) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "otf";
  if ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === "true") return "ttf";
  return null;
}

// A family name as the person typed it, made safe for CSS; "" when nothing is left.
export function cleanFamily(text: string): string {
  return text
    .replace(/[^\p{L}\p{N} _.&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/(hairline|thin)/, 100],
  [/(extra|ultra)[ -]?light/, 200],
  [/light/, 300],
  [/(semi|demi)[ -]?bold/, 600],
  [/(extra|ultra)[ -]?bold/, 800],
  [/(black|heavy)/, 900],
  [/bold/, 700],
  [/medium/, 500],
  [/(regular|book|normal|roman)/, 400],
];
const FACE_WORDS = /[ _-]*(hairline|thin|(extra|ultra)[ -]?light|light|(semi|demi)[ -]?bold|(extra|ultra)[ -]?bold|black|heavy|bold|medium|regular|book|normal|roman|italic|oblique|it|variable|vf|webfont|web)\b/gi;

// A first guess from the file's name ("Gotham-BoldItalic.woff2" → Gotham, 700, italic), which the person can change.
export function guessFontFace(fileName: string): { family: string; weight: number; style: "normal" | "italic" } {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const spaced = base.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_]+/g, " ");
  const lower = spaced.toLowerCase();
  const weight = WEIGHT_WORDS.find(([re]) => re.test(lower))?.[1] ?? 400;
  const style = /(italic|oblique)/.test(lower) || /[ -]it$/.test(lower) ? "italic" : "normal";
  const family = cleanFamily(spaced.replace(FACE_WORDS, " ").replace(/[-]+/g, " ")) || cleanFamily(spaced) || "Fuente";
  return { family, weight, style };
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "fuente";

// The saved name of a new face: family-weight[-italic].ext, unique among the names already taken.
export function fontFileName(family: string, weight: number, style: "normal" | "italic", ext: FontExt, taken: string[]): string {
  const base = `${slug(family)}-${weight}${style === "italic" ? "-italic" : ""}`;
  const used = new Set(taken);
  let file = `${base}.${ext}`;
  for (let n = 2; used.has(file); n++) file = `${base}-${n}.${ext}`;
  return file;
}

// The checks an upload goes through, in Spanish; [] when it can be saved.
export function fontUploadProblems(bytes: Uint8Array, have: number): string[] {
  const out: string[] = [];
  if (!bytes.length) out.push("El archivo está vacío.");
  else if (bytes.length > FONT_MAX_BYTES) out.push(`La fuente pesa más de ${FONT_MAX_BYTES / 1024 / 1024} MB.`);
  else if (!fontTypeOf(bytes)) out.push("Ese archivo no es una fuente woff2, woff, ttf ni otf (las colecciones .ttc no van: subí cada estilo por separado).");
  if (have >= BRAND_FONT_MAX) out.push(`La marca ya tiene ${BRAND_FONT_MAX} archivos de fuentes: sacá alguno antes de subir otro.`);
  return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type BrandFonts = { displayFont: string; uiFont: string; fonts?: BrandFont[] };

// Where a family comes from: the series' own files (every face of that family) or Google Fonts.
export type FontSource = { family: string; kind: "file"; faces: BrandFont[] } | { family: string; kind: "google" };
export function resolveBrandFont(brand: Pick<BrandFonts, "fonts">, family: string): FontSource {
  const faces = (brand.fonts ?? []).filter((f) => same(f.family, family));
  return faces.length ? { family: faces[0].family, kind: "file", faces } : { family, kind: "google" };
}

// The two families the brand draws with (titles, then interface), each resolved; one entry when they are the same.
export function brandFontSources(brand: BrandFonts): FontSource[] {
  const families = [brand.displayFont, brand.uiFont].filter((f, i, all) => f.trim() && all.findIndex((g) => same(g, f)) === i);
  return families.map((f) => resolveBrandFont(brand, f));
}

// The uploaded families, in the order they were added, with their roles (a family whose faces carry several roles
// shows them all).
export function uploadedFamilies(brand: Pick<BrandFonts, "fonts">): { family: string; roles: FontRole[]; weights: number[] }[] {
  const out: { family: string; roles: FontRole[]; weights: number[] }[] = [];
  for (const f of brand.fonts ?? []) {
    let entry = out.find((e) => same(e.family, f.family));
    if (!entry) out.push((entry = { family: f.family, roles: [], weights: [] }));
    if (!entry.roles.includes(f.role)) entry.roles.push(f.role);
    if (!entry.weights.includes(f.weight)) entry.weights.push(f.weight);
  }
  for (const e of out) e.weights.sort((a, b) => a - b);
  return out;
}

// The choices for "Fuente de títulos" (role display) or "Fuente de interfaz" (role ui): the brand's own families first
// (those with that role before the rest), then the Google list, and the current one even if it is in neither.
export function fontChoices(brand: BrandFonts, role: "display" | "ui", google: readonly string[]): { family: string; uploaded: boolean }[] {
  const own = uploadedFamilies(brand);
  const ranked = [...own.filter((f) => f.roles.includes(role)), ...own.filter((f) => !f.roles.includes(role))];
  const out: { family: string; uploaded: boolean }[] = ranked.map((f) => ({ family: f.family, uploaded: true }));
  for (const g of google) if (!out.some((o) => same(o.family, g))) out.push({ family: g, uploaded: false });
  const current = role === "display" ? brand.displayFont : brand.uiFont;
  if (current.trim() && !out.some((o) => same(o.family, current))) out.push({ family: current, uploaded: false });
  return out;
}

// The served address of one face.
export const brandFontUrl = (seriesId: string, file: string) => `/api/series/${encodeURIComponent(seriesId)}/fonts/${encodeURIComponent(file)}`;

// What the app sends from "Editar serie" may rename a face, change its role, weight or style, but never adds a file or
// drops one: those are the upload and delete routes' (like the logo and the puppets). Faces whose file is not on the
// server are dropped; faces on the server the app did not send are kept as they were.
export function keepBrandFonts(saved: BrandFont[], sent: BrandFont[] | undefined): BrandFont[] {
  const sentByFile = new Map((sent ?? []).map((f) => [f.file, f]));
  return saved.map((old) => {
    const next = sentByFile.get(old.file);
    if (!next) return old;
    const family = cleanFamily(next.family) || old.family;
    return { ...old, family, role: next.role, weight: next.weight, style: next.style };
  });
}

// After faces are removed (brand.fonts already without them): a displayFont or uiFont that named an uploaded family
// with no file left goes back to the default, so a render never asks Google Fonts for a family it does not have.
export function afterFontRemoved<B extends BrandFonts>(brand: B, removed: BrandFont[], defaults: { displayFont: string; uiFont: string }): B {
  const gone = (family: string) => removed.some((r) => same(r.family, family)) && !(brand.fonts ?? []).some((f) => same(f.family, family));
  return {
    ...brand,
    displayFont: gone(brand.displayFont) ? defaults.displayFont : brand.displayFont,
    uiFont: gone(brand.uiFont) ? defaults.uiFont : brand.uiFont,
  };
}

// Why a render stopped over its fonts: an uploaded family points at its file, any other at the connection.
export function missingFontText(missing: string[], brand: Pick<BrandFonts, "fonts">): string {
  const names = missing.map((f) => `«${f}»`).join(" ni ");
  const ownFile = missing.some((f) => resolveBrandFont(brand, f).kind === "file");
  return `No cargó la fuente ${names} de la marca, así que el render se frena para no salir con otra letra. ${
    ownFile
      ? "Es una fuente subida a la serie: revisá en Editar serie → Marca que el archivo siga ahí y se vea en la muestra, o subilo de nuevo."
      : "Revisá la conexión a internet, o elegí otra fuente en Editar serie."
  }`;
}

// The brand's two families for the story's text (TextStyle.font "brand"): titles in the display font, lines in the UI.
export const storyFonts = (brand: Pick<BrandFonts, "displayFont" | "uiFont">) => ({ display: brand.displayFont, ui: brand.uiFont });

// One face edited in "Editar serie" (family, role, weight, style). A family name that changes carries the brand's
// displayFont / uiFont with it when no other face keeps the old name, so the brand never points at a family it lost.
export function editFontFace<B extends BrandFonts & { fonts: BrandFont[] }>(brand: B, file: string, patch: Partial<Pick<BrandFont, "family" | "role" | "weight" | "style">>): B {
  const old = brand.fonts.find((f) => f.file === file);
  if (!old) return brand;
  const family = patch.family === undefined ? old.family : cleanFamily(patch.family) || old.family;
  const fonts = brand.fonts.map((f) => (f.file === file ? { ...f, ...patch, family } : f));
  const lost = !same(family, old.family) && !fonts.some((f) => same(f.family, old.family));
  const carry = (current: string) => (lost && same(current, old.family) ? family : current);
  return { ...brand, fonts, displayFont: carry(brand.displayFont), uiFont: carry(brand.uiFont) };
}
