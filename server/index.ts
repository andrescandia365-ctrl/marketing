import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  BoardWireSchema,
  BriefSchema,
  SHEET_TEMPLATES,
  ShotWireSchema,
  StoryWireSchema,
  TopicIdeaSchema,
  normalizeBoard,
  normalizeShot,
  normalizeStory,
  type BrandFromWeb,
  type BrandSuggestion,
  type SettingsView,
  type Status,
} from "../shared/schema.ts";
import {
  WriterError,
  backgroundPrompts,
  currentWriter,
  lyricElements,
  lyricIdeas,
  lyricPlates,
  motionScript,
  reviseMotion,
  brandFromSite,
  proposeMenu,
  productShot,
  reviewMotion,
  listModels,
  testModel,
  claudeEfforts,
  referenceSheet,
  reviewPicture,
  segmentEdit,
  reviseBoard,
  reviseStory,
  rewriteShot,
  secondLines,
  writeBoard,
  writeStory,
  hookVariants,
} from "./claude.ts";
import { KimiError } from "./kimi.ts";
import { LyricsError, autoSyncAvailable, hearSong } from "./lyrics.ts";
import { BrandWebError, fetchLogo, guessBrand, readBrandSite } from "./brandWeb.ts";
import { EMPTY_BRIEF } from "../shared/example.ts";
import { ClockError } from "../shared/clock.ts";
import { roomBrief } from "../shared/room.ts";
import { buildProjectSync, critiqueProject, loadSync } from "./sync.ts";
import { checkDemucsBin, demucsAvailable, demucsStatus, separate, speechWav, tryDemucs } from "./demucs.ts";
import { decodeWav, fitKicks } from "../shared/clock.ts";
import { withLevels, wordLevels, wordSpans } from "../shared/lyricAct.ts";
import { BrandSchema, DEFAULT_BRAND } from "../shared/series.ts";
import { DEFAULT_LYRIC_STYLE, LYRIC_LANGUAGES, SECOND_LANGUAGES, LyricStyleSchema, alignLyrics, cleanElements, cleanIdeas } from "../shared/lyrics.ts";
import { buildPlates, cleanPlates } from "../shared/plates.ts";
import { DEMO_BOARD, DEMO_MENU, demoHookVariants, demoStory, demoMotion, demoMotionReview } from "./demo.ts";
import { RenderError, ffmpegAvailable, getFinal, startFinal } from "./finalRender.ts";
import {
  EFFORTS,
  OTHER_KEYS,
  PROVIDERS,
  SettingsError,
  claudeEffort,
  keyOf,
  keyVarsOf,
  labelOf,
  mask,
  modelOf,
  providerIds,
  ready,
  setEnv,
  visionChoice,
  writerChoice,
  type ProviderId,
} from "./settings.ts";
import { getProvider, listProviders } from "./images/index.ts";
import { CastMemberSchema, PUPPET_MAX_LAYERS, PUPPET_ROLES, PuppetPlaceSchema, SeriesFieldsSchema, TextStyleSchema } from "../shared/series.ts";
import {
  PROJECTS_DIR,
  ProjectError,
  clearMedia,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listRoom,
  readProjectFile,
  removeMedia,
  removeMusic,
  saveMedia,
  saveAppSketch,
  pruneAppSketches,
  saveMusic,
  saveState,
  saveVideo,
  saveSubtitles,
} from "./projects.ts";
import { DEFAULT_VOICE, VoiceError, speak, voiceAvailable } from "./voice.ts";
import {
  SeriesError,
  createSeries,
  deleteSeries,
  getSeriesFields,
  listSeries,
  readLibraryFile,
  saveLyricStyle,
  saveSeriesFromApp,
  setPuppetLayer,
  replacePuppetLayers,
  arrangePuppet,
  setRigFile,
  removePuppetLayer,
  setLogo,
  saveTextStyle,
  setCastImage,
  upsertCastMember,
  addCorrespondent,
  addCastRef,
  removeCastRef,
} from "./series.ts";
import { listTools, referenceLimit } from "./tools.ts";
import { AdsError } from "./ads.ts";
import { checkErrorText } from "../shared/errors.ts";
import { MAX_ZIP_TOTAL, exportProjectZip, importProjectZip } from "./projectZip.ts";
import { adsRoutes } from "./adsRoutes.ts";
import { usageScope, usageView } from "./usage.ts";
import { usageKind } from "../shared/usage.ts";
import { MotionScriptInput } from "../shared/motionNote.ts";
import type { MotionScript } from "../shared/motion.ts";

const app = new Hono();

// Each writer request is logged under the kind of the route that asked (Modelos → Tokens por pedido).
app.use("/api/*", (c, next) => usageScope.run({ kind: usageKind(c.req.path) }, next));

app.onError((error, c) => {
  if (error instanceof WriterError || error instanceof KimiError) return c.json({ error: error.message }, 502);
  if (error instanceof SeriesError || error instanceof ProjectError || error instanceof RenderError || error instanceof SettingsError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof VoiceError || error instanceof LyricsError) return c.json({ error: error.message }, 502);
  if (error instanceof ClockError || error instanceof BrandWebError || error instanceof AdsError) return c.json({ error: error.message }, 400);
  // Which field and what is wrong with it: an old project with a renamed field says which one.
  if (error instanceof z.ZodError) return c.json({ error: checkErrorText(error) }, 400);
  console.error(error);
  return c.json({ error: error.message || "Algo salió mal." }, 500);
});

