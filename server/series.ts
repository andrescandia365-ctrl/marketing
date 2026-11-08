// Series bibles: one Markdown file per series in server/series/ (iman.md, masogar.md). The writer reads the
// chosen series' file with every request. The app edits them in the "Editar serie" form (PUT/POST/DELETE
// /api/series); editing a file by hand works too and is picked up on the next restart.
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { SCREEN_VIDEO_MAX_BYTES, SCREEN_VIDEO_TYPES, videoTypeOf } from "../shared/screenVideo.ts";
import { join, resolve, sep } from "node:path";
import type { LyricStyle } from "../shared/lyrics.ts";
import type { SeriesInfo } from "../shared/schema.ts";
import { extraRefName, memberRefCount, refFileName, seriesRefNames } from "../shared/castRefs.ts";
import { FONT_TYPES, afterFontRemoved, cleanFamily, fontFileName, fontTypeOf, fontUploadProblems, guessFontFace, keepBrandFonts, BrandFontSchema, FONT_FILE, type BrandFont, type FontRole } from "../shared/brandFonts.ts";
import { MASCOT_FILE, MascotMetaSchema, mascotSig, validateMascotSource, type MascotMeta } from "../shared/mascot.ts";
import { SCREEN_MAX_BYTES, reorderSubset, screenMember, screenTypeOf, type ScreenDevice } from "../shared/screenBatch.ts";
import { libraryAdd, libraryWithout, normalizeHookElements, previousFrom, type HookElement } from "../shared/hookElements.ts";
import {
  DEFAULT_BRAND,
  CAST_MAX,
  PUPPET_MAX_LAYERS,
  ScreenVideoSchema,
  markdownToSeries,
  seriesId,
  seriesToMarkdown,
  type CastMember,
  type PuppetPlace,
  type PuppetRole,
  type SeriesFields,
  type TextStyle,
} from "../shared/series.ts";

const DIR = new URL("./series/", import.meta.url);
// Approved images of each series' fixed cast: biblioteca/<series>/<cast id>.<ext>. Not in git: they are the brand's.
export const LIBRARY_DIR = resolve(process.env.LIBRARY_DIR || "biblioteca");
const ID = /^[a-z0-9-]{1,40}$/;

// A file of the series library by its saved name, only when it stays inside that series' folder: names come from
// saved bibles, so one that climbs out ("../../.env") is never read or deleted.
export function libraryPath(id: string, name: string): string | null {
  if (!ID.test(id) || !name) return null;
  const dir = resolve(LIBRARY_DIR, id);
  const path = resolve(dir, name);
  return path.startsWith(dir + sep) && !path.slice(dir.length + 1).includes(sep) ? path : null;
}

function removeLibraryFile(id: string, name: string) {
  const path = libraryPath(id, name);
  if (path) rmSync(path, { force: true });
}

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
    moments: f.moments,
    explainerCharacter: f.explainerCharacter,
    correspondent: f.correspondent,
    mascot: f.mascot,
    hookLibrary: f.hookLibrary,
    hookPrevious: f.hookPrevious,
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
function keepRig(old: CastMember | undefined, next: CastMember): CastMember["rig"] {
  const file = next.rig?.file || old?.rig?.file || "";
  const clips = { ...{ idle: "", walk: "", turnL: "", turnR: "", point: "" }, ...old?.rig?.clips, ...next.rig?.clips };
  return { file, clips };
}

function keepPuppet(old: CastMember | undefined, next: CastMember): CastMember["puppet"] {
  const files = new Map((old?.puppet.layers ?? []).map((l) => [l.file, l]));
  if (!files.size) return { layers: [] };
  const sent = next.puppet.layers.filter((l) => files.has(l.file));
  const seen = new Set(sent.map((l) => l.file));
  return { layers: [...sent, ...[...files.values()].filter((l) => !seen.has(l.file))] };
}

// Extra reference images are the server's too (added by uploading a crop or a view, dropped one by one): a member the
// series already has keeps the ones on disk; a new member starts with none.
function keepRefs(old: CastMember | undefined): CastMember["refs"] {
  return old?.refs ?? [];
}

// A real screen's recording is the server's too (uploaded or removed on its own route): what the app sends never
// brings one back or points it at another file.
function keepVideo(old: CastMember | undefined, next: CastMember): Pick<CastMember, "video"> {
  return next.kind === "screen" && old?.video ? { video: old.video } : {};
}
const withoutVideo = ({ video: _v, ...m }: CastMember): CastMember => m;

