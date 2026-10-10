// Motion-graphics explainers: a script of scenes, each drawn from a template. The renderer (src/lib/motion.ts) is a
// pure function of time; this file holds the shapes, the normalizer and the timing both sides share, including the
// rule that something new happens on screen every 2 to 4 seconds.
import { z } from "zod";
import type { QualityState } from "./motionQuality.ts";

export const MOTION_TEMPLATES = ["hook", "screen", "zoom", "type", "character", "callouts", "steps", "beforeAfter", "contradiction", "product", "stat", "logo"] as const;
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
  contradiction: "Contradicción: lo que dicen vs. lo que pasa",
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
      "One of: hook (kinetic title, the first scene), screen (a real screen of the app in a phone or laptop), zoom (zoom into one feature of a real screen and ring it), type (the product in use: a field where the title is typed letter by letter with key sounds, a button is tapped, then the text appears as the result), character (a cast character marked as a 3D puppet talks the voice line with its mouth moving and makes a gesture; it can point at or present a real screen or the product given in assetB), callouts (labels pointing at parts of the product or screen), steps (numbered steps), beforeAfter (two images with a moving divider), contradiction (the Contradiction move: what the system, the label or the habit says, then what really happens, and the first gets struck through; no image needed), product (the product cut-out with its price or offer), stat (one big number that counts up), logo (the brand's logo and a soft call to action, the last scene).",
    ),
  seconds: z.number().describe("2 to 8 seconds; long enough for the voice line at about 2.5 words per second."),
  title: z.string().describe("Up to 6 words, readable on a phone. For stat: starts with the number (e.g. '3 minutos')."),
  text: z.string().describe("Up to 12 words of supporting text, or empty."),
  items: z.array(z.string()).describe("callouts and steps: up to 4 labels of up to 5 words. beforeAfter: [before label, after label]. contradiction: [what is said or shown, what really happens], up to 7 words each, concrete (the number, the object, the hour). product: [price or offer]. logo: [call to action]. type: [the field's placeholder, the button's label]. Else empty."),
  asset: z.string().describe("The id of a cast member to show (a real screen, the product, a character, a place), 'layer:N' for an uploaded layer, or empty."),
  assetB: z.string().describe("beforeAfter: the 'after' image id. character: what it points at or presents (a real screen or the product id), or empty. Else empty."),
  gesture: z.string().describe("character only: presenta, saluda, señala, festeja or se sorprende. Else empty."),
  move: z.string().optional().describe("character with a rigged GLB: idle, walk, turnL, turnR or point. Else empty."),
  entry: z
    .string()
    .optional()
    .describe(
      "How this scene comes in: 'cut' (the tone's change) or 'through' (the camera dives into the previous scene's main thing, the screen, the product, the number, and this scene opens from inside it). Use 'through' once or twice, when this scene lives inside that thing (the shelf, then the product on it, then its expiry date) or to pull back out to the whole. The first scene: cut.",
    ),
  reveal: z
    .string()
    .optional()
    .describe("beforeAfter only: 'wipe' (a divider slides across) or 'iris' (the after grows in a circle from focusX, focusY: the change spreads from one spot). Else empty."),
  focusX: z.number().describe("zoom: the feature's position across the image, 0 to 1. beforeAfter with reveal 'iris': where the change starts, across, 0 to 1. Else 0.5."),
  focusY: z.number().describe("zoom: the feature's position down the image, 0 to 1. beforeAfter with reveal 'iris': where the change starts, down, 0 to 1. Else 0.5."),
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
  caption: z
    .string()
    .describe(
      "The share caption, in Spanish (Rioplatense), in the piece's tone: 1 to 3 sentences, postable as is on X, LinkedIn or Instagram, about this piece's own problem in its own words. Never 'estamos felices de compartir' or generic SaaS phrases. Nothing that is not on the series' working-today list; anything unverified is marked [VERIFY].",
    ),
});

// A hand adjustment from the timeline: when the element enters (seconds from the scene's start, both formats), and
// per format (v: 9:16, h: 16:9, since their layouts differ) how far it moves (dx, dy, in units of the frame's short
// side) and its size (1 = as the template draws it).
export type Spot = { dx?: number; dy?: number; scale?: number };
export type Tweak = { at?: number; v?: Spot; h?: Spot };