// Story and board come back from the browser; parse them with the same shapes the writer returns.
// Pieces saved before a field existed get its empty value: problem and practices, each line's emotion, each shot's
// timeline, and (for the writers' room) an empty runner, tease and canon.
type Loose = Record<string, unknown> & { topics?: { lines?: Record<string, unknown>[] }[]; shots?: Record<string, unknown>[] };
function fillOld(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as Loose;
  return {
    ...v,
    ...(v.topics && { topics: v.topics.map((t) => ({ moves: [], ...t, lines: t.lines?.map((l) => ({ emotion: "", ...l })) })) }),
    ...(v.shots && { shots: v.shots.map((s) => ({ timeline: [], screenAt: "", ...s })) }),
  };
}
function fillStory(value: unknown): unknown {
  const filled = fillOld(value);
  if (!filled || typeof filled !== "object") return filled;
  const v = filled as Record<string, unknown> & { runner?: Record<string, unknown> };
  const raw = v.runner;
  return {
    ...v,
    runner: {
      bit: typeof raw?.bit === "string" ? raw.bit : "",
      open: typeof raw?.open === "string" ? raw.open : "",
      middle: typeof raw?.middle === "string" ? raw.middle : "",
      tag: typeof raw?.tag === "string" ? raw.tag : "",
    },
    tease: typeof v.tease === "string" ? v.tease : "",
    canon: Array.isArray(v.canon) ? v.canon : [],
  };
}
const StoryInput = z.preprocess(
  fillStory,
  StoryWireSchema.extend({
    problem: z.string().default(""),
    practices: StoryWireSchema.shape.practices.default([]),
    runner: StoryWireSchema.shape.runner.default({ bit: "", open: "", middle: "", tag: "" }),
    tease: z.string().default(""),
    canon: StoryWireSchema.shape.canon.default([]),
  }),
).transform(normalizeStory);
const TopicInput = TopicIdeaSchema.extend({ problem: z.string().default("") });
const BoardInput = z.preprocess(fillOld, BoardWireSchema).transform(normalizeBoard);
const demo = () => currentWriter() === null;

// Publicidad (Método 50-5-3): its own routes, under /api/ads/:series.
adsRoutes(app);

app.get("/api/status", (c) => {
  const writer = currentWriter();
  return c.json<Status>({
    writer: writer && { label: writer.label, model: writer.model },
    imageProviders: listProviders(),
    tools: listTools(),
    series: listSeries(),
    projectsDir: PROJECTS_DIR,
    voice: { available: voiceAvailable(), defaultVoice: DEFAULT_VOICE },
    lyrics: { autoSync: autoSyncAvailable() },
    render: { ffmpeg: ffmpegAvailable(), demucs: demucsAvailable() },
  });
});

// Series bibles, edited from the app.
async function seriesFields(c: { req: { json: () => Promise<unknown> } }) {
  const parsed = z.object({ fields: SeriesFieldsSchema }).safeParse(await c.req.json());
  if (!parsed.success) throw new SeriesError(checkErrorText(parsed.error, "Faltan datos de la serie"));
  return parsed.data.fields;
}

app.get("/api/series/:id", (c) => c.json({ fields: getSeriesFields(c.req.param("id")) }));

app.put("/api/series/:id", async (c) => {
  saveSeriesFromApp(c.req.param("id"), await seriesFields(c));
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

app.put("/api/series/:id/logo", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  const file = setLogo(c.req.param("id"), data, c.req.header("content-type") ?? "");
  return c.json({ file, series: listSeries() });
});

app.put("/api/series/:id/lyric-style", async (c) => {
  const { lyricStyle } = z.object({ lyricStyle: LyricStyleSchema }).parse(await c.req.json());
  saveLyricStyle(c.req.param("id"), lyricStyle);
  return c.json({ series: listSeries() });
});

// The series' fixed cast and its approved images.
app.put("/api/series/:id/cast/:castId", async (c) => {
  const member = CastMemberSchema.parse({ ...(await c.req.json()), id: c.req.param("castId") });
  upsertCastMember(c.req.param("id"), member);
  return c.json({ series: listSeries() });
});

// "Sumar al elenco como corresponsal": the correspondent the writer invented joins the cast as the series' own.
app.post("/api/series/:id/correspondent", async (c) => {
  const member = CastMemberSchema.parse(await c.req.json());
  addCorrespondent(c.req.param("id"), member);
  return c.json({ series: listSeries() });
});

app.put("/api/series/:id/cast/:castId/image", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const file = setCastImage(c.req.param("id"), c.req.param("castId"), data, c.req.header("content-type") ?? "");
  return c.json({ file, series: listSeries() });
});

// Extra reference images of a cast member: a crop of its sheet (the face) or a loose view, each its own @ reference.
app.post("/api/series/:id/cast/:castId/refs", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const member = addCastRef(c.req.param("id"), c.req.param("castId"), data, c.req.header("content-type") ?? "", c.req.query("label") ?? "", referenceLimit());
  return c.json({ member, series: listSeries() });
});

app.delete("/api/series/:id/cast/:castId/refs/:ref", (c) => {
  const member = removeCastRef(c.req.param("id"), c.req.param("castId"), c.req.param("ref"));
  return c.json({ member, series: listSeries() });
});

// The parts of a character's puppet (motion graphics): upload one (index = its place; one past the end adds), remove one.
app.put("/api/series/:id/cast/:castId/puppet/:index", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const role = z.enum(PUPPET_ROLES).parse(c.req.query("role") ?? "extra");
  const name = (c.req.query("name") ?? "").slice(0, 80);
  const member = setPuppetLayer(
    c.req.param("id"),
    c.req.param("castId"),
    Number(c.req.param("index")),
    data,
    c.req.header("content-type") ?? "",
    role,
    name,
  );
  return c.json({ member, series: listSeries() });
});

// Replaces the whole puppet at once (the front figure, split into head and body).
app.put("/api/series/:id/cast/:castId/puppet", async (c) => {
  const body = z
    .object({
      layers: z
        .array(
          z.object({
            role: z.enum(PUPPET_ROLES),
            name: z.string().max(80).default(""),
            png: z.string().max(12_000_000),
          }),
        )
        .min(1)
        .max(PUPPET_MAX_LAYERS),
    })
    .parse(await c.req.json());
  const parts = body.layers.map((layer) => {
    const raw = layer.png.replace(/^data:image\/\w+;base64,/, "").trim();
    return { data: Buffer.from(raw, "base64"), role: layer.role, name: layer.name };
  });
  const member = replacePuppetLayers(c.req.param("id"), c.req.param("castId"), parts);
  return c.json({ member, series: listSeries() });
});

