// What the explainer studio and the render page (render.mjs) share: loading a piece's images, voices and track,
// the beat grid, the scenes on it, the world the engine draws with, and the sound. Both build frame t and the mix
// the same way, so the final render matches the preview.
import { TYPE_CPS, cutPush, elementTimes, sceneElements, snapElements, snapScenes, timeScenes, type MotionPiece, type MotionScene, type MotionScript } from "../../shared/motion.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { Brand } from "../../shared/series.ts";
import { libraryFileUrl, projectFileUrl, type MediaFileRecord, type MediaRecord } from "./api.ts";
import { buildPuppet, singlePuppet, type PuppetAsset } from "./puppet.ts";
import { loadActor, type ActorAsset } from "./actor.ts";
import { beatGrid, drawMotionFrame, scriptDuration, type MotionAsset, type MotionWorld } from "./motion.ts";
import { buildSound, type HitKind, type SoundPlan } from "./motionAudio.ts";
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
// The series' approved images by cast id, its logo, and its characters as puppets (their parts, or their image as
// one piece).
export async function loadSeriesImages(
  series: SeriesInfo,
): Promise<{ cast: Record<string, MotionAsset>; logo: MotionAsset | null; puppets: Record<string, PuppetAsset>; actors: Record<string, ActorAsset> }> {
  const list = await Promise.all(
    series.cast.filter((m) => m.image).map(async (m) => [m, await loadImage(libraryFileUrl(series.id, m.image))] as const),
  );
  const logoImg = series.brand.logo ? await loadImage(libraryFileUrl(series.id, series.brand.logo)) : null;
  const cast = Object.fromEntries(
    list.filter(([, img]) => img).map(([m, img]) => [m.id, { ...asAsset(img!, m.id), screen: m.kind === "screen" }]),
  );
  const puppets: Record<string, PuppetAsset> = {};
  for (const m of series.cast.filter((x) => x.kind === "character")) {
    const layers = m.puppet?.layers ?? [];
    if (layers.length) {
      const imgs = await Promise.all(layers.map((l) => loadImage(libraryFileUrl(series.id, l.file))));
      const built = buildPuppet(m.puppet, imgs);
      if (built) puppets[m.id] = built;
    } else {
      const img = list.find(([x]) => x.id === m.id)?.[1];
      if (img) puppets[m.id] = singlePuppet(img);
    }
  }
  const actors: Record<string, ActorAsset> = {};
  for (const m of series.cast.filter((x) => x.kind === "character" && x.rig?.file)) {
    const actor = await loadActor(libraryFileUrl(series.id, m.rig.file), m.rig);
    if (actor) actors[m.id] = actor;
  }
  return { cast, logo: logoImg ? asAsset(logoImg, "logo") : null, puppets, actors };
}

// How loud the voices are along the piece (60 values a second, 0..1), for the characters' mouths.
export async function speechLevels(
  snapped: MotionScript,
  piece: MotionPiece,
  voices: Record<string, { blob: Blob }>,
): Promise<{ rate: number; data: Float32Array; scenes: string[] } | undefined> {
  if (piece.voice === "none") return undefined;
  const timed = timeScenes(snapped.scenes).filter((s) => voices[s.id]);
  if (!timed.length) return undefined;
  const rate = 60;
  const data = new Float32Array(Math.ceil(scriptDuration(snapped) * rate) + 1);
  for (const s of timed) {
    const buffer = await decodeAudio(voices[s.id].blob).catch(() => null);
    if (!buffer) continue;
    const ch = buffer.getChannelData(0);
    const step = buffer.sampleRate / rate;
    const start = Math.floor((s.start + (elementTimes(s).voice ?? 0.25)) * rate);
    // The mouth stops on the cut, where the mix fades a voice that runs past its scene.
    const stop = Math.min(data.length, Math.ceil(s.end * rate));
    for (let i = 0; start + i < stop && i * step < ch.length; i++) {
      let sum = 0;
      const from = Math.floor(i * step);
      const to = Math.min(ch.length, Math.floor((i + 1) * step));
      for (let j = from; j < to; j++) sum += ch[j] * ch[j];
      data[start + i] = Math.max(data[start + i], Math.sqrt(sum / Math.max(1, to - from)));
    }
  }
  const sorted = [...data].filter((v) => v > 0.001).sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.95)] || 1;
  for (let i = 0; i < data.length; i++) data[i] = Math.min(1, data[i] / top);
  return { rate, data, scenes: timed.map((s) => s.id) };
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

// The strongest hits, where the big moments (the product, the logo) go: the synthesized score's bar starts (every
// fourth beat), or the person's track's beats with the hardest low end (its top fifth). Pure: the same track gives the
// same list in the studio and in the render.
export function strongBeats(beats: number[], music: MotionPiece["music"], track: AudioBuffer | null): number[] {
  if (music === "none" || beats.length < 2) return [];
  if (music !== "track" || !track) return beats.filter((_, i) => i % 4 === 0);
  const low = lowEnergy(track);
  const hop = LOW_HOP / track.sampleRate;
  const at = (t: number) => low[Math.min(low.length - 1, Math.max(0, Math.round(t / hop)))] ?? 0;
  // Low-end energy just after the beat against just before it: a kick or a bass hit, not a bright tick.
  const strength = beats.map((t) => {
    let after = 0;
    let before = 0;
    for (let k = 0; k < 4; k++) {
      after += at(t + k * hop);
      before += at(t - (k + 1) * hop);
    }
    return after - before;
  });
  const sorted = [...strength].sort((a, b) => b - a);
  const bar = sorted[Math.max(0, Math.floor(sorted.length / 5) - 1)];
  return beats.filter((_, i) => strength[i] >= bar && strength[i] > 0);
}

