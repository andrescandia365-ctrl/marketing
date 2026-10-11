// "Pantallas en lote": many real screenshots of the app at once. Each file becomes a screen of the cast (kind
// "screen"), marked pending until the person reviews it in "Revisá las pantallas" and confirms it. Pure helpers: the
// name a file gets, unique ids and @refs, the device guess, the copy/paste round trip with claude.ai (the prompt and
// the parser of its answer, matched back by file name), the order after review and what the writers read.
import { extraRefName, seriesRefNames } from "./castRefs.ts";
import { castRef, type CastMember } from "./series.ts";

export const SCREEN_DEVICES = ["phone", "pc"] as const;
export type ScreenDevice = (typeof SCREEN_DEVICES)[number];
export const SCREEN_DEVICE_LABEL: Record<ScreenDevice, string> = { phone: "celular", pc: "PC" };

// One screenshot at most this size (the series library keeps the file as it comes).
export const SCREEN_MAX_BYTES = 15 * 1024 * 1024;
export const SCREEN_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
// How many screenshots go with one copied prompt: claude.ai takes a limited number of files per message [NOT SURE].
export const PROMPT_BATCH = 20;

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// The note a batch screen carries: it keeps the original file name, so a later paste from claude.ai still matches.
export const BATCH_NOTE = "Subida en lote";
const fileBase = (fileName: string) => fileName.split(/[\\/]/).pop() ?? fileName;
// The original file of a batch screen (its note), else its id.
export function batchFileName(member: Pick<CastMember, "id" | "note">): string {
  return member.note.match(new RegExp(`^${BATCH_NOTE} \\((.+)\\)\\.`))?.[1] ?? member.id;
}

// The file's own name, without folders or extension: "capturas/IMG_2031.PNG" → "IMG_2031".
export function fileStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
}

// Names the camera, the phone or the computer gave the file, which say nothing about the screen.
const AUTO_NAMES = [
  /^(img|image|imagen|dsc|pxl|photo|foto|screenshot|screen ?shot|scrnshot|captura|captura de pantalla|pantallazo|whatsapp image|sin titulo|untitled|unnamed)(?=$|[\s_\-.()\d])/i,
  /^(screenshot|captura)[ _-]?\d/i,
  /^[\d\s._()-]+$/,
  // A hash or an id: long runs of hex or of digits and letters with no vowels pattern worth reading.
  /^[0-9a-f]{8,}(-[0-9a-f]{4,})*$/i,
];

// A readable screen name from a file name: "stock-buscar.png" → "Stock buscar". A name the device made up
// ("IMG_2031.png", "Screenshot 2026-10-02 at 10.31.22.png") → "" (the caller numbers it: "Pantalla 12").
export function cleanScreenName(fileName: string): string {
  const stem = fileStem(fileName).trim();
  const plain = stripAccents(stem);
  if (!stem || AUTO_NAMES.some((re) => re.test(plain))) return "";
  const words = stem
    .replace(/[_\-.+]+/g, " ")
    // camelCase → camel case ("stockBuscar")
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    // A leading order number ("01 stock buscar") is only how the files were sorted.
    .replace(/^\s*\d{1,3}\s+(?=\D)/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(words)) return "";
  const lower = words === words.toUpperCase() || /^[a-z]/.test(words) ? words.toLowerCase() : words;
  return (lower[0].toUpperCase() + lower.slice(1)).slice(0, 60).trim();
}

// The next free "Pantalla N": past the screens the cast already has, never a name or id already in use.
export function nextScreenNumber(cast: Pick<CastMember, "id" | "name" | "kind">[]): number {
  const names = new Set(cast.map((m) => m.name.toLowerCase()));
  const ids = new Set(cast.map((m) => m.id));
  let n = cast.filter((m) => m.kind === "screen").length + 1;
  while (names.has(`pantalla ${n}`) || ids.has(`pantalla-${n}`)) n++;
  return n;
}

// A screen's id from its name ("Stock buscar" → "pantalla-stock-buscar"), never one the cast already uses.
export function uniqueScreenId(name: string, takenIds: Iterable<string>): string {
  const taken = new Set(takenIds);
  const slug = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stem = (slug.startsWith("pantalla") ? slug : `pantalla-${slug}`).replace(/-$/, "").slice(0, 36).replace(/-$/, "") || "pantalla";
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const id = `${stem}-${n}`;
    if (!taken.has(id)) return id;
  }
}

// The screen's @ref from its name, never one the series uses (any case): the same rule as the extra references.
export function uniqueScreenRef(name: string, cast: { ref: string; refs?: { ref: string }[] }[]): string {
  return extraRefName("", name, seriesRefNames(cast));
}

// Portrait pictures are a phone's; square or landscape ones a computer's.
export function guessDevice(width: number, height: number): ScreenDevice {
  return height > width * 1.15 ? "phone" : "pc";
}

