// The clip lengths a video tool makes, read from its profile in server/tools/ ("Clip lengths: 6, 10, 15" or
// "Clip lengths: 4-15"). Grok makes 6, 10 or 15 s; Seedance takes any whole second in a range. A profile that names
// none keeps Grok's three lengths, so old pieces and the general profile work as before.
import { SHOT_LENGTHS } from "./schema.ts";

// The most a story shot may last with any tool (continuous takes stay at 15 s).
export const LONGEST_SHOT = 30;

// Lengths from "Clip lengths:" in a profile, whole seconds from 1 to LONGEST_SHOT, sorted, or null when the line is
// missing or names nothing usable.
export function clipLengths(profile: string): number[] | null {
  const m = profile.match(/^(?:-\s*(?:\[[A-Z ]+\]\s*)?)?Clip lengths:\s*(.+)$/im);
  if (!m) return null;
  const out = new Set<number>();
  for (const part of m[1].split(/[,;]| or | o /)) {
    const range = part.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (a <= b) for (let s = a; s <= b; s++) out.add(s);
      continue;
    }
    const one = part.match(/\d+/);
    if (one) out.add(Number(one[0]));
  }
  const lengths = [...out].filter((s) => s >= 1 && s <= LONGEST_SHOT).sort((a, b) => a - b);
  return lengths.length ? lengths : null;
}

// The lengths a tool makes: its profile's, else Grok's.
export function lengthsOf(tool: { lengths?: number[] | null } | undefined | null): readonly number[] {
  return tool?.lengths?.length ? tool.lengths : SHOT_LENGTHS;
}

// True when the lengths are a run of whole seconds (Seedance) rather than a few fixed ones (Grok).
export function isRange(lengths: readonly number[]): boolean {
  return lengths.length > 3 && lengths.every((s, i) => i === 0 || s === lengths[i - 1] + 1);
}

// "6, 10 o 15 s" or "de 4 a 15 s", for the app's own text.
export function lengthsText(lengths: readonly number[]): string {
  if (isRange(lengths)) return `de ${lengths[0]} a ${lengths[lengths.length - 1]} s`;
  if (lengths.length === 1) return `${lengths[0]} s`;
  return `${lengths.slice(0, -1).join(", ")} o ${lengths[lengths.length - 1]} s`;
}

// The same in English, for the writer: "6, 10 or 15 s" or "4 to 15 s".
export function lengthsEnglish(lengths: readonly number[]): string {
  if (isRange(lengths)) return `${lengths[0]} to ${lengths[lengths.length - 1]} s`;
  if (lengths.length === 1) return `${lengths[0]} s`;
  return `${lengths.slice(0, -1).join(", ")} or ${lengths[lengths.length - 1]} s`;
}

// The writer's rule for shot lengths. Grok's text is the one the board writer always had.
export function lengthRule(lengths: readonly number[]): string {
  if (isRange(lengths)) {
    const [min, max] = [lengths[0], lengths[lengths.length - 1]];
    return `seconds: a whole number from ${min} to ${max}, the clip lengths the tool makes. Fit the spoken line at about 2.5 words per second plus about 1 s of breath (a 10-word line is 5 s). Split a line longer than ${max} s into two shots. A silent shot is ${Math.max(min, 5)} s. toolSettings says the same length.`;
  }
  if (lengths.length === 3 && lengths.join() === SHOT_LENGTHS.join()) {
    return "seconds: exactly 6, 10 or 15, the only clip lengths the tool makes. Pick the shortest that fits the spoken line at about 2.5 words per second (6 s up to 15 words, 10 s up to 25, 15 s up to 37). Split a longer line into two shots. A silent shot is 6 s. toolSettings says the same length.";
  }
  const list = lengths.join(", ");
  return `seconds: exactly one of ${list}, the only clip lengths the tool makes. Pick the shortest that fits the spoken line at about 2.5 words per second. Split a longer line into two shots. A silent shot is ${lengths[0]} s. toolSettings says the same length.`;
}

// Every whole second a saved board may hold: boards sent back by the app keep the lengths they already have.
export const ANY_LENGTH: readonly number[] = Array.from({ length: LONGEST_SHOT }, (_, i) => i + 1);
