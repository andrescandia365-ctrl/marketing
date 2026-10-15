// "Videos de la app funcionando": a real screen's recording plays inside the device frame of an explainer scene. The
// time mapping (scene time → second of the recording, with in/out, speed, hold or loop), which scenes a frame needs,
// the type read from the bytes, the writer's clip words, and the order every exact capture keeps: each player is
// sought to its second and has its frame before the frame is drawn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankScene, cutPush, elementTimes, normalizeMotion, timeScenes, type MotionScene, type MotionScript } from "../shared/motion.ts";
import {
  HOLD_BACK,
  clipMoving,
  clipSeconds,
  clipText,
  clipTime,
  drawnAt,
  needsSeek,
  pickClip,
  settleClips,
  videoAssetOf,
  videoPlan,
  videoTypeOf,
} from "../shared/screenVideo.ts";
import { DEFAULT_BRAND, CastMemberSchema } from "../shared/series.ts";
import { VIDEO_FAILED_NOTE, assetOf, drawMotionFrame, type MotionWorld } from "../src/lib/motion.ts";
import { VideoDeck, drawReady, latestOnly, type VideoLike } from "../src/lib/screenVideo.ts";
import { mergeNote } from "../shared/motionNote.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const near = (a: number, b: number, by = 1e-6) => Math.abs(a - b) <= by;

test("the type comes from the bytes: MP4, MOV (QuickTime brand or an old moov box) and WebM; nothing else", () => {
  const box = (type: string, brand = "") => new Uint8Array([0, 0, 0, 24, ...[...type].map((c) => c.charCodeAt(0)), ...[...brand.padEnd(8, " ")].map((c) => c.charCodeAt(0))]);
  assert.equal(videoTypeOf(box("ftyp", "isom")), "mp4");
  assert.equal(videoTypeOf(box("ftyp", "mp42")), "mp4");
  assert.equal(videoTypeOf(box("ftyp", "qt  ")), "mov");
  assert.equal(videoTypeOf(box("moov")), "mov");
  const ebml = (doc: string) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...[...doc].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
  assert.equal(videoTypeOf(ebml("webm")), "webm");
  assert.equal(videoTypeOf(ebml("matroska")), null);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  assert.equal(videoTypeOf(png), null);
  assert.equal(videoTypeOf(new Uint8Array([0, 0, 0])), null);
});

test("scene time → recording time: the first frame before the screen comes in, then it plays at its rate", () => {
  const clip = { from: 2, to: 7, rate: 1 };
  assert.equal(clipTime(clip, 10, 0, 0.4), 2);
  assert.equal(clipTime(clip, 10, 0.4, 0.4), 2);
  assert.ok(near(clipTime(clip, 10, 1.4, 0.4), 3));
  assert.ok(near(clipTime({ ...clip, rate: 1.5 }, 10, 2.4, 0.4), 5));
  assert.ok(near(clipTime({ ...clip, rate: 0.5 }, 10, 2.4, 0.4), 3));
  // A speed outside 0.25..4 is kept inside it.
  assert.ok(near(clipTime({ ...clip, rate: 50 }, 10, 1, 0), 6));
  assert.equal(clipTime(clip, 10, Number.NaN, 0), 2);
});

test("at the end of the stretch it holds the last frame before `to`, or loops back to `from`", () => {
  const hold = { from: 2, to: 7, rate: 1 };
  assert.ok(near(clipTime(hold, 10, 9, 0), 7 - HOLD_BACK));
  assert.ok(near(clipTime(hold, 10, 100, 0), 7 - HOLD_BACK));
  // No `to`: to the end of the recording, never at or past its last instant.
  assert.ok(near(clipTime({ from: 0, rate: 1 }, 10, 30, 0), 10 - HOLD_BACK));
  const loop = { from: 2, to: 7, rate: 1, end: "loop" as const };
  assert.ok(near(clipTime(loop, 10, 6, 0), 3));
  assert.ok(near(clipTime(loop, 10, 11.5, 0), 3.5));
  assert.ok(near(clipTime({ ...loop, rate: 2 }, 10, 3, 0), 3));
  assert.equal(clipMoving(hold, 10, 4, 0), true);
  assert.equal(clipMoving(hold, 10, 8, 0), false);
  assert.equal(clipMoving(hold, 10, 0.2, 0.4), false);
  assert.equal(clipMoving(loop, 10, 80, 0), true);
});

