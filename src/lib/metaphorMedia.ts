// "Escenas metáfora", the browser side: the picture and the clip Grok made for a metaphor scene, uploaded by the person
// into the project (slot METAPHOR_BASE + N, metafora-NN-imagen / metafora-NN-clip), turned into the asset the engine
// draws ("metafora:N"). A clip plays through the same per-scene players as the screens' recordings (VideoDeck), muted,
// from its start when the picture comes in, holding its last frame (METAPHOR_CLIP); the still stands in for it while a
// player has no frame (or, with no still, the clip's first frame).
import { METAPHOR_BASE, metaphorAsset, metaphorSlot } from "../../shared/metaphor.ts";
import { projectFileUrl, type MediaRecord } from "./api.ts";
import type { MotionAsset } from "./motion.ts";
import { loadImage } from "./motionProject.ts";
import { probeVideoUrl } from "./videoProbe.ts";

export type MetaphorClip = { url: string; seconds: number; width: number; height: number; poster: HTMLImageElement | null };

// The asset for a metaphor picture: its still, its clip, or both (the still is the clip's poster). Null: neither.
export function metaphorMotionAsset(id: string, still: HTMLImageElement | null, clip: MetaphorClip | null): MotionAsset | null {
  const base = still ?? clip?.poster ?? null;
  if (!base) return null;
  const asset: MotionAsset = { image: base, width: base.naturalWidth, height: base.naturalHeight, name: id };
  if (!clip) return asset;
  return { ...asset, video: { url: clip.url, seconds: clip.seconds, width: clip.width, height: clip.height, poster: base } };
}

// A clip at an address: its length, size and first frame (Grok's image-to-video starts on the picture).
export async function loadMetaphorClip(url: string): Promise<MetaphorClip> {
  const probed = await probeVideoUrl(url, 0);
  const poster = probed.poster ? await loadImage(URL.createObjectURL(probed.poster)) : null;
  return { url, seconds: probed.seconds, width: probed.width, height: probed.height, poster };
}

// What one metaphor slot holds: the still and the clip Grok made (either may be missing).
export type MetaphorParts = { still: HTMLImageElement | null; clip: MetaphorClip | null };

// Every metaphor picture the scenes use, from the project folder, by asset id. A file that cannot be read is left
// out (the scene shows its placeholder and the render stops: metaphorIssues).
export async function loadMetaphorParts(projectId: string, scenes: readonly { asset: string }[], media: Record<string, MediaRecord>): Promise<Record<string, MetaphorParts>> {
  const slots = [...new Set(scenes.map((s) => metaphorSlot(s.asset)).filter((n): n is number => n !== null))];
  const out: Record<string, MetaphorParts> = {};
  await Promise.all(
    slots.map(async (n) => {
      const rec = media[METAPHOR_BASE + n];
      if (!rec) return;
      const still = rec.image ? await loadImage(projectFileUrl(projectId, rec.image)) : null;
      const clip = rec.clip ? await loadMetaphorClip(projectFileUrl(projectId, rec.clip.file)).catch(() => null) : null;
      if (still || clip) out[metaphorAsset(n)] = { still, clip };
    }),
  );
  return out;
}

// The parts as the engine's assets.
export function metaphorAssets(parts: Record<string, MetaphorParts>): Record<string, MotionAsset> {
  return Object.fromEntries(
    Object.entries(parts).flatMap(([id, p]) => {
      const asset = metaphorMotionAsset(id, p.still, p.clip);
      return asset ? [[id, asset] as const] : [];
    }),
  );
}

export async function loadMetaphorAssets(projectId: string, scenes: readonly { asset: string }[], media: Record<string, MediaRecord>): Promise<Record<string, MotionAsset>> {
  return metaphorAssets(await loadMetaphorParts(projectId, scenes, media));
}
