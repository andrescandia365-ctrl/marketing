// A meat longer than 15 s is a sequence of Grok clips. Grok Imagine makes clips of 6, 10 or 15 s only
// (server/tools/grok-imagine.md); the app splits the meat into those lengths, gives each clip its own stretch of the
// text, and the render plays them in order and cuts the last one to the meat. Pieces of 15 s or less stay one clip
// (clipSecondsFor). No AI key: the prompts are text to paste into Grok.
import { clipSecondsFor } from "./ads.ts";

export type GrokLength = 6 | 10 | 15;
export type GrokSlot = { length: GrokLength; play: number };

// Exact partition of `seconds` into 15, 10 and 6, preferring more 15 s clips, then more 10 s. Null when none exists.
function partition(seconds: number): GrokLength[] | null {
  if (!Number.isInteger(seconds) || seconds < 0) return null;
  const n15max = Math.floor(seconds / 15);
  for (let n15 = n15max; n15 >= 0; n15--) {
    const after15 = seconds - n15 * 15;
    const n10max = Math.floor(after15 / 10);
    for (let n10 = n10max; n10 >= 0; n10--) {
      const rem = after15 - n10 * 10;
      if (rem % 6 === 0) {
        return [...Array<GrokLength>(n15).fill(15), ...Array<GrokLength>(n10).fill(10), ...Array<GrokLength>(rem / 6).fill(6)];
      }
    }
  }
  return null;
}

// One slot up to 15 s. Longer: an exact partition (50 s = 15+15+10+10), else the smallest cover of 6/10/15 and the
// last clip plays only the seconds that are left (17 s = three 6 s files, the last one plays 5 s).
export function grokSequence(seconds: number): GrokSlot[] {
  if (!(seconds > 0)) return [];
  if (seconds <= 15) return [{ length: clipSecondsFor(seconds), play: seconds }];
  const exact = partition(seconds);
  if (exact) return exact.map((length) => ({ length, play: length }));
  for (let total = Math.ceil(seconds); total <= seconds + 14; total++) {
    const parts = partition(total);
    if (!parts) continue;
    const slots: GrokSlot[] = parts.map((length) => ({ length, play: length }));
    const prev = slots.slice(0, -1).reduce((n, s) => n + s.play, 0);
    slots[slots.length - 1].play = seconds - prev;
    return slots;
  }
  return [];
}

// The meat's words, split by how long each clip plays. The last clip gets whatever is left, including a short one.
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
  let used = 0;
  const counts: number[] = [];
  for (let i = 0; i < slots.length - 1; i++) {
    const take = Math.min(Math.floor((play[i] / total) * words.length), words.length - used);
    counts.push(take);
    used += take;
  }
  counts.push(words.length - used);
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

export type SequencePromptInput = {
  text: string;
  seconds: number;
  visualPrompt: string;
  videoPrompt: string;
  look?: string;
};

const quote = (s: string) => s.replace(/\s+/g, " ").replace(/["“”]/g, "'").trim();

// One Grok prompt per clip, from the piece's own prompts (the @refs and the place are already in them) plus the look.
// A single clip (15 s or less) is not a sequence: this returns [].
export function sequencePromptsFromPiece(input: SequencePromptInput): string[] {
  const slots = grokSequence(input.seconds);
  if (slots.length <= 1) return [];
  const lines = stretchText(input.text, slots);
  return slots.map((slot, i) => {
    const cut = slot.play < slot.length ? `The finished piece plays the first ${slot.play} s of this clip.` : "";
    return [
      clipContinuity(i, slots.length),
      input.visualPrompt.trim(),
      input.videoPrompt.trim(),
      input.look?.trim() ? `Look: ${input.look.trim()}` : "",
      `Spoken in this clip only, once, as written: "${quote(lines[i] ?? "")}"`,
      "No music.",
      `Length: ${slot.length} s.`,
      cut,
    ]
      .filter(Boolean)
      .join("\n");
  });
}

export function sequencePromptText(prompts: string[]): string {
  return prompts.map((p, i) => `Clip ${i + 1} de ${prompts.length}\n${p}`).join("\n\n———\n\n");
}
