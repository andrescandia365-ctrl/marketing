// Publicidad (Método 50-5-3): paid ads built from pieces. An ad = Hook + Meat + CTA. Pieces are written and
// rendered separately; the combination hook × meat × CTA is pure code (this file), so no AI credits go into
// assembling the ads. Shared by the server (validation, storage) and the browser (UI, render).
import { z } from "zod";
import { ALIGNS, CORNERS, PLACEMENTS, STILL_FORMATS } from "./stillLayout.ts";

// ── Awareness levels ──────────────────────────────────────────────────────────────
export const LEVELS = [1, 2, 3, 4, 5] as const;
export type Level = (typeof LEVELS)[number];

export const MEAT_FORMATS = ["demo", "testimonial", "education", "story", "faceless"] as const;
export type MeatFormat = (typeof MEAT_FORMATS)[number];
export const MEAT_FORMAT_LABEL: Record<MeatFormat, string> = {
  demo: "Demostración",
  testimonial: "Testimonio",
  education: "Educación",
  story: "Historia",
  faceless: "Sin cara",
};

// Levels 1–3 go to cold audiences; 4–5 to people who already know the brand (retargeting).
export const LEVEL_INFO: Record<
  Level,
  { label: string; short: string; desc: string; audience: "cold" | "warm"; meats: MeatFormat[]; cta: string }
> = {
  1: {
    label: "Inconsciente",
    short: "N1",
    desc: "No sabe que tiene un problema o necesidad.",
    audience: "cold",
    meats: ["education", "story"],
    cta: "Un paso chico y gratis: seguir, ver más, comentar.",
  },
  2: {
    label: "Consciente del problema",
    short: "N2",
    desc: "Sabe que lo tiene, pero no conoce la solución.",
    audience: "cold",
    meats: ["education", "demo"],
    cta: "Conocer la solución: ver cómo funciona, descargar una guía.",
  },
  3: {
    label: "Consciente de la solución",
    short: "N3",
    desc: "Sabe que existe una solución, pero no conoce nuestra oferta.",
    audience: "cold",
    meats: ["demo", "faceless"],
    cta: "Probar la nuestra: prueba, demo, ver el producto.",
  },
  4: {
    label: "Consciente del producto",
    short: "N4",
    desc: "Conoce la oferta, pero todavía duda.",
    audience: "warm",
    meats: ["testimonial", "demo"],
    cta: "Sacar la duda: prueba o garantía, hablar con alguien, ver casos.",
  },
  5: {
    label: "Totalmente consciente",
    short: "N5",
    desc: "Conoce la oferta y solo necesita un empujón (descuento, fecha límite).",
    audience: "warm",
    meats: ["testimonial", "demo"],
    cta: "Comprar o anotarse ahora, con una oferta real y su fecha.",
  },
};
export const AUDIENCE_LABEL = { cold: "Fría", warm: "Retargeting" } as const;

export const ANGLES = ["pain", "desire", "objection", "myth", "curiosity", "proof"] as const;
export type Angle = (typeof ANGLES)[number];
export const ANGLE_LABEL: Record<Angle, string> = {
  pain: "Dolor",
  desire: "Deseo",
  objection: "Objeción",
  myth: "Mito",
  curiosity: "Curiosidad",
  proof: "Prueba",
};

export const FORMULAS = ["question", "stop", "number", "beforeAfter"] as const;
export type Formula = (typeof FORMULAS)[number];
export const FORMULA_LABEL: Record<Formula, string> = {
  question: "Pregunta",
  stop: "Dejá de hacer X",
  number: "Número",
  beforeAfter: "Antes y después",
};

// ── Time budget ───────────────────────────────────────────────────────────────────
// An ad lasts any whole number of seconds from 6 to 120. The presets are the usual lengths; the person can type any
// other whole number in that range. The app splits the time between the three pieces and tells the writer how many
// words fit, so scripts come out the right length on the first try. A meat longer than 15 s is several Grok clips
// (shared/adsSequence.ts): Grok's own clips stay 6, 10 or 15 s.
export const AD_MIN_SECONDS = 6;
export const AD_MAX_SECONDS = 120;
export const AD_PRESETS = [6, 10, 15, 30, 45, 60, 90] as const;
/** Lengths shown as buttons. Any whole second from AD_MIN_SECONDS to AD_MAX_SECONDS is also an ad. */
export const AD_SECONDS = AD_PRESETS;
export type AdSeconds = number;
export type Budget = { hook: number; meat: number; cta: number };
export const WORDS_PER_SECOND = 2.7;
/** Spoken words that fit in `seconds`. A 0 s share still returns 2: the screen must not ask the writer for it. */
export const wordsFor = (seconds: number) => Math.max(2, Math.round(seconds * WORDS_PER_SECOND));
export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
// One Grok clip is 6, 10 or 15 s. A piece of 15 s or less uses the shortest that covers it (the render cuts it).
export const clipSecondsFor = (seconds: number): 6 | 10 | 15 => (seconds <= 6 ? 6 : seconds <= 10 ? 10 : 15);
export const isAdSeconds = (n: number): n is AdSeconds => Number.isInteger(n) && n >= AD_MIN_SECONDS && n <= AD_MAX_SECONDS;
/** A 110 s meat is about 300 words. Old pieces were under 600 characters and still fit. */
export const PIECE_TEXT_MAX = 4000;

// The hook stays short (3 s, or 4 s from 30 s up). The CTA is 3 s up to 15 s, 4 s up to 45 s and 6 s above.
// The meat takes the rest. A 6 s ad is the exception: 2 + 2 + 2, so every ad has a meat. Whole seconds.
export function defaultSplit(seconds: number): Budget {
  const total = Math.round(seconds);
  if (total === 6) return { hook: 2, meat: 2, cta: 2 };
  const hook = total >= 30 ? 4 : 3;
  const cta = total <= 15 ? 3 : total <= 45 ? 4 : 6;
  return { hook, meat: total - hook - cta, cta };
}

const SPLIT_NAME = { hook: "el gancho", meat: "el cuerpo", cta: "el llamado" } as const;

// The parts are whole seconds, each from 0 to 120, and they add up to the ad. The message names the field.
export function splitIssue(seconds: number, split: Budget): string | null {
  for (const key of ["hook", "meat", "cta"] as const) {
    const n = split[key];
    if (!Number.isInteger(n) || n < 0 || n > AD_MAX_SECONDS) {
      return `El reparto de ${SPLIT_NAME[key]} tiene que ser un número entero de 0 a ${AD_MAX_SECONDS} segundos.`;
    }
  }
  const total = Math.round(seconds);
  const sum = split.hook + split.meat + split.cta;
  if (sum !== total) {
    return `El gancho, el cuerpo y el llamado suman ${sum} s y el anuncio dura ${total} s. Tienen que sumar lo mismo.`;
  }
  return null;
}

