// Publicidad's API: the offer profile, the clips catalogue, the metrics import, the pieces, the review and the
// batches. State lives in publicidad/<series>/campana.json (ads.ts); the writer is adsWriter.ts.
import type { Hono } from "hono";
import { z } from "zod";
import {
  AD_SECONDS,
  AdComboSchema,
  AdCopySchema,
  CombineRulesSchema,
  LEVEL_INFO,
  MEAT_FORMATS,
  PieceSpeakerSchema,
  OfferSchema,
  PIECE_STATUS,
  clipFromWire,
  ctasFromWire,
  flagsFromWire,
  hooksFromWire,
  levelsOf,
  localFlags,
  meatsFromWire,
  organicHook,
  parseMetricsCsv,
  rankHooks,
  toLevel,
  toLevels,
  BUDGETS,
  HookStaticSchema,
  adsThisWeek,
  type AdSeconds,
  type AdsState,
  type Batch,
  type Piece,
} from "../shared/ads.ts";
import { campaignCsv, defaultStatic, staticBelongs, staticsCsv } from "../shared/adsStatic.ts";
import { currentWriter, taskFromPaste, taskPrompt } from "./claude.ts";
import { HandoffSchema } from "../shared/handoff.ts";
import { copiesFromWire, copyChunks, copyPairs, countParts, hookParts, partOf, type PromptPart } from "../shared/adsHandoff.ts";
import {
  ADS_DIR,
  AdsError,
  loadAds,
  readAdsFile,
  removeBatchFolder,
  removePieceMedia,
  saveAdFile,
  saveBatchCsv,
  saveClipFile,
  savePieceMedia,
  savePieceRender,
  pruneStaticExports,
  saveStaticExport,
  saveStaticPicture,
  saveStaticsCsv,
  transcribeClip,
  transcriptText,
  transcriptionAvailable,
  updateAds,
} from "./ads.ts";
import {
  analyzeClip,
  clipTask,
  copiesTask,
  ctasTask,
  hooksTask,
  meatsTask,
  reviewTask,
  reviewRun,
  sampleAnalysis,
  sampleCopies,
  sampleCtas,
  sampleHooks,
  sampleMeats,
  writeCopies,
  writeCtas,
  writeHooks,
  writeMeats,
} from "./adsWriter.ts";
import { getSeries } from "./series.ts";
import { getProject, listProjectFiles, readProjectFile } from "./projects.ts";
import { EXPLAINER_KINDS, EXPLAINER_VIDEO, explainerPiece, explainerVideos, fitClip } from "../shared/adsFromExplainer.ts";

const demo = () => currentWriter() === null;
const Series = z.string().regex(/^[a-z0-9-]{1,40}$/);
const Seconds = z.number().refine((n): n is AdSeconds => (AD_SECONDS as readonly number[]).includes(n), "El anuncio dura 6, 10 o 15 segundos.");
const Levels = z.array(z.number().int().min(1).max(5)).max(5).default([]);
const Lang = z.enum(["es", "en"]).default("es");
const PieceId = z.string().regex(/^[HMC]\d{1,4}$/);
const HookId = z.string().regex(/^H\d{1,4}$/);
// "Sin clave" (shared/handoff.ts, shared/adsHandoff.ts): `handoff` "prompt" answers the text for claude.ai, "paste"
// reads its reply through the same schema; `part` is which prompt of a request split in several (1-based).
const Handoff = HandoffSchema.optional();
const Part = z.number().int().min(1).max(500).default(1);
const partInfo = (one: PromptPart | null) => (one ? { part: one.part, parts: one.parts } : {});
// The writer calls the platform texts take with a key (the copy-and-paste prompts are smaller, PASTE_PER_PROMPT).
const COPIES_PER_CALL = 50;
// What the batch view changes in a hook's static version (the picture and the exports have their own routes).
const StaticPatch = HookStaticSchema.omit({ picture: true, exports: true }).partial();

function series(c: { req: { param: (k: string) => string | undefined } }): string {
  const id = Series.parse(c.req.param("series"));
  if (!getSeries(id)) throw new AdsError("Esa serie no existe.");
  return id;
}

const pieceLists = (s: AdsState): Piece[][] => [s.hooks, s.meats, s.ctas];
function findPiece(s: AdsState, id: string): Piece | undefined {
  return pieceLists(s)
    .flat()
    .find((p) => p.id === id);
}

