// "Escena de código", the browser side: the pasted animation runs in a sandboxed iframe (sandbox="allow-scripts",
// so an opaque origin with no access to the app, its API, its storage or the network; a CSP that allows only its own
// inline scripts and blob:/data: pictures and fonts). The only way in or out is postMessage with a token made for that
// instance. Each frame request answers an ImageBitmap (OffscreenCanvas.transferToImageBitmap) and the texts drawn.
// A frame over CODE_FRAME_MS is an error; one that never answers (an endless loop) tears the iframe down.
//
// The engine stays synchronous (drawMotionFrame reads CodeDeck.frame); every exact capture (the render page, the
// in-browser render, the poster, the contact sheet, the storyboard) awaits the frames it needs first (drawReady in
// screenVideo.ts), so a render is frame-exact. The live preview shows the latest frame it has (follow).
import {
  BREACH_LABEL,
  CODE_FRAME_MS,
  CODE_HANG_MS,
  CODE_LOAD_MS,
  codeBreaches,
  codeSig,
  problemText,
  readSandboxMessage,
  sampleTimes,
  shareTexts,
  textsOf,
  validateSource,
  type CodeInfoWire,
  type CodeProblem,
  type CodeSamples,
  type CodeText,
  type FontBytes,
  type HostMessage,
} from "../../shared/codeScene.ts";
import { blurSamples, cutPush, pushOf, timeScenes, type MotionScript, type TimedScene } from "../../shared/motion.ts";
import { safeRect } from "../../shared/safeZone.ts";
import { floorOf, sceneAt, type CodeFrames, type MotionAsset, type MotionWorld } from "./motion.ts";

// ── The iframe's document ──────────────────────────────────────────────────────────────────────────────────────
// The runtime runs first: it keeps what it needs (the clock for the time limit, OffscreenCanvas, FontFace), then
// blocks the clocks, randomness, timers and network for the scene's code, which runs next as its own inline script
// (a syntax error there is reported with its line), and a last script says whether draw exists.
const RUNTIME = `(function () {
  "use strict";
  var TOKEN = __TOKEN__;
  var LIMIT = __LIMIT__;
  var CODE_LINE = __LINE__;
  var CODE_END = __END__;
  var host = window.parent;
  var now = performance.now.bind(performance);
  var Canvas = OffscreenCanvas;
  var Face = FontFace;
  var fontSet = document.fonts;
  var listen = window.addEventListener.bind(window);
  var firstError = null;
  function post(m, transfer) { m.token = TOKEN; host.postMessage(m, "*", transfer || []); }
  function userLine(n) { var k = Number(n) - CODE_LINE + 1; return k >= 1 && Number(n) <= CODE_END ? k : undefined; }
  // The first place in the person's code on the error's stack (a blocked call throws from the runtime's own lines).
  function lineOf(e) {
    var re = /about:srcdoc:(\\d+):\\d+/g, m, stack = String((e && e.stack) || "");
    while ((m = re.exec(stack))) { var k = userLine(m[1]); if (k) return k; }
    return undefined;
  }
  listen("error", function (e) {
    if (!firstError) firstError = { message: String(e.message || "Error").replace(/^Uncaught /, ""), line: e.lineno ? userLine(e.lineno) : undefined };
  });
  function blocked(name, hint) {
    return function () { throw new Error(name + " no está permitido en una escena de código" + (hint ? ": " + hint : "")); };
  }
  Math.random = blocked("Math.random", "usá info.random(semilla)");
  ["setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "open"].forEach(function (n) {
    try { Object.defineProperty(window, n, { value: blocked(n), configurable: false, writable: false }); } catch (x) {}
  });
  try { Object.defineProperty(window, "performance", { value: undefined, configurable: false, writable: false }); } catch (x) {}
  try { Object.defineProperty(window, "Date", { value: blocked("Date", "el cuadro depende solo de t"), configurable: false, writable: false }); } catch (x) {}
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var info = null, canvas = null, drawFn = null;
  Object.defineProperty(window, "__codeReady", { configurable: false, writable: false, value: function (draw) {
    drawFn = typeof draw === "function" ? draw : null;
    post({ type: "ready", hasDraw: !!drawFn, error: firstError || undefined });
  } });
  listen("message", function (e) {
    if (e.source !== host) return;
    var m = e.data;
    if (!m || m.token !== TOKEN) return;
    if (m.type === "init") {
      var assets = {};
      (m.assets || []).forEach(function (a) { assets[a.name] = a.bitmap; });
      info = Object.freeze(Object.assign({}, m.info, {
        assets: Object.freeze(assets),
        random: function (seed) { return mulberry(Number(seed) || 0); }
      }));
      var loads = (m.fonts || []).map(function (f) {
        try {
          var face = new Face(f.family, f.data, { weight: f.weight });
          fontSet.add(face);
          return face.load().then(function () { return null; }, function () { return f.family + " " + f.weight; });
        } catch (x) { return Promise.resolve(f.family + " " + f.weight); }
      });
      Promise.all(loads).then(function (errs) { post({ type: "inited", fontErrors: errs.filter(Boolean) }); });
      return;
    }
    if (m.type === "frame") {
      if (!canvas) canvas = new Canvas(info.width, info.height);
      // A new size clears the pixels and resets the drawing state: every frame starts fresh.
      canvas.width = info.width;
      canvas.height = info.height;
      var ctx = canvas.getContext("2d");
      var error, texts;
      var start = now();
      if (!drawFn) error = { message: "No está la función draw(ctx, t, info)." };
      else {
        try { texts = drawFn(ctx, m.t, info); } catch (err) { error = { message: String((err && err.message) || err), line: lineOf(err) }; }
      }
      var ms = now() - start;
      if (!error && ms > LIMIT) error = { message: "el cuadro tardó " + Math.round(ms) + " ms y el límite es " + LIMIT + " ms: simplificá el dibujo" };
      var clean = null;
      if (Array.isArray(texts)) {
        clean = texts.slice(0, 60).map(function (x) {
          x = x || {};
          return { text: String(x.text == null ? "" : x.text).slice(0, 300), x: Number(x.x), y: Number(x.y), w: Number(x.w), h: Number(x.h) };
        });
      }
      var bitmap = canvas.transferToImageBitmap();
      post({ type: "frame", id: m.id, bitmap: bitmap, texts: error ? [] : clean, ms: ms, error: error }, [bitmap]);
    }
  });
})();`;

