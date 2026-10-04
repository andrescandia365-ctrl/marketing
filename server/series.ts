// Series bibles: one Markdown file per series in server/series/ (iman.md, masogar.md). The writer reads the
// chosen series' file with every request. The app edits them in the "Editar serie" form (PUT/POST/DELETE
// /api/series); editing a file by hand works too and is picked up on the next restart.
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LyricStyle } from "../shared/lyrics.ts";
import type { SeriesInfo } from "../shared/schema.ts";
import {
  markdownToSeries,
  seriesId,
  seriesToMarkdown,
  type CastMember,
  type PuppetRole,
  type SeriesFields,
  type TextStyle,
} from "../shared/series.ts";

const DIR = new URL("./series/", import.meta.url);
// Approved images of each series' fixed cast: biblioteca/<series>/<cast id>.<ext>. Not in git: they are the brand's.
export const LIBRARY_DIR = resolve(process.env.LIBRARY_DIR || "biblioteca");
const ID = /^[a-z0-9-]{1,40}$/;

type Series = SeriesInfo & { text: string };

let SERIES: Series[] = load();

function load(): Series[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => toSeries(file.replace(/\.md$/, ""), readFileSync(new URL(file, DIR), "utf8")));
}

function toSeries(id: string, text: string): Series {
  const f = markdownToSeries(text, id);
  return {
    id,
    name: f.name,
    tagline: f.tagline,
    type: f.type,
    productPerEpisode: f.type === "ecommerce",
    textStyle: f.textStyle,
    lyricStyle: f.lyricStyle,
    look: f.look,
    brand: f.brand,
    cast: f.cast,
    text,
  };
}

export class SeriesError extends Error {}

export function listSeries(): SeriesInfo[] {
  return SERIES.map(({ text: _text, ...info }) => info);
}

export function getSeries(id: string): Series | undefined {
  return SERIES.find((s) => s.id === id);
}

export function getSeriesFields(id: string): SeriesFields {
  const series = getSeries(id);
  if (!series) throw new SeriesError("Esa serie no existe.");
  return markdownToSeries(series.text, id);
}

// Write to a temporary file first so a crash never leaves half a bible behind.
function write(id: string, fields: SeriesFields) {
  if (!ID.test(id)) throw new SeriesError("Nombre de archivo no válido.");
  const file = new URL(`${id}.md`, DIR);
  const tmp = new URL(`.${id}.md.tmp`, DIR);
  writeFileSync(tmp, seriesToMarkdown(fields), "utf8");
  renameSync(tmp, file);
  SERIES = load();
}

export function saveSeries(id: string, fields: SeriesFields) {
  if (!getSeries(id)) throw new SeriesError("Esa serie no existe.");
  write(id, fields);
}

// The video panel saves its text style back into the series, so every piece of the brand looks the same.
export function saveTextStyle(id: string, textStyle: TextStyle) {
  saveSeries(id, { ...getSeriesFields(id), textStyle });
}

export function saveLyricStyle(id: string, lyricStyle: LyricStyle) {
  saveSeries(id, { ...getSeriesFields(id), lyricStyle });
}

// The puppet's files are the server's (they change only by uploading or removing a part): what the app sends may
// change roles and pivots, but never brings a file back or drops one.
function keepPuppet(old: CastMember | undefined, next: CastMember): CastMember["puppet"] {
  const files = new Map((old?.puppet.layers ?? []).map((l) => [l.file, l]));
  if (!files.size) return { layers: [] };
  const sent = next.puppet.layers.filter((l) => files.has(l.file));
  const seen = new Set(sent.map((l) => l.file));
  return { layers: [...sent, ...[...files.values()].filter((l) => !seen.has(l.file))] };
}

// The series as the app saves it from "Editar serie", with each character's puppet kept.
export function saveSeriesFromApp(id: string, fields: SeriesFields) {
  const old = getSeriesFields(id).cast;
  saveSeries(id, { ...fields, cast: fields.cast.map((m) => ({ ...m, puppet: keepPuppet(old.find((o) => o.id === m.id), m) })) });
}

// Adds a cast member to the series, or replaces the one with the same id (keeping its image if none is given).
export function upsertCastMember(id: string, member: CastMember) {
  const fields = getSeriesFields(id);
  const old = fields.cast.find((m) => m.id === member.id);
  const next = { ...member, image: member.image || old?.image || "", puppet: keepPuppet(old, member) };
  fields.cast = old ? fields.cast.map((m) => (m.id === member.id ? next : m)) : [...fields.cast, next];
  saveSeries(id, fields);
}

