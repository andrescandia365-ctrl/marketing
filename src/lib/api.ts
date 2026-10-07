import type {
  Board,
  BrandFromWeb,
  Brief,
  ImageReview,
  Menu,
  ProductShot,
  SegmentEdit,
  ListedModel,
  SeriesInfo,
  SettingsView,
  Sheet,
  SheetTemplate,
  Shot,
  Status,
  Story,
  TopicIdea,
} from "../../shared/schema.ts";
import type { MotionScript } from "../../shared/motion.ts";
import type { MotionReview } from "../../shared/motionQuality.ts";
import type { BackgroundPrompts, LyricElement, LyricLanguage, LyricLine, LyricPlate, LyricStyle, SecondLanguage } from "../../shared/lyrics.ts";
import type { SyncDoc } from "../../shared/clock.ts";
import type { Brand, CastMember, PuppetLayer, SeriesFields, TextStyle } from "../../shared/series.ts";
import type { RoomCard } from "../../shared/room.ts";

export type ProjectSummary = {
  id: string;
  title: string;
  series: string;
  step: string;
  updatedAt: string;
  shots: number;
  hasVideo: boolean;
};
// The final render (render.mjs + ffmpeg) as the server reports it.
export type FinalJob = { id: string; project: string; formats: string[]; current: string; progress: number; done: boolean; error: string; files: string[] };
export type MediaFileRecord = { file: string; name: string; duration: number };
export type MediaRecord = { image?: string; clip?: MediaFileRecord; voice?: MediaFileRecord; sfx?: MediaFileRecord };
export type MediaKind = "image" | "clip" | "voice" | "sfx";
export type ProjectData = {
  id: string;
  state: Record<string, unknown>;
  media: Record<string, MediaRecord>;
  video: string | null;
  music: MediaFileRecord | null;
  updatedAt: string;
};

// Uploads a file as the raw request body (images and clips can be large; no base64).
async function upload<T>(path: string, body: Blob, type: string): Promise<T> {
  const res = await fetch(path, { method: "PUT", headers: { "Content-Type": type || "application/octet-stream" }, body });
  const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
  if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
  return data as T;
}

const enc = encodeURIComponent;
export const libraryFileUrl = (seriesId: string, file: string, version = 0) =>
  `/api/series/${enc(seriesId)}/files/${enc(file)}${version ? `?v=${version}` : ""}`;
export const projectFileUrl = (id: string, file: string) => `/api/projects/${enc(id)}/files/${enc(file)}`;

async function call<T>(path: string, body?: unknown, method?: "PUT" | "PATCH" | "DELETE"): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
  if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
  return data as T;
}

type Demo = { demo: boolean };

