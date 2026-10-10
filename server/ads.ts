// Publicidad: one folder per series on this computer, publicidad/<series>/. campana.json holds the offer profile, the
// catalogue (hooks, meats, CTAs), the analysed clips, the imported metrics and the batches. clips/ keeps the uploaded
// previous ads, media/ each piece's clip or image, piezas/ each piece's render (the cache the ads are cut from) and
// anuncios/<tanda>/ the finished ads with their CSV.
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AdsStateSchema, OfferSchema, RENDER_VERSION, emptyAds, offerFilled, type AdsState, type Offer } from "../shared/ads.ts";
import { checkErrorText } from "../shared/errors.ts";

export const ADS_DIR = resolve(process.env.ADS_DIR || "publicidad");

const ID = /^[a-z0-9-]{1,40}$/;
const PIECE = /^[HMC]\d{1,4}$/;
const BATCH = /^[a-z0-9-]{1,60}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MAX_STATE = 16 * 1024 * 1024;

export class AdsError extends Error {}

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  weba: "audio/webm",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
};
const IMAGE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const VIDEO: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const AUDIO: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "weba",
  "video/webm": "weba",
};

function folder(series: string): string {
  if (!ID.test(series)) throw new AdsError("Esa serie no existe.");
  return join(ADS_DIR, series);
}

const locks = new Map<string, Promise<unknown>>();
function locked<T>(series: string, work: () => Promise<T>): Promise<T> {
  const run = (locks.get(series) ?? Promise.resolve()).catch(() => undefined).then(work);
  locks.set(series, run);
  return run;
}

// Older files get the fields they lack, so the schema always parses.
function fill(raw: unknown, series: string): AdsState {
  const base = emptyAds(series);
  const merged = { ...base, ...(raw && typeof raw === "object" ? (raw as object) : {}), version: 1, series };
  const parsed = AdsStateSchema.safeParse(merged);
  if (!parsed.success) throw new AdsError(checkErrorText(parsed.error, "El archivo de Publicidad de la serie está dañado"));
  return parsed.data as AdsState;
}

export async function loadAds(series: string): Promise<AdsState> {
  const dir = folder(series);
  try {
    const text = await readFile(join(dir, "campana.json"), "utf8");
    const state = fill(JSON.parse(text), series);
    offers.set(series, state.offer);
    return state;
  } catch (error) {
    if (error instanceof AdsError) throw error;
    return emptyAds(series);
  }
}

// The offer profile, read synchronously for the Playbook writer (it reads the same profile, so both sound alike).
// Null when the series has none or it is not filled in.
const offers = new Map<string, Offer>();
export function offerOf(series: string): Offer | null {
  if (!ID.test(series)) return null;
  if (!offers.has(series)) {
    try {
      const raw = JSON.parse(readFileSync(join(ADS_DIR, series, "campana.json"), "utf8")) as { offer?: unknown };
      const parsed = OfferSchema.safeParse(raw.offer);
      offers.set(series, parsed.success ? parsed.data : emptyAds(series).offer);
    } catch {
      offers.set(series, emptyAds(series).offer);
    }
  }
  const offer = offers.get(series)!;
  return offerFilled(offer) ? offer : null;
}

async function write(series: string, state: AdsState) {
  const dir = folder(series);
  await mkdir(dir, { recursive: true });
  const text = JSON.stringify(state, null, 2);
  if (text.length > MAX_STATE) throw new AdsError("El archivo de Publicidad quedó demasiado grande.");
  const tmp = join(dir, ".campana.json.tmp");
  await writeFile(tmp, text, "utf8");
  await rename(tmp, join(dir, "campana.json"));
  offers.set(series, state.offer);
}

// Reads, changes and writes under a lock, so two requests never overwrite each other.
export function updateAds<T = void>(series: string, change: (state: AdsState) => T | Promise<T>): Promise<{ state: AdsState; result: T }> {
  return locked(series, async () => {
    const state = await loadAds(series);
    const result = await change(state);
    await write(series, state);
    return { state, result };
  });
}

function ext(type: string, table: Record<string, string>, what: string): string {
  const e = table[type.split(";")[0].trim()];
  if (!e) throw new AdsError(`Ese archivo no es ${what}.`);
  return e;
}

async function put(dir: string, name: string, data: Buffer) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), data);
}

// A previous ad, kept to be transcribed and catalogued.
export async function saveClipFile(series: string, id: string, data: Buffer, type: string): Promise<string> {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new AdsError("Id de clip inválido.");
  const name = `${id}.${ext(type, { ...VIDEO, ...AUDIO }, "un video ni un audio")}`;
  await put(join(folder(series), "clips"), name, data);
  return `clips/${name}`;
}

