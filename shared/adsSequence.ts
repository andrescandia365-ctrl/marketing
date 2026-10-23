// A meat longer than 15 s is a sequence of Grok clips. Grok Imagine makes clips of 6, 10 or 15 s only
// (server/tools/grok-imagine.md). The app picks the fewest clips, then the least waste, longer clips first, and cuts
// only the last one. Each clip gets its own stretch of the text. The render plays them in order. Pieces of 15 s or
// less stay one clip (clipSecondsFor). No AI key: the prompts are text to paste into Grok.
import { audioLine } from "./audio.ts";
import { clipSecondsFor } from "./ads.ts";
import { PLAIN_VIDEO } from "./prompt.ts";

export type GrokLength = 6 | 10 | 15;
export type GrokSlot = { length: GrokLength; play: number };

type CoverPick = { waste: number; n15: number; parts: GrokLength[] };

// Fewest clips first, then the least leftover, then more 15 s clips. Longer clips come first. Null when nothing covers.
function fewestCover(seconds: number): CoverPick | null {
  const minN = Math.ceil(seconds / 15);
  const maxN = Math.ceil(seconds / 6);
  let best: CoverPick | null = null;
  for (let n = minN; n <= maxN; n++) {
    for (let n15 = n; n15 >= 0; n15--) {
      for (let n10 = n - n15; n10 >= 0; n10--) {
        const n6 = n - n15 - n10;
        const sum = n15 * 15 + n10 * 10 + n6 * 6;
        if (sum + 1e-9 < seconds) continue;
        const waste = sum - seconds;
        const parts: GrokLength[] = [
          ...Array<GrokLength>(n15).fill(15),
          ...Array<GrokLength>(n10).fill(10),
          ...Array<GrokLength>(n6).fill(6),
        ];
        if (!best || waste < best.waste - 1e-9 || (Math.abs(waste - best.waste) <= 1e-9 && n15 > best.n15)) {
          best = { waste, n15, parts };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// The last slot is the only one that plays shorter than its file. Null when the seconds are not a positive number.
function cover(seconds: number): GrokSlot[] | null {
  if (!(seconds > 0)) return null;
  const chosen = fewestCover(seconds);
  if (!chosen || chosen.parts.length === 0) return null;
  const slots: GrokSlot[] = chosen.parts.map((length) => ({ length, play: length }));
  const prev = slots.slice(0, -1).reduce((n, s) => n + s.play, 0);
  const last = seconds - prev;
  if (!(last > 0) || last > slots[slots.length - 1].length + 1e-9) return null;
  slots[slots.length - 1].play = last;
  return slots;
}

// One slot up to 15 s. Longer: the fewest 6/10/15 clips that cover it, longer first, and only the last one is cut
// (22 s = a 15 and a 10, the 10 plays 7 s).
export function grokSequence(seconds: number): GrokSlot[] {
  if (!(seconds > 0)) return [];
  if (seconds <= 15) return [{ length: clipSecondsFor(seconds), play: seconds }];
  return cover(seconds) ?? [];
}

// The meat's words, split by how long each clip plays. Cumulative rounding, so the leftover does not all land on
// the last clip. An empty stretch stays "" (the prompt says "no speech"; a subtitle stays blank).
export function stretchText(text: string, slots: GrokSlot[]): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!slots.length) return [];
  if (!words.length) return slots.map(() => "");
  const play = slots.map((s) => Math.max(0, s.play));
  const total = play.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const out = slots.map(() => "");
    out[out.length - 1] = words.join(" ");
    return out;
  }
  let acc = 0;
  let prev = 0;
  const counts: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    acc += (play[i] / total) * words.length;
    const cut = i === slots.length - 1 ? words.length : Math.min(words.length, Math.max(prev, Math.round(acc)));
    counts.push(cut - prev);
    prev = cut;
  }
  const out: string[] = [];
  let at = 0;
  for (const n of counts) {
    out.push(words.slice(at, at + n).join(" "));
    at += n;
  }
  return out;
}

// The continuity line of clip `index` (0-based). The same person, place and light, and the action does not restart.
export function clipContinuity(index: number, total: number): string {
  if (index <= 0) return `Clip 1 of ${total}.`;
  return `Clip ${index + 1} of ${total}. Continues exactly where clip ${index} ended: same person, same place, same light, the action does not restart.`;
}

// Shown on every clip after the first, in the panel and in the copied text. `index` is 0-based, so clip 2 names clip 1.
export function continuityNote(index: number): string {
  if (index <= 0) return "";
  return `Usá el último cuadro del clip ${index} como imagen inicial (o Extender en Grok).`;
}

export type SequencePromptInput = {
  text: string;
  seconds: number;
  visualPrompt: string;
  videoPrompt: string;
  look?: string;
};

// One Grok prompt per clip. A normal meat is silent: the piece's own voice says the line, so the clip has no spoken
// quote. The first clip plays the action; each later clip continues it. With no series look, the plain phone line.
// A single clip (15 s or less) is not a sequence: this returns [].
export function sequencePromptsFromPiece(input: SequencePromptInput): string[] {
  const slots = grokSequence(input.seconds);
  if (slots.length <= 1) return [];
  const look = input.look?.trim() || PLAIN_VIDEO;
  const video = input.videoPrompt.trim();
  return slots.map((slot, i) => {
    const cut = slot.play < slot.length ? `The finished piece plays the first ${slot.play} s of this clip.` : "";
    const action = i === 0 ? video : `The action continues from the previous clip and does not start over. ${video}`.trim();
    return [
      clipContinuity(i, slots.length),
      input.visualPrompt.trim(),
      action,
      `Look: ${look}`,
      audioLine({ hear: ["ambient"], detail: "" }),
      `Length: ${slot.length} s.`,
      cut,
    ]
      .filter(Boolean)
      .join("\n");
  });
}

export function sequencePromptText(prompts: string[]): string {
  return prompts
    .map((p, i) => [`Clip ${i + 1} de ${prompts.length}`, continuityNote(i), p].filter(Boolean).join("\n"))
    .join("\n\n———\n\n");
}

// A place in the sequence (0-based). Null when it is one of this piece's clips; a Spanish reason otherwise.
export function sequenceSlot(seconds: number, index: number): string | null {
  const n = Math.max(1, grokSequence(seconds).length);
  if (Number.isInteger(index) && index >= 0 && index < n) return null;
  const where = n === 1 ? "el 1" : `un número entero del 1 al ${n}`;
  return `Esta pieza tiene ${n} ${n === 1 ? "clip" : "clips"}. El lugar tiene que ser ${where}.`;
}

// What a batch is about to render with a hole. A finished explainer is one clip, not a row of empty slots.
export type ClipPresence = {
  id: string;
  seconds: number;
  approved: boolean;
  explainer: boolean;
  clip: boolean;
  slots: boolean[];
};

export function emptyClipSlots(pieces: ClipPresence[]): { id: string; clips: number[] }[] {
  const out: { id: string; clips: number[] }[] = [];
  for (const p of pieces) {
    if (!p.approved) continue;
    const seq = !p.explainer && grokSequence(p.seconds).length > 1;
    if (!seq) {
      if (!p.clip) out.push({ id: p.id, clips: [1] });
      continue;
    }
    const missing: number[] = [];
    for (let i = 0; i < grokSequence(p.seconds).length; i++) if (!p.slots[i]) missing.push(i + 1);
    if (missing.length) out.push({ id: p.id, clips: missing });
  }
  return out;
}

// A shot is under a voice when their ranges overlap. A shot that starts exactly when the voice ends is not under it,
// so the next piece is not ducked.
export function shotUnderVoice(start: number, end: number, spans: { start: number; end: number }[], eps = 1e-4): boolean {
  return spans.some((v) => start < v.end - eps && end > v.start + eps);
}

// Where loudness is measured. A hard cut is inside one piece, so those shots share the piece's level. With no
// hardCuts (a story), every shot is its own piece.
export function pieceLoudnessStarts(starts: number[], hardCuts?: boolean[]): number[] {
  return starts.filter((_, i) => i === 0 || !hardCuts?.[i]);
}