test("a stretch outside the recording is clamped into it; a backwards one shows its first frame", () => {
  // From past the end: the last frame.
  assert.ok(near(clipTime({ from: 30, rate: 1 }, 10, 0, 0), 10 - HOLD_BACK));
  // To before from: an empty stretch, held on from.
  assert.equal(clipTime({ from: 5, to: 3, rate: 1 }, 10, 2, 0), 5);
  assert.equal(clipTime({ from: -4, to: 2, rate: 1 }, 10, 0, 0), 0);
  assert.ok(near(clipSeconds({ from: 2, to: 7, rate: 2 }, 10), 2.5));
  assert.ok(near(clipSeconds({ from: 2, rate: 1 }, 6), 4));
  // A recording of no length never asks for a negative second.
  assert.equal(clipTime({ from: 1, rate: 1 }, 0, 3, 0), 0);
});

test("which picture plays: the screen of hook, screen, zoom and callouts, what a character presents; never a product", () => {
  assert.deepEqual(videoAssetOf(scene({ template: "screen", asset: "app" })), { id: "app", key: "media" });
  assert.deepEqual(videoAssetOf(scene({ template: "zoom", asset: "app" })), { id: "app", key: "media" });
  assert.deepEqual(videoAssetOf(scene({ template: "hook", asset: "app" })), { id: "app", key: "media" });
  assert.deepEqual(videoAssetOf(scene({ template: "callouts", asset: "app" })), { id: "app", key: "media" });
  assert.deepEqual(videoAssetOf(scene({ template: "character", asset: "mica", assetB: "app" })), { id: "app", key: "prop" });
  assert.equal(videoAssetOf(scene({ template: "product", asset: "app" })), null);
  assert.equal(videoAssetOf(scene({ template: "steps", asset: "app" })), null);
  assert.equal(videoAssetOf(scene({ template: "screen", asset: "" })), null);
});

function piece(scenes: MotionScene[], tone: MotionScript["tone"] = "warm"): MotionScript {
  return { problem: "", title: "", durationNote: "", note: "", tone, music: { mood: "drive", bpm: 110 }, scenes };
}

test("a frame needs the scene on screen and, while it comes in, the one before at its last moment", () => {
  const script = piece([
    scene({ id: "a", template: "screen", asset: "app", seconds: 3, recording: { from: 1, rate: 1 } }),
    scene({ id: "b", template: "callouts", asset: "app", seconds: 3, recording: { from: 4, to: 6, rate: 2 }, items: ["Uno"] }),
    scene({ id: "c", template: "stat", seconds: 3, title: "3 minutos" }),
  ]);
  const timed = timeScenes(script.scenes);
  const push = cutPush("warm");
  const seconds = (id: string) => (id === "app" ? 12 : undefined);
  const startA = elementTimes(timed[0]).media;
  const mid = videoPlan(timed, push, 1.5, seconds);
  assert.deepEqual(mid.map((n) => n.sceneId), ["a"]);
  assert.ok(near(mid[0].time, 1 + (1.5 - startA)));
  // Just after the cut into b (a carry: same picture), both scenes are drawn: b now, a at its end.
  const cut = videoPlan(timed, push, 3.05, seconds);
  assert.deepEqual(cut.map((n) => n.sceneId).sort(), ["a", "b"]);
  assert.ok(near(cut.find((n) => n.sceneId === "a")!.time, 1 + (3 - 0.001 - startA)));
  assert.equal(drawnAt(timed, push, 3.05).length, 2);
  // Inside the stat scene, nothing plays; a screen with no recording plays nothing either.
  assert.deepEqual(videoPlan(timed, push, 7.5, seconds), []);
  assert.deepEqual(videoPlan(timed, push, 1.5, () => undefined), []);
  // The planned seconds are what clipTime says, so the drawing and every capture read one time.
  const b = timed[1];
  const at = 4.9;
  const need = videoPlan(timed, push, at, seconds).find((n) => n.sceneId === "b")!;
  assert.equal(need.time, clipTime(b.recording!, 12, at - b.start, elementTimes(b).media));
  assert.equal(need.rate, 2);
});