export const api = {
  status: () => call<Status>("/api/status"),
  menu: (brief: Brief) => call<Menu & Demo>("/api/menu", { brief }),
  room: (series: string, except = "") =>
    call<{ cards: RoomCard[] }>(`/api/room?series=${encodeURIComponent(series)}&except=${encodeURIComponent(except)}`),
  story: (brief: Brief, topics: TopicIdea[], note = "", projectId = "") =>
    call<{ story: Story } & Demo>("/api/story", { brief, topics, note, projectId }),
  reviseStory: (brief: Brief, story: Story, note: string, projectId = "") =>
    call<{ story: Story } & Demo>("/api/story/revise", { brief, story, note, projectId }),
  board: (brief: Brief, story: Story) => call<{ board: Board } & Demo>("/api/board", { brief, story }),
  reviseBoard: (brief: Brief, story: Story, board: Board, note: string, shotNotes: { index: number; note: string }[]) =>
    call<{ board: Board } & Demo>("/api/board/revise", { brief, story, board, note, shotNotes }),
  rewriteShot: (brief: Brief, story: Story, board: Board, index: number, note: string) =>
    call<{ shot: Shot } & Demo>("/api/shot/rewrite", { brief, story, board, index, note }),
  image: (provider: string, prompt: string, style: string, aspect: Brief["format"], beat: string) =>
    call<{ dataUrl: string }>("/api/image", { provider, prompt, style, aspect, beat }),
  seriesFields: (id: string) => call<{ fields: SeriesFields }>(`/api/series/${encodeURIComponent(id)}`),
  saveSeries: (id: string, fields: SeriesFields) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${encodeURIComponent(id)}`, { fields }, "PUT"),
  createSeries: (fields: SeriesFields) => call<{ id: string; series: SeriesInfo[] }>("/api/series", { fields }),
  deleteSeries: (id: string) => call<{ series: SeriesInfo[] }>(`/api/series/${encodeURIComponent(id)}`, undefined, "DELETE"),
  saveSeriesStyle: (id: string, textStyle: TextStyle) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(id)}/style`, { textStyle }, "PUT"),

  upsertCast: (seriesId: string, member: CastMember) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(member.id)}`, member, "PUT"),
  uploadPuppetLayer: (seriesId: string, castId: string, index: number, image: Blob, role: string, name = "") =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(
      `/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet/${index}?role=${enc(role)}&name=${enc(name)}`,
      image,
      image.type,
    ),
  replacePuppet: (seriesId: string, castId: string, layers: { role: string; name: string; png: string }[]) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet`, { layers }, "PUT"),
  brandFromWeb: (url: string, series: string | null) => call<BrandFromWeb>("/api/brand/from-web", { url, series: series ?? undefined, own: true }),
  arrangePuppet: (seriesId: string, castId: string, layers: Pick<PuppetLayer, "file" | "role" | "pivot" | "place">[]) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet`, { layers }, "PATCH"),
  removePuppetLayer: (seriesId: string, castId: string, index: number) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet/${index}`, undefined, "DELETE"),
  uploadRig: (seriesId: string, castId: string, file: Blob) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/rig`, file, "model/gltf-binary"),
  uploadCastImage: (seriesId: string, castId: string, image: Blob) =>
    upload<{ file: string; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/image`, image, image.type),

  projects: () => call<{ projects: ProjectSummary[] }>("/api/projects"),
  createProject: (series: string) => call<{ id: string }>("/api/projects", { series }),
  project: (id: string) => call<ProjectData>(`/api/projects/${enc(id)}`),
  saveProject: (id: string, state: Record<string, unknown>, markdown?: string) =>
    call<{ updatedAt: string }>(`/api/projects/${enc(id)}`, { state, markdown }, "PUT"),
  deleteProject: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}`, undefined, "DELETE"),
  uploadMedia: (id: string, index: number, kind: MediaKind, file: Blob, meta?: { name: string; duration: number }) =>
    upload<{ file: string }>(
      `/api/projects/${enc(id)}/media/${index}/${kind}${meta ? `?name=${enc(meta.name)}&duration=${meta.duration}` : ""}`,
      file,
      file.type,
    ),
  removeMedia: (id: string, index: number, kind: MediaKind) =>
    call<{ ok: true }>(`/api/projects/${enc(id)}/media/${index}/${kind}`, undefined, "DELETE"),
  clearMedia: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}/media`, undefined, "DELETE"),
  uploadMusic: (id: string, file: Blob, meta: { name: string; duration: number }) =>
    upload<{ music: MediaFileRecord }>(
      `/api/projects/${enc(id)}/music?name=${enc(meta.name)}&duration=${meta.duration}`,
      file,
      file.type,
    ),
  removeMusic: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}/music`, undefined, "DELETE"),
  // A generated voice for one line, as an mp3.
  speak: async (text: string, voice: string, language: "es" | "en"): Promise<Blob> => {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, language }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "El servidor no respondió." }));
      throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    }
    return res.blob();
  },
  motionReview: (
    brief: Brief,
    scenes: string,
    facts: string,
    sheets: { format: "vertical" | "horizontal"; jpeg: string }[],
    round: number,
    earlier: string,
  ) => call<{ review: MotionReview } & Demo>("/api/motion/review", { brief, scenes, facts, sheets, round, earlier }),
  startFinal: (id: string, formats: ("vertical" | "horizontal")[], origin: string) =>
    call<{ job: FinalJob }>(`/api/projects/${enc(id)}/final`, { formats, origin }),
  finalJob: (job: string) => call<{ job: FinalJob }>(`/api/final/${enc(job)}`),
  // Modelos (only answers from this computer).
  settings: () => call<SettingsView>("/api/settings"),
  saveKey: (name: string, key: string | null) => call<SettingsView>("/api/settings/key", { name, key }, "PUT"),
  saveWriter: (provider: string, model: string) => call<SettingsView>("/api/settings/writer", { provider, model }, "PUT"),
  saveVision: (provider: string | null, model: string | null) => call<SettingsView>("/api/settings/vision", { provider, model }, "PUT"),
  saveEffort: (effort: string) => call<SettingsView>("/api/settings/effort", { effort }, "PUT"),
  models: (provider: string) => call<{ models: ListedModel[] }>(`/api/settings/models?provider=${enc(provider)}`),
  efforts: (model: string) => call<{ efforts: string[] }>(`/api/settings/efforts?model=${enc(model)}`),
  testModel: (provider: string, model: string, vision: boolean) => call<{ result: string }>("/api/settings/test", { provider, model, vision }),
  uploadLogo: (seriesId: string, image: Blob) =>
    upload<{ file: string; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/logo`, image, image.type),
  saveLyricStyle: (id: string, lyricStyle: LyricStyle) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(id)}/lyric-style`, { lyricStyle }, "PUT"),
  // Automatic sync: the song is transcribed with word times and matched to the lines.
  readClock: async (id: string) => {
    const res = await fetch(`/api/projects/${enc(id)}/sync`);
    if (res.status === 404) return null;
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { sync: SyncDoc; qa: string };
  },
  buildClock: async (
    id: string,
    input: { lyrics: string; moves: string; language: LyricLanguage; master: Blob | null; drums: Blob | null; vocals: Blob | null },
  ) => {
    const form = new FormData();
    form.append("lyrics", input.lyrics);
    form.append("moves", input.moves);
    form.append("language", input.language);
    form.append("fps", "24");
    if (input.master) form.append("master", input.master, "master.wav");
    if (input.drums) form.append("drums", input.drums, "drums.wav");
    if (input.vocals) form.append("vocals", input.vocals, "vocals.wav");
    const res = await fetch(`/api/projects/${enc(id)}/sync`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { sync: SyncDoc; qa: string };
  },
  critiqueClock: (id: string, brand: Brand) =>
    call<{
      score: number;
      passed: boolean;
      worst: { t: number; problem: string; fix: string }[];
      applied: SyncDoc;
      qa: string;
    }>(`/api/projects/${enc(id)}/sync/critique`, { brand }),
  syncLyrics: async (song: Blob, name: string, lines: string[], seconds: string[], language: LyricLanguage) => {
    const form = new FormData();
    form.append("audio", song, name);
    form.append("lines", JSON.stringify(lines));
    form.append("seconds", JSON.stringify(seconds));
    form.append("language", language);
    const res = await fetch("/api/lyrics/sync", { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { lines: LyricLine[]; heard: number };
  },
  lyricIdeas: (series: string, title: string, artist: string, lines: string[]) =>
    call<{ palette: string[]; mood: "calm" | "lively"; keywords: { line: number; words: string[] }[]; note: string } & Demo>(
      "/api/lyrics/ideas",
      { series, title, artist, lines },
    ),
  secondLines: (series: string, lines: string[], mode: "romanize" | "translate", language: SecondLanguage = "es", other = "") =>
    call<{ lines: string[]; note: string } & Demo>("/api/lyrics/second", { series, lines, mode, language, other }),
  lyricElements: (series: string, title: string, artist: string, lines: string[]) =>
    call<{ elements: Omit<LyricElement, "id" | "slot">[]; note: string } & Demo>("/api/lyrics/elements", {
      series,
      title,
      artist,
      lines,
    }),
  lyricPlates: (series: string, title: string, artist: string, lines: string[], note: string, plates: LyricPlate[]) =>
    call<{ plates: LyricPlate[]; idea: string; note: string } & Demo>("/api/lyrics/plates", {
      series,
      title,
      artist,
      lines,
      note,
      plates,
    }),
  lyricBackgrounds: (
    series: string,
    tool: string,
    title: string,
    lines: string[],
    style: { palette: string[]; mood: string },
    format: "vertical" | "horizontal",
  ) =>
    call<BackgroundPrompts & Demo>("/api/lyrics/backgrounds", {
      series,
      tool,
      title,
      lines,
      palette: style.palette,
      mood: style.mood,
      format,
    }),
  motion: (brief: Brief, target: number | null, layers: number) =>
    call<{ script: MotionScript } & Demo>("/api/motion", { brief, target, layers }),
  sheet: (series: string, template: SheetTemplate, details: Record<string, string>, age: number) =>
    call<Sheet & Demo>("/api/sheet", { series, template, details, age }),
  productShot: (brief: Brief) => call<ProductShot & Demo>("/api/product-shot", { brief }),
  segmentEdit: (brief: Brief, shot: Shot, note: string) => call<SegmentEdit & Demo>("/api/shot/segment", { brief, shot, note }),
  review: (
    brief: Brief,
    shot: { title: string; action: string; prompt: string; what: "image" | "clip" },
    setups: { name: string; identity: string }[],
    picture: string,
    refs: { label: string; jpeg: string }[],
  ) => call<ImageReview & Demo>("/api/review", { brief, shot, setups, picture, refs }),
  saveVideo: (id: string, video: Blob, variant?: "vertical" | "horizontal") =>
    upload<{ file: string }>(`/api/projects/${enc(id)}/video${variant ? `?variant=${variant}` : ""}`, video, video.type),
};