// An explainer project of this series (its studio saves kind "motion" and the brief it was made with).
async function explainerProject(seriesId: string, projectId: string | undefined): Promise<{ id: string; title: string }> {
  const project = await getProject(z.string().regex(/^[a-z0-9-]{1,80}$/, "Ese proyecto no existe.").parse(projectId));
  const st = project.state as { kind?: string; pieceBrief?: { series?: string }; motion?: { script?: { title?: string } | null } };
  if (st.kind !== "motion") throw new AdsError("Ese proyecto no es un explicativo.");
  if (st.pieceBrief?.series && st.pieceBrief.series !== seriesId) throw new AdsError("Ese explicativo es de otra serie: solo puede ir a la Publicidad de su serie.");
  return { id: project.id, title: (st.motion?.script?.title ?? "").trim() };
}

export function adsRoutes(app: Hono) {
  app.get("/api/ads/:series", async (c) => {
    const id = series(c);
    const state = await loadAds(id);
    return c.json({ state, transcription: transcriptionAvailable(), folder: `${ADS_DIR}/${id}`, ranking: rankHooks(state) });
  });

  app.put("/api/ads/:series/offer", async (c) => {
    const id = series(c);
    const { offer } = z.object({ offer: OfferSchema }).parse(await c.req.json());
    const { state } = await updateAds(id, (s) => {
      s.offer = offer;
    });
    return c.json({ state });
  });

  app.put("/api/ads/:series/settings", async (c) => {
    const id = series(c);
    const { weeklyLimit } = z.object({ weeklyLimit: z.number().int().min(1).max(5000) }).parse(await c.req.json());
    const { state } = await updateAds(id, (s) => {
      s.weeklyLimit = weeklyLimit;
    });
    return c.json({ state });
  });

  // A previous ad: transcribed (whisper-1) and split into hook, meat and CTA by the writer.
  app.post("/api/ads/:series/clips", async (c) => {
    const id = series(c);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || !file.size) throw new AdsError("Falta el clip.");
    const language = Lang.parse(form.get("language") ?? "es");
    const name = (file instanceof File ? file.name : "clip.mp4").slice(0, 200);
    const data = Buffer.from(await file.arrayBuffer());
    const clipId = `clip-${Date.now().toString(36)}`;
    const saved = await saveClipFile(id, clipId, data, file.type);
    const heard = await transcribeClip(data, name, file.type, language);
    const transcript = transcriptText(heard);
    const state0 = await loadAds(id);
    const wire = demo() ? sampleAnalysis(transcript) : await analyzeClip(id, state0.offer, transcript, name);
    const clip = clipFromWire(wire, { id: clipId, name, file: saved, transcript });
    const { state } = await updateAds(id, (s) => {
      s.clips.push(clip);
    });
    return c.json({ state, clip, demo: demo() });
  });

  // The same, from a pasted transcript (no transcription key, or an ad that only exists as text).
  app.post("/api/ads/:series/clips/text", async (c) => {
    const id = series(c);
    const { name, transcript, handoff } = z
      .object({ name: z.string().trim().max(200), transcript: z.string().trim().min(10).max(20000), handoff: Handoff })
      .parse(await c.req.json());
    const state0 = await loadAds(id);
    const label = name || `texto ${state0.clips.length + 1}`;
    if (handoff?.mode === "prompt") return c.json(taskPrompt(clipTask(id, state0.offer, transcript, label)));
    const wire =
      handoff?.mode === "paste"
        ? taskFromPaste(clipTask(id, state0.offer, transcript, label), handoff.reply)
        : demo()
          ? sampleAnalysis(transcript)
          : await analyzeClip(id, state0.offer, transcript, label);
    const clip = clipFromWire(wire, { id: `clip-${Date.now().toString(36)}`, name: label, file: "", transcript });
    const { state } = await updateAds(id, (s) => {
      s.clips.push(clip);
    });
    return c.json({ state, clip, demo: !handoff && demo(), pasted: Boolean(handoff) });
  });

  // A catalogued clip cut again by claude.ai (copy and paste): its saved transcript, the same task, the clip replaced.
  app.post("/api/ads/:series/clips/:id/split", async (c) => {
    const id = series(c);
    const clipId = z.string().regex(/^clip-[a-z0-9]+$/).parse(c.req.param("id"));
    const { handoff } = z.object({ handoff: HandoffSchema }).parse(await c.req.json());
    const state0 = await loadAds(id);
    const old = state0.clips.find((x) => x.id === clipId);
    if (!old) throw new AdsError("Ese clip no existe.");
    if (old.transcript.trim().length < 10) throw new AdsError("Ese clip no tiene transcripción para cortar.");
    const make = () => clipTask(id, state0.offer, old.transcript, old.name);
    if (handoff.mode === "prompt") return c.json(taskPrompt(make()));
    const wire = taskFromPaste(make(), handoff.reply);
    const { state, result } = await updateAds(id, (s) => {
      const i = s.clips.findIndex((x) => x.id === clipId);
      if (i < 0) throw new AdsError("Ese clip no existe.");
      const clip = clipFromWire(wire, { id: clipId, name: s.clips[i].name, file: s.clips[i].file, transcript: s.clips[i].transcript });
      s.clips[i] = clip;
      return clip;
    });
    return c.json({ state, clip: result, demo: false, pasted: true });
  });

  app.delete("/api/ads/:series/clips/:id", async (c) => {
    const id = series(c);
    const clipId = z.string().regex(/^clip-[a-z0-9]+$/).parse(c.req.param("id"));
    const { state } = await updateAds(id, async (s) => {
      const clip = s.clips.find((x) => x.id === clipId);
      if (clip?.file) await removePieceMedia(id, clip.file).catch(() => undefined);
      s.clips = s.clips.filter((x) => x.id !== clipId);
    });
    return c.json({ state });
  });

  // The platform's exported report. Rows replace the earlier import (the report is the whole history).
  app.post("/api/ads/:series/metrics", async (c) => {
    const id = series(c);
    const { csv, replace } = z.object({ csv: z.string().min(1).max(20_000_000), replace: z.boolean().default(true) }).parse(await c.req.json());
    let parsed: ReturnType<typeof parseMetricsCsv>;
    try {
      parsed = parseMetricsCsv(csv);
    } catch (e) {
      throw new AdsError((e as Error).message);
    }
    const { state } = await updateAds(id, (s) => {
      s.metrics = replace ? parsed.rows : [...s.metrics, ...parsed.rows];
      s.metricsImportedAt = new Date().toISOString();
    });
    return c.json({ state, ranking: rankHooks(state), rows: parsed.rows.length, withId: parsed.rows.filter((r) => r.adId).length, found: parsed.found, missing: parsed.missing });
  });

  // Hooks: the winners (metrics, organic) go in as patterns; existing hooks are not repeated.
  app.post("/api/ads/:series/hooks", async (c) => {
    const id = series(c);
    const { levels, count, seconds, tool, language, handoff, part } = z
      .object({ levels: Levels, count: z.number().int().min(1).max(60), seconds: Seconds, tool: z.string().max(60), language: Lang, handoff: Handoff, part: Part })
      .parse(await c.req.json());
    const state0 = await loadAds(id);
    // By copy and paste, 50 hooks are several prompts: this one asks for its share of the levels.
    const one = handoff ? partOf(hookParts(count, levelsOf(levels)), part) : null;
    const req = {
      levels: one ? one.perLevel.map((p) => p.level) : levelsOf(levels),
      count: one?.count ?? count,
      ...(one && { perLevel: one.perLevel }),
      seconds,
      winners: [
        ...rankHooks(state0)
          .slice(0, 12)
          .map((r) => `${r.text} (N${r.level}, ${Math.round(r.stats.hookRate * 100)}% ven 3 s, ${r.stats.views3s || r.stats.views} vistas)`),
        ...state0.hooks.filter((h) => h.source === "organic" && h.status !== "rejected").map((h) => `${h.text} (del contenido orgánico)`),
      ],
      existing: state0.hooks.filter((h) => h.status !== "rejected").map((h) => h.text),
      language,
    };
    if (handoff?.mode === "prompt") return c.json({ ...taskPrompt(hooksTask(id, state0.offer, tool, req)), ...partInfo(one) });
    const wire =
      handoff?.mode === "paste"
        ? taskFromPaste(hooksTask(id, state0.offer, tool, req), handoff.reply)
        : demo()
          ? sampleHooks(req)
          : await writeHooks(id, state0.offer, tool, req);
    const { state, result } = await updateAds(id, (s) => {
      const hooks = hooksFromWire(s, wire, BUDGETS[seconds].hook, "ai");
      s.hooks.push(...hooks);
      return hooks;
    });
    return c.json({ state, hooks: result, note: wire.note, demo: !handoff && demo(), pasted: Boolean(handoff), ...partInfo(one) });
  });

  // "Enviar a Publicidad": a hook from a Playbook piece.
  app.post("/api/ads/:series/hooks/organic", async (c) => {
    const id = series(c);
    const { text, level, seconds, note } = z
      .object({ text: z.string().trim().min(1).max(600), level: z.number().int().min(1).max(5).default(2), seconds: Seconds.default(15), note: z.string().max(600).default("") })
      .parse(await c.req.json());
    const { state, result } = await updateAds(id, (s) => {
      const hook = organicHook(s, text, toLevel(level), BUDGETS[seconds].hook, note);
      s.hooks.push(hook);
      return hook;
    });
    return c.json({ state, hook: result });
  });

  app.post("/api/ads/:series/meats", async (c) => {
    const id = series(c);
    const { levels, formats, count, seconds, tool, language, handoff, part } = z
      .object({
        levels: Levels,
        formats: z.array(z.enum(MEAT_FORMATS)).max(5).default([]),
        count: z.number().int().min(1).max(8),
        seconds: Seconds,
        tool: z.string().max(60),
        language: Lang,
        handoff: Handoff,
        part: Part,
      })
      .parse(await c.req.json());
    const state0 = await loadAds(id);
    const lv = levelsOf(levels);
    const one = handoff ? partOf(countParts("meat", count), part) : null;
    const req = {
      levels: lv,
      formats: formats.length ? formats : [...new Set(lv.flatMap((l) => LEVEL_INFO[l].meats))],
      count: one?.count ?? count,
      seconds,
      hooks: state0.hooks.filter((h) => h.status === "approved" && lv.includes(h.level)).slice(0, 20),
      language,
    };
    if (handoff?.mode === "prompt") return c.json({ ...taskPrompt(meatsTask(id, state0.offer, tool, req)), ...partInfo(one) });
    const wire =
      handoff?.mode === "paste"
        ? taskFromPaste(meatsTask(id, state0.offer, tool, req), handoff.reply)
        : demo()
          ? sampleMeats(req)
          : await writeMeats(id, state0.offer, tool, req);
    const { state, result } = await updateAds(id, (s) => {
      const meats = meatsFromWire(s, wire, BUDGETS[seconds].meat, "", lv);
      s.meats.push(...meats);
      return meats;
    });
    return c.json({ state, meats: result, note: wire.note, demo: !handoff && demo(), pasted: Boolean(handoff), ...partInfo(one) });
  });

  app.post("/api/ads/:series/ctas", async (c) => {
    const id = series(c);
    const { levels, count, seconds, tool, language, handoff, part } = z
      .object({ levels: Levels, count: z.number().int().min(1).max(5), seconds: Seconds, tool: z.string().max(60), language: Lang, handoff: Handoff, part: Part })
      .parse(await c.req.json());
    const state0 = await loadAds(id);
    const lv = levelsOf(levels);
    const one = handoff ? partOf(countParts("cta", count), part) : null;
    const req = { levels: lv, count: one?.count ?? count, seconds, hooks: state0.hooks.filter((h) => h.status === "approved" && lv.includes(h.level)).slice(0, 20), language };
    if (handoff?.mode === "prompt") return c.json({ ...taskPrompt(ctasTask(id, state0.offer, tool, req)), ...partInfo(one) });
    const wire =
      handoff?.mode === "paste"
        ? taskFromPaste(ctasTask(id, state0.offer, tool, req), handoff.reply)
        : demo()
          ? sampleCtas(req)
          : await writeCtas(id, state0.offer, tool, req);
    const { state, result } = await updateAds(id, (s) => {
      const ctas = ctasFromWire(s, wire, BUDGETS[seconds].cta, lv);
      s.ctas.push(...ctas);
      return ctas;
    });
    return c.json({ state, ctas: result, note: wire.note, demo: !handoff && demo(), pasted: Boolean(handoff), ...partInfo(one) });
  });

  // Approve, reject or edit one piece. A text edit drops its cached render.
  app.patch("/api/ads/:series/pieces/:id", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const patch = z
      .object({
        status: z.enum(PIECE_STATUS).optional(),
        text: z.string().max(600).optional(),
        onScreenText: z.string().max(80).optional(),
        visualPrompt: z.string().max(3000).optional(),
        videoPrompt: z.string().max(3000).optional(),
        note: z.string().max(600).optional(),
        level: z.number().int().min(1).max(5).optional(),
        levels: z.array(z.number().int().min(1).max(5)).min(1).max(5).optional(),
        format: z.enum(MEAT_FORMATS).optional(),
        // "Que lo diga un personaje": null takes it away.
        speaker: PieceSpeakerSchema.nullable().optional(),
      })
      .parse(await c.req.json());
    const { state } = await updateAds(id, async (s) => {
      const piece = findPiece(s, pieceId);
      if (!piece) throw new AdsError("Esa pieza no existe.");
      if (patch.status) piece.status = patch.status;
      if (patch.note !== undefined) piece.note = patch.note;
      const visual = ["text", "onScreenText", "visualPrompt", "videoPrompt"] as const;
      let changed = false;
      for (const k of visual) {
        if (patch[k] !== undefined && patch[k] !== piece[k]) {
          piece[k] = patch[k]!;
          changed = true;
        }
      }
      if (piece.kind === "hook" && patch.level) piece.level = toLevel(patch.level);
      if (piece.kind !== "hook" && patch.levels) piece.levels = toLevels(patch.levels, piece.levels);
      if (piece.kind === "meat" && patch.format) piece.format = patch.format;
      // Who says it changes the render (the corner notice, the clip's sound and in point).
      if (patch.speaker !== undefined && JSON.stringify(patch.speaker ?? null) !== JSON.stringify(piece.speaker ?? null)) {
        if (patch.speaker) piece.speaker = patch.speaker;
        else delete piece.speaker;
        changed = true;
      }
      if (changed && s.renders[pieceId]) {
        await removePieceMedia(id, s.renders[pieceId]).catch(() => undefined);
        delete s.renders[pieceId];
      }
    });
    return c.json({ state });
  });

  // Quick approval: many pieces at once (the swipe).
  app.patch("/api/ads/:series/pieces", async (c) => {
    const id = series(c);
    const { ids, status } = z.object({ ids: z.array(PieceId).min(1).max(200), status: z.enum(PIECE_STATUS) }).parse(await c.req.json());
    const { state } = await updateAds(id, (s) => {
      for (const p of pieceLists(s).flat()) if (ids.includes(p.id)) p.status = status;
    });
    return c.json({ state });
  });

  app.delete("/api/ads/:series/pieces/:id", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const { state } = await updateAds(id, async (s) => {
      s.hooks = s.hooks.filter((p) => p.id !== pieceId);
      s.meats = s.meats.filter((p) => p.id !== pieceId);
      s.ctas = s.ctas.filter((p) => p.id !== pieceId);
      const m = s.media[pieceId];
      for (const f of [m?.image, m?.clip?.file, m?.voice?.file, s.renders[pieceId]]) if (f) await removePieceMedia(id, f).catch(() => undefined);
      delete s.media[pieceId];
      delete s.renders[pieceId];
      const st = s.statics[pieceId];
      if (st?.picture) await removePieceMedia(id, st.picture.file).catch(() => undefined);
      if (pieceId.startsWith("H")) await pruneStaticExports(id, pieceId, []);
      delete s.statics[pieceId];
    });
    return c.json({ state });
  });

  // The review before rendering: local checks (length, near-duplicates) plus the writer's pass.
  app.post("/api/ads/:series/review", async (c) => {
    const id = series(c);
    const { handoff } = z.object({ handoff: Handoff }).parse(await c.req.json().catch(() => ({})));
    const state = await loadAds(id);
    const live = <T extends Piece>(xs: T[]) => xs.filter((p) => p.status === "approved");
    const hooks = live(state.hooks);
    const meats = live(state.meats);
    const ctas = live(state.ctas);
    const local = localFlags(hooks, meats, ctas);
    const ids = new Set([...hooks, ...meats, ...ctas].map((p) => p.id));
    if (handoff) {
      if (!ids.size) throw new AdsError("No hay piezas aprobadas para revisar.");
      const make = () => reviewTask(id, state.offer, hooks, meats, ctas);
      if (handoff.mode === "prompt") return c.json(taskPrompt(make()));
      const wire = taskFromPaste(make(), handoff.reply);
      return c.json({ flags: [...local, ...flagsFromWire(wire, ids)], note: wire.note, demo: false, pasted: true });
    }
    if (demo()) return c.json({ flags: local, note: "Revisión de muestra: solo los controles locales (largo y repetidos). Sin clave de IA no se revisan las promesas.", demo: true });
    if (!hooks.length && !meats.length && !ctas.length) return c.json({ flags: local, note: "No hay piezas aprobadas para revisar.", demo: false });
    const wire = await reviewRun(id, state.offer, hooks, meats, ctas);
    return c.json({ flags: [...local, ...flagsFromWire(wire, ids)], note: wire.note, demo: false });
  });

  // A piece's clip, image or voice (raw body).
  app.put("/api/ads/:series/pieces/:id/media/:kind", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const kind = z.enum(["image", "clip", "voice"]).parse(c.req.param("kind"));
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.length) throw new AdsError("El archivo está vacío.");
    const name = (c.req.query("name") ?? "").slice(0, 120);
    const duration = Number(c.req.query("duration")) || 0;
    const file = await savePieceMedia(id, pieceId, kind, data, c.req.header("content-type") ?? "");
    const { state } = await updateAds(id, async (s) => {
      if (!findPiece(s, pieceId)) throw new AdsError("Esa pieza no existe.");
      const m = (s.media[pieceId] ??= {});
      if (kind === "image") m.image = file;
      else m[kind] = { file, name, duration };
      if (s.renders[pieceId]) {
        await removePieceMedia(id, s.renders[pieceId]).catch(() => undefined);
        delete s.renders[pieceId];
      }
    });
    return c.json({ state, file });
  });

  app.delete("/api/ads/:series/pieces/:id/media/:kind", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const kind = z.enum(["image", "clip", "voice"]).parse(c.req.param("kind"));
    const { state } = await updateAds(id, async (s) => {
      const m = s.media[pieceId];
      const file = kind === "image" ? m?.image : m?.[kind]?.file;
      if (file) await removePieceMedia(id, file).catch(() => undefined);
      if (m) delete m[kind];
      if (s.renders[pieceId]) {
        await removePieceMedia(id, s.renders[pieceId]).catch(() => undefined);
        delete s.renders[pieceId];
      }
    });
    return c.json({ state });
  });

  // "Usar en Publicidad": the explainer's renders in its project folder (final render first) and its title.
  app.get("/api/ads/:series/explainers/:project", async (c) => {
    const id = series(c);
    const project = await explainerProject(id, c.req.param("project"));
    return c.json({ videos: explainerVideos(await listProjectFiles(project.id)), title: project.title });
  });

  // An explainer's render becomes the clip of a meat or a CTA (an approved one, or a new one made with its voice text),
  // copied here from the project folder. The piece plays it from `start` for its own seconds (fitClip clamps the in
  // point), and its cached render goes.
  app.post("/api/ads/:series/pieces/from-explainer", async (c) => {
    const id = series(c);
    const body = z
      .object({
        project: z.string().max(80),
        file: z.string().regex(EXPLAINER_VIDEO, "Ese video del explicativo no existe."),
        duration: z.number().positive().max(3600),
        start: z.number().min(0).max(3600).default(0),
        pieceId: z.string().regex(/^[HMC]\d{1,4}$/).optional(),
        create: z.object({ kind: z.enum(EXPLAINER_KINDS), seconds: z.number().min(1).max(15), text: z.string().max(600) }).optional(),
      })
      .refine((b) => Boolean(b.pieceId) !== Boolean(b.create), "Elegí una pieza o creá una nueva.")
      .parse(await c.req.json());
    const project = await explainerProject(id, body.project);
    const { data, type } = await readProjectFile(project.id, body.file);
    const { state, result } = await updateAds(id, async (s) => {
      let piece: Piece | undefined;
      if (body.create) {
        if (!body.create.text.trim()) throw new AdsError("La pieza nueva necesita texto: el explicativo no tiene voz en ese tramo. Escribilo a mano.");
        piece = explainerPiece(s, body.create.kind, body.create.seconds, body.create.text, project.title);
        if (piece.kind === "meat") s.meats.push(piece);
        else if (piece.kind === "cta") s.ctas.push(piece);
      } else {
        piece = findPiece(s, body.pieceId!);
        if (!piece) throw new AdsError("Esa pieza no existe.");
      }
      const fit = fitClip(body.duration, piece.seconds, body.start);
      const file = await savePieceMedia(id, piece.id, "clip", data, type);
      const m = (s.media[piece.id] ??= {});
      m.clip = { file, name: body.file, duration: body.duration, from: fit.start, explainer: { project: project.id, file: body.file, title: project.title.slice(0, 200) } };
      if (s.renders[piece.id]) {
        await removePieceMedia(id, s.renders[piece.id]).catch(() => undefined);
        delete s.renders[piece.id];
      }
      return { pieceId: piece.id, fit };
    });
    return c.json({ state, ...result });
  });

  // The cache: one render per piece.
  app.put("/api/ads/:series/pieces/:id/render", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.length) throw new AdsError("El archivo está vacío.");
    const file = await savePieceRender(id, pieceId, data, c.req.header("content-type") ?? "");
    const { state } = await updateAds(id, async (s) => {
      // An older render under another name (before the version mark, or another format) goes.
      if (s.renders[pieceId] && s.renders[pieceId] !== file) await removePieceMedia(id, s.renders[pieceId]).catch(() => undefined);
      s.renders[pieceId] = file;
    });
    return c.json({ state, file });
  });

  // Drops a piece's cached render, so the next run renders it again (for example, in a browser that encodes H.264).
  app.delete("/api/ads/:series/pieces/:id/render", async (c) => {
    const id = series(c);
    const pieceId = PieceId.parse(c.req.param("id"));
    const { state } = await updateAds(id, async (s) => {
      if (s.renders[pieceId]) await removePieceMedia(id, s.renders[pieceId]).catch(() => undefined);
      delete s.renders[pieceId];
    });
    return c.json({ state });
  });

  // A batch: the combinations (code) and the platform texts (one writer call per 50 hook+CTA pairs).
  app.post("/api/ads/:series/batches", async (c) => {
    const id = series(c);
    const { seconds, mode, rules, ads, copies: pasted } = z
      .object({
        seconds: Seconds,
        mode: z.enum(["full", "stage"]),
        rules: CombineRulesSchema,
        ads: z.array(AdComboSchema).min(1).max(1000),
        // The platform texts already pasted from claude.ai ("Sin clave"), by pair key; the rest are written here.
        copies: z.record(z.string(), AdCopySchema).optional(),
      })
      .parse(await c.req.json());
    const state0 = await loadAds(id);
    // The weekly limit holds here too, not only on the screen.
    const week = adsThisWeek(state0.batches);
    if (week + ads.length > state0.weeklyLimit) {
      throw new AdsError(`Esta tanda (${ads.length}) pasa el límite semanal: ya van ${week} de ${state0.weeklyLimit}. Subí el límite o achicá la tanda.`);
    }
    const pairs = copyPairs(ads, state0.hooks, state0.ctas);
    const copies: Batch["copies"] = {};
    for (const p of pairs) if (pasted?.[p.key]) copies[p.key] = pasted[p.key];
    for (const chunk of copyChunks(
      pairs.filter((p) => !copies[p.key]),
      COPIES_PER_CALL,
    )) {
      const wire = demo() ? sampleCopies(chunk) : await writeCopies(id, state0.offer, chunk);
      Object.assign(copies, copiesFromWire(wire, chunk.map((p) => p.key)));
    }
    const stamp = new Date();
    const day = stamp.toISOString().slice(0, 10);
    const { state, result } = await updateAds(id, (s) => {
      const n = s.batches.filter((b) => b.id.startsWith(`tanda-${day}`)).length + 1;
      const batch: Batch = {
        id: `tanda-${day}-${n}`,
        createdAt: stamp.toISOString(),
        seconds,
        mode,
        rules,
        ads: ads.map((a) => ({ ...a, level: toLevel(a.level) })),
        copies,
        files: {},
      };
      s.batches.push(batch);
      return batch;
    });
    return c.json({ state, batch: result, demo: demo() });
  });

  // The platform texts of a run by copy and paste: one prompt per PASTE_PER_PROMPT.copy pairs. Nothing is saved here:
  // the studio keeps the pasted texts and sends them with the run (POST .../batches, `copies`).
  app.post("/api/ads/:series/copies", async (c) => {
    const id = series(c);
    const { ads, part, handoff } = z.object({ ads: z.array(AdComboSchema).min(1).max(1000), part: Part, handoff: HandoffSchema }).parse(await c.req.json());
    const state0 = await loadAds(id);
    const chunks = copyChunks(copyPairs(ads, state0.hooks, state0.ctas));
    if (!chunks.length) throw new AdsError("Esas combinaciones no tienen hooks ni CTAs que existan.");
    const at = Math.min(chunks.length, part) - 1;
    const chunk = chunks[at];
    const info = { part: at + 1, parts: chunks.length, keys: chunk.map((p) => p.key) };
    const make = () => copiesTask(id, state0.offer, chunk);
    if (handoff.mode === "prompt") return c.json({ ...taskPrompt(make()), ...info });
    const copies = copiesFromWire(taskFromPaste(make(), handoff.reply), info.keys);
    if (!Object.keys(copies).length) throw new AdsError("La respuesta no trae textos para estos pares: fijate que cada uno tenga su «key» (por ejemplo H1-C1) tal como venía en el prompt.");
    return c.json({ copies, ...info, pasted: true });
  });

  app.put("/api/ads/:series/batches/:batch/ads/:adId", async (c) => {
    const id = series(c);
    const batchId = z.string().regex(/^[a-z0-9-]{1,60}$/).parse(c.req.param("batch"));
    const ad = z.string().regex(/^H\d{1,4}-M\d{1,4}-C\d{1,4}$/).parse(c.req.param("adId"));
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.length) throw new AdsError("El archivo está vacío.");
    const file = await saveAdFile(id, batchId, ad, data, c.req.header("content-type") ?? "");
    await updateAds(id, (s) => {
      const b = s.batches.find((x) => x.id === batchId);
      if (!b) throw new AdsError("Esa tanda no existe.");
      b.files[ad] = file.split("/").pop()!;
    });
    return c.json({ file });
  });

  // The CSV next to the videos, ready to upload with them.
  app.post("/api/ads/:series/batches/:batch/csv", async (c) => {
    const id = series(c);
    const batchId = z.string().regex(/^[a-z0-9-]{1,60}$/).parse(c.req.param("batch"));
    const state = await loadAds(id);
    const b = state.batches.find((x) => x.id === batchId);
    if (!b) throw new AdsError("Esa tanda no existe.");
    const csv = campaignCsv(b, state.hooks, state.meats, state.ctas, state.statics);
    const file = await saveBatchCsv(id, batchId, csv);
    return c.json({ file, csv });
  });

  app.delete("/api/ads/:series/batches/:batch", async (c) => {
    const id = series(c);
    const batchId = z.string().regex(/^[a-z0-9-]{1,60}$/).parse(c.req.param("batch"));
    await removeBatchFolder(id, batchId);
    const { state } = await updateAds(id, (s) => {
      s.batches = s.batches.filter((b) => b.id !== batchId);
    });
    return c.json({ state });
  });

  // ── "Versión estática" of the hooks (shared/adsStatic.ts) ──────────────────────
  const hookOf = (s: AdsState, hookId: string) => {
    const h = s.hooks.find((x) => x.id === hookId);
    if (!h) throw new AdsError("Ese hook no existe.");
    return h;
  };

  app.patch("/api/ads/:series/statics/:hookId", async (c) => {
    const id = series(c);
    const hookId = HookId.parse(c.req.param("hookId"));
    const raw = (await c.req.json()) as Record<string, unknown>;
    // Zod fills the schema's defaults in; only the fields the request names change.
    const patch = Object.fromEntries(Object.entries(StaticPatch.parse(raw)).filter(([k]) => raw && typeof raw === "object" && k in raw));
    const { state } = await updateAds(id, (s) => {
      const h = hookOf(s, hookId);
      s.statics[hookId] = { ...(s.statics[hookId] ?? defaultStatic(h)), ...patch };
    });
    return c.json({ state });
  });

  // The picture made in Grok (raw body), with its size in pixels.
  app.put("/api/ads/:series/statics/:hookId/picture", async (c) => {
    const id = series(c);
    const hookId = HookId.parse(c.req.param("hookId"));
    const w = z.coerce.number().int().min(1).max(20000).parse(c.req.query("w"));
    const h = z.coerce.number().int().min(1).max(20000).parse(c.req.query("h"));
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.length) throw new AdsError("El archivo está vacío.");
    hookOf(await loadAds(id), hookId);
    const file = await saveStaticPicture(id, hookId, data, c.req.header("content-type") ?? "");
    const { state } = await updateAds(id, (s) => {
      const hook = hookOf(s, hookId);
      s.statics[hookId] = { ...(s.statics[hookId] ?? defaultStatic(hook)), picture: { file, w, h } };
    });
    return c.json({ state, file });
  });

  app.delete("/api/ads/:series/statics/:hookId/picture", async (c) => {
    const id = series(c);
    const hookId = HookId.parse(c.req.param("hookId"));
    const { state } = await updateAds(id, async (s) => {
      const st = s.statics[hookId];
      if (st?.picture) await removePieceMedia(id, st.picture.file).catch(() => undefined);
      if (st) st.picture = null;
    });
    return c.json({ state });
  });

  // One exported PNG (raw body), named <hookId>[-vN]-<format>.png.
  app.put("/api/ads/:series/statics/:hookId/exports/:file", async (c) => {
    const id = series(c);
    const hookId = HookId.parse(c.req.param("hookId"));
    const file = z.string().max(80).parse(c.req.param("file"));
    if (!staticBelongs(file, hookId)) throw new AdsError("Ese nombre de archivo no es de este hook.");
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.length) throw new AdsError("El archivo está vacío.");
    hookOf(await loadAds(id), hookId);
    const saved = await saveStaticExport(id, hookId, file, data, c.req.header("content-type") ?? "");
    return c.json({ file: saved });
  });

  // After an export: the hook's files are exactly these (older extra ones go) and estaticos.csv is written again.
  app.post("/api/ads/:series/statics/:hookId/exports", async (c) => {
    const id = series(c);
    const hookId = HookId.parse(c.req.param("hookId"));
    const { files } = z.object({ files: z.array(z.string().max(80)).max(500) }).parse(await c.req.json());
    if (files.some((f) => !staticBelongs(f, hookId))) throw new AdsError("Hay un archivo que no es de este hook.");
    await pruneStaticExports(id, hookId, files);
    const { state } = await updateAds(id, (s) => {
      const h = hookOf(s, hookId);
      s.statics[hookId] = { ...(s.statics[hookId] ?? defaultStatic(h)), exports: files };
    });
    const csv = staticsCsv(state.hooks, state.ctas, state.statics);
    const file = await saveStaticsCsv(id, csv);
    return c.json({ state, csv: file });
  });

  app.get("/api/ads/:series/files/*", async (c) => {
    const id = series(c);
    const file = decodeURIComponent(c.req.path.replace(/^\/api\/ads\/[^/]+\/files\//, ""));
    const { data, type } = await readAdsFile(id, file);
    return c.body(new Uint8Array(data), 200, { "Content-Type": type, "Cache-Control": "no-cache" });
  });
}
