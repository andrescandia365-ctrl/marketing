// "Nota del director" for an explainer: the writer rewrites the whole script to answer one note, and the app keeps
// everything the note did not touch. The writer says, for each scene it returns, which current scene it comes from
// (`from`, the scene's id); a scene it returns unchanged stays exactly as it was (its id, the hand tweaks, its camera,
// its voice), a changed one keeps its id and only the fields that really changed, a new one gets a new id, and a
// current scene the writer did not return is gone. Pure: the server merges, the tests check it.
import { z } from "zod";
import {
  MOTION_MOODS,
  MOTION_TEMPLATES,
  MOTION_TONES,
  beyondNow,
  planCameras,
  sceneElements,
  type MotionCamera,
  type MotionScene,
  type MotionScript,
} from "./motion.ts";
import { WORLD_PLACES, worldOf, type SceneWorld, type WorldPlace } from "./world.ts";
import { clipText } from "./screenVideo.ts";

// The current script as the studio sends it. Old saved scenes may lack the later fields: they get the values the
// studio already reads them with; everything else passes through untouched.
export const MotionScriptInput = z
  .object({
    problem: z.string().default(""),
    title: z.string().default(""),
    durationNote: z.string().default(""),
    note: z.string().default(""),
    caption: z.string().optional(),
    tone: z.enum(MOTION_TONES).optional(),
    // Unknown places read as none.
    world: z.enum(WORLD_PLACES).optional().catch(undefined),
    music: z.object({ mood: z.enum(MOTION_MOODS), bpm: z.number() }),
    scenes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            template: z.enum(MOTION_TEMPLATES),
            seconds: z.number(),
            title: z.string().default(""),
            text: z.string().default(""),
            items: z.array(z.string()).default([]),
            asset: z.string().default(""),
            assetB: z.string().default(""),
            focusX: z.number().default(0.5),
            focusY: z.number().default(0.5),
            zoom: z.number().default(2),
            voice: z.string().default(""),
            emotion: z.string().default(""),
            world: z.enum([...WORLD_PLACES, "none"]).optional().catch(undefined),
          })
          .passthrough(),
      )
      .min(1)
      .max(40),
  })
  .passthrough();

// What the writer reads of the current script: each scene's id and the fields it may change (no tweaks, no flags).
export function noteView(script: MotionScript): string {
  return JSON.stringify(
    {
      problem: script.problem,
      title: script.title,
      music: script.music,
      caption: script.caption ?? "",
      world: script.world ?? "none",
      scenes: script.scenes.map((s) => ({
        id: s.id,
        template: s.template,
        seconds: s.seconds,
        title: s.title,
        text: s.text,
        items: s.items,
        asset: s.asset,
        assetB: s.assetB,
        ...(s.template === "character" && { gesture: s.gesture ?? "present", move: s.move ?? "walk" }),
        entry: s.entry ?? "cut",
        ...(s.template === "beforeAfter" && { reveal: s.reveal ?? "wipe" }),
        camera: s.camera ?? "hold",
        focusX: s.focusX,
        focusY: s.focusY,
        zoom: s.zoom,
        voice: s.voice,
        emotion: s.emotion,
        disclosure: s.disclosure ?? "real",
        beyondToday: beyondNow(s)?.what ?? "",
        world: worldOf(s, script.world) ?? "none",
        clip: clipText(s.recording),
      })),
    },
    null,
    2,
  );
}

// For each scene the writer returned (in its order): the current scene id it comes from ("" = new) and the camera it
// literally asked for, before planCameras (so a camera the person picked changes only when the writer asked).
export type NoteLink = { from: string; camera?: MotionCamera };

export type NoteMerge = {
  script: MotionScript;
  // Ids in the merged script.
  changed: string[];
  added: string[];
  // Ids of current scenes that are gone.
  removed: string[];
  // Kept scenes whose voice line changed: their generated voice no longer says it.
  voiceChanged: string[];
};

