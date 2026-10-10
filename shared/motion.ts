// Motion-graphics explainers: a script of scenes, each drawn from a template. The renderer (src/lib/motion.ts) is a
// pure function of time; this file holds the shapes, the normalizer and the timing both sides share, including the
// rule that something new happens on screen every 2 to 4 seconds.
import type { HeardWordTimes } from "./subtitles.ts";
import { z } from "zod";
import type { QualityState } from "./motionQuality.ts";

export const MOTION_TEMPLATES = ["hook", "screen", "zoom", "type", "character", "callouts", "steps", "beforeAfter", "contradiction", "notify", "flow", "slots", "product", "stat", "logo"] as const;
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
  notify: "Avisos: notificaciones que llegan",
  flow: "Flujo: de un origen a varios lados",
  slots: "Casilleros: se llenan escena a escena",
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

// "Personaje de los explicativos": the series' host takes the character scenes. `characters` are the cast's
// character ids; with `keepOthers` (the studio) a scene that already has another character keeps it, without it (the
// writer) every character scene is the host's, so it is the same one in every piece. What was in `asset` when it is
// not a character (a screen, the product) becomes what the host presents, unless the scene already presents
// something. No host: the scenes as they are.
export function hostScenes<S extends { template: string; asset: string; assetB?: string }>(
  scenes: S[],
  host: string | null | undefined,
  characters: readonly string[],
  keepOthers: boolean,
): S[] {
  if (!host) return scenes;
  return scenes.map((s) => {
    if (s.template !== "character" || s.asset === host) return s;
    const isCharacter = characters.includes(s.asset);
    if (isCharacter && keepOthers) return s;
    const shown = s.assetB || (s.asset && !isCharacter ? s.asset : "");
    return { ...s, asset: host, assetB: shown === host ? "" : shown };
  });
}

export const MOTION_MOODS = ["calm", "drive", "bright"] as const;
export type MotionMood = (typeof MOTION_MOODS)[number];
export const MOTION_MOOD_LABEL: Record<MotionMood, string> = { calm: "Tranquila", drive: "Con empuje", bright: "Alegre" };