export type MotionScene = Omit<z.infer<typeof SceneWire>, "template" | "gesture" | "entry" | "reveal"> & {
  id: string;
  template: MotionTemplate;
  // How the scene comes in. Older scenes have none: the tone's cut.
  entry?: SceneEntry;
  // beforeAfter only. Older scenes have none: the wipe.
  reveal?: BeforeAfterReveal;
  // Character scenes only (older saved scenes have none: "present").
  gesture?: MotionGesture;
  // Rigged humanoid only. Older scenes have none: the renderer uses "walk".
  move?: MotionMove;
  // Older scenes have none: the camera stays still.
  camera?: MotionCamera;
  // By element key (see sceneElements). Empty or missing: the template's own timing and layout.
  tweaks?: Record<string, Tweak>;
  // Only on the arranged copy (snapElements), never saved: an element's template time moved onto a beat. A hand-set
  // `at` always wins over it.
  onBeat?: Record<string, number>;
};
export type MotionScript = Omit<z.infer<typeof MotionScriptSchema>, "scenes" | "music" | "caption"> & {
  scenes: MotionScene[];
  music: { mood: MotionMood; bpm: number };
  // Older saved scripts have neither: no caption, the warm tone.
  caption?: string;
  tone?: MotionTone;
};

// The brief's comic voice sets the explainer's pace (PLAYBOOK §3.1, voice → pacing): how a scene changes and how many
// effects sound. Dry: hard cuts, only the big moments sound. Warm: a soft push. Absurdist: a fast push, every hit.
export const MOTION_TONES = ["dry", "warm", "absurdist"] as const;
export type MotionTone = (typeof MOTION_TONES)[number];
export const MOTION_TONE_LABEL: Record<MotionTone, string> = { dry: "Seco", warm: "Cálido", absurdist: "Absurdo" };
const TONE_CUT: Record<MotionTone, number> = { dry: 0, warm: 0.38, absurdist: 0.2 };
// How long the change between two scenes lasts (0: a hard cut).
export const cutPush = (tone?: MotionTone) => TONE_CUT[tone ?? "warm"];

// How a scene comes in. "cut" is the tone's change (cutPush). "through" is a camera journey: the camera dives into the
// previous scene's main thing and this scene opens from inside it, in a growing circle. It takes THROUGH seconds
// whatever the tone, so every check that waits for a scene to arrive reads pushOf(scene, push).
export const SCENE_ENTRIES = ["cut", "through"] as const;
export type SceneEntry = (typeof SCENE_ENTRIES)[number];
export const SCENE_ENTRY_LABEL: Record<SceneEntry, string> = { cut: "Corte del tono", through: "Pasar a través" };
export const THROUGH = 0.7;

export const pickEntry = (value: string | undefined): SceneEntry | undefined => (/through|trav[eé]s|dive|zoom/i.test(value ?? "") ? "through" : undefined);

// How "Antes / después" changes: a divider that slides, or a circle that grows from one spot.
export const BEFORE_AFTER_REVEALS = ["wipe", "iris"] as const;
export type BeforeAfterReveal = (typeof BEFORE_AFTER_REVEALS)[number];
export const BEFORE_AFTER_REVEAL_LABEL: Record<BeforeAfterReveal, string> = { wipe: "Cortina", iris: "Círculo que crece" };
export const pickReveal = (value: string | undefined): BeforeAfterReveal | undefined => (/iris|c[ií]rc|circle/i.test(value ?? "") ? "iris" : undefined);

// A camera move inside one explainer scene. Hold is the default so older scenes stay put.
// x and y are fractions of the frame; z is scale. u is 0 at the scene start and 1 at its end.
export const MOTION_CAMERAS = ["hold", "push", "pull", "pan", "drift"] as const;
export type MotionCamera = (typeof MOTION_CAMERAS)[number];
export const MOTION_CAMERA_LABEL: Record<MotionCamera, string> = {
  hold: "Quieta",
  push: "Se acerca",
  pull: "Se aleja",
  pan: "Paneo",
  drift: "Deriva",
};
export function cameraAt(camera: MotionCamera | undefined, u: number): { z: number; x: number; y: number } {
  const raw = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0));
  const t = raw * raw * (3 - 2 * raw);
  // z stays high enough that the shift never uncovers the edge: |x| and |y| stay under (z - 1) / 2.
  if (camera === "push") return { z: 1 + 0.14 * t, x: 0, y: 0 };
  if (camera === "pull") return { z: 1.14 - 0.14 * t, x: 0, y: 0 };
  if (camera === "pan") return { z: 1.16, x: (t - 0.5) * 0.12, y: 0 };
  if (camera === "drift") return { z: 1.12, x: Math.sin(raw * Math.PI) * 0.045, y: (0.5 - raw) * 0.035 };
  return { z: 1, x: 0, y: 0 };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