// The series as the app saves it from "Editar serie", with each character's puppet kept.
export function saveSeriesFromApp(id: string, fields: SeriesFields) {
  const old = getSeriesFields(id).cast;
  // An explainer character who left the cast is no longer the series' host.
  const host = fields.cast.some((m) => m.id === fields.explainerCharacter && m.kind === "character") ? fields.explainerCharacter : "";
  // The same for a correspondent who left the cast.
  const correspondent = fields.cast.some((m) => m.id === fields.correspondent && m.kind === "character") ? fields.correspondent : "";
  // "Mascota en código" is the server's (saved and removed on its own route): what the app sends never changes it.
  const mascot = getSeriesFields(id).mascot;
  // "Fuentes propias de la marca": the files are the server's too; the form may rename them or change their role.
  const brand = { ...fields.brand, fonts: keepBrandFonts(getSeriesFields(id).brand.fonts, fields.brand.fonts) };
  saveSeries(id, { ...fields, brand, mascot, explainerCharacter: host, correspondent, cast: fields.cast.map((m) => ({ ...withoutVideo(m), puppet: keepPuppet(old.find((o) => o.id === m.id), m), rig: keepRig(old.find((o) => o.id === m.id), m), refs: keepRefs(old.find((o) => o.id === m.id)), ...keepVideo(old.find((o) => o.id === m.id), m) })) });
}

// "Elementos de la serie": one library line in the bible. Adding one also records it as the previous piece's
// element, unless the caller sends its own previous list (the story or the board being approved).
export function saveHookLibrary(id: string, change: { add?: HookElement; remove?: string; previous?: string[] }) {
  const fields = getSeriesFields(id);
  let library = [...(fields.hookLibrary ?? [])];
  if (change.remove) library = libraryWithout(library, change.remove);
  if (change.add) {
    const [added] = normalizeHookElements([change.add]);
    if (!added) throw new SeriesError("Ese elemento no tiene qué se ve ni un nombre.");
    library = libraryAdd(library, added);
  }
  const previous = change.previous
    ? change.previous.map((p) => p.trim()).filter(Boolean).slice(0, 3)
    : change.add
      ? previousFrom([change.add])
      : fields.hookPrevious;
  saveSeries(id, { ...fields, hookLibrary: library, hookPrevious: previous });
  return { hookLibrary: library, hookPrevious: previous };
}

// Adds a cast member to the series, or replaces the one with the same id (keeping its image if none is given).
export function upsertCastMember(id: string, member: CastMember) {
  const fields = getSeriesFields(id);
  const old = fields.cast.find((m) => m.id === member.id);
  const next = { ...withoutVideo(member), image: member.image || old?.image || "", puppet: keepPuppet(old, member), rig: keepRig(old, member), refs: keepRefs(old), ...keepVideo(old, member) };
  fields.cast = old ? fields.cast.map((m) => (m.id === member.id ? next : m)) : [...fields.cast, next];
  saveSeries(id, fields);
}

// "Sumar al elenco como corresponsal": the character the writer invented joins the cast and becomes the series'
// correspondent, so the next pieces reuse the same person.
export function addCorrespondent(id: string, member: CastMember) {
  if (member.kind !== "character") throw new SeriesError("El corresponsal tiene que ser un personaje.");
  upsertCastMember(id, member);
  saveSeries(id, { ...getSeriesFields(id), correspondent: member.id });
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
  if (member.image && member.image !== file) removeLibraryFile(id, member.image);
  writeFileSync(join(dir, file), data);
  member.image = file;
  saveSeries(id, fields);
  return file;
}