// "Armar a mano": the place, part and turning point of each existing layer.
app.patch("/api/series/:id/cast/:castId/puppet", async (c) => {
  const { layers } = z
    .object({
      layers: z
        .array(
          z.object({
            file: z.string().max(120),
            role: z.enum(PUPPET_ROLES),
            pivot: z.tuple([z.number().min(-2).max(3), z.number().min(-2).max(3)]).nullable(),
            place: PuppetPlaceSchema.nullable(),
          }),
        )
        .max(PUPPET_MAX_LAYERS),
    })
    .parse(await c.req.json());
  const member = arrangePuppet(c.req.param("id"), c.req.param("castId"), layers);
  return c.json({ member, series: listSeries() });
});

app.delete("/api/series/:id/cast/:castId/puppet/:index", (c) => {
  const member = removePuppetLayer(c.req.param("id"), c.req.param("castId"), Number(c.req.param("index")));
  return c.json({ member, series: listSeries() });
});

// The rigged humanoid (GLB with clips). Mesh2Motion or a Mixamo FBX converted to GLB. Playback is local.
app.put("/api/series/:id/cast/:castId/rig", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const member = setRigFile(c.req.param("id"), c.req.param("castId"), data);
  return c.json({ member, series: listSeries() });
});

app.get("/api/series/:id/files/:name", (c) => {
  const { data, type } = readLibraryFile(c.req.param("id"), c.req.param("name"));
  return c.body(new Uint8Array(data), 200, { "Content-Type": type, "Cache-Control": "no-cache" });
});

// Projects: one folder per piece on this computer (see projects.ts).
app.get("/api/projects", async (c) => c.json({ projects: await listProjects() }));

// The writers' room: plants, unpaid loops and canon from the other saved pieces of a series.
app.get("/api/room", async (c) => {
  const series = z.string().min(1).max(80).parse(c.req.query("series"));
  const except = z.string().max(80).parse(c.req.query("except") ?? "");
  return c.json({ cards: await listRoom(series, except) });
});

app.post("/api/projects", async (c) => {
  const { series } = z.object({ series: z.string() }).parse(await c.req.json());
  const project = await createProject(series);
  return c.json({ id: project.id });
});

app.get("/api/projects/:id", async (c) => {
  const p = await getProject(c.req.param("id"));
  return c.json({
    id: p.id,
    state: p.state,
    media: p.media,
    video: p.video ?? null,
    music: p.music ?? null,
    updatedAt: p.updatedAt,
  });
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

const Kind = z.enum(["image", "clip", "voice", "sfx"]);

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

// The app's pencil sketch of a shot, drawn by the browser, for pieza.md (boceto-app-NN.png).
app.put("/api/projects/:id/sketches/:index", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  const file = await saveAppSketch(c.req.param("id"), Number(c.req.param("index")), data);
  return c.json({ file });
});

app.delete("/api/projects/:id/sketches", async (c) => {
  const count = z.coerce.number().int().min(0).max(99).parse(c.req.query("keep") ?? "0");
  return c.json({ removed: await pruneAppSketches(c.req.param("id"), count) });
});

app.delete("/api/projects/:id/media", async (c) => {
  await clearMedia(c.req.param("id"));
  return c.json({ ok: true });
});

app.put("/api/projects/:id/music", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const music = await saveMusic(c.req.param("id"), data, c.req.header("content-type") ?? "", {
    name: c.req.query("name") ?? "",
    duration: Number(c.req.query("duration")) || 0,
  });
  return c.json({ music });
});

app.delete("/api/projects/:id/music", async (c) => {
  await removeMusic(c.req.param("id"));
  return c.json({ ok: true });
});

// A generated voice for one line. The browser stores it in the project like a recorded one.
app.post("/api/voice", async (c) => {
  const { text, voice, language, emotion } = z
    .object({
      text: z.string().trim().min(1).max(1500),
      voice: z.string().max(40).default(""),
      language: z.enum(["es", "en"]),
      // A long direction is cut, never a reason to lose the voice.
      emotion: z.string().default("").transform((e) => e.slice(0, 120)),
    })
    .parse(await c.req.json());
  const audio = await speak(text, voice, language, emotion);
  return c.body(new Uint8Array(audio), 200, { "Content-Type": "audio/mpeg" });
});

// A motion-graphics explainer script. target: seconds, or null to let the writer choose.
app.post("/api/motion", async (c) => {
  const { brief, target, layers } = z
    .object({ brief: BriefSchema, target: z.number().int().min(10).max(120).nullable(), layers: z.number().int().min(0).max(12).default(0) })
    .parse(await c.req.json());
  if (demo()) return c.json({ script: demoMotion(brief, target), demo: true });
  return c.json({ script: await motionScript(brief, target, layers), demo: false });
});

// "Nota del director" for an explainer: the whole script back with only what the note asks changed (mergeNote keeps
// the rest). Sample mode changes nothing and says so.
app.post("/api/motion/revise", async (c) => {
  const { brief, script, note, layers } = z
    .object({
      brief: BriefSchema,
      script: MotionScriptInput,
      note: z.string().trim().min(1, "Escribí la nota antes de aplicarla.").max(4000),
      layers: z.number().int().min(0).max(12).default(0),
    })
    .parse(await c.req.json());
  if (demo()) return c.json({ demo: true as const });
  const merge = await reviseMotion(brief, script as unknown as MotionScript, note, layers);
  return c.json({ ...merge, demo: false as const });
});

