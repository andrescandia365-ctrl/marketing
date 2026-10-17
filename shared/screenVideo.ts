// "Videos de la app funcionando": a real screen of the cast can carry a screen recording (ScreenVideo in
// shared/series.ts), and the explainer templates that show a real screen (screen, zoom, hook, callouts, and what a
// character presents) can play a stretch of it inside the device frame, muted (the app's own sound never enters the
// mix). Everything here is pure: which recording a scene plays, which second of the recording frame t shows (in/out,
// speed, hold the last frame or loop), which scenes are on screen at t, and how the file type is read from its bytes.
// The browser side (src/lib/screenVideo.ts) seeks each video to these times before a frame is drawn.
import { elementTimes, pushOf, type MotionScene, type TimedScene } from "./motion.ts";
import { isMetaphorAsset } from "./metaphor.ts";

// The biggest recording the library takes, and the types the browsers play (read from the bytes, never the name).
export const SCREEN_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const SCREEN_VIDEO_TYPES = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" } as const;
export type ScreenVideoType = keyof typeof SCREEN_VIDEO_TYPES;
export const SCREEN_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

// MP4 and MOV are ISO boxes: "ftyp" at byte 4 (QuickTime's own brand "qt  " is a MOV), or an old MOV that starts
// straight with a moov, mdat, wide or free box. WebM is EBML (1A 45 DF A3) whose doc type says "webm".
export function videoTypeOf(bytes: Uint8Array): ScreenVideoType | null {
  if (bytes.length < 12) return null;
  const box = ascii(bytes, 4, 8);
  if (box === "ftyp") return ascii(bytes, 8, 12) === "qt  " ? "mov" : "mp4";
  if (["moov", "mdat", "wide", "free"].includes(box)) return "mov";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return ascii(bytes, 0, Math.min(bytes.length, 64)).includes("webm") ? "webm" : null;
  }
  return null;
}

// What a scene plays of its screen's recording: from `from` to `to` seconds of the recording (no `to`: to its end), at
// `rate` (1 = real speed), and what happens when the stretch is over before the scene: hold its last frame (the
// default) or start again.
export type ScreenClip = { from: number; to?: number; rate: number; end?: "hold" | "loop" };
export const CLIP_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
export const RATE_MIN = 0.25;
export const RATE_MAX = 4;
// How far before the end a held recording stops: under one frame of a 60 fps recording, so the frame shown is the
// last one before `to` (a seek to the very end can show nothing).
export const HOLD_BACK = 1 / 120;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
const micro = (x: number) => Math.round(x * 1e6) / 1e6;
export const clipRate = (rate: number | undefined) => clamp(rate ?? 1, RATE_MIN, RATE_MAX);

// The stretch within a recording of `duration` seconds: from inside it, to after from (or the end).
export function clipRange(clip: ScreenClip, duration: number): { from: number; to: number } {
  const d = Math.max(0, duration);
  const from = clamp(clip.from, 0, Math.max(0, d - HOLD_BACK));
  const to = clip.to === undefined ? d : clamp(clip.to, from, d);
  return { from, to };
}

// How long the stretch plays, in scene seconds.
export function clipSeconds(clip: ScreenClip, duration: number): number {
  const { from, to } = clipRange(clip, duration);
  return (to - from) / clipRate(clip.rate);
}

// The second of the recording on screen at scene time lt, when the picture comes in at `startAt` (its element's
// time). Before that: the first frame of the stretch. Then it plays at the rate, and at the end of the stretch it
// holds the last frame before `to`, or loops back to `from`. Always inside the recording.
export function clipTime(clip: ScreenClip, duration: number, lt: number, startAt = 0): number {
  const d = Math.max(0, duration);
  const last = Math.max(0, d - HOLD_BACK);
  const { from, to } = clipRange(clip, d);
  const span = to - from;
  const played = Math.max(0, (Number.isFinite(lt) ? lt : 0) - startAt) * clipRate(clip.rate);
  let v: number;
  if (span <= HOLD_BACK) v = from;
  else if (clip.end === "loop") v = from + (played % span);
  else v = Math.min(from + played, to - HOLD_BACK);
  return micro(clamp(v, 0, last));
}

