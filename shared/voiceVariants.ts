// "Variantes de voz" (Publicidad): up to 10 uploaded voices per piece. A piece with one voice keeps the old ad id
// and the old render file name. Voices are files the person made outside the app; nothing here calls a voice API.
// The render-file version ("l2") is RENDER_VERSION in shared/ads.ts. Callers pass it; the default matches it.

export const VOICE_VARIANTS_MAX = 10;
// The voice starts this far into the piece (render.ts) and is cut at the piece's end.
export const VOICE_LEAD = 0.15;
export const VOICE_MAX_BYTES = 25 * 1024 * 1024;
// A tanda this big is still allowed (the weekly limit and the 1000 cap decide), but the screen warns first.
export const ADS_LARGE = 300;
export const ADS_BATCH_MAX = 1000;

export const VOICE_ID = /^v(?:10|[1-9])$/;
export const PIECE_ID = /^[HMC]\d{1,4}$/;
const VOICE_EXT = ["mp3", "wav", "m4a", "ogg", "webm"] as const;
export type VoiceExt = (typeof VOICE_EXT)[number];

export type VoiceVariant = {
  id: string;
  file: string;
  name: string;
  seconds: number;
  // The person accepted that a voice longer than the piece is cut at the end.
  cutOk?: boolean;
};

export type LegacyVoice = { file: string; name: string; duration: number };

export type VoiceCarrier = {
  voice?: LegacyVoice;
  voices?: VoiceVariant[];
  voiceSeq?: number;
};

const voiceNum = (id: string) => {
  const n = Number(id.slice(1));
  return Number.isInteger(n) && n >= 1 && n <= VOICE_VARIANTS_MAX ? n : 0;
};

export function voiceNumber(id: string): number {
  return voiceNum(id);
}

// The next id is the one after the highest ever allocated. A deleted id is not used again.
export function nextVoiceId(seq: number, count: number): { id: string } | { error: string } {
  if (count >= VOICE_VARIANTS_MAX) return { error: "Esta pieza ya tiene 10 voces." };
  if (seq >= VOICE_VARIANTS_MAX) return { error: "Esta pieza ya usó las 10 voces (v1 a v10). Borrar una no libera el número." };
  return { id: `v${seq + 1}` };
}

// Old campana.json keeps `voice` and no list. That file becomes v1. A piece that already has a list is left as it is.
// A single voice is also mirrored back onto `voice`, so the one-voice render keeps reading the same field.
export function settleVoices<T extends VoiceCarrier>(media: T): T {
  const hadList = Array.isArray(media.voices);
  const list = media.voices ? [...media.voices] : [];
  if (!list.length && !media.voice) return media;
  let seq = media.voiceSeq ?? 0;
  if (!list.length && media.voice?.file) {
    list.push({ id: "v1", file: media.voice.file, name: media.voice.name, seconds: media.voice.duration });
    seq = Math.max(seq, 1);
  }
  for (const v of list) seq = Math.max(seq, voiceNum(v.id));
  const next: T = { ...media, voices: list, voiceSeq: seq };
  if (list.length === 1) {
    const v = list[0];
    next.voice = { file: v.file, name: v.name, duration: v.seconds };
  } else if (hadList || list.length !== 1) {
    delete next.voice;
  }
  return next;
}

// Writes the list onto a media object and keeps `voice` only while there is exactly one (the old render path).
export function applyVoices<T extends VoiceCarrier>(media: T, voices: VoiceVariant[], seq: number): T {
  media.voices = voices;
  media.voiceSeq = Math.max(seq, ...voices.map((v) => voiceNum(v.id)), 0);
  if (voices.length === 1) {
    const v = voices[0];
    media.voice = { file: v.file, name: v.name, duration: v.seconds };
  } else {
    delete media.voice;
  }
  return media;
}

export function formatSeconds(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return String(rounded).replace(".", ",");
}

// The voice starts 0.15 s in. It runs past the piece when lead + duration is longer than the piece.
export function voiceLengthWarning(variantNumber: number, voiceSeconds: number, pieceSeconds: number): string | null {
  if (!(voiceSeconds + VOICE_LEAD > pieceSeconds + 1e-3)) return null;
  return `La voz ${variantNumber} dura ${formatSeconds(voiceSeconds)} s y la pieza ${formatSeconds(pieceSeconds)} s`;
}