const near = (a: number | undefined, b: number | undefined, by: number) => Math.abs((a ?? 0) - (b ?? 0)) <= by;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.trim() === (b[i] ?? "").trim());
const realOf = (d: MotionScene["disclosure"]) => (d === "concept" || d === "simulation" ? d : undefined);

// The current scene with only what the writer really changed (tolerant of the rounding normalizeMotion does, and of
// the defaults an old scene reads with). null: nothing changed.
function changedScene(cur: MotionScene, rev: MotionScene, camera: MotionCamera | undefined, worlds: { cur?: WorldPlace; rev?: WorldPlace }): MotionScene | null {
  const patch: Partial<MotionScene> = {};
  // The place the scene really sits in, before and after; when it changed, the scene keeps its own choice (the piece's
  // place stays the current one).
  const place = worldOf(rev, worlds.rev);
  if (place !== worldOf(cur, worlds.cur)) patch.world = (place ?? "none") === (worlds.cur ?? "none") ? undefined : (place ?? "none");
  if (rev.template !== cur.template) patch.template = rev.template;
  if (!near(rev.seconds, cur.seconds, 0.25)) patch.seconds = rev.seconds;
  for (const k of ["title", "text", "asset", "assetB", "voice", "emotion"] as const) if (rev[k].trim() !== (cur[k] ?? "").trim()) patch[k] = rev[k];
  if (!same(rev.items, cur.items)) patch.items = rev.items;
  const template = rev.template;
  if (template === "character") {
    if ((rev.gesture ?? "present") !== (cur.gesture ?? "present")) patch.gesture = rev.gesture;
    if ((rev.move ?? "walk") !== (cur.move ?? "walk")) patch.move = rev.move;
  }
  if ((rev.entry ?? "cut") !== (cur.entry ?? "cut")) patch.entry = rev.entry;
  if (template === "beforeAfter" && (rev.reveal ?? "wipe") !== (cur.reveal ?? "wipe")) patch.reveal = rev.reveal;
  if (camera && camera !== (cur.camera ?? "hold")) {
    patch.camera = camera;
    patch.cameraBy = "ai";
  }
  // Focus and zoom only matter to the templates that read them (the writer echoes 0.5 and 2 elsewhere).
  if (template === "zoom" || template === "beforeAfter") {
    if (!near(rev.focusX, cur.focusX, 0.01)) patch.focusX = rev.focusX;
    if (!near(rev.focusY, cur.focusY, 0.01)) patch.focusY = rev.focusY;
  }
  if (template === "zoom" && !near(rev.zoom, cur.zoom, 0.01)) patch.zoom = rev.zoom;
  if (realOf(rev.disclosure) !== realOf(cur.disclosure)) patch.disclosure = rev.disclosure ?? "real";
  // "Videos de la app funcionando": the stretch of the recording, compared as the writer reads it.
  if (clipText(rev.recording) !== clipText(cur.recording)) patch.recording = rev.recording;
  if (!Object.keys(patch).length) return null;
  const next: MotionScene = { ...cur, ...patch };
  if ("world" in patch && patch.world === undefined) delete next.world;
  if ("recording" in patch && patch.recording === undefined) delete next.recording;
  // The writer's own flag for what it now shows; else the old one, which stops applying once what it shows changed.
  if (rev.beyond) next.beyond = rev.beyond;
  // Hand tweaks stay on the elements the scene still has; another template is another layout.
  if (patch.template) delete next.tweaks;
  else if (next.tweaks) {
    const keys = new Set(sceneElements(next).map((e) => e.key));
    next.tweaks = Object.fromEntries(Object.entries(next.tweaks).filter(([k]) => keys.has(k)));
  }
  return next;
}

