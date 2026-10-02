import type { Board, Brief, Menu, SeriesInfo, Shot, Status, Story, TopicIdea } from "../../shared/schema.ts";
import type { SeriesFields } from "../../shared/series.ts";

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
};