// "Subir muchas pantallas": one screenshot of a batch becomes a pending real screen, its member and its image saved
// together (a picture that fails its checks leaves nothing behind). The name, id and @ref are made unique against the
// cast as the server has it; the type is read from the bytes.
export function addScreen(id: string, data: Buffer, input: { fileName: string; name?: string; device?: ScreenDevice }): CastMember {
  const fields = getSeriesFields(id);
  if (!data.length) throw new SeriesError("El archivo está vacío.");
  if (data.length > SCREEN_MAX_BYTES) throw new SeriesError(`${input.fileName}: pesa más de ${SCREEN_MAX_BYTES / 1024 / 1024} MB.`);
  const type = screenTypeOf(data);
  if (!type) throw new SeriesError(`${input.fileName}: no es una imagen PNG, JPG o WebP.`);
  if (fields.cast.length >= CAST_MAX) throw new SeriesError(`El elenco ya tiene ${CAST_MAX} integrantes: sacá alguno antes de sumar otro.`);
  const member = screenMember(input, fields.cast);
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = `${member.id}.${IMAGE_EXT[type]}`;
  writeFileSync(join(dir, file), data);
  const saved = { ...member, image: file };
  fields.cast = [...fields.cast, saved];
  saveSeries(id, fields);
  return saved;
}

// "Confirmar" in "Revisá las pantallas": the reviewed screens take their names, @refs, what they show and their
// device, stop being pending and keep the order the person left; the ones taken out of the grid leave the cast
// (and their image the library).
export function confirmScreens(
  id: string,
  screens: { id: string; name: string; ref: string; identity: string; device?: ScreenDevice }[],
  removed: string[],
): CastMember[] {
  const fields = getSeriesFields(id);
  const gone = new Set(removed);
  for (const m of fields.cast) if (gone.has(m.id) && m.kind === "screen" && m.image) removeLibraryFile(id, m.image);
  const byId = new Map(screens.map((s) => [s.id, s]));
  const cast = fields.cast
    .filter((m) => !(gone.has(m.id) && m.kind === "screen"))
    .map((m) => {
      const s = byId.get(m.id);
      if (!s || m.kind !== "screen") return m;
      const { pending: _pending, ...rest } = m;
      return { ...rest, name: s.name, ref: s.ref, identity: s.identity, ...(s.device ? { device: s.device } : {}) };
    });
  const refs = cast.flatMap((m) => [m.ref, ...m.refs.map((r) => r.ref)].map((r) => r.toLowerCase()));
  if (new Set(refs).size !== refs.length) throw new SeriesError("Dos integrantes del elenco quedaron con la misma @referencia: cambiá una.");
  fields.cast = reorderSubset(cast, screens.map((s) => s.id));
  saveSeries(id, fields);
  return fields.cast;
}

// An extra reference image of a cast member (a crop of its sheet, or a loose view), saved next to its approved image
// and named as its own reference (@MartaCara). cap: the tools' limit on reference images (server/tools/*.md); a member
// never brings more than that, counting its approved image.
export function addCastRef(id: string, castId: string, data: Buffer, type: string, label: string, cap: number | null): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  if (member.kind === "screen") throw new SeriesError("Las pantallas reales no llevan referencias extra: van tal cual.");
  const ext = IMAGE_EXT[type.split(";")[0].trim()];
  if (!ext || ext === "gif") throw new SeriesError("La referencia va en PNG, JPG o WebP.");
  if (cap !== null && memberRefCount(member) >= cap) {
    throw new SeriesError(`La herramienta acepta hasta ${cap} imágenes de referencia y ${member.name} ya tiene ${memberRefCount(member)}. Borrá una antes de sumar otra.`);
  }
  const name = label.trim().slice(0, 60) || "referencia";
  const ref = extraRefName(member.ref, name, seriesRefNames(fields.cast));
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = refFileName(castId, ref, Date.now().toString(36), ext);
  writeFileSync(join(dir, file), data);
  member.refs = [...member.refs, { ref, label: name, image: file }];
  saveSeries(id, fields);
  return member;
}

export function removeCastRef(id: string, castId: string, ref: string): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  const extra = member?.refs.find((r) => r.ref === ref);
  if (!member || !extra) throw new SeriesError("Esa referencia no existe.");
  if (extra.image) removeLibraryFile(id, extra.image);
  member.refs = member.refs.filter((r) => r.ref !== ref);
  saveSeries(id, fields);
  return member;
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
  if (!Number.isInteger(index) || index < 0 || index > layers.length || index >= PUPPET_MAX_LAYERS) throw new SeriesError("Esa parte no existe.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = puppetFile(castId, index, ext);
  const old = layers[index]?.file;
  writeFileSync(join(dir, file), data);
  if (old) removeLibraryFile(id, old);
  layers[index] = { file, role, pivot: null, name: name.slice(0, 80), place: null };
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
  if (!parts.length || parts.length > PUPPET_MAX_LAYERS) throw new SeriesError(`El títere lleva entre 1 y ${PUPPET_MAX_LAYERS} partes.`);
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  for (const old of member.puppet.layers) removeLibraryFile(id, old.file);
  const layers = parts.map((part, index) => {
    if (part.data.length < 8 || part.data[0] !== 0x89) throw new SeriesError("La capa no es un PNG.");
    const file = puppetFile(castId, index, "png");
    writeFileSync(join(dir, file), part.data);
    return { file, role: part.role, pivot: null, name: part.name.slice(0, 80), place: null };
  });
  member.puppet = { layers };
  saveSeries(id, fields);
  return member;
}

