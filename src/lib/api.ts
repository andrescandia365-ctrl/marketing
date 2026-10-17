import type { MascotMeta } from "../../shared/mascot.ts";
import type { PromptOnly } from "../../shared/handoff.ts";
import type {
  Board,
  BrandFromWeb,
  Brief,
  HookVariant,
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
import type { NoteMerge } from "../../shared/motionNote.ts";
import type { MotionReview } from "../../shared/motionQuality.ts";
import type { BackgroundPrompts, LyricElement, LyricLanguage, LyricLine, LyricPlate, LyricStyle, SecondLanguage } from "../../shared/lyrics.ts";
import type { SyncDoc } from "../../shared/clock.ts";
import type { KindAverage, UsageEntry } from "../../shared/usage.ts";
import type { Brand, CastMember, PuppetLayer, SeriesFields, SeriesType, TextStyle } from "../../shared/series.ts";
import type { RoomCard } from "../../shared/room.ts";
import type { Reference } from "../../shared/reference.ts";
import type { ScreenDevice } from "../../shared/screenBatch.ts";
import type { ClipFit, ExplainerKind, ExplainerVideo } from "../../shared/adsFromExplainer.ts";
import type { PastedCopy } from "../../shared/adsHandoff.ts";
import type { AdCombo, AdsState, Batch, HookStatic, ClipRecord, Cta, Hook, Meat, MeatFormat, Offer, PieceSpeaker, PieceStatus, RankedHook, ReviewFlag, CombineRules } from "../../shared/ads.ts";
import type { BrandFont } from "../../shared/brandFonts.ts";

// Demucs on this computer (Modelos → Demucs).
export type DemucsStatus = { ready: boolean; command: string; model: string; songs: number; envBin: boolean };

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
export type FinalJob = { id: string; project: string; formats: string[]; current: string; progress: number; done: boolean; error: string; files: string[]; subtitles?: string[] };
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
async function upload<T>(path: string, body: Blob, type: string, method: "PUT" | "POST" = "PUT"): Promise<T> {
  const res = await fetch(path, { method, headers: { "Content-Type": type || "application/octet-stream" }, body });
  const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
  if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
  return data as T;
}

const enc = encodeURIComponent;
export const libraryFileUrl = (seriesId: string, file: string, version = 0) =>
  `/api/series/${enc(seriesId)}/files/${enc(file)}${version ? `?v=${version}` : ""}`;
export const projectFileUrl = (id: string, file: string) => `/api/projects/${enc(id)}/files/${enc(file)}`;

export type EpisodesView = {
  episodes: { n: number; title: string; moves: string[] }[];
  next: number;
  moves: { name: string; episodes: number[]; inPlaybook: boolean; propose: boolean }[];
  repeatMin: number;
  drift: string;
};

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

type Demo = { demo: boolean; pasted?: boolean };

// "Sin clave" (shared/handoff.ts): a writer request as data, so the same request can run on the writer, give the
// prompt for claude.ai, or read a reply pasted from there.
export type WriterAsk<T> = { path: string; body: Record<string, unknown>; result?: T };
const writerAsk = <T>(path: string, body: Record<string, unknown>): WriterAsk<T> => ({ path, body });
export const asks = {
  menu: (brief: Brief) => writerAsk<Menu & Demo>("/api/menu", { brief }),
  story: (brief: Brief, topics: TopicIdea[], note = "", projectId = "") =>
    writerAsk<{ story: Story } & Demo>("/api/story", { brief, topics, note, projectId }),
  reviseStory: (brief: Brief, story: Story, note: string, projectId = "") =>
    writerAsk<{ story: Story } & Demo>("/api/story/revise", { brief, story, note, projectId }),
  board: (brief: Brief, story: Story) => writerAsk<{ board: Board } & Demo>("/api/board", { brief, story }),
  storyHooks: (brief: Brief, story: Story) => writerAsk<{ variants: HookVariant[] } & Demo>("/api/story/hooks", { brief, story }),
  reviseBoard: (brief: Brief, story: Story, board: Board, note: string, shotNotes: { index: number; note: string }[]) =>
    writerAsk<{ board: Board } & Demo>("/api/board/revise", { brief, story, board, note, shotNotes }),
  rewriteShot: (brief: Brief, story: Story, board: Board, index: number, note: string) =>
    writerAsk<{ shot: Shot } & Demo>("/api/shot/rewrite", { brief, story, board, index, note }),
  // Explainers: the script, the director's note (sample mode: { demo: true }, nothing changes) and one review round.
  // By copy and paste the review's contact sheets are attached in claude.ai, so only their formats go.
  motion: (brief: Brief, target: number | null, layers: number) =>
    writerAsk<{ script: MotionScript } & Demo>("/api/motion", { brief, target, layers }),
  motionRevise: (brief: Brief, script: MotionScript, note: string, layers: number) =>
    writerAsk<{ demo: true } | (NoteMerge & { demo: false; pasted?: boolean })>("/api/motion/revise", { brief, script, note, layers }),
  motionReview: (
    brief: Brief,
    scenes: string,
    facts: string,
    sheets: { format: "vertical" | "horizontal"; jpeg?: string }[],
    round: number,
    earlier: string,
  ) => writerAsk<{ review: MotionReview } & Demo>("/api/motion/review", { brief, scenes, facts, sheets, round, earlier }),
};
// Runs the request: on the writer (or the sample), or with `reply` as the answer pasted from claude.ai.
export const sendAsk = <T>(ask: WriterAsk<T>, reply?: string) =>
  call<T>(ask.path, reply === undefined ? ask.body : { ...ask.body, handoff: { mode: "paste", reply } });
// The exact text to paste into claude.ai for this request.
export const askPrompt = (ask: WriterAsk<unknown>) => call<PromptOnly>(ask.path, { ...ask.body, handoff: { mode: "prompt" } });

// Publicidad's writer requests, for copy and paste with claude.ai ("Sin clave", shared/adsHandoff.ts). `part` is which
// prompt of a request split in several; the prompt's answer says how many there are.
type Parted = { part?: number; parts?: number };
export type PartPrompt = PromptOnly & Parted & { keys?: string[] };
type PieceBody = { levels: number[]; count: number; seconds: number; tool: string; language: "es" | "en"; part: number };
export const adsAsks = {
  hooks: (series: string, body: PieceBody) => writerAsk<{ state: AdsState; hooks: Hook[]; note: string } & Demo & Parted>(`/api/ads/${enc(series)}/hooks`, body),
  meats: (series: string, body: PieceBody & { formats: MeatFormat[] }) =>
    writerAsk<{ state: AdsState; meats: Meat[]; note: string } & Demo & Parted>(`/api/ads/${enc(series)}/meats`, body),
  ctas: (series: string, body: PieceBody) => writerAsk<{ state: AdsState; ctas: Cta[]; note: string } & Demo & Parted>(`/api/ads/${enc(series)}/ctas`, body),
  clipText: (series: string, name: string, transcript: string) =>
    writerAsk<{ state: AdsState; clip: ClipRecord } & Demo>(`/api/ads/${enc(series)}/clips/text`, { name, transcript }),
  clipSplit: (series: string, clipId: string) => writerAsk<{ state: AdsState; clip: ClipRecord } & Demo>(`/api/ads/${enc(series)}/clips/${enc(clipId)}/split`, {}),
  review: (series: string) => writerAsk<{ flags: ReviewFlag[]; note: string } & Demo>(`/api/ads/${enc(series)}/review`, {}),
  copies: (series: string, ads: AdCombo[], part: number) =>
    writerAsk<{ copies: Record<string, PastedCopy>; keys: string[] } & Parted>(`/api/ads/${enc(series)}/copies`, { ads, part }),
};

export type AdsView = { state: AdsState; transcription: boolean; folder: string; ranking: RankedHook[] };
export const adsFileUrl = (series: string, file: string) => `/api/ads/${enc(series)}/files/${file.split("/").map(enc).join("/")}`;

type PiecePatch = Partial<Pick<Hook, "status" | "text" | "onScreenText" | "visualPrompt" | "videoPrompt" | "note">> & {
  level?: number;
  levels?: number[];
  format?: MeatFormat;
  speaker?: PieceSpeaker | null;
};

// Publicidad (Método 50-5-3).
export const ads = {
  load: (series: string) => call<AdsView>(`/api/ads/${enc(series)}`),
  saveOffer: (series: string, offer: Offer) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/offer`, { offer }, "PUT"),
  saveSettings: (series: string, weeklyLimit: number) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/settings`, { weeklyLimit }, "PUT"),
  uploadClip: async (series: string, file: File, language: "es" | "en") => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("language", language);
    const res = await fetch(`/api/ads/${enc(series)}/clips`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { state: AdsState; clip: ClipRecord } & Demo;
  },
  clipFromText: (series: string, name: string, transcript: string) =>
    call<{ state: AdsState; clip: ClipRecord } & Demo>(`/api/ads/${enc(series)}/clips/text`, { name, transcript }),
  removeClip: (series: string, id: string) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/clips/${enc(id)}`, undefined, "DELETE"),
  importMetrics: (series: string, csv: string, replace = true) =>
    call<{ state: AdsState; ranking: RankedHook[]; rows: number; withId: number; found: string[]; missing: string[] }>(`/api/ads/${enc(series)}/metrics`, { csv, replace }),
  hooks: (series: string, body: { levels: number[]; count: number; seconds: number; tool: string; language: "es" | "en" }) =>
    call<{ state: AdsState; hooks: Hook[]; note: string } & Demo>(`/api/ads/${enc(series)}/hooks`, body),
  organicHook: (series: string, text: string, level: number, seconds: number, note: string) =>
    call<{ state: AdsState; hook: Hook }>(`/api/ads/${enc(series)}/hooks/organic`, { text, level, seconds, note }),
  meats: (series: string, body: { levels: number[]; formats: MeatFormat[]; count: number; seconds: number; tool: string; language: "es" | "en" }) =>
    call<{ state: AdsState; meats: Meat[]; note: string } & Demo>(`/api/ads/${enc(series)}/meats`, body),
  ctas: (series: string, body: { levels: number[]; count: number; seconds: number; tool: string; language: "es" | "en" }) =>
    call<{ state: AdsState; ctas: Cta[]; note: string } & Demo>(`/api/ads/${enc(series)}/ctas`, body),
  patchPiece: (series: string, id: string, patch: PiecePatch) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/pieces/${enc(id)}`, patch, "PATCH"),
  setStatus: (series: string, ids: string[], status: PieceStatus) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/pieces`, { ids, status }, "PATCH"),
  removePiece: (series: string, id: string) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/pieces/${enc(id)}`, undefined, "DELETE"),
  review: (series: string) => call<{ flags: ReviewFlag[]; note: string } & Demo>(`/api/ads/${enc(series)}/review`, {}),
  uploadPieceMedia: (series: string, id: string, kind: "image" | "clip" | "voice", file: Blob, meta?: { name: string; duration: number }) =>
    upload<{ state: AdsState; file: string }>(
      `/api/ads/${enc(series)}/pieces/${enc(id)}/media/${kind}${meta ? `?name=${enc(meta.name)}&duration=${meta.duration}` : ""}`,
      file,
      file.type,
    ),
  removePieceMedia: (series: string, id: string, kind: "image" | "clip" | "voice") =>
    call<{ state: AdsState }>(`/api/ads/${enc(series)}/pieces/${enc(id)}/media/${kind}`, undefined, "DELETE"),
  explainerVideos: (series: string, project: string) =>
    call<{ videos: ExplainerVideo[]; title: string }>(`/api/ads/${enc(series)}/explainers/${enc(project)}`),
  fromExplainer: (
    series: string,
    body: { project: string; file: string; duration: number; start: number; pieceId?: string; create?: { kind: ExplainerKind; seconds: number; text: string } },
  ) => call<{ state: AdsState; pieceId: string; fit: ClipFit }>(`/api/ads/${enc(series)}/pieces/from-explainer`, body),
  dropRender: (series: string, id: string) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/pieces/${enc(id)}/render`, undefined, "DELETE"),
  uploadRender: (series: string, id: string, video: Blob) => upload<{ state: AdsState; file: string }>(`/api/ads/${enc(series)}/pieces/${enc(id)}/render`, video, video.type),
  createBatch: (series: string, body: { seconds: number; mode: "full" | "stage"; rules: CombineRules; ads: AdCombo[]; copies?: Record<string, PastedCopy> }) =>
    call<{ state: AdsState; batch: Batch } & Demo>(`/api/ads/${enc(series)}/batches`, body),
  uploadAd: (series: string, batch: string, adId: string, video: Blob) =>
    upload<{ file: string }>(`/api/ads/${enc(series)}/batches/${enc(batch)}/ads/${enc(adId)}`, video, video.type),
  batchCsv: (series: string, batch: string) => call<{ file: string; csv: string }>(`/api/ads/${enc(series)}/batches/${enc(batch)}/csv`, {}),
  removeBatch: (series: string, batch: string) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/batches/${enc(batch)}`, undefined, "DELETE"),
  // "Versión estática" of the hooks.
  patchStatic: (series: string, hookId: string, patch: Partial<Omit<HookStatic, "picture" | "exports">>) =>
    call<{ state: AdsState }>(`/api/ads/${enc(series)}/statics/${enc(hookId)}`, patch, "PATCH"),
  uploadStaticPicture: (series: string, hookId: string, file: Blob, w: number, h: number) =>
    upload<{ state: AdsState; file: string }>(`/api/ads/${enc(series)}/statics/${enc(hookId)}/picture?w=${w}&h=${h}`, file, file.type),
  removeStaticPicture: (series: string, hookId: string) => call<{ state: AdsState }>(`/api/ads/${enc(series)}/statics/${enc(hookId)}/picture`, undefined, "DELETE"),
  saveStaticExport: (series: string, hookId: string, file: string, png: Blob) =>
    upload<{ file: string }>(`/api/ads/${enc(series)}/statics/${enc(hookId)}/exports/${enc(file)}`, png, "image/png"),
  finishStaticExports: (series: string, hookId: string, files: string[]) =>
    call<{ state: AdsState; csv: string }>(`/api/ads/${enc(series)}/statics/${enc(hookId)}/exports`, { files }),
};

