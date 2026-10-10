// The quality loop before any full render (the studio's rule): a contact sheet with one frame per beat, the AI scores
// six things from 1 to 10, the three worst problems are fixed as edits to the script, and it repeats until every score
// is 8 or more, up to a set number of rounds.
import { z } from "zod";
import { DISCLOSURE_TAG, MOTION_TEMPLATES, MOTION_TEMPLATE_LABEL, beyondNow, labelled, planCameras, sceneElements, timeScenes, tweakScene, type MotionScene, type MotionScript, type Spot } from "./motion.ts";

export const CRITERIA = ["hook", "readability", "motion", "variety", "brand", "sync"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERION_LABEL: Record<Criterion, string> = {
  hook: "Gancho en los primeros 2 s",
  readability: "Se lee en el celular",
  motion: "Calidad del movimiento",
  variety: "Variedad",
  brand: "Fiel a la marca",
  sync: "Sincronía con el sonido",
};
export const PASS = 8;
export const MAX_ROUNDS = 3;
export const MAX_FIXES = 3;

const FixWire = z.object({
  criterion: z.string().describe("Which score this fixes: hook, readability, motion, variety, brand or sync."),
  problem: z.string().describe("In Spanish, one sentence: what is wrong and where (scene and second)."),
  scene: z.number().describe("The scene to change, numbered from 1."),
  title: z.string().describe("The scene's new title (up to 6 words), or empty to keep it."),
  text: z.string().describe("The scene's new supporting text, or empty to keep it."),
  items: z.array(z.string()).describe("The scene's new labels, steps, price or call to action, or empty to keep them."),
  seconds: z.number().describe("The scene's new length, 2 to 8 seconds, or 0 to keep it."),
  template: z.string().describe("The scene's new template (one of the template names), or empty to keep it."),
  element: z.string().describe("An element of the scene to adjust (its key from the scene list: title, text, media, item0, item1…, tag, zoom, ring, wipe, voice), or empty."),
  at: z.number().describe("When that element enters, in seconds from the scene's start, or -1 to keep it."),
  scale: z.number().describe("That element's size (1 = as the template draws it, 0.4 to 2.5), or 0 to keep it."),
  dx: z.number().describe("Move that element right (+) or left (-), in shares of the frame's short side (e.g. 0.05), or 0."),
  dy: z.number().describe("Move that element down (+) or up (-), in shares of the frame's short side, or 0."),
  format: z.string().describe("Which format the size or move is for: vertical, horizontal or both."),
});

export const MotionReviewSchema = z.object({
  scores: z
    .array(
      z.object({
        criterion: z.string().describe("hook, readability, motion, variety, brand or sync."),
        score: z.number().describe("1 to 10, strict: 8 means ready to publish."),
        note: z.string().describe("In Spanish, one sentence: why, pointing at a frame (its second)."),
      }),
    )
    .describe("Exactly one score per criterion, all six."),
  fixes: z.array(FixWire).describe("The three worst problems (fewer if fewer scores are under 8), worst first, each as an edit. Empty if every score is 8 or more."),
  beyondToday: z
    .array(
      z.object({
        scene: z.number().describe("The scene, numbered from 1."),
        what: z.string().describe("In Spanish, a few words: what it shows or says that is not on the series' working-today list."),
      }),
    )
    .optional()
    .describe(
      "Scenes WITHOUT a concept or simulation label that show or say a feature, screen, result or capability not on the series' working-today list (\"Lo que existe hoy\"). Real cast screens and the cast product shown as they are count as real. Empty when there is none.",
    ),
  summary: z.string().describe("In Spanish, one or two sentences on the piece as a whole."),
  poster: z
    .number()
    .describe(
      "The second of the strongest settled frame for the video's thumbnail: text fully in, not in the middle of a cut (frames marked 'corte'); usually the hook, the product reveal or the logo.",
    ),
});
export type MotionReviewWire = z.infer<typeof MotionReviewSchema>;
export type Fix = z.infer<typeof FixWire>;
export type Scores = Record<Criterion, { score: number; note: string }>;
// beyond: the scenes the reviewer flagged as showing something not on "Lo que existe hoy" (flagBeyond).
export type MotionReview = { scores: Scores; fixes: Fix[]; summary: string; poster: number | null; beyond?: { scene: number; what: string }[] };

export function normalizeReview(wire: MotionReviewWire): MotionReview {
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, { score: 0, note: "La IA no lo puntuó." }])) as Scores;
  for (const s of wire.scores) {
    const key = s.criterion.toLowerCase().replace(/[^a-z]/g, "");
    const c = CRITERIA.find((x) => key === x || key.startsWith(x) || key.includes(x));
    if (c) scores[c] = { score: Math.round(Math.min(10, Math.max(1, Number(s.score) || 1))), note: s.note };
  }
  const poster = Number(wire.poster);
  const beyond = (wire.beyondToday ?? [])
    .map((b) => ({ scene: Math.round(Number(b.scene)), what: String(b.what ?? "").trim() }))
    .filter((b) => Number.isFinite(b.scene) && b.scene >= 1 && b.what);
  return { scores, fixes: wire.fixes.slice(0, MAX_FIXES), summary: wire.summary, poster: Number.isFinite(poster) && poster >= 0 ? poster : null, beyond };
}

