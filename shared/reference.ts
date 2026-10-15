// "Analizar un anuncio que funciona" (IDEAS 34, PLAYBOOK §3.2): the vision writer tears a reference ad down into
// its structure (what is seen first, next and last; the design; the copy split into hook, promise and CTA; the
// angle) and says what is worth borrowing. Only that written teardown is kept, in the series bible under
// "Referencias"; the picture itself is never stored, never reused and never sent to an image generator, and its
// logo, product, photos and lines never appear in our work.
import { z } from "zod";

export const REFERENCES = "Referencias";
// The heading's reminder, read by the writer with the bible.
export const REFERENCES_HEADING = `${REFERENCES} (anuncios ajenos desarmados: se toma solo la estructura, nunca su logo, su producto, sus fotos ni sus frases)`;

// The angle a reference ad sells with (PLAYBOOK §3.2). "other" when it fits none.
export const REFERENCE_ANGLES = ["pain", "fear", "status", "curiosity", "ease", "authority", "other"] as const;
export type ReferenceAngle = (typeof REFERENCE_ANGLES)[number];
export const REFERENCE_ANGLE_LABEL: Record<ReferenceAngle, string> = {
  pain: "Alivio de un dolor",
  fear: "Miedo o urgencia",
  status: "Estatus o identidad",
  curiosity: "Curiosidad",
  ease: "Facilidad",
  authority: "Autoridad",
  other: "Otro",
};

export const IMAGE_STYLES = ["ugc", "studio", "lifestyle", "product", "illustration", "minimal", "other"] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];
export const IMAGE_STYLE_LABEL: Record<ImageStyle, string> = {
  ugc: "UGC (hecho con el celular)",
  studio: "Estudio",
  lifestyle: "De vida diaria",
  product: "Solo producto",
  illustration: "Ilustración",
  minimal: "Minimalista",
  other: "Otro",
};

// What the writer returns: plain strings, so every provider (strict json_schema or not) can fill it.
export const ReferenceWireSchema = z.object({
  title: z.string(),
  first: z.string(),
  next: z.string(),
  last: z.string(),
  layout: z.string(),
  palette: z.array(z.string()),
  type: z.string(),
  imageStyle: z.string(),
  contrast: z.string(),
  whitespace: z.string(),
  framing: z.string(),
  hook: z.string(),
  promise: z.string(),
  cta: z.string(),
  otherLines: z.array(z.string()),
  angle: z.string(),
  angleWhy: z.string(),
  borrow: z.array(z.string()),
  avoid: z.array(z.string()),
});
export type ReferenceWire = z.infer<typeof ReferenceWireSchema>;

const Line = (max: number) => z.string().max(max).default("");
const Lines = z.array(z.string().max(300)).max(8).default([]);
const HEX = /^#[0-9a-f]{6}$/;

// A teardown as the series keeps it.
export const ReferenceSchema = z.object({
  title: z.string().trim().min(1, "Falta el nombre de la referencia.").max(80),
  // YYYY-MM-DD, when it was analysed ("" when unknown).
  added: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
  first: Line(300),
  next: Line(300),
  last: Line(300),
  layout: Line(400),
  palette: z.array(z.string().regex(HEX)).max(8).default([]),
  type: Line(300),
  imageStyle: z.enum(IMAGE_STYLES).default("other"),
  contrast: Line(300),
  whitespace: Line(300),
  framing: Line(300),
  hook: Line(300),
  promise: Line(300),
  cta: Line(300),
  otherLines: Lines,
  angle: z.enum(REFERENCE_ANGLES).default("other"),
  angleWhy: Line(300),
  borrow: Lines,
  avoid: Lines,
  // The person's own note (where it came from, why it works for them).
  note: Line(400),
});
export type Reference = z.infer<typeof ReferenceSchema>;
export const MAX_REFERENCES = 30;

