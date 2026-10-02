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

// The two jobs of the playbook. Software: features that exist today, the product's loop, real screens.
// E-commerce: a different product in every episode.
export const SERIES_TYPES = ["software", "ecommerce"] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];
export const SERIES_TYPE_LABEL: Record<SeriesType, string> = { software: "Software (SaaS)", ecommerce: "E-commerce" };

// The series' fixed cast: characters, places, products and real screens with an approved image, reused in every
// episode. `ref` is the name of the reference in the image tool (Grok: @ref).
export const CAST_KINDS = ["character", "place", "product", "screen"] as const;
export type CastKind = (typeof CAST_KINDS)[number];
export const CAST_KIND_LABEL: Record<CastKind, string> = {
  character: "Personaje",
  place: "Lugar",
  product: "Producto",
  screen: "Pantalla real",
};

export const CastMemberSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Id no válido."),
  name: z.string().trim().min(1, "Falta el nombre.").max(60),
  ref: z.string().regex(/^[A-Za-z0-9_]{1,30}$/, "El nombre de referencia va sin espacios ni acentos."),
  kind: z.enum(CAST_KINDS),
  // English visual line repeated in every prompt. For a real screen: what it shows, in Spanish.
  identity: z.string().trim().max(600),
  // When to use it, in Spanish.
  note: z.string().trim().max(600),
  // File name in the series library ("" until an image is uploaded).
  image: z.string().max(120),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

// "Doña Marta" → id "dona-marta", ref "DonaMarta".
export function castRef(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim();
  return (
    clean
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("")
      .slice(0, 30) || "Ref"
  );
}

export const SeriesFieldsSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre.").max(80),
  tagline: z.string().trim().max(200),
  type: z.enum(SERIES_TYPES),
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
  cast: z.array(CastMemberSchema).max(60),
});
export type SeriesFields = z.infer<typeof SeriesFieldsSchema>;

export const EMPTY_SERIES: SeriesFields = {
  name: "",
  tagline: "",
  type: "software",
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
  cast: [],
};

// The heading each field is written under. The writer is told that the WORKS_TODAY list is the only thing
// that may be shown as real, so that heading must not change without updating server/claude.ts.
export const WORKS_TODAY = "Lo que existe hoy";
export const LOOP = "El loop de la serie";
export const CAST = "Elenco fijo";
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
    `Tipo: ${SERIES_TYPE_LABEL[f.type]}${f.type === "ecommerce" ? " (un producto distinto en cada episodio)" : ""}`,
    `Estilo de texto: ${JSON.stringify(f.textStyle)}`,
  ];
  for (const [key, heading] of SECTIONS) {
    const body = isList(key) ? f[key].map((w) => `- ${w}`).join("\n") : f[key].trim();
    if (body) parts.push("", `## ${heading}`, body);
  }
  if (f.cast.length) {
    parts.push(
      "",
      `## ${CAST} (personajes, lugares, productos y pantallas con imagen aprobada)`,
      "```json",
      JSON.stringify(f.cast, null, 1),
      "```",
    );
  }
  if (f.other.trim()) parts.push("", `## Otras notas\n${f.other.trim()}`);
  return `${parts.join("\n")}\n`;
}

export function markdownToSeries(text: string, fallbackName: string): SeriesFields {
  const fields: SeriesFields = { ...EMPTY_SERIES };
  fields.name = text.match(/^#\s+(.+)$/m)?.[1].trim() || fallbackName;
  fields.tagline = text.match(/^(?:Frase|Tagline):\s*(.*)$/im)?.[1].trim() ?? "";
  const type = text.match(/^Tipo:\s*(.*)$/im)?.[1].toLowerCase() ?? "";
  fields.type =
    type.includes("commerce") || (!type && /^Producto por episodio:\s*s[ií]/im.test(text)) ? "ecommerce" : "software";
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
    if (heading.toLowerCase().startsWith(CAST.toLowerCase())) {
      const json = body.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? body;
      try {
        const parsed = z.array(CastMemberSchema).safeParse(JSON.parse(json));
        if (parsed.success) fields.cast = parsed.data;
      } catch {
        // A hand-edited block that is not JSON leaves the cast empty rather than breaking the series.
      }
    } else if (heading.toLowerCase().startsWith("otras notas")) {
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