const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function setCastImage(id: string, castId: string, data: Buffer, type: string): string {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  const ext = IMAGE_EXT[type.split(";")[0].trim()];
  if (!ext) throw new SeriesError("Ese archivo no es una imagen.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = `${castId}.${ext}`;
  if (member.image && member.image !== file) rmSync(join(dir, member.image), { force: true });
  writeFileSync(join(dir, file), data);
  member.image = file;
  saveSeries(id, fields);
  return file;
}

// A puppet layer (characters only): a transparent PNG or WebP from Grok's Segments, saved as <castId>-p<n>.<ext>.
// Index n replaces that layer; one past the end adds one.
function puppetFile(castId: string, index: number, ext: string): string {
  // A new name each time, so the browser never shows an old part from its cache.
  return `${castId.slice(0, 30)}-p${index}-${Date.now().toString(36)}.${ext}`;
}

export function setPuppetLayer(
  id: string,
  castId: string,
  index: number,
  data: Buffer,
  type: string,
  role: PuppetRole,
  name = "",
): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  if (member.kind !== "character") throw new SeriesError("Solo los personajes tienen títere.");
  const ext = { "image/png": "png", "image/webp": "webp" }[type.split(";")[0].trim()];
  if (!ext) throw new SeriesError("Las partes del títere van en PNG o WebP con fondo transparente (las capas de Segmentos).");
  const layers = [...member.puppet.layers];
  if (!Number.isInteger(index) || index < 0 || index > layers.length || index >= 12) throw new SeriesError("Esa parte no existe.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = puppetFile(castId, index, ext);
  const old = layers[index]?.file;
  writeFileSync(join(dir, file), data);
  if (old) rmSync(join(dir, old), { force: true });
  layers[index] = { file, role, pivot: null, name: name.slice(0, 80) };
  member.puppet = { layers };
  saveSeries(id, fields);
  return member;
}

// Replaces every part in one write. Used when the app builds the puppet from a Grok folder, so a
// half-uploaded set never stays behind and the file is saved once.
export function replacePuppetLayers(
  id: string,
  castId: string,
  parts: { data: Buffer; role: PuppetRole; name: string }[],
): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  if (member.kind !== "character") throw new SeriesError("Solo los personajes tienen títere.");
  if (!parts.length || parts.length > 12) throw new SeriesError("El títere lleva entre 1 y 12 partes.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  for (const old of member.puppet.layers) rmSync(join(dir, old.file), { force: true });
  const layers = parts.map((part, index) => {
    if (part.data.length < 8 || part.data[0] !== 0x89) throw new SeriesError("La capa no es un PNG.");
    const file = puppetFile(castId, index, "png");
    writeFileSync(join(dir, file), part.data);
    return { file, role: part.role, pivot: null, name: part.name.slice(0, 80) };
  });
  member.puppet = { layers };
  saveSeries(id, fields);
  return member;
}

export function removePuppetLayer(id: string, castId: string, index: number): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member || !member.puppet.layers[index]) throw new SeriesError("Esa parte no existe.");
  rmSync(join(LIBRARY_DIR, id, member.puppet.layers[index].file), { force: true });
  member.puppet = { layers: member.puppet.layers.filter((_, i) => i !== index) };
  saveSeries(id, fields);
  return member;
}

// The brand logo lives in the series library as logo.<ext>.
export function setLogo(id: string, data: Buffer, type: string): string {
  const fields = getSeriesFields(id);
  const ext = IMAGE_EXT[type.split(";")[0].trim()];
  if (!ext) throw new SeriesError("Ese archivo no es una imagen.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = `logo.${ext}`;
  if (fields.brand.logo && fields.brand.logo !== file) rmSync(join(dir, fields.brand.logo), { force: true });
  writeFileSync(join(dir, file), data);
  saveSeries(id, { ...fields, brand: { ...fields.brand, logo: file } });
  return file;
}

export function readLibraryFile(id: string, name: string): { data: Buffer; type: string } {
  if (!ID.test(id) || !/^[a-z0-9-]{1,60}\.(png|jpg|webp|gif)$/.test(name)) throw new SeriesError("Ese archivo no existe.");
  const type = Object.entries(IMAGE_EXT).find(([, e]) => name.endsWith(`.${e}`))?.[0] ?? "application/octet-stream";
  try {
    return { data: readFileSync(join(LIBRARY_DIR, id, name)), type };
  } catch {
    throw new SeriesError("Ese archivo no existe.");
  }
}

export function createSeries(fields: SeriesFields): string {
  const base = seriesId(fields.name);
  let id = base;
  for (let n = 2; getSeries(id); n++) id = `${base}-${n}`;
  write(id, fields);
  return id;
}

export function deleteSeries(id: string) {
  if (!getSeries(id)) throw new SeriesError("Esa serie no existe.");
  if (SERIES.length <= 1) throw new SeriesError("Tiene que quedar al menos una serie.");
  unlinkSync(new URL(`${id}.md`, DIR));
  SERIES = load();
}