// The stored split when it still matches this length; otherwise the default. An unknown length is a 15 s ad.
export function splitOf(seconds: number, split?: Budget | null): Budget {
  const base = isAdSeconds(seconds) ? seconds : 15;
  if (isAdSeconds(seconds) && split && splitIssue(seconds, split) === null) return split;
  return defaultSplit(base);
}

export function pieceShare(adSeconds: number, kind: "hook" | "meat" | "cta", split?: Budget | null): number {
  return splitOf(adSeconds, split)[kind];
}

// A 0 s share is not a piece: the writer is not asked for it.
export function noShareNote(kind: "hook" | "meat" | "cta", seconds: number, split?: Budget | null): string | null {
  if (pieceShare(seconds, kind, split) >= 1) return null;
  return `Este reparto no deja segundos para ${SPLIT_NAME[kind]}. Cambiá el reparto del anuncio antes de pedirlo.`;
}

export function meatGapNote(split: Budget): string | null {
  if (split.meat > 0) return null;
  return "Este anuncio no tiene cuerpo: el gancho y el llamado se llevan todo el tiempo. Alargalo o cambiá el reparto si querés un cuerpo.";
}

// Preset buttons, plus the current length when it is not one of them (22 s stays visible).
export function adLengthChoices(current: number): number[] {
  const set = new Set<number>(AD_PRESETS);
  if (isAdSeconds(current)) set.add(current);
  return [...set].sort((a, b) => a - b);
}

// The length Publicidad saved in this browser (`playbook-studio.ads.v1`). ExplainerToAds reads it without loading
// the ads studio. An unreadable value is a 15 s ad with the app's split.
export const ADS_SETTINGS_KEY = "playbook-studio.ads.v1";
export type SavedLength = { seconds: number; split: Budget | null };

export function parseSavedLength(raw: string | null): SavedLength {
  const base: SavedLength = { seconds: 15, split: null };
  if (!raw) return base;
  try {
    const saved = JSON.parse(raw) as { seconds?: unknown; split?: unknown } | null;
    const seconds = Number(saved?.seconds);
    if (!isAdSeconds(seconds)) return base;
    const split = saved?.split;
    if (split && typeof split === "object" && splitIssue(seconds, split as Budget) === null) return { seconds, split: split as Budget };
    return { seconds, split: null };
  } catch {
    return base;
  }
}

// The saved split only when it was stored for this exact length and still adds up. Any other length uses the default.
export function splitForLength(adSeconds: number, saved: SavedLength | null): Budget | null {
  if (!saved || saved.seconds !== adSeconds || !saved.split) return null;
  return splitIssue(adSeconds, saved.split) === null ? saved.split : null;
}

// Lengths to offer for a new piece of this kind: never one whose share is under a second.
export function lengthsForKind(kind: "hook" | "meat" | "cta", current: number, saved: SavedLength | null): number[] {
  return adLengthChoices(current).filter((n) => pieceShare(n, kind, splitForLength(n, saved)) >= 1);
}

export type LengthSuggestion = { seconds: number; range: string; note: string };

// Cold (levels 1–3) suggests 30–60 s, with 45 as the button. Retargeting (4–5) suggests 15 s. Mixed: no suggestion.
// A suggestion only: the field stays editable.
export function suggestedSeconds(levels: number[]): LengthSuggestion | null {
  if (!levels.length) return null;
  const cold = levels.some((n) => n >= 1 && n <= 3);
  const warm = levels.some((n) => n >= 4 && n <= 5);
  if (cold && warm) return null;
  if (cold) {
    return {
      seconds: 45,
      range: "30 a 60 s",
      note: "Audiencia fría (niveles 1 a 3): un anuncio de 30 a 60 s suele alcanzar. Es una sugerencia.",
    };
  }
  if (warm) {
    return { seconds: 15, range: "15 s", note: "Retargeting (niveles 4 y 5): 15 s suele alcanzar. Es una sugerencia." };
  }
  return null;
}

// ── The offer profile (once per series) ───────────────────────────────────────────
export const OfferSchema = z.object({
  product: z.string().trim().max(400),
  audience: z.string().trim().max(1000),
  problem: z.string().trim().max(1000),
  promise: z.string().trim().max(600),
  objections: z.array(z.string().trim().min(1).max(300)).max(20),
  // Proof: testimonials, numbers. Only real ones; the writer may quote them.
  proofs: z.array(z.string().trim().min(1).max(400)).max(20),
  tone: z.enum(["dry", "warm", "absurdist"]),
  // What can never be said (claims, words, comparisons).
  forbidden: z.string().trim().max(1500),
  // What the landing page offers and how easy it is (price, trial, "gratis", "10 segundos").
  landing: z.string().trim().max(800),
  // The audience's own words: the most repeated comments and questions from the organic content.
  audienceLanguage: z.string().trim().max(4000),
  // Who speaks on camera (the same presenter or voice in every piece, so pieces cut together).
  presenter: z.string().trim().max(200),
  // The generated voice of the presenter (OpenAI speech voice name); empty: the app's default voice.
  ttsVoice: z.string().trim().max(40).default(""),
});
export type Offer = z.infer<typeof OfferSchema>;
export const EMPTY_OFFER: Offer = {
  product: "",
  audience: "",
  problem: "",
  promise: "",
  objections: [],
  proofs: [],
  tone: "warm",
  forbidden: "",
  landing: "",
  audienceLanguage: "",
  presenter: "",
  ttsVoice: "",
};
export const offerFilled = (o: Offer) => Boolean(o.product.trim() && o.audience.trim() && o.problem.trim() && o.promise.trim());

// What the writer reads about the offer (Publicidad and Playbook share it).
export function offerBlock(offer: Offer): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `  - ${x}`).join("\n") : "  (none given)");
  return `The offer profile (written by the person, in Spanish). Everything you write reads it; the proofs are the only testimonials and numbers you may quote.
- Product: ${offer.product || "(not given)"}
- Audience: ${offer.audience || "(not given)"}
- Problem it solves: ${offer.problem || "(not given)"}
- Promise: ${offer.promise || "(not given)"}
- Objections:\n${list(offer.objections)}
- Proofs (real testimonials, numbers):\n${list(offer.proofs)}
- Tone: ${offer.tone}
- Never say: ${offer.forbidden || "(nothing listed)"}
- The landing page offers (price, trial, how fast): ${offer.landing || "(not given)"}
- The audience's own words (comments and questions from the organic content): ${offer.audienceLanguage || "(none given)"}
- Presenter (the same in every piece): ${offer.presenter || "an invented adult presenter, the same in every piece"}`;
}

