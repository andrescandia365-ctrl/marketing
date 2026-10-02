import type { Board, Brief, Menu, SeriesInfo, Shot, Status, Story, TopicIdea } from "../../shared/schema.ts";
import type { CastMember, SeriesFields, TextStyle } from "../../shared/series.ts";

export type ProjectSummary = {
  id: string;
  title: string;
  series: string;
  step: string;
  updatedAt: string;
  shots: number;
  hasVideo: boolean;
};
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

async function call<T>(path: string, body?: unknown, method?: "PUT" | "DELETE"): Promise<T> {
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
  story: (brief: Brief, topics: TopicIdea[]) => call<{ story: Story } & Demo>("/api/story", { brief, topics }),
  reviseStory: (brief: Brief, story: Story, note: string) =>
    call<{ story: Story } & Demo>("/api/story/revise", { brief, story, note }),
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
  saveVideo: (id: string, video: Blob) => upload<{ file: string }>(`/api/projects/${enc(id)}/video`, video, video.type),
};