// One line of text: no line breaks, no list separator (" | " joins list items in the bible), within its length.
export function oneLine(s: unknown, max = 300): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/\s*\|\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

// The angle from the writer's words (Spanish or English, a label or a sentence).
export function angleOf(s: string): ReferenceAngle {
  const t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if ((REFERENCE_ANGLES as readonly string[]).includes(t.trim())) return t.trim() as ReferenceAngle;
  if (/dolor|pain|relief|alivio/.test(t)) return "pain";
  if (/miedo|urgen|fear|scarc|escas|fomo/.test(t)) return "fear";
  if (/estatus|status|identi|aspira/.test(t)) return "status";
  if (/curios/.test(t)) return "curiosity";
  if (/facil|ease|easy|simpl|comod|conven/.test(t)) return "ease";
  if (/autorid|authority|expert|prueba social|social proof/.test(t)) return "authority";
  return "other";
}

export function imageStyleOf(s: string): ImageStyle {
  const t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if ((IMAGE_STYLES as readonly string[]).includes(t.trim())) return t.trim() as ImageStyle;
  if (/ugc|celular|phone|selfie|user.?generated/.test(t)) return "ugc";
  if (/ilustr|illustr|dibuj|drawn|cartoon|vector/.test(t)) return "illustration";
  if (/minimal/.test(t)) return "minimal";
  if (/solo producto|product only|product.?shot|packshot|solo el producto/.test(t)) return "product";
  if (/estudio|studio/.test(t)) return "studio";
  if (/vida|lifestyle|cotidian|everyday|in use|en uso/.test(t)) return "lifestyle";
  return "other";
}

// "#ABC", "AABBCC", "#aabbcc" → "#aabbcc"; anything else is dropped. No repeats, at most 8.
export function cleanPalette(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    // Six digits with or without "#"; three only after "#" (a bare "bad" or "ada" is a word, not a colour).
    const m = raw.trim().toLowerCase().match(/(?:^|[^0-9a-z#])#?([0-9a-f]{6})(?![0-9a-z])|#([0-9a-f]{3})(?![0-9a-z])/);
    if (!m) continue;
    const hex = m[1] ?? [...m[2]].map((c) => c + c).join("");
    const v = `#${hex}`;
    if (!out.includes(v)) out.push(v);
    if (out.length === 8) break;
  }
  return out;
}

const cleanLines = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((x) => oneLine(x)).filter(Boolean))].slice(0, 8)
    : [];

// The writer's teardown as the series keeps it: every field one clean line, the angle and the image style as one of
// the app's values, the palette as hex. `added` is today's date (YYYY-MM-DD) from the caller.
export function normalizeReference(raw: Partial<Record<keyof ReferenceWire, unknown>>, added = "", note = ""): Reference {
  const s = (k: keyof ReferenceWire, max = 300) => oneLine(raw[k], max);
  return ReferenceSchema.parse({
    title: s("title", 80) || "Anuncio de referencia",
    added: /^\d{4}-\d{2}-\d{2}$/.test(added) ? added : "",
    first: s("first"),
    next: s("next"),
    last: s("last"),
    layout: s("layout", 400),
    palette: cleanPalette(raw.palette),
    type: s("type"),
    imageStyle: imageStyleOf(typeof raw.imageStyle === "string" ? raw.imageStyle : ""),
    contrast: s("contrast"),
    whitespace: s("whitespace"),
    framing: s("framing"),
    hook: s("hook"),
    promise: s("promise"),
    cta: s("cta"),
    otherLines: cleanLines(raw.otherLines),
    angle: angleOf(typeof raw.angle === "string" ? raw.angle : ""),
    angleWhy: s("angleWhy"),
    borrow: cleanLines(raw.borrow),
    avoid: cleanLines(raw.avoid),
    note: oneLine(note, 400),
  });
}