test("the writer's clip words, read and written back", () => {
  assert.deepEqual(pickClip("2-7"), { from: 2, to: 7, rate: 1 });
  assert.deepEqual(pickClip("2,5–7 x1.5"), { from: 2.5, to: 7, rate: 1.5 });
  assert.deepEqual(pickClip("0-fin en bucle"), { from: 0, rate: 1, end: "loop" });
  assert.deepEqual(pickClip("3 a 9"), { from: 3, to: 9, rate: 1 });
  assert.deepEqual(pickClip("sí"), { from: 0, rate: 1 });
  assert.equal(pickClip(""), undefined);
  assert.equal(pickClip("no"), undefined);
  assert.equal(pickClip(undefined), undefined);
  // A backwards stretch loses its end.
  assert.deepEqual(pickClip("7-2"), { from: 7, rate: 1 });
  assert.equal(clipText({ from: 2, to: 7, rate: 1.5 }), "2-7 x1.5");
  assert.equal(clipText({ from: 0, rate: 1, end: "loop" }), "0-fin en bucle");
  assert.equal(clipText(undefined), "");
  for (const words of ["2-7", "2.5-7 x1.5", "0-fin en bucle"]) assert.equal(clipText(pickClip(words)), words);
});

test("the writer's clip becomes the scene's recording, and stays only where a screen has one", () => {
  const wire = {
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    caption: "",
    music: { mood: "drive", bpm: 110 },
    scenes: [
      { ...blankScene("screen"), gesture: "", asset: "app", clip: "2-30 x2" },
      { ...blankScene("screen"), gesture: "", asset: "foto", clip: "1-3" },
      { ...blankScene("product"), gesture: "", asset: "app", clip: "1-3" },
      { ...blankScene("screen"), gesture: "", asset: "app", clip: "" },
    ],
  };
  const script = normalizeMotion(wire, "warm");
  assert.deepEqual(script.scenes[0].recording, { from: 2, to: 30, rate: 2 });
  assert.equal("clip" in script.scenes[0], false);
  const settled = settleClips(script.scenes, (id) => (id === "app" ? 12 : undefined));
  // Clamped into the 12 s recording (its end is the end: no `to`).
  assert.deepEqual(settled[0].recording, { from: 2, rate: 2 });
  assert.equal(settled[1].recording, undefined);
  assert.equal(settled[2].recording, undefined);
  assert.equal(settled[3].recording, undefined);
});

test("a director's note changes the stretch only when the writer changed it", () => {
  const current = piece([scene({ id: "a", asset: "app", recording: { from: 2, to: 7, rate: 1 } })]);
  const same = mergeNote(current, piece([{ ...current.scenes[0], id: "new" }]), [{ from: "a" }]);
  assert.deepEqual(same.changed, []);
  const faster = mergeNote(current, piece([{ ...current.scenes[0], id: "new", recording: { from: 2, to: 7, rate: 2 } }]), [{ from: "a" }]);
  assert.deepEqual(faster.changed, ["a"]);
  assert.equal(faster.script.scenes[0].recording?.rate, 2);
  const still = mergeNote(current, piece([{ ...current.scenes[0], id: "new", recording: undefined }]), [{ from: "a" }]);
  assert.equal("recording" in still.script.scenes[0], false);
});