// An explainer's own track (the file as uploaded): Demucs separates its drums on this computer and the kicks are
// measured on that stem, the same clock as the Reloj. Never the track itself: without Demucs this refuses and the
// person uploads the stem. A track split before comes from the cache.
app.put("/api/motion/kicks", async (c) => {
  const master = new Uint8Array(await c.req.arrayBuffer());
  if (master.length < 44) throw new ClockError("Falta el tema.");
  const { drums, cached } = await separate(master);
  const grid = fitKicks(decodeWav(drums), 30);
  return c.json({
    kicks: { kicks: grid.kicks, downbeats: grid.downbeats, bpm: grid.bpm, medianErrorMs: grid.medianErrorMs, usable: grid.usable },
    cached,
  });
});

// A reference sheet (character girl/boy, or place) for the series' cast. People are adults only.
app.post("/api/sheet", async (c) => {
  const { series, template, details, age } = z
    .object({
      series: z.string(),
      template: z.enum(SHEET_TEMPLATES),
      details: z.record(z.string(), z.string().max(400)),
      age: z.number().int().max(90).default(25),
    })
    .parse(await c.req.json());
  if (template !== "place" && age < 18) throw new SeriesError("Los personajes son siempre adultos (18 o más).");
  if (demo()) {
    const name = details.nombre?.trim() || (template === "place" ? "Lugar" : template === "puppet" ? "Personaje 3D" : template === "girl" ? "Ella" : "Él");
    const who =
      template === "place"
        ? `a small place: ${details["qué es"] || "a corner store"}`
        : template === "puppet"
          ? `a stylized 3D-look character: ${details["qué es"] || "a friendly talking yerba mate package"}, soft rounded shapes, matte materials`
          : `an invented ${template === "girl" ? "woman" : "man"}, ${age} years old`;
    return c.json({
      name,
      identity: who,
      sheetPrompt: `${template === "puppet" ? "Stylized 3D-look" : "Photorealistic"} reference sheet of ${who}, 16:9, plain ${template === "puppet" ? "flat mid-grey" : "light-grey"} background, no text.`,
      views:
        template === "puppet"
          ? [{ title: "Para el títere", prompt: `Full body front of ${who}, arms a little away from the body, mouth closed, plain flat mid-grey background, even light, no shadow.` }]
          : [{ title: "Frente", prompt: `Full body front of ${who}, plain light-grey background.` }],
      filled: [],
      note:
        template === "puppet"
          ? "Hoja de muestra: sin clave de IA. Hacé «Para el títere» en Grok, después Segmentos → cabeza, cuerpo, brazos, boca y ojos → Descargar todo, y subí las capas en la tarjeta (Títere 3D). Si querés, sumá de la hoja las bocas A, O y E, las caras y el cuerpo de 3/4 y de perfil como Partes sueltas."
          : "Hoja de muestra: sin clave de IA.",
      demo: true,
    });
  }
  return c.json({ ...(await referenceSheet(series, template, details, age)), demo: false });
});

// E-commerce: the prompt for the episode's product, clean, to cut out in the tool.
app.post("/api/product-shot", async (c) => {
  const { brief } = z.object({ brief: BriefSchema }).parse(await c.req.json());
  if (demo()) {
    const name = brief.product.split(/[,.:]/)[0].trim() || "Producto";
    return c.json({
      name,
      identity: `${name.toLowerCase()}, clean and new`,
      prompt: `${name}, the product alone, whole and centred, front three-quarter view, on a plain light-grey seamless background, soft even studio light, sharp edges, nothing else in frame, no text, no logo`,
      note: "Prompt de muestra: sin clave de IA.",
      demo: true,
    });
  }
  return c.json({ ...(await productShot(brief)), demo: false });
});

// One object changed in a shot's image with the tool's segments. Watermarks are never a target.
const WATERMARK = /marca de agua|watermark|logo de grok|firma de la ia|metadat/i;
app.post("/api/shot/segment", async (c) => {
  const { brief, shot, note } = z
    .object({ brief: BriefSchema, shot: z.preprocess((s) => (s && typeof s === "object" ? { timeline: [], screenAt: "", ...s } : s), ShotWireSchema).transform(normalizeShot), note: z.string().trim().min(1).max(500) })
    .parse(await c.req.json());
  if (WATERMARK.test(note)) {
    throw new WriterError("Eso no: los segmentos no se usan para tapar ni borrar la marca de agua o la identificación de la IA.");
  }
  if (demo()) {
    return c.json({ select: `Lo que dice la nota: ${note}`, prompt: `Change only the selected area: ${note}. Keep everything else exactly as it is.`, note: "Ejemplo: sin clave de IA.", demo: true });
  }
  return c.json({ ...(await segmentEdit(brief, shot, note)), demo: false });
});

// The writer looks at an uploaded image (or a frame of a clip) against its shot. JPEGs come as base64.
const Jpeg = z.string().max(3_000_000);
app.post("/api/review", async (c) => {
  const { brief, shot, setups, picture, refs } = z
    .object({
      brief: BriefSchema,
      shot: z.object({ title: z.string(), action: z.string(), prompt: z.string(), what: z.enum(["image", "clip"]) }),
      setups: z.array(z.object({ name: z.string(), identity: z.string() })).max(14),
      picture: Jpeg,
      refs: z.array(z.object({ label: z.string().max(200), jpeg: Jpeg })).max(3),
    })
    .parse(await c.req.json());
  if (demo()) {
    return c.json({
      checks: [{ item: "Modo de muestra", pass: true, note: "Sin clave de IA, la revisión es un ejemplo: no miró la imagen." }],
      fixPrompt: "",
      demo: true,
    });
  }
  return c.json({ ...(await reviewPicture(brief, shot, setups, picture, refs)), demo: false });
});

