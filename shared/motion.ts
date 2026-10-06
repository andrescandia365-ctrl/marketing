// Motion-graphics explainers: a script of scenes, each drawn from a template. The renderer (src/lib/motion.ts) is a
// pure function of time; this file holds the shapes, the normalizer and the timing both sides share, including the
// rule that something new happens on screen every 2 to 4 seconds.
import { z } from "zod";
import type { QualityState } from "./motionQuality.ts";

export const MOTION_TEMPLATES = ["hook", "screen", "zoom", "type", "character", "callouts", "steps", "beforeAfter", "product", "stat", "logo"] as const;
export type MotionTemplate = (typeof MOTION_TEMPLATES)[number];
export const MOTION_TEMPLATE_LABEL: Record<MotionTemplate, string> = {
  hook: "Gancho: palabras que entran",
  screen: "Pantalla en el celular o la compu",
  zoom: "Zoom a una función",
  type: "Texto que se tipea (buscar, escribir)",
  character: "Personaje 3D (presenta, señala, saluda)",
  callouts: "Rótulos sobre la imagen",
  steps: "Paso a paso",
  beforeAfter: "Antes / después",
  product: "Producto con precio u oferta",
  stat: "Número grande",
  logo: "Cierre con logo",
};

// What a character does in its scene.
export const MOTION_GESTURES = ["present", "wave", "point", "cheer", "surprise"] as const;
export type MotionGesture = (typeof MOTION_GESTURES)[number];
export const MOTION_GESTURE_LABEL: Record<MotionGesture, string> = {
  present: "Presenta",
  wave: "Saluda",
  point: "Señala",
  cheer: "Festeja",
  surprise: "Se sorprende",
};

export const MOTION_MOVES = ["idle", "walk", "turnL", "turnR", "point"] as const;
export type MotionMove = (typeof MOTION_MOVES)[number];
export const MOTION_MOVE_LABEL: Record<MotionMove, string> = {
  idle: "Quieto",
  walk: "Camina",
  turnL: "Gira a la izquierda",
  turnR: "Gira a la derecha",
  point: "Señala",
};

export function pickMove(value: string | undefined): MotionMove {
  const v = (value ?? "").toLowerCase();
  if (/turnl|izquierda|left/.test(v)) return "turnL";
  if (/turnr|derecha|right/.test(v)) return "turnR";
  if (/point|señal|senal|apunt/.test(v)) return "point";
  if (/idle|quiet|still|present/.test(v)) return "idle";
  if (/walk|camin/.test(v)) return "walk";
  return "walk";
}

export function pickGesture(value: string | undefined): MotionGesture {
  const v = (value ?? "").toLowerCase();
  if (/salud|wave|hola/.test(v)) return "wave";
  if (/señal|senal|apunt|point|muestr/.test(v)) return "point";
  if (/fest|cheer|celebr|alegr/.test(v)) return "cheer";
  if (/sorpr|surpris|asombr/.test(v)) return "surprise";
  return "present";
}

export const MOTION_MOODS = ["calm", "drive", "bright"] as const;
export type MotionMood = (typeof MOTION_MOODS)[number];
export const MOTION_MOOD_LABEL: Record<MotionMood, string> = { calm: "Tranquila", drive: "Con empuje", bright: "Alegre" };

const SceneWire = z.object({
  template: z
    .string()
    .describe(
      "One of: hook (kinetic title, the first scene), screen (a real screen of the app in a phone or laptop), zoom (zoom into one feature of a real screen and ring it), type (the product in use: a field where the title is typed letter by letter with key sounds, a button is tapped, then the text appears as the result), character (a cast character marked as a 3D puppet talks the voice line with its mouth moving and makes a gesture; it can point at or present a real screen or the product given in assetB), callouts (labels pointing at parts of the product or screen), steps (numbered steps), beforeAfter (two images with a moving divider), product (the product cut-out with its price or offer), stat (one big number that counts up), logo (the brand's logo and a soft call to action, the last scene).",
    ),
  seconds: z.number().describe("2 to 8 seconds; long enough for the voice line at about 2.5 words per second."),
  title: z.string().describe("Up to 6 words, readable on a phone. For stat: starts with the number (e.g. '3 minutos')."),
  text: z.string().describe("Up to 12 words of supporting text, or empty."),
  items: z.array(z.string()).describe("callouts and steps: up to 4 labels of up to 5 words. beforeAfter: [before label, after label]. product: [price or offer]. logo: [call to action]. type: [the field's placeholder, the button's label]. Else empty."),
  asset: z.string().describe("The id of a cast member to show (a real screen, the product, a character, a place), 'layer:N' for an uploaded layer, or empty."),
  assetB: z.string().describe("beforeAfter: the 'after' image id. character: what it points at or presents (a real screen or the product id), or empty. Else empty."),
  gesture: z.string().describe("character only: presenta, saluda, señala, festeja or se sorprende. Else empty."),
  move: z.string().optional().describe("character with a rigged GLB: idle, walk, turnL, turnR or point. Else empty."),
  focusX: z.number().describe("zoom only: the feature's position across the image, 0 to 1."),
  focusY: z.number().describe("zoom only: the feature's position down the image, 0 to 1."),
  zoom: z.number().describe("zoom only: how much to zoom in, 1.5 to 3."),
  voice: z.string().describe("The narrator's line for this scene, in the piece's language. May be empty."),
  emotion: z.string().describe("How the line is said, in Spanish."),
});