// A piece's own clip, image or voice.
export async function savePieceMedia(series: string, pieceId: string, kind: "image" | "clip" | "voice", data: Buffer, type: string): Promise<string> {
  if (!PIECE.test(pieceId)) throw new AdsError("Esa pieza no existe.");
  const table = kind === "image" ? IMAGE : kind === "clip" ? VIDEO : AUDIO;
  const name = `${pieceId}-${kind}.${ext(type, table, kind === "image" ? "una imagen" : kind === "clip" ? "un video" : "un audio")}`;
  const dir = join(folder(series), "media");
  await mkdir(dir, { recursive: true });
  // One file per piece and kind: an older one with another extension goes.
  for (const old of await readdir(dir).catch(() => [])) {
    if (old.startsWith(`${pieceId}-${kind}.`) && old !== name) await rm(join(dir, old), { force: true });
  }
  await writeFile(join(dir, name), data);
  return `media/${name}`;
}

export async function removePieceMedia(series: string, file: string) {
  const { path } = resolveFile(series, file);
  await rm(path, { force: true });
}

// A piece's render (the cache).
export async function savePieceRender(series: string, pieceId: string, data: Buffer, type: string): Promise<string> {
  if (!PIECE.test(pieceId)) throw new AdsError("Esa pieza no existe.");
  const name = `${pieceId}.${RENDER_VERSION}.${ext(type, VIDEO, "un video")}`;
  await put(join(folder(series), "piezas"), name, data);
  return `piezas/${name}`;
}

export async function saveAdFile(series: string, batch: string, adId: string, data: Buffer, type: string): Promise<string> {
  if (!BATCH.test(batch)) throw new AdsError("Esa tanda no existe.");
  if (!/^H\d{1,4}-M\d{1,4}-C\d{1,4}$/.test(adId)) throw new AdsError("Ese anuncio no existe.");
  const name = `${adId}.${ext(type, VIDEO, "un video")}`;
  await put(join(folder(series), "anuncios", batch), name, data);
  return `anuncios/${batch}/${name}`;
}

export async function saveBatchCsv(series: string, batch: string, csv: string): Promise<string> {
  if (!BATCH.test(batch)) throw new AdsError("Esa tanda no existe.");
  // A BOM so spreadsheets open the accents right.
  await put(join(folder(series), "anuncios", batch), "anuncios.csv", Buffer.from(`﻿${csv}`, "utf8"));
  return `anuncios/${batch}/anuncios.csv`;
}

export async function removeBatchFolder(series: string, batch: string) {
  if (!BATCH.test(batch)) throw new AdsError("Esa tanda no existe.");
  await rm(join(folder(series), "anuncios", batch), { recursive: true, force: true });
}

// Files live in known subfolders only: clips/x, media/x, piezas/x, anuncios/<batch>/x.
function resolveFile(series: string, file: string): { path: string; type: string } {
  const parts = file.split("/");
  const ok =
    (parts.length === 2 && ["clips", "media", "piezas"].includes(parts[0]) && FILE.test(parts[1])) ||
    (parts.length === 3 && parts[0] === "anuncios" && BATCH.test(parts[1]) && FILE.test(parts[2]));
  if (!ok) throw new AdsError("Ese archivo no existe.");
  const e = parts[parts.length - 1].split(".").pop()?.toLowerCase() ?? "";
  return { path: join(folder(series), ...parts), type: TYPES[e] ?? "application/octet-stream" };
}

export async function readAdsFile(series: string, file: string): Promise<{ data: Buffer; type: string }> {
  const { path, type } = resolveFile(series, file);
  try {
    return { data: await readFile(path), type };
  } catch {
    throw new AdsError("Ese archivo no existe.");
  }
}

export function adsFolder(series: string): string {
  return folder(series);
}

// ── Transcription ────────────────────────────────────────────────────────────────
// OpenAI's transcription API (whisper-1, the same OPENAI_API_KEY as the lyric sync) returns the text with timed
// segments; the writer gets both, so it can tell where the hook ends. The person can paste a transcript instead.
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const MAX_BYTES = 25 * 1024 * 1024;

export const transcriptionAvailable = () => Boolean(process.env.OPENAI_API_KEY);

export type Transcript = { text: string; segments: { start: number; end: number; text: string }[]; duration: number };

export async function transcribeClip(data: Buffer, name: string, type: string, language: "es" | "en"): Promise<Transcript> {
  if (!transcriptionAvailable()) throw new AdsError("Para transcribir falta OPENAI_API_KEY en Modelos. Podés pegar la transcripción a mano.");
  if (data.length > MAX_BYTES) throw new AdsError("El clip pesa más de 25 MB. Comprimilo o pegá la transcripción a mano.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: type || "video/mp4" }), name || "clip.mp4");
  form.append("model", MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("language", language);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (error) {
    throw new AdsError(`No se pudo conectar con OpenAI: ${(error as Error).message}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new AdsError(`No se pudo transcribir el clip (${res.status}): ${body.error?.message ?? res.statusText}`);
  }
  const json = (await res.json()) as { text?: string; duration?: number; segments?: { start: number; end: number; text: string }[] };
  const segments = (json.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  const text = (json.text ?? segments.map((s) => s.text).join(" ")).trim();
  if (!text) throw new AdsError("La transcripción vino vacía: el clip no tiene voz que se entienda.");
  return { text, segments, duration: json.duration ?? segments.at(-1)?.end ?? 0 };
}

export function transcriptText(t: Transcript): string {
  if (!t.segments.length) return t.text;
  return t.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)} s] ${s.text}`).join("\n");
}