// "Armar a mano": where each existing part sits, what it is and where it turns. The files stay the server's: the list
// has to name the same parts, in the same order (nothing is added or dropped here).
export function arrangePuppet(
  id: string,
  castId: string,
  layers: { file: string; role: PuppetRole; pivot: [number, number] | null; place: PuppetPlace | null }[],
): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  const now = member.puppet.layers;
  if (layers.length !== now.length || layers.some((l, i) => l.file !== now[i].file)) {
    throw new SeriesError("Las partes del títere cambiaron mientras lo armabas. Volvé a abrir Armar a mano.");
  }
  member.puppet = { layers: now.map((l, i) => ({ ...l, role: layers[i].role, pivot: layers[i].pivot, place: layers[i].place })) };
  saveSeries(id, fields);
  return member;
}

export function setRigFile(id: string, castId: string, data: Buffer): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  if (member.kind !== "character") throw new SeriesError("Solo los personajes tienen un rig.");
  if (data.length < 20 || data.subarray(0, 4).toString() !== "glTF") throw new SeriesError("El rig tiene que ser un GLB (glTF binario), el que exporta Mesh2Motion o Mixamo pasado a GLB.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  const file = `${castId.slice(0, 24)}-rig-${Date.now().toString(36)}.glb`;
  writeFileSync(join(dir, file), data);
  if (member.rig?.file && member.rig.file !== file) removeLibraryFile(id, member.rig.file);
  member.rig = { file, clips: member.rig?.clips ?? { idle: "", walk: "", turnL: "", turnR: "", point: "" } };
  saveSeries(id, fields);
  return member;
}

export function removePuppetLayer(id: string, castId: string, index: number): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member || !member.puppet.layers[index]) throw new SeriesError("Esa parte no existe.");
  removeLibraryFile(id, member.puppet.layers[index].file);
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
  if (fields.brand.logo && fields.brand.logo !== file) removeLibraryFile(id, fields.brand.logo);
  writeFileSync(join(dir, file), data);
  saveSeries(id, { ...fields, brand: { ...fields.brand, logo: file } });
  return file;
}

// "Videos de la app funcionando": a real screen's recording, written by the route as it streams in (a temporary file in
// the series folder, checked here: its size, and its type read from the first bytes), then kept as
// <castId>-video-<time>.<ext>, the old one removed. Its length and size are what the browser measured on upload.
export function setScreenVideo(
  id: string,
  castId: string,
  temp: string,
  info: { seconds: number; width: number; height: number; name: string },
): CastMember {
  try {
    const fields = getSeriesFields(id);
    const member = fields.cast.find((m) => m.id === castId);
    if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
    if (member.kind !== "screen") throw new SeriesError("Solo las pantallas reales llevan un video de la app.");
    const size = statSync(temp).size;
    if (!size) throw new SeriesError("El archivo está vacío.");
    if (size > SCREEN_VIDEO_MAX_BYTES) throw new SeriesError(`El video pesa más de ${SCREEN_VIDEO_MAX_BYTES / 1024 / 1024} MB: acortalo o bajale la calidad.`);
    const head = Buffer.alloc(64);
    const fd = openSync(temp, "r");
    try {
      readSync(fd, head, 0, 64, 0);
    } finally {
      closeSync(fd);
    }
    const type = videoTypeOf(head);
    if (!type) throw new SeriesError("Ese archivo no es un video MP4, WebM o MOV.");
    const video = ScreenVideoSchema.parse({ file: `${castId.slice(0, 24)}-video-${Date.now().toString(36)}.${type}`, poster: "", ...info, name: info.name.slice(0, 120) });
    const dir = join(LIBRARY_DIR, id);
    renameSync(temp, join(dir, video.file));
    if (member.video) {
      removeLibraryFile(id, member.video.file);
      removeLibraryFile(id, member.video.poster);
    }
    member.video = video;
    saveSeries(id, fields);
    return member;
  } finally {
    rmSync(temp, { force: true });
  }
}