let nextId = 0;
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function blankScene(template: MotionTemplate = "screen"): MotionScene {
  return { id: sceneId(), template, seconds: 3, title: "", text: "", items: [], asset: "", assetB: "", gesture: "present", move: "walk", camera: "hold", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "" };
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
      entry: pickEntry(s.entry),
      reveal: s.template.toLowerCase().includes("before") ? pickReveal(s.reveal) : undefined,
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
// The big moments of an explainer: the product and the logo arrive on the music's strongest hits (PLAYBOOK §3.1).
export const BIG_MOMENTS: readonly MotionTemplate[] = ["product", "logo"];

// Each cut into a big moment moves to a strong hit only when that does not leave a line too short to read or a still
// stretch: reading wins over the beat (PLAYBOOK §3.1).
export function snapScenes(scenes: MotionScene[], beats: number[], strong: number[] = [], push = CUT_PUSH): MotionScene[] {
  let best = snapWith(scenes, beats, strong, new Set());
  if (!strong.length) return best;
  let chosen = new Set<number>();
  scenes.forEach((_, i) => {
    if (!scenes[i + 1] || !BIG_MOMENTS.includes(scenes[i + 1].template)) return;
    const tryOn = new Set([...chosen, i]);
    const next = snapWith(scenes, beats, strong, tryOn);
    if (readingIssues(next, push).length <= readingIssues(best, push).length && quietGaps(next, push).length <= quietGaps(best, push).length) {
      best = next;
      chosen = tryOn;
    }
  });
  return best;
}

// No scene is left shorter than this by snapping its cuts to the beats.
export const MIN_SCENE = 1.5;

function snapWith(scenes: MotionScene[], beats: number[], strong: number[], bigCuts: Set<number>): MotionScene[] {
  if (beats.length < 2) return scenes;
  const out: MotionScene[] = [];
  let start = 0;
  let wanted = 0;
  const nearest = (list: number[], t: number) => list.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), list[0]);
  scenes.forEach((s, i) => {
    wanted += s.seconds;
    let end = wanted;
    // The cut into a big moment goes to a strong hit when one is within a second (both scenes keep 1.5 s).
    const next = scenes[i + 1];
    const big = next && bigCuts.has(i) && strong.length ? nearest(strong, wanted) : null;
    if (big !== null && Math.abs(big - wanted) <= 1 && big - start >= 1.5 && next.seconds - (big - wanted) >= 1.5) end = big;
    else {
      // The nearest beat within 0.6 s that leaves this scene and the next one 1.5 s each, else the next nearest (the
      // beat on the other side), else the cut stays where it was planned. The next scene is measured to its own
      // planned end: its own snap only moves that end when it keeps 1.5 s.
      const nextEnd = next ? wanted + next.seconds : Infinity;
      const fits = beats
        .filter((b) => Math.abs(b - wanted) <= 0.6)
        .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))
        .find((b) => b - start >= MIN_SCENE && nextEnd - b >= MIN_SCENE);
      end = fits ?? wanted;
    }
    out.push({ ...s, seconds: Math.round((end - start) * 1000) / 1000 });
    // Planned ends do not move: what this cut took or gave comes out of the next scene.
    start = end;
  });
  return out;
}

// How far an element's template time may move to land on a beat (PLAYBOOK §3.1: smaller entrances within ~0.10 s).
export const ELEMENT_SNAP = 0.1;

