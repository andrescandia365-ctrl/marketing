// Names a Grok file so a later drop finds its slot. One clip is the piece id (H12). Clip 2 of a long meat is
// M3-c2 (the number the person sees, so the file is 1-based). A still of the piece is H12-img. The file name is
// shown next to the copy button and in the batch header, never inside the text Grok reads. Parsing is tolerant
// and never guesses between two piece codes. A letter stuck to other letters or digits (a Grok download, DSC_M100)
// is not a piece id.
import { grokSequence } from "./adsSequence.ts";
import type { PieceKind } from "./ads.ts";
import { AD_ID } from "./voiceVariants.ts";

export type SlotSpec = { image: true } | { count: number; index: number };

// The code the file should carry. `count` is how many clips the piece has; a single clip has no -c1.
export function slotName(pieceId: string, slot: SlotSpec): string {
  const id = pieceId.toUpperCase();
  if ("image" in slot) return `${id}-img`;
  if (!(slot.count > 1)) return id;
  return `${id}-c${slot.index + 1}`;
}

export function videoSaveLine(slot: string): string {
  return `Guardá el video como: ${slot}.mp4`;
}

export function imageSaveLine(slot: string): string {
  return `Guardá la imagen como: ${slot}.png`;
}

// Appends the save line once. The studios do not use this on the text Grok reads: the name stays outside that text.
export function withSlotLine(prompt: string, line: string): string {
  const trimmed = prompt.replace(/\s+$/, "");
  if (trimmed.endsWith(line)) return trimmed;
  return trimmed ? `${trimmed}\n${line}` : line;
}

export type SlotParse =
  | { ok: true; pieceId: string; image: boolean; clip: number | null }
  | { ok: false; reason: "none" | "ambiguous" | "clips" };

// The lookbehind includes "_" so DSC_M100 and grok_8a1c3e are not piece ids. A digit before the letter
// (grok-video-3f2c41a9) is the same idea. The right side stays (?!\d) so M3c2 is still piece M3.
const PIECE_RE = /(?<![A-Za-z0-9_])[HMC]\d{1,4}(?!\d)/gi;
// A separator, then c/clip plus a number, or img/imagen/image. The separator is required, so "M3c2" stays piece M3
// with trailing text and does not become clip 2. "estatico" is not the piece image: that file belongs to Estáticos.
const MARKER_RE = /[\s_-](?:(?:c|clip)[\s_-]*(\d{1,2})(?!\d)|(img|imagen|image)\b)/gi;

// A c+digits token is the clip marker (M3-c2), not a second piece, when a separator is all that stands between it
// and the piece id. Glued on (M3c2) it is trailing text. A c-code with words in between (H12 y C2) is another piece.
function clipToken(token: string, gap: string): "marker" | "glued" | "piece" {
  if (!/^c\d{1,2}$/i.test(token)) return "piece";
  if (gap === "") return "glued";
  if (/^[\s_-]+$/.test(gap)) return "marker";
  return "piece";
}

// The reverse of slotName. Any case; spaces, dashes or underscores; extra text after one code
// ("M3-c2 (1).mp4", "m3_c2-final.mp4"). Two piece codes, or two clip/image marks, are not a guess.
// A whole ad id (H12-M3-C2, with a series prefix, a voice suffix or the _45s_9x16 ending) is the
// same refusal: PIECE_RE's lookbehind hides the hook behind "_", and the rest would be M3 clip 2.
// `clip` is the 1-based number written in the name, or null when the name does not say which clip.
export function parseSlotName(name: string): SlotParse {
  const base = (name.split(/[/\\]/).pop() ?? name).replace(/\.[a-z0-9]{1,5}$/i, "");
  // Before piece codes. AD_ID allows "_" on either side, so IMAN_N2_H12-M3-C2_45s_9x16 and Meta's
  // " - Copy" match here. A single slot (H12, M3-c2) does not.
  if (AD_ID.test(base)) return { ok: false, reason: "ambiguous" };
  const found = [...base.matchAll(PIECE_RE)];
  if (found.length === 0) return { ok: false, reason: "none" };
  const ids: { id: string; end: number }[] = [];
  let cursor = 0;
  for (const hit of found) {
    const start = hit.index ?? 0;
    const gap = base.slice(cursor, start);
    const kind = ids.length === 0 ? "piece" : clipToken(hit[0], gap);
    if (kind === "piece") ids.push({ id: hit[0].toUpperCase(), end: start + hit[0].length });
    cursor = start + hit[0].length;
  }
  if (ids.length > 1) return { ok: false, reason: "ambiguous" };
  const pieceId = ids[0].id;
  const rest = base.slice(ids[0].end);
  const marks = [...rest.matchAll(MARKER_RE)];
  if (marks.length > 1) return { ok: false, reason: "clips" };
  if (marks.length === 0) return { ok: true, pieceId, image: false, clip: null };
  if (marks[0][2]) return { ok: true, pieceId, image: true, clip: null };
  return { ok: true, pieceId, image: false, clip: Number(marks[0][1]) };
}