// The poster frame of the recording (the browser takes it on upload): the still while it loads or when it cannot be read.
export function setScreenVideoPoster(id: string, castId: string, data: Buffer): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member?.video) throw new SeriesError("Esa pantalla no tiene video.");
  const type = screenTypeOf(data);
  if (!type) throw new SeriesError("La portada del video tiene que ser una imagen PNG, JPG o WebP.");
  const file = `${castId.slice(0, 24)}-poster-${Date.now().toString(36)}.${IMAGE_EXT[type]}`;
  writeFileSync(join(LIBRARY_DIR, id, file), data);
  removeLibraryFile(id, member.video.poster);
  member.video = { ...member.video, poster: file };
  saveSeries(id, fields);
  return member;
}

export function removeScreenVideo(id: string, castId: string): CastMember {
  const fields = getSeriesFields(id);
  const member = fields.cast.find((m) => m.id === castId);
  if (!member) throw new SeriesError("Ese integrante del elenco no existe.");
  if (member.video) {
    removeLibraryFile(id, member.video.file);
    removeLibraryFile(id, member.video.poster);
    delete member.video;
    saveSeries(id, fields);
  }
  return member;
}

// Where a recording being uploaded is written first (inside the series folder, so the rename is on the same disk).
export function screenVideoTemp(id: string): string {
  if (!ID.test(id) || !getSeries(id)) throw new SeriesError("Esa serie no existe.");
  const dir = join(LIBRARY_DIR, id);
  mkdirSync(dir, { recursive: true });
  return join(dir, `.subida-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`);
}

// A recording in the series library, for playing and seeking: its path, size and type (null: no such video).
export function libraryVideo(id: string, name: string): { path: string; size: number; type: string } | null {
  const m = /^[a-z0-9-]{1,60}\.(mp4|webm|mov)$/.exec(name);
  const path = m ? libraryPath(id, name) : null;
  if (!m || !path) return null;
  try {
    return { path, size: statSync(path).size, type: SCREEN_VIDEO_TYPES[m[1] as keyof typeof SCREEN_VIDEO_TYPES] };
  } catch {
    return null;
  }
}

export function readLibraryFile(id: string, name: string): { data: Buffer; type: string } {
  if (!ID.test(id) || !/^[a-z0-9-]{1,60}\.(png|jpg|webp|gif|glb)$/.test(name)) throw new SeriesError("Ese archivo no existe.");
  const type = name.endsWith(".glb") ? "model/gltf-binary" : Object.entries(IMAGE_EXT).find(([, e]) => name.endsWith(`.${e}`))?.[0] ?? "application/octet-stream";
  try {
    return { data: readFileSync(join(LIBRARY_DIR, id, name)), type };
  } catch {
    throw new SeriesError("Ese archivo no existe.");
  }
}

// ── "Fuentes propias de la marca" ─────────────────────────────────────────────────────────────────────────────
// Font files live in biblioteca/<series>/fuentes/<family>-<weight>.<ext>, the type read from the bytes; the bible lists
// them in the brand line (brand.fonts). Only names the schema accepts are ever read or removed.
export const FONTS_DIR = "fuentes";

export function fontPath(id: string, file: string): string | null {
  if (!ID.test(id) || !FONT_FILE.test(file)) return null;
  return join(LIBRARY_DIR, id, FONTS_DIR, file);
}

export function addBrandFont(
  id: string,
  data: Buffer,
  input: { fileName: string; family?: string; role?: FontRole; weight?: number; style?: "normal" | "italic" },
): BrandFont {
  const fields = getSeriesFields(id);
  const bytes = new Uint8Array(data);
  const problem = fontUploadProblems(bytes, fields.brand.fonts.length)[0];
  if (problem) throw new SeriesError(problem);
  const ext = fontTypeOf(bytes)!;
  const guess = guessFontFace(input.fileName);
  const family = cleanFamily(input.family ?? "") || guess.family;
  const weight = input.weight ?? guess.weight;
  const style = input.style ?? guess.style;
  const file = fontFileName(family, weight, style, ext, fields.brand.fonts.map((f) => f.file));
  const font = BrandFontSchema.parse({ file, family, role: input.role ?? "other", weight, style, name: input.fileName.slice(0, 120) });
  const path = fontPath(id, file);
  if (!path) throw new SeriesError("Nombre de archivo no válido.");
  mkdirSync(join(LIBRARY_DIR, id, FONTS_DIR), { recursive: true });
  writeFileSync(path, data);
  saveSeries(id, { ...fields, brand: { ...fields.brand, fonts: [...fields.brand.fonts, font] } });
  return font;
}

