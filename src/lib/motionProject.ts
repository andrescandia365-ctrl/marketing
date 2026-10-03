// What the explainer studio and the render page (render.mjs) share: loading a piece's images, voices and track,
// the beat grid, the scenes on it, the world the engine draws with, and the sound. Both build frame t and the mix
// the same way, so the final render matches the preview.
import { elementTimes, revealTimes, snapScenes, timeScenes, type MotionPiece, type MotionScene, type MotionScript } from "../../shared/motion.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { Brand } from "../../shared/series.ts";
import { libraryFileUrl, projectFileUrl, type MediaFileRecord, type MediaRecord } from "./api.ts";
import { beatGrid, scriptDuration, type MotionAsset, type MotionWorld } from "./motion.ts";
import { buildSound, onGrid, type SoundPlan } from "./motionAudio.ts";
import { findBeats } from "./render.ts";

export const VOICE_BASE = 100;
export const LAYER_BASE = 200;
export const SHEET_BASE = 300;
export const MOTION_SEED = 20261003;
export const AI_NOTICE = "Algunas imágenes están hechas con IA";

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export const asAsset = (img: HTMLImageElement, name: string): MotionAsset => ({ image: img, width: img.naturalWidth, height: img.naturalHeight, name });

export function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  return blob.arrayBuffer().then((b) => new OfflineAudioContext(2, 1, 48000).decodeAudioData(b));
}

// The series' approved images by cast id, and its logo.
export async function loadSeriesImages(series: SeriesInfo): Promise<{ cast: Record<string, MotionAsset>; logo: MotionAsset | null }> {
  const list = await Promise.all(
    series.cast.filter((m) => m.image).map(async (m) => [m.id, await loadImage(libraryFileUrl(series.id, m.image))] as const),
  );
  const logoImg = series.brand.logo ? await loadImage(libraryFileUrl(series.id, series.brand.logo)) : null;
  return {
    cast: Object.fromEntries(list.filter(([, img]) => img).map(([id, img]) => [id, asAsset(img!, id)])),
    logo: logoImg ? asAsset(logoImg, "logo") : null,
  };
}

export type LoadedVoice = { blob: Blob; name: string; duration: number };

// A saved piece's voices (by scene id), layers and track, from the project folder.
export async function loadPieceMedia(
  projectId: string,
  piece: MotionPiece,
  media: Record<string, MediaRecord>,
  music: MediaFileRecord | null,
): Promise<{ voices: Record<string, LoadedVoice>; layers: HTMLImageElement[]; track: { blob: Blob; name: string; duration: number; buffer: AudioBuffer } | null }> {
  const fetchBlob = (file: string) => fetch(projectFileUrl(projectId, file)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(file))));
  const voices: Record<string, LoadedVoice> = {};
  await Promise.all(
    Object.entries(piece.voiceSlots ?? {}).map(async ([sceneId, slot]) => {
      const rec = media[VOICE_BASE + slot]?.voice;
      if (!rec) return;
      const blob = await fetchBlob(rec.file).catch(() => null);
      if (blob) voices[sceneId] = { blob, name: rec.name, duration: rec.duration };
    }),
  );
  const layers = (
    await Promise.all(
      Array.from({ length: piece.layers ?? 0 }, (_, k) => {
        const file = media[LAYER_BASE + k]?.image;
        return file ? loadImage(projectFileUrl(projectId, file)) : Promise.resolve(null);
      }),
    )
  ).filter((x): x is HTMLImageElement => Boolean(x));
  let track = null;
  if (music) {
    const blob = await fetchBlob(music.file).catch(() => null);
    if (blob) track = { blob, name: music.name, duration: music.duration, buffer: await decodeAudio(blob) };
  }
  return { voices, layers, track };
}

// The beat grid: the synthesized score's, or the track's measured beats; none without music.
export function motionBeats(script: MotionScript | null, music: MotionPiece["music"], track: AudioBuffer | null): number[] {
  if (!script) return [];
  if (music === "track" && track) return findBeats(track);
  if (music === "none") return [];
  return beatGrid(scriptDuration(script) + 2, script.music.bpm);
}

// The scenes as they play: snapped onto the beats unless the person turned that off.
export function arrangeScenes(script: MotionScript | null, beats: number[], snap: boolean): MotionScene[] {
  if (!script) return [];
  return snap ? snapScenes(script.scenes, beats) : script.scenes;
}

export function layerAssets(layers: HTMLImageElement[]): Record<string, MotionAsset> {
  return Object.fromEntries(layers.map((img, k) => [`layer:${k}`, asAsset(img, `layer:${k}`)]));
}

// Some picture on screen was made by an AI: an uploaded layer or a cast member that is not a real screenshot.
export function usesAiImages(scenes: MotionScene[], series: SeriesInfo): boolean {
  return scenes.some((s) => [s.asset, s.assetB].some((a) => a.startsWith("layer:") || series.cast.find((m) => m.id === a && m.kind !== "screen")));
}

export function makeWorld(brand: Brand, assets: Record<string, MotionAsset>, logo: MotionAsset | null, beats: number[], notice: boolean): MotionWorld {
  return { brand, assets, logo, beats, seed: MOTION_SEED, disclosure: notice ? AI_NOTICE : "" };
}

// The plan of the sound: voices at their scenes, whooshes on the cuts and pops on new elements, on the grid.
export function soundPlan(
  snapped: MotionScript,
  piece: MotionPiece,
  beats: number[],
  voices: Record<string, { blob: Blob }>,
  track: AudioBuffer | null,
): { plan: Omit<SoundPlan, "voices">; voiceBlobs: { at: number; blob: Blob }[] } {
  const timed = timeScenes(snapped.scenes);
  const hits: SoundPlan["hits"] = [];
  for (const s of timed) {
    if (s.index > 0) hits.push({ at: s.start, kind: "whoosh" });
    revealTimes(s)
      .filter((r) => r > 0.05 && r < s.seconds && ["callouts", "steps", "product", "logo"].includes(s.template))
      .forEach((r) => hits.push({ at: onGrid(s.start + r, beats), kind: "pop" }));
  }
  const voiceBlobs =
    piece.voice === "none"
      ? []
      : timed.flatMap((s) => (voices[s.id] ? [{ at: s.start + (elementTimes(s).voice ?? 0.25), blob: voices[s.id].blob }] : []));
  return {
    plan: {
      duration: scriptDuration(snapped),
      music: piece.music === "track" && !track ? "none" : piece.music,
      mood: snapped.music.mood,
      bpm: snapped.music.bpm,
      track,
      hits,
    },
    voiceBlobs,
  };
}

export async function motionSound(
  snapped: MotionScript,
  piece: MotionPiece,
  beats: number[],
  voices: Record<string, { blob: Blob }>,
  track: AudioBuffer | null,
): Promise<{ buffer: AudioBuffer; lufs: number }> {
  const made = soundPlan(snapped, piece, beats, voices, track);
  const decoded = await Promise.all(made.voiceBlobs.map(async (v) => ({ at: v.at, buffer: await decodeAudio(v.blob) })));
  return buildSound({ ...made.plan, voices: decoded });
}