// The track's energy under ~150 Hz in hops of LOW_HOP samples (channel 0, one-pole low-pass), kept per track.
const LOW_HOP = 512;
const lows = new WeakMap<AudioBuffer, Float32Array>();
function lowEnergy(track: AudioBuffer): Float32Array {
  const known = lows.get(track);
  if (known) return known;
  const data = track.getChannelData(0);
  const a = 1 - Math.exp((-2 * Math.PI * 150) / track.sampleRate);
  const out = new Float32Array(Math.floor(data.length / LOW_HOP));
  let y = 0;
  for (let h = 0; h < out.length; h++) {
    let sum = 0;
    for (let j = h * LOW_HOP; j < (h + 1) * LOW_HOP; j++) {
      y += a * (data[j] - y);
      sum += y * y;
    }
    out[h] = Math.sqrt(sum / LOW_HOP);
  }
  lows.set(track, out);
  return out;
}

// The scenes as they play: snapped onto the beats unless the person turned that off, with the cuts into the product
// and the logo on the strongest hits, and each element's template time on a beat when one is within 0.1 s. This is
// the one place timing moves to the grid: the drawing, the sound and the checks all read what it returns.
export function arrangeScenes(
  script: MotionScript | null,
  beats: number[],
  snap: boolean,
  music: MotionPiece["music"] = "synth",
  track: AudioBuffer | null = null,
): MotionScene[] {
  if (!script) return [];
  if (!snap) return script.scenes;
  return snapElements(snapScenes(script.scenes, beats, strongBeats(beats, music, track), cutPush(script.tone)), beats);
}

// The music bed's level by tone: lower under a dry piece, a touch higher in an absurd one.
export const TONE_BED = { dry: 0.6, warm: 1, absurdist: 1.1 } as const;

export function layerAssets(layers: HTMLImageElement[]): Record<string, MotionAsset> {
  return Object.fromEntries(layers.map((img, k) => [`layer:${k}`, asAsset(img, `layer:${k}`)]));
}

// Some picture on screen was made by an AI: an uploaded layer or a cast member that is not a real screenshot.
export function usesAiImages(scenes: MotionScene[], series: SeriesInfo): boolean {
  return scenes.some((s) => [s.asset, s.assetB].some((a) => a.startsWith("layer:") || series.cast.find((m) => m.id === a && m.kind !== "screen")));
}

export function makeWorld(
  brand: Brand,
  assets: Record<string, MotionAsset>,
  logo: MotionAsset | null,
  beats: number[],
  notice: boolean,
  extra: Pick<MotionWorld, "puppets" | "speech" | "actors"> = {},
): MotionWorld {
  return { brand, assets, logo, beats, seed: MOTION_SEED, disclosure: notice ? AI_NOTICE : "", ...extra };
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

// Where the effects go. Each lands exactly as its motion starts: the element's time is already on the beat when it
// was near one (arrangeScenes), so the sound never moves on its own and image and sound stay together. In a sequence
// (labels, steps) only the first and the last arrival sound. Typing sounds per key.
export function soundHits(snapped: MotionScript): SoundPlan["hits"] {
  const hits: SoundPlan["hits"] = [];
  // Dry: only the big moments sound (the product, the logo, a tap or key that is the action itself); no whoosh.
  const dry = snapped.tone === "dry";
  const hit = (t: number, kind: HitKind, n?: number) => {
    if (dry && (kind === "pop" || kind === "whoosh")) return;
    hits.push({ at: Math.max(0, t), kind, n });
  };
  for (const s of timeScenes(snapped.scenes)) {
    if (s.index > 0) hit(s.start, "whoosh");
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
      case "character": {
        if (has("prop") && within(T.prop)) hit(s.start + T.prop, "reveal");
        const g = s.gesture ?? "present";
        if ((g === "cheer" || g === "surprise") && within(T.gesture)) hit(s.start + T.gesture, "pop");
        break;
      }
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
  voices: Record<string, { blob: Blob }>,
  track: AudioBuffer | null,
): { plan: Omit<SoundPlan, "voices" | "samples">; voiceBlobs: { at: number; until: number; blob: Blob }[] } {
  const timed = timeScenes(snapped.scenes);
  const voiceBlobs =
    piece.voice === "none"
      ? []
      : timed.flatMap((s) => (voices[s.id] ? [{ at: s.start + (elementTimes(s).voice ?? 0.25), until: s.end, blob: voices[s.id].blob }] : []));
  return {
    plan: {
      duration: scriptDuration(snapped),
      music: piece.music === "track" && !track ? "none" : piece.music,
      mood: snapped.music.mood,
      bpm: snapped.music.bpm,
      track,
      hits: soundHits(snapped),
      effects: piece.effects ?? "library",
      bed: TONE_BED[snapped.tone ?? "warm"],
    },
    voiceBlobs,
  };
}

export async function motionSound(
  snapped: MotionScript,
  piece: MotionPiece,
  voices: Record<string, { blob: Blob }>,
  track: AudioBuffer | null,
): Promise<{ buffer: AudioBuffer; lufs: number }> {
  const made = soundPlan(snapped, piece, voices, track);
  const decoded = await Promise.all(made.voiceBlobs.map(async (v) => ({ at: v.at, until: v.until, buffer: await decodeAudio(v.blob) })));
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
