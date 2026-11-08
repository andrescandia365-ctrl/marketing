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

// A batch names a variant when the ad carries hookVoice / meatVoice / ctaVoice for this piece.
export type VariantRef = {
  hookId: string;
  meatId: string;
  ctaId: string;
  hookVoice?: string;
  meatVoice?: string;
  ctaVoice?: string;
};

export function pieceVariantsReferenced(pieceId: string, batches: { ads: VariantRef[] }[]): boolean {
  for (const batch of batches) {
    for (const ad of batch.ads) {
      if (ad.hookId === pieceId && ad.hookVoice) return true;
      if (ad.meatId === pieceId && ad.meatVoice) return true;
      if (ad.ctaId === pieceId && ad.ctaVoice) return true;
    }
  }
  return false;
}

// With no voices left and no batch still naming one, the next upload can be v1 again. Otherwise the high-water stays.
export function voiceSeqAfterClear(seq: number, voicesLeft: number, referenced: boolean): number {
  if (voicesLeft === 0 && !referenced) return 0;
  return seq;
}

// Old campana.json keeps `voice` and no list. That file becomes v1, already accepted (`cutOk`), so a voice that
// used to render past the piece still does. A piece that already has a list is left as it is, cutOk included.
// A single voice is also mirrored back onto `voice`, so the one-voice render keeps reading the same field.
export function settleVoices<T extends VoiceCarrier>(media: T): T {
  const hadList = Array.isArray(media.voices);
  const list = media.voices ? [...media.voices] : [];
  if (!list.length && !media.voice) return media;
  let seq = media.voiceSeq ?? 0;
  if (!list.length && media.voice?.file) {
    list.push({ id: "v1", file: media.voice.file, name: media.voice.name, seconds: media.voice.duration, cutOk: true });
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

// A current cache (this session, or a file whose name carries the render version) still plays. The block applies
// only before a fresh render.
export function shouldBlockVoice(
  variant: Pick<VoiceVariant, "id" | "seconds" | "cutOk"> | undefined,
  pieceSeconds: number,
  hasCurrentRender: boolean,
): string | null {
  if (!variant || hasCurrentRender) return null;
  return voiceCutBlock(variant, pieceSeconds);
}

export type VoiceCheckPiece = {
  id: string;
  seconds: number;
  clipSpeaker?: boolean;
  voices?: Pick<VoiceVariant, "id" | "seconds" | "cutOk">[];
};

// What POST /batches refuses, in Spanish. A clip speaker does not need a variant and is not blocked by a voice it does not play.
export function comboIssues(ad: VariantRef & { id: string }, pieces: Record<string, VoiceCheckPiece | undefined>): string | null {
  const expected = adId(ad.hookId, ad.meatId, ad.ctaId, { hook: ad.hookVoice, meat: ad.meatVoice, cta: ad.ctaVoice });
  if (ad.id !== expected) return `El id ${ad.id} no coincide con sus partes (${expected}).`;
  const slots = [
    { pieceId: ad.hookId, voiceId: ad.hookVoice },
    { pieceId: ad.meatId, voiceId: ad.meatVoice },
    { pieceId: ad.ctaId, voiceId: ad.ctaVoice },
  ];
  for (const slot of slots) {
    const piece = pieces[slot.pieceId];
    if (!piece) return `Esa pieza no existe (${slot.pieceId}).`;
    if (piece.clipSpeaker) {
      if (slot.voiceId) return `${slot.pieceId} la dice el personaje en el clip: no lleva una voz de la pieza.`;
      continue;
    }
    const voices = (piece.voices ?? []).filter((v) => VOICE_ID.test(v.id));
    if (slot.voiceId) {
      const variant = voices.find((v) => v.id === slot.voiceId);
      if (!variant) return `Esa voz no existe (${slot.pieceId} ${slot.voiceId}).`;
      const block = voiceCutBlock(variant, piece.seconds);
      if (block) return block;
      continue;
    }
    if (voices.length > 1) return `${slot.pieceId} tiene varias voces: el anuncio tiene que decir cuál.`;
    if (voices.length === 1) {
      const block = voiceCutBlock(voices[0], piece.seconds);
      if (block) return block;
    }
  }
  return null;
}

// The cut check alone, for a whole-ad re-render. A missing voice is not this function's job.
export function renderVoiceBlock(ad: VariantRef, pieces: Record<string, VoiceCheckPiece | undefined>): string | null {
  const slots = [
    { pieceId: ad.hookId, voiceId: ad.hookVoice },
    { pieceId: ad.meatId, voiceId: ad.meatVoice },
    { pieceId: ad.ctaId, voiceId: ad.ctaVoice },
  ];
  for (const slot of slots) {
    const piece = pieces[slot.pieceId];
    if (!piece || piece.clipSpeaker) continue;
    const voices = piece.voices ?? [];
    const variant = slot.voiceId ? voices.find((v) => v.id === slot.voiceId) : voices.length === 1 ? voices[0] : undefined;
    if (!variant) continue;
    const block = voiceCutBlock(variant, piece.seconds);
    if (block) return block;
  }
  return null;
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

// A voice file is audio. A clip named .webm stays video/webm (the caller passes that fallback).
const VOICE_WEBM = /-voz-v(?:10|[1-9])\.webm$/;
export function adsMediaType(file: string, fallback: string): string {
  const base = file.split("/").pop() ?? file;
  return VOICE_WEBM.test(base) ? "audio/webm" : fallback;
}

// The browser measures the voice. The query string is only accepted when it is a real length.
const VOICE_SECONDS_MAX = 7200;
export function readVoiceSeconds(raw: string | undefined): { seconds: number } | { error: string } {
  if (raw === undefined || raw.trim() === "") return { error: "Falta el largo de la voz." };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > VOICE_SECONDS_MAX) return { error: "El largo de la voz no es un número." };
  return { seconds: Math.round(n * 1000) / 1000 };
}

// Reject before the body is read. A missing length, an empty file and a file over 25 MB never get buffered.
export function voiceBodyError(contentLength: string | undefined): string | null {
  if (contentLength === undefined || contentLength.trim() === "") return "Falta el tamaño del archivo.";
  const n = Number(contentLength);
  if (!Number.isFinite(n) || n <= 0) return "El archivo está vacío.";
  if (n > VOICE_MAX_BYTES) return "La voz pesa más de 25 MB.";
  return null;
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
// Routes and file names stay uppercase. The metrics import is the only place that accepts either case (`AD_ID`).
// `\b` never sits between `_` and `H` (`_` is a word character), so an exported name lost its id. A letter or a
// digit on either side still blocks a match; an underscore, a space or a copy suffix does not.
// An element set (e1–e3) sits on the hook only, and only in the id when that hook has more than one set.
const TOKEN = "(H\\d{1,4})(e[1-3])?(v(?:10|[1-9]))?-(M\\d{1,4})(v(?:10|[1-9]))?-(C\\d{1,4})(v(?:10|[1-9]))?";
export const AD_ID = new RegExp(`(?<![A-Za-z0-9])${TOKEN}(?![A-Za-z0-9])`, "i");
export const AD_ID_EXACT = new RegExp(`^${TOKEN}$`);

export type ParsedAdId = {
  hookId: string;
  meatId: string;
  ctaId: string;
  hookVoice?: string;
  meatVoice?: string;
  ctaVoice?: string;
  // Set only when the id names an element set (H12e2-M3-C1). Old ids have none.
  hookElement?: "e1" | "e2" | "e3";
};

const normVoice = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const n = Number(raw.slice(1));
  return n >= 1 && n <= 10 ? `v${n}` : undefined;
};

const normElement = (raw: string | undefined): "e1" | "e2" | "e3" | undefined => {
  const id = raw?.toLowerCase();
  return id === "e1" || id === "e2" || id === "e3" ? id : undefined;
};

export function parseAdId(text: string): ParsedAdId | null {
  const m = AD_ID.exec(text);
  if (!m) return null;
  const hookElement = normElement(m[2]);
  const hookVoice = normVoice(m[3]);
  const meatVoice = normVoice(m[5]);
  const ctaVoice = normVoice(m[7]);
  return {
    hookId: m[1].toUpperCase(),
    meatId: m[4].toUpperCase(),
    ctaId: m[6].toUpperCase(),
    ...(hookElement && { hookElement }),
    ...(hookVoice && { hookVoice }),
    ...(meatVoice && { meatVoice }),
    ...(ctaVoice && { ctaVoice }),
  };
}

export function adId(
  hookId: string,
  meatId: string,
  ctaId: string,
  voices?: { hook?: string; meat?: string; cta?: string },
  element?: string,
): string {
  const token = (id: string, voice?: string) => {
    const base = id.toUpperCase();
    return voice && VOICE_ID.test(voice) ? `${base}${voice}` : base;
  };
  const el = normElement(element) ?? "";
  const hookVoice = voices?.hook && VOICE_ID.test(voices.hook) ? voices.hook : "";
  const hook = `${hookId.toUpperCase()}${el}${hookVoice}`;
  return `${hook}-${token(meatId, voices?.meat)}-${token(ctaId, voices?.cta)}`;
}

export function isAdId(id: string): boolean {
  return AD_ID_EXACT.test(id);
}

// Piece ids that have more than one voice, each with the variants chosen for this batch.
// A missing catalogue means "no voice axis" (every piece combines once, old ids).
export type VoicePicks = Record<string, string[]>;

export type VoicePickContext = {
  // Pieces whose character speaks inside the clip. They stay off the axis.
  clipSpeaker?: ReadonlySet<string>;
  // When set, a variant that would be cut (no cutOk) is left out. Without it, every voice counts.
  seconds?: Record<string, number>;
};

export function usableVoiceIds(voices: Pick<VoiceVariant, "id" | "seconds" | "cutOk">[] | undefined, pieceSeconds?: number): string[] {
  const ids: string[] = [];
  for (const v of voices ?? []) {
    if (!VOICE_ID.test(v.id)) continue;
    if (pieceSeconds !== undefined && voiceCutBlock(v, pieceSeconds)) continue;
    ids.push(v.id);
  }
  return ids;
}

export function voicePicks(
  media: Record<string, VoiceCarrier | undefined>,
  chosen?: Record<string, string[]>,
  ctx?: VoicePickContext,
): VoicePicks | undefined {
  const out: VoicePicks = {};
  let any = false;
  for (const [id, m] of Object.entries(media)) {
    if (ctx?.clipSpeaker?.has(id)) continue;
    const all = (m?.voices ?? []).map((v) => v.id).filter((v) => VOICE_ID.test(v));
    if (all.length <= 1) continue;
    any = true;
    const seconds = ctx?.seconds?.[id];
    const open = seconds === undefined ? all : usableVoiceIds(m?.voices, seconds);
    const pick = (chosen?.[id] ?? open).filter((v) => open.includes(v));
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
// An element set is the same idea, and it sits before the voice: `H12.e2`, `H12.e2.v3`.
// Old calls (three arguments, or one voice and no element sets) keep the old key.
export function renderKey(pieceId: string, voiceId: string | undefined, multi: boolean, element?: string, multiElement = false): string {
  const el = multiElement && element && /^e[1-3]$/.test(element) ? `.${element}` : "";
  const voice = multi && voiceId ? `.${voiceId}` : "";
  return `${pieceId}${el}${voice}`;
}

// H3.v2 → the voice. H12.e2 → the element set. H12.e2.v3 → both. H3 → neither.
export function unitSuffix(unit: string): { element?: string; voice?: string } {
  const voice = unit.match(/\.v(?:10|[1-9])$/)?.[0].slice(1);
  const rest = voice ? unit.slice(0, -(voice.length + 1)) : unit;
  const element = rest.match(/\.e[1-3]$/)?.[0].slice(1);
  return { ...(element ? { element } : {}), ...(voice ? { voice } : {}) };
}

// Which variant a saved render belongs to. A clip speaker is one file even when the piece has several voices:
// the clip already says the line, so `?voice=` is ignored. One voice also keeps the old file name.
export function renderVoiceUse(
  voices: { id: string }[] | undefined,
  voiceQuery: string | undefined,
  clipSpeaker: boolean,
): { voice?: string } | { error: string } {
  const list = (voices ?? []).filter((v) => VOICE_ID.test(v.id));
  if (voiceQuery && !list.some((v) => v.id === voiceQuery)) return { error: "Esa voz no existe." };
  if (clipSpeaker || list.length <= 1) return {};
  if (!voiceQuery) return { error: "Esta pieza tiene varias voces: indicá cuál render es." };
  return { voice: voiceQuery };
}

export function renderNameForKey(key: string, ext: string, version = "l2"): string {
  const m = key.match(/^(.*)\.(v(?:10|[1-9]))$/);
  return m ? `${m[1]}.${m[2]}.${version}.${ext}` : `${key}.${version}.${ext}`;
}

// Move a cached render only when its name already carries the current version. An older file is dropped, so renaming
// it to `….l2.…` cannot make it current forever. Null means drop.
export function keptRenderMove(fromFile: string, toKey: string, version = "l2"): string | null {
  if (!fromFile.includes(`.${version}.`)) return null;
  const base = fromFile.split("/").pop() ?? fromFile;
  const ext = base.split(".").pop() || "mp4";
  return `piezas/${renderNameForKey(toKey, ext, version)}`;
}

export function pieceRenderKeys(renders: Record<string, string>, pieceId: string): string[] {
  return Object.keys(renders).filter((k) => k === pieceId || k.startsWith(`${pieceId}.v`) || k.startsWith(`${pieceId}.e`));
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
export function pictureCachePlan(pieceId: string, voiceIds: string[], elementIds: string[] = []): CachePlan {
  const els = elementIds.filter((id) => /^e[1-3]$/.test(id));
  const drop = [pieceId, ...voiceIds.map((id) => `${pieceId}.${id}`)];
  for (const el of els) {
    drop.push(`${pieceId}.${el}`);
    for (const v of voiceIds) drop.push(`${pieceId}.${el}.${v}`);
  }
  return { drop };
}

export function renderUnits(ad: { hookId: string; meatId: string; ctaId: string; hookVoice?: string; meatVoice?: string; ctaVoice?: string; hookElement?: string }): string[] {
  return [
    renderKey(ad.hookId, ad.hookVoice, Boolean(ad.hookVoice), ad.hookElement, Boolean(ad.hookElement)),
    renderKey(ad.meatId, ad.meatVoice, Boolean(ad.meatVoice)),
    renderKey(ad.ctaId, ad.ctaVoice, Boolean(ad.ctaVoice)),
  ];
}

export function pieceOfUnit(unit: string): string {
  return unit.replace(/\.e[1-3](?=\.|$)/, "").replace(/\.v(?:10|[1-9])$/, "");
}

// Voices the person had not seen when they picked variants. No selection means nothing is "new".
export type VoiceSelection = { picked: string[]; known: string[] };

export function newVoiceIds(current: readonly string[], selection: VoiceSelection | undefined): string[] {
  if (!selection) return [];
  const known = new Set(selection.known);
  return current.filter((id) => VOICE_ID.test(id) && !known.has(id));
}

const SERIES_ID = /^[a-z0-9-]{1,40}$/;

export function readVoiceSelection(raw: unknown): VoiceSelection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.picked) && !Array.isArray(o.known)) return undefined;
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && VOICE_ID.test(x)) : []);
  return { picked: ids(o.picked), known: ids(o.known) };
}

// series id → piece id → the variants picked for the batch, plus the ids the person had already seen.
export type StoredVoices = Record<string, Record<string, VoiceSelection>>;

export function readStoredVoices(raw: unknown): StoredVoices {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StoredVoices = {};
  for (const [series, pieces] of Object.entries(raw as Record<string, unknown>)) {
    if (!SERIES_ID.test(series) || !pieces || typeof pieces !== "object" || Array.isArray(pieces)) continue;
    const map: Record<string, VoiceSelection> = {};
    for (const [piece, sel] of Object.entries(pieces as Record<string, unknown>)) {
      if (!PIECE_ID.test(piece)) continue;
      const parsed = readVoiceSelection(sel);
      if (parsed) map[piece] = parsed;
    }
    if (Object.keys(map).length) out[series] = map;
  }
  return out;
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