test("a cast screen keeps its recording in the series file; other kinds read as before", () => {
  const base = { id: "vence", name: "Vence", ref: "Vence", kind: "screen", identity: "", note: "", image: "vence.png" };
  const parsed = CastMemberSchema.parse({ ...base, video: { file: "vence-video-abc.mp4", poster: "vence-poster-abc.jpg", seconds: 12.4, width: 1080, height: 2340 } });
  assert.equal(parsed.video?.seconds, 12.4);
  assert.equal(CastMemberSchema.parse(base).video, undefined);
  // A file name that could climb out of the library never gets in.
  assert.equal(CastMemberSchema.safeParse({ ...base, video: { file: "../.env", seconds: 1, width: 1, height: 1 } }).success, false);
});

test("seek tolerance: exact captures to a millisecond, the playing preview only past a drift", () => {
  assert.equal(needsSeek(3, 3.0005, true), false);
  assert.equal(needsSeek(3, 3.01, true), true);
  assert.equal(needsSeek(3, 3.1, false), false);
  assert.equal(needsSeek(3, 3.5, false), true);
});

// A stand-in for a <video>: loads its source, and every seek takes a while before 'seeked' fires (or fails).
class FakeVideo extends EventTarget implements VideoLike {
  private t = 0;
  src_ = "";
  readyState = 0;
  paused = true;
  seeking = false;
  playbackRate = 1;
  muted = false;
  duration = 12;
  constructor(
    private log: string[],
    private broken = false,
    private delay = 3,
  ) {
    super();
  }
  get src() {
    return this.src_;
  }
  set src(v: string) {
    this.src_ = v;
    setTimeout(() => {
      if (this.broken) return void this.dispatchEvent(new Event("error"));
      this.readyState = 2;
      this.dispatchEvent(new Event("loadedmetadata"));
    }, 1);
  }
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.seeking = true;
    this.log.push(`seek ${v.toFixed(3)}`);
    setTimeout(() => {
      this.t = v;
      this.seeking = false;
      this.readyState = 4;
      this.log.push(`seeked ${v.toFixed(3)}`);
      this.dispatchEvent(new Event("seeked"));
    }, this.delay);
  }
  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
}

function worldWith(deck: VideoDeck): MotionWorld {
  const still = { image: { still: true } as unknown as CanvasImageSource, width: 400, height: 800, name: "app", screen: true };
  return {
    brand: DEFAULT_BRAND,
    assets: { app: { ...still, video: { url: "/v.mp4", seconds: 12, width: 1080, height: 2340 } } },
    logo: null,
    beats: [],
    seed: 7,
    disclosure: "",
    videos: deck,
  };
}

test("every recording on screen is sought to its exact second before the frame is drawn", async () => {
  const log: string[] = [];
  const els: FakeVideo[] = [];
  const deck = new VideoDeck({ app: { url: "/v.mp4", seconds: 12 } }, () => {
    const v = new FakeVideo(log);
    els.push(v);
    return v;
  });
  const script = piece([
    scene({ id: "a", template: "screen", asset: "app", seconds: 3, recording: { from: 1, rate: 1 } }),
    scene({ id: "b", template: "zoom", asset: "app", seconds: 3, recording: { from: 6, rate: 1.5 } }),
  ]);
  const world = worldWith(deck);
  const timed = timeScenes(script.scenes);
  for (const t of [1.2, 3.05, 4.5]) {
    log.length = 0;
    await drawReady(world, script, t, () => log.push("draw"));
    const needs = deck.plan(script, t);
    assert.ok(needs.length > 0);
    // The draw comes last, after every seek it needed has landed.
    assert.equal(log.at(-1), "draw");
    for (const n of needs) {
      const el = els.find((e) => e.currentTime.toFixed(3) === n.time.toFixed(3));
      assert.ok(el, `a player sits on ${n.time} at t=${t}`);
      const seeked = log.indexOf(`seeked ${n.time.toFixed(3)}`);
      assert.ok(seeked === -1 || seeked < log.indexOf("draw"));
      assert.ok(deck.frame(n.sceneId), "the scene's player has its frame");
    }
  }
  // Each scene has its own player: during the change into b both show their own second.
  const both = deck.plan(script, 3.05);
  assert.equal(new Set(both.map((n) => n.time)).size, 2);
  assert.equal(els.length, 2);
  // Asking for the same frame again seeks nothing.
  log.length = 0;
  await drawReady(world, script, 4.5, () => log.push("draw"));
  assert.deepEqual(log, ["draw"]);
  // The engine draws the player (the recording's own size), not the still.
  const b = timed[1];
  const asset = assetOf(world, b, "media")!;
  assert.equal(asset.image, deck.frame("b"));
  assert.deepEqual([asset.width, asset.height], [1080, 2340]);
  deck.dispose();
});