// ── Pieces ────────────────────────────────────────────────────────────────────────
export const PIECE_KINDS = ["hook", "meat", "cta"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export const PIECE_LABEL: Record<PieceKind, string> = { hook: "Hook", meat: "Meat", cta: "CTA" };
export const PIECE_PREFIX: Record<PieceKind, string> = { hook: "H", meat: "M", cta: "C" };

export const PIECE_STATUS = ["pending", "approved", "rejected"] as const;
export type PieceStatus = (typeof PIECE_STATUS)[number];
export const PIECE_SOURCES = ["ai", "organic", "clip", "manual"] as const;
export type PieceSource = (typeof PIECE_SOURCES)[number];

const levelField = z.number().int().min(1).max(5);
const levelsField = z.array(levelField).min(1).max(5);

// Whose voice the piece plays: the clip's own (Grok says the line) or the piece's voice file (generated or uploaded)
// with the clip muted, for when the lips do not match. "Que lo diga un personaje" (shared/adsSpeaker.ts).
export const SPEAKER_SOUNDS = ["clip", "voice"] as const;
export type SpeakerSound = (typeof SPEAKER_SOUNDS)[number];
export const SPEAKER_SOUND_LABEL: Record<SpeakerSound, string> = {
  clip: "La voz del clip (la dice Grok)",
  voice: "Clip mudo y la voz de la pieza (generada o subida)",
};

export const PieceSpeakerSchema = z.object({
  castId: z.string().regex(/^[a-z0-9-]{1,40}$/, "Id de personaje no válido."),
  // How the line is said, in the person's words (Spanish, like a story line's emotion).
  emotion: z.string().trim().max(120).default(""),
  // The one thing the character does while saying it (English, the prompt's language).
  action: z.string().trim().max(200).default(""),
  // Where it is said (English). Empty: the series type's default place.
  place: z.string().trim().max(300).default(""),
  // The name of a voice in Grok's Audio panel (optional).
  voice: z.string().trim().max(60).default(""),
  sound: z.enum(SPEAKER_SOUNDS).default("clip"),
  // Where the piece starts playing the uploaded clip (the character often takes a moment before the first word).
  from: z.number().min(0).max(14).default(0),
});
export type PieceSpeaker = z.infer<typeof PieceSpeakerSchema>;

const PieceBase = z.object({
  id: z.string().regex(/^[HMC]\d{1,4}$/),
  text: z.string().max(PIECE_TEXT_MAX),
  onScreenText: z.string().max(80),
  visualPrompt: z.string().max(3000),
  videoPrompt: z.string().max(3000),
  // Seconds in the finished ad (its share of the budget). Not an integer: pieces saved at 2.5 s or 1.5 s still load.
  // New pieces are whole seconds, up to the whole ad.
  seconds: z.number().min(1).max(AD_MAX_SECONDS),
  status: z.enum(PIECE_STATUS),
  source: z.enum(PIECE_SOURCES),
  createdAt: z.string(),
  note: z.string().max(600).default(""),
  // "Que lo diga un personaje" (shared/adsSpeaker.ts): the cast character who says the line on camera. Missing: none.
  speaker: PieceSpeakerSchema.optional(),
});

export const HookSchema = PieceBase.extend({
  kind: z.literal("hook"),
  level: levelField,
  angle: z.enum(ANGLES),
  formula: z.enum(FORMULAS),
});
export type Hook = Omit<z.infer<typeof HookSchema>, "level"> & { level: Level };

export const MeatSchema = PieceBase.extend({
  kind: z.literal("meat"),
  format: z.enum(MEAT_FORMATS),
  // The levels this meat serves (a neutral opening lets it follow any hook of those levels).
  levels: levelsField,
  // The hook it was written against, for context; empty if written neutral.
  hookId: z.string().max(10).default(""),
});
export type Meat = Omit<z.infer<typeof MeatSchema>, "levels"> & { levels: Level[] };

export const CtaSchema = PieceBase.extend({
  kind: z.literal("cta"),
  levels: levelsField,
  // The four things every CTA says.
  what: z.string().max(200),
  why: z.string().max(300),
  when: z.string().max(200),
  easy: z.string().max(200),
});
export type Cta = Omit<z.infer<typeof CtaSchema>, "levels"> & { levels: Level[] };
export type Piece = Hook | Meat | Cta;

// ── Uploaded clips (previous ads), catalogued by the AI ──────────────────────────
export const ClipRecordSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  // The saved file in publicidad/<series>/clips/, or empty when only the transcript was pasted.
  file: z.string().max(200),
  transcript: z.string().max(20000),
  hook: z.string().max(1000),
  meat: z.string().max(4000),
  cta: z.string().max(1000),
  hookEndsAt: z.number().min(0).max(600),
  level: levelField,
  format: z.enum(MEAT_FORMATS),
  angle: z.enum(ANGLES),
  formula: z.enum(FORMULAS),
  note: z.string().max(1000),
  createdAt: z.string(),
});
export type ClipRecord = Omit<z.infer<typeof ClipRecordSchema>, "level"> & { level: Level };

// ── Metrics (a CSV exported from the ads platform) ────────────────────────────────
export const MetricRowSchema = z.object({
  name: z.string().max(300),
  // H12-M3-C2 when the name carries the app's id; empty for ads made elsewhere.
  adId: z.string().max(20),
  impressions: z.number().min(0),
  views3s: z.number().min(0),
  views: z.number().min(0),
  avgWatch: z.number().min(0),
  clicks: z.number().min(0),
  conversions: z.number().min(0),
  spend: z.number().min(0),
});
export type MetricRow = z.infer<typeof MetricRowSchema>;

// ── Batches ("tandas") ─────────────────────────────────────────────────────────────
export const AdComboSchema = z.object({
  id: z.string().max(20),
  hookId: z.string(),
  meatId: z.string(),
  ctaId: z.string(),
  level: levelField,
});
export type AdCombo = Omit<z.infer<typeof AdComboSchema>, "level"> & { level: Level };

