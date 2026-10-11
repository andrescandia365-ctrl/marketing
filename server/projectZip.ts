// "Exportar .zip" / "Importar .zip": a whole project folder as one file, to keep it elsewhere or move it to another
// computer. The zip format is written and read here with node:zlib (no dependency): plain zip32, files stored or
// deflated, no encryption. Import is strict: only the names a project folder uses, no paths that climb out, no
// symlinks, capped sizes (checked against what was really inflated), and a project.json that passes its zod check.
// It always lands in a new folder; an existing project is never overwritten.
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { checkErrorText } from "../shared/errors.ts";
import { PROJECTS_DIR, ProjectError, getProject } from "./projects.ts";

export const MAX_ZIP_FILE = 1024 * 1024 * 1024; // one file, inflated
export const MAX_ZIP_TOTAL = 2 * 1024 * 1024 * 1024; // all files, inflated (and the upload itself)
export const MAX_ZIP_ENTRIES = 4000;

const ID = /^[a-z0-9-]{1,80}$/;
const FILE = /^[a-z0-9][a-z0-9.-]{0,80}$/;
// What a project folder holds at its root besides project.json: pieza.md, stills, clips, voices, music, videos,
// posters and subtitles (the kinds projects.ts serves).
const ROOT_EXT = new Set(["png", "jpg", "webp", "gif", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a", "weba", "md", "srt"]);
// The lyric clock (sync.ts).
const SYNC_FILES = new Set(["grid.json", "words.json", "moves.json", "sync.json", "QA.md", "contact.png"]);
// Text compresses; pictures, video and sound already are, so they are stored as they are.
const DEFLATE_EXT = new Set(["json", "md", "srt", "wav"]);

// A path a project folder uses: "project.json", "toma-01-clip.mp4", "sync/QA.md". Dotfiles (".project.json.tmp", a
// render in progress) and anything else are not part of it.
export function projectPathAllowed(path: string): boolean {
  if (path === "project.json") return true;
  const parts = path.split("/");
  if (parts.length === 1) return FILE.test(path) && ROOT_EXT.has(path.split(".").pop() ?? "");
  return parts.length === 2 && parts[0] === "sync" && SYNC_FILES.has(parts[1]);
}

// A path that could leave the folder it is unpacked into.
export function unsafePath(path: string): boolean {
  if (!path || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return true;
  return path.split("/").some((part) => part === "" || part === "." || part === "..");
}

// ── Writing ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ZipInput = { name: string; data: Uint8Array; date?: Date };

function dosTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const ZIP_EPOCH = new Date(1980, 0, 1);

// Builds the zip one file at a time (local header + data), then the central directory, so the export streams and
// holds one file in memory at a time.
export class ZipWriter {
  private offset = 0;
  private central: Buffer[] = [];
  private count = 0;

  add(file: ZipInput): Buffer {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data.buffer, file.data.byteOffset, file.data.byteLength);
    const deflate = DEFLATE_EXT.has(file.name.split(".").pop() ?? "");
    const packed = deflate ? deflateRawSync(raw) : raw;
    const method = deflate && packed.length < raw.length ? 8 : 0;
    const body = method === 8 ? packed : raw;
    if (raw.length > 0xfffffffe || this.offset + 30 + name.length + body.length > 0xfffffffe || this.count >= 0xfffe) {
      throw new ProjectError("El proyecto es demasiado grande para un .zip: copiá la carpeta a mano.");
    }
    const crc = crc32(raw) >>> 0;
    const when = dosTime(file.date ?? ZIP_EPOCH);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(when.time, 10);
    local.writeUInt16LE(when.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4); // made on Unix, so the mode below is read as one
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(when.time, 12);
    entry.writeUInt16LE(when.date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
    entry.writeUInt32LE(this.offset, 42);
    this.central.push(entry, name);
    this.count++;
    const out = Buffer.concat([local, name, body]);
    this.offset += out.length;
    return out;
  }

  finish(): Buffer {
    const dir = Buffer.concat(this.central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.count, 8);
    end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(this.offset, 16);
    return Buffer.concat([dir, end]);
  }
}

export function writeZip(files: ZipInput[]): Buffer {
  const zip = new ZipWriter();
  return Buffer.concat([...files.map((f) => zip.add(f)), zip.finish()]);
}

// ── Reading ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ZipLimits = { file: number; total: number; entries: number };
const LIMITS: ZipLimits = { file: MAX_ZIP_FILE, total: MAX_ZIP_TOTAL, entries: MAX_ZIP_ENTRIES };
const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

// Junk that zip tools add on their own (Finder, Explorer); skipped without a word.
const junk = (name: string) => name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(name);

// Reads every file of a zip with its checks: no encryption, no zip64, no symlinks, no path that climbs out, sizes
// under the caps (the inflater stops at the declared size, so a zip bomb never grows past it), the CRC matches.
export function readZip(zip: Uint8Array, limits: ZipLimits = LIMITS): { name: string; data: Buffer }[] {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  const bad = (why: string) => new ProjectError(`Ese .zip no se puede abrir: ${why}.`);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw bad("no parece un .zip");
  const count = buf.readUInt16LE(end + 10);
  const dirSize = buf.readUInt32LE(end + 12);
  const dirStart = buf.readUInt32LE(end + 16);
  if (count === 0xffff || dirStart === 0xffffffff || dirSize === 0xffffffff) throw bad("está en formato zip64 (comprimilo de nuevo con menos de 4 GB)");
  if (count > limits.entries) throw bad(`trae más de ${limits.entries} archivos`);
  if (dirStart + dirSize > end) throw bad("está dañado");
  const out: { name: string; data: Buffer }[] = [];
  const seen = new Set<string>();
  let total = 0;
  let p = dirStart;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || buf.readUInt32LE(p) !== 0x02014b50) throw bad("está dañado");
    const madeBy = buf.readUInt16LE(p + 4) >> 8;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const mode = buf.readUInt32LE(p + 38) >>> 16;
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x0800 ? "utf8" : "latin1", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (unsafePath(name.replace(/\/$/, ""))) throw bad(`trae una ruta que sale de la carpeta («${name}»)`);
    if (madeBy === 3 && (mode & 0o170000) === 0o120000) throw bad(`trae un enlace simbólico («${name}»)`);
    if (junk(name)) continue;
    if (flags & 0x0001) throw bad(`«${name}» tiene contraseña`);
    if (method !== 0 && method !== 8) throw bad(`«${name}» está comprimido de una forma que no se lee acá`);
    if (seen.has(name)) throw bad(`«${name}» aparece dos veces`);
    seen.add(name);
    if (size > limits.file) throw bad(`«${name}» pesa más de ${MB(limits.file)}`);
    total += size;
    if (total > limits.total) throw bad(`los archivos suman más de ${MB(limits.total)}`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw bad("está dañado");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) throw bad("está cortado");
    const body = buf.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) {
      if (packed !== size) throw bad(`«${name}» está dañado`);
      data = body; // a view into the upload: no second copy of the videos
    } else {
      try {
        // Never past the declared size: a file that inflates further throws here instead of filling memory.
        data = inflateRawSync(body, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw bad(`«${name}» está dañado`);
      }
    }
    if (data.length !== size || crc32(data) >>> 0 !== crc) throw bad(`«${name}» está dañado`);
    out.push({ name, data });
  }
  return out;
}

// A zip made by hand from the folder ("Comprimir" in Finder or Explorer) puts everything under the folder's name:
// with no project.json at the top, one shared top folder that has it is taken off.
export function unwrapFolder<T extends { name: string }>(files: T[]): T[] {
  if (files.some((f) => f.name === "project.json")) return files;
  const top = files[0]?.name.split("/")[0];
  if (!top || !files.every((f) => f.name.startsWith(`${top}/`)) || !files.some((f) => f.name === `${top}/project.json`)) return files;
  return files.map((f) => ({ ...f, name: f.name.slice(top.length + 1) }));
}

// ── project.json ───────────────────────────────────────────────────────────────────────────────────────────────────

const FileName = z.string().regex(FILE, "no es un nombre de archivo de proyecto");
const MediaFile = z.looseObject({ file: FileName, name: z.string().max(400).default(""), duration: z.number().default(0) });
// The same shape projects.ts writes. Fields added later are optional, and unknown ones are kept as they come.
export const ProjectFileSchema = z.looseObject({
  id: z.string().regex(ID, "no es un nombre de proyecto"),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  state: z.record(z.string(), z.unknown()),
  media: z.record(
    z.string().regex(/^\d{1,4}$/, "no es un número de toma"),
    z.looseObject({ image: FileName.optional(), clip: MediaFile.optional(), voice: MediaFile.optional(), sfx: MediaFile.optional() }),
  ).default({}),
  video: FileName.optional(),
  videos: z.record(z.string().max(20), FileName).optional(),
  music: MediaFile.optional(),
});

// ── On disk ────────────────────────────────────────────────────────────────────────────────────────────────────────

function projectDir(id: string): string {
  if (!ID.test(id)) throw new ProjectError("Ese proyecto no existe.");
  return join(PROJECTS_DIR, id);
}

// The folder's files, as the export puts them: project.json first, then the rest in name order. Anything a project
// does not use (a render in progress, a file the person dropped in) stays out.
export async function projectFiles(id: string): Promise<string[]> {
  await getProject(id);
  const dir = projectDir(id);
  const root = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const sync = await readdir(join(dir, "sync"), { withFileTypes: true }).then(
    (list) => list.filter((e) => e.isFile()).map((e) => `sync/${e.name}`),
    () => [] as string[],
  );
  return ["project.json", ...[...root, ...sync].filter((name) => projectPathAllowed(name) && name !== "project.json").sort()];
}

// The zip, one file at a time.
export async function* exportProjectZip(id: string): AsyncGenerator<Buffer> {
  const dir = projectDir(id);
  const zip = new ZipWriter();
  let total = 0;
  for (const name of await projectFiles(id)) {
    let data: Buffer;
    try {
      data = await readFile(join(dir, name));
    } catch {
      continue; // removed while exporting
    }
    total += data.length;
    if (data.length > MAX_ZIP_FILE || total > MAX_ZIP_TOTAL) {
      throw new ProjectError(`El proyecto pesa más de lo que se puede importar (${MB(MAX_ZIP_TOTAL)}): copiá la carpeta a mano.`);
    }
    yield zip.add({ name, data, date: new Date() });
  }
  yield zip.finish();
}

// A free folder for the imported project: its own id when it is free, else id-2, id-3… (mkdir is the reservation).
async function reserve(base: string): Promise<string> {
  await mkdir(PROJECTS_DIR, { recursive: true });
  const stem = base.slice(0, 74).replace(/-+$/, "") || "importado";
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? stem : `${stem}-${n}`;
    try {
      await mkdir(join(PROJECTS_DIR, id));
      return id;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new ProjectError("No encontré un nombre libre para el proyecto importado.");
}

export async function importProjectZip(zip: Uint8Array): Promise<{ id: string; files: number }> {
  const files = unwrapFolder(readZip(zip));
  for (const f of files) {
    if (!projectPathAllowed(f.name)) throw new ProjectError(`Ese .zip trae un archivo que un proyecto no usa («${f.name}»).`);
  }
  const json = files.find((f) => f.name === "project.json");
  if (!json) throw new ProjectError("Ese .zip no es un proyecto: le falta project.json.");
  let raw: unknown;
  try {
    raw = JSON.parse(json.data.toString("utf8"));
  } catch {
    throw new ProjectError("El project.json del .zip está dañado.");
  }
  const parsed = ProjectFileSchema.safeParse(raw);
  if (!parsed.success) throw new ProjectError(checkErrorText(parsed.error, "El project.json del .zip no sirve"));
  const id = await reserve(parsed.data.id);
  const dir = join(PROJECTS_DIR, id);
  try {
    for (const f of files) {
      if (f.name === "project.json") continue;
      if (f.name.startsWith("sync/")) await mkdir(join(dir, "sync"), { recursive: true });
      await writeFile(join(dir, f.name), f.data);
    }
    // Written last: a folder without it is not a project, so a half-written import never shows up in the list.
    const project = { ...parsed.data, id, updatedAt: new Date().toISOString() };
    await writeFile(join(dir, "project.json"), JSON.stringify(project, null, 2), "utf8");
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { id, files: files.length };
}
