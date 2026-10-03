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

// Adds a cast member to the series, or replaces the one with the same id (keeping its image if none is given).
export function upsertCastMember(id: string, member: CastMember) {
  const fields = getSeriesFields(id);
  const old = fields.cast.find((m) => m.id === member.id);
  const next = { ...member, image: member.image || old?.image || "" };
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
  if (!ID.test(id) || !/^[a-z0-9-]{1,40}\.(png|jpg|webp|gif)$/.test(name)) throw new SeriesError("Ese archivo no existe.");
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