export const AdCopySchema = z.object({
  primary: z.string().max(600),
  headline: z.string().max(80),
  button: z.string().max(40),
});
export type AdCopy = z.infer<typeof AdCopySchema>;

export const CombineRulesSchema = z.object({
  // Only meats and CTAs that serve the hook's level go with it. Off: every approved piece with every other.
  sameLevel: z.boolean(),
});
export type CombineRules = z.infer<typeof CombineRulesSchema>;

export const SplitSchema = z.object({
  hook: z.number().int().min(0).max(AD_MAX_SECONDS),
  meat: z.number().int().min(0).max(AD_MAX_SECONDS),
  cta: z.number().int().min(0).max(AD_MAX_SECONDS),
});

export const BatchSchema = z.object({
  id: z.string().max(60),
  createdAt: z.string(),
  // Whole seconds, 6 to 120. Older batches are 6, 10 or 15 and still load. No split: the default for that length.
  seconds: z.number().int().min(AD_MIN_SECONDS).max(AD_MAX_SECONDS),
  split: SplitSchema.optional(),
  mode: z.enum(["full", "stage"]),
  rules: CombineRulesSchema,
  ads: z.array(AdComboSchema),
  // Keyed by "hookId-ctaId": the platform texts depend on the hook and the CTA only.
  copies: z.record(z.string(), AdCopySchema),
  // adId → rendered file in publicidad/<series>/anuncios/<batch>/.
  files: z.record(z.string(), z.string()),
});
export type Batch = Omit<z.infer<typeof BatchSchema>, "ads"> & { ads: AdCombo[] };

export const AdsMediaSchema = z.object({
  image: z.string().optional(),
  clip: z
    .object({
      file: z.string(),
      name: z.string(),
      duration: z.number(),
      // Where the piece starts playing the clip (seconds into it; 0 or missing: its start).
      from: z.number().min(0).max(3600).optional(),
      // The clip is a finished explainer of the same series (shared/adsFromExplainer.ts): it brings its own words,
      // subtitles and notice, so the render draws nothing on top of it.
      explainer: z.object({ project: z.string().max(80), file: z.string().max(80), title: z.string().max(200) }).optional(),
    })
    .optional(),
  // A meat longer than 15 s: one Grok file per slot (shared/adsSequence.ts). Null keeps the index when a slot is empty.
  // Older pieces have no list and keep playing `clip`.
  clips: z
    .array(
      z
        .object({
          file: z.string(),
          name: z.string(),
          duration: z.number(),
          // Each file is a Grok clip of at most 15 s, so the in point stays inside one file.
          from: z.number().min(0).max(14).optional(),
        })
        .nullable(),
    )
    .max(24)
    .optional(),
  voice: z.object({ file: z.string(), name: z.string(), duration: z.number() }).optional(),
});
export type AdsMedia = z.infer<typeof AdsMediaSchema>;

// "Versión estática" of a hook (shared/adsStatic.ts): the picture made in Grok with no text, the words the app sets on
// it ("Variantes de texto": headlines × calls × placements) and the files exported to publicidad/<series>/estaticos/.
export const HookStaticSchema = z.object({
  picture: z.object({ file: z.string().max(200), w: z.number().int().min(1).max(20000), h: z.number().int().min(1).max(20000) }).nullable().default(null),
  // "título | bajada" per line; empty: the hook's onScreenText.
  headlines: z.string().max(4000).default(""),
  // One call per line; empty: no call on the picture.
  ctas: z.string().max(2000).default(""),
  // The approved CTA whose words go on the picture (its platform texts go to the CSV row); empty: none.
  ctaId: z.string().max(10).default(""),
  placements: z.array(z.enum(PLACEMENTS)).max(3).default(["top"]),
  align: z.enum(ALIGNS).default("left"),
  formats: z.array(z.enum(STILL_FORMATS)).max(3).default([...STILL_FORMATS]),
  fit: z.enum(["full", "crop"]).default("full"),
  // Where the tool's watermark is on this picture; null: the tool profile's default.
  keepOut: z.object({ corner: z.enum([...CORNERS, "none"]), w: z.number().min(0).max(0.6), h: z.number().min(0).max(0.6) }).nullable().default(null),
  // The last export's file names (in estaticos/).
  exports: z.array(z.string().max(80)).max(500).default([]),
  // Non-blocking checks the person marked "no es un problema".
  dismissed: z.array(z.string().max(300)).max(50).default([]),
});
export type HookStatic = z.infer<typeof HookStaticSchema>;

export const AdsStateSchema = z.object({
  version: z.literal(1),
  series: z.string(),
  offer: OfferSchema,
  clips: z.array(ClipRecordSchema),
  hooks: z.array(HookSchema),
  meats: z.array(MeatSchema),
  ctas: z.array(CtaSchema),
  metrics: z.array(MetricRowSchema),
  metricsImportedAt: z.string(),
  batches: z.array(BatchSchema),
  weeklyLimit: z.number().int().min(1).max(5000),
  counters: z.object({ hook: z.number().int(), meat: z.number().int(), cta: z.number().int() }),
  // Per piece: its uploaded clip or image (saved in publicidad/<series>/media/).
  media: z.record(z.string(), AdsMediaSchema),
  // Per piece: its rendered file in publicidad/<series>/piezas/ (the cache the ads are cut from).
  renders: z.record(z.string(), z.string()),
  // Per hook: its static version (older files have none).
  statics: z.record(z.string(), HookStaticSchema).default({}),
});
export type AdsState = Omit<z.infer<typeof AdsStateSchema>, "hooks" | "meats" | "ctas" | "clips" | "batches"> & {
  hooks: Hook[];
  meats: Meat[];
  ctas: Cta[];
  clips: ClipRecord[];
  batches: Batch[];
};

export function emptyAds(series: string): AdsState {
  return {
    version: 1,
    series,
    offer: EMPTY_OFFER,
    clips: [],
    hooks: [],
    meats: [],
    ctas: [],
    metrics: [],
    metricsImportedAt: "",
    batches: [],
    weeklyLimit: 700,
    counters: { hook: 0, meat: 0, cta: 0 },
    media: {},
    renders: {},
    statics: {},
  };
}

// ── What the writer returns (plain strings; normalized here) ───────────────────────
const PromptFields = {
  onScreenText: z.string().describe("Headline at the top of the frame, up to 6 words, makes sense without the voice. Spanish. May be empty."),
  visualPrompt: z
    .string()
    .describe("Complete standalone image prompt in the tool's format: ONE frozen moment, the presenter and the setting, no text or logos. English."),
  videoPrompt: z.string().describe("The one action that animates that still, in the tool's format. No speech, no music. English."),
};

