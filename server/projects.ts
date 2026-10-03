// Projects are folders on this computer: proyectos/<id>/ holds project.json (the app's state), pieza.md,
// one image and one clip per shot (toma-01-imagen.png, toma-01-clip.mp4…) and the rendered video. The person
// can open, copy or back up the folder like any other; the app autosaves into it.
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const PROJECTS_DIR = resolve(process.env.PROJECTS_DIR || "proyectos");

const ID = /^[a-z0-9-]{1,80}$/;
const FILE = /^[a-z0-9][a-z0-9.-]{0,80}$/;
const MAX_STATE = 8 * 1024 * 1024;

export class ProjectError extends Error {}

export type MediaFile = { file: string; name: string; duration: number };
// Per shot: the still, the clip, the voice (recorded, uploaded or generated) and a sound effect.
export type MediaRecord = { image?: string; clip?: MediaFile; voice?: MediaFile; sfx?: MediaFile };
export type MediaKind = "image" | "clip" | "voice" | "sfx";

export type ProjectFile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  // The browser's state (brief, story, board, notes…). The server stores it as is.
  state: Record<string, unknown>;
  // Shot index → files in the folder.
  media: Record<string, MediaRecord>;
  video?: string;
  // Lyric videos keep one video per format: video-vertical.webm, video-horizontal.webm.
  videos?: Record<string, string>;
  // One music track for the whole piece.
  music?: MediaFile;
};

export type ProjectSummary = {
  id: string;
  title: string;
  series: string;
  step: string;
  updatedAt: string;
  shots: number;
  hasVideo: boolean;
};

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  weba: "audio/webm",
  md: "text/markdown; charset=utf-8",
  json: "application/json",
};

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "weba",
  // A voice recorded in the browser can come as a WebM file with only an audio track.
  "video/webm": "weba",
};

function extension(type: string, kind: MediaKind | "video" | "music"): string {
  const mime = type.split(";")[0].trim();
  if (kind === "voice" || kind === "sfx" || kind === "music") {
    const ext = AUDIO_TYPES[mime];
    if (ext) return ext;
    throw new ProjectError("Ese archivo no es un audio.");
  }
  const ext = Object.entries(TYPES).find(([, t]) => mime === t)?.[0];
  if (kind === "image" && ext && ["png", "jpg", "webp", "gif"].includes(ext)) return ext;
  if (kind !== "image" && ext && ["mp4", "webm", "mov"].includes(ext)) return ext;
  throw new ProjectError(kind === "image" ? "Ese archivo no es una imagen." : "Ese archivo no es un video.");
}

function folder(id: string): string {
  if (!ID.test(id)) throw new ProjectError("Ese proyecto no existe.");
  return join(PROJECTS_DIR, id);
}

// One write at a time per project, so autosave and uploads never overwrite each other's changes.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
  const run = (locks.get(id) ?? Promise.resolve()).catch(() => undefined).then(work);
  locks.set(id, run);
  return run;
}

async function read(id: string): Promise<ProjectFile> {
  try {
    return JSON.parse(await readFile(join(folder(id), "project.json"), "utf8")) as ProjectFile;
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError("Ese proyecto no existe o su archivo está dañado.");
  }
}

