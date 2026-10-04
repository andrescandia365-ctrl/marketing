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
  type SettingsView,
  type Status,
} from "../shared/schema.ts";
import {
  WriterError,
  backgroundPrompts,
  currentWriter,
  lyricIdeas,
  motionScript,
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
} from "./claude.ts";
import { KimiError } from "./kimi.ts";
import { LyricsError, autoSyncAvailable, hearSong } from "./lyrics.ts";
import { DEFAULT_LYRIC_STYLE, LYRIC_LANGUAGES, LyricStyleSchema, alignLyrics, cleanIdeas } from "../shared/lyrics.ts";
import { DEMO_BOARD, DEMO_MENU, DEMO_STORY, demoMotion, demoMotionReview } from "./demo.ts";
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
import { CastMemberSchema, PUPPET_ROLES, SeriesFieldsSchema, TextStyleSchema } from "../shared/series.ts";
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
  removeMusic,
  saveMedia,
  saveMusic,
  saveState,
  saveVideo,
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
  removePuppetLayer,
  setLogo,
  saveTextStyle,
  setCastImage,
  upsertCastMember,
} from "./series.ts";
import { listTools } from "./tools.ts";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof WriterError || error instanceof KimiError) return c.json({ error: error.message }, 502);
  if (error instanceof SeriesError || error instanceof ProjectError || error instanceof RenderError || error instanceof SettingsError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof VoiceError || error instanceof LyricsError) return c.json({ error: error.message }, 502);
  if (error instanceof z.ZodError) return c.json({ error: "Al pedido le faltaban datos." }, 400);
  console.error(error);
  return c.json({ error: error.message || "Algo salió mal." }, 500);
});

// Story and board come back from the browser; parse them with the same shapes the writer returns.
// Pieces saved before a field existed get its empty value: problem and practices, each line's emotion, each shot's
// timeline.
type Loose = Record<string, unknown> & { topics?: { lines?: Record<string, unknown>[] }[]; shots?: Record<string, unknown>[] };
function fillOld(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as Loose;
  return {
    ...v,
    ...(v.topics && { topics: v.topics.map((t) => ({ ...t, lines: t.lines?.map((l) => ({ emotion: "", ...l })) })) }),
    ...(v.shots && { shots: v.shots.map((s) => ({ timeline: [], ...s })) }),
  };
}
const StoryInput = z.preprocess(
  fillOld,
  StoryWireSchema.extend({
    problem: z.string().default(""),
    practices: StoryWireSchema.shape.practices.default([]),
  }),
).transform(normalizeStory);
const TopicInput = TopicIdeaSchema.extend({ problem: z.string().default("") });
const BoardInput = z.preprocess(fillOld, BoardWireSchema).transform(normalizeBoard);
const demo = () => currentWriter() === null;

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
    render: { ffmpeg: ffmpegAvailable() },
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

app.put("/api/series/:id/cast/:castId/image", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const file = setCastImage(c.req.param("id"), c.req.param("castId"), data, c.req.header("content-type") ?? "");
  return c.json({ file, series: listSeries() });
});

// The parts of a character's puppet (motion graphics): upload one (index = its place; one past the end adds), remove one.
app.put("/api/series/:id/cast/:castId/puppet/:index", async (c) => {
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) return c.json({ error: "El archivo está vacío." }, 400);
  const role = z.enum(PUPPET_ROLES).parse(c.req.query("role") ?? "extra");
  const member = setPuppetLayer(c.req.param("id"), c.req.param("castId"), Number(c.req.param("index")), data, c.req.header("content-type") ?? "", role);
  return c.json({ member, series: listSeries() });
});

app.delete("/api/series/:id/cast/:castId/puppet/:index", (c) => {
  const member = removePuppetLayer(c.req.param("id"), c.req.param("castId"), Number(c.req.param("index")));
  return c.json({ member, series: listSeries() });
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
  const { text, voice, language } = z
    .object({ text: z.string().trim().min(1).max(1500), voice: z.string().max(40).default(""), language: z.enum(["es", "en"]) })
    .parse(await c.req.json());
  const audio = await speak(text, voice, language);
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
          ? "Hoja de muestra: sin clave de IA. Hacé «Para el títere» en Grok, después Segmentos → cabeza, cuerpo, brazos, boca y ojos → Descargar todo, y subí las capas en la tarjeta (Títere 3D)."
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
    .object({ brief: BriefSchema, shot: z.preprocess((s) => (s && typeof s === "object" ? { timeline: [], ...s } : s), ShotWireSchema).transform(normalizeShot), note: z.string().trim().min(1).max(500) })
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
const localOnly = async (c: Context, next: () => Promise<void>) => {
  const address = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ?? "";
  const origin = c.req.header("origin");
  const json = (c.req.header("content-type") ?? "").includes("application/json");
  if (!LOOPBACK.test(address) || !LOCAL_HOST.test(c.req.header("host") ?? "") || (origin && !LOCAL_ORIGIN.test(origin)) || (c.req.method !== "GET" && !json)) {
    return c.json({ error: "Las claves y los modelos se cambian solo desde la app en esta compu." }, 403);
  }
  await next();
};
app.use("/api/settings", localOnly);
app.use("/api/settings/*", localOnly);

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

// Lyric videos. Automatic sync: the song (multipart "audio") is transcribed with word times and matched to the
// lyric lines ("lines" and "seconds", JSON arrays).
app.post("/api/lyrics/sync", async (c) => {
  const form = await c.req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new LyricsError("Falta la canción.");
  const lines = z.array(z.string()).min(1).max(400).parse(JSON.parse(String(form.get("lines") ?? "[]")));
  const seconds = z.array(z.string()).parse(JSON.parse(String(form.get("seconds") ?? "[]")));
  const language = z.enum(LYRIC_LANGUAGES).parse(form.get("language") ?? "auto");
  const heard = await hearSong(audio, audio instanceof File ? audio.name : "cancion.mp3", language, lines.join("\n"));
  return c.json({ lines: alignLyrics(lines, seconds, heard.words, heard.duration), heard: heard.words.length });
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
  const { series, lines, mode } = LyricRequest.extend({ mode: z.enum(["romanize", "translate"]) }).parse(await c.req.json());
  if (demo()) return c.json({ lines, note: "Modo de muestra: sin clave de IA, copié la letra tal cual.", demo: true });
  return c.json({ ...(await secondLines(series, lines, mode)), demo: false });
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
    .object({ brief: BriefSchema, topics: z.array(TopicInput).min(1).max(4) })
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