export const HooksWireSchema = z.object({
  hooks: z.array(
    z.object({
      text: z.string().describe("The spoken hook, exactly the words said, within the word budget. Spanish (Rioplatense)."),
      level: z.number().describe("Awareness level 1–5 this hook speaks to."),
      angle: z.string().describe("One of: pain, desire, objection, myth, curiosity, proof."),
      formula: z.string().describe("One of: question, stop, number, beforeAfter."),
      ...PromptFields,
    }),
  ),
  note: z.string().describe("In Spanish: anything to check ([VERIFY] claims, gaps in the offer). Empty if nothing."),
});
export type HooksWire = z.infer<typeof HooksWireSchema>;

export const MeatsWireSchema = z.object({
  meats: z.array(
    z.object({
      text: z.string().describe("The spoken meat, within the word budget, opening neutral so it follows any hook of its levels. Spanish."),
      format: z.string().describe("One of: demo, testimonial, education, story, faceless."),
      levels: z.array(z.number()).describe("The awareness levels (1–5) this meat serves."),
      ...PromptFields,
    }),
  ),
  note: z.string().describe("In Spanish: claims to verify, proofs that are missing. Empty if nothing."),
});
export type MeatsWire = z.infer<typeof MeatsWireSchema>;

export const CtasWireSchema = z.object({
  ctas: z.array(
    z.object({
      text: z.string().describe("The spoken CTA, within the word budget, saying the four things in one breath. Spanish."),
      levels: z.array(z.number()).describe("The awareness levels (1–5) this CTA serves."),
      what: z.string().describe("The exact action: subscribe, click, download, comment, buy. Spanish."),
      why: z.string().describe("The benefit they get (benefit over feature). Spanish."),
      when: z.string().describe("The urgency: now, today, before it ends. Only a real deadline. Spanish."),
      easy: z.string().describe("How little it costs: gratis, 10 segundos, un clic. From the landing page facts. Spanish."),
      ...PromptFields,
    }),
  ),
  note: z.string().describe("In Spanish: an offer or deadline that must be confirmed. Empty if nothing."),
});
export type CtasWire = z.infer<typeof CtasWireSchema>;

export const ClipAnalysisWireSchema = z.object({
  hook: z.string().describe("The hook: the first 3–5 seconds, quoted from the transcript. Spanish as heard."),
  meat: z.string().describe("The meat: what the clip teaches or shows between hook and CTA, quoted or summarized."),
  cta: z.string().describe("The CTA, quoted. Empty if the clip has none."),
  hookEndsAt: z.number().describe("Seconds where the hook ends, from the timestamps."),
  level: z.number().describe("Awareness level 1–5 the hook speaks to."),
  format: z.string().describe("The meat's format: demo, testimonial, education, story, faceless."),
  angle: z.string().describe("The hook's angle: pain, desire, objection, myth, curiosity, proof."),
  formula: z.string().describe("The hook's formula: question, stop, number, beforeAfter."),
  note: z.string().describe("In Spanish: why it works or fails, in one or two lines."),
});
export type ClipAnalysisWire = z.infer<typeof ClipAnalysisWireSchema>;

export const REVIEW_KINDS = ["policy", "duplicate", "mismatch", "claim", "length"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  policy: "La plataforma suele rechazarlo",
  duplicate: "Casi igual a otro",
  mismatch: "No encaja con su hook",
  claim: "Promesa sin verificar",
  length: "Largo",
};
export const ReviewWireSchema = z.object({
  flags: z.array(
    z.object({
      pieceId: z.string().describe("The piece's id (H12, M3, C2)."),
      kind: z.string().describe("One of: policy (health, money, before/after body claims platforms reject), duplicate, mismatch, claim."),
      note: z.string().describe("The problem, in Spanish, specific enough to fix."),
      fix: z.string().describe("A rewrite that fixes it, or empty."),
    }),
  ),
  note: z.string().describe("In Spanish: overall verdict in one line."),
});
export type ReviewWire = z.infer<typeof ReviewWireSchema>;
export type ReviewFlag = { pieceId: string; kind: ReviewKind; note: string; fix: string };

export const BUTTONS = ["Más información", "Comprar", "Registrarte", "Descargar", "Suscribirte", "Reservar", "Enviar mensaje", "Ver más"] as const;
export const CopiesWireSchema = z.object({
  copies: z.array(
    z.object({
      key: z.string().describe("The pair key given: hookId-ctaId."),
      primary: z.string().describe("Primary text for the ad, 1–3 sentences from the hook and the CTA, postable as is. Spanish."),
      headline: z.string().describe("Headline, up to 40 characters. Spanish."),
      button: z.string().describe(`The call-to-action button, one of: ${BUTTONS.join(", ")}.`),
    }),
  ),
});
export type CopiesWire = z.infer<typeof CopiesWireSchema>;

// ── Normalizers ─────────────────────────────────────────────────────────────────
function pick<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const v = value.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? fallback;
}
export const toLevel = (n: number, fallback: Level = 2): Level => (Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Level) : fallback);
export function toLevels(ns: number[], fallback: Level[]): Level[] {
  const out = [...new Set(ns.map((n) => toLevel(n, 0 as unknown as Level)).filter((n) => (n as number) >= 1))].sort() as Level[];
  return out.length ? out : fallback;
}
const clean = (s: string, max: number) => s.trim().slice(0, max);

export function nextId(state: AdsState, kind: PieceKind): string {
  const n = state.counters[kind] + 1;
  state.counters[kind] = n;
  return `${PIECE_PREFIX[kind]}${n}`;
}

export function hooksFromWire(state: AdsState, wire: HooksWire, seconds: number, source: PieceSource, status: PieceStatus = "pending"): Hook[] {
  const now = new Date().toISOString();
  return wire.hooks
    .filter((h) => h.text.trim())
    .map((h) => ({
      id: nextId(state, "hook"),
      kind: "hook" as const,
      text: clean(h.text, PIECE_TEXT_MAX),
      onScreenText: clean(h.onScreenText, 80),
      visualPrompt: clean(h.visualPrompt, 3000),
      videoPrompt: clean(h.videoPrompt, 3000),
      seconds,
      status,
      source,
      createdAt: now,
      note: "",
      level: toLevel(h.level),
      angle: pick(h.angle, ANGLES, "pain"),
      formula: pick(h.formula, FORMULAS, "question"),
    }));
}