export const MotionScriptSchema = z.object({
  problem: z.string().describe("The problem the video solves, plain words, in Spanish."),
  title: z.string().describe("A short title for the video, in Spanish."),
  durationNote: z.string().describe("In Spanish: why this length."),
  scenes: z.array(SceneWire),
  music: z.object({
    mood: z.string().describe("calm, drive or bright."),
    bpm: z.number().describe("Tempo of the synthesized score, 80 to 130."),
  }),
  note: z.string().describe("In Spanish: anything to check (a screen that is missing, a claim to verify). Empty if nothing."),
});

// A hand adjustment from the timeline: when the element enters (seconds from the scene's start, both formats), and
// per format (v: 9:16, h: 16:9, since their layouts differ) how far it moves (dx, dy, in units of the frame's short
// side) and its size (1 = as the template draws it).
export type Spot = { dx?: number; dy?: number; scale?: number };
export type Tweak = { at?: number; v?: Spot; h?: Spot };

export type MotionScene = Omit<z.infer<typeof SceneWire>, "template" | "gesture"> & {
  id: string;
  template: MotionTemplate;
  // Character scenes only (older saved scenes have none: "present").
  gesture?: MotionGesture;
  // Rigged humanoid only. Older scenes have none: the renderer uses "walk".
  move?: MotionMove;
  // By element key (see sceneElements). Empty or missing: the template's own timing and layout.
  tweaks?: Record<string, Tweak>;
};
export type MotionScript = Omit<z.infer<typeof MotionScriptSchema>, "scenes" | "music"> & {
  scenes: MotionScene[];
  music: { mood: MotionMood; bpm: number };
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
let nextId = 0;
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function blankScene(template: MotionTemplate = "screen"): MotionScene {
  return { id: sceneId(), template, seconds: 3, title: "", text: "", items: [], asset: "", assetB: "", gesture: "present", move: "walk", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "" };
}

export function normalizeMotion(wire: z.infer<typeof MotionScriptSchema>): MotionScript {
  const pick = <T extends string>(value: string, list: readonly T[], fallback: T): T =>
    list.find((v) => value.toLowerCase().replace(/[^a-z]/g, "") === v.toLowerCase()) ??
    list.find((v) => value.toLowerCase().includes(v.toLowerCase())) ??
    fallback;
  return {
    ...wire,
    scenes: wire.scenes.map((s) => ({
      ...s,
      id: sceneId(),
      template: pick(s.template, MOTION_TEMPLATES, "screen"),
      gesture: pickGesture(s.gesture),
      move: pickMove(s.move),
      seconds: Math.round(clamp(s.seconds, 2, 8) * 2) / 2,
      items: s.items.map((i) => i.trim()).filter(Boolean).slice(0, 5),
      focusX: clamp(s.focusX, 0, 1),
      focusY: clamp(s.focusY, 0, 1),
      zoom: clamp(s.zoom || 2, 1.2, 4),
    })),
    music: { mood: pick(wire.music.mood, MOTION_MOODS, "drive"), bpm: Math.round(clamp(wire.music.bpm, 80, 130)) },
  };
}

export type TimedScene = MotionScene & { index: number; start: number; end: number };

export function timeScenes(scenes: MotionScene[]): TimedScene[] {
  let t = 0;
  return scenes.map((s, index) => {
    const start = t;
    t += s.seconds;
    return { ...s, index, start, end: t };
  });
}

// Moves each scene boundary onto the beat grid (the synthesized score's beats, or the measured beats of a track),
// so scene changes and their hits land on the music. Every scene keeps at least 1.5 s.
export function snapScenes(scenes: MotionScene[], beats: number[]): MotionScene[] {
  if (beats.length < 2) return scenes;
  const out: MotionScene[] = [];
  let start = 0;
  let wanted = 0;
  for (const s of scenes) {
    wanted += s.seconds;
    const near = beats.reduce((best, b) => (Math.abs(b - wanted) < Math.abs(best - wanted) ? b : best), beats[0]);
    const end = Math.abs(near - wanted) <= 0.6 && near - start >= 1.5 ? near : wanted;
    out.push({ ...s, seconds: Math.round((end - start) * 1000) / 1000 });
    start = end;
  }
  return out;
}

// The timeline's lanes, in order.
export const LANES = ["title", "text", "media", "items", "tag", "moves", "voice"] as const;
export type Lane = (typeof LANES)[number];
export const LANE_LABEL: Record<Lane, string> = {
  title: "Título",
  text: "Texto",
  media: "Imagen",
  items: "Rótulos y pasos",
  tag: "Precio o llamado",
  moves: "Movimientos",
  voice: "Voz",
};

// One thing in a scene the person can move on the timeline. `move` is false for timing-only elements (the zoom, the
// ring, the wipe and the voice), which have no place of their own on screen.
export type SceneElement = { key: string; label: string; lane: Lane; at: number; move: boolean };

const MEDIA_LABEL: Record<MotionTemplate, string> = {
  hook: "Imagen",
  screen: "Pantalla",
  zoom: "Pantalla",
  type: "Campo",
  character: "Personaje",
  callouts: "Imagen",
  steps: "Pantalla",
  beforeAfter: "Antes / después",
  product: "Producto",
  stat: "Imagen",
  logo: "Logo",
};

// Every element of a scene with the second it enters (the template's timing, or the person's), only the ones that
// show something: an empty title or text is not an element.
export function sceneElements(scene: MotionScene): SceneElement[] {
  const d = scene.seconds;
  const list: Omit<SceneElement, "at">[] = [];
  const defaults: Record<string, number> = {};
  const add = (key: string, label: string, lane: Lane, at: number, move = true) => {
    list.push({ key, label, lane, move });
    defaults[key] = at;
  };
  const title = scene.title.trim();
  const text = scene.text.trim();
  const media = MEDIA_LABEL[scene.template];
  switch (scene.template) {
    case "hook":
      if (title) add("title", "Título", "title", 0);
      if (scene.asset) add("media", media, "media", 0.3);
      if (text) add("text", "Texto", "text", 0.8);
      break;
    case "screen":
      add("media", media, "media", 0);
      if (title) add("title", "Título", "title", 0.45);
      if (text) add("text", "Texto", "text", 0.9);
      break;
    case "zoom":
      add("media", media, "media", 0);
      if (title) add("title", "Título", "title", 0.1);
      add("zoom", "Zoom", "moves", 0.6, false);
      add("ring", "Círculo", "moves", Math.min(1.5, d * 0.45), false);
      break;
    case "callouts":
    case "steps": {
      if (scene.template === "callouts") add("media", media, "media", 0);
      if (title) add("title", "Título", "title", scene.template === "callouts" ? 0.1 : 0);
      if (scene.template === "steps" && scene.asset) add("media", media, "media", 0.2);
      const n = Math.max(1, scene.items.length);
      const gap = Math.min(1.1, Math.max(0.35, (d - 1.2) / n));
      scene.items.forEach((item, i) =>
        add(`item${i}`, `${scene.template === "steps" ? "Paso" : "Rótulo"} ${i + 1}${item ? `: ${item}` : ""}`, "items", 0.6 + i * gap),
      );
      break;
    }
    case "beforeAfter":
      if (title) add("title", "Título", "title", 0);
      add("media", media, "media", 0);
      add("wipe", "Cortina", "moves", Math.min(d * 0.4, 1.6), false);
      break;
    case "type": {
      add("media", media, "media", 0);
      const typed = (scene.tweaks?.title?.at ?? 0.35) + typingSeconds(title);
      if (title) add("title", "Texto tipeado", "title", 0.35);
      if (scene.items[1]) add("tag", "Botón", "tag", typed + 0.15);
      if (text) add("text", "Resultado", "text", typed + 0.6);
      break;
    }
    case "character":
      add("media", media, "media", 0);
      if (title) add("title", "Título", "title", 0.3);
      if (scene.assetB) add("prop", "Lo que muestra", "media", 0.45);
      add("gesture", MOTION_GESTURE_LABEL[scene.gesture ?? "present"], "moves", 0.8, false);
      if (text) add("text", "Texto", "text", 1.1);
      break;
    case "product":
      add("media", media, "media", 0);
      if (title) add("title", "Título", "title", 0.15);
      if (scene.items[0]) add("tag", "Precio", "tag", 0.9);
      break;
    case "stat":
      if (title) add("title", "Número", "title", 0);
      if (text) add("text", "Texto", "text", 0.8);
      break;
    case "logo":
      add("media", media, "media", 0);
      if (text) add("text", "Texto", "text", 0.6);
      if (scene.items[0]) add("tag", "Llamado", "tag", 1.0);
      break;
  }
  if (scene.voice.trim()) add("voice", "Voz", "voice", 0.25, false);
  const latest = Math.max(0, d - 0.3);
  return list.map((e) => ({ ...e, at: Math.min(latest, Math.max(0, scene.tweaks?.[e.key]?.at ?? defaults[e.key])) }));
}

// Typing speed of the "type" template, characters per second.
export const TYPE_CPS = 14;
export const typingSeconds = (text: string) => text.length / TYPE_CPS;

// The push between scenes lasts this long (the new scene slides in over the old one).
export const CUT_PUSH = 0.38;

// When an element is fully on screen and still (its entrance done), from the scene's start.
export function settledAt(scene: MotionScene, el: SceneElement): number {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  switch (el.key) {
    case "title":
      if (scene.template === "stat") return el.at + 1.2;
      if (scene.template === "type") return el.at + typingSeconds(scene.title);
      if (scene.template === "logo") return el.at + 0.6;
      // Words rise in one after another.
      return el.at + Math.max(0, words(scene.title) - 1) * 0.11 + 0.45;
    case "text":
    case "tag":
      return el.at + 0.5;
    default:
      return el.at + (el.key.startsWith("item") ? 0.5 : 0.6);
  }
}

// The text an element shows, for the reading check.
function shownText(scene: MotionScene, key: string): string {
  if (key === "title") return scene.template === "logo" ? "" : scene.title;
  if (key === "text") return scene.text;
  if (key === "tag") return scene.template === "type" ? (scene.items[1] ?? "") : (scene.items[0] ?? "");
  if (key.startsWith("item")) return scene.items[Number(key.slice(4))] ?? "";
  if (key === "voice") return scene.voice;
  return "";
}

// Reading time: a line to read stays fully on screen and still about 0.3 s per word (a sentence at least 1.2 s,
// a 1-3 word label 0.8 s), counted from when the whole line is in. The voice's subtitle is on all through its scene.
export function readingNeed(text: string): number {
  const n = text.split(/\s+/).filter(Boolean).length;
  return n <= 3 ? 0.8 : Math.max(1.2, 0.3 * n);
}

export type ReadingIssue = { sceneId: string; index: number; key: string; label: string; text: string; needs: number; has: number };

export function readingIssues(scenes: MotionScene[]): ReadingIssue[] {
  const issues: ReadingIssue[] = [];
  for (const s of timeScenes(scenes)) {
    for (const el of sceneElements(s)) {
      const text = shownText(s, el.key).trim();
      if (!text) continue;
      const has = el.key === "voice" ? s.seconds : s.seconds - settledAt(s, el);
      const needs = readingNeed(text);
      if (has + 0.05 < needs) issues.push({ sceneId: s.id, index: s.index, key: el.key, label: el.key === "voice" ? "Subtítulo" : el.label, text, needs, has: Math.max(0, has) });
    }
  }
  return issues;
}

export const readingKey = (i: ReadingIssue) => `lee:${i.sceneId}:${i.key}`;

// The video's thumbnail is frame 0: the person's choice, the AI's, or the first scene's settled moment (the hook, all
// its words in). Never in the middle of a cut.
export function posterTime(scenes: MotionScene[], chosen?: { t: number } | null): number {
  const timed = timeScenes(scenes);
  const total = timed.at(-1)?.end ?? 0;
  if (!timed.length) return 0;
  let t: number;
  if (chosen && chosen.t >= 0 && chosen.t < total) t = chosen.t;
  else {
    const first = timed[0];
    const settled = Math.max(0, ...sceneElements(first).filter((e) => e.lane !== "voice" && e.lane !== "moves").map((e) => settledAt(first, e)));
    t = Math.min(first.end - 0.1, settled + 0.15);
  }
  const s = timed.find((x) => t >= x.start && t < x.end) ?? timed.at(-1)!;
  if (s.index > 0 && t - s.start < CUT_PUSH + 0.05) t = Math.min(s.end - 0.05, s.start + CUT_PUSH + 0.1);
  return Math.max(0, Math.min(total - 0.04, t));
}

// When each element enters, by key. Keys a scene does not have read as 0.
export function elementTimes(scene: MotionScene): Record<string, number> {
  return Object.fromEntries(sceneElements(scene).map((e) => [e.key, e.at]));
}

// When something new appears on screen, from the scene's start: the cut itself, then each element. The renderer, the
// pops of the sound and the 2-to-4-seconds check all read it.
export function revealTimes(scene: MotionScene): number[] {
  const times = sceneElements(scene)
    .filter((e) => e.lane !== "voice")
    .map((e) => e.at);
  return [...new Set([0, ...times])].sort((a, b) => a - b);
}

// Applies a hand adjustment (v and h merge with what is there); undefined values clear, and empty ones are dropped.
export function tweakScene(scene: MotionScene, key: string, patch: Tweak): MotionScene {
  const old = scene.tweaks?.[key] ?? {};
  const clean = <T extends object>(o: T): T => {
    for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
    return o;
  };
  const next: Tweak = clean({ ...old, ...patch });
  for (const f of ["v", "h"] as const) {
    if (!(f in patch)) continue;
    const spot = patch[f] === undefined ? {} : clean({ ...old[f], ...patch[f] });
    if (Object.keys(spot).length) next[f] = spot;
    else delete next[f];
  }
  const tweaks = { ...scene.tweaks };
  if (Object.keys(next).length) tweaks[key] = next;
  else delete tweaks[key];
  return { ...scene, tweaks };
}

export function motionEvents(scenes: MotionScene[]): number[] {
  return timeScenes(scenes)
    .flatMap((s) => revealTimes(s).filter((r) => r < s.seconds).map((r) => s.start + r))
    .sort((a, b) => a - b);
}

// Stretches where nothing new appears for longer than `max` seconds.
export function quietGaps(scenes: MotionScene[], max = 4): { from: number; to: number }[] {
  const total = scenes.reduce((n, s) => n + s.seconds, 0);
  const points = [...motionEvents(scenes), total];
  const gaps: { from: number; to: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i] - points[i - 1] > max + 0.01) gaps.push({ from: points[i - 1], to: points[i] });
  }
  return gaps;
}

