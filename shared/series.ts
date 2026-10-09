// A series bible as form fields, and the Markdown file it is stored in (server/series/<id>.md).
// The writer reads the Markdown; the app edits the fields. Sections with an unknown heading are kept in `other`.
import { z } from "zod";
import { DEFAULT_LYRIC_STYLE, LyricStyleSchema } from "./lyrics.ts";

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

// The series' look, written as flaws, not "cinematic": what camera, its flash, the grain, how focus behaves and where
// the light comes from (it never changes). Goes into every image and video prompt. Empty fields: the writer decides.
export const SeriesLookSchema = z.object({
  camera: z.string().max(300),
  flash: z.string().max(300),
  grain: z.string().max(300),
  focus: z.string().max(300),
  light: z.string().max(300),
  extra: z.string().max(400),
});
export type SeriesLook = z.infer<typeof SeriesLookSchema>;
export const EMPTY_LOOK: SeriesLook = { camera: "", flash: "", grain: "", focus: "", light: "", extra: "" };
const REAL_SKIN = "skin with visible pores, freckles and fine texture, no smoothing, no retouching, no beauty filter";
export const LOOK_PRESETS: Record<"phone" | "digicam", { label: string; look: SeriesLook }> = {
  phone: {
    label: "Celular en mano",
    look: {
      camera: "a recent smartphone's main camera, handheld",
      flash: "no flash; the phone's auto-exposure adjusts on its own",
      grain: "visible sensor noise in the shadows, light phone compression",
      focus: "autofocus that sometimes hunts and lands on the background for a moment",
      light: "the place's own light (window daylight or the store's fluorescent tubes); it never changes",
      extra: REAL_SKIN,
    },
  },
  digicam: {
    label: "Compacta digital de los 2000 con flash",
    look: {
      camera: "an early-2000s point-and-shoot digicam",
      flash: "harsh direct on-camera flash that flattens faces and puts sharp highlights on shiny surfaces",
      grain: "minor digital noise, warm slightly saturated CCD tones, bloom and halation at bright edges",
      focus: "slightly soft corners, focus a little off on fast moves",
      light: "the place's own light behind, underexposed against the flash; it never changes",
      extra: REAL_SKIN,
    },
  },
};
export const hasLook = (look: SeriesLook) => Object.values(look).some((v) => v.trim());

// The brand kit for motion graphics: logo, one background, one text colour, ONE accent, one display face for titles
// and one UI face for everything else. Fonts come from Google Fonts.
export const DISPLAY_FONTS = ["Space Grotesk", "Archivo Black", "Bricolage Grotesque", "Syne", "DM Serif Display", "Fraunces", "Bebas Neue"] as const;
export const UI_FONTS = ["Inter", "IBM Plex Sans", "DM Sans", "Work Sans", "Manrope"] as const;
// How the brand moves: how things land and whether pictures breathe once they are in. Text never moves while it is
// read. "even" leaves it to the piece's tone, as before.
export const BRAND_MOTIONS = ["even", "solid", "soft", "springy"] as const;
export type BrandMotion = (typeof BRAND_MOTIONS)[number];
export const BRAND_MOTION_LABEL: Record<BrandMotion, string> = {
  even: "Pareja: decide el tono de cada pieza",
  solid: "Firme: llega y se queda, como una caja en el estante",
  soft: "Suave: se acomoda despacio y las imágenes flotan apenas",
  springy: "Elástica: rebota un poco y las imágenes respiran",
};

export const BrandSchema = z.object({
  bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayFont: z.string().max(60),
  uiFont: z.string().max(60),
  // File name in the series library ("" until uploaded).
  logo: z.string().max(120),
  motion: z.enum(BRAND_MOTIONS).default("even"),
});
export type Brand = z.infer<typeof BrandSchema>;
export const DEFAULT_BRAND: Brand = {
  bg: "#111418",
  text: "#f4f1ea",
  accent: "#ff5a36",
  displayFont: "Space Grotesk",
  uiFont: "Inter",
  logo: "",
  motion: "even",
};

