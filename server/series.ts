// Series bibles: one Markdown file per series in server/series/ (iman.md, masogar.md). Claude reads the
// chosen series' file with every request, so what each brand is, its Good, its Bad and what works today
// are edited there, not in code. Add a series by adding a file; restart the app to pick up changes.
import { readFileSync, readdirSync } from "node:fs";
import type { SeriesInfo } from "../shared/schema.ts";

const DIR = new URL("./series/", import.meta.url);

type Series = SeriesInfo & { text: string };

const SERIES: Series[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((file) => {
    const text = readFileSync(new URL(file, DIR), "utf8");
    return {
      id: file.replace(/\.md$/, ""),
      name: text.match(/^#\s+(.+)$/m)?.[1].trim() ?? file,
      tagline: text.match(/^Tagline:\s*(.+)$/m)?.[1].trim() ?? "",
      text,
    };
  });

export function listSeries(): SeriesInfo[] {
  return SERIES.map(({ id, name, tagline }) => ({ id, name, tagline }));
}

export function getSeries(id: string): Series | undefined {
  return SERIES.find((s) => s.id === id);
}