// Moves each element's template time onto the nearest beat when one is within ELEMENT_SNAP, so an entrance, its
// sound and every check read the same second. Hand-set times (tweaks) stay where the person put them; the voice is
// never moved, and what enters with the cut stays with it. Returns scenes with `onBeat` (never saved).
export function snapElements(scenes: MotionScene[], beats: number[], within = ELEMENT_SNAP): MotionScene[] {
  if (beats.length < 2) return scenes;
  return timeScenes(scenes).map(({ index: _index, start, end: _end, ...scene }) => {
    const onBeat: Record<string, number> = {};
    const decided = new Set<string>();
    // One at a time, in order: some template times follow others (the typed text's button and result).
    for (;;) {
      const next = sceneElements({ ...scene, onBeat })
        .filter((e) => !decided.has(e.key) && e.lane !== "voice" && scene.tweaks?.[e.key]?.at === undefined)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      decided.add(next.key);
      if (next.at <= 0.001) continue;
      const near = beats.reduce((best, b) => (Math.abs(b - start - next.at) < Math.abs(best - start - next.at) ? b : best), beats[0]);
      const local = Math.round((near - start) * 1000) / 1000;
      if (Math.abs(local - next.at) <= within && local >= 0 && local <= scene.seconds - 0.3) onBeat[next.key] = local;
    }
    return Object.keys(onBeat).length ? { ...scene, onBeat } : scene;
  });
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
  contradiction: "Imagen",
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
    case "contradiction": {
      // What is said, then (once it has been read) what really happens, then the first one is struck through.
      if (title) add("title", "Título", "title", 0);
      // The first is fully in at 0.85 s; the second follows once it has had time to be read. The strike follows the
      // second wherever it was put (by hand or on a beat), so nothing is struck before what contradicts it is there.
      const real = 0.85 + Math.min(1.2, Math.max(0.6, (d - 1.2) / 3));
      const realAt = scene.tweaks?.item1?.at ?? scene.onBeat?.item1 ?? real;
      if (scene.items[0]) add("item0", `Lo que dicen: ${scene.items[0]}`, "items", 0.35);
      if (scene.items[1]) add("item1", `Lo que pasa: ${scene.items[1]}`, "items", real);
      if (scene.items[0] && scene.items[1]) add("strike", "Tachado", "moves", realAt + 0.7, false);
      break;
    }
    case "type": {
      add("media", media, "media", 0);
      const typed = (scene.tweaks?.title?.at ?? scene.onBeat?.title ?? 0.35) + typingSeconds(title);
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
    case "stat": {
      // The supporting line waits for the number to stop counting.
      const counted = (scene.tweaks?.title?.at ?? scene.onBeat?.title ?? 0) + STAT_COUNT + 0.1;
      if (title) add("title", "Número", "title", 0);
      if (text) add("text", "Texto", "text", title ? counted : 0.8);
      break;
    }
    case "logo":
      add("media", media, "media", 0);
      if (text) add("text", "Texto", "text", 0.6);
      if (scene.items[0]) add("tag", "Llamado", "tag", 1.0);
      break;
  }
  if (scene.voice.trim()) add("voice", "Voz", "voice", 0.25, false);
  const latest = Math.max(0, d - 0.3);
  return list.map((e) => ({ ...e, at: Math.min(latest, Math.max(0, scene.tweaks?.[e.key]?.at ?? scene.onBeat?.[e.key] ?? defaults[e.key])) }));
}

// How long the stat template's number counts up.
export const STAT_COUNT = 1.2;

// The stat template's title while its number counts up (p from 0 to 1): the number in the title's own format
// (its thousands mark, its decimal mark, its decimals, what comes before and after it), and at the end the title
// exactly as written. A title whose number is not a quantity ("24/7", "6:00") does not count: it is shown as is.
export function statCountText(title: string, p: number): string {
  const m = title.match(/^(\D*?)(\d+(?:[.,]\d+)*)(.*)$/s);
  if (!m || p >= 1) return title;
  const [, before, digits, after] = m;
  if (/^[/:]\d/.test(after)) return title;
  const marks = digits.match(/[.,]/g) ?? [];
  const groups = digits.split(/[.,]/);
  // One kind of mark followed only by groups of three digits is a thousands mark ("1.500", "12,000"); otherwise
  // the last mark is the decimal one ("2,5", "1.234,5").
  // "0,125" is a decimal whatever its digits: no thousands start with 0.
  const allThousands = marks.length > 0 && new Set(marks).size === 1 && groups[0] !== "0" && groups.slice(1).every((g) => g.length === 3);
  const decimalMark = !marks.length || allThousands ? "" : marks[marks.length - 1];
  const thousandsMark = allThousands ? marks[0] : marks.length > 1 ? marks[0] : "";
  const decimals = decimalMark ? groups[groups.length - 1].length : 0;
  const whole = decimalMark ? groups.slice(0, -1).join("") : groups.join("");
  const value = Number(`${whole}.${decimalMark ? groups[groups.length - 1] : "0"}`);
  if (!Number.isFinite(value)) return title;
  const shown = (Math.max(0, p) * value).toFixed(decimals);
  const [int, frac] = shown.split(".");
  const grouped = thousandsMark ? int.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsMark) : int;
  return `${before}${grouped}${frac !== undefined ? `${decimalMark}${frac}` : ""}${after}`;
}