// ── Modelos: keys and models, set from the app. Only from this computer: the request must come from the loopback
// address, name localhost as its host and, from a page, be sent by a localhost page (so no website or device on
// the network can read or change them).
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
// Only the app open on this computer: a loopback address, a localhost Host and Origin, and a JSON body.
// `body` is the one content type a non-GET request may carry (a JSON body by default; a .zip for the project import).
const onlyHere = (refusal: string, body = "application/json") => async (c: Context, next: () => Promise<void>) => {
  const address = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ?? "";
  const origin = c.req.header("origin");
  const typed = (c.req.header("content-type") ?? "").includes(body);
  if (!LOOPBACK.test(address) || !LOCAL_HOST.test(c.req.header("host") ?? "") || (origin && !LOCAL_ORIGIN.test(origin)) || (c.req.method !== "GET" && !typed)) {
    return c.json({ error: refusal }, 403);
  }
  await next();
};
const localOnly = onlyHere("Las claves y los modelos se cambian solo desde la app en esta compu.");
app.use("/api/settings", localOnly);
app.use("/api/settings/*", localOnly);

// "Traer la marca desde su web": the server opens a public page for the person, so only from the app on this computer
// (another machine on the network could otherwise make it fetch for them).
app.use("/api/brand/*", onlyHere("La marca se trae de la web solo desde la app en esta compu."));

// Demucs on this computer (Modelos → Demucs), only from the app here: looked up again now ("Volver a buscar" after
// installing it), and "Probar Demucs" runs it on four made-up seconds.
app.use("/api/tools/*", onlyHere("Demucs se revisa solo desde la app en esta compu."));
app.get("/api/tools/demucs", (c) => c.json({ demucs: demucsStatus(true), ffmpeg: ffmpegAvailable() }));
app.post("/api/tools/demucs/test", async (c) => c.json(await tryDemucs()));
// Where Demucs is, saved in .env (null: look on the PATH again).
app.put("/api/tools/demucs", async (c) => {
  const { bin } = z.object({ bin: z.string().trim().max(400).nullable() }).parse(await c.req.json());
  await setEnv({ DEMUCS_BIN: bin ? checkDemucsBin(bin) : null });
  return c.json({ demucs: demucsStatus(true), ffmpeg: ffmpegAvailable() });
});
// "Exportar .zip" / "Importar .zip" (projectZip.ts): a whole project folder as one file. Only from the app on this
// computer: the export hands out every file of a piece, and the import writes a new folder.
app.use("/api/projects/:id/export", onlyHere("Los proyectos se exportan solo desde la app en esta compu."));
app.get("/api/projects/:id/export", async (c) => {
  const id = c.req.param("id");
  const chunks = exportProjectZip(id);
  // The first chunk is read here, so a missing project answers with its error instead of a broken download.
  const first = await chunks.next();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!first.done) controller.enqueue(new Uint8Array(first.value));
    },
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(new Uint8Array(next.value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
  return c.body(stream, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${id}.zip"`,
    "Cache-Control": "no-store",
  });
});
app.use("/api/projects/import", onlyHere("Los proyectos se importan solo desde la app en esta compu.", "application/zip"));
app.post("/api/projects/import", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > MAX_ZIP_TOTAL) return c.json({ error: "Ese .zip es demasiado grande para importarlo." }, 400);
  const data = new Uint8Array(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  if (data.length > MAX_ZIP_TOTAL) return c.json({ error: "Ese .zip es demasiado grande para importarlo." }, 400);
  return c.json(await importProjectZip(data));
});

const HEX = /^#[0-9a-f]{6}$/i;
app.post("/api/brand/from-web", async (c) => {
  const { url, series } = z
    .object({
      url: z.string().trim().min(4).max(500),
      series: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
      own: z.literal(true, { message: "Confirmá que es la web de la marca." }),
    })
    .parse(await c.req.json());
  const facts = await readBrandSite(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const guess = guessBrand(facts);
  const firstLine = (s: string) => s.split(/(?<=[.!?])\s/)[0]?.slice(0, 120) ?? "";
  const raw: BrandSuggestion = demo()
    ? {
        name: facts.siteName || facts.title.split(/\s[|–—-]\s/)[0].trim(),
        tagline: firstLine(facts.description),
        ...guess,
        fontNote: facts.googleFonts.length ? "" : `La web usa ${facts.fonts[0]?.family ?? "fuentes del sistema"}, que no está en Google Fonts: quedan las de siempre.`,
        logo: facts.logos.length ? 0 : -1,
        claims: facts.text.split("\n").filter((l) => l.length > 25 && l.length < 160).slice(0, 5),
        note: "Propuesta de muestra: sin clave de IA, salió de contar colores y leer los títulos.",
      }
    : await brandFromSite(facts, series ?? EMPTY_BRIEF.series);
  const suggestion: BrandSuggestion = {
    ...raw,
    name: raw.name.trim().slice(0, 60),
    tagline: raw.tagline.trim().slice(0, 200),
    bg: HEX.test(raw.bg) ? raw.bg.toLowerCase() : guess.bg,
    text: HEX.test(raw.text) ? raw.text.toLowerCase() : guess.text,
    accent: HEX.test(raw.accent) ? raw.accent.toLowerCase() : guess.accent,
    displayFont: raw.displayFont.trim().slice(0, 60) || guess.displayFont,
    uiFont: raw.uiFont.trim().slice(0, 60) || guess.uiFont,
    claims: raw.claims.map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 8),
  };
  // The chosen logo, or the next candidate that loads.
  const order = [suggestion.logo, ...facts.logos.map((_, i) => i)].filter((i, k, all) => i >= 0 && i < facts.logos.length && all.indexOf(i) === k);
  let logo = "";
  for (const i of order) {
    logo = await fetchLogo(facts.logos[i].url).catch(() => "");
    if (logo) break;
  }
  const result: BrandFromWeb = {
    url: facts.url,
    title: facts.title,
    colors: facts.colors.map((x) => x.hex).slice(0, 12),
    fonts: [...new Set([...facts.googleFonts, ...facts.fonts.map((f) => f.family)])].slice(0, 8),
    suggestion,
    logo,
    demo: demo(),
  };
  return c.json(result);
});