// The cast member one screenshot becomes: pending until the person confirms it in the review grid.
export function screenMember(
  input: { fileName: string; name?: string; device?: ScreenDevice; shows?: string },
  cast: CastMember[],
): CastMember {
  const name = (input.name?.replace(/\s+/g, " ").trim() || cleanScreenName(input.fileName) || `Pantalla ${nextScreenNumber(cast)}`).slice(0, 60);
  return {
    id: uniqueScreenId(name, cast.map((m) => m.id)),
    name,
    ref: uniqueScreenRef(name, cast),
    kind: "screen",
    // A screen's identity says what it shows, in Spanish (its function).
    identity: (input.shows ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
    note: `${BATCH_NOTE} (${fileBase(input.fileName).slice(0, 120)}).`,
    image: "",
    sheet: "",
    puppet: { layers: [] },
    rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
    refs: [],
    views: [],
    ...(input.device && { device: input.device }),
    pending: true,
  };
}

// A screen renamed in the grid: its @ref follows the name until it was edited by hand (as in the cast card).
export function renameScreen(member: CastMember, name: string, cast: CastMember[]): CastMember {
  const auto = member.ref.replace(/\d+$/, "") === castRef(member.name).replace(/\d+$/, "");
  if (!auto) return { ...member, name };
  const others = cast.filter((m) => m.id !== member.id);
  return { ...member, name, ref: uniqueScreenRef(name || member.name, others) };
}

// The order after review: the listed ids take the places those members had, in the listed order; everyone else stays.
export function reorderSubset<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const wanted = ids.filter((id) => list.some((m) => m.id === id));
  const set = new Set(wanted);
  const byId = new Map(list.map((m) => [m.id, m]));
  let k = 0;
  return list.map((m) => (set.has(m.id) ? byId.get(wanted[k++])! : m));
}

// ── The copy/paste round trip with claude.ai ──

// One answer line: "archivo | nombre | qué muestra | celular/pc".
export type ScreenNameRow = { file: string; name: string; shows: string; device?: ScreenDevice; line: number };
export type ScreenNameProblem = { line: number; text: string; reason: string };

export const ANSWER_FORMAT = "archivo | nombre | qué muestra | celular o pc";

export function readDevice(text: string): ScreenDevice | undefined {
  const t = stripAccents(text).toLowerCase().trim();
  if (/^(celular|cel|movil|telefono|phone|mobile|smartphone|iphone|android|tablet)\b/.test(t)) return "phone";
  if (/^(pc|computadora|compu|desktop|escritorio|web|notebook|laptop|computer|mac)\b/.test(t)) return "pc";
  return undefined;
}

// Reads the answer pasted from claude.ai. Tolerates bullets, numbers, a Markdown table (its header and separator
// rows), a code fence and a header line; anything else that is not four columns is listed as a problem.
export function parseScreenNames(text: string): { rows: ScreenNameRow[]; problems: ScreenNameProblem[] } {
  const rows: ScreenNameRow[] = [];
  const problems: ScreenNameProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let t = raw.trim();
    if (!t || /^```/.test(t)) return;
    if (!t.includes("|")) {
      // A sentence before or after the list is not an answer row; say so only when it looks like a file.
      if (/\.(png|jpe?g|webp|gif|heic)\b/i.test(t)) problems.push({ line, text: raw, reason: "Le faltan las columnas separadas con |." });
      return;
    }
    t = t.replace(/^(?:[-*•]|\d{1,3}[.)])\s+/, "").replace(/^\|/, "").replace(/\|$/, "");
    const cells = t.split("|").map((c) => c.trim().replace(/^[`*"“”']+|[`*"“”']+$/g, "").trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) return;
    if (/^archivo$/i.test(stripAccents(cells[0])) || /^file( ?name)?$/i.test(cells[0])) return;
    if (cells.length < 3) {
      problems.push({ line, text: raw, reason: `Tiene ${cells.length} columnas y van 4: ${ANSWER_FORMAT}.` });
      return;
    }
    const [file, name, shows, device = ""] = cells;
    if (!file) return void problems.push({ line, text: raw, reason: "Falta el nombre del archivo." });
    if (!name) return void problems.push({ line, text: raw, reason: "Falta el nombre de la pantalla." });
    const dev = readDevice(device);
    if (device && !dev) problems.push({ line, text: raw, reason: `«${device}» no es celular ni pc: queda el que tenía.` });
    rows.push({ file, name: name.slice(0, 60), shows: shows.slice(0, 600), ...(dev && { device: dev }), line });
  });
  return { rows, problems };
}

// How file names compare: no folders, case, accents or separators; the extension apart.
const fileKey = (s: string) => stripAccents(s.split(/[\\/]/).pop() ?? s).toLowerCase().replace(/[\s_-]+/g, " ").trim();
const stemKey = (s: string) => fileKey(fileStem(s));