// ── Brand contrast (WCAG 2) ───────────────────────────────────────────────────────────
// Measured, not judged on thumbnails: text on the background needs 4.5:1 to read at phone size; the accent, which
// only colours big words, numbers and rings, needs 3:1.
export const CONTRAST_TEXT = 4.5;
export const CONTRAST_ACCENT = 3;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

// 1 (no contrast) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function brandContrast(brand: Pick<Brand, "bg" | "text" | "accent">): { text: number; accent: number; problems: string[] } {
  const text = contrastRatio(brand.text, brand.bg);
  const accent = contrastRatio(brand.accent, brand.bg);
  const ratio = (r: number) => `${r.toFixed(1).replace(".", ",")}:1`;
  const problems = [
    text < CONTRAST_TEXT ? `El texto sobre el fondo tiene ${ratio(text)}; para leerse en el celular hace falta ${CONTRAST_TEXT.toString().replace(".", ",")}:1.` : "",
    accent < CONTRAST_ACCENT ? `El acento sobre el fondo tiene ${ratio(accent)}; las palabras y números en acento necesitan ${CONTRAST_ACCENT}:1.` : "",
  ].filter(Boolean);
  return { text, accent, problems };
}

// The two jobs of the playbook, plus lyric videos. Software: features that exist today, the product's loop, real
// screens. E-commerce: a different product in every episode. Music: lyric videos, with no story.
export const SERIES_TYPES = ["software", "ecommerce", "music"] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];
export const SERIES_TYPE_LABEL: Record<SeriesType, string> = {
  software: "Software (SaaS)",
  ecommerce: "E-commerce",
  music: "Música (video de letra)",
};

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

// A character as a 3D-look puppet for motion graphics: the layers Grok's Segments export from one picture (all the
// same size, so they line up), each with the body part it is. The pivot (where it turns: the neck, a shoulder) is in
// shares of the layer's width and height; null means found from the layer's shape.
export const PUPPET_ROLES = ["body", "head", "armL", "armR", "mouth", "eyes", "extra"] as const;
export type PuppetRole = (typeof PUPPET_ROLES)[number];
export const PUPPET_ROLE_LABEL: Record<PuppetRole, string> = {
  body: "Cuerpo",
  head: "Cabeza",
  armL: "Brazo (izquierda de la pantalla)",
  armR: "Brazo (derecha de la pantalla)",
  mouth: "Boca",
  eyes: "Ojos",
  extra: "Otra (atrás)",
};
export const PuppetPlaceSchema = z.object({
  x: z.number().min(-2).max(3),
  y: z.number().min(-2).max(3),
  w: z.number().min(0.01).max(4),
});
export type PuppetPlace = z.infer<typeof PuppetPlaceSchema>;

export const PuppetLayerSchema = z.object({
  file: z.string().max(120),
  role: z.enum(PUPPET_ROLES),
  // Where the part turns, as shares of the reference canvas (outside it when the part sticks out).
  pivot: z.tuple([z.number().min(-2).max(3), z.number().min(-2).max(3)]).nullable().default(null),
  // The file the person uploaded, so the list can say which piece it is.
  name: z.string().max(80).default(""),
  // Where the part sits on the puppet, set by hand in "Armar a mano": its top-left corner and width as shares of the
  // reference canvas (the body's), height from the picture's own shape. null: a layer of the same canvas sits as is;
  // a loose crop of another size gets a starting place from its role.
  place: PuppetPlaceSchema.nullable().default(null),
});
export const PuppetSchema = z.object({ layers: z.array(PuppetLayerSchema).max(12).default([]) });
export type PuppetLayer = z.infer<typeof PuppetLayerSchema>;
export type Puppet = z.infer<typeof PuppetSchema>;