const ProviderParam = z.string().refine((p) => (providerIds() as string[]).includes(p), "Ese proveedor no existe.");
const ModelName = z.string().trim().regex(/^[\w.\-/:@+]{1,120}$/, "Ese nombre de modelo no es válido.");
const asProvider = (p: string) => p as ProviderId;

function settingsView(): SettingsView {
  const w = writerChoice();
  const visionSet = Boolean(process.env.VISION_PROVIDER);
  const v = visionSet ? visionChoice() : null;
  return {
    writer: w,
    vision: v && (v.provider !== w?.provider || v.model !== w?.model) ? v : null,
    effort: claudeEffort(),
    providers: providerIds().map((id) => ({
      id,
      label: labelOf(id),
      ready: ready(id),
      keyEnd: mask(keyOf(id)) || (id === "claude" && ready(id) ? "(sesión de Anthropic)" : ""),
      model: modelOf(id),
      hint: id === "custom" ? "Configurado en .env (KIMI_BASE_URL)" : PROVIDERS[id].keyHint,
      editable: id !== "custom",
    })),
    keys: OTHER_KEYS.map((k) => ({ name: k.name, label: k.label, use: k.use, hint: k.hint, set: Boolean(process.env[k.name]), keyEnd: mask(process.env[k.name]) })),
  };
}

app.get("/api/settings", (c) => c.json(settingsView()));

app.put("/api/settings/key", async (c) => {
  const { name, key } = z
    .object({ name: z.string().max(40), key: z.string().trim().max(400).nullable() })
    .parse(await c.req.json());
  const other = OTHER_KEYS.find((k) => k.name === name);
  if (other) await setEnv({ [other.name]: key || null });
  else {
    const id = asProvider(ProviderParam.parse(name));
    if (id === "custom") throw new SettingsError("Ese proveedor se configura en .env.");
    if (key) await setEnv({ [PROVIDERS[id].keyVar]: key });
    else await setEnv(Object.fromEntries(keyVarsOf(id).map((v) => [v, null])));
  }
  return c.json(settingsView());
});

app.put("/api/settings/writer", async (c) => {
  const { provider, model } = z.object({ provider: ProviderParam, model: ModelName }).parse(await c.req.json());
  const id = asProvider(provider);
  if (!ready(id)) throw new SettingsError(`Primero cargá la clave de ${labelOf(id)}.`);
  await setEnv({ LLM_PROVIDER: id, [id === "custom" ? "KIMI_MODEL" : PROVIDERS[id].modelVar]: model });
  return c.json(settingsView());
});

app.put("/api/settings/vision", async (c) => {
  const { provider, model } = z.object({ provider: ProviderParam.nullable(), model: ModelName.nullable() }).parse(await c.req.json());
  if (provider && !ready(asProvider(provider))) throw new SettingsError(`Primero cargá la clave de ${labelOf(asProvider(provider))}.`);
  await setEnv(provider && model ? { VISION_PROVIDER: provider, VISION_MODEL: model } : { VISION_PROVIDER: null, VISION_MODEL: null });
  return c.json(settingsView());
});

app.put("/api/settings/effort", async (c) => {
  const { effort } = z.object({ effort: z.enum(EFFORTS as [string, ...string[]]) }).parse(await c.req.json());
  await setEnv({ WRITER_EFFORT: effort });
  return c.json(settingsView());
});

// The provider's models, and for Claude the effort levels each accepts.
app.get("/api/settings/models", async (c) => {
  const id = asProvider(ProviderParam.parse(c.req.query("provider") ?? ""));
  if (!ready(id)) throw new SettingsError(`Primero cargá la clave de ${labelOf(id)}.`);
  return c.json({ models: await listModels(id) });
});

app.get("/api/settings/efforts", (c) => c.json({ efforts: claudeEfforts(ModelName.parse(c.req.query("model") ?? "")) }));

// A tiny real request with the chosen provider and model; with vision, a red picture to name.
app.post("/api/settings/test", async (c) => {
  const { provider, model, vision } = z.object({ provider: ProviderParam, model: ModelName, vision: z.boolean().default(false) }).parse(await c.req.json());
  const id = asProvider(provider);
  if (!ready(id)) throw new SettingsError(`Primero cargá la clave de ${labelOf(id)}.`);
  return c.json({ result: await testModel({ provider: id, label: labelOf(id), model }, vision) });
});

// Tokens of the last writer requests, newest first, and the average of each kind.
app.get("/api/settings/usage", async (c) => c.json(await usageView()));

// The motion quality loop: the reviewer scores the contact sheet(s) against the app's measurements.
app.post("/api/motion/review", async (c) => {
  const { brief, scenes, facts, sheets, round, earlier } = z
    .object({
      brief: BriefSchema,
      scenes: z.string().max(40_000),
      facts: z.string().max(10_000),
      sheets: z.array(z.object({ format: z.enum(["vertical", "horizontal"]), jpeg: Jpeg })).min(1).max(2),
      round: z.number().int().min(1).max(10),
      earlier: z.string().max(10_000).default(""),
    })
    .parse(await c.req.json());
  if (demo()) return c.json({ review: demoMotionReview(round), demo: true });
  return c.json({ review: await reviewMotion(brief, scenes, facts, sheets, round, earlier), demo: false });
});

// The final render with ffmpeg (render.mjs), and its progress.
app.post("/api/projects/:id/final", async (c) => {
  const id = c.req.param("id");
  const { formats, origin } = z
    .object({ formats: z.array(z.enum(["vertical", "horizontal"])).min(1).max(2), origin: z.string().max(100) })
    .parse(await c.req.json());
  await getProject(id);
  return c.json({ job: startFinal(id, [...new Set(formats)], origin) });
});

app.get("/api/final/:job", (c) => {
  const job = getFinal(c.req.param("job"));
  return job ? c.json({ job }) : c.json({ error: "Ese render ya no existe." }, 404);
});