export function removeBrandFont(id: string, file: string) {
  const fields = getSeriesFields(id);
  const removed = fields.brand.fonts.filter((f) => f.file === file);
  if (!removed.length) throw new SeriesError("Esa fuente no está en la marca.");
  const path = fontPath(id, file);
  if (path) rmSync(path, { force: true });
  const brand = afterFontRemoved({ ...fields.brand, fonts: fields.brand.fonts.filter((f) => f.file !== file) }, removed, DEFAULT_BRAND);
  saveSeries(id, { ...fields, brand });
}

export function readBrandFont(id: string, file: string): { data: Buffer; type: string } {
  const path = fontPath(id, file);
  const font = getSeries(id)?.brand.fonts.find((f) => f.file === file);
  if (!path || !font) throw new SeriesError("Esa fuente no existe.");
  try {
    const data = readFileSync(path);
    const ext = fontTypeOf(new Uint8Array(data));
    return { data, type: ext ? FONT_TYPES[ext] : "application/octet-stream" };
  } catch {
    throw new SeriesError("Esa fuente no existe.");
  }
}

// ── "Mascota en código" ────────────────────────────────────────────────────────────────────────────────────────
// The code lives in the series library (biblioteca/<series>/mascota.js); the bible keeps its name, description and
// fingerprint on one header line. The browser tests it in its sandbox before saving; the server checks it again
// statically (never runs it) and keeps it as text.
export function setMascot(id: string, input: { source: string; name: string; description: string }): MascotMeta {
  const fields = getSeriesFields(id);
  const source = input.source.replace(/\r\n?/g, "\n").trim();
  const fatal = validateMascotSource(source).find((p) => p.fatal);
  if (fatal) throw new SeriesError(fatal.message);
  const meta = MascotMetaSchema.parse({ file: MASCOT_FILE, name: input.name, description: input.description, sig: mascotSig(source) });
  const path = libraryPath(id, MASCOT_FILE);
  if (!path) throw new SeriesError("Nombre de archivo no válido.");
  mkdirSync(join(LIBRARY_DIR, id), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${source}\n`, "utf8");
  renameSync(tmp, path);
  saveSeries(id, { ...fields, mascot: meta });
  return meta;
}

// The series' mascot with its code; null when it has none (or its file is gone).
export function readMascot(id: string): { meta: MascotMeta; source: string } | null {
  const meta = getSeriesFields(id).mascot;
  const path = meta ? libraryPath(id, MASCOT_FILE) : null;
  if (!meta || !path) return null;
  try {
    return { meta, source: readFileSync(path, "utf8") };
  } catch {
    return null;
  }
}

export function removeMascot(id: string) {
  const fields = getSeriesFields(id);
  removeLibraryFile(id, MASCOT_FILE);
  saveSeries(id, { ...fields, mascot: null });
}

export function createSeries(fields: SeriesFields): string {
  const base = seriesId(fields.name);
  let id = base;
  for (let n = 2; getSeries(id); n++) id = `${base}-${n}`;
  // A new series has no files of its own yet: images, puppet parts, rigs and extra references are uploaded after.
  write(id, { ...fields, mascot: null, brand: { ...fields.brand, logo: "", fonts: [] }, cast: fields.cast.map((m) => ({ ...withoutVideo(m), image: "", puppet: { layers: [] }, rig: { ...m.rig, file: "" }, refs: [] })) });
  return id;
}

export function deleteSeries(id: string) {
  if (!getSeries(id)) throw new SeriesError("Esa serie no existe.");
  if (SERIES.length <= 1) throw new SeriesError("Tiene que quedar al menos una serie.");
  unlinkSync(new URL(`${id}.md`, DIR));
  SERIES = load();
}