// Whether the recording is moving at scene time lt (the preview lets it play then, and holds it otherwise).
export function clipMoving(clip: ScreenClip, duration: number, lt: number, startAt = 0): boolean {
  if (lt < startAt) return false;
  const { from, to } = clipRange(clip, duration);
  if (to - from <= HOLD_BACK) return false;
  return clip.end === "loop" || from + (lt - startAt) * clipRate(clip.rate) < to - HOLD_BACK;
}

// The picture a scene can play as a recording, and the element whose time starts it: the main picture of a hook, a
// real screen, a zoom or callouts, or what a character presents.
const VIDEO_MEDIA: readonly MotionScene["template"][] = ["hook", "screen", "zoom", "callouts"];
export const VIDEO_TEMPLATES: readonly MotionScene["template"][] = [...VIDEO_MEDIA, "character"];
export function videoAssetOf(scene: Pick<MotionScene, "template" | "asset" | "assetB">): { id: string; key: "media" | "prop" } | null {
  if (scene.template === "character") return scene.assetB ? { id: scene.assetB, key: "prop" } : null;
  // "Escenas metáfora": the clip Grok made from the picture plays in its place (when one was uploaded).
  if (scene.template === "metaphor") return isMetaphorAsset(scene.asset) ? { id: scene.asset, key: "media" } : null;
  return VIDEO_MEDIA.includes(scene.template) && scene.asset ? { id: scene.asset, key: "media" } : null;
}

// "Escenas metáfora": a metaphor's Grok clip plays once from its start when the picture comes in and holds its last
// frame (a clip of 6 s in a shorter scene is cut by the scene's end).
export const METAPHOR_CLIP: ScreenClip = { from: 0, rate: 1 };
// What a scene plays of its picture's recording: its own stretch, or a metaphor's whole clip; none for the rest.
export const sceneClip = (scene: Pick<MotionScene, "template"> & { recording?: ScreenClip }): ScreenClip | undefined =>
  scene.recording ?? (scene.template === "metaphor" ? METAPHOR_CLIP : undefined);
// The recordings a piece's scenes play (a render checks each can be read first).
export function recordingsUsed(scenes: readonly MotionScene[]): Set<string> {
  return new Set(scenes.flatMap((s) => (sceneClip(s) && videoAssetOf(s) ? [videoAssetOf(s)!.id] : [])));
}

// The scenes drawn at piece time t and their scene time: the scene on screen, and while it comes in (its push, a
// camera journey or a carry) the one before it at its last moment. The same choice as the engine's drawPicture.
export function drawnAt(scenes: TimedScene[], push: number, t: number): { scene: TimedScene; lt: number }[] {
  if (!scenes.length) return [];
  let i = scenes.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = scenes.length - 1;
  const s = scenes[i];
  const lt = t - s.start;
  const out = [{ scene: s, lt }];
  if (i > 0 && lt < pushOf(s, push)) {
    const prev = scenes[i - 1];
    out.push({ scene: prev, lt: prev.seconds - 0.001 });
  }
  return out;
}

// One recording a frame needs: which scene plays it (each scene has its own player, so two scenes can show the same
// recording at different seconds during a change), which screen, and the second to show.
export type VideoNeed = { sceneId: string; asset: string; time: number; moving: boolean; rate: number };