// The iframe's whole document for this code and token. `codeLine`: the document line where the code starts, so a
// line in an error reads as the line of the person's code.
export function sandboxDoc(source: string, token: string, limitMs = CODE_FRAME_MS): { html: string; codeLine: number } {
  // The code sits inside a <script>: a "</script" in it would close it early, "<!--" would change how it is read.
  const code = source.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
  const csp = "default-src 'none'; script-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:";
  const head = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    "</head><body>",
    "<script>",
  ];
  const runtimeLines = RUNTIME.split("\n").length;
  // The code's first line: after the head, the runtime, its closing tag and the code's opening tag.
  const codeLine = head.length + runtimeLines + 3;
  const runtime = RUNTIME.replace("__TOKEN__", JSON.stringify(token)).replace("__LIMIT__", String(limitMs)).replace("__LINE__", String(codeLine)).replace("__END__", String(codeLine + code.split("\n").length - 1));
  const html = [
    ...head,
    runtime,
    "</script>",
    "<script>",
    code,
    "</script>",
    '<script>window.__codeReady(typeof draw === "function" ? draw : null);</script>',
    "</body></html>",
  ].join("\n");
  return { html, codeLine };
}

// ── The host side of the protocol ──────────────────────────────────────────────────────────────────────────────
// Where messages go (the iframe in the page; a fake in the tests).
export type SandboxPort = { post(message: HostMessage, transfer: Transferable[]): void; close(): void };
export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

// A bitmap as the runner keeps it (an ImageBitmap; a fake in the tests).
export type Bitmap = CanvasImageSource & { close?: () => void };
export type CodeFrame = { bitmap: Bitmap | null; texts: CodeText[] | null; ms: number; error?: { message: string; line?: number } };

type Pending = { resolve: (value: unknown) => void; reject: (e: Error) => void; timer: unknown };