export function meatsFromWire(state: AdsState, wire: MeatsWire, seconds: number, hookId: string, fallbackLevels: Level[]): Meat[] {
  const now = new Date().toISOString();
  return wire.meats
    .filter((m) => m.text.trim())
    .map((m) => ({
      id: nextId(state, "meat"),
      kind: "meat" as const,
      text: clean(m.text, PIECE_TEXT_MAX),
      onScreenText: clean(m.onScreenText, 80),
      visualPrompt: clean(m.visualPrompt, 3000),
      videoPrompt: clean(m.videoPrompt, 3000),
      seconds,
      status: "pending" as const,
      source: "ai" as const,
      createdAt: now,
      note: "",
      format: pick(m.format, MEAT_FORMATS, "education"),
      levels: toLevels(m.levels, fallbackLevels),
      hookId,
    }));
}

export function ctasFromWire(state: AdsState, wire: CtasWire, seconds: number, fallbackLevels: Level[]): Cta[] {
  const now = new Date().toISOString();
  return wire.ctas
    .filter((c) => c.text.trim())
    .map((c) => ({
      id: nextId(state, "cta"),
      kind: "cta" as const,
      text: clean(c.text, PIECE_TEXT_MAX),
      onScreenText: clean(c.onScreenText, 80),
      visualPrompt: clean(c.visualPrompt, 3000),
      videoPrompt: clean(c.videoPrompt, 3000),
      seconds,
      status: "pending" as const,
      source: "ai" as const,
      createdAt: now,
      note: "",
      levels: toLevels(c.levels, fallbackLevels),
      what: clean(c.what, 200),
      why: clean(c.why, 300),
      when: clean(c.when, 200),
      easy: clean(c.easy, 200),
    }));
}

export function clipFromWire(wire: ClipAnalysisWire, base: Pick<ClipRecord, "id" | "name" | "file" | "transcript">): ClipRecord {
  return {
    ...base,
    hook: clean(wire.hook, 1000),
    meat: clean(wire.meat, 4000),
    cta: clean(wire.cta, 1000),
    hookEndsAt: Number.isFinite(wire.hookEndsAt) ? Math.max(0, Math.min(600, wire.hookEndsAt)) : 0,
    level: toLevel(wire.level),
    format: pick(wire.format, MEAT_FORMATS, "education"),
    angle: pick(wire.angle, ANGLES, "pain"),
    formula: pick(wire.formula, FORMULAS, "question"),
    note: clean(wire.note, 1000),
    createdAt: new Date().toISOString(),
  };
}

export function flagsFromWire(wire: ReviewWire, ids: Set<string>): ReviewFlag[] {
  return wire.flags
    .filter((f) => ids.has(f.pieceId.trim()))
    .map((f) => ({ pieceId: f.pieceId.trim(), kind: pick(f.kind, REVIEW_KINDS, "claim"), note: clean(f.note, 600), fix: clean(f.fix, 600) }));
}

// ── Combining (pure code, no AI) ─────────────────────────────────────────────────
export const adId = (hookId: string, meatId: string, ctaId: string) => `${hookId}-${meatId}-${ctaId}`;
export const AD_ID = /\b(H\d{1,4})-(M\d{1,4})-(C\d{1,4})\b/i;
export function parseAdId(text: string): { hookId: string; meatId: string; ctaId: string } | null {
  const m = AD_ID.exec(text);
  return m ? { hookId: m[1].toUpperCase(), meatId: m[2].toUpperCase(), ctaId: m[3].toUpperCase() } : null;
}

const approved = <T extends Piece>(pieces: T[]) => pieces.filter((p) => p.status === "approved");
const serves = (piece: Meat | Cta, level: Level, rules: CombineRules) => !rules.sameLevel || piece.levels.includes(level);

// The batch's length. A piece joins only when its own seconds are that batch's share (a 60 s batch does not pick up
// a meat written for 9 s). A tenth of a second covers old pieces saved with a fraction.
export type CombineLength = { seconds: number; split?: Budget | null };
const SHARE_EPS = 0.05;
const fitsShare = (seconds: number, kind: "hook" | "meat" | "cta", length: CombineLength) =>
  Math.abs(seconds - pieceShare(length.seconds, kind, length.split)) <= SHARE_EPS;

// Every approved hook with every approved meat and CTA (that serve its level, when the rule is on) whose seconds
// match this batch.
export function combine(hooks: Hook[], meats: Meat[], ctas: Cta[], rules: CombineRules, length: CombineLength): AdCombo[] {
  const out: AdCombo[] = [];
  for (const h of approved(hooks)) {
    if (!fitsShare(h.seconds, "hook", length)) continue;
    for (const m of approved(meats)) {
      if (!fitsShare(m.seconds, "meat", length) || !serves(m, h.level, rules)) continue;
      for (const c of approved(ctas)) {
        if (!fitsShare(c.seconds, "cta", length) || !serves(c, h.level, rules)) continue;
        out.push({ id: adId(h.id, m.id, c.id), hookId: h.id, meatId: m.id, ctaId: c.id, level: h.level });
      }
    }
  }
  return out;
}

// "Variar hook": keep a winner's meat and CTA, change only the hook. The meat and the CTA themselves have to fit.
export function varyHook(meat: Meat, cta: Cta, hooks: Hook[], rules: CombineRules, length: CombineLength): AdCombo[] {
  if (!fitsShare(meat.seconds, "meat", length) || !fitsShare(cta.seconds, "cta", length)) return [];
  return approved(hooks)
    .filter((h) => fitsShare(h.seconds, "hook", length) && serves(meat, h.level, rules) && serves(cta, h.level, rules))
    .map((h) => ({ id: adId(h.id, meat.id, cta.id), hookId: h.id, meatId: meat.id, ctaId: cta.id, level: h.level }));
}

// A piece's cached render carries this version in its file name (`H3.l2.mp4`). l2 plays a long meat as one sequence of
// Grok clips. Older names are rendered again.
export const RENDER_VERSION = "l2";
export const currentRender = (file: string | undefined): file is string => Boolean(file?.includes(`.${RENDER_VERSION}.`));
export const renderedPieces = (renders: Record<string, string>) => new Set(Object.keys(renders).filter((id) => currentRender(renders[id])));