// A rigged humanoid for explainers that actually walk and turn. The mesh is made outside (Meshy, Tripo, Blender);
// Mixamo or Mesh2Motion puts the skeleton and the clips on it. `clips` maps each move to an animation name in the
// GLB. Root motion (hip travel and yaw) is what makes the walk and the turn real.
export const RIG_MOVES = ["idle", "walk", "turnL", "turnR", "point"] as const;
export type RigMove = (typeof RIG_MOVES)[number];
export const RIG_MOVE_LABEL: Record<RigMove, string> = {
  idle: "Quieto",
  walk: "Camina",
  turnL: "Gira a la izquierda",
  turnR: "Gira a la derecha",
  point: "Señala",
};
export const RigClipsSchema = z.object({
  idle: z.string().max(80).default(""),
  walk: z.string().max(80).default(""),
  turnL: z.string().max(80).default(""),
  turnR: z.string().max(80).default(""),
  point: z.string().max(80).default(""),
});
export const RigSchema = z.object({
  file: z.string().max(120).default(""),
  clips: RigClipsSchema.default({ idle: "", walk: "", turnL: "", turnR: "", point: "" }),
});
export type Rig = z.infer<typeof RigSchema>;

export function guessClip(name: string): RigMove | null {
  const n = name.toLowerCase();
  if (/turn/.test(n) && /left|izq|_l\b/.test(n)) return "turnL";
  if (/turn|gir/.test(n) && /right|der|_r\b/.test(n)) return "turnR";
  if (/point|wave|señal|senal|gesture/.test(n)) return "point";
  if (/walk|camin|run|locomot/.test(n)) return "walk";
  if (/idle|breath|stand|t-?pose|wait/.test(n)) return "idle";
  return null;
}

// The part a layer probably is, from its file name (Grok names segments by what they are).
export function guessRole(name: string): PuppetRole {
  const n = name.toLowerCase();
  if (/boca|mouth|lips|labio/.test(n)) return "mouth";
  if (/ojo|eye/.test(n)) return "eyes";
  if (/brazo|arm|mano|hand/.test(n)) return /izq|left|_l\b|-l\b/.test(n) ? "armL" : "armR";
  if (/cabeza|head|cara|face|hair|pelo|cabello/.test(n)) return "head";
  if (/cuerpo|body|torso|tronco|jacket|campera|remera|shirt|jean|pantal|sneaker|zapati|shoe|hoodie|falda|skirt/.test(n)) return "body";
  return "extra";
}

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
  // The reference sheet's prompt, when the member was built with "+ con hoja".
  sheet: z.string().max(6000).default(""),
  // Characters only: the puppet for motion graphics (empty: none).
  puppet: PuppetSchema.default({ layers: [] }),
  // Characters only: a rigged GLB that walks and turns (empty file: none).
  rig: RigSchema.default({ file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } }),
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
  // How people do things today, without the brand. Pains are built only on these (or the brief's notes).
  practices: z.array(z.string().trim().min(1).max(600)).max(100),
  // The series loop, one step per line (IMAN: the daily loop of the store). The loop check uses it.
  loop: z.array(z.string().trim().min(1).max(300)).max(30),
  // Dates and seasons the audience already feels, "cuándo: qué pasa" (shared/calendar.ts reads the "cuándo").
  moments: z.array(z.string().trim().min(1).max(300)).max(60).default([]),
  story: z.string().trim().max(6000),
  bad: z.string().trim().max(6000),
  good: z.string().trim().max(6000),
  rules: z.string().trim().max(6000),
  audience: z.string().trim().max(3000),
  other: z.string().trim().max(12000),
  textStyle: TextStyleSchema,
  // Music series: how their lyric videos look.
  lyricStyle: LyricStyleSchema,
  look: SeriesLookSchema,
  brand: BrandSchema,
  cast: z.array(CastMemberSchema).max(60),
});
export type SeriesFields = z.infer<typeof SeriesFieldsSchema>;