// Matches the answer's rows to the screens by file name: the full name first, then the name without its extension
// (only when that leaves one screen). A row that matches nothing, or a screen no row names, is reported.
export function matchScreenNames<T extends { key: string; fileName: string }>(
  rows: ScreenNameRow[],
  items: T[],
): { matched: { item: T; row: ScreenNameRow }[]; unmatched: ScreenNameRow[]; missing: T[] } {
  const free = new Set(items.map((it) => it.key));
  const matched: { item: T; row: ScreenNameRow }[] = [];
  const unmatched: ScreenNameRow[] = [];
  for (const row of rows) {
    const open = items.filter((it) => free.has(it.key));
    let hit = open.find((it) => fileKey(it.fileName) === fileKey(row.file));
    if (!hit) {
      const same = open.filter((it) => stemKey(it.fileName) === stemKey(row.file));
      if (same.length === 1) hit = same[0];
    }
    if (hit) {
      free.delete(hit.key);
      matched.push({ item: hit, row });
    } else unmatched.push(row);
  }
  return { matched, unmatched, missing: items.filter((it) => free.has(it.key)) };
}

// The prompt the person pastes in claude.ai together with the screenshots (one batch of up to PROMPT_BATCH files).
export function screenNamingPrompt(opts: {
  series: string;
  files: string[];
  worksToday: string[];
  batch?: { n: number; of: number };
}): string {
  const works = opts.worksToday.filter((w) => w.trim());
  return [
    `Te paso ${opts.files.length} capturas reales de la app de ${opts.series || "la marca"}${opts.batch && opts.batch.of > 1 ? ` (tanda ${opts.batch.n} de ${opts.batch.of})` : ""}. Las voy a usar tal cual en videos, y la IA que escribe los guiones elige cuál mostrar en cada escena por su nombre y por lo que muestra.`,
    "",
    "Para cada captura, decime:",
    "- nombre: 2 a 4 palabras en castellano que digan la función de esa pantalla (ej.: «Stock buscar», «Pedido al proveedor»).",
    "- qué muestra: una línea, solo lo que se ve en la captura (qué pantalla es y qué se puede hacer ahí). No inventes funciones, números ni resultados que no se vean.",
    "- celular o pc: según la captura.",
    ...(works.length ? ["", "Lo que la app hace hoy, para usar las mismas palabras:", ...works.map((w) => `- ${w}`)] : []),
    "",
    "Los archivos son:",
    ...opts.files.map((f) => `- ${f}`),
    "",
    "Respondé SOLO con una línea por archivo, sin encabezado ni texto antes o después, con este formato exacto (columnas separadas por |):",
    ANSWER_FORMAT,
    "",
    "Ejemplo:",
    "stock-buscar.png | Stock buscar | Buscador de productos con el stock de cada uno | celular",
  ].join("\n");
}

// The files split in batches for claude.ai.
export function promptBatches<T>(items: T[], size = PROMPT_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── What the writers read ──

// The confirmed screens, one per line, for the story and explainer writers to pick the right one per scene.
export function screensForWriter(cast: CastMember[], allowed?: string[]): string {
  const screens = cast.filter((m) => m.kind === "screen" && !m.pending && (!allowed || allowed.includes(m.id)));
  return screens
    .map((m) => `- ${m.id} (@${m.ref}${m.device ? `, ${m.device === "phone" ? "phone" : "computer"}` : ""}${m.image ? "" : ", no image yet"}): ${m.name}${m.identity ? ` — ${m.identity}` : ""}`)
    .join("\n");
}

// "Lo que existe hoy" lines offered from confirmed screens (each one unchecked until the person ticks it): its name and
// what it shows, unless the list already says it.
export function worksTodayOffers(screens: Pick<CastMember, "id" | "name" | "identity">[], worksToday: string[]): { id: string; line: string }[] {
  const have = worksToday.map((w) => stripAccents(w).toLowerCase());
  const out: { id: string; line: string }[] = [];
  for (const s of screens) {
    const shows = s.identity.trim();
    if (!shows) continue;
    const line = `${s.name}: ${shows}`.slice(0, 600);
    const key = stripAccents(shows).toLowerCase();
    if (have.some((w) => w.includes(key) || w === stripAccents(line).toLowerCase())) continue;
    out.push({ id: s.id, line });
  }
  return out;
}

// The picture's type read from its first bytes (PNG, JPEG or WebP), whatever the file or the request says.
export function screenTypeOf(b: Uint8Array): (typeof SCREEN_TYPES)[number] | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// Why one screenshot cannot go in, in Spanish ("" when it can).
export function screenFileProblem(file: { name: string; size: number; type: string }): string {
  if (!file.size) return "El archivo está vacío.";
  if (file.size > SCREEN_MAX_BYTES) return `Pesa más de ${SCREEN_MAX_BYTES / 1024 / 1024} MB.`;
  if (file.type && !(SCREEN_TYPES as readonly string[]).includes(file.type)) return "Va en PNG, JPG o WebP.";
  return "";
}