// Blocks the render of this variant until the person accepts the cut or replaces the file.
export function voiceCutBlock(variant: Pick<VoiceVariant, "id" | "seconds" | "cutOk">, pieceSeconds: number): string | null {
  if (variant.cutOk) return null;
  const warning = voiceLengthWarning(voiceNumber(variant.id), variant.seconds, pieceSeconds);
  if (!warning) return null;
  return `${warning}. Se corta al final de la pieza. Aceptá el corte o reemplazala antes de renderizar.`;
}

// mp3, wav, m4a, ogg, webm, from the bytes. Null is anything else (including an empty file).
export function voiceTypeOf(bytes: Uint8Array): VoiceExt | null {
  if (bytes.length < 4) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  if (bytes.length >= 8 && ascii(4, 8) === "ftyp") return "m4a";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return null;
}

export function voiceFileName(pieceId: string, vid: string, ext: VoiceExt): string {
  return `${pieceId}-voz-${vid}.${ext}`;
}

// What the route answers with (400). Null means the upload may proceed.
export function voiceUploadError(o: {
  pieceId: string;
  vid: string;
  count: number;
  seq: number;
  byteLength: number;
  bytes: Uint8Array;
  replacing: boolean;
}): string | null {
  if (!PIECE_ID.test(o.pieceId)) return "Esa pieza no existe.";
  if (!VOICE_ID.test(o.vid)) return "Esa voz no existe.";
  if (!o.replacing) {
    const next = nextVoiceId(o.seq, o.count);
    if ("error" in next) return next.error;
    if (o.vid !== next.id) return `Esa voz no es la que sigue. La próxima es ${next.id}.`;
  }
  if (!o.byteLength) return "El archivo está vacío.";
  if (o.byteLength > VOICE_MAX_BYTES) return "La voz pesa más de 25 MB.";
  if (!voiceTypeOf(o.bytes)) return "Ese archivo no es un audio (mp3, wav, m4a, ogg o webm).";
  return null;
}

export function cleanVoiceName(name: string, fallback: string): string {
  const base = (name.split(/[/\\]/).pop() ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return base || fallback.slice(0, 120);
}

// ── Ad ids ──────────────────────────────────────────────────────────────────────
// The variant suffix is added only when that piece has more than one voice. One voice keeps H12-M3-C2.
const TOKEN = "(H\\d{1,4})(v(?:10|[1-9]))?-(M\\d{1,4})(v(?:10|[1-9]))?-(C\\d{1,4})(v(?:10|[1-9]))?";
export const AD_ID = new RegExp(`\\b${TOKEN}\\b`, "i");
export const AD_ID_EXACT = new RegExp(`^${TOKEN}$`, "i");

export type ParsedAdId = {
  hookId: string;
  meatId: string;
  ctaId: string;
  hookVoice?: string;
  meatVoice?: string;
  ctaVoice?: string;
};

const normVoice = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const n = Number(raw.slice(1));
  return n >= 1 && n <= 10 ? `v${n}` : undefined;
};

export function parseAdId(text: string): ParsedAdId | null {
  const m = AD_ID.exec(text);
  if (!m) return null;
  const hookVoice = normVoice(m[2]);
  const meatVoice = normVoice(m[4]);
  const ctaVoice = normVoice(m[6]);
  return {
    hookId: m[1].toUpperCase(),
    meatId: m[3].toUpperCase(),
    ctaId: m[5].toUpperCase(),
    ...(hookVoice && { hookVoice }),
    ...(meatVoice && { meatVoice }),
    ...(ctaVoice && { ctaVoice }),
  };
}

export function adId(hookId: string, meatId: string, ctaId: string, voices?: { hook?: string; meat?: string; cta?: string }): string {
  const token = (id: string, voice?: string) => (voice && VOICE_ID.test(voice) ? `${id}${voice}` : id);
  return `${token(hookId, voices?.hook)}-${token(meatId, voices?.meat)}-${token(ctaId, voices?.cta)}`;
}

export function isAdId(id: string): boolean {
  return AD_ID_EXACT.test(id);
}

// Piece ids that have more than one voice, each with the variants chosen for this batch.
// A missing catalogue means "no voice axis" (every piece combines once, old ids).
export type VoicePicks = Record<string, string[]>;