// Typing speed of the "type" template, characters per second.
export const TYPE_CPS = 14;
export const typingSeconds = (text: string) => text.length / TYPE_CPS;

// The push between scenes in the warm tone (the new scene slides in over the old one); see cutPush for the others.
export const CUT_PUSH = 0.38;

// When an element is fully on screen and still (its entrance done), from the scene's start. `push`: how long this
// scene slides in over the previous one (cutPush; 0 for the first scene and for hard cuts). Nothing is still before
// the push ends, whatever its own entrance says.
export function settledAt(scene: MotionScene, el: SceneElement, push = 0): number {
  return Math.max(push, entranceDone(scene, el));
}

function entranceDone(scene: MotionScene, el: SceneElement): number {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  switch (el.key) {
    case "title":
      if (scene.template === "stat") return el.at + STAT_COUNT;
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

// How long a scene comes in over the one before it: the tone's push, or THROUGH for a camera journey; 0 for the first.
export const pushOf = (scene: { index: number; entry?: SceneEntry }, push: number) =>
  scene.index > 0 ? (scene.entry === "through" ? THROUGH : push) : 0;

// The text an element shows, for the reading check.
function shownText(scene: MotionScene, key: string): string {
  if (key === "title") return scene.template === "logo" ? "" : scene.title;
  if (key === "text") return scene.text;
  if (key === "tag") return scene.template === "type" ? (scene.items[1] ?? "") : (scene.items[0] ?? "");
  if (key.startsWith("item")) return scene.items[Number(key.slice(4))] ?? "";
  if (key === "voice") return scene.voice;
  return "";
}

// Reading speed for short on-screen text, in letters and digits per second (spaces and punctuation are free).
// 15 a second is 0.3 s per word for words of 4.5 letters, about the average of running Spanish with its short "de",
// "el", "que", so ordinary lines keep the word rule; it is close to the ~17 characters a second, spaces included,
// that subtitle guides allow adults. A rule of thumb [NOT SURE], not measured on our pieces.
export const READ_LETTERS_PER_SECOND = 15;

// Reading time: a line to read stays fully on screen and still about 0.3 s per word (a sentence at least 1.2 s,
// a 1-3 word label 0.8 s), counted from when the whole line is in, and never less than its letters take: Spanish
// words run long, and "Planificación automatizada" (2 words, 25 letters) needs 1.7 s where "Se lava" keeps 0.8 s.
// The letters' time is rounded to the tenth, as the studio shows it. The voice's subtitle is on all through its scene.
export function readingNeed(text: string): number {
  const n = text.split(/\s+/).filter(Boolean).length;
  const byWords = n <= 3 ? 0.8 : Math.max(1.2, 0.3 * n);
  const letters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return Math.max(byWords, Math.round((letters / READ_LETTERS_PER_SECOND) * 10) / 10);
}

export type ReadingIssue = { sceneId: string; index: number; key: string; label: string; text: string; needs: number; has: number };

// `push`: the tone's change between scenes (cutPush); a line inside a scene that is still sliding in is not readable yet.
export function readingIssues(scenes: MotionScene[], push: number): ReadingIssue[] {
  const issues: ReadingIssue[] = [];
  for (const s of timeScenes(scenes)) {
    for (const el of sceneElements(s)) {
      const text = shownText(s, el.key).trim();
      if (!text) continue;
      const has = el.key === "voice" ? s.seconds : s.seconds - settledAt(s, el, pushOf(s, push));
      const needs = readingNeed(text);
      if (has + 0.05 < needs) issues.push({ sceneId: s.id, index: s.index, key: el.key, label: el.key === "voice" ? "Subtítulo" : el.label, text, needs, has: Math.max(0, has) });
    }
  }
  return issues;
}

export const readingKey = (i: ReadingIssue) => `lee:${i.sceneId}:${i.key}`;

// The video's thumbnail is frame 0: the person's choice, the AI's, or the first scene's settled moment (the hook, all
// its words in). Never in the middle of a cut.
export function posterTime(scenes: MotionScene[], chosen?: { t: number } | null, cut = CUT_PUSH): number {
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
  const coming = pushOf(s, cut);
  if (coming > 0 && t - s.start < coming + 0.05) t = Math.min(s.end - 0.05, s.start + coming + 0.1);
  return Math.max(0, Math.min(total - 0.04, t));
}

// When each element enters, by key. Keys a scene does not have read as 0.
export function elementTimes(scene: MotionScene): Record<string, number> {
  return Object.fromEntries(sceneElements(scene).map((e) => [e.key, e.at]));
}

// How far a scene's voice runs past the scene's end, in seconds (0 or less: it fits). The line starts at the voice mark.
// What runs past is faded out at the scene's end in the mix, so it never talks over the next scene.
export function voiceOverrun(scene: MotionScene, voiceSeconds: number): number {
  return (elementTimes(scene).voice ?? 0.25) + voiceSeconds - scene.seconds;
}

// What a scene keeps after its voice ends when it is fitted to it ("Ajustar al largo de la voz").
export const VOICE_TAIL = 0.4;
// Scenes last 2 to 8 s (the timeline's limits).
export const SCENE_SECONDS = { min: 2, max: 8 } as const;

// "Ajustar al largo de la voz": the scene's new length (as written in the script, before the beats) so that its voice
// ends VOICE_TAIL before the cut, with the cut on the first beat after that when the cuts follow the beats (`beats`
// empty otherwise). `arranged` is the script as it plays (arrangeScenes), so the voice mark and the scene's real
// start count. Null when the scene is not there. Clamped to 2–8 s: a longer voice is still faded at the end.
export function voiceFitSeconds(raw: MotionScene[], arranged: MotionScene[], sceneId: string, voiceSeconds: number, beats: number[]): number | null {
  const i = raw.findIndex((s) => s.id === sceneId);
  const played = timeScenes(arranged)[i];
  if (i < 0 || !played || played.id !== sceneId) return null;
  const plannedStart = raw.slice(0, i).reduce((n, s) => n + s.seconds, 0);
  const target = played.start + (elementTimes(played).voice ?? 0.25) + voiceSeconds + VOICE_TAIL;
  const onBeat = beats.length >= 2 ? beats.find((b) => b >= target - 1e-6) : undefined;
  const seconds = onBeat !== undefined ? Math.round((onBeat - plannedStart) * 1000) / 1000 : Math.ceil((target - plannedStart) * 10 - 1e-9) / 10;
  return Math.min(SCENE_SECONDS.max, Math.max(SCENE_SECONDS.min, seconds));
}

// When something new appears on screen, from the scene's start: the cut itself, then each element. What enters while
// the scene is still sliding in (`push`) arrives with the cut, not on its own. The 2-to-4-seconds check reads it.
export function revealTimes(scene: MotionScene, push = 0): number[] {
  const times = sceneElements(scene)
    .filter((e) => e.lane !== "voice")
    .map((e) => (e.at < push ? 0 : e.at));
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

export function motionEvents(scenes: MotionScene[], push: number): number[] {
  return timeScenes(scenes)
    .flatMap((s) => revealTimes(s, pushOf(s, push)).filter((r) => r < s.seconds).map((r) => s.start + r))
    .sort((a, b) => a - b);
}

// Stretches where nothing new appears for longer than `max` seconds. `push`: the tone's change between scenes.
export function quietGaps(scenes: MotionScene[], push: number, max = 4): { from: number; to: number }[] {
  const total = scenes.reduce((n, s) => n + s.seconds, 0);
  const points = [...motionEvents(scenes, push), total];
  const gaps: { from: number; to: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i] - points[i - 1] > max + 0.01) gaps.push({ from: points[i - 1], to: points[i] });
  }
  return gaps;
}

// A track's beat clock, measured on its drums stem (shared/clock.ts fitKicks), never on the track itself: the kicks
// (cuts and accents land on them) and the downbeats (the big moments). From a stem the person exported, or Demucs.
export type TrackKicks = {
  kicks: number[];
  downbeats: number[];
  bpm: number;
  medianErrorMs: number;
  // One steady tempo (false: the tempo moves; the kicks still hold).
  usable: boolean;
  source: "stem" | "demucs";
  // The stem's file name, or the track's for Demucs.
  name: string;
};

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
  // Numbers on screen the person confirmed although "Lo que existe hoy" and the brief do not have them (figureKey).
  figuresOk?: string[];
  // The track's beat clock from its drums stem; none: a track has no grid.
  kickGrid?: TrackKicks | null;
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
    figuresOk: [],
  };
}

