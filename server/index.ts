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
import { listSeries } from "./series.ts";
import { listTools } from "./tools.ts";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof WriterError || error instanceof KimiError) return c.json({ error: error.message }, 502);
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
  });
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