const SceneWire = z.object({
  template: z
    .string()
    .describe(
      "One of: hook (kinetic title, the first scene), screen (a real screen of the app in a phone or laptop), zoom (zoom into one feature of a real screen and ring it), type (the product in use: a field where the title is typed letter by letter with key sounds, a button is tapped, then the text appears as the result), character (a cast character marked as a 3D puppet talks the voice line with its mouth moving and makes a gesture; it can point at or present a real screen or the product given in assetB), callouts (labels pointing at parts of the product or screen), steps (numbered steps), beforeAfter (two images with a moving divider), contradiction (the Contradiction move: what the system, the label or the habit says, then what really happens, and the first gets struck through; no image needed), notify (notifications arrive one by one as cards, each with a short title and body: the messages, alerts or reminders the person gets), flow (one source fans out to several places: the lines draw in one by one, each ending in its label; the title is the source), slots (the open loop on screen: a row of empty boxes named in the first slots scene; each later slots scene fills the next box, and the ones filled before stay filled), product (the product cut-out with its price or offer), stat (one big number that counts up), logo (the brand's logo and a soft call to action, the last scene).",
    ),
  seconds: z.number().describe("2 to 8 seconds; long enough for the voice line at about 2.5 words per second."),
  title: z.string().describe("Up to 6 words, readable on a phone. For stat: starts with the number (e.g. '3 minutos'). For flow: the source, up to 3 words."),
  text: z.string().describe("Up to 12 words of supporting text, or empty."),
  items: z.array(z.string()).describe("callouts and steps: up to 4 labels of up to 5 words. beforeAfter: [before label, after label]. contradiction: [what is said or shown, what really happens], up to 7 words each, concrete (the number, the object, the hour). notify: up to 3 notifications, each 'title | body' (title up to 3 words, body up to 6). flow: up to 4 places the source goes to, up to 3 words each. slots: only in the first slots scene, up to 5 box names of up to 3 words; later slots scenes leave items empty (each fills the next box). product: [price or offer]. logo: [call to action]. type: [the field's placeholder, the button's label]. Else empty."),
  asset: z.string().describe("The id of a cast member to show (a real screen, the product, a character, a place), 'layer:N' for an uploaded layer, or empty."),
  assetB: z.string().describe("beforeAfter: the 'after' image id. character: what it points at or presents (a real screen or the product id), or empty. Else empty."),
  gesture: z.string().describe("character only: presenta, saluda, señala, festeja or se sorprende. Else empty."),
  move: z.string().optional().describe("character with a rigged GLB: idle, walk, turnL, turnR or point. Else empty."),
  entry: z
    .string()
    .optional()
    .describe(
      "How this scene comes in: 'cut' (the tone's change; when this scene shows the same picture as the previous one, the same real screen, product or image, the app carries it across from where it was to where it settles by itself), 'match' (ask for that carry explicitly; only when both scenes show the same picture) or 'through' (the camera dives into the previous scene's main thing, the screen, the product, the number, and this scene opens from inside it). Use 'through' once or twice, when this scene lives inside that thing (the shelf, then the product on it, then its expiry date) or to pull back out to the whole. Keep the same picture in two scenes in a row when the second one says more about it (the screen, then a zoom or labels on it). The first scene: cut.",
    ),
  reveal: z
    .string()
    .optional()
    .describe("beforeAfter only: 'wipe' (a divider slides across) or 'iris' (the after grows in a circle from focusX, focusY: the change spreads from one spot). Else empty."),
  camera: z
    .string()
    .optional()
    .describe(
      "How the camera moves inside this scene: hold (still), push (slowly closer), pull (slowly back to the whole), pan (slides across) or drift (floats a little). hold on scenes that are mostly words to read (a hook with no picture, type, steps, contradiction, stat, logo) and on zoom; push in on the product or the real screen; callouts and beforeAfter only hold, push or pull. Vary it across the piece, never the same move three scenes in a row.",
    ),
  focusX: z.number().describe("zoom: the feature's position across the image, 0 to 1. beforeAfter with reveal 'iris': where the change starts, across, 0 to 1. Else 0.5."),
  focusY: z.number().describe("zoom: the feature's position down the image, 0 to 1. beforeAfter with reveal 'iris': where the change starts, down, 0 to 1. Else 0.5."),
  zoom: z.number().describe("zoom only: how much to zoom in, 1.5 to 3."),
  voice: z.string().describe("The narrator's line for this scene, in the piece's language. May be empty."),
  emotion: z.string().describe("How the line is said, in Spanish."),
  disclosure: z
    .string()
    .optional()
    .describe(
      "real (everything shown is on the series' working-today list; real cast screens and the cast product shown as they are count as real), concept (an idea or roadmap feature: how it could look) or simulation (a mock run of something that is not live). The app draws CONCEPTO or SIMULACIÓN on the scene.",
    ),
  beyondToday: z
    .string()
    .optional()
    .describe(
      "Your own check, in Spanish: if this scene shows or says a feature, screen, result or capability that is not on the series' working-today list, what it is, in a few words; else empty. Fill it even when disclosure is concept or simulation.",
    ),
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

// "Nota del director" (shared/motionNote.ts): the same script, each scene saying which current scene it comes from.
export const MotionNoteSchema = MotionScriptSchema.extend({
  scenes: z.array(
    SceneWire.extend({
      from: z
        .string()
        .describe("The id of the current scene this one is (unchanged or changed), exactly as given in the current script; empty for a new scene. Each id at most once."),
    }),
  ),
});

// A hand adjustment from the timeline: when the element enters (seconds from the scene's start, both formats), and
// per format (v: 9:16, h: 16:9, since their layouts differ) how far it moves (dx, dy, in units of the frame's short
// side) and its size (1 = as the template draws it).
export type Spot = { dx?: number; dy?: number; scale?: number };
export type Tweak = { at?: number; v?: Spot; h?: Spot };

export type MotionScene = Omit<z.infer<typeof SceneWire>, "template" | "gesture" | "entry" | "reveal" | "camera" | "disclosure" | "beyondToday"> & {
  id: string;
  template: MotionTemplate;
  // CONCEPTO / SIMULACIÓN on the scene (a hard rule: only "Lo que existe hoy" is shown as real). Older scenes have
  // none: real.
  disclosure?: SceneDisclosure;
  // The writer or the reviewer said this scene shows something not on "Lo que existe hoy" (conceptIssues).
  beyond?: BeyondFlag;
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
  // "ai": the writer chose the camera, so planCameras may change it when the scene or its neighbours change. A camera
  // the person picks has none and is never changed.
  cameraBy?: "ai";
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
// whatever the tone. "match" ("Continuidad") is a match move: when both scenes show the same main picture (carriedAsset),
// that picture travels from where it sits at the end of the previous scene to where it settles in this one, while the
// rest of the old scene leaves and the new one's other elements enter as usual. It takes carryOf(push) seconds. A scene
// with no entry gets "match" by itself when the pictures match (entryOf); one set to "cut" by hand never does, and
// "match" by hand falls back to the cut when they do not. Every check that waits for a scene to arrive reads
// pushOf(scene, push), which knows all three (timeScenes marks the resolved match as carryIn).
export const SCENE_ENTRIES = ["cut", "through", "match"] as const;
export type SceneEntry = (typeof SCENE_ENTRIES)[number];
export const SCENE_ENTRY_LABEL: Record<SceneEntry, string> = { cut: "Corte del tono", through: "Pasar a través", match: "Continuidad" };
export const THROUGH = 0.7;
// How long the carry takes, by tone: dry short and with no overshoot, warm unhurried, absurdist quick.
const CARRY_SECONDS: Record<MotionTone, number> = { dry: 0.32, warm: 0.6, absurdist: 0.42 };
// The carry's length for the tone whose push this is (cutPush); anything else reads as warm.
export const carryOf = (push: number) => CARRY_SECONDS[MOTION_TONES.find((t) => TONE_CUT[t] === push) ?? "warm"];

// The templates whose main picture can travel across a cut, and the element that draws it: the picture of a hook, a
// real screen (screen, zoom), the image under callouts, the product, and what a character presents (assetB). Steps
// (the picture only on 16:9), before/after (two pictures, one in grey) and the rest have none.
const CARRY_MEDIA: readonly MotionTemplate[] = ["hook", "screen", "zoom", "callouts", "product"];
export function carriedAsset(scene: Pick<MotionScene, "template" | "asset" | "assetB">): { id: string; key: "media" | "prop" } | null {
  if (scene.template === "character") return scene.assetB ? { id: scene.assetB, key: "prop" } : null;
  return CARRY_MEDIA.includes(scene.template) && scene.asset ? { id: scene.asset, key: "media" } : null;
}
// Two scenes in a row show the same main picture (the same cast screen, product or uploaded layer).
export function samePicture(prev: Pick<MotionScene, "template" | "asset" | "assetB"> | undefined, scene: Pick<MotionScene, "template" | "asset" | "assetB">): boolean {
  const a = prev ? carriedAsset(prev) : null;
  const b = carriedAsset(scene);
  return Boolean(a && b && a.id === b.id);
}
// How the scene really comes in: "through" when asked, "match" when the pictures match and the person did not pick
// the cut, else the cut (also for a "match" picked by hand whose pictures differ). The first scene: the cut.
export function entryOf(prev: Pick<MotionScene, "template" | "asset" | "assetB"> | undefined, scene: Pick<MotionScene, "template" | "asset" | "assetB" | "entry">): SceneEntry {
  if (!prev) return "cut";
  if (scene.entry === "through") return "through";
  if (scene.entry === "cut") return "cut";
  return samePicture(prev, scene) ? "match" : "cut";
}

// Whether a scene shows only what exists today (real), an idea or roadmap feature (concept), or a mock run of
// something that is not live (simulation). The renderer labels the last two, like a story's shot.
export const SCENE_DISCLOSURES = ["real", "concept", "simulation"] as const;
export type SceneDisclosure = (typeof SCENE_DISCLOSURES)[number];
export const SCENE_DISCLOSURE_LABEL: Record<SceneDisclosure, string> = { real: "Real (existe hoy)", concept: "Concepto", simulation: "Simulación" };
// What the frame says, the same words as a story's shot.
export const DISCLOSURE_TAG: Record<Exclude<SceneDisclosure, "real">, string> = { concept: "CONCEPTO", simulation: "SIMULACIÓN" };
// The writer's word, tolerant (English or Spanish); undefined is real.
export function pickDisclosure(value: string | undefined): Exclude<SceneDisclosure, "real"> | undefined {
  const v = (value ?? "").toLowerCase();
  if (/simula|mock|demo run/.test(v)) return "simulation";
  if (/concep|roadmap|idea|future|futur|pr[oó]xim/.test(v)) return "concept";
  return undefined;
}
// The scene carries a CONCEPTO / SIMULACIÓN label.
export const labelled = (scene: { disclosure?: SceneDisclosure }) => scene.disclosure === "concept" || scene.disclosure === "simulation";

// The writer's "cut" is no choice (undefined: the carry still applies by itself when the pictures match).
export const pickEntry = (value: string | undefined): SceneEntry | undefined =>
  /through|trav[eé]s|dive|zoom/i.test(value ?? "") ? "through" : /match|contin|carry|same/i.test(value ?? "") ? "match" : undefined;

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

// The writer's word for a camera move, tolerant of its wording (English or Spanish); undefined when it gave none.
export function pickCamera(value: string | undefined): MotionCamera | undefined {
  const v = (value ?? "").toLowerCase();
  if (/pull|back|alej|zoom ?out|dolly ?out|retroced/.test(v)) return "pull";
  if (/push|acerc|zoom ?in|dolly|closer|empuj/.test(v)) return "push";
  if (/\bpan|slide|lateral|across|desliz|barrid/.test(v)) return "pan";
  if (/drift|deriv|float|flot|sway/.test(v)) return "drift";
  if (/hold|still|static|quiet|fij|locked|steady|none/.test(v)) return "hold";
  return undefined;
}

// Scenes that hold when the camera is the writer's: mostly words to read (nothing moves while it is read, beyond the
// slow moves the camera has always made when the person picks one), and zoom, which makes its own move.
const HOLD_SCENES: readonly MotionTemplate[] = ["zoom", "type", "steps", "contradiction", "notify", "flow", "slots", "stat", "logo"];
// Where the writer's camera pushes in when it gives none: the product and the real screen.
const PUSH_IN: readonly MotionTemplate[] = ["product", "screen"];
// Another move when the same one would come three scenes in a row, in order of preference.
const OTHER_CAMERA: Record<Exclude<MotionCamera, "hold">, MotionCamera[]> = {
  push: ["drift", "pull", "pan"],
  pull: ["push", "drift", "pan"],
  pan: ["drift", "push", "pull"],
  drift: ["pan", "push", "pull"],
};

// The camera moves the writer may give a scene (a hand choice can be any). Labels pinned to a picture (callouts,
// beforeAfter) only move in depth, never slide across. A dry piece mostly holds, with a slow push.
export function cameraFits(scene: Pick<MotionScene, "template" | "asset">, tone?: MotionTone): readonly MotionCamera[] {
  if (HOLD_SCENES.includes(scene.template) || (scene.template === "hook" && !scene.asset)) return ["hold"];
  const fits: readonly MotionCamera[] = scene.template === "callouts" || scene.template === "beforeAfter" ? ["hold", "push", "pull"] : MOTION_CAMERAS;
  return tone === "dry" ? fits.filter((c) => c === "hold" || c === "push") : fits;
}

// The writer's cameras made to follow the studio's rules: each one fits its scene (cameraFits; a move that does not
// becomes a push on the product or the screen, else a hold), a scene with none pushes in on the product or the screen
// and holds elsewhere, and the same move never comes three scenes in a row (hold is no move). Only scenes whose
// camera the writer chose (cameraBy "ai") change; the person's choices stay and still count as neighbours. Running it
// again changes nothing, and with nothing to change it returns the same list (the studio runs it on every edit).
export function planCameras(scenes: MotionScene[], tone?: MotionTone): MotionScene[] {
  if (!scenes.some((s) => s.cameraBy === "ai")) return scenes;
  const out = scenes.map((s) => {
    if (s.cameraBy !== "ai") return s;
    const fits = cameraFits(s, tone);
    const wish = s.camera ?? (PUSH_IN.includes(s.template) ? "push" : "hold");
    const camera = fits.includes(wish) ? wish : PUSH_IN.includes(s.template) && fits.includes("push") ? "push" : "hold";
    return camera === s.camera ? s : { ...s, camera };
  });
  const cam = (j: number): MotionCamera => out[j]?.camera ?? "hold";
  // Whether `c` at j would make three of the same move in a row with its neighbours.
  const triple = (j: number, c: MotionCamera) =>
    c !== "hold" && [j - 2, j - 1, j].some((k) => k >= 0 && k + 2 < out.length && [k, k + 1, k + 2].every((x) => (x === j ? c : cam(x)) === c));
  for (let i = 2; i < out.length; i++) {
    const c = cam(i);
    if (c === "hold" || cam(i - 1) !== c || cam(i - 2) !== c) continue;
    const k = [i, i - 1, i - 2].find((j) => out[j].cameraBy === "ai");
    if (k === undefined) continue;
    const fits = cameraFits(out[k], tone);
    const next = OTHER_CAMERA[c].find((o) => fits.includes(o) && !triple(k, o)) ?? "hold";
    out[k] = { ...out[k], camera: next };
  }
  return out.every((s, i) => s === scenes[i]) ? scenes : out;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
let nextId = 0;
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`;

// A new scene of a template. Avisos and Flujo hold a few texts in a row, so they start longer.
const BLANK_SECONDS: Partial<Record<MotionTemplate, number>> = { notify: 5, flow: 4.5, slots: 3.5 };
export function blankScene(template: MotionTemplate = "screen"): MotionScene {
  return { id: sceneId(), template, seconds: BLANK_SECONDS[template] ?? 3, title: "", text: "", items: [], asset: "", assetB: "", gesture: "present", move: "walk", camera: "hold", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "" };
}

// The writer's template name, tolerant: the exact name first, then the new templates' other names (English or
// Spanish), then any name it contains; else a screen.
export function pickTemplate(value: string): MotionTemplate {
  const v = value.toLowerCase();
  const exact = MOTION_TEMPLATES.find((t) => v.replace(/[^a-z]/g, "") === t.toLowerCase());
  if (exact) return exact;
  if (/notif|aviso|alert/.test(v)) return "notify";
  if (/slot|casill|checkbox|boxes/.test(v)) return "slots";
  if (/flow|flujo|fan.?out|channel|canal/.test(v)) return "flow";
  return MOTION_TEMPLATES.find((t) => v.includes(t.toLowerCase())) ?? "screen";
}

// ── Avisos, Flujo y Casilleros ──────────────────────────────────────────────────────────
// Their items are a list to arrive one by one: the empty lines are dropped and the list is cut at what the template
// draws (three notifications, four places, five boxes), so the drawing, the timeline and every check read the same.
export const LIST_MAX: Partial<Record<MotionTemplate, number>> = { notify: 3, flow: 4, slots: 5 };
export function itemsOf(scene: Pick<MotionScene, "template" | "items">): string[] {
  const max = LIST_MAX[scene.template];
  return max === undefined ? scene.items : scene.items.map((i) => i.trim()).filter(Boolean).slice(0, max);
}

// A notification written "title | body" (or "title: body"; a time like 6:00 is no split). No mark: all title.
export function noticeParts(item: string): { title: string; body: string } {
  const bar = item.indexOf("|");
  const colon = item.search(/:\s/);
  const at = bar >= 0 ? bar : colon;
  if (at < 0) return { title: item.trim(), body: "" };
  return { title: item.slice(0, at).trim(), body: item.slice(at + 1).trim() };
}
// What a notification says, as one line to read.
export const noticeText = (item: string) => {
  const { title, body } = noticeParts(item);
  return [title, body].filter(Boolean).join(" ");
};

// What the studio's fields ask for in the new templates (the others keep the general words).
export const ITEMS_HINT: Partial<Record<MotionTemplate, string>> = {
  notify: "Un aviso por línea: título | lo que dice (hasta 3)",
  flow: "Un destino por línea (hasta 4)",
  slots: "Un casillero por línea (hasta 5). Dejalo vacío para llenar el siguiente",
};
export const TITLE_HINT: Partial<Record<MotionTemplate, string>> = { flow: "De dónde sale (el origen)" };

// What a "Casilleros" scene does, in the studio's words.
export function slotsNote(row: SlotsState | null | undefined): string {
  if (!row) return "";
  if (row.naming) return `Nombra ${row.names.length} casilleros vacíos. Las escenas de casilleros que siguen, sin elementos, los van llenando.`;
  if (!row.names.length) return "Todavía no hay casilleros con nombre: escribilos en la primera escena de casilleros.";
  if (row.fills === null) return `Ya están todos llenos (${row.names.length} de ${row.names.length}): esta escena no llena ninguno.`;
  return `Llena «${row.names[row.fills]}» (${row.fills + 1} de ${row.names.length}).${row.filled === 1 ? " El anterior ya aparece lleno." : row.filled > 1 ? ` Los ${row.filled} anteriores ya aparecen llenos.` : ""}`;
}

// When each of a sequence's n texts arrives (Avisos, Flujo, the boxes being named): the first at `first`, then evenly,
// so that the last one, fully in `settle` seconds after it arrives, still has its reading time (`lastNeeds`) before the
// scene ends, but never closer than 0.5 s apart (one entrance after the other) nor further than 1.1 s.
export function sequenceTimes(n: number, seconds: number, lastNeeds: number, first = 0.6, settle = 0.5): number[] {
  if (n <= 0) return [];
  const room = seconds - first - settle - lastNeeds;
  const gap = n > 1 ? Math.min(1.1, Math.max(0.5, room / (n - 1))) : 0;
  return Array.from({ length: n }, (_, i) => Math.round((first + i * gap) * 1000) / 1000);
}

// "Casilleros": the open loop on screen. The first slots scene names the boxes (its items); each later slots scene
// fills the next one, and those filled before are already filled. A slots scene with names starts a row (its boxes
// all empty); one without fills a box of the row named last before it (or, when none is, of the first one named after
// it). Read from the script's order only: pure.
export type SlotsState = {
  names: string[];
  // How many boxes are already filled when the scene starts.
  filled: number;
  // The box this scene fills (from 0), or null: it names the boxes, or every box is already full.
  fills: number | null;
  naming: boolean;
};
export function slotsPlan(scenes: Pick<MotionScene, "template" | "items">[], index: number): SlotsState | null {
  const scene = scenes[index];
  if (!scene || scene.template !== "slots") return null;
  const names = (s: Pick<MotionScene, "template" | "items">) => itemsOf(s);
  const isSlots = (k: number) => scenes[k]?.template === "slots";
  if (names(scene).length) return { names: names(scene), filled: 0, fills: null, naming: true };
  let namer = -1;
  for (let k = index - 1; k >= 0; k--) if (isSlots(k) && names(scenes[k]).length) {
    namer = k;
    break;
  }
  const row = namer >= 0 ? names(scenes[namer]) : (scenes.find((s, k) => k > index && s.template === "slots" && names(s).length) ?? null);
  const list = Array.isArray(row) ? row : row ? names(row) : [];
  let before = 0;
  for (let k = namer + 1; k < index; k++) if (isSlots(k) && !names(scenes[k]).length) before++;
  const filled = Math.min(before, list.length);
  return { names: list, filled, fills: before < list.length ? before : null, naming: false };
}

// The writer's script as the app plays it. `tone` (the brief's) only decides the cameras the writer chose (planCameras).
export function normalizeMotion(wire: z.infer<typeof MotionScriptSchema>, tone?: MotionTone): MotionScript {
  const pick = <T extends string>(value: string, list: readonly T[], fallback: T): T =>
    list.find((v) => value.toLowerCase().replace(/[^a-z]/g, "") === v.toLowerCase()) ??
    list.find((v) => value.toLowerCase().includes(v.toLowerCase())) ??
    fallback;
  // "Casilleros": only the first slots scene names the boxes; a later one that repeats them would start a new row, so
  // its items go (it fills the next box).
  const namer = wire.scenes.findIndex((s) => pickTemplate(s.template) === "slots" && s.items.some((i) => i.trim()));
  return {
    ...wire,
    scenes: planCameras(
      wire.scenes.map(({ disclosure, beyondToday, ...s }, i) => withBeyond({
        ...s,
        id: sceneId(),
        disclosure: pickDisclosure(disclosure),
        template: pickTemplate(s.template),
        gesture: pickGesture(s.gesture),
        move: pickMove(s.move),
        entry: pickEntry(s.entry),
        reveal: s.template.toLowerCase().includes("before") ? pickReveal(s.reveal) : undefined,
        camera: pickCamera(s.camera),
        cameraBy: "ai" as const,
        seconds: Math.round(clamp(s.seconds, 2, 8) * 2) / 2,
        items: namer >= 0 && i > namer && pickTemplate(s.template) === "slots" ? [] : s.items.map((x) => x.trim()).filter(Boolean).slice(0, 5),
        focusX: clamp(s.focusX, 0, 1),
        focusY: clamp(s.focusY, 0, 1),
        zoom: clamp(s.zoom || 2, 1.2, 4),
      }, beyondToday ?? "", "ia")),
      tone,
    ),
    music: { mood: pick(wire.music.mood, MOTION_MOODS, "drive"), bpm: Math.round(clamp(wire.music.bpm, 80, 130)) },
  };
}

// carryIn: the scene comes in by "Continuidad" (entryOf resolved it to "match"); only timeScenes sets it.
// slots: a "Casilleros" scene's place in its row (slotsPlan); also only timeScenes sets it.
export type TimedScene = MotionScene & { index: number; start: number; end: number; carryIn?: true; slots?: SlotsState };

// ── CONCEPTO / SIMULACIÓN ────────────────────────────────────────────────────────────────
// Only what the series lists in "Lo que existe hoy" is shown as real (PLAYBOOK §1, §4). The writer grades each scene
// (beyondToday) and the quality reviewer can flag one too; a flagged scene with no CONCEPTO or SIMULACIÓN label blocks
// the render until the person labels it, changes it or confirms it is real ("Lo confirmo", conceptKey).

// Who flagged it: the writer ("ia") or the quality reviewer ("revisor"). `sig` is what the scene showed then
// (showsSig): once the person changes what the scene shows or says, the flag no longer applies.
export type BeyondFlag = { what: string; by: "ia" | "revisor"; sig: string };

// A fingerprint of what a scene shows and says: its template, words, pictures and voice (not its timing or place).
export function showsSig(scene: Pick<MotionScene, "template" | "title" | "text" | "items" | "asset" | "assetB" | "voice">): string {
  const text = JSON.stringify([scene.template, scene.title.trim(), scene.text.trim(), scene.items.map((i) => i.trim()), scene.asset, scene.assetB, scene.voice.trim()]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// The scene with a flag for what it shows beyond today (empty `what`: unchanged).
export function withBeyond<S extends MotionScene>(scene: S, what: string, by: BeyondFlag["by"]): S {
  const clean = what.trim().slice(0, 200);
  return clean ? { ...scene, beyond: { what: clean, by, sig: showsSig(scene) } } : scene;
}

// The reviewer's flags (scene numbers from 1, in the script's order) put on the script's scenes. A scene already
// flagged keeps the writer's words; one that is gone or out of range is skipped.
export function flagBeyond(script: MotionScript, flags: { scene: number; what: string }[]): MotionScript {
  let changed = false;
  const scenes = script.scenes.map((s, i) => {
    const flag = flags.find((f) => Math.round(f.scene) - 1 === i && f.what.trim());
    if (!flag || beyondNow(s)) return s;
    changed = true;
    return withBeyond(s, flag.what, "revisor");
  });
  return changed ? { ...script, scenes } : script;
}

// The scene's flag while it still applies (the scene shows what it showed when flagged), else null.
export const beyondNow = (scene: MotionScene): BeyondFlag | null => (scene.beyond && scene.beyond.sig === showsSig(scene) ? scene.beyond : null);

export type ConceptIssue = { sceneId: string; index: number; what: string; by: BeyondFlag["by"] };
export const conceptKey = (i: ConceptIssue) => `concepto:${i.sceneId}:${i.what}`;

// Scenes flagged as showing something not on "Lo que existe hoy" that still look real (no CONCEPTO or SIMULACIÓN
// label), while the flag still applies (the scene shows what it showed when flagged). `ok`: keys the person confirmed.
export function conceptIssues(scenes: MotionScene[], ok: readonly string[] = []): ConceptIssue[] {
  return scenes.flatMap((s, index) => {
    if (!beyondNow(s) || labelled(s)) return [];
    const issue: ConceptIssue = { sceneId: s.id, index, what: s.beyond!.what, by: s.beyond!.by };
    return ok.includes(conceptKey(issue)) ? [] : [issue];
  });
}

// The label frame t shows: the scene on screen's, and while a scene comes in over the one before (pushOf), the
// outgoing scene's when only that one is labelled, so a concept never shows unlabelled. Null: no label.
export function disclosureAt(scenes: MotionScene[], push: number, t: number): Exclude<SceneDisclosure, "real"> | null {
  const timed = timeScenes(scenes);
  if (!timed.length) return null;
  const found = timed.findIndex((s) => t >= s.start && t < s.end);
  const s = timed[found < 0 ? timed.length - 1 : found];
  if (labelled(s)) return s.disclosure as Exclude<SceneDisclosure, "real">;
  const prev = timed[s.index - 1];
  if (prev && labelled(prev) && t - s.start < Math.min(pushOf(s, push), s.seconds)) return prev.disclosure as Exclude<SceneDisclosure, "real">;
  return null;
}

export function timeScenes(scenes: MotionScene[]): TimedScene[] {
  let t = 0;
  return scenes.map((scene, index) => {
    const start = t;
    t += scene.seconds;
    // A scene that was timed before carries stale marks; they are worked out again from its neighbours.
    const { carryIn: _stale, slots: _row, ...s } = scene as TimedScene;
    const slots = slotsPlan(scenes, index);
    const timed: TimedScene = { ...s, index, start, end: t, ...(slots && { slots }) };
    return entryOf(scenes[index - 1], s) === "match" ? { ...timed, carryIn: true as const } : timed;
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
  notify: "Imagen",
  flow: "Imagen",
  slots: "Casilleros",
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
    case "notify": {
      // Notifications arrive one below the other (nothing already there moves), each read before the next.
      if (title) add("title", "Título", "title", 0);
      if (text) add("text", "Texto", "text", 0.5);
      const list = itemsOf(scene);
      sequenceTimes(list.length, d, readingNeed(noticeText(list.at(-1) ?? "")), 0.6).forEach((at, i) =>
        add(`item${i}`, `Aviso ${i + 1}: ${noticeParts(list[i]).title}`, "items", at),
      );
      break;
    }
    case "flow": {
      // The source (the title, with its picture), then each line draws to its place and the place's label arrives.
      if (title || scene.asset) add("title", "Origen", "title", 0);
      if (text) add("text", "Texto", "text", 0.4);
      const list = itemsOf(scene);
      sequenceTimes(list.length, d, readingNeed(list.at(-1) ?? ""), 0.7).forEach((at, i) => add(`item${i}`, `Destino ${i + 1}: ${list[i]}`, "items", at));
      break;
    }
    case "slots": {
      // The scene that names the boxes brings them in one by one; a later one shows the row as it is and fills one.
      if (title) add("title", "Título", "title", 0);
      if (text) add("text", "Texto", "text", 0.4);
      const row = (scene as Partial<TimedScene>).slots;
      const list = itemsOf(scene);
      if (row ? row.naming : list.length > 0) {
        sequenceTimes(list.length, d, readingNeed(list.at(-1) ?? ""), 0.6).forEach((at, i) => add(`item${i}`, `Casillero ${i + 1}: ${list[i]}`, "items", at));
      } else {
        add("media", media, "media", 0);
        if (!row || row.fills !== null) add("fill", row?.fills != null ? `Se llena: ${row.names[row.fills]}` : "Se llena uno", "moves", 0.6, false);
      }
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

// How long a scene comes in over the one before it: the tone's push, THROUGH for a camera journey, carryOf(push) for
// "Continuidad" (carryIn, from timeScenes); 0 for the first.
export const pushOf = (scene: { index: number; entry?: SceneEntry; carryIn?: boolean }, push: number) =>
  scene.index > 0 ? (scene.carryIn ? carryOf(push) : scene.entry === "through" ? THROUGH : push) : 0;

// ── Motion blur on the cut ("Desenfoque en los cortes") ──────────────────────────────────────────────────────────
// Only while a scene comes in over the one before (the tone's push, or a camera journey's THROUGH), frame t is the
// average of BLUR_SUBFRAMES pictures spread evenly over the BLUR_SHUTTER seconds that end at t: half a frame at 30 fps,
// a 180° shutter, the film look. The push is fast (at its peak the warm one crosses about 0.13 of the frame's width
// during the shutter, the absurdist one about 0.25), so it takes 8 subframes, the most this allows, for the copies to
// sit close enough to read as one smear [NOT SURE: chosen on these numbers, to be judged on real frames]. A hard cut
// (dry) has no push, so it has no blur; the frame is drawn 8 times only inside a push (under 0.7 s per cut).
export const BLUR_SUBFRAMES = 8;
export const BLUR_SHUTTER = 1 / 60;

// The piece's switch: on by default, and a piece saved before it existed counts as on.
export const cutBlurOn = (piece: { cutBlur?: boolean }) => piece.cutBlur !== false;

export type PushWindow = { start: number; end: number };

// The push that frame t is in, or null: the scene on screen at t (the last one past the end, as the drawing reads it)
// comes in over the one before it from its start for pushOf seconds, never past its own end.
export function pushWindowAt(scenes: MotionScene[], push: number, t: number): PushWindow | null {
  const timed = timeScenes(scenes);
  if (!timed.length) return null;
  const found = timed.findIndex((s) => t >= s.start && t < s.end);
  const s = timed[found < 0 ? timed.length - 1 : found];
  const coming = pushOf(s, push);
  return coming > 0 && t >= s.start && t - s.start < coming ? { start: s.start, end: s.start + Math.min(coming, s.seconds) } : null;
}

// Every push of the piece, in order (none in a dry piece with no camera journey).
export function pushWindows(scenes: MotionScene[], push: number): PushWindow[] {
  return timeScenes(scenes).flatMap((s) => {
    const coming = Math.min(pushOf(s, push), s.seconds);
    return coming > 0 ? [{ start: s.start, end: s.start + coming }] : [];
  });
}

// The subframes of frame t and their weights (summing to 1). Outside a push: t alone. Inside: BLUR_SUBFRAMES times from
// t back to t - shutter, evenly, t itself first; none before the push starts (those land on its start, and equal times
// are merged into one heavier sample), so a frame never mixes in the scene before the cut.
export function blurSamples(scenes: MotionScene[], push: number, t: number, n = BLUR_SUBFRAMES, shutter = BLUR_SHUTTER): { at: number; weight: number }[] {
  const win = pushWindowAt(scenes, push, t);
  if (!win || n < 2 || !(shutter > 0)) return [{ at: t, weight: 1 }];
  const samples: { at: number; weight: number }[] = [];
  for (let k = 0; k < n; k++) {
    const at = Math.max(win.start, t - (shutter * k) / (n - 1));
    const last = samples.at(-1);
    if (last && last.at === at) last.weight += 1 / n;
    else samples.push({ at, weight: 1 / n });
  }
  return samples;
}

// The text an element shows, for the reading check.
function shownText(scene: MotionScene, key: string): string {
  if (key === "title") return scene.template === "logo" ? "" : scene.title;
  if (key === "text") return scene.text;
  if (key === "tag") return scene.template === "type" ? (scene.items[1] ?? "") : (scene.items[0] ?? "");
  if (key.startsWith("item")) {
    const item = itemsOf(scene)[Number(key.slice(4))] ?? "";
    return scene.template === "notify" ? noticeText(item) : item;
  }
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

// "Foco de a uno": in a set of labels that arrive one after another, only the newest is at full strength. How far
// element i has stepped down at time lt (0: full strength, 1: all the way down), given when each element of the set
// arrives (`times`, in any order: a hand-set time can put a later label first). It steps down while the next one to
// arrive after it comes in (`over`, that one's entrance), eased, and stays down. Elements that arrive together share
// the focus; one that never arrives (Infinity) takes it from nobody. Pure, so any template can use it.
export function stepDownShare(times: number[], i: number, lt: number, over: number): number {
  const own = times[i];
  if (own === undefined || !Number.isFinite(own)) return 0;
  const next = times.reduce((best, t) => (t > own + 1e-6 && t < best ? t : best), Infinity);
  if (!Number.isFinite(next) || lt < next) return 0;
  const x = over > 0 ? Math.min(1, (lt - next) / over) : 1;
  return x * x * (3 - 2 * x);
}

// The templates whose labels take turns at full strength, and how long the step down takes (the newcomer's entrance).
export const STEP_DOWN_OVER: Partial<Record<MotionTemplate, number>> = { callouts: 0.45, steps: 0.5, notify: 0.45, flow: 0.45, slots: 0.45 };

// stepDownShare for one of a scene's labels or steps (`item0`, `item1`…) at scene time lt; 0 for anything else. An
// empty label never takes the focus. The renderer and the contact sheet read the same value.
export function focusShare(scene: MotionScene, key: string, lt: number): number {
  const over = STEP_DOWN_OVER[scene.template];
  const m = /^item(\d+)$/.exec(key);
  if (over === undefined || !m) return 0;
  const T = elementTimes(scene);
  const times = itemsOf(scene).map((item, k) => (item.trim() && `item${k}` in T ? T[`item${k}`] : Infinity));
  return stepDownShare(times, Number(m[1]), lt, over);
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
  // A picture carried in ("Continuidad", carryIn) arrives with the cut, whenever its own entrance would be.
  const carried = (scene as Partial<TimedScene>).carryIn ? carriedAsset(scene)?.key : undefined;
  const times = sceneElements(scene)
    .filter((e) => e.lane !== "voice")
    .map((e) => (e.at < push || e.key === carried ? 0 : e.at));
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
  // Scenes flagged as beyond "Lo que existe hoy" that the person confirmed are real (conceptKey).
  conceptsOk?: string[];
  // The track's beat clock from its drums stem; none: a track has no grid.
  kickGrid?: TrackKicks | null;
  // "Desenfoque en los cortes": motion blur during the push between scenes (blurSamples). On by default; a piece
  // saved before it existed has none and counts as on (cutBlurOn).
  cutBlur?: boolean;
  // "Palabra por palabra": the subtitle lights the word being said (subtitleCues). On by default; a piece saved before
  // it existed has none and counts as on (wordByWordOn).
  wordByWord?: boolean;
  // Word times heard in each scene's voice file (whisper-1, aligned to the written words), by scene id. Without them,
  // or once the line or the file changed, the times are estimated (sceneWordTimes).
  wordTimes?: Record<string, HeardWordTimes>;
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
    conceptsOk: [],
    cutBlur: true,
    wordByWord: true,
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
const DRAWN_ITEMS: Partial<Record<MotionTemplate, number>> = { callouts: 5, steps: 5, contradiction: 2, beforeAfter: 2, product: 1, logo: 1, type: 2, ...LIST_MAX };

// What each scene really shows or says, by element key. The logo template draws its title when there is no logo.
function sceneTexts(s: MotionScene): { key: string; label: string; text: string }[] {
  const keys = new Set(sceneElements(s).map((e) => e.key));
  return [
    ...(keys.has("title") || s.template === "logo" ? [{ key: "title", label: s.template === "stat" ? "Número" : "Título", text: s.title }] : []),
    ...(keys.has("text") ? [{ key: "text", label: "Texto", text: s.text }] : []),
    ...(LIST_MAX[s.template] !== undefined ? itemsOf(s) : s.items.slice(0, DRAWN_ITEMS[s.template] ?? 0)).map((text, i) => ({ key: `item${i}`, label: `Rótulo ${i + 1}`, text })),
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
