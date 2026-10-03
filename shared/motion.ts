// Motion-graphics explainers: a script of scenes, each drawn from a template. The renderer (src/lib/motion.ts) is a
// pure function of time; this file holds the shapes, the normalizer and the timing both sides share, including the
// rule that something new happens on screen every 2 to 4 seconds.
import { z } from "zod";

export const MOTION_TEMPLATES = ["hook", "screen", "zoom", "callouts", "steps", "beforeAfter", "product", "stat", "logo"] as const;
export type MotionTemplate = (typeof MOTION_TEMPLATES)[number];
export const MOTION_TEMPLATE_LABEL: Record<MotionTemplate, string> = {
  hook: "Gancho: palabras que entran",
  screen: "Pantalla en el celular o la compu",
  zoom: "Zoom a una función",
  callouts: "Rótulos sobre la imagen",
  steps: "Paso a paso",
  beforeAfter: "Antes / después",
  product: "Producto con precio u oferta",
  stat: "Número grande",
  logo: "Cierre con logo",
};

export const MOTION_MOODS = ["calm", "drive", "bright"] as const;
export type MotionMood = (typeof MOTION_MOODS)[number];
export const MOTION_MOOD_LABEL: Record<MotionMood, string> = { calm: "Tranquila", drive: "Con empuje", bright: "Alegre" };

const SceneWire = z.object({
  template: z
    .string()
    .describe(
      "One of: hook (kinetic title, the first scene), screen (a real screen of the app in a phone or laptop), zoom (zoom into one feature of a real screen and ring it), callouts (labels pointing at parts of the product or screen), steps (numbered steps), beforeAfter (two images with a moving divider), product (the product cut-out with its price or offer), stat (one big number that counts up), logo (the brand's logo and a soft call to action, the last scene).",
    ),
  seconds: z.number().describe("2 to 8 seconds; long enough for the voice line at about 2.5 words per second."),
  title: z.string().describe("Up to 6 words, readable on a phone. For stat: starts with the number (e.g. '3 minutos')."),
  text: z.string().describe("Up to 12 words of supporting text, or empty."),
  items: z.array(z.string()).describe("callouts and steps: up to 4 labels of up to 5 words. beforeAfter: [before label, after label]. product: [price or offer]. logo: [call to action]. Else empty."),
  asset: z.string().describe("The id of a cast member to show (a real screen, the product, a character, a place), 'layer:N' for an uploaded layer, or empty."),
  assetB: z.string().describe("beforeAfter only: the 'after' image id. Else empty."),
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

export type MotionScene = Omit<z.infer<typeof SceneWire>, "template"> & { id: string; template: MotionTemplate };
export type MotionScript = Omit<z.infer<typeof MotionScriptSchema>, "scenes" | "music"> & {
  scenes: MotionScene[];
  music: { mood: MotionMood; bpm: number };
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
let nextId = 0;
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function blankScene(template: MotionTemplate = "screen"): MotionScene {
  return { id: sceneId(), template, seconds: 3, title: "", text: "", items: [], asset: "", assetB: "", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "" };
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

// When each element of a scene appears, from the scene's start. The renderer and the 2-to-4-seconds check both use it.
export function revealTimes(scene: MotionScene): number[] {
  const d = scene.seconds;
  switch (scene.template) {
    case "hook":
      return [0, 0.8];
    case "screen":
      return [0, 0.45, 0.9];
    case "zoom":
      return [0, 0.6, Math.min(1.5, d * 0.45)];
    case "callouts":
    case "steps": {
      const n = Math.max(1, scene.items.length);
      const gap = Math.min(1.1, Math.max(0.35, (d - 1.2) / n));
      return [0, ...scene.items.map((_, i) => 0.6 + i * gap)];
    }
    case "beforeAfter":
      return [0, Math.min(d * 0.4, 1.6)];
    case "product":
      return [0, 0.9];
    case "stat":
      return [0, 1.2];
    case "logo":
      return [0, 0.6, 1.0];
  }
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
  };
}

export const DURATIONS = [15, 30, 45, 60, 90] as const;