// ── The bible's "Referencias" section, both ways ───────────────────────────────────────────
// Each reference is a "### title (date)" block of "- Label: value" lines; lists are joined with " | ".
const THEIRS = "sus palabras, nunca se reusan";
type Row = { key: keyof Reference; label: string; list?: boolean };
const ROWS: Row[] = [
  { key: "angle", label: "Ángulo" },
  { key: "angleWhy", label: "Por qué ese ángulo" },
  { key: "first", label: "Se ve primero" },
  { key: "next", label: "Se ve después" },
  { key: "last", label: "Se ve al final" },
  { key: "layout", label: "Armado" },
  { key: "palette", label: "Colores", list: true },
  { key: "type", label: "Letra" },
  { key: "imageStyle", label: "Estilo de imagen" },
  { key: "contrast", label: "Contraste" },
  { key: "whitespace", label: "Aire" },
  { key: "framing", label: "Encuadre" },
  { key: "hook", label: `Gancho (${THEIRS})` },
  { key: "promise", label: `Promesa (${THEIRS})` },
  { key: "cta", label: `Llamado a la acción (${THEIRS})` },
  { key: "otherLines", label: `Otras líneas (${THEIRS})`, list: true },
  { key: "borrow", label: "Qué tomar (solo la estructura)", list: true },
  { key: "avoid", label: "Qué no tomar", list: true },
  { key: "note", label: "Nota" },
];
const labelKey = (label: string) =>
  label
    .split(" (")[0]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function referencesToMarkdown(list: Reference[]): string {
  return list
    .map((r) => {
      const lines = [`### ${oneLine(r.title, 80)}${r.added ? ` (${r.added})` : ""}`];
      for (const row of ROWS) {
        const v = r[row.key];
        const text =
          row.key === "angle"
            ? REFERENCE_ANGLE_LABEL[r.angle]
            : row.key === "imageStyle"
              ? IMAGE_STYLE_LABEL[r.imageStyle]
              : Array.isArray(v)
                ? v.map((x) => oneLine(x)).filter(Boolean).join(" | ")
                : oneLine(v, 400);
        if (text) lines.push(`- ${row.label}: ${text}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

// The section's body back into references. A block that does not read keeps what it can; one with no title is
// skipped. Labels are matched without their bracketed note and without accents, so a hand edit still reads.
export function markdownToReferences(body: string): Reference[] {
  const out: Reference[] = [];
  for (const block of body.split(/^### /m).slice(1)) {
    const [head, ...rest] = block.split("\n");
    const titled = head.trim().match(/^(.*?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/);
    const title = oneLine(titled?.[1] ?? "", 80);
    if (!title) continue;
    const raw: Record<string, unknown> = { title };
    for (const line of rest) {
      const m = line.match(/^\s*[-*•]\s*([^:]+):\s*(.*)$/);
      if (!m) continue;
      const row = ROWS.find((r) => labelKey(r.label) === labelKey(m[1]));
      if (!row) continue;
      raw[row.key] = row.list ? m[2].split(" | ").map((x) => x.trim()) : m[2].trim();
    }
    const angleText = typeof raw.angle === "string" ? raw.angle : "";
    const styleText = typeof raw.imageStyle === "string" ? raw.imageStyle : "";
    const back = (labels: Record<string, string>, text: string) => Object.entries(labels).find(([, l]) => l.toLowerCase() === text.toLowerCase())?.[0];
    const ref = normalizeReference(raw as Partial<Record<keyof ReferenceWire, unknown>>, titled?.[2] ?? "", typeof raw.note === "string" ? raw.note : "");
    out.push({
      ...ref,
      angle: (back(REFERENCE_ANGLE_LABEL, angleText) as ReferenceAngle | undefined) ?? angleOf(angleText),
      imageStyle: (back(IMAGE_STYLE_LABEL, styleText) as ImageStyle | undefined) ?? imageStyleOf(styleText),
    });
    if (out.length === MAX_REFERENCES) break;
  }
  return out;
}