// What it takes: unique pieces to render (each once, cached) and the ads to cut from them.
// `pieceSeconds` is each piece's own length. A missing id counts as 0. The old call multiplied every piece by the
// whole ad.
export function estimate(ads: AdCombo[], rendered: Set<string>, pieceSeconds: Record<string, number>) {
  const pieces = new Set(ads.flatMap((a) => [a.hookId, a.meatId, a.ctaId]));
  const toRender = [...pieces].filter((id) => !rendered.has(id));
  const pieceTime = toRender.reduce((n, id) => n + (Number(pieceSeconds[id]) || 0), 0);
  // A piece renders at about twice real time in the browser; cutting an ad from cached pieces takes under a second.
  const renderSeconds = pieceTime * 0.8 + ads.length * 0.6;
  return { pieces: pieces.size, toRender: toRender.length, renderSeconds, ads: ads.length };
}

export function adsThisWeek(batches: Batch[], now = Date.now()): number {
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  return batches.filter((b) => Date.parse(b.createdAt) >= weekAgo).reduce((n, b) => n + b.ads.length, 0);
}

export const copyKey = (hookId: string, ctaId: string) => `${hookId}-${ctaId}`;

// ── Near-duplicate hooks (local, no AI) ───────────────────────────────────────────
const STOP = new Set(["de", "la", "el", "que", "y", "a", "en", "un", "una", "los", "las", "tu", "te", "se", "lo", "por", "con", "no", "es", "si", "al", "del", "para", "más", "mas", "o", "ya"]);
export function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
export function similarity(a: string, b: string): number {
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (!sa.size || !sb.size) return 0;
  let both = 0;
  for (const w of sa) if (sb.has(w)) both++;
  return both / (sa.size + sb.size - both);
}
export function nearDuplicates(hooks: Hook[], threshold = 0.6): [string, string][] {
  const pairs: [string, string][] = [];
  const live = hooks.filter((h) => h.status !== "rejected");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (similarity(live[i].text, live[j].text) >= threshold) pairs.push([live[i].id, live[j].id]);
    }
  }
  return pairs;
}

