import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import {
  BoardWireSchema,
  BriefSchema,
  StoryWireSchema,
  TopicIdeaSchema,
  normalizeBoard,
  normalizeStory,
  type Status,
} from "../shared/schema.ts";
import {
  WriterError,
  currentWriter,
  proposeMenu,
  reviseBoard,
  reviseStory,
  rewriteShot,
  writeBoard,
  writeStory,
} from "./claude.ts";
import { KimiError } from "./kimi.ts";
import { DEMO_BOARD, DEMO_MENU, DEMO_STORY } from "./demo.ts";
import { getProvider, listProviders } from "./images/index.ts";
import { CastMemberSchema, SeriesFieldsSchema, TextStyleSchema } from "../shared/series.ts";
import {
  PROJECTS_DIR,
  ProjectError,
  clearMedia,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  readProjectFile,
  removeMedia,
  saveMedia,
  saveState,
  saveVideo,
} from "./projects.ts";
import {
  SeriesError,
  createSeries,
  deleteSeries,
  getSeriesFields,
  listSeries,
  readLibraryFile,
  saveSeries,
  saveTextStyle,
  setCastImage,
  upsertCastMember,
} from "./series.ts";
import { listTools } from "./tools.ts";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof WriterError || error instanceof KimiError) return c.json({ error: error.message }, 502);
  if (error instanceof SeriesError || error instanceof ProjectError) return c.json({ error: error.message }, 400);
  if (error instanceof z.ZodError) return c.json({ error: "Al pedido le faltaban datos." }, 400);
  console.error(error);
  return c.json({ error: error.message || "Algo salió mal." }, 500);
});

// Story and board come back from the browser; parse them with the same shapes the writer returns.
const StoryInput = StoryWireSchema.transform(normalizeStory);
const BoardInput = BoardWireSchema.transform(normalizeBoard);
const demo = () => currentWriter() === null;

app.get("/api/status", (c) => {
  const writer = currentWriter();
  return c.json<Status>({
    writer: writer && { label: writer.label, model: writer.model },
    imageProviders: listProviders(),
    tools: listTools(),
    series: listSeries(),
    projectsDir: PROJECTS_DIR,
  });
});

// Series bibles, edited from the app.
async function seriesFields(c: { req: { json: () => Promise<unknown> } }) {
  const parsed = z.object({ fields: SeriesFieldsSchema }).safeParse(await c.req.json());
  if (!parsed.success) throw new SeriesError(parsed.error.issues[0]?.message ?? "Faltan datos de la serie.");
  return parsed.data.fields;
}

app.get("/api/series/:id", (c) => c.json({ fields: getSeriesFields(c.req.param("id")) }));

app.put("/api/series/:id", async (c) => {
  saveSeries(c.req.param("id"), await seriesFields(c));
  return c.json({ series: listSeries() });
});

app.post("/api/series", async (c) => {
  const id = createSeries(await seriesFields(c));
  return c.json({ id, series: listSeries() });
});

app.put("/api/series/:id/style", async (c) => {
  const { textStyle } = z.object({ textStyle: TextStyleSchema }).parse(await c.req.json());
  saveTextStyle(c.req.param("id"), textStyle);
  return c.json({ series: listSeries() });
});

// The series' fixed cast and its approved images.
app.put("/api/series/:id/cast/:castId", async (c) => {
  const member = CastMemberSchema.parse({ ...(await c.req.json()), id: c.req.param("castId") });
  upsertCastMember(c.req.param("id"), member);
  return c.json({ series: listSeries() });
});

app.put("/api/series/:id/cast/:castId/image", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const file = setCastImage(c.req.param("id"), c.req.param("castId"), data, c.req.header("content-type") ?? "");
  return c.json({ file, series: listSeries() });
});

app.get("/api/series/:id/files/:name", (c) => {
  const { data, type } = readLibraryFile(c.req.param("id"), c.req.param("name"));
  return c.body(new Uint8Array(data), 200, { "Content-Type": type, "Cache-Control": "no-cache" });
});

// Projects: one folder per piece on this computer (see projects.ts).
app.get("/api/projects", async (c) => c.json({ projects: await listProjects() }));

app.post("/api/projects", async (c) => {
  const { series } = z.object({ series: z.string() }).parse(await c.req.json());
  const project = await createProject(series);
  return c.json({ id: project.id });
});

app.get("/api/projects/:id", async (c) => {
  const p = await getProject(c.req.param("id"));
  return c.json({ id: p.id, state: p.state, media: p.media, video: p.video ?? null, updatedAt: p.updatedAt });
});

app.put("/api/projects/:id", async (c) => {
  const { state, markdown } = z
    .object({ state: z.record(z.string(), z.unknown()), markdown: z.string().optional() })
    .parse(await c.req.json());
  return c.json({ updatedAt: await saveState(c.req.param("id"), state, markdown) });
});