export const EMPTY_SERIES: SeriesFields = {
  name: "",
  tagline: "",
  type: "software",
  what: "",
  worksToday: [],
  practices: [],
  moments: [],
  loop: [],
  story: "",
  bad: "",
  good: "",
  rules: "",
  audience: "",
  other: "",
  textStyle: DEFAULT_TEXT_STYLE,
  lyricStyle: DEFAULT_LYRIC_STYLE,
  look: EMPTY_LOOK,
  brand: DEFAULT_BRAND,
  cast: [],
};

// The heading each field is written under. The writer is told that the WORKS_TODAY list is the only thing
// that may be shown as real, so that heading must not change without updating server/claude.ts.
export const WORKS_TODAY = "Lo que existe hoy";
export const PRACTICES = "Cómo se trabaja hoy";
export const LOOP = "El loop de la serie";
export const CAST = "Elenco fijo";
export const MOMENTS = "Momentos del calendario";
const LISTS = ["worksToday", "practices", "loop", "moments"] as const;
type ListKey = (typeof LISTS)[number];
const isList = (key: string): key is ListKey => (LISTS as readonly string[]).includes(key);
const SECTIONS = [
  ["what", "Qué es"],
  ["worksToday", `${WORKS_TODAY} (solo esto se muestra como real)`],
  ["practices", `${PRACTICES} (sin la marca; la historia no inventa otras costumbres)`],
  ["loop", `${LOOP} (un paso por línea)`],
  ["moments", `${MOMENTS} (uno por línea, cuándo: qué pasa)`],
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
    ...(f.type === "music" ? [`Estilo de letra: ${JSON.stringify(f.lyricStyle)}`] : []),
    ...(hasLook(f.look) ? [`Look (cámara y defectos, en todos los prompts): ${JSON.stringify(f.look)}`] : []),
    `Marca (logo, colores y fuentes para motion graphics): ${JSON.stringify(f.brand)}`,
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
  // [ \t]*, not \s*: an empty tagline must not swallow the next line.
  fields.tagline = text.match(/^(?:Frase|Tagline):[ \t]*(.*)$/im)?.[1].trim() ?? "";
  const type = text.match(/^Tipo:\s*(.*)$/im)?.[1].toLowerCase() ?? "";
  fields.type = /m[uú]sica|music|letra/.test(type)
    ? "music"
    : type.includes("commerce") || (!type && /^Producto por episodio:\s*s[ií]/im.test(text))
      ? "ecommerce"
      : "software";
  const style = text.match(/^Estilo de texto:\s*(\{.*\})\s*$/im)?.[1];
  if (style) {
    try {
      const parsed = TextStyleSchema.safeParse({ ...DEFAULT_TEXT_STYLE, ...JSON.parse(style) });
      if (parsed.success) fields.textStyle = parsed.data;
    } catch {
      // A hand-edited line that is not JSON keeps the default style.
    }
  }

  const brand = text.match(/^Marca[^:]*:\s*(\{.*\})\s*$/im)?.[1];
  if (brand) {
    try {
      const parsed = BrandSchema.safeParse({ ...DEFAULT_BRAND, ...JSON.parse(brand) });
      if (parsed.success) fields.brand = parsed.data;
    } catch {
      // A hand-edited line that is not JSON keeps the default brand.
    }
  }
  const look = text.match(/^Look[^:]*:\s*(\{.*\})\s*$/im)?.[1];
  if (look) {
    try {
      const parsed = SeriesLookSchema.safeParse({ ...EMPTY_LOOK, ...JSON.parse(look) });
      if (parsed.success) fields.look = parsed.data;
    } catch {
      // A hand-edited line that is not JSON leaves the look empty.
    }
  }
  const lyric = text.match(/^Estilo de letra:\s*(\{.*\})\s*$/im)?.[1];
  if (lyric) {
    try {
      const parsed = LyricStyleSchema.safeParse({ ...DEFAULT_LYRIC_STYLE, ...JSON.parse(lyric) });
      if (parsed.success) fields.lyricStyle = parsed.data;
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