// What a motion piece saves in its project.
export type MotionPiece = {
  script: MotionScript | null;
  durationMode: "auto" | "manual";
  target: number;
  format: "vertical" | "horizontal";
  music: "synth" | "track" | "none";
  voice: "generated" | "recorded" | "none";
  ttsVoice: string;
  // A small line saying some images were made with AI (on by default).
  disclosure: boolean;
  // Quiet stretches the person marked "no es un problema", by "from-to".
  dismissed: string[];
  // Each scene's voice file sits in project media slot 100 + n; layers in 200 + n.
  voiceSlots: Record<string, number>;
  layers: number;
  // Scene changes snap onto the beat grid (on by default); off, the timeline keeps the exact seconds.
  snap: boolean;
  // The last quality loop (the AI's scores before any full render), or none yet.
  quality?: QualityState;
  // Sound effects: the bundled public-domain library (CC0), synthesized in code, or none.
  effects?: "library" | "synth" | "none";
  // The thumbnail (frame 0): chosen by the person ("vos") or the AI ("ia"); none means the automatic one.
  poster?: { t: number; by: "vos" | "ia" } | null;
  // Reading-time warnings the person marked "no es un problema" (readingKey).
  readingOk?: string[];
};

export function newMotionPiece(format: "vertical" | "horizontal"): MotionPiece {
  return {
    script: null,
    durationMode: "auto",
    target: 30,
    format,
    music: "synth",
    voice: "generated",
    ttsVoice: "",
    disclosure: true,
    dismissed: [],
    voiceSlots: {},
    layers: 0,
    snap: true,
    effects: "library",
    poster: null,
    readingOk: [],
  };
}

export const DURATIONS = [15, 30, 45, 60, 90] as const;
