// "Videos de la app funcionando", the browser side: one muted player per scene that plays its screen's recording,
// sought to the second frame t shows (shared/screenVideo.ts videoPlan) before the engine draws it. The frame itself
// stays a pure function of t: drawMotionFrame only reads the players, and every capture that must be exact (the render
// page, the in-browser render, the poster, the contact sheet, the storyboard) waits for each player's 'seeked' first
// (ready). The live preview lets the players run with the mix's clock and puts them back when they drift (follow).
import { cutPush, timeScenes, type MotionScript, type TimedScene } from "../../shared/motion.ts";
import { needsSeek, videoPlan, type VideoNeed } from "../../shared/screenVideo.ts";
import type { MotionAsset, MotionWorld, VideoFrames } from "./motion.ts";
import { isMetaphorAsset } from "../../shared/metaphor.ts";

// What the deck needs of a <video> (a test passes a fake one).
export type VideoLike = {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly readyState: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  playbackRate: number;
  muted: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  removeAttribute?(name: string): void;
  load?(): void;
};
export type VideoSource = { url: string; seconds: number };

// How long a seek or a load may take before the recording counts as unreadable.
export const SEEK_TIMEOUT_MS = 10000;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

function browserVideo(): VideoLike {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  return v;
}

// Waits for one of `ok` events (true) or `bad` events (false) on a player, or the timeout (false).
export function waitFor(el: VideoLike, ok: string[], bad: string[], ms = SEEK_TIMEOUT_MS): Promise<boolean> {
  return new Promise((done) => {
    const off = () => {
      for (const e of ok) el.removeEventListener(e, yes);
      for (const e of bad) el.removeEventListener(e, no);
      clearTimeout(timer);
    };
    const yes = () => {
      off();
      done(true);
    };
    const no = () => {
      off();
      done(false);
    };
    for (const e of ok) el.addEventListener(e, yes);
    for (const e of bad) el.addEventListener(e, no);
    const timer = setTimeout(no, ms);
  });
}

// The script's scenes as they play, worked out once per script.
const timedOf = new WeakMap<MotionScript, TimedScene[]>();
function timed(script: MotionScript): TimedScene[] {
  let t = timedOf.get(script);
  if (!t) timedOf.set(script, (t = timeScenes(script.scenes)));
  return t;
}

export class VideoDeck implements VideoFrames {
  private players = new Map<string, { el: VideoLike; asset: string }>();
  private broken = new Set<string>();
  private loads = new Map<string, Promise<boolean>>();

  constructor(
    readonly sources: Record<string, VideoSource>,
    private make: () => VideoLike = browserVideo,
    private timeoutMs = SEEK_TIMEOUT_MS,
  ) {}

  get empty(): boolean {
    return Object.keys(this.sources).length === 0;
  }

  // The scene's player when it has a frame to show (during a preview seek, the one it had; an exact capture waits for
  // the seek in ready() before it draws).
  frame(sceneId: string): CanvasImageSource | null {
    const p = this.players.get(sceneId);
    if (!p || this.broken.has(p.asset) || p.el.readyState < HAVE_CURRENT_DATA) return null;
    return p.el as unknown as CanvasImageSource;
  }

  failed(asset: string): boolean {
    return this.broken.has(asset);
  }

  // The recordings that could not be read so far.
  failures(): string[] {
    return [...this.broken];
  }

  // The scene's own player for `asset` (a new one when the scene now plays another screen).
  private player(sceneId: string, asset: string): VideoLike | null {
    const src = this.sources[asset];
    if (!src) return null;
    const had = this.players.get(sceneId);
    if (had && had.asset === asset) return had.el;
    if (had) this.release(had.el);
    const el = this.make();
    el.muted = true;
    el.src = src.url;
    this.players.set(sceneId, { el, asset });
    return el;
  }

  private release(el: VideoLike) {
    el.pause();
    el.removeAttribute?.("src");
    el.load?.();
  }

  private async loaded(el: VideoLike, asset: string): Promise<boolean> {
    if (el.readyState >= HAVE_METADATA) return true;
    const ok = await waitFor(el, ["loadedmetadata", "loadeddata"], ["error"], this.timeoutMs);
    if (!ok) this.broken.add(asset);
    return ok;
  }

  // Seeks one player to its second and waits until it is there with a frame. False: the recording failed.
  private async place(need: VideoNeed): Promise<boolean> {
    if (this.broken.has(need.asset)) return false;
    const el = this.player(need.sceneId, need.asset);
    if (!el) return false;
    if (!(await this.loaded(el, need.asset))) return false;
    if (!el.paused) el.pause();
    if (!needsSeek(el.currentTime, need.time, true) && el.readyState >= HAVE_CURRENT_DATA && !el.seeking) return true;
    const seeked = waitFor(el, ["seeked"], ["error"], this.timeoutMs);
    el.currentTime = need.time;
    const ok = await seeked;
    if (!ok) this.broken.add(need.asset);
    return ok;
  }

  // What frame t needs from the recordings.
  plan(script: MotionScript, t: number): VideoNeed[] {
    return videoPlan(timed(script), cutPush(script.tone), t, (asset) => this.sources[asset]?.seconds);
  }

  // Frame-accurate: every player frame t shows is sought to its second and has its frame before this resolves, so a
  // draw that awaits it shows exactly that frame. Players the frame does not need are paused.
  async ready(script: MotionScript, t: number): Promise<void> {
    const needs = this.plan(script, t);
    this.pauseOthers(needs);
    await Promise.all(needs.map((n) => this.place(n)));
  }

