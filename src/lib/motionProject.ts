// What the explainer studio and the render page (render.mjs) share: loading a piece's images, voices and track,
// the beat grid, the scenes on it, the world the engine draws with, and the sound. Both build frame t and the mix
// the same way, so the final render matches the preview.
import { TYPE_CPS, elementTimes, sceneElements, snapScenes, timeScenes, type MotionPiece, type MotionScene, type MotionScript } from "../../shared/motion.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { Brand } from "../../shared/series.ts";
import { libraryFileUrl, projectFileUrl, type MediaFileRecord, type MediaRecord } from "./api.ts";
import { beatGrid, drawMotionFrame, scriptDuration, type MotionAsset, type MotionWorld } from "./motion.ts";
import { buildSound, nearBeat, type HitKind, type SoundPlan } from "./motionAudio.ts";
import { findBeats } from "./render.ts";

export const VOICE_BASE = 100;
export const LAYER_BASE = 200;
export const SHEET_BASE = 300;
// The thumbnail of the last render, per format: 302 (9:16) and 303 (16:9).
export const POSTER_BASE = 302;
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

// The bundled public-domain effects (public/sfx, CC0; see CREDITOS.md there), loaded once.
const SFX_FILES: Record<HitKind, string[]> = {
  whoosh: ["desliza"],
  pop: ["cae-1", "cae-2"],
  reveal: ["golpe-suave"],
  logo: ["campana"],
  tap: ["toque"],
  key: Array.from({ length: 12 }, (_, i) => `tecla-${String(i + 1).padStart(2, "0")}`),
};
let sfx: Promise<Partial<Record<HitKind, AudioBuffer[]>>> | null = null;
export function loadSfx(): Promise<Partial<Record<HitKind, AudioBuffer[]>>> {
  sfx ??= Promise.all(
    (Object.entries(SFX_FILES) as [HitKind, string[]][]).map(async ([kind, names]) => {
      const buffers = await Promise.all(
        names.map((n) =>
          fetch(`/sfx/${n}.wav`)
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(n))))
            .then(decodeAudio)
            .catch(() => null),
        ),
      );
      return [kind, buffers.filter((b): b is AudioBuffer => Boolean(b))] as const;
    }),
  ).then((list) => Object.fromEntries(list));
  return sfx;
}

// Where the effects go. Each lands as its motion starts (a hair before), and on a beat only when one is within
// 0.06 s. In a sequence (labels, steps) only the first and the last arrival sound. Typing sounds per key.
export function soundHits(snapped: MotionScript, beats: number[]): SoundPlan["hits"] {
  const hits: SoundPlan["hits"] = [];
  const hit = (t: number, kind: HitKind, n?: number) => hits.push({ at: Math.max(0, nearBeat(t, beats) - 0.02), kind, n });
  for (const s of timeScenes(snapped.scenes)) {
    if (s.index > 0) hits.push({ at: s.start, kind: "whoosh" });
    const T = elementTimes(s);
    const has = (key: string) => key in T;
    const within = (r: number) => r < s.seconds - 0.05;
    switch (s.template) {
      case "callouts":
      case "steps": {
        const items = sceneElements(s)
          .filter((e) => e.lane === "items" && within(e.at))
          .sort((a, b) => a.at - b.at);
        if (items.length) hit(s.start + items[0].at, "pop");
        if (items.length > 1) hit(s.start + items[items.length - 1].at, "pop", 1);
        break;
      }
      case "product":
        hit(s.start + Math.max(0.05, T.media ?? 0), "reveal");
        if (has("tag") && within(T.tag)) hit(s.start + T.tag, "pop");
        break;
      case "logo":
        hit(s.start + Math.max(0.05, T.media ?? 0), "logo");
        if (has("tag") && within(T.tag)) hit(s.start + T.tag, "pop", 1);
        break;
      case "zoom":
        if (within(T.ring + 0.5)) hit(s.start + T.ring + 0.5, "tap");
        break;
      case "stat":
        if (has("title") && within(T.title + 1.2)) hit(s.start + T.title + 1.2, "pop");
        break;
      case "type": {
        if (has("title")) {
          [...s.title].forEach((ch, i) => {
            const t = T.title + i / TYPE_CPS;
            if (ch.trim() && within(t) && i < 60) hits.push({ at: s.start + t, kind: "key", n: i * 7 + s.index });
          });
        }
        if (has("tag") && within(T.tag + 0.25)) hit(s.start + T.tag + 0.25, "tap");
        if (has("text") && within(T.text)) hit(s.start + T.text, "pop");
        break;
      }
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

// The plan of the sound: voices at their scenes, effects where things happen.
export function soundPlan(
  snapped: MotionScript,
  piece: MotionPiece,
  beats: number[],
  voices: Record<string, { blob: Blob }>,
  track: AudioBuffer | null,
): { plan: Omit<SoundPlan, "voices" | "samples">; voiceBlobs: { at: number; blob: Blob }[] } {
  const timed = timeScenes(snapped.scenes);
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
      hits: soundHits(snapped, beats),
      effects: piece.effects ?? "library",
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
  const samples = made.plan.effects === "library" ? await loadSfx() : undefined;
  return buildSound({ ...made.plan, voices: decoded, samples });
}

// The thumbnail as a JPEG, full size: the frame at `t`.
export function posterJpeg(w: number, h: number, t: number, script: MotionScript, world: MotionWorld): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  drawMotionFrame(canvas.getContext("2d")!, w, h, t, script, world);
  return new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.92));
}