export function voicePicks(
  media: Record<string, VoiceCarrier | undefined>,
  chosen?: Record<string, string[]>,
): VoicePicks | undefined {
  const out: VoicePicks = {};
  let any = false;
  for (const [id, m] of Object.entries(media)) {
    const ids = (m?.voices ?? []).map((v) => v.id).filter((v) => VOICE_ID.test(v));
    if (ids.length <= 1) continue;
    any = true;
    const pick = (chosen?.[id] ?? ids).filter((v) => ids.includes(v));
    out[id] = pick;
  }
  return any ? out : undefined;
}

// One entry per variant that enters the batch. A piece that is not in the catalogue (one voice, or none) is [undefined].
export function voiceAxis(pieceId: string, picks?: VoicePicks): (string | undefined)[] {
  if (!picks || picks[pieceId] === undefined) return [undefined];
  return picks[pieceId];
}

export function voiceColumn(media: VoiceCarrier | undefined, voiceId?: string): string {
  const voices = media?.voices ?? [];
  if (voiceId) return voices.find((v) => v.id === voiceId)?.name ?? "";
  if (voices.length === 1) return voices[0].name;
  return media?.voice?.name ?? "";
}

// ── Render cache ────────────────────────────────────────────────────────────────
// One voice: key `H3`, file `H3.l2.mp4`. Several: key `H3.v2`, file `H3.v2.l2.mp4`.
export function renderKey(pieceId: string, voiceId: string | undefined, multi: boolean): string {
  return multi && voiceId ? `${pieceId}.${voiceId}` : pieceId;
}

export function renderNameForKey(key: string, ext: string, version = "l2"): string {
  const m = key.match(/^(.*)\.(v(?:10|[1-9]))$/);
  return m ? `${m[1]}.${m[2]}.${version}.${ext}` : `${key}.${version}.${ext}`;
}

export function pieceRenderKeys(renders: Record<string, string>, pieceId: string): string[] {
  return Object.keys(renders).filter((k) => k === pieceId || k.startsWith(`${pieceId}.v`));
}

export type CachePlan = {
  drop: string[];
  move?: { from: string; to: string };
};

// How the cache keys move when the voice list changes. `touched` is the variant that was added, replaced or deleted.
export function voiceCachePlan(pieceId: string, beforeIds: string[], afterIds: string[], touched: string, kind: "add" | "replace" | "delete"): CachePlan {
  if (kind === "replace") return { drop: [renderKey(pieceId, touched, afterIds.length > 1)] };
  if (kind === "add") {
    if (beforeIds.length === 0) return { drop: [pieceId] };
    if (beforeIds.length === 1 && afterIds.length > 1) return { drop: [], move: { from: pieceId, to: `${pieceId}.${beforeIds[0]}` } };
    return { drop: [] };
  }
  if (afterIds.length > 1) return { drop: [`${pieceId}.${touched}`] };
  if (afterIds.length === 1) return { drop: [`${pieceId}.${touched}`], move: { from: `${pieceId}.${afterIds[0]}`, to: pieceId } };
  return { drop: [pieceId, `${pieceId}.${touched}`] };
}

// A picture, a clip or the text change every variant's render. A voice change does not use this.
export function pictureCachePlan(pieceId: string, voiceIds: string[]): CachePlan {
  return { drop: [pieceId, ...voiceIds.map((id) => `${pieceId}.${id}`)] };
}

export function renderUnits(ad: { hookId: string; meatId: string; ctaId: string; hookVoice?: string; meatVoice?: string; ctaVoice?: string }): string[] {
  return [renderKey(ad.hookId, ad.hookVoice, Boolean(ad.hookVoice)), renderKey(ad.meatId, ad.meatVoice, Boolean(ad.meatVoice)), renderKey(ad.ctaId, ad.ctaVoice, Boolean(ad.ctaVoice))];
}

export function pieceOfUnit(unit: string): string {
  return unit.replace(/\.v(?:10|[1-9])$/, "");
}

export function adsCountWarning(count: number): { block: string | null; warn: string | null } {
  if (count > ADS_BATCH_MAX) {
    return {
      block: `Esta tanda arma ${count} anuncios y una tanda acepta hasta ${ADS_BATCH_MAX}. Elegí menos voces o menos piezas.`,
      warn: null,
    };
  }
  if (count > ADS_LARGE) {
    return {
      block: null,
      warn: `Esta tanda arma ${count} anuncios. Es mucho: cada voz multiplica los anuncios. Revisá qué voces entran antes de renderizar.`,
    };
  }
  return { block: null, warn: null };
}