// The writer's revised script (normalized, fresh ids) merged onto the current one through `links` (one per revised
// scene). Each current id is claimed once; a second claim is a new scene. The top fields (problem, title, music,
// caption, notes) come from the writer; the tone stays the piece's.
export function mergeNote(current: MotionScript, revised: MotionScript, links: NoteLink[]): NoteMerge {
  const byId = new Map(current.scenes.map((s) => [s.id, s]));
  const used = new Set<string>();
  const changed: string[] = [];
  const added: string[] = [];
  const voiceChanged: string[] = [];
  const scenes = revised.scenes.map((rev, i) => {
    const from = (links[i]?.from ?? "").trim();
    const cur = byId.get(from);
    if (!cur || used.has(from)) {
      added.push(rev.id);
      // A new scene sits where the writer put it, against the piece's place, which stays the current one.
      const place = worldOf(rev, revised.world);
      const own: SceneWorld | undefined = (place ?? "none") === (current.world ?? "none") ? undefined : (place ?? "none");
      const { world: _w, ...plain } = rev;
      return own ? { ...plain, world: own } : plain;
    }
    used.add(from);
    const next = changedScene(cur, rev, links[i]?.camera, { cur: current.world, rev: revised.world });
    if (!next) return cur;
    changed.push(cur.id);
    if (next.voice.trim() !== cur.voice.trim()) voiceChanged.push(cur.id);
    return next;
  });
  const removed = current.scenes.filter((s) => !used.has(s.id)).map((s) => s.id);
  const tone = current.tone ?? revised.tone;
  const music = revised.music.mood === current.music.mood && revised.music.bpm === current.music.bpm ? current.music : revised.music;
  return {
    // The piece's place stays (a scene the note moves elsewhere carries its own).
    script: { ...current, ...revised, music, tone, world: current.world, scenes: planCameras(scenes, tone) },
    changed,
    added,
    removed,
    voiceChanged,
  };
}

// A generated voice (the studio names it voz-<scene id>.mp3); a recorded, uploaded or imported one is the person's.
export const generatedVoice = (sceneId: string, name: string) => name === `voz-${sceneId}.mp3`;

// What the studio says after a note, in Spanish: which scenes changed (numbered as they now play), what was added or
// removed, and what happened to the voices of scenes whose line changed: `dropped`, a generated voice the studio took
// off; `recorded`, the person's own voice, kept, which still says the old line.
export function noteSummary(merge: NoteMerge, voices: { dropped?: string[]; recorded?: string[] } = {}): string {
  const num = (id: string) => merge.script.scenes.findIndex((s) => s.id === id) + 1;
  const list = (ids: string[]) => ids.map(num).filter((n) => n > 0).sort((a, b) => a - b).join(", ");
  const scenes = (ids: string[]) => `${ids.length === 1 ? "la escena" : "las escenas"} ${list(ids)}`;
  const parts: string[] = [];
  if (merge.changed.length) parts.push(`${merge.changed.length === 1 ? "cambió" : "cambiaron"} ${scenes(merge.changed)}`);
  if (merge.added.length) parts.push(`${merge.added.length === 1 ? "se sumó" : "se sumaron"} ${scenes(merge.added)}`);
  if (merge.removed.length) parts.push(merge.removed.length === 1 ? "se quitó 1 escena" : `se quitaron ${merge.removed.length} escenas`);
  if (!parts.length) return "La nota no cambió ninguna escena.";
  const kept = merge.script.scenes.length - merge.changed.length - merge.added.length;
  let text = `Nota aplicada: ${parts.join(", ")}.${kept > 0 ? " El resto quedó igual, con tus ajustes." : ""}`;
  const dropped = (voices.dropped ?? []).filter((id) => merge.voiceChanged.includes(id));
  const recorded = (voices.recorded ?? []).filter((id) => merge.voiceChanged.includes(id));
  if (dropped.length) text += ` Cambió lo que se dice en ${scenes(dropped)}: la voz generada se sacó, generala de nuevo.`;
  if (recorded.length) text += ` Tu voz grabada en ${scenes(recorded)} todavía dice el texto anterior.`;
  return `${text} Si no te gusta, tocá «Deshacer».`;
}
