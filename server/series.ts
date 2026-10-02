// Series bibles: one Markdown file per series in server/series/ (iman.md, masogar.md). The writer reads the
// chosen series' file with every request. The app edits them in the "Editar serie" form (PUT/POST/DELETE
// /api/series); editing a file by hand works too and is picked up on the next restart.
import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import type { SeriesInfo } from "../shared/schema.ts";
import { markdownToSeries, seriesId, seriesToMarkdown, type SeriesFields, type TextStyle } from "../shared/series.ts";

const DIR = new URL("./series/", import.meta.url);
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
  return { id, name: f.name, tagline: f.tagline, productPerEpisode: f.productPerEpisode, textStyle: f.textStyle, text };
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