// One sandbox: it says it is ready (and whether draw exists), takes the info, the fonts and the pictures once, then
// answers frames one at a time. Anything without its token is ignored. A request that gets no answer in time tears
// the sandbox down and fails everything still waiting.
export class CodeRunner {
  state: "loading" | "ready" | "inited" | "dead" = "loading";
  failure: string | null = null;
  private readyWait: Pending | null = null;
  private readyResult: Promise<void>;
  private pending = new Map<number | "init", Pending>();
  private nextId = 1;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    readonly token: string,
    private port: SandboxPort,
    private timers: Timers = realTimers,
    private limits = { load: CODE_LOAD_MS, hang: CODE_HANG_MS },
  ) {
    this.readyResult = new Promise<void>((resolve, reject) => {
      const timer = this.timers.set(() => this.kill(`La animación no arrancó en ${Math.round(this.limits.load / 1000)} s: puede tener un bucle sin fin fuera de draw.`), this.limits.load);
      this.readyWait = { resolve: () => resolve(), reject, timer };
    });
    // Nobody may be waiting yet; the failure is kept in `failure` and given to whoever asks.
    this.readyResult.catch(() => undefined);
  }

  // A message from the iframe (the page checks it came from this iframe's window).
  receive(data: unknown) {
    const m = readSandboxMessage(data, this.token);
    if (!m || this.state === "dead") return;
    if (m.type === "ready") {
      const wait = this.readyWait;
      this.readyWait = null;
      if (!wait) return;
      this.timers.clear(wait.timer);
      if (m.error || !m.hasDraw) {
        const why = m.error ? problemText(m.error) : "No encuentro la función draw(ctx, t, info): el código tiene que definirla.";
        this.failure = why;
        this.state = "dead";
        this.port.close();
        wait.reject(new Error(why));
        return;
      }
      this.state = "ready";
      wait.resolve(undefined);
      return;
    }
    const key = m.type === "inited" ? "init" : m.id;
    const p = this.pending.get(key);
    if (!p) return;
    this.pending.delete(key);
    this.timers.clear(p.timer);
    if (m.type === "inited") {
      this.state = "inited";
      p.resolve(m.fontErrors);
      return;
    }
    const texts = m.error ? [] : textsOf(m.texts);
    p.resolve({ bitmap: (m.bitmap as Bitmap) ?? null, texts, ms: m.ms, ...(m.error && { error: m.error }) } satisfies CodeFrame);
  }

  whenReady(): Promise<void> {
    return this.failure ? Promise.reject(new Error(this.failure)) : this.readyResult;
  }

  // The scene's info, its fonts and pictures (transferred). Resolves with the fonts that did not load.
  async init(info: CodeInfoWire, fonts: FontBytes[], assets: { name: string; bitmap: Bitmap }[]): Promise<string[]> {
    await this.whenReady();
    return this.request("init", { token: this.token, type: "init", info, fonts, assets }, assets.map((a) => a.bitmap as unknown as Transferable), this.limits.load) as Promise<string[]>;
  }

  // Frame t of the scene, after any frame asked for before it.
  frame(t: number): Promise<CodeFrame> {
    const run = () => {
      if (this.state === "dead") return Promise.reject(new Error(this.failure ?? "La animación se detuvo."));
      const id = this.nextId++;
      return this.request(id, { token: this.token, type: "frame", id, t }, [], this.limits.hang, t) as Promise<CodeFrame>;
    };
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private request(key: number | "init", message: HostMessage, transfer: Transferable[], ms: number, t?: number): Promise<unknown> {
    if (this.state === "dead") return Promise.reject(new Error(this.failure ?? "La animación se detuvo."));
    return new Promise((resolve, reject) => {
      const timer = this.timers.set(
        () =>
          this.kill(
            t === undefined
              ? "La animación no terminó de cargar las fuentes y las imágenes a tiempo."
              : `La animación no respondió en ${(ms / 1000).toFixed(1)} s en t = ${t.toFixed(2)} s: puede tener un bucle sin fin. Se cerró.`,
          ),
        ms,
      );
      this.pending.set(key, { resolve, reject, timer });
      try {
        this.port.post(message, transfer);
      } catch (e) {
        this.pending.delete(key);
        this.timers.clear(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  // Tears the sandbox down with a reason: everything still waiting fails with it.
  kill(reason: string) {
    if (this.state === "dead") return;
    this.state = "dead";
    this.failure = reason;
    this.port.close();
    const error = new Error(reason);
    if (this.readyWait) {
      this.timers.clear(this.readyWait.timer);
      this.readyWait.reject(error);
      this.readyWait = null;
    }
    for (const p of this.pending.values()) {
      this.timers.clear(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }

  dispose() {
    this.kill("La animación se cerró.");
  }
}

// A sandbox in this page: a hidden iframe whose only channel is postMessage, checked by its window and token.
export function mountSandbox(source: string): CodeRunner {
  const token = crypto.randomUUID();
  const { html } = sandboxDoc(source, token);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:8px;height:8px;border:0;visibility:hidden;pointer-events:none";
  let runner: CodeRunner | null = null;
  const onMessage = (e: MessageEvent) => {
    if (e.source === frame.contentWindow) runner?.receive(e.data);
  };
  const port: SandboxPort = {
    post: (message, transfer) => frame.contentWindow?.postMessage(message, "*", transfer),
    close: () => {
      window.removeEventListener("message", onMessage);
      frame.remove();
    },
  };
  runner = new CodeRunner(token, port);
  window.addEventListener("message", onMessage);
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return runner;
}

// ── What a scene's code gets ─────────────────────────────────────────────────────────────────────────────────
export const sizeOf = (format: "vertical" | "horizontal") => (format === "vertical" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 });
export const formatOf = (w: number, h: number): "vertical" | "horizontal" => (h > w ? "vertical" : "horizontal");

// The info a scene's draw reads, at full size for the format: its timing, words and voice, the brand, the safe zone
// and the floor above the app's subtitle.
export function codeInfo(scene: TimedScene, format: "vertical" | "horizontal", world: Pick<MotionWorld, "brand" | "subtitles" | "disclosure">, tone?: string): CodeInfoWire {
  const { w, h } = sizeOf(format);
  const words = (world.subtitles ?? [])
    .filter((c) => c.sceneId === scene.id)
    .flatMap((c) => c.words)
    .map((x) => ({ text: x.text, start: Math.round((x.start - scene.start) * 1000) / 1000, end: Math.round((x.end - scene.start) * 1000) / 1000 }));
  const b = world.brand;
  return {
    width: w,
    height: h,
    format,
    duration: scene.seconds,
    fps: 30,
    brand: { bg: b.bg, text: b.text, accent: b.accent, displayFont: b.displayFont, uiFont: b.uiFont },
    tone: tone ?? "warm",
    voice: scene.voice.trim(),
    words,
    emotion: scene.emotion.trim(),
    safe: safeRect(w, h),
    floor: Math.round(floorOf(scene, w, h, Boolean(world.disclosure))),
  };
}

// The pictures a code scene gets, as bitmaps by name: a cast member's image, or a recording's poster.
async function assetBitmaps(names: string[], assets: Record<string, MotionAsset>): Promise<{ name: string; bitmap: Bitmap }[]> {
  const out: { name: string; bitmap: Bitmap }[] = [];
  for (const name of names) {
    const a = assets[name];
    if (!a) continue;
    try {
      out.push({ name, bitmap: await createImageBitmap((a.video?.poster ?? a.image) as ImageBitmapSource) });
    } catch {
      // A picture that cannot be copied is left out; the code sees it missing.
    }
  }
  return out;
}

// Which code scene frames frame t of the piece draws (scene id, scene time): the scene on screen and, while it comes
// in, the one before at its end; with the motion blur, for every subframe.
export function codeNeeds(script: MotionScript, t: number, blur = false): { scene: TimedScene; lt: number }[] {
  const scenes = timeScenes(script.scenes);
  if (!scenes.some((s) => s.template === "code")) return [];
  const push = cutPush(script.tone);
  const times = blur ? blurSamples(script.scenes, push, t).map((s) => s.at) : [t];
  const out = new Map<string, { scene: TimedScene; lt: number }>();
  const add = (scene: TimedScene, lt: number) => {
    if (scene.template !== "code") return;
    const at = Math.min(scene.seconds, Math.max(0, lt));
    out.set(`${scene.id}|${at.toFixed(4)}`, { scene, lt: at });
  };
  for (const at of times) {
    const i = sceneAt(scenes, at);
    const s = scenes[i];
    const lt = at - s.start;
    add(s, lt);
    if (i > 0 && lt < pushOf(s, push)) add(scenes[i - 1], scenes[i - 1].seconds - 0.001);
  }
  return [...out.values()];
}

const frameKey = (lt: number) => lt.toFixed(4);
// How many frames a scene keeps (the latest is never dropped while it is shown).
const KEEP = 32;

type Entry = {
  runner: CodeRunner;
  sig: string;
  started: Promise<void>;
  frames: Map<string, Bitmap>;
  latest: Bitmap | null;
  inflight: boolean;
  wanted: number | null;
  problem: string | null;
};

export type CodeDeckOptions = {
  // The brand fonts' files (fontBytes in src/lib/fonts.ts).
  fonts: (families: string[]) => Promise<FontBytes[]>;
  // The format of a frame asked for without a size.
  format: "vertical" | "horizontal";
  // A sandbox for this code (mountSandbox; a fake in the tests).
  mount?: (source: string) => CodeRunner;
  // A render: a frame that fails stops it (ready throws), never a placeholder in a finished video.
  strict?: boolean;
};

// Every code scene's sandbox, one per scene and format, made again when its code, pictures or info change.
export class CodeDeck implements CodeFrames {
  private entries = new Map<string, Entry>();
  constructor(readonly opts: CodeDeckOptions) {}

  private entry(scene: TimedScene, format: "vertical" | "horizontal", world: MotionWorld, tone?: string): Entry | null {
    const code = scene.code;
    const key = `${scene.id}|${format}`;
    if (!code?.source.trim()) {
      this.drop(key);
      return null;
    }
    const info = codeInfo(scene, format, world, tone);
    const sig = codeSig([code.source, code.assets, info]);
    const had = this.entries.get(key);
    if (had && had.sig === sig) return had;
    if (had) this.drop(key);
    const static_ = validateSource(code.source).find((p) => p.fatal);
    const runner = (this.opts.mount ?? mountSandbox)(code.source);
    const entry: Entry = { runner, sig, started: Promise.resolve(), frames: new Map(), latest: null, inflight: false, wanted: null, problem: null };
    entry.started = (async () => {
      if (static_) throw new Error(static_.message);
      await runner.whenReady();
      const [fonts, assets] = await Promise.all([this.opts.fonts([info.brand.displayFont, info.brand.uiFont]).catch(() => []), assetBitmaps(code.assets, world.assets)]);
      await runner.init(info, fonts, assets);
    })().catch((e: unknown) => {
      entry.problem = e instanceof Error ? e.message : String(e);
      runner.dispose();
    });
    this.entries.set(key, entry);
    return entry;
  }

  private drop(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    e.runner.dispose();
    for (const b of e.frames.values()) b.close?.();
    if (e.latest && ![...e.frames.values()].includes(e.latest)) e.latest.close?.();
    this.entries.delete(key);
  }

  private keep(e: Entry, lt: number, bitmap: Bitmap) {
    const k = frameKey(lt);
    const old = e.frames.get(k);
    if (old && old !== bitmap && old !== e.latest) old.close?.();
    e.frames.delete(k);
    e.frames.set(k, bitmap);
    this.show(e, bitmap);
    while (e.frames.size > KEEP) {
      const [first, b] = e.frames.entries().next().value as [string, Bitmap];
      e.frames.delete(first);
      if (b !== e.latest) b.close?.();
    }
  }

  // The frame the preview shows now; the one it replaces is let go unless the scene still keeps it.
  private show(e: Entry, bitmap: Bitmap) {
    const previous = e.latest;
    e.latest = bitmap;
    if (previous && previous !== bitmap && ![...e.frames.values()].includes(previous)) previous.close?.();
  }

  // Asks one frame of a scene and keeps it. A failure is kept as the scene's problem.
  private async fetch(e: Entry, lt: number): Promise<void> {
    await e.started;
    if (e.problem) return;
    try {
      const got = await e.runner.frame(lt);
      if (got.error) {
        e.problem = problemText(got.error, lt);
        got.bitmap?.close?.();
        return;
      }
      if (got.bitmap) this.keep(e, lt, got.bitmap);
    } catch (err) {
      e.problem = err instanceof Error ? err.message : String(err);
    }
  }

  // The frame a drawing reads: the one asked for lt in this orientation, else the latest of that scene.
  frame(sceneId: string, lt: number, w: number, h: number): CanvasImageSource | null {
    const e = this.entries.get(`${sceneId}|${formatOf(w, h)}`);
    if (!e || e.problem) return null;
    return e.frames.get(frameKey(Math.max(0, lt))) ?? e.latest;
  }

  problem(sceneId: string): string | null {
    for (const [key, e] of this.entries) if (key.startsWith(`${sceneId}|`) && e.problem) return e.problem;
    return null;
  }

  // Frame-exact: every code frame frame t draws is in hand before this resolves. Strict (a render): a scene with no
  // code, a failed test or a failing frame throws.
  async ready(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }): Promise<void> {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    const needs = codeNeeds(script, t, Boolean(world.cutBlur));
    await Promise.all(
      needs.map(async ({ scene, lt }) => {
        if (this.opts.strict && scene.code?.error) throw new Error(`La escena ${scene.index + 1} (código) falló en su última prueba: ${scene.code.error}`);
        const e = this.entry(scene, format, world, script.tone);
        if (!e) {
          if (this.opts.strict) throw new Error(`La escena ${scene.index + 1} es una escena de código sin código: pegalo o cambiá la plantilla.`);
          return;
        }
        if (!e.frames.has(frameKey(lt))) await this.fetch(e, lt);
        if (this.opts.strict && e.problem) throw new Error(`La escena ${scene.index + 1} (código): ${e.problem}`);
      }),
    );
  }

  // The live preview (no wait): asks the frame for t when the scene's sandbox is free; the drawing shows the latest.
  follow(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }) {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    for (const { scene, lt } of codeNeeds(script, t, false)) {
      const e = this.entry(scene, format, world, script.tone);
      if (!e || e.problem) continue;
      const had = e.frames.get(frameKey(lt));
      if (had) {
        this.show(e, had);
        continue;
      }
      if (e.inflight) {
        e.wanted = lt;
        continue;
      }
      e.inflight = true;
      const go = (at: number): Promise<void> =>
        this.fetch(e, at).then(() => {
          const again = e.wanted;
          e.wanted = null;
          return again !== null && again !== at ? go(again) : undefined;
        });
      void go(lt).finally(() => {
        e.inflight = false;
      });
    }
  }

  // Loads every code scene of the script and draws its first frame: the problems, by scene (a render stops on them).
  async check(script: MotionScript, world: MotionWorld, size?: { w: number; h: number }): Promise<{ index: number; problem: string }[]> {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    const out: { index: number; problem: string }[] = [];
    for (const scene of timeScenes(script.scenes).filter((s) => s.template === "code")) {
      if (scene.code?.error) {
        out.push({ index: scene.index, problem: scene.code.error });
        continue;
      }
      const e = this.entry(scene, format, world, script.tone);
      if (!e) {
        out.push({ index: scene.index, problem: "no tiene código" });
        continue;
      }
      await this.fetch(e, 0);
      if (e.problem) out.push({ index: scene.index, problem: e.problem });
    }
    return out;
  }

  // A deck of its own (its own sandboxes), for a render that must not share the preview's.
  fork(strict = this.opts.strict): CodeDeck {
    return new CodeDeck({ ...this.opts, strict });
  }

  dispose() {
    for (const key of [...this.entries.keys()]) this.drop(key);
  }
}

// ── "Probar y guardar" ──────────────────────────────────────────────────────────────────────────────────────────
export type CodeTest = { problems: CodeProblem[]; samples: CodeSamples | null; slowest: number };

// Runs a runner over the scene's sample times and keeps the texts (as shares of the frame). Runtime errors are
// reported once each with their line and second; a frame that did not return its list of texts is reported once.
export async function sampleRunner(runner: CodeRunner, seconds: number, size: { w: number; h: number }, sig: string, times = sampleTimes(seconds)): Promise<CodeTest> {
  const problems: CodeProblem[] = [];
  const frames: CodeText[][] = [];
  const seen = new Set<string>();
  let slowest = 0;
  let missingList = false;
  for (const t of times) {
    let got: CodeFrame;
    try {
      got = await runner.frame(t);
    } catch (e) {
      problems.push({ message: e instanceof Error ? e.message : String(e), fatal: true });
      return { problems, samples: null, slowest };
    }
    got.bitmap?.close?.();
    slowest = Math.max(slowest, got.ms);
    if (got.error) {
      const text = problemText(got.error, t);
      if (!seen.has(got.error.message)) {
        seen.add(got.error.message);
        problems.push({ message: text, ...(got.error.line && { line: got.error.line }), fatal: true });
      }
      frames.push([]);
      continue;
    }
    if (got.texts === null && !missingList) {
      missingList = true;
      problems.push({ message: "draw no devolvió la lista de textos: al final de draw poné return texts; (o return []; si no dibuja texto).", fatal: true });
    }
    frames.push(shareTexts(got.texts ?? [], size.w, size.h));
  }
  return { problems, samples: problems.some((p) => p.fatal) ? null : { sig, step: times.length > 1 ? times[1] - times[0] : 0.1, frames }, slowest };
}

// The whole test of pasted code in a fresh sandbox: the static check, loading, then every sample time.
export async function testCode(
  source: string,
  scene: TimedScene,
  format: "vertical" | "horizontal",
  world: MotionWorld,
  tone: string | undefined,
  fonts: (families: string[]) => Promise<FontBytes[]>,
  sig: string,
  mount: (source: string) => CodeRunner = mountSandbox,
): Promise<CodeTest> {
  const problems = validateSource(source);
  if (problems.some((p) => p.fatal)) return { problems, samples: null, slowest: 0 };
  const runner = mount(source);
  try {
    await runner.whenReady();
    const info = codeInfo(scene, format, world, tone);
    const [fontFiles, assets] = await Promise.all([fonts([info.brand.displayFont, info.brand.uiFont]).catch(() => []), assetBitmaps(scene.code?.assets ?? [], world.assets)]);
    const fontErrors = await runner.init(info, fontFiles, assets);
    const result = await sampleRunner(runner, scene.seconds, sizeOf(format), sig);
    if (fontErrors.length) result.problems.push({ message: `No cargaron estas fuentes en la animación: ${fontErrors.join(", ")}. Se ve con otra letra.`, fatal: false });
    return { ...result, problems: [...problems, ...result.problems] };
  } catch (e) {
    return { problems: [...problems, { message: e instanceof Error ? e.message : String(e), fatal: true }], samples: null, slowest: 0 };
  } finally {
    runner.dispose();
  }
}

// ── What blocks a render ───────────────────────────────────────────────────────────────────────────────────────
// A code scene with no code, whose last test failed, not tested as it is now (its code, length, words or the format
// changed: the studio tests it again by itself), or with a text out of the 9:16 safe zone or over the subtitle.
// Reading holds go with readingIssues and numbers with figureIssues, like every other scene.
export type CodeIssue = { sceneId: string; index: number; text: string; stale?: true };
export function codeIssues(scenes: TimedScene[], format: "vertical" | "horizontal", notice: boolean, sigOf: (scene: TimedScene) => string): CodeIssue[] {
  const { w, h } = sizeOf(format);
  const safe = safeRect(w, h);
  const share = { x: safe.x / w, y: safe.y / h, w: safe.w / w, h: safe.h / h };
  return scenes.flatMap((s): CodeIssue[] => {
    if (s.template !== "code") return [];
    const n = s.index + 1;
    if (!s.code?.source.trim()) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: es de código y todavía no tiene código. Copiá el prompt para Opus y pegá su respuesta.` }];
    if (s.code.error) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: la última prueba del código falló (${s.code.error}).` }];
    const samples = s.code.samples;
    if (!samples || samples.sig !== sigOf(s)) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: probando el código otra vez (cambió la escena, su largo o el formato)…`, stale: true }];
    if (format !== "vertical") return [];
    const floor = floorOf(s, w, h, notice) / h;
    return codeBreaches(samples, share, floor).map((b) => ({ sceneId: s.id, index: s.index, text: `Escena ${n}: «${b.text}» ${BREACH_LABEL[b.where]} (desde t = ${b.at.toFixed(1)} s). Pedile a Opus que lo suba o lo achique.` }));
  });
}