// Lyric clock: drums stem (or Demucs on the master) for the kick, vocal stem for the words. Never the master peaks.
app.post("/api/projects/:id/sync", async (c) => {
  const form = await c.req.formData();
  const lyrics = String(form.get("lyrics") ?? "");
  const moves = String(form.get("moves") ?? "");
  const fpsRaw = Number(form.get("fps") ?? 24);
  const fps = Number.isFinite(fpsRaw) && fpsRaw >= 12 && fpsRaw <= 60 ? fpsRaw : 24;
  const language = z.enum(LYRIC_LANGUAGES).parse(form.get("language") ?? "auto");
  const file = async (value: FormDataEntryValue | null) =>
    value instanceof Blob && value.size ? new Uint8Array(await value.arrayBuffer()) : null;
  const built = await buildProjectSync(c.req.param("id"), {
    lyrics,
    moves,
    fps,
    language,
    drums: await file(form.get("drums")),
    vocals: await file(form.get("vocals")),
    master: await file(form.get("master")),
  });
  return c.json({ sync: built.doc, qa: built.qa });
});

app.get("/api/projects/:id/sync", async (c) => {
  const loaded = await loadSync(c.req.param("id"));
  if (!loaded) return c.json({ error: "Todavía no hay reloj." }, 404);
  return c.json({ sync: loaded.doc, qa: loaded.qa });
});

app.post("/api/projects/:id/sync/critique", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const brand = BrandSchema.parse({ ...DEFAULT_BRAND, ...((body as { brand?: unknown }).brand ?? {}) });
  const result = await critiqueProject(c.req.param("id"), brand);
  return c.json(result);
});

// Lyric videos. Automatic sync: the song (multipart "audio") is transcribed with word times and matched to the
// lyric lines ("lines" and "seconds", JSON arrays).
app.post("/api/lyrics/sync", async (c) => {
  const form = await c.req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new LyricsError("Falta la canción.");
  const lines = z.array(z.string()).min(1).max(400).parse(JSON.parse(String(form.get("lines") ?? "[]")));
  const seconds = z.array(z.string()).parse(JSON.parse(String(form.get("seconds") ?? "[]")));
  const language = z.enum(LYRIC_LANGUAGES).parse(form.get("language") ?? "auto");
  // "voice=demucs": the transcription hears the vocal stem only (the same split the Reloj reuses).
  let heard;
  let vocalStem: Uint8Array | null = null;
  if (form.get("voice") === "demucs") {
    // The key first: a split takes minutes, and without the key nothing would hear it.
    if (!autoSyncAvailable()) throw new LyricsError("Para sincronizar automático falta OPENAI_API_KEY en .env.");
    const { vocals } = await separate(new Uint8Array(await audio.arrayBuffer()));
    if (!vocals) throw new ClockError("Demucs no devolvió la voz de este tema.");
    vocalStem = vocals;
    const speech = speechWav(vocals);
    heard = await hearSong(new Blob([speech.buffer as ArrayBuffer], { type: "audio/wav" }), "voz.wav", language, lines.join("\n"));
  } else {
    heard = await hearSong(audio, audio instanceof File ? audio.name : "cancion.mp3", language, lines.join("\n"));
  }
  const share = { matched: 0, total: 0 };
  let aligned = alignLyrics(lines, seconds, heard.words, heard.duration, share);
  // With the vocal stem at hand, each word's loudness comes with it ("La letra actúa el canto"; never the master).
  if (vocalStem) aligned = withLevels(aligned, wordLevels(decodeWav(vocalStem), wordSpans(aligned)));
  return c.json({ lines: aligned, heard: heard.words.length, ...share });
});

// How loud each lyric word is sung, on the vocal stem Demucs splits from the song (cached per song). The master is
// never measured: without Demucs this says so, and the studio offers to read a vocal stem the person uploads instead.
app.post("/api/lyrics/levels", async (c) => {
  const form = await c.req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new LyricsError("Falta la canción.");
  const spans = z
    .array(z.object({ start: z.number(), end: z.number() }))
    .min(1)
    .max(8000)
    .parse(JSON.parse(String(form.get("words") ?? "[]")));
  if (!demucsAvailable()) {
    throw new ClockError("Para medir la fuerza del canto hace falta la voz sola: instalá Demucs (Modelos → Demucs) o subí el stem de voz.");
  }
  const { vocals } = await separate(new Uint8Array(await audio.arrayBuffer()));
  if (!vocals) throw new ClockError("Demucs no devolvió la voz de este tema.");
  return c.json({ levels: wordLevels(decodeWav(vocals), spans) });
});

// An explainer scene's voice file (multipart "audio"), heard with word times for its subtitles; the line ("text")
// helps it spell. The studio aligns the words to the written line (shared/subtitles.ts alignWordTimes).
app.post("/api/voice/words", async (c) => {
  const form = await c.req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new LyricsError("Falta la voz.");
  const text = z.string().max(2000).parse(String(form.get("text") ?? ""));
  const language = z.enum(LYRIC_LANGUAGES).parse(form.get("language") ?? "auto");
  const heard = await hearSong(audio, audio instanceof File ? audio.name : "voz.mp3", language, text, "voice");
  return c.json({ words: heard.words, duration: heard.duration });
});

const LyricRequest = z.object({ series: z.string(), title: z.string().default(""), artist: z.string().default(""), lines: z.array(z.string()).min(1).max(400) });

app.post("/api/lyrics/ideas", async (c) => {
  const { series, title, artist, lines } = LyricRequest.parse(await c.req.json());
  if (demo()) {
    // Sample mode: the longest word of every other line stands out.
    const keywords = lines
      .map((l, line) => ({ line, words: [l.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? ""] }))
      .filter((k, i) => i % 2 === 0 && k.words[0].length >= 4);
    return c.json({ palette: DEFAULT_LYRIC_STYLE.palette, mood: "calm", keywords, note: "Ideas de muestra: sin clave de IA.", demo: true });
  }
  const ideas = await lyricIdeas(series, title, artist, lines);
  return c.json({ ...cleanIdeas(ideas, DEFAULT_LYRIC_STYLE), keywords: ideas.keywords, note: ideas.note, demo: false });
});

