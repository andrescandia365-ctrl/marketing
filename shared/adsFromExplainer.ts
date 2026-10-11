// "Usar como cuerpo o llamado": a finished explainer (MotionStudio) goes into Publicidad as the clip of a meat or a CTA
// of the same series, copied on the server from the project folder into publicidad/<series>/media/ (no download and
// upload). The piece keeps its length budget (6/10/15 s ads, BUDGETS): a longer explainer is used from an in point
// for the piece's seconds, a shorter one holds its last frame. And the way back: a meat or CTA with no clip can start
// a new explainer prefilled with its text ("Hacelo como explicativo"), usable with no AI key.
import { BUDGETS, LEVELS, isAdSeconds, nextId, type AdsState, type Cta, type Hook, type Meat } from "./ads.ts";
import { MASCOT_ASSET } from "./mascot.ts";
import { blankScene, newMotionPiece, type MotionPiece, type MotionScene, type MotionScript, type MotionTone } from "./motion.ts";

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

// A new piece's seconds: its share of an ad of that length.
export const pieceSecondsFor = (kind: TargetKind, adSeconds: number): number => BUDGETS[isAdSeconds(adSeconds) ? adSeconds : 15][kind];

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
    .slice(0, 600);
}

// A new meat or CTA made from the explainer: the person chose it, so it comes approved; the levels are all five
// (an explainer explains, it fits any awareness) and the note says where it came from.
export function explainerPiece(state: AdsState, kind: ExplainerKind, seconds: number, text: string, title: string): Meat | Cta {
  const base = {
    text: text.trim().slice(0, 600),
    onScreenText: "",
    visualPrompt: "",
    videoPrompt: "",
    seconds: Math.min(15, Math.max(1, seconds)),
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

// The starting script with no AI key: one kinetic-title scene per sentence, its line as the voice; a CTA closes on the
// logo with its call. A starting point to change in the studio (templates, real screens), never a finished piece.
export function starterScript(seed: AdSeed, tone?: MotionTone): MotionScript {
  if (seed.presenter === "mascot") return mascotScript(seed, tone);
  const lines = sentencesOf(seed.text);
  const scenes: MotionScene[] = lines.map((line, i) => ({ ...blankScene("hook"), title: titleOf(i === 0 && seed.onScreenText.trim() ? seed.onScreenText : line), voice: line, seconds: sceneSecondsFor(line) }));
  if (seed.kind === "cta") {
    const call = titleOf(seed.onScreenText.trim() || lines[lines.length - 1] || "");
    const last = scenes.pop();
    scenes.push({ ...blankScene("logo"), title: last?.title ?? call, items: call ? [call] : [], voice: last?.voice ?? "", seconds: last ? Math.max(3, last.seconds) : 3 });
  }
  if (!scenes.length) scenes.push(blankScene("hook"));
  return {
    problem: "",
    title: `${seed.kind === "meat" ? "Cuerpo" : "Llamado"} ${seed.id} como explicativo`,
    durationNote: `Arranca del texto de ${seed.id}: en el anuncio dura ${secs(seed.seconds)}.`,
    scenes,
    music: { mood: "drive", bpm: 110 },
    note: `Guion de partida armado con el texto de ${seed.id}: cambiá las plantillas y sumá pantallas reales o el producto.`,
    caption: "",
    ...(tone && { tone }),
  };
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
    problem: "",
    title: `${what.charAt(0).toUpperCase()}${what.slice(1)} ${seed.id} dicho por la mascota`,
    durationNote: `Arranca del texto de ${seed.id}: en el anuncio dura ${secs(seed.seconds)}.`,
    scenes,
    music: { mood: "drive", bpm: 110 },
    note: `La mascota dice el texto de ${seed.id}. Poné la voz del narrador en cada escena (generada, grabada o subida), generá el video y volvé con «Usar en Publicidad».`,
    caption: "",
    ...(tone && { tone }),
  };
}

// The new explainer piece itself: the studio's defaults with the starting script.
export function starterPiece(seed: AdSeed, format: "vertical" | "horizontal", tone?: MotionTone): MotionPiece {
  return { ...newMotionPiece(format), script: starterScript(seed, tone) };
}
