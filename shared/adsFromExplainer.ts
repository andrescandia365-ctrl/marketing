// "Usar como cuerpo o llamado": a finished explainer (MotionStudio) goes into Publicidad as the clip of a hook, a meat
// or a CTA of the same series, copied on the server from the project folder into publicidad/<series>/media/ (no
// download and upload). The piece keeps its length (its share of the ad, up to 120 s): a longer explainer is used from
// an in point for the piece's seconds, a shorter one holds its last frame. And the way back: a piece with no clip can
// start a new explainer prefilled with its text ("Hacelo como explicativo"), usable with no AI key. A hook is one
// kinetic title; a meat longer than 15 s is several short scenes, because an explainer has no 15 s clip limit.
import { AD_MAX_SECONDS, LEVELS, PIECE_TEXT_MAX, nextId, pieceShare, type AdsState, type Budget, type Cta, type Hook, type Meat } from "./ads.ts";
import { MASCOT_ASSET } from "./mascot.ts";
import { blankScene, kineticHookSeconds, kineticLeave, newMotionPiece, readingNeed, type MotionPiece, type MotionScene, type MotionScript, type MotionTone } from "./motion.ts";

export const EXPLAINER_KINDS = ["meat", "cta"] as const;
export type ExplainerKind = (typeof EXPLAINER_KINDS)[number];
// "Uno nuevo" can be a meat or a CTA; an explainer can also go into an approved hook already there ("Que lo diga la
// mascota" starts from hooks too), so the targets are the three kinds.
export const TARGET_KINDS = ["hook", "meat", "cta"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];
export const EXPLAINER_KIND_LABEL: Record<TargetKind, string> = { hook: "gancho (hook)", meat: "cuerpo (meat)", cta: "llamado (CTA)" };

// ── The explainer's videos in its project folder ────────────────────────────────────────
// render.mjs writes video-final-<format>.mp4; the in-browser render is video-<format>.mp4 (or .webm).
export const EXPLAINER_VIDEO = /^video(-final)?-(vertical|horizontal)\.(mp4|webm)$/;
export type ExplainerVideo = { file: string; format: "vertical" | "horizontal"; final: boolean };