app.post("/api/lyrics/second", async (c) => {
  const { series, lines, mode, language, other } = LyricRequest.extend({
    mode: z.enum(["romanize", "translate"]),
    language: z.enum(SECOND_LANGUAGES).default("es"),
    other: z.string().trim().max(40).default(""),
  }).parse(await c.req.json());
  if (demo()) return c.json({ lines, note: "Modo de muestra: sin clave de IA, copié la letra tal cual.", demo: true });
  return c.json({ ...(await secondLines(series, lines, mode, language, other)), demo: false });
});

app.post("/api/lyrics/elements", async (c) => {
  const { series, title, artist, lines } = LyricRequest.parse(await c.req.json());
  if (demo()) {
    const motifs = ["heart", "note", "star", "circle"] as const;
    const motions = ["pulse", "enter", "hold", "leave"] as const;
    const places = ["top", "left", "right", "top"] as const;
    const picked = lines.map((text, line) => ({ text, line })).filter((_, i) => i % 2 === 0).slice(0, 4);
    const elements = picked.map(({ text, line }, n) => ({
      label: text.split(/\s+/).slice(0, 2).join(" ").slice(0, 40) || "texto",
      motif: motifs[n % motifs.length],
      motion: motions[n % motions.length],
      place: places[n % places.length],
      line,
      seconds: 3,
    }));
    return c.json({ elements: cleanElements({ elements }, lines.length), note: "Elementos de muestra: sin clave de IA.", demo: true });
  }
  const raw = await lyricElements(series, title, artist, lines);
  return c.json({ elements: cleanElements(raw, lines.length), note: raw.note, demo: false });
});

app.post("/api/lyrics/plates", async (c) => {
  const { series, title, artist, lines, note, plates } = LyricRequest.extend({
    note: z.string().max(2000).default(""),
    plates: z
      .array(z.object({ title: z.string(), from: z.number(), to: z.number(), look: z.string(), motif: z.string() }))
      .max(12)
      .default([]),
  }).parse(await c.req.json());
  if (demo()) {
    return c.json({
      plates: buildPlates("", lines),
      idea: "Dirección de muestra: sin clave de IA, una placa cada cuatro líneas.",
      note: "",
      demo: true,
    });
  }
  const raw = await lyricPlates(series, title, artist, lines, note, plates);
  return c.json({ plates: cleanPlates(raw.plates, lines), idea: raw.idea, note: raw.note, demo: false });
});

app.post("/api/lyrics/backgrounds", async (c) => {
  const { series, title, lines, tool, palette, mood, format } = LyricRequest.extend({
    tool: z.string(),
    palette: z.array(z.string()),
    mood: z.string(),
    format: z.enum(["vertical", "horizontal"]),
  }).parse(await c.req.json());
  if (demo()) {
    const look = `soft out-of-focus ${mood === "lively" ? "swirling" : "drifting"} light in the colours ${palette.join(", ")}, no people, no text`;
    return c.json({
      prompts: [
        { title: "Estrofas: humo de color", image: `Colored smoke hanging in the dark, ${look}.`, video: "The smoke drifts slowly and folds into itself, seamless loop, static camera.", seconds: 10 },
        { title: "Estribillo: luz en el agua", image: `Light rippling on water seen from above, ${look}.`, video: "Ripples spread and glow brighter, slow continuous motion, seamless loop.", seconds: 10 },
        { title: "Final: tela al viento", image: `Thin fabric floating in warm light, ${look}.`, video: "The fabric billows gently in slow motion, seamless loop, no cuts.", seconds: 10 },
      ],
      note: "Prompts de muestra: sin clave de IA.",
      demo: true,
    });
  }
  return c.json({ ...(await backgroundPrompts(series, tool, title, lines, { palette, mood }, format)), demo: false });
});

app.put("/api/projects/:id/video", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  const variant = z.enum(["vertical", "horizontal"]).optional().parse(c.req.query("variant") || undefined);
  const file = await saveVideo(c.req.param("id"), data, c.req.header("content-type") ?? "", variant);
  return c.json({ file });
});

app.put("/api/projects/:id/subtitles", async (c) => {
  const video = z.string().max(80).parse(c.req.query("video") ?? "");
  const file = await saveSubtitles(c.req.param("id"), video, await c.req.text());
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
  const { brief, topics, note, projectId } = z
    .object({
      brief: BriefSchema,
      topics: z.array(TopicInput).min(1).max(4),
      note: z.string().max(4000).default(""),
      projectId: z.string().max(80).default(""),
    })
    .parse(await c.req.json());
  if (demo()) return c.json({ story: demoStory(brief), demo: true });
  const room = roomBrief(await listRoom(brief.series, projectId));
  return c.json({ story: await writeStory(brief, topics, room, note), demo: false });
});

app.post("/api/story/revise", async (c) => {
  const { brief, story, note, projectId } = z
    .object({
      brief: BriefSchema,
      story: StoryInput,
      note: z.string().min(1),
      projectId: z.string().max(80).default(""),
    })
    .parse(await c.req.json());
  if (demo()) return c.json({ story, demo: true });
  const room = roomBrief(await listRoom(brief.series, projectId));
  return c.json({ story: await reviseStory(brief, story, note, room), demo: false });
});

// Five hook variants for a story (PLAYBOOK §3), each with its move and the viewer's awareness level.
app.post("/api/story/hooks", async (c) => {
  const { brief, story } = z.object({ brief: BriefSchema, story: StoryInput }).parse(await c.req.json());
  if (demo()) return c.json({ variants: demoHookVariants(story), demo: true });
  return c.json({ variants: await hookVariants(brief, story), demo: false });
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
      look: z.string().max(2400).default(""),
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