export const DURATIONS = [15, 30, 45, 60, 90] as const;

// ── Numbers with a source ──────────────────────────────────────────────────────────────
// A number on screen (or in the voice, which is also the subtitle) is a claim. It must come from the series'
// "Lo que existe hoy" or from the brief, or the person confirms it; "[VERIFY]" on screen stops the render until the
// text changes (playbook: nothing unverified ships).

// The numbers in a text, written one way: "1.500" and "1500" are "1500", "2,5" is "2.5", a time is "6:00" ("06:00"
// too). Digits glued after a letter are part of a name ("mp3", "B2B"), not a figure.
export function figuresIn(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/(?<![\p{L}\d])(?:\d{1,2}:\d{2}|\d+(?:[.,]\d+)*)/gu) ?? []) {
    if (raw.includes(":")) {
      const [hh, mm] = raw.split(":");
      out.push(`${Number(hh)}:${mm}`);
      continue;
    }
    const marks = raw.match(/[.,]/g) ?? [];
    const groups = raw.split(/[.,]/);
    const thousands = marks.length > 0 && new Set(marks).size === 1 && groups[0] !== "0" && groups.slice(1).every((g) => g.length === 3);
    const value = thousands || !marks.length ? Number(groups.join("")) : Number(`${groups.slice(0, -1).join("")}.${groups[groups.length - 1]}`);
    if (Number.isFinite(value)) out.push(String(value));
  }
  return out;
}