app.delete("/api/projects/:id", async (c) => {
  await deleteProject(c.req.param("id"));
  return c.json({ ok: true });
});

const Kind = z.enum(["image", "clip"]);

app.put("/api/projects/:id/media/:index/:kind", async (c) => {
  const index = Number(c.req.param("index"));
  const kind = Kind.parse(c.req.param("kind"));
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const file = await saveMedia(c.req.param("id"), index, kind, data, c.req.header("content-type") ?? "", {
    name: c.req.query("name") ?? "",
    duration: Number(c.req.query("duration")) || 0,
  });
  return c.json({ file });
});

app.delete("/api/projects/:id/media/:index/:kind", async (c) => {
  await removeMedia(c.req.param("id"), Number(c.req.param("index")), Kind.parse(c.req.param("kind")));
  return c.json({ ok: true });
});

app.delete("/api/projects/:id/media", async (c) => {
  await clearMedia(c.req.param("id"));
  return c.json({ ok: true });
});

app.put("/api/projects/:id/video", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  const file = await saveVideo(c.req.param("id"), data, c.req.header("content-type") ?? "");
  return c.json({ file });
});

app.get("/api/projects/:id/files/:name", async (c) => {
  const { data, type } = await readProjectFile(c.req.param("id"), c.req.param("name"));
  return c.body(new Uint8Array(data), 200, { "Content-Type": type, "Cache-Control": "no-cache" });
});

app.delete("/api/series/:id", (c) => {
  deleteSeries(c.req.param("id"));
  return c.json({ series: listSeries() });
});

app.post("/api/menu", async (c) => {
  const { brief } = z.object({ brief: BriefSchema }).parse(await c.req.json());
  if (demo()) return c.json({ ...DEMO_MENU, demo: true });
  return c.json({ ...(await proposeMenu(brief)), demo: false });
});

app.post("/api/story", async (c) => {
  const { brief, topics } = z
    .object({ brief: BriefSchema, topics: z.array(TopicIdeaSchema).min(1).max(4) })
    .parse(await c.req.json());
  if (demo()) return c.json({ story: DEMO_STORY, demo: true });
  return c.json({ story: await writeStory(brief, topics), demo: false });
});

app.post("/api/story/revise", async (c) => {
  const { brief, story, note } = z
    .object({ brief: BriefSchema, story: StoryInput, note: z.string().min(1) })
    .parse(await c.req.json());
  if (demo()) return c.json({ story, demo: true });
  return c.json({ story: await reviseStory(brief, story, note), demo: false });
});

app.post("/api/board", async (c) => {
  const { brief, story } = z.object({ brief: BriefSchema, story: StoryInput }).parse(await c.req.json());
  if (demo()) return c.json({ board: DEMO_BOARD, demo: true });
  return c.json({ board: await writeBoard(brief, story), demo: false });
});

app.post("/api/board/revise", async (c) => {
  const { brief, story, board, note, shotNotes } = z
    .object({
      brief: BriefSchema,
      story: StoryInput,
      board: BoardInput,
      note: z.string(),
      shotNotes: z.array(z.object({ index: z.number().int().min(0), note: z.string().min(1) })),
    })
    .parse(await c.req.json());
  if (!note.trim() && shotNotes.length === 0) return c.json({ error: "Escribí al menos una nota." }, 400);
  if (demo()) return c.json({ board, demo: true });
  return c.json({ board: await reviseBoard(brief, story, board, note, shotNotes), demo: false });
});

app.post("/api/shot/rewrite", async (c) => {
  const { brief, story, board, index, note } = z
    .object({
      brief: BriefSchema,
      story: StoryInput,
      board: BoardInput,
      index: z.number().int().min(0),
      note: z.string().min(1),
    })
    .parse(await c.req.json());
  if (!board.shots[index]) return c.json({ error: "Esa toma ya no existe." }, 400);
  if (demo()) return c.json({ shot: board.shots[index], demo: true });
  return c.json({ shot: await rewriteShot(brief, story, board, index, note), demo: false });
});

app.post("/api/image", async (c) => {
  const req = z
    .object({
      provider: z.string(),
      prompt: z.string().min(1),
      style: z.string(),
      aspect: z.enum(["vertical", "horizontal"]),
      beat: z.string(),
    })
    .parse(await c.req.json());
  const provider = getProvider(req.provider);
  if (!provider) return c.json({ error: `El generador de imágenes "${req.provider}" no está conectado.` }, 400);
  return c.json({ dataUrl: await provider.generate(req) });
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port }, () => {
  const writer = currentWriter();
  console.log(`API on http://localhost:${port} · ${writer ? `${writer.label} (${writer.model})` : "sin clave de IA (modo de muestra)"}`);
});