  // The live preview (no wait): while the mix plays, a moving recording plays at its rate and is put back only when it
  // drifts; held, or with the preview stopped, it is sought to its second and the next frame shows it.
  follow(script: MotionScript, t: number, playing: boolean) {
    const needs = this.plan(script, t);
    this.pauseOthers(needs);
    for (const n of needs) {
      if (this.broken.has(n.asset)) continue;
      const el = this.player(n.sceneId, n.asset);
      if (!el || el.readyState < HAVE_METADATA) {
        if (el && !this.loads.has(n.asset + n.sceneId)) {
          const key = n.asset + n.sceneId;
          this.loads.set(key, this.loaded(el, n.asset).finally(() => this.loads.delete(key)));
        }
        continue;
      }
      if (playing && n.moving) {
        if (el.playbackRate !== n.rate) el.playbackRate = n.rate;
        if (el.paused) {
          el.currentTime = n.time;
          void Promise.resolve(el.play()).catch(() => undefined);
        } else if (needsSeek(el.currentTime, n.time, false)) el.currentTime = n.time;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && needsSeek(el.currentTime, n.time, true)) el.currentTime = n.time;
      }
    }
  }

  private pauseOthers(needs: VideoNeed[]) {
    const used = new Set(needs.map((n) => n.sceneId));
    for (const [id, p] of this.players) if (!used.has(id) && !p.el.paused) p.el.pause();
  }

  // Loads each recording (or only those in `only`) once and says which cannot be read (a render stops on them).
  async check(only?: Iterable<string>): Promise<string[]> {
    const which = only ? [...only].filter((a) => this.sources[a]) : Object.keys(this.sources);
    await Promise.all(
      which.map(async (asset) => {
        const el = this.player(`check:${asset}`, asset);
        if (!el || !(await this.loaded(el, asset))) return;
        if (el.readyState < HAVE_CURRENT_DATA && !(await waitFor(el, ["loadeddata", "canplay"], ["error"], this.timeoutMs))) this.broken.add(asset);
        const p = this.players.get(`check:${asset}`);
        if (p) this.release(p.el);
        this.players.delete(`check:${asset}`);
      }),
    );
    return this.failures().filter((a) => which.includes(a));
  }

  // A deck of its own over the same recordings, for a capture that must not move the preview's players.
  fork(): VideoDeck {
    const deck = new VideoDeck(this.sources, this.make, this.timeoutMs);
    for (const a of this.broken) deck.broken.add(a);
    return deck;
  }

  dispose() {
    for (const p of this.players.values()) this.release(p.el);
    this.players.clear();
  }
}

// The recordings among a world's pictures.
export function videoSources(assets: Record<string, MotionAsset>): Record<string, VideoSource> {
  return Object.fromEntries(
    Object.entries(assets).flatMap(([id, a]) => (a.video ? [[id, { url: a.video.url, seconds: a.video.seconds }] as const] : [])),
  );
}

// Waits for frame t's recordings and code scene frames in this world (if it has any), then draws: the order every
// exact capture uses. `size`: the frame's size, so a code scene is asked in the right format (default: the deck's).
export async function drawReady(world: MotionWorld, script: MotionScript, t: number, draw: () => void, size?: { w: number; h: number }): Promise<void> {
  const deck = world.videos;
  const code = world.code;
  await Promise.all([deck instanceof VideoDeck && !deck.empty ? deck.ready(script, t) : undefined, code?.ready ? code.ready(script, t, world, size) : undefined]);
  draw();
}

// Runs a capture with its own players (a fork of the world's deck), disposed of afterwards.
export async function withOwnVideos<T>(world: MotionWorld, run: (world: MotionWorld) => Promise<T>): Promise<T> {
  const deck = world.videos instanceof VideoDeck && !world.videos.empty ? world.videos.fork() : null;
  try {
    return await run(deck ? { ...world, videos: deck } : world);
  } finally {
    deck?.dispose();
  }
}

// Only the newest request draws: a draw that finishes after a newer one started is dropped (scrubbing, thumbnails).
export function latestOnly() {
  let seq = 0;
  return async (prepare: () => Promise<void>, draw: () => void): Promise<boolean> => {
    const mine = ++seq;
    await prepare();
    if (mine !== seq) return false;
    draw();
    return true;
  };
}

// What a render says when a recording cannot be read in this browser, naming the screens.
export function unreadableVideos(assets: string[], series: { cast: { id: string; name: string }[] }): string {
  // "Escenas metáfora": a metaphor's clip lives in the scene, not in the series.
  const clips = assets.filter((a) => isMetaphorAsset(a));
  const screens = assets.filter((a) => !isMetaphorAsset(a));
  const parts: string[] = [];
  if (screens.length) {
    const names = screens.map((a) => `«${series.cast.find((m) => m.id === a)?.name ?? a}»`).join(", ");
    parts.push(`Este navegador no pudo leer el video de ${names}, así que el render se frena para no salir con la imagen fija. Volvé a subirlo como MP4 (H.264) o WebM en Editar serie, o renderizá con Google Chrome.`);
  }
  if (clips.length)
    parts.push(`Este navegador no pudo leer el clip de ${clips.length === 1 ? "una metáfora" : `${clips.length} metáforas`}, así que el render se frena. Volvé a subirlo como MP4 (H.264) o WebM en su escena, o sacalo y dejá la imagen.`);
  return parts.join(" ");
}