// Every recording frame t needs, from the scenes as they play, given each screen's recording length (none: the screen
// has no recording, and the scene shows its still).
export function videoPlan(scenes: TimedScene[], push: number, t: number, seconds: (asset: string) => number | undefined): VideoNeed[] {
  const needs: VideoNeed[] = [];
  for (const { scene, lt } of drawnAt(scenes, push, t)) {
    const v = videoAssetOf(scene);
    const d = v ? seconds(v.id) : undefined;
    const clip = sceneClip(scene);
    if (!clip || !v || !d) continue;
    const startAt = elementTimes(scene)[v.key] ?? 0;
    needs.push({ sceneId: scene.id, asset: v.id, time: clipTime(clip, d, lt, startAt), moving: clipMoving(clip, d, lt, startAt), rate: clipRate(clip.rate) });
  }
  return needs;
}

// A frame is frame-accurate when its player sits on the planned second (to a millisecond). While the preview plays,
// the player runs on its own and is only put back when it drifts more than PLAY_DRIFT from the mix's clock.
export const SEEK_EXACT = 0.001;
export const PLAY_DRIFT = 0.2;
export const needsSeek = (current: number, target: number, exact: boolean) => Math.abs(current - target) > (exact ? SEEK_EXACT : PLAY_DRIFT);

// The writer's word for a clip: "2-7", "2–7 x1.5", "0-fin", "3 a 9 en bucle", "sí" (the whole recording). Empty or
// "no": the still screenshot.
export function pickClip(value: string | undefined): ScreenClip | undefined {
  const v = (value ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!v || /^(no|none|ninguno|-|still|fija)$/.test(v)) return undefined;
  const num = "(\\d+(?:\\.\\d+)?)";
  const range = new RegExp(`${num}\\s*(?:-|–|—|a|to|hasta)\\s*(${num.slice(1, -1)}|fin|end)?`).exec(v);
  // "x1.5" first (the stretch's own numbers come before it), else "1.5x" at the end.
  const rate = new RegExp(`(?:x|×)\\s*${num}`).exec(v) ?? new RegExp(`${num}\\s*(?:x|×)\\s*$`).exec(v);
  const clip: ScreenClip = { from: 0, rate: 1 };
  if (range) {
    clip.from = Number(range[1]);
    if (range[2] && !/fin|end/.test(range[2])) clip.to = Number(range[2]);
  } else if (!/s[ií]|yes|video|play|todo|whole|entero/.test(v) && !rate) return undefined;
  if (rate) clip.rate = clipRate(Number(rate[1]));
  if (/loop|bucle|repit/.test(v)) clip.end = "loop";
  if (clip.to !== undefined && clip.to <= clip.from) delete clip.to;
  return clip;
}

// The clip as the writer and the storyboard read it: "2-7 x1.5", "0-fin en bucle"; "" for none.
export function clipText(clip: ScreenClip | undefined): string {
  if (!clip) return "";
  const n = (x: number) => String(Math.round(x * 100) / 100);
  const rate = clipRate(clip.rate);
  return `${n(clip.from)}-${clip.to === undefined ? "fin" : n(clip.to)}${rate !== 1 ? ` x${n(rate)}` : ""}${clip.end === "loop" ? " en bucle" : ""}`;
}

// After the writer: a clip stays only on a scene that plays a screen with a recording, inside that recording.
export function settleClips<S extends Pick<MotionScene, "template" | "asset" | "assetB"> & { recording?: ScreenClip }>(
  scenes: S[],
  seconds: (asset: string) => number | undefined,
): S[] {
  return scenes.map((s) => {
    const c = s.recording;
    if (!c) return s;
    const v = videoAssetOf(s);
    const d = v ? seconds(v.id) : undefined;
    if (!d) {
      const { recording: _r, ...rest } = s;
      return rest as S;
    }
    const { from, to } = clipRange(c, d);
    const recording: ScreenClip = { from: micro(from), rate: clipRate(c.rate), ...(to < d && { to: micro(to) }), ...(c.end === "loop" && { end: "loop" as const }) };
    return { ...s, recording };
  });
}

// The line the writer reads for a screen with a recording.
export const recordingNote = (seconds: number) => `has a screen recording of ${(Math.round(seconds * 10) / 10).toFixed(1)} s (it can play in a scene: clip)`;