async function write(project: ProjectFile) {
  const dir = folder(project.id);
  const tmp = join(dir, ".project.json.tmp");
  await writeFile(tmp, JSON.stringify(project, null, 2), "utf8");
  await rename(tmp, join(dir, "project.json"));
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export async function createProject(series: string): Promise<ProjectFile> {
  await mkdir(PROJECTS_DIR, { recursive: true });
  const now = new Date();
  const base = `${stamp(now)}-${series.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pieza"}`;
  let id = base;
  for (let n = 2; ; n++) {
    try {
      await mkdir(join(PROJECTS_DIR, id));
      break;
    } catch {
      id = `${base}-${n}`;
    }
  }
  const project: ProjectFile = { id, createdAt: now.toISOString(), updatedAt: now.toISOString(), state: {}, media: {} };
  await write(project);
  return project;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let names: string[];
  try {
    names = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const name of names) {
    if (!ID.test(name)) continue;
    try {
      const p = await read(name);
      const state = p.state as {
        story?: { problem?: string; title?: string };
        lyrics?: { title?: string; artist?: string };
        motion?: { script?: { problem?: string } | null };
        menu?: unknown;
        pieceBrief?: { series?: string };
        step?: string;
        board?: { shots?: unknown[] };
      };
      out.push({
        id: p.id,
        title:
          state.story?.problem ||
          state.story?.title ||
          (state.lyrics?.title && `♪ ${state.lyrics.title}${state.lyrics.artist ? ` · ${state.lyrics.artist}` : ""}`) ||
          (state.motion && `▶ ${state.motion.script?.problem || "Explicativo"}`) ||
          "Sin título todavía",
        series: state.pieceBrief?.series ?? "",
        step: state.step ?? "brief",
        updatedAt: p.updatedAt,
        shots: state.board?.shots?.length ?? 0,
        hasVideo: Boolean(p.video || Object.keys(p.videos ?? {}).length),
      });
    } catch {
      // A folder without a readable project.json is not a project; leave it alone.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string): Promise<ProjectFile> {
  return read(id);
}

export function saveState(id: string, state: Record<string, unknown>, markdown: string | undefined) {
  if (JSON.stringify(state).length > MAX_STATE) throw new ProjectError("El proyecto es demasiado grande para guardarlo.");
  return locked(id, async () => {
    const project = await read(id);
    project.state = state;
    project.updatedAt = new Date().toISOString();
    await write(project);
    if (markdown) await writeFile(join(folder(id), "pieza.md"), markdown, "utf8");
    return project.updatedAt;
  });
}

const SLOT_NAME: Record<MediaKind, string> = { image: "imagen", clip: "clip", voice: "voz", sfx: "efecto" };
const slot = (index: number, kind: MediaKind) => `toma-${String(index + 1).padStart(2, "0")}-${SLOT_NAME[kind]}`;

export function saveMedia(
  id: string,
  index: number,
  kind: MediaKind,
  data: Buffer,
  type: string,
  meta: { name: string; duration: number },
) {
  if (!Number.isInteger(index) || index < 0 || index > 999) throw new ProjectError("Toma no válida.");
  const file = `${slot(index, kind)}.${extension(type, kind)}`;
  return locked(id, async () => {
    const project = await read(id);
    const record = (project.media[index] ??= {});
    const previous = kind === "image" ? record.image : record[kind]?.file;
    await writeFile(join(folder(id), file), data);
    if (previous && previous !== file) await rm(join(folder(id), previous), { force: true });
    if (kind === "image") record.image = file;
    else record[kind] = { file, name: meta.name.slice(0, 200), duration: meta.duration };
    project.updatedAt = new Date().toISOString();
    await write(project);
    return file;
  });
}

export function removeMedia(id: string, index: number, kind: MediaKind) {
  return locked(id, async () => {
    const project = await read(id);
    const record = project.media[index];
    const file = kind === "image" ? record?.image : record?.[kind]?.file;
    if (!record || !file) return;
    await rm(join(folder(id), file), { force: true });
    delete record[kind];
    if (!Object.keys(record).length) delete project.media[index];
    project.updatedAt = new Date().toISOString();
    await write(project);
  });
}

// Media is keyed by shot number. When the board is rewritten the old files stay on disk but are forgotten.
export function clearMedia(id: string) {
  return locked(id, async () => {
    const project = await read(id);
    project.media = {};
    await write(project);
  });
}

export function saveVideo(id: string, data: Buffer, type: string, variant?: "vertical" | "horizontal") {
  const file = `${variant ? `video-${variant}` : "video"}.${extension(type, "video")}`;
  return locked(id, async () => {
    const project = await read(id);
    const old = variant ? project.videos?.[variant] : project.video;
    if (old && old !== file) await rm(join(folder(id), old), { force: true });
    await writeFile(join(folder(id), file), data);
    if (variant) project.videos = { ...project.videos, [variant]: file };
    else project.video = file;
    project.updatedAt = new Date().toISOString();
    await write(project);
    return file;
  });
}

export function saveMusic(id: string, data: Buffer, type: string, meta: { name: string; duration: number }) {
  const file = `musica.${extension(type, "music")}`;
  return locked(id, async () => {
    const project = await read(id);
    if (project.music && project.music.file !== file) await rm(join(folder(id), project.music.file), { force: true });
    await writeFile(join(folder(id), file), data);
    project.music = { file, name: meta.name.slice(0, 200), duration: meta.duration };
    project.updatedAt = new Date().toISOString();
    await write(project);
    return project.music;
  });
}

export function removeMusic(id: string) {
  return locked(id, async () => {
    const project = await read(id);
    if (!project.music) return;
    await rm(join(folder(id), project.music.file), { force: true });
    delete project.music;
    await write(project);
  });
}

export async function readProjectFile(id: string, name: string): Promise<{ data: Buffer; type: string }> {
  if (!FILE.test(name) || name === "project.json") throw new ProjectError("Ese archivo no existe.");
  const ext = name.split(".").pop() ?? "";
  try {
    return { data: await readFile(join(folder(id), name)), type: TYPES[ext] ?? "application/octet-stream" };
  } catch {
    throw new ProjectError("Ese archivo no existe.");
  }
}

export function deleteProject(id: string) {
  return locked(id, () => rm(folder(id), { recursive: true, force: true }));
}