// What the preview table says. The five named by the upload, plus the two cases a name can leave open.
export const BULK_STATUSES = [
  "nuevo",
  "reemplaza el actual",
  "no encontré la pieza",
  "ese clip no existe en esta pieza",
  "formato no válido",
  "elegí el lugar",
  "hay más de una pieza en el nombre",
  "esa pieza es de otra pestaña",
  "repetido",
] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

// Only a row that already names one free or occupied slot is uploaded. The rest wait for a hand pick.
export function bulkWillUpload(status: BulkStatus): boolean {
  return status === "nuevo" || status === "reemplaza el actual";
}

export type BulkPiece = {
  id: string;
  kind: PieceKind;
  seconds: number;
  image: boolean;
  // One entry per Grok clip, true when that slot already has a file. Index 0 is the single clip.
  clips: boolean[];
  // A finished explainer is one clip, even when the piece is longer than 15 s.
  singleClip?: boolean;
};

export type BulkFile = { name: string; size: number; kind: "video" | "image" | null };

// A slot the person picked because the name did not. `index` null is the single clip (the route without ?index).
export type ForcedSlot = { pieceId: string; image: boolean; index: number | null };

export type BulkMatch = {
  status: BulkStatus;
  pieceId?: string;
  image?: boolean;
  index?: number | null;
  slot?: string;
  pick: boolean;
};

export type SlotChoice = { pieceId: string; image: boolean; index: number | null; label: string };

function clipCount(piece: BulkPiece): number {
  if (piece.singleClip) return 1;
  const n = grokSequence(piece.seconds).length;
  return n > 0 ? n : 1;
}

// Two files for one slot in the same drop: the first keeps its status, every later one is "repetido" and waits
// for a hand pick. Only a row that would upload occupies the slot.
export function markRepeated(matches: BulkMatch[]): BulkMatch[] {
  const seen = new Set<string>();
  return matches.map((m) => {
    if (!bulkWillUpload(m.status) || !m.pieceId || m.image === undefined) return m;
    const key = `${m.pieceId}|${m.image ? "i" : "c"}|${m.index ?? ""}`;
    if (seen.has(key)) return { ...m, status: "repetido", pick: true };
    seen.add(key);
    return m;
  });
}

// A row already marked listo is not uploaded again. The preview can still say "reemplaza el actual".
export function pendingUploads<T extends { key: string; status: BulkStatus }>(rows: T[], done: Readonly<Record<string, string>>): T[] {
  return rows.filter((r) => bulkWillUpload(r.status) && done[r.key] !== "listo");
}

function hasFile(piece: BulkPiece, image: boolean, index: number | null): boolean {
  if (image) return piece.image;
  return Boolean(piece.clips[index ?? 0]);
}

function slotOf(pieceId: string, image: boolean, index: number | null, count: number): string {
  if (image) return slotName(pieceId, { image: true });
  return slotName(pieceId, { count, index: index ?? 0 });
}

// The slots of this tab, for the dropdown on a row the name did not settle.
export function slotChoices(pieces: BulkPiece[], scope: PieceKind | "all"): SlotChoice[] {
  const out: SlotChoice[] = [];
  for (const piece of pieces) {
    if (scope !== "all" && piece.kind !== scope) continue;
    const count = clipCount(piece);
    if (count <= 1) out.push({ pieceId: piece.id, image: false, index: null, label: `${piece.id} · clip` });
    else {
      for (let i = 0; i < count; i++) {
        out.push({ pieceId: piece.id, image: false, index: i, label: `${slotName(piece.id, { count, index: i })} · clip ${i + 1}` });
      }
    }
    out.push({ pieceId: piece.id, image: true, index: null, label: `${slotName(piece.id, { image: true })} · imagen` });
  }
  return out;
}

// The piece media route has no byte cap. The 25 MB cap is voices and transcriptions, and the 200 MB cap is a
// series screen recording. An empty file, or one whose first bytes are not a video or a picture, is "formato no válido".
function typeStatus(file: BulkFile, image: boolean): BulkStatus | null {
  if (!file.size || !file.kind) return "formato no válido";
  if (image && file.kind !== "image") return "formato no válido";
  if (!image && file.kind !== "video") return "formato no válido";
  return null;
}