// Local checks before the AI review: words over budget and near duplicates.
export function localFlags(hooks: Hook[], meats: Meat[], ctas: Cta[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  for (const p of [...hooks, ...meats, ...ctas]) {
    if (p.status === "rejected") continue;
    const words = countWords(p.text);
    const budget = wordsFor(p.seconds);
    if (words > budget + 2) {
      flags.push({ pieceId: p.id, kind: "length", note: `${words} palabras; en ${p.seconds} s entran unas ${budget}.`, fix: "" });
    }
  }
  for (const [a, b] of nearDuplicates(hooks)) flags.push({ pieceId: b, kind: "duplicate", note: `Casi igual a ${a}.`, fix: "" });
  return flags;
}

// ── Metrics CSV ───────────────────────────────────────────────────────────────────
// Splits a CSV (comma or semicolon, quotes allowed) into rows of cells.
export function csvSeparator(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const sep = csvSeparator(text);
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.filter((r) => !(r.length === 1 && !r[0].trim()));
}

type MetricField = Exclude<keyof MetricRow, "adId">;
// Header names the platforms export (Meta in Spanish and English, plus plain names), by field.
const HEADERS: Record<MetricField, RegExp[]> = {
  name: [/^(ad name|nombre del anuncio|anuncio|ad|name|nombre|video|archivo)$/i],
  impressions: [/^(impressions|impresiones)$/i],
  views3s: [/3.?s|3 seg|three.?second|thruplay/i, /^(views3s|vistas3s|vistas_3s)$/i],
  views: [/^(video plays|reproducciones de video|views|visualizaciones|vistas|reproducciones)$/i],
  avgWatch: [/average (play|watch) time|tiempo promedio|avg.?watch|retenci[oó]n/i],
  clicks: [/^(link clicks|clics en el enlace|clicks|clics|clicks \(all\)|clics \(todos\))$/i],
  conversions: [/^(results|resultados|purchases|compras|conversions|conversiones|leads|registros|clientes potenciales)$/i],
  spend: [/^(amount spent.*|importe gastado.*|spend|gasto|inversi[oó]n)$/i],
};

// "1.234,56" (a Spanish export, usually with ";" between cells) vs "1,234.56" (an English one). A lone "2.000" is
// two thousand in a Spanish file and two in an English one, so the file's separator decides.
const num = (s: string, esLocale: boolean) => {
  const t = s.replace(/[^\d,.-]/g, "");
  const es = esLocale ? !/\.\d{1,2}$/.test(t) || /,\d{1,2}$/.test(t) : /,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t);
  const n = Number(es ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseMetricsCsv(text: string): { rows: MetricRow[]; found: MetricField[]; missing: MetricField[] } {
  const table = parseCsv(text);
  const esLocale = csvSeparator(text) === ";";
  if (table.length < 2) throw new Error("El CSV no tiene filas de datos.");
  const header = table[0].map((h) => h.trim());
  const col: Partial<Record<MetricField, number>> = {};
  for (const field of Object.keys(HEADERS) as MetricField[]) {
    const i = header.findIndex((h) => HEADERS[field].some((re) => re.test(h)));
    if (i >= 0) col[field] = i;
  }
  if (col.name === undefined) {
    // Without a name column, the first column that carries an app id is the name.
    const i = header.findIndex((_, k) => table.slice(1).some((r) => AD_ID.test(r[k] ?? "")));
    if (i >= 0) col.name = i;
  }
  if (col.name === undefined) throw new Error("No encontré la columna del nombre del anuncio (p. ej. «Ad name» o «Nombre del anuncio»).");
  const cell = (r: string[], f: MetricField) => (col[f] === undefined ? "" : (r[col[f]!] ?? ""));
  const n = (r: string[], f: MetricField) => num(cell(r, f), esLocale);
  const rows: MetricRow[] = table.slice(1).map((r) => {
    const name = cell(r, "name").trim();
    const parsed = parseAdId(name);
    return {
      name,
      adId: parsed ? adId(parsed.hookId, parsed.meatId, parsed.ctaId) : "",
      impressions: n(r, "impressions"),
      views3s: n(r, "views3s"),
      views: n(r, "views"),
      avgWatch: n(r, "avgWatch"),
      clicks: n(r, "clicks"),
      conversions: n(r, "conversions"),
      spend: n(r, "spend"),
    };
  });
  const found = (Object.keys(col) as MetricField[]).filter((f) => col[f] !== undefined);
  const missing = (Object.keys(HEADERS) as MetricField[]).filter((f) => col[f] === undefined);
  return { rows: rows.filter((r) => r.name), found, missing };
}

// One metric per piece. Hook: share of impressions that watch 3 s. Meat: average watch time (weighted by
// impressions). CTA: clicks and conversions per impression. Views alone depend on spend, so they come along.
export type PieceStats = {
  id: string;
  ads: number;
  impressions: number;
  views: number;
  views3s: number;
  hookRate: number;
  avgWatch: number;
  clicks: number;
  ctr: number;
  conversions: number;
  convRate: number;
  spend: number;
};
function emptyStats(id: string): PieceStats {
  return { id, ads: 0, impressions: 0, views: 0, views3s: 0, hookRate: 0, avgWatch: 0, clicks: 0, ctr: 0, conversions: 0, convRate: 0, spend: 0 };
}
export function pieceStats(rows: MetricRow[]): Record<string, PieceStats> {
  const acc: Record<string, PieceStats & { watchWeight: number }> = {};
  const add = (id: string, r: MetricRow) => {
    const s = (acc[id] ??= { ...emptyStats(id), watchWeight: 0 });
    s.ads++;
    s.impressions += r.impressions;
    s.views += r.views;
    s.views3s += r.views3s;
    s.clicks += r.clicks;
    s.conversions += r.conversions;
    s.spend += r.spend;
    s.avgWatch += r.avgWatch * (r.impressions || 1);
    s.watchWeight += r.impressions || 1;
  };
  for (const r of rows) {
    const parsed = parseAdId(r.adId || r.name);
    if (!parsed) continue;
    add(parsed.hookId, r);
    add(parsed.meatId, r);
    add(parsed.ctaId, r);
  }
  const out: Record<string, PieceStats> = {};
  for (const [id, s] of Object.entries(acc)) {
    const { watchWeight, ...rest } = s;
    out[id] = {
      ...rest,
      avgWatch: watchWeight ? s.avgWatch / watchWeight : 0,
      hookRate: s.impressions ? s.views3s / s.impressions : 0,
      ctr: s.impressions ? s.clicks / s.impressions : 0,
      convRate: s.impressions ? s.conversions / s.impressions : 0,
    };
  }
  return out;
}

// Ads made elsewhere: rows whose name matches an uploaded clip's name (without extension).
export function clipStats(clips: ClipRecord[], rows: MetricRow[]): Record<string, PieceStats> {
  const out: Record<string, PieceStats> = {};
  const key = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").trim();
  for (const clip of clips) {
    const k = key(clip.name);
    if (!k) continue;
    const mine = rows.filter((r) => key(r.name) === k || (k.length >= 6 && key(r.name).includes(k)));
    if (!mine.length) continue;
    const s = emptyStats(clip.id);
    let weight = 0;
    for (const r of mine) {
      s.ads++;
      s.impressions += r.impressions;
      s.views += r.views;
      s.views3s += r.views3s;
      s.clicks += r.clicks;
      s.conversions += r.conversions;
      s.spend += r.spend;
      s.avgWatch += r.avgWatch * (r.impressions || 1);
      weight += r.impressions || 1;
    }
    s.avgWatch = weight ? s.avgWatch / weight : 0;
    s.hookRate = s.impressions ? s.views3s / s.impressions : 0;
    s.ctr = s.impressions ? s.clicks / s.impressions : 0;
    s.convRate = s.impressions ? s.conversions / s.impressions : 0;
    out[clip.id] = s;
  }
  return out;
}

// The hooks that worked, from best to worst: the app's hooks and the clips' hooks with metrics attached.
export type RankedHook = { id: string; text: string; level: Level; angle: Angle; formula: Formula; source: string; stats: PieceStats };
export function rankHooks(state: AdsState): RankedHook[] {
  const byPiece = pieceStats(state.metrics);
  const byClip = clipStats(state.clips, state.metrics);
  const ranked: RankedHook[] = [];
  for (const h of state.hooks) {
    const s = byPiece[h.id];
    if (s) ranked.push({ id: h.id, text: h.text, level: h.level, angle: h.angle, formula: h.formula, source: "app", stats: s });
  }
  for (const c of state.clips) {
    const s = byClip[c.id];
    if (s && c.hook) ranked.push({ id: c.id, text: c.hook, level: c.level, angle: c.angle, formula: c.formula, source: "clip", stats: s });
  }
  const score = (s: PieceStats) => (s.impressions ? s.hookRate : 0) * 1000 + Math.log10(1 + s.views3s + s.views);
  return ranked.sort((a, b) => score(b.stats) - score(a.stats));
}

// ── Export CSV (ready for the ads platform) ────────────────────────────────────────
export const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// "tipo" is video or imagen (the hooks' static versions, shared/adsStatic.ts); "formato" the length or the shape.
export const CSV_HEAD = ["id", "archivo", "nivel", "publico", "hook", "meat", "cta", "texto_principal", "titular", "boton", "tipo", "formato"];
export function exportCsv(batch: Batch, hooks: Hook[], meats: Meat[], ctas: Cta[]): string {
  const by = <T extends Piece>(list: T[]) => Object.fromEntries(list.map((p) => [p.id, p]));
  const H = by(hooks);
  const M = by(meats);
  const C = by(ctas);
  const head = CSV_HEAD;
  const lines = batch.ads.map((a) => {
    const copy = batch.copies[copyKey(a.hookId, a.ctaId)];
    return [
      a.id,
      batch.files[a.id] ?? "",
      `${a.level} · ${LEVEL_INFO[a.level].label}`,
      AUDIENCE_LABEL[LEVEL_INFO[a.level].audience],
      H[a.hookId]?.text ?? "",
      M[a.meatId]?.text ?? "",
      C[a.ctaId]?.text ?? "",
      copy?.primary ?? "",
      copy?.headline ?? "",
      copy?.button ?? "",
      "video",
      `${batch.seconds} s`,
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

// A hook from the organic content (Playbook): the piece's problem and hook title, labelled by the person.
export function organicHook(state: AdsState, text: string, level: Level, seconds: number, note: string): Hook {
  return {
    id: nextId(state, "hook"),
    kind: "hook",
    text: clean(text, 600),
    onScreenText: "",
    visualPrompt: "",
    videoPrompt: "",
    seconds,
    status: "pending",
    source: "organic",
    createdAt: new Date().toISOString(),
    note: clean(note, 600),
    level,
    angle: "curiosity",
    formula: "question",
  };
}

// The levels a batch covers: the chosen ones, or all five.
export function levelsOf(chosen: number[]): Level[] {
  const out = toLevels(chosen, []);
  return out.length ? out : [...LEVELS];
}
