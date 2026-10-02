// A series bible as form fields, and the Markdown file it is stored in (server/series/<id>.md).
// The writer reads the Markdown; the app edits the fields. Sections with an unknown heading are kept in `other`.
import { z } from "zod";

// How the type looks on the finished video. Kept with the series so every piece of a brand looks the same.
export const TextStyleSchema = z.object({
  // Percent of the default size.
  subtitleSize: z.number().min(50).max(200),
  headlineSize: z.number().min(50).max(200),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // What keeps the text readable on any picture.
  backing: z.enum(["shadow", "outline", "box"]),
  backingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  subtitleSize: 100,
  headlineSize: 100,
  textColor: "#ffffff",
  headlineColor: "#ffffff",
  backing: "shadow",
  backingColor: "#000000",
};

export const SeriesFieldsSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre.").max(80),
  tagline: z.string().trim().max(200),
  productPerEpisode: z.boolean(),
  what: z.string().trim().max(6000),
  worksToday: z.array(z.string().trim().min(1).max(600)).max(100),
  // The series loop, one step per line (IMAN: the daily loop of the store). The loop check uses it.
  loop: z.array(z.string().trim().min(1).max(300)).max(30),
  story: z.string().trim().max(6000),
  bad: z.string().trim().max(6000),
  good: z.string().trim().max(6000),
  rules: z.string().trim().max(6000),
  audience: z.string().trim().max(3000),
  other: z.string().trim().max(12000),
  textStyle: TextStyleSchema,
});
export type SeriesFields = z.infer<typeof SeriesFieldsSchema>;

export const EMPTY_SERIES: SeriesFields = {
  name: "",
  tagline: "",
  productPerEpisode: false,
  what: "",
  worksToday: [],
  loop: [],
  story: "",
  bad: "",
  good: "",
  rules: "",
  audience: "",
  other: "",
  textStyle: DEFAULT_TEXT_STYLE,
};

// The heading each field is written under. The writer is told that the WORKS_TODAY list is the only thing
// that may be shown as real, so that heading must not change without updating server/claude.ts.
export const WORKS_TODAY = "Lo que existe hoy";
export const LOOP = "El loop de la serie";
const LISTS = ["worksToday", "loop"] as const;
type ListKey = (typeof LISTS)[number];
const isList = (key: string): key is ListKey => (LISTS as readonly string[]).includes(key);
const SECTIONS = [
  ["what", "Qué es"],
  ["worksToday", `${WORKS_TODAY} (solo esto se muestra como real)`],
  ["loop", `${LOOP} (un paso por línea)`],
  ["story", "La historia que contamos"],
  ["bad", "El Malo"],
  ["good", "El Bueno"],
  ["rules", "Reglas de la serie"],
  ["audience", "Quién mira"],
] as const;

export function seriesToMarkdown(f: SeriesFields): string {
  const parts = [
    `# ${f.name.trim()}`,
    "",
    `Frase: ${f.tagline.trim()}`,
    `Producto por episodio: ${f.productPerEpisode ? "sí" : "no"}`,
    `Estilo de texto: ${JSON.stringify(f.textStyle)}`,
  ];
  for (const [key, heading] of SECTIONS) {
    const body = isList(key) ? f[key].map((w) => `- ${w}`).join("\n") : f[key].trim();
    if (body) parts.push("", `## ${heading}`, body);
  }
  if (f.other.trim()) parts.push("", `## Otras notas\n${f.other.trim()}`);
  return `${parts.join("\n")}\n`;
}

export function markdownToSeries(text: string, fallbackName: string): SeriesFields {
  const fields: SeriesFields = { ...EMPTY_SERIES };
  fields.name = text.match(/^#\s+(.+)$/m)?.[1].trim() || fallbackName;
  fields.tagline = text.match(/^(?:Frase|Tagline):\s*(.*)$/im)?.[1].trim() ?? "";
  fields.productPerEpisode = /^Producto por episodio:\s*s[ií]/im.test(text);
  const style = text.match(/^Estilo de texto:\s*(\{.*\})\s*$/im)?.[1];
  if (style) {
    try {
      const parsed = TextStyleSchema.safeParse({ ...DEFAULT_TEXT_STYLE, ...JSON.parse(style) });
      if (parsed.success) fields.textStyle = parsed.data;
    } catch {
      // A hand-edited line that is not JSON keeps the default style.
    }
  }

  const other: string[] = [];
  const chunks = text.split(/^## /m).slice(1);
  for (const chunk of chunks) {
    const newline = chunk.indexOf("\n");
    const heading = (newline < 0 ? chunk : chunk.slice(0, newline)).trim();
    const body = newline < 0 ? "" : chunk.slice(newline + 1).trim();
    const match = SECTIONS.find(([, h]) => heading.toLowerCase().startsWith(h.split(" (")[0].toLowerCase()));
    if (heading.toLowerCase().startsWith("otras notas")) {
      if (body) other.push(body);
    } else if (!match) {
      other.push(`## ${heading}\n${body}`);
    } else if (isList(match[0])) {
      fields[match[0]] = body
        .split("\n")
        .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean);
    } else {
      fields[match[0]] = body;
    }
  }
  fields.other = other.join("\n\n");
  return fields;
}

// A file name from the series name: "Más Hogar" → "mas-hogar".
export function seriesId(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "serie"
  );
}