function matched(piece: BulkPiece, image: boolean, index: number | null): BulkMatch {
  const count = clipCount(piece);
  return {
    status: hasFile(piece, image, index) ? "reemplaza el actual" : "nuevo",
    pieceId: piece.id,
    image,
    index,
    slot: slotOf(piece.id, image, index, count),
    pick: false,
  };
}

function checkSlot(piece: BulkPiece, file: BulkFile, image: boolean, index: number | null, scope: PieceKind | "all"): BulkMatch {
  if (scope !== "all" && piece.kind !== scope) {
    return { status: "esa pieza es de otra pestaña", pieceId: piece.id, pick: true };
  }
  const count = clipCount(piece);
  let at = image ? null : index;
  if (!image) {
    if (index === null && count > 1) return { status: "elegí el lugar", pieceId: piece.id, pick: true };
    if (index !== null && (index < 0 || index >= count)) {
      return { status: "ese clip no existe en esta pieza", pieceId: piece.id, pick: true };
    }
    if (count <= 1) at = null;
  }
  const wrong = typeStatus(file, image);
  if (wrong) return { status: wrong, pieceId: piece.id, image, index: at, slot: slotOf(piece.id, image, at, count), pick: true };
  return matched(piece, image, at);
}

// The preview row. `forced` is the dropdown: the name is ignored and the type is still checked.
// A file that is not a video or a picture says "formato no válido" before the name is read, so a .txt or a
// voice memo does not become "no encontré la pieza" or a hook's clip.
export function matchBulkFile(file: BulkFile, pieces: BulkPiece[], scope: PieceKind | "all", forced?: ForcedSlot): BulkMatch {
  if (!file.size || !file.kind) return { status: "formato no válido", pick: true };
  if (forced) {
    const piece = pieces.find((p) => p.id === forced.pieceId);
    if (!piece) return { status: "no encontré la pieza", pick: true };
    if (scope !== "all" && piece.kind !== scope) return { status: "esa pieza es de otra pestaña", pieceId: piece.id, pick: true };
    return checkSlot(piece, file, forced.image, forced.image ? null : forced.index, scope);
  }
  const parsed = parseSlotName(file.name);
  if (!parsed.ok && parsed.reason === "ambiguous") return { status: "hay más de una pieza en el nombre", pick: true };
  if (!parsed.ok && parsed.reason === "clips") return { status: "elegí el lugar", pick: true };
  if (!parsed.ok) return { status: "no encontré la pieza", pick: true };
  const piece = pieces.find((p) => p.id === parsed.pieceId);
  if (!piece) return { status: "no encontré la pieza", pick: true };
  const index = parsed.image || parsed.clip === null ? null : parsed.clip - 1;
  return checkSlot(piece, file, parsed.image, index, scope);
}

// Major brands that are a video. M4A, M4B, HEIC and AVIF are the same ftyp box and are not.
const VIDEO_BRAND = /^(isom|iso2|iso4|iso5|iso6|mp41|mp42|mp71|mp4v|avc1|dash|msnv|av01|3gp\d|3g2a|3ge6|3gg6)$/i;

// EBML + the "webm" doctype. A voice memo is this and has no video track.
export function webmContainer(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return false;
  const n = Math.min(bytes.length, 64);
  let head = "";
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]);
  return head.includes("webm");
}

// Matroska TrackType (0x83), one-byte value, 0x01 = video. Audio-only is 0x02 and does not count.
function webmHasVideo(bytes: Uint8Array): boolean {
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0x83 && bytes[i + 1] === 0x81 && bytes[i + 2] === 0x01) return true;
  }
  return false;
}

// mp4, webm, mov, png, jpeg or webp, from the bytes given. The piece route still checks the type it is sent.
// A WebM without a video track in these bytes is null; the uploader may still accept it when the file itself
// reports videoWidth > 0.
export function bulkMimeOf(bytes: Uint8Array): "video/mp4" | "video/webm" | "video/quicktime" | "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length < 12) return null;
  const box = ascii(4, 8);
  if (box === "ftyp") {
    const brand = ascii(8, 12);
    if (brand === "qt  ") return "video/quicktime";
    return VIDEO_BRAND.test(brand) ? "video/mp4" : null;
  }
  if (box === "moov" || box === "mdat" || box === "wide" || box === "free") return "video/quicktime";
  if (webmContainer(bytes)) return webmHasVideo(bytes) ? "video/webm" : null;
  return null;
}

export function bulkKindOf(bytes: Uint8Array): "video" | "image" | null {
  const mime = bulkMimeOf(bytes);
  if (!mime) return null;
  return mime.startsWith("image/") ? "image" : "video";
}