export const passes = (scores: Scores) => CRITERIA.every((c) => scores[c].score >= PASS);

// One round, as the studio keeps it.
// applied: the fixes made after this round; pending: what the last round still found (no rounds left to fix it).
export type QualityRound = { round: number; scores: Scores; summary: string; applied: string[]; pending: string[]; demo: boolean };
export type QualityState = {
  // What was reviewed (the scenes as they play, the music, the brand): any edit after it asks for a new review.
  key: string;
  // The formats whose contact sheets were reviewed.
  formats: ("vertical" | "horizontal")[];
  passed: boolean;
  // Every round was used and some score stayed under 8; the person chose to render anyway.
  accepted: boolean;
  rounds: QualityRound[];
};

// A short fingerprint of what the review looked at.
export function qualityKey(scenes: MotionScene[], script: MotionScript, extra: string): string {
  // The tone changes the cuts and the sound, so a new tone needs a new look; the caption does not.
  const text = JSON.stringify([scenes, script.music, script.tone ?? "warm", extra]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const CAMERA_WORDS = { push: "pushes in slowly", pull: "pulls back slowly", pan: "pans across", drift: "drifts a little" } as const;

// The script as the reviewer reads it: each scene with its times, words, camera and elements (and any hand adjustment).
export function describeScenes(scenes: MotionScene[]): string {
  return timeScenes(scenes)
    .map((s) => {
      const elements = sceneElements(s)
        .map((e) => {
          const tw = s.tweaks?.[e.key];
          const spot = (f: "v" | "h") => {
            const p = tw?.[f];
            return p ? ` ${f === "v" ? "9:16" : "16:9"} moved ${(p.dx ?? 0).toFixed(2)},${(p.dy ?? 0).toFixed(2)} size ${(p.scale ?? 1).toFixed(2)}` : "";
          };
          return `${e.key} at ${e.at.toFixed(2)} s${spot("v")}${spot("h")}`;
        })
        .join("; ");
      const entry =
        s.index > 0 && s.carryIn
          ? ", enters by a match move: the same picture travels from where it was in the previous scene to its place here"
          : s.index > 0 && s.entry === "through"
            ? ", enters by a camera journey into the previous scene's main thing"
            : "";
      const reveal = s.template === "beforeAfter" && s.reveal === "iris" ? ", the after grows in a circle" : "";
      const camera = s.camera && s.camera !== "hold" ? `, camera ${CAMERA_WORDS[s.camera]}` : "";
      const label = labelled(s) ? `, labelled ${DISCLOSURE_TAG[s.disclosure as "concept" | "simulation"]} on screen` : "";
      const flagged = beyondNow(s);
      const flag = flagged ? `, flagged by the ${flagged.by === "ia" ? "writer" : "reviewer"} as not on the working-today list ("${flagged.what}")` : "";
      return `Scene ${s.index + 1} (${s.start.toFixed(2)}–${s.end.toFixed(2)} s, ${s.seconds.toFixed(2)} s, template ${s.template}${entry}${reveal}${camera}${label}${flag}): title "${s.title}"; text "${s.text}"; items ${JSON.stringify(s.items)}; image ${s.asset || "none"}${s.assetB ? ` → ${s.assetB}` : ""}; voice "${s.voice}". Elements: ${elements || "none"}.`;
    })
    .join("\n");
}

const round2 = (x: number) => Math.round(x * 1000) / 1000;

// Applies the reviewer's fixes to the script (by scene order of the script itself) and says what changed, in Spanish.
export function applyFixes(script: MotionScript, fixes: Fix[], formats: ("vertical" | "horizontal")[]): { script: MotionScript; applied: string[] } {
  const scenes = [...script.scenes];
  const applied: string[] = [];
  for (const fix of fixes.slice(0, MAX_FIXES)) {
    const i = Math.round(fix.scene) - 1;
    if (!(i >= 0 && i < scenes.length)) continue;
    let s = scenes[i];
    const changes: string[] = [];
    if (fix.template.trim()) {
      const t = MOTION_TEMPLATES.find((x) => x.toLowerCase() === fix.template.trim().toLowerCase().replace(/[^a-z]/gi, ""));
      if (t && t !== s.template) {
        s = { ...s, template: t };
        changes.push(`plantilla: ${MOTION_TEMPLATE_LABEL[t]}`);
      }
    }
    if (fix.title.trim() && fix.title.trim() !== s.title) {
      s = { ...s, title: fix.title.trim() };
      changes.push(`título: “${s.title}”`);
    }
    if (fix.text.trim() && fix.text.trim() !== s.text) {
      s = { ...s, text: fix.text.trim() };
      changes.push(`texto: “${s.text}”`);
    }
    const items = fix.items.map((x) => x.trim()).filter(Boolean).slice(0, 5);
    if (items.length && items.join("|") !== s.items.join("|")) {
      s = { ...s, items };
      changes.push(`elementos: ${items.join(" · ")}`);
    }
    if (fix.seconds > 0) {
      const seconds = Math.round(Math.min(8, Math.max(2, fix.seconds)) * 2) / 2;
      if (seconds !== s.seconds) {
        s = { ...s, seconds };
        changes.push(`dura ${seconds} s`);
      }
    }
    const key = fix.element.trim();
    const el = key ? sceneElements(s).find((e) => e.key === key) : undefined;
    if (el) {
      if (fix.at >= 0 && Math.abs(fix.at - el.at) > 0.01) {
        s = tweakScene(s, key, { at: round2(fix.at) });
        changes.push(`${el.label} entra a los ${fix.at.toFixed(2)} s`);
      }
      if (el.move && (fix.scale > 0 || fix.dx || fix.dy)) {
        const asked = fix.format.trim().toLowerCase();
        const which = asked.startsWith("v") ? ["v"] : asked.startsWith("h") ? ["h"] : asked.startsWith("b") ? ["v", "h"] : formats.map((f) => (f === "vertical" ? "v" : "h"));
        for (const f of which as ("v" | "h")[]) {
          const old = s.tweaks?.[key]?.[f] ?? {};
          const spot: Spot = {};
          if (fix.scale > 0) spot.scale = round2(Math.min(2.5, Math.max(0.4, fix.scale)));
          if (fix.dx) spot.dx = round2((old.dx ?? 0) + Math.max(-0.5, Math.min(0.5, fix.dx)));
          if (fix.dy) spot.dy = round2((old.dy ?? 0) + Math.max(-0.5, Math.min(0.5, fix.dy)));
          s = tweakScene(s, key, { [f]: spot });
        }
        changes.push(`${el.label}: ${fix.scale > 0 ? `tamaño ${Math.round(fix.scale * 100)}%` : ""}${fix.scale > 0 && (fix.dx || fix.dy) ? ", " : ""}${fix.dx || fix.dy ? "movido" : ""}`);
      }
    }
    if (!changes.length) continue;
    scenes[i] = s;
    applied.push(`Escena ${i + 1}: ${fix.problem.trim() || "arreglo"} → ${changes.join("; ")}.`);
  }
  // A scene that changed template keeps the writer's camera only if it still fits (a hand-picked camera stays).
  return { script: { ...script, scenes: planCameras(scenes, script.tone) }, applied };
}