export const api = {
  status: () => call<Status>("/api/status"),
  menu: (brief: Brief, reply?: string) => sendAsk(asks.menu(brief), reply),
  room: (series: string, except = "") =>
    call<{ cards: RoomCard[] }>(`/api/room?series=${encodeURIComponent(series)}&except=${encodeURIComponent(except)}`),
  story: (brief: Brief, topics: TopicIdea[], note = "", projectId = "", reply?: string) =>
    sendAsk(asks.story(brief, topics, note, projectId), reply),
  reviseStory: (brief: Brief, story: Story, note: string, projectId = "", reply?: string) =>
    sendAsk(asks.reviseStory(brief, story, note, projectId), reply),
  board: (brief: Brief, story: Story, reply?: string) => sendAsk(asks.board(brief, story), reply),
  storyHooks: (brief: Brief, story: Story, reply?: string) => sendAsk(asks.storyHooks(brief, story), reply),
  reviseBoard: (brief: Brief, story: Story, board: Board, note: string, shotNotes: { index: number; note: string }[], reply?: string) =>
    sendAsk(asks.reviseBoard(brief, story, board, note, shotNotes), reply),
  rewriteShot: (brief: Brief, story: Story, board: Board, index: number, note: string, reply?: string) =>
    sendAsk(asks.rewriteShot(brief, story, board, index, note), reply),
  image: (provider: string, prompt: string, style: string, aspect: Brief["format"], beat: string, look = "") =>
    call<{ dataUrl: string }>("/api/image", { provider, prompt, style, aspect, beat, look }),
  seriesFields: (id: string) => call<{ fields: SeriesFields }>(`/api/series/${encodeURIComponent(id)}`),
  saveSeries: (id: string, fields: SeriesFields) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${encodeURIComponent(id)}`, { fields }, "PUT"),
  createSeries: (fields: SeriesFields) => call<{ id: string; series: SeriesInfo[] }>("/api/series", { fields }),
  deleteSeries: (id: string) => call<{ series: SeriesInfo[] }>(`/api/series/${encodeURIComponent(id)}`, undefined, "DELETE"),
  saveSeriesStyle: (id: string, textStyle: TextStyle) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(id)}/style`, { textStyle }, "PUT"),

  upsertCast: (seriesId: string, member: CastMember) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(member.id)}`, member, "PUT"),
  addCorrespondent: (seriesId: string, member: CastMember) =>
    call<{ series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/correspondent`, member),
  uploadPuppetLayer: (seriesId: string, castId: string, index: number, image: Blob, role: string, name = "") =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(
      `/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet/${index}?role=${enc(role)}&name=${enc(name)}`,
      image,
      image.type,
    ),
  replacePuppet: (seriesId: string, castId: string, layers: { role: string; name: string; png: string }[]) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet`, { layers }, "PUT"),
  // "Analizar un anuncio que funciona": the picture goes for this request only; the answer is the written teardown.
  teardownAd: (series: string | null, picture: string, note: string) =>
    call<{ reference: Reference | null; note: string; demo: boolean }>("/api/reference/teardown", { series, picture, note }),
  brandFromWeb: (url: string, series: string | null, type?: SeriesType) =>
    call<BrandFromWeb>("/api/brand/from-web", { url, series: series ?? undefined, type, own: true }),
  arrangePuppet: (seriesId: string, castId: string, layers: Pick<PuppetLayer, "file" | "role" | "pivot" | "place">[]) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet`, { layers }, "PATCH"),
  removePuppetLayer: (seriesId: string, castId: string, index: number) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/puppet/${index}`, undefined, "DELETE"),
  uploadRig: (seriesId: string, castId: string, file: Blob) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/rig`, file, "model/gltf-binary"),
  // "Videos de la app funcionando": a real screen's recording (raw body, up to 200 MB), with what the browser measured,
  // then its poster frame; or remove it.
  uploadScreenVideo: (seriesId: string, castId: string, file: Blob, info: { seconds: number; width: number; height: number; name: string }) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(
      `/api/series/${enc(seriesId)}/cast/${enc(castId)}/video?seconds=${info.seconds}&width=${info.width}&height=${info.height}&name=${enc(info.name)}`,
      file,
      file.type || "application/octet-stream",
    ),
  uploadScreenVideoPoster: (seriesId: string, castId: string, image: Blob) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/video/poster`, image, image.type || "image/jpeg"),
  removeScreenVideo: (seriesId: string, castId: string) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/video`, undefined, "DELETE"),
  // An extra reference image (a crop of the sheet, or a loose view): its own @ reference, named by the server.
  addCastRef: (seriesId: string, castId: string, image: Blob, label: string) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(
      `/api/series/${enc(seriesId)}/cast/${enc(castId)}/refs?label=${enc(label)}`,
      image,
      image.type,
      "POST",
    ),
  removeCastRef: (seriesId: string, castId: string, ref: string) =>
    call<{ member: CastMember; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/refs/${enc(ref)}`, undefined, "DELETE"),
  // "Subir muchas pantallas": one screenshot → one pending real screen (member and image saved together).
  addScreen: (seriesId: string, image: Blob, file: string, name: string, device?: ScreenDevice) =>
    upload<{ member: CastMember; series: SeriesInfo[] }>(
      `/api/series/${enc(seriesId)}/screens?file=${enc(file)}&name=${enc(name)}${device ? `&device=${device}` : ""}`,
      image,
      image.type || "application/octet-stream",
    ),
  confirmScreens: (seriesId: string, screens: { id: string; name: string; ref: string; identity: string; device?: ScreenDevice }[], removed: string[]) =>
    call<{ cast: CastMember[]; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/screens/confirm`, { screens, removed }),
  nameScreen: (series: string | null, picture: string, file: string) =>
    call<{ screen: { name: string; shows: string; device?: ScreenDevice } | null; note: string; demo: boolean }>("/api/screens/name", { series, picture, file }),
  uploadCastImage: (seriesId: string, castId: string, image: Blob) =>
    upload<{ file: string; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/cast/${enc(castId)}/image`, image, image.type),

  projects: () => call<{ projects: ProjectSummary[] }>("/api/projects"),
  createProject: (series: string) => call<{ id: string }>("/api/projects", { series }),
  project: (id: string) => call<ProjectData>(`/api/projects/${enc(id)}`),
  saveProject: (id: string, state: Record<string, unknown>, markdown?: string) =>
    call<{ updatedAt: string }>(`/api/projects/${enc(id)}`, { state, markdown }, "PUT"),
  deleteProject: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}`, undefined, "DELETE"),
  // "Exportar .zip": a download link (the server streams the folder); "Importar .zip" always makes a new project.
  exportProjectUrl: (id: string) => `/api/projects/${enc(id)}/export`,
  importProject: async (zip: Blob) => {
    const res = await fetch("/api/projects/import", { method: "POST", headers: { "Content-Type": "application/zip" }, body: zip });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { id: string; files: number };
  },
  uploadMedia: (id: string, index: number, kind: MediaKind, file: Blob, meta?: { name: string; duration: number }) =>
    upload<{ file: string }>(
      `/api/projects/${enc(id)}/media/${index}/${kind}${meta ? `?name=${enc(meta.name)}&duration=${meta.duration}` : ""}`,
      file,
      file.type,
    ),
  removeMedia: (id: string, index: number, kind: MediaKind) =>
    call<{ ok: true }>(`/api/projects/${enc(id)}/media/${index}/${kind}`, undefined, "DELETE"),
  // The app's pencil sketch of a shot as a PNG (boceto-app-NN.png), and dropping those of shots that are gone.
  saveAppSketch: (id: string, index: number, png: Blob) => upload<{ file: string }>(`/api/projects/${enc(id)}/sketches/${index}`, png, "image/png"),
  pruneAppSketches: (id: string, keep: number) => call<{ removed: string[] }>(`/api/projects/${enc(id)}/sketches?keep=${keep}`, undefined, "DELETE"),
  clearMedia: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}/media`, undefined, "DELETE"),
  // "Imagen fija": one export into the project folder, and removing the last export's files not written again.
  saveStillExport: (id: string, name: string, image: Blob) => upload<{ file: string }>(`/api/projects/${enc(id)}/still/${enc(name)}`, image, image.type),
  pruneStillExports: (id: string, keep: string[]) => call<{ removed: string[] }>(`/api/projects/${enc(id)}/still/prune`, { keep }),
  // With a key, the studio's prompt for Opus goes to the writer; the reply is in the same paste format.
  stillAsk: (prompt: string) => call<{ demo: true } | { demo: false; text: string }>("/api/still/ask", { prompt }),
  uploadMusic: (id: string, file: Blob, meta: { name: string; duration: number }) =>
    upload<{ music: MediaFileRecord }>(
      `/api/projects/${enc(id)}/music?name=${enc(meta.name)}&duration=${meta.duration}`,
      file,
      file.type,
    ),
  removeMusic: (id: string) => call<{ ok: true }>(`/api/projects/${enc(id)}/music`, undefined, "DELETE"),
  // A generated voice for one line, as an mp3.
  speak: async (text: string, voice: string, language: "es" | "en", emotion = ""): Promise<Blob> => {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, language, emotion }),
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
    sheets: { format: "vertical" | "horizontal"; jpeg?: string }[],
    round: number,
    earlier: string,
    reply?: string,
  ) => sendAsk(asks.motionReview(brief, scenes, facts, sheets, round, earlier), reply),
  startFinal: (id: string, formats: ("vertical" | "horizontal")[], origin: string) =>
    call<{ job: FinalJob }>(`/api/projects/${enc(id)}/final`, { formats, origin }),
  finalJob: (job: string) => call<{ job: FinalJob }>(`/api/final/${enc(job)}`),
  // An explainer's track (the file as uploaded) → Demucs on this computer → the kicks of its drums stem.
  trackKicks: (track: Blob) =>
    upload<{ kicks: { kicks: number[]; downbeats: number[]; bpm: number; medianErrorMs: number; usable: boolean }; cached: boolean }>(
      "/api/motion/kicks",
      track,
      track.type,
    ),
  // Demucs on this computer, looked up again; and a four-second test run (Modelos → Demucs).
  demucs: () => call<{ demucs: DemucsStatus; ffmpeg: boolean }>("/api/tools/demucs"),
  testDemucs: () => call<{ seconds: number; command: string }>("/api/tools/demucs/test", {}),
  saveDemucsBin: (bin: string | null) => call<{ demucs: DemucsStatus; ffmpeg: boolean }>("/api/tools/demucs", { bin }, "PUT"),
  // "Episodios estudiados": PLAYBOOK.md §2.6 (only answers from this computer).
  episodes: () => call<EpisodesView & Demo>("/api/episodes"),
  draftEpisode: (summary: string) => call<{ n: number; entry: string } & Demo>("/api/episodes/draft", { summary }),
  addEpisode: (entry: string) => call<{ n: number; record: "recorded" | "patched" | "left"; view: EpisodesView }>("/api/episodes", { entry, ok: true }),
  // Modelos (only answers from this computer).
  settings: () => call<SettingsView>("/api/settings"),
  saveKey: (name: string, key: string | null) => call<SettingsView>("/api/settings/key", { name, key }, "PUT"),
  saveWriter: (provider: string, model: string) => call<SettingsView>("/api/settings/writer", { provider, model }, "PUT"),
  saveVision: (provider: string | null, model: string | null) => call<SettingsView>("/api/settings/vision", { provider, model }, "PUT"),
  saveEffort: (effort: string) => call<SettingsView>("/api/settings/effort", { effort }, "PUT"),
  models: (provider: string) => call<{ models: ListedModel[] }>(`/api/settings/models?provider=${enc(provider)}`),
  efforts: (model: string) => call<{ efforts: string[] }>(`/api/settings/efforts?model=${enc(model)}`),
  testModel: (provider: string, model: string, vision: boolean) => call<{ result: string }>("/api/settings/test", { provider, model, vision }),
  usage: () => call<{ entries: UsageEntry[]; averages: KindAverage[] }>("/api/settings/usage"),
  // "Fuentes propias de la marca": one font file per call; family, role, weight and style are optional (guessed).
  uploadBrandFont: (seriesId: string, file: File, face: { family?: string; role?: string; weight?: number; style?: string }) => {
    const q = new URLSearchParams({ name: file.name });
    for (const [k, v] of Object.entries(face)) if (v !== undefined && v !== "") q.set(k, String(v));
    return upload<{ font: BrandFont; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/fonts?${q}`, file, "application/octet-stream");
  },
  removeBrandFont: (seriesId: string, file: string) => call<{ series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/fonts/${enc(file)}`, undefined, "DELETE"),
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
  // voiceOnly: the transcription hears the vocal stem Demucs splits from the song.
  syncLyrics: async (song: Blob, name: string, lines: string[], seconds: string[], language: LyricLanguage, voiceOnly = false) => {
    const form = new FormData();
    form.append("audio", song, name);
    if (voiceOnly) form.append("voice", "demucs");
    form.append("lines", JSON.stringify(lines));
    form.append("seconds", JSON.stringify(seconds));
    form.append("language", language);
    const res = await fetch("/api/lyrics/sync", { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    // matched of total: the lyric words the transcription really heard.
    return data as { lines: LyricLine[]; heard: number; matched: number; total: number };
  },
  // Each word's loudness on the vocal stem Demucs splits from the song (never the master); null where it is silent.
  lyricLevels: async (song: Blob, name: string, words: { start: number; end: number }[]) => {
    const form = new FormData();
    form.append("audio", song, name);
    form.append("words", JSON.stringify(words));
    const res = await fetch("/api/lyrics/levels", { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { levels: (number | null)[] };
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
  motion: (brief: Brief, target: number | null, layers: number, reply?: string) => sendAsk(asks.motion(brief, target, layers), reply),
  // "Nota del director": sample mode (no AI key) changes nothing.
  // "Que la IA escriba la animación": the same prompt the person copies for Opus, sent to the writer.
  // "Mascota en código": the series' mascot (null: none), saving it after the sandbox test, removing it, and the
  // writer's answer to the editor's prompt when there is a key.
  mascot: (seriesId: string) => call<{ mascot: (MascotMeta & { source: string }) | null }>(`/api/series/${enc(seriesId)}/mascot`),
  saveMascot: (seriesId: string, mascot: { source: string; name: string; description: string }) =>
    call<{ mascot: MascotMeta; series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/mascot`, mascot, "PUT"),
  deleteMascot: (seriesId: string) => call<{ series: SeriesInfo[] }>(`/api/series/${enc(seriesId)}/mascot`, undefined, "DELETE"),
  mascotCode: (prompt: string) => call<{ demo: true } | { demo: false; code: string; name: string; description: string }>("/api/mascot/code", { prompt }),
  sceneCode: (prompt: string) => call<{ demo: true } | { demo: false; code: string; note: string }>("/api/motion/code", { prompt }),
  motionRevise: (brief: Brief, script: MotionScript, note: string, layers: number, reply?: string) =>
    sendAsk(asks.motionRevise(brief, script, note, layers), reply),
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
  // The .srt next to a video the browser rendered (same base name); empty text removes it.
  saveSubtitles: (id: string, video: string, srt: string) =>
    upload<{ file: string }>(`/api/projects/${enc(id)}/subtitles?video=${encodeURIComponent(video)}`, new Blob([srt], { type: "text/plain" }), "text/plain"),
  // An explainer scene's voice heard with word times (whisper-1), for its subtitles.
  voiceWords: async (voice: Blob, name: string, text: string, language: LyricLanguage) => {
    const form = new FormData();
    form.append("audio", voice, name);
    form.append("text", text);
    form.append("language", language);
    const res = await fetch("/api/voice/words", { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
    if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
    return data as { words: { word: string; start: number; end: number }[]; duration: number };
  },
};
