// "Sin clave" for Publicidad: the writer's requests go to claude.ai by copy and paste (shared/handoff.ts), and a
// request whose reply would be too long for one answer is split into several prompts. The person copies prompt 1,
// pastes its reply, then prompt 2 (built after the first reply was saved, so it never repeats it), and so on.
// Pure helpers shared by the server routes and the studio, so both count the same prompts.
import { copyKey, type AdCombo, type AdCopy, type CopiesWire, type Cta, type Hook, type Level } from "./ads.ts";

// How many items one pasted reply carries. Each hook, meat or CTA brings its words plus an image and a video prompt
// (about 700-1100 characters of JSON), each platform text about 400: these keep a reply around 15 thousand
// characters, which claude.ai writes whole and the person can still check by eye.
export const PASTE_PER_PROMPT = { hook: 15, meat: 8, cta: 8, copy: 40 } as const;
export type PasteKind = keyof typeof PASTE_PER_PROMPT;

// A count split into prompts of at most `per` items, as even as possible (50 by 15 → 13, 13, 12, 12).
export function splitCount(count: number, per: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const parts = Math.ceil(n / Math.max(1, Math.floor(per)));
  const base = Math.floor(n / parts);
  const extra = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

export const promptCount = (kind: PasteKind, count: number) => splitCount(count, PASTE_PER_PROMPT[kind]).length;

// One prompt of a split request: how many items it asks for and, for hooks, how many of each level.
export type PromptPart = { part: number; parts: number; count: number; perLevel: { level: Level; count: number }[] };

// The levels spread over the whole count first (as one big request would), then cut into prompts in level order,
// so each prompt covers one or two levels whole and the angle grid stays even inside each level.
export function hookParts(count: number, levels: Level[], per: number = PASTE_PER_PROMPT.hook): PromptPart[] {
  const lv = levels.length ? levels : ([1, 2, 3, 4, 5] as Level[]);
  const n = Math.max(0, Math.floor(count));
  // Even over the levels; with fewer hooks than levels, the first levels get one each.
  const slots: Level[] = [];
  lv.forEach((level, i) => {
    const mine = Math.floor(n / lv.length) + (i < n % lv.length ? 1 : 0);
    for (let k = 0; k < mine; k++) slots.push(level);
  });
  const sizes = splitCount(slots.length, per);
  const out: PromptPart[] = [];
  let at = 0;
  sizes.forEach((size, i) => {
    const chunk = slots.slice(at, at + size);
    at += size;
    const perLevel: { level: Level; count: number }[] = [];
    for (const level of chunk) {
      const last = perLevel[perLevel.length - 1];
      if (last && last.level === level) last.count++;
      else perLevel.push({ level, count: 1 });
    }
    out.push({ part: i + 1, parts: sizes.length, count: size, perLevel });
  });
  return out;
}

// Meats and CTAs: only the count is split (their levels are a context, not a quota).
export function countParts(kind: PasteKind, count: number): PromptPart[] {
  const sizes = splitCount(count, PASTE_PER_PROMPT[kind]);
  return sizes.map((size, i) => ({ part: i + 1, parts: sizes.length, count: size, perLevel: [] }));
}

// The one asked for (1-based); a part past the end is the last one.
export function partOf(parts: PromptPart[], part: number): PromptPart {
  if (!parts.length) throw new Error("No hay nada para pedir.");
  return parts[Math.min(parts.length, Math.max(1, Math.floor(part))) - 1];
}

// ── Platform texts (primary, headline, button) ─────────────────────────────────────
export type CopyPair = { key: string; hook: string; cta: string; level: Level };

// One pair per hook + CTA of the run, in the run's order (the same pair in several ads is written once).
export function copyPairs(ads: Pick<AdCombo, "hookId" | "ctaId">[], hooks: Hook[], ctas: Cta[]): CopyPair[] {
  const H = new Map(hooks.map((h) => [h.id, h]));
  const C = new Map(ctas.map((c) => [c.id, c]));
  const pairs = new Map<string, CopyPair>();
  for (const a of ads) {
    const key = copyKey(a.hookId, a.ctaId);
    const h = H.get(a.hookId);
    const c = C.get(a.ctaId);
    if (h && c && !pairs.has(key)) pairs.set(key, { key, hook: h.text, cta: c.text, level: h.level });
  }
  return [...pairs.values()];
}

// The pairs cut into prompts (or into writer calls of `per`).
export function copyChunks(pairs: CopyPair[], per: number = PASTE_PER_PROMPT.copy): CopyPair[][] {
  const sizes = splitCount(pairs.length, per);
  const out: CopyPair[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(pairs.slice(at, at + size));
    at += size;
  }
  return out;
}

// The written texts of the pairs asked for, cut to the batch's limits; keys nobody asked for are dropped.
export function copiesFromWire(wire: CopiesWire, keys: Iterable<string>): Record<string, AdCopy> {
  const wanted = new Set(keys);
  const out: Record<string, AdCopy> = {};
  for (const w of wire.copies) {
    if (wanted.has(w.key)) out[w.key] = { primary: w.primary.slice(0, 600), headline: w.headline.slice(0, 80), button: w.button.slice(0, 40) };
  }
  return out;
}

// What the studio says about a split request.
export function partsText(parts: number, what: string): string {
  if (parts <= 1) return `Un solo prompt para ${what}.`;
  return `Son ${parts} prompts para ${what} (una sola respuesta sería demasiado larga). Copiá el 1, pegá su respuesta, y recién ahí copiá el 2: así el siguiente ya sabe lo que entró y no lo repite.`;
}
