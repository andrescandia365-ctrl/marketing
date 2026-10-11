// A transform shot whose initial or final frame is a real screen from the series cast: the clip moves from the AI
// scene into the real screenshot (or out of it). The screenshot is the person's own file, never drawn by AI, so
// the app never generates that frame and the video prompt says it must stay exactly as uploaded.
import type { ScreenAt, Shot } from "./schema.ts";

// Where one frame of a shot comes from: an image prompt the person generates, or a real screen from the cast.
export type FrameSource = { from: "prompt"; prompt: string } | { from: "screen"; screen: string };

export type ShotFrames = { start: FrameSource; middle: FrameSource | null; end: FrameSource | null };

type FrameShot = Pick<Shot, "kind" | "screen" | "screenAt" | "visualPrompt" | "middlePrompt" | "endPrompt">;

// The frames the tool is given for this shot, in order. A screen shot is one real screenshot; a single shot is
// its first frame only.
export function shotFrames(shot: FrameShot): ShotFrames {
  const prompt = (p: string): FrameSource => ({ from: "prompt", prompt: p });
  const screen: FrameSource = { from: "screen", screen: shot.screen };
  if (shot.kind === "screen") return { start: screen, middle: null, end: null };
  if (shot.kind !== "transform") return { start: prompt(shot.visualPrompt), middle: null, end: null };
  const real = shot.screen.trim() ? shot.screenAt ?? "" : "";
  return {
    start: real === "start" ? screen : prompt(shot.visualPrompt),
    middle: shot.middlePrompt.trim() ? prompt(shot.middlePrompt) : null,
    end: real === "end" ? screen : prompt(shot.endPrompt),
  };
}

// Whether "Generar imagen" makes this shot's picture: never when its first frame is a real screen.
export function generatesImage(shot: FrameShot): boolean {
  return shotFrames(shot).start.from === "prompt";
}

// Whether a shot may say "edit the image of shot editFrom": only when that earlier shot exists and its picture is
// an AI image. A screen shot or a transform that starts on a real screen has a real screenshot there, which is
// never edited by AI.
export function editsFrom(shots: FrameShot[], editFrom: number): boolean {
  const target = editFrom > 0 ? shots[editFrom - 1] : undefined;
  return !!target && generatesImage(target);
}

// The shots with every editFrom that leads to a missing shot or a real screenshot cleared (with its editPrompt).
export function settleEditFrom<T extends FrameShot & Pick<Shot, "editFrom" | "editPrompt">>(shots: T[]): T[] {
  return shots.map((s) => (s.editFrom > 0 && !editsFrom(shots, s.editFrom) ? { ...s, editFrom: 0, editPrompt: "" } : s));
}

// The real screen at one end of a transform, if any.
export function transformScreen(shot: FrameShot): { at: Exclude<ScreenAt, "">; screen: string } | null {
  if (shot.kind !== "transform" || !shot.screen.trim() || !shot.screenAt) return null;
  return { at: shot.screenAt, screen: shot.screen };
}

const MARK = "Frames (real screen):";
const END = "as uploaded.";

// The sentence the video prompt carries for a real-screen end. It names the screen and keeps its text untouched.
export function screenMoveLine(at: Exclude<ScreenAt, "">, screenName: string): string {
  const name = screenName.trim() || "the product's screen";
  return at === "end"
    ? `${MARK} the final frame is a real screenshot of the product (${name}), loaded as the end image. The camera moves in on the phone until its screen fills the frame and lands exactly on that screenshot; never redraw, retype or animate its text, buttons or layout, it stays ${END}`
    : `${MARK} the initial frame is a real screenshot of the product (${name}), loaded as the start image. The camera pulls back out of the phone's screen into the scene; while the screenshot fills the frame, never redraw, retype or animate its text, buttons or layout, it stays ${END}`;
}

// The video prompt with its real-screen sentence for this end (replacing an earlier one), placed before its "Audio:"
// line. With no end, the sentence is taken out. Running it twice gives the same prompt.
export function withScreenMove(videoPrompt: string, at: ScreenAt, screenName: string): string {
  let prompt = videoPrompt;
  const from = prompt.indexOf(MARK);
  if (from >= 0) {
    const close = prompt.indexOf(END, from);
    const audio = prompt.slice(from).search(/\bAudio:/i);
    const to = close >= 0 ? close + END.length : audio >= 0 ? from + audio : prompt.length;
    prompt = [prompt.slice(0, from).trimEnd(), prompt.slice(to).trimStart()].filter(Boolean).join(" ");
  }
  prompt = prompt.trim();
  if (!at) return prompt;
  const line = screenMoveLine(at, screenName);
  const audio = prompt.search(/\bAudio:/i);
  const before = (audio >= 0 ? prompt.slice(0, audio) : prompt).trim();
  const after = audio >= 0 ? prompt.slice(audio).trim() : "";
  const head = before && !/[.!?]$/.test(before) ? `${before}.` : before;
  return [head, line, after].filter(Boolean).join(" ");
}

// After the writer: a transform may end (or start) on a real screen only when the screen is one this piece may
// show. Otherwise that end goes back to an AI frame, or the shot to a single one when it has no other final frame.
// The kept ones get the real-screen sentence in their video prompt.
export function settleScreenShot<T extends Shot>(shot: T, screens: Record<string, string>): T {
  if (shot.kind !== "transform" || !shot.screenAt) return shot;
  const name = screens[shot.screen.trim()];
  if (name === undefined) {
    const kind = shot.screenAt === "end" && !shot.endPrompt.trim() ? "single" : shot.kind;
    return { ...shot, kind, screenAt: "", screen: "", videoPrompt: withScreenMove(shot.videoPrompt, "", "") };
  }
  return { ...shot, videoPrompt: withScreenMove(shot.videoPrompt, shot.screenAt, name) };
}