// "[VERIFY]", "[VERIFY: the number]", "[VERIFICAR]", "[A VERIFICAR]".
export const VERIFY_MARK = /\[\s*(?:a\s+)?(?:verify|verificar)\b[^\]]*\]/i;

export type FigureIssue = { sceneId: string; index: number; key: string; label: string; text: string; figure: string; verify: boolean };
export const figureKey = (i: FigureIssue) => `cifra:${i.sceneId}:${i.key}:${i.figure}`;

// How many of a scene's items its template draws (labels, steps, the two statements, the price, the call to action,
// the field and its button); the rest are never on screen.
const DRAWN_ITEMS: Partial<Record<MotionTemplate, number>> = { callouts: 5, steps: 5, contradiction: 2, beforeAfter: 2, product: 1, logo: 1, type: 2 };

// What each scene really shows or says, by element key. The logo template draws its title when there is no logo.
function sceneTexts(s: MotionScene): { key: string; label: string; text: string }[] {
  const keys = new Set(sceneElements(s).map((e) => e.key));
  return [
    ...(keys.has("title") || s.template === "logo" ? [{ key: "title", label: s.template === "stat" ? "Número" : "Título", text: s.title }] : []),
    ...(keys.has("text") ? [{ key: "text", label: "Texto", text: s.text }] : []),
    ...s.items.slice(0, DRAWN_ITEMS[s.template] ?? 0).map((text, i) => ({ key: `item${i}`, label: `Rótulo ${i + 1}`, text })),
    { key: "voice", label: "Voz y subtítulo", text: s.voice },
  ].filter((x) => x.text.trim());
}

// Every number without a source, and every "[VERIFY]" left on screen. `sources`: the series' "Lo que existe hoy" and
// "Cómo se trabaja hoy" and the brief, as text. A time on the hour and the bare hour count as the same figure.
export function figureIssues(scenes: MotionScene[], sources: string): FigureIssue[] {
  const known = new Set(figuresIn(sources).flatMap((f) => (f.endsWith(":00") ? [f, f.slice(0, -3)] : [f])));
  const issues: FigureIssue[] = [];
  scenes.forEach((s, index) => {
    for (const { key, label, text } of sceneTexts(s)) {
      if (VERIFY_MARK.test(text)) issues.push({ sceneId: s.id, index, key, label, text, figure: "[VERIFY]", verify: true });
      for (const figure of new Set(figuresIn(text))) {
        if (!known.has(figure) && !(figure.endsWith(":00") && known.has(figure.slice(0, -3)))) issues.push({ sceneId: s.id, index, key, label, text, figure, verify: false });
      }
    }
  });
  return issues;
}