test("a recording that cannot be read falls back to the still, with a note on the picture", async () => {
  const log: string[] = [];
  const deck = new VideoDeck({ app: { url: "/roto.mov", seconds: 12 } }, () => new FakeVideo(log, true), 200);
  const script = piece([scene({ id: "a", template: "screen", asset: "app", seconds: 3, recording: { from: 0, rate: 1 } })]);
  const world = worldWith(deck);
  let drawn = false;
  await drawReady(world, script, 1, () => (drawn = true));
  assert.equal(drawn, true);
  assert.equal(deck.failed("app"), true);
  assert.equal(deck.frame("a"), null);
  const asset = assetOf(world, timeScenes(script.scenes)[0], "media")!;
  assert.equal(asset.note, VIDEO_FAILED_NOTE);
  assert.equal((asset.image as unknown as { still: boolean }).still, true);
  // The note is drawn on the picture.
  const texts: string[] = [];
  const own: Record<string, unknown> = { measureText: (t: string) => ({ width: t.length * 6 }), fillText: (t: string) => texts.push(t) };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  drawMotionFrame(ctx, 1080, 1920, 1, script, world);
  assert.ok(texts.join(" ").includes("No se pudo leer el video"));
  // check() names it, so a render stops instead of shipping the still.
  assert.deepEqual(await new VideoDeck({ app: { url: "/roto.mov", seconds: 12 } }, () => new FakeVideo([], true), 50).check(), ["app"]);
  assert.deepEqual(await new VideoDeck({ app: { url: "/ok.mp4", seconds: 12 } }, () => new FakeVideo([]), 50).check(), []);
});

test("a scene without a recording, or a world without players, draws its still and waits for nothing", async () => {
  const deck = new VideoDeck({ app: { url: "/v.mp4", seconds: 12 } }, () => new FakeVideo([]));
  const world = worldWith(deck);
  const still = scene({ id: "s", template: "screen", asset: "app" });
  assert.equal(assetOf(world, still, "media"), world.assets.app);
  // Before its player has a frame, a playing scene shows the poster (here the still) in the recording's size.
  const playing = scene({ id: "p", template: "screen", asset: "app", recording: { from: 0, rate: 1 } });
  const before = assetOf(world, playing, "media")!;
  assert.equal(before.note, undefined);
  assert.equal(before.width, 1080);
  let drawn = 0;
  await drawReady({ ...world, videos: undefined }, piece([playing]), 1, () => drawn++);
  assert.equal(drawn, 1);
});

test("only the newest request draws: a slow older one that finishes later is dropped", async () => {
  const run = latestOnly();
  const order: string[] = [];
  const slow = run(() => new Promise((done) => setTimeout(done, 20)), () => order.push("old"));
  const fast = run(() => new Promise((done) => setTimeout(done, 1)), () => order.push("new"));
  assert.deepEqual(await Promise.all([slow, fast]), [false, true]);
  assert.deepEqual(order, ["new"]);
});

test("a fork has players of its own, so a capture never moves the preview's", async () => {
  const made: FakeVideo[] = [];
  const deck = new VideoDeck({ app: { url: "/v.mp4", seconds: 12 } }, () => {
    const v = new FakeVideo([]);
    made.push(v);
    return v;
  });
  const script = piece([scene({ id: "a", template: "screen", asset: "app", seconds: 3, recording: { from: 0, rate: 1 } })]);
  await deck.ready(script, 1);
  const fork = deck.fork();
  await fork.ready(script, 2.5);
  assert.equal(made.length, 2);
  assert.notEqual(made[0].currentTime, made[1].currentTime);
  fork.dispose();
  deck.dispose();
});