// The folder's explainer videos, best first: the final render (H.264, CRF 16) before the browser's, mp4 before webm.
export function explainerVideos(names: string[]): ExplainerVideo[] {
  const out: ExplainerVideo[] = [];
  for (const file of names) {
    const m = EXPLAINER_VIDEO.exec(file);
    if (m) out.push({ file, format: m[2] as ExplainerVideo["format"], final: Boolean(m[1]) });
  }
  const rank = (v: ExplainerVideo) => (v.final ? 0 : 2) + (v.file.endsWith(".mp4") ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
}

// The video to use: the final render in the wanted format, else the browser's in that format, else the best of any.
export function pickExplainerVideo(videos: ExplainerVideo[], format: "vertical" | "horizontal"): ExplainerVideo | null {
  const sorted = explainerVideos(videos.map((v) => v.file));
  return sorted.find((v) => v.format === format) ?? sorted[0] ?? null;
}

// ── Which piece it goes into ───────────────────────────────────────────────────────────
export type ExplainerTarget = { piece: Hook | Meat | Cta; hasClip: boolean; fromExplainer: boolean };

// The series' approved pieces of that kind; the ones still without a clip first (they are the ones waiting for one).
export function explainerTargets(state: AdsState, kind: TargetKind): ExplainerTarget[] {
  const list: (Hook | Meat | Cta)[] = kind === "hook" ? state.hooks : kind === "meat" ? state.meats : state.ctas;
  return list
    .filter((p) => p.status === "approved")
    .map((piece) => {
      const clip = state.media[piece.id]?.clip;
      return { piece, hasClip: Boolean(clip), fromExplainer: Boolean(clip?.explainer) };
    })
    .sort((a, b) => Number(a.hasClip) - Number(b.hasClip));
}

// A new piece's seconds: its share of an ad of that length (the default split, or the one the person stored).
export const pieceSecondsFor = (kind: TargetKind, adSeconds: number, split?: Budget | null): number => pieceShare(adSeconds, kind, split);

// ── The length budget ─────────────────────────────────────────────────────────────────
export type ClipFit = {
  // Seconds of the explainer the piece plays: from start to end (end - start ≤ the piece's seconds).
  start: number;
  end: number;
  // whole: it fits as it is. cut: longer than the piece, only start..end plays. short: it ends before the piece does.
  fit: "whole" | "cut" | "short";
  note: string;
};

const tenth = (n: number) => Math.round(n * 10) / 10;
const secs = (n: number) => `${tenth(n).toString().replace(".", ",")} s`;
// Within a tenth of a second counts as the same length (frame rounding).
const SAME = 0.1;

// Where the piece's seconds fall in the explainer. A longer explainer plays from `start` (clamped so the piece never
// runs past the end); a shorter one plays whole and its last frame holds.
export function fitClip(videoSeconds: number, pieceSeconds: number, start = 0): ClipFit {
  const video = Math.max(0, videoSeconds);
  const piece = Math.max(0, pieceSeconds);
  if (video <= piece + SAME) {
    const short = video < piece - SAME;
    return {
      start: 0,
      end: tenth(video),
      fit: short ? "short" : "whole",
      note: short
        ? `El explicativo dura ${secs(video)} y la pieza ${secs(piece)}: el último cuadro queda quieto ${secs(piece - video)}.`
        : `Entra entero: dura ${secs(video)} y la pieza ${secs(piece)}.`,
    };
  }
  const from = tenth(Math.min(Math.max(0, Number.isFinite(start) ? start : 0), video - piece));
  const end = tenth(from + piece);
  return {
    start: from,
    end,
    fit: "cut",
    note: `El explicativo dura ${secs(video)} y la pieza ${secs(piece)}: se usa de ${secs(from)} a ${secs(end)} y el resto queda afuera.`,
  };
}

// ── The piece's text ──────────────────────────────────────────────────────────────────
export type VoicedSpan = { start: number; end: number; voice: string };

// The voice lines said between start and end: a scene counts when at least 0.3 s of it (or half of it, if shorter)
// falls inside the range. This is what the ad's piece says, for its words count and the review.
export function voiceInRange(scenes: VoicedSpan[], start: number, end: number): string {
  return scenes
    .filter((s) => {
      const overlap = Math.min(s.end, end) - Math.max(s.start, start);
      return s.voice.trim() && overlap >= Math.min(0.3, (s.end - s.start) / 2);
    })
    .map((s) => s.voice.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, PIECE_TEXT_MAX);
}

// A new meat or CTA made from the explainer: the person chose it, so it comes approved; the levels are all five
// (an explainer explains, it fits any awareness) and the note says where it came from.
export function explainerPiece(state: AdsState, kind: ExplainerKind, seconds: number, text: string, title: string): Meat | Cta {
  const base = {
    text: text.trim().slice(0, PIECE_TEXT_MAX),
    onScreenText: "",
    visualPrompt: "",
    videoPrompt: "",
    seconds: Math.min(AD_MAX_SECONDS, Math.max(1, seconds)),
    status: "approved" as const,
    source: "manual" as const,
    createdAt: new Date().toISOString(),
    note: `Hecho como explicativo${title.trim() ? `: «${title.trim().slice(0, 120)}»` : ""}.`.slice(0, 600),
    levels: [...LEVELS],
  };
  if (kind === "meat") return { ...base, id: nextId(state, "meat"), kind: "meat", format: "education", hookId: "" };
  return { ...base, id: nextId(state, "cta"), kind: "cta", what: "", why: "", when: "", easy: "" };
}

// ── The way back: "Hacelo como explicativo" ────────────────────────────────────────────────
// presenter "mascot" ("Que lo diga la mascota"): the series' code mascot says the piece's line (character scenes).
export type AdSeed = { id: string; kind: TargetKind; text: string; onScreenText: string; seconds: number; presenter?: "mascot"; emotion?: string };

// What goes into the brief's notes, so the writer (when there is one) builds the explainer on the piece's words.
export function seedNotes(seed: AdSeed): string {
  const who = seed.presenter === "mascot" ? " Lo dice la mascota de la serie en cámara (escenas de personaje con la mascota en código)." : "";
  return `Desde Publicidad (${seed.id}, ${EXPLAINER_KIND_LABEL[seed.kind]}, ${secs(seed.seconds)} en el anuncio): «${seed.text.trim()}»${who}`;
}

// The piece's id written into the brief's notes by seedNotes. The last line wins: an older "Desde Publicidad" line
// must not send "Usar en Publicidad" back to a piece this explainer no longer belongs to.
export function seedPieceId(notes: string): string | null {
  const all = [...notes.matchAll(/Desde Publicidad \(([HMC]\d{1,4}),/g)];
  return all.length ? all[all.length - 1][1] : null;
}

// One seed line in the brief. A later "Hacelo como explicativo" replaces the previous line instead of stacking another.
export function withSeedNotes(notes: string, seed: AdSeed): string {
  const kept = notes
    .split("\n")
    .filter((line) => !/^Desde Publicidad \(/.test(line.trim()))
    .join("\n")
    .trim();
  const line = seedNotes(seed);
  return kept ? `${kept}\n${line}` : line;
}

// The script's problem is the piece's text, in plain words. The id stays in the title and in the project slug.
export function problemOf(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "Sin texto todavía";
  if (clean.length <= 240) return clean;
  const cut = clean.slice(0, 240);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 160 ? cut.slice(0, sp) : cut).trim()}…`;
}

// "Hacer en motion graphics": one click makes at most this many explainers. The rest wait for another click.
export const MOTION_BATCH_MAX = 20;

function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// A project already opened for this piece: the id ends in `-<series>-<piece>` or `-<series>-<piece>-2`, and the
// project belongs to this series. The title is not the id, so it is not what we match.
export function projectForPiece<T extends { id: string; series?: string }>(projects: T[], seriesId: string, pieceId: string): T | null {
  const series = slugPart(seriesId) || "pieza";
  const piece = slugPart(pieceId);
  if (!piece) return null;
  const re = new RegExp(`-${series}-${piece}(?:-\\d+)?$`);
  const hits = projects.filter((p) => p.series === seriesId && re.test(p.id));
  return hits.at(-1) ?? null;
}

// Spoken words in groups of `size`. Kept for callers that still want a fixed handful. A long meat no longer uses it:
// that path splits on a sentence, then a clause, and sizes the scenes to the meat.
export function wordChunks(text: string, size = 8): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out;
}

// A long meat's scenes stay at 2 or 2.5 s. Beat snapping can add about 1.2 s, and 2.5 + 1.2 stays under the 4 s
// quiet-gap check. Longer scenes would fail that check by construction.
export const MEAT_SCENE_MAX = 2.5;

const SENTENCE_END = /[.!?…]$/u;
const CLAUSE_END = /[,;:—–]$/u;
const JOINERS = new Set(["y", "e", "o", "u", "pero", "porque"]);

function boundaryRank(words: string[], end: number): number {
  const left = words[end - 1] ?? "";
  const right = (words[end] ?? "").toLowerCase().replace(/^[¿¡"«]+/, "");
  if (SENTENCE_END.test(left)) return 0;
  if (CLAUSE_END.test(left) || JOINERS.has(right)) return 1;
  return 2;
}

// `parts` stretches of `text`. A sentence boundary wins over a cut in the middle of a sentence, a clause over a
// bare word, and a cut near the even share over one far away. Never empties a part when there are enough words.
export function splitSpoken(text: string, parts: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const n = Math.max(1, Math.min(Math.floor(parts) || 1, words.length));
  if (n === 1) return [words.join(" ")];
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const prev = cuts[k - 1];
    const ideal = prev + (words.length - prev) / (n - k + 1);
    const minJ = prev + 1;
    const maxJ = words.length - (n - k);
    let bestJ = Math.min(maxJ, Math.max(minJ, Math.round(ideal)));
    let bestScore = Infinity;
    for (let j = minJ; j <= maxJ; j++) {
      const score = boundaryRank(words, j) * 8 + Math.abs(j - ideal);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        bestJ = j;
      }
    }
    cuts.push(bestJ);
  }
  cuts.push(words.length);
  return cuts.slice(0, -1).map((start, i) => words.slice(start, cuts[i + 1]).join(" "));
}

// Half-second lengths of 2 or 2.5 that add up to `target` when that is possible. The heavier stretches get the
// extra half second first.
export function allotSeconds(weights: number[], target: number): number[] {
  const n = weights.length;
  if (!n) return [];
  let extra = Math.round(target * 2) - 4 * n;
  if (!Number.isFinite(extra)) extra = 0;
  extra = Math.max(0, Math.min(n, extra));
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w || a.i - b.i);
  const out = Array<number>(n).fill(2);
  for (let i = 0; i < extra; i++) out[order[i].i] = MEAT_SCENE_MAX;
  return out;
}

// Scenes for a meat longer than 15 s. The count is the fewest that stay at or under 2.5 s and still cover the meat,
// and never more scenes than there are words. Their lengths add up to the meat when there are enough words.
export function meatScenePlan(text: string, seconds: number): { voice: string; seconds: number }[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [{ voice: "", seconds: 2 }];
  const target = Math.max(2, Math.round(seconds));
  const n = Math.max(1, Math.min(Math.ceil(target / MEAT_SCENE_MAX), words.length));
  const voices = splitSpoken(words.join(" "), n);
  const lengths = allotSeconds(voices.map((voice) => voice.split(/\s+/).filter(Boolean).length), target);
  return voices.map((voice, i) => ({ voice, seconds: lengths[i] ?? 2 }));
}

// The piece's text split in sentences (a sentence that is only punctuation is dropped).
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\d]/u.test(s));
}

// Up to six words of the sentence, without its closing punctuation, as a scene title.
export function titleOf(sentence: string): string {
  return sentence
    .replace(/^[¿¡"«]+/, "")
    .replace(/[.!?…:;,"»]+$/, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[,;:]+$/, "");
}

// A scene long enough for its line at about 2.5 words a second, 2 to 8 s, in half seconds.
export const sceneSecondsFor = (line: string) => Math.round(Math.min(8, Math.max(2, line.split(/\s+/).filter(Boolean).length / 2.5 + 0.6)) * 2) / 2;

const KIND_TITLE = { hook: "Gancho", meat: "Cuerpo", cta: "Llamado" } as const;

function scriptShell(seed: AdSeed, scenes: MotionScene[], tone: MotionTone | undefined, note: string): MotionScript {
  return {
    problem: problemOf(seed.text),
    title: `${KIND_TITLE[seed.kind]} ${seed.id} como explicativo`,
    durationNote: `Arranca del texto de ${seed.id}: en el anuncio dura ${secs(seed.seconds)}.`,
    scenes,
    music: { mood: "drive", bpm: 110 },
    note,
    caption: "",
    ...(tone && { tone }),
  };
}

// A Publicidad hook: one kinetic title (the words assemble and, when there is time to read them, fall apart).
function hookScript(seed: AdSeed, tone?: MotionTone): MotionScript {
  const title = (seed.onScreenText.trim() || seed.text.trim() || "Gancho").replace(/\s+/g, " ").trim();
  const voice = seed.text.trim();
  // The subtitle has to fit as well as the title. Half a beat of margin is added inside kineticHookSeconds.
  const voiceNeed = readingNeed(voice) + 0.25;
  const seconds = kineticHookSeconds(title, Math.max(seed.seconds, voiceNeed));
  // When the ad's share is longer than the scene, the last frame holds. A fallen title would hold as scattered words.
  const scene: MotionScene = {
    ...blankScene("hook"),
    title,
    voice,
    seconds,
    ...(seed.seconds <= seconds && kineticLeave(title, seconds) != null && { kineticExit: true }),
  };
  return scriptShell(
    seed,
    [scene],
    tone,
    `Gancho de ${seed.id}. En el anuncio entran los primeros ${secs(seed.seconds)}; si la escena es más larga es para que el título se lea antes de desarmarse.`,
  );
}

// The starting script with no AI key. A hook is one kinetic title. A meat longer than 15 s is one short scene per
// sentence or clause (2 or 2.5 s) and those scenes add up to the meat, so the ad does not cut the ending. A short
// meat or CTA stays one kinetic title per sentence, and a CTA closes on the logo. A starting point, never a finished piece.
export function starterScript(seed: AdSeed, tone?: MotionTone): MotionScript {
  if (seed.presenter === "mascot") return mascotScript(seed, tone);
  if (seed.kind === "hook") return hookScript(seed, tone);
  if (seed.kind === "meat" && seed.seconds > 15) {
    const plan = meatScenePlan(seed.text, seed.seconds);
    const scenes: MotionScene[] = plan.map((line, i) => ({
      ...blankScene("hook"),
      title: titleOf(i === 0 && seed.onScreenText.trim() ? seed.onScreenText : line.voice),
      voice: line.voice,
      seconds: line.seconds,
    }));
    return scriptShell(seed, scenes, tone, `Cuerpo de ${seed.id}, partido en oraciones. El anuncio dura ${secs(seed.seconds)}: las escenas suman ese tiempo.`);
  }
  const lines = sentencesOf(seed.text);
  const scenes: MotionScene[] = lines.map((line, i) => ({ ...blankScene("hook"), title: titleOf(i === 0 && seed.onScreenText.trim() ? seed.onScreenText : line), voice: line, seconds: sceneSecondsFor(line) }));
  if (seed.kind === "cta") {
    const call = titleOf(seed.onScreenText.trim() || lines[lines.length - 1] || "");
    const last = scenes.pop();
    scenes.push({ ...blankScene("logo"), title: last?.title ?? call, items: call ? [call] : [], voice: last?.voice ?? "", seconds: last ? Math.max(3, last.seconds) : 3 });
  }
  if (!scenes.length) scenes.push(blankScene("hook"));
  return scriptShell(seed, scenes, tone, `Guion de partida armado con el texto de ${seed.id}: cambiá las plantillas y sumá pantallas reales o el producto.`);
}

// "Que lo diga la mascota": one character scene per sentence, the series' code mascot (MASCOT_ASSET) saying it with
// the narrator voice (generated, recorded or uploaded in the studio), its mouth by the voice and its face by the
// emotion. The hook opens surprised, the CTA closes cheering, the rest presents. Same length rule as the starter.
export const MASCOT_GESTURE: Record<TargetKind, { first: MotionScene["gesture"]; rest: MotionScene["gesture"]; last: MotionScene["gesture"] }> = {
  hook: { first: "surprise", rest: "present", last: "present" },
  meat: { first: "present", rest: "point", last: "present" },
  cta: { first: "present", rest: "present", last: "cheer" },
};
export function mascotScript(seed: AdSeed, tone?: MotionTone): MotionScript {
  const lines = sentencesOf(seed.text);
  const g = MASCOT_GESTURE[seed.kind];
  const scenes: MotionScene[] = lines.map((line, i) => ({
    ...blankScene("character"),
    asset: MASCOT_ASSET,
    title: titleOf(i === 0 && seed.onScreenText.trim() ? seed.onScreenText : line),
    voice: line,
    emotion: (seed.emotion ?? "").trim(),
    gesture: i === lines.length - 1 && i > 0 ? g.last : i === 0 ? g.first : g.rest,
    seconds: sceneSecondsFor(line),
  }));
  if (!scenes.length) scenes.push({ ...blankScene("character"), asset: MASCOT_ASSET });
  const what = EXPLAINER_KIND_LABEL[seed.kind].replace(/ \(.*\)$/, "");
  return {
    problem: problemOf(seed.text),
    title: `${what.charAt(0).toUpperCase()}${what.slice(1)} ${seed.id} dicho por la mascota`,
    durationNote: `Arranca del texto de ${seed.id}: en el anuncio dura ${secs(seed.seconds)}.`,
    scenes,
    music: { mood: "drive", bpm: 110 },
    note: `La mascota dice el texto de ${seed.id}. Poné la voz del narrador en cada escena (generada, grabada o subida), generá el video y volvé con «Usar en Publicidad».`,
    caption: "",
    ...(tone && { tone }),
  };
}

// The new explainer piece itself: the studio's defaults, aimed at the piece's seconds (2 to 120; a 3 s hook stays 3).
export function starterPiece(seed: AdSeed, format: "vertical" | "horizontal", tone?: MotionTone): MotionPiece {
  const target = Math.min(120, Math.max(2, Math.round(seed.seconds)));
  return { ...newMotionPiece(format), script: starterScript(seed, tone), durationMode: "manual", target };
}
