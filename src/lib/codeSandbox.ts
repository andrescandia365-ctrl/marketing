// "Escena de código", the browser side: the pasted animation runs in a worker started by a sandboxed iframe
// (sandbox="allow-scripts", so an opaque origin with no access to the app, its API, its storage or the network; a CSP
// that allows only the iframe's own inline relay, blob: workers and blob:/data: pictures and fonts, which the worker
// inherits). The code never runs in the iframe's document, so it cannot navigate it away from that CSP. The only way
// in or out is postMessage with a token made for that instance, which the code never sees. Each frame request answers an ImageBitmap (OffscreenCanvas.transferToImageBitmap) and the texts drawn.
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
  codeError,
  codeSig,
  problemText,
  readSandboxMessage,
  sampleTimes,
  samplesSig,
  shareTexts,
  textsOf,
  validateSource,
  type CodeInfoWire,
  type CodeProblem,
  type CodeSamples,
  type CodeText,
  type FontBytes,
  type HostMessage,
  type PoseStats,
} from "../../shared/codeScene.ts";
import {
  MASCOT_ASSET,
  MASCOT_FRAME,
  MASCOT_POSE_JS,
  MASCOT_SAMPLES,
  MASCOT_TEST,
  checkMascotSamples,
  mascotKey,
  mascotSig,
  validateMascotSource,
  type MascotCode,
  type MascotPose,
  type MascotResult,
} from "../../shared/mascot.ts";
import { BLUR_SUBFRAMES, blurSamples, cutPush, pushOf, timeScenes, type MotionScript, type TimedScene } from "../../shared/motion.ts";
import { safeRect } from "../../shared/safeZone.ts";
import { floorOf, mascotPoseAt, sceneAt, type CodeFrames, type MotionAsset, type MotionWorld } from "./motion.ts";

// ── The sandbox ────────────────────────────────────────────────────────────────────────────────────────────────
// The person's code never runs in the iframe's own document: a document can navigate itself away (sandbox and CSP do
// not stop that), and the page it lands on has neither. The iframe only holds a relay with no code of the person's;
// the code runs in a dedicated worker the relay starts from a blob. The worker inherits the iframe's CSP (no network,
// no eval, no imports) and cannot navigate anything; the relay checks the token, strips it before passing a message
// on (the code never sees it), and adds it to the worker's answers.
//
// The worker's runtime runs first: it keeps what it needs (the clock for the time limit, OffscreenCanvas, FontFace,
// its channel to the relay), then blocks the clocks, randomness, timers and network for the scene's code, which comes
// next in the same script; its last line says whether draw exists. An error before that (a syntax error, or a throw
// at the top of the code) reaches the relay, which answers "ready" with it and its line.
const WORKER_RUNTIME = `(function () {
  "use strict";
  var LIMIT = __LIMIT__;
  var CODE_LINE = __LINE__;
  var CODE_END = __END__;
  var MASCOT_LINE = __MASCOT_LINE__;
  var MASCOT_END = __MASCOT_END__;
  var MASCOT_MAIN = __MASCOT_MAIN__;
  var G = self;
  var send = G.postMessage.bind(G);
  var now = performance.now.bind(performance);
  var Canvas = OffscreenCanvas;
  var Face = FontFace;
  var fontSet = G.fonts;
  var listen = G.addEventListener.bind(G);
  var normalizePose = __POSE__;
  var firstError = null;
  function post(m, transfer) { send(m, transfer || []); }
  // A script line as a line of the person's code: the scene's, or the mascot's (its own lines from 1).
  function userLine(n) {
    n = Number(n);
    if (n >= CODE_LINE && n <= CODE_END) return { line: n - CODE_LINE + 1, mascot: false };
    if (MASCOT_LINE > 0 && n >= MASCOT_LINE && n <= MASCOT_END) return { line: n - MASCOT_LINE + 1, mascot: true };
    return null;
  }
  // The error as the person reads it: in a scene's sandbox, a line of the mascot says so.
  function located(message, at) {
    if (!at) return { message: message };
    if (at.mascot && !MASCOT_MAIN) return { message: "en el código de la mascota (línea " + at.line + "): " + message };
    return { message: message, line: at.line };
  }
  // The first place in the person's code on the error's stack (a blocked call throws from the runtime's own lines).
  function lineOf(e) {
    var re = /blob:[^\\s)]*?:(\\d+):\\d+/g, m, stack = String((e && e.stack) || "");
    while ((m = re.exec(stack))) { var k = userLine(m[1]); if (k) return k; }
    return null;
  }
  listen("error", function (e) {
    if (!firstError) firstError = located(String(e.message || "Error").replace(/^Uncaught /, ""), e.lineno ? userLine(e.lineno) : null);
  });
  function blocked(name, hint) {
    return function () { throw new Error(name + " no está permitido en una escena de código" + (hint ? ": " + hint : "")); };
  }
  function block(owner, name, value) {
    try { Object.defineProperty(owner, name, { value: value, configurable: false, writable: false }); } catch (x) {}
  }
  var random = "usá info.random(semilla)";
  Math.random = blocked("Math.random", random);
  // Randomness the browser gives without Math: the frame depends only on t.
  if (typeof crypto === "object" && crypto) {
    block(crypto, "getRandomValues", blocked("crypto.getRandomValues", random));
    block(crypto, "randomUUID", blocked("crypto.randomUUID", random));
    try { block(Object.getPrototypeOf(crypto), "getRandomValues", blocked("crypto.getRandomValues", random)); block(Object.getPrototypeOf(crypto), "randomUUID", blocked("crypto.randomUUID", random)); } catch (x) {}
  }
  ["setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask", "fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "Worker", "SharedWorker", "importScripts", "MessageChannel", "BroadcastChannel", "postMessage"].forEach(function (n) {
    block(G, n, blocked(n));
  });
  try { if (typeof DedicatedWorkerGlobalScope === "function") block(DedicatedWorkerGlobalScope.prototype, "postMessage", blocked("postMessage")); } catch (x) {}
  block(G, "performance", undefined);
  block(G, "Date", blocked("Date", "el cuadro depende solo de t"));
  // An event's own clock reads 0.
  try { Object.defineProperty(Event.prototype, "timeStamp", { get: function () { return 0; }, configurable: false }); } catch (x) {}
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
  var info = null, canvas = null, drawFn = null, mascotFn = null;
  // The mascot as the scene's code calls it: a safe pose, and the context left as it was.
  function drawMascot(ctx, t, pose) {
    if (!mascotFn) throw new Error("la serie no tiene mascota en código");
    ctx.save();
    try { mascotFn(ctx, Number(t) || 0, normalizePose(pose)); } finally { ctx.restore(); }
  }
  // What the sandbox measured of a pose: the box of the painted pixels, how many, their share and a fingerprint.
  function measure(ctx, w, h) {
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = 0, hash = 0x811c9dc5;
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      var a = data[i + 3];
      hash ^= data[i] ^ (data[i + 1] << 8) ^ (data[i + 2] << 16) ^ (a << 24);
      hash = Math.imul(hash, 0x01000193);
      if (a > 8) {
        ink++;
        var x = p % w, y = (p - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { box: ink ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null, ink: ink, share: ink / (w * h), hash: (hash >>> 0).toString(16) };
  }
  Object.defineProperty(G, "__codeReady", { configurable: false, writable: false, value: function (draw, mascot) {
    drawFn = typeof draw === "function" ? draw : null;
    mascotFn = typeof mascot === "function" ? mascot : null;
    if (mascotFn) block(G, "drawMascot", drawMascot);
    post({ type: "ready", hasDraw: !!drawFn, hasMascot: !!mascotFn, error: firstError || undefined });
  } });
  function fresh(w, h) {
    if (!canvas) canvas = new Canvas(w, h);
    // A new size clears the pixels and resets the drawing state: every frame starts fresh.
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext("2d", { willReadFrequently: false });
  }
  listen("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "init") {
      var assets = {};
      (m.assets || []).forEach(function (a) { assets[a.name] = a.bitmap; });
      var told = m.info.mascot;
      info = Object.freeze(Object.assign({}, m.info, {
        assets: Object.freeze(assets),
        random: function (seed) { return mulberry(Number(seed) || 0); },
        mascot: mascotFn && told ? Object.freeze({ name: String(told.name || ""), description: String(told.description || ""), unit: 400, draw: drawMascot }) : null
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
    if (m.type === "frame" || m.type === "pose") {
      var pose = m.type === "pose";
      var w = pose ? Math.max(1, Math.min(4096, Math.round(Number(m.w) || 1))) : info.width;
      var h = pose ? Math.max(1, Math.min(4096, Math.round(Number(m.h) || 1))) : info.height;
      var ctx = fresh(w, h);
      var error, texts, stats;
      var start = now();
      if (pose) {
        if (!mascotFn) error = { message: "No está la función drawMascot(ctx, t, pose)." };
        else {
          try { mascotFn(ctx, Number(m.t) || 0, normalizePose(m.pose)); } catch (err) { error = located(String((err && err.message) || err), lineOf(err)); }
        }
      } else if (!drawFn) error = { message: "No está la función draw(ctx, t, info)." };
      else {
        try { texts = drawFn(ctx, m.t, info); } catch (err) { error = located(String((err && err.message) || err), lineOf(err)); }
      }
      var ms = now() - start;
      if (!error && ms > LIMIT) error = { message: "el cuadro tardó " + Math.round(ms) + " ms y el límite es " + LIMIT + " ms: simplificá el dibujo" };
      if (pose && !error && m.measure) {
        try { stats = measure(ctx, w, h); } catch (x) { stats = undefined; }
      }
      var clean = null;
      if (Array.isArray(texts)) {
        clean = texts.slice(0, 60).map(function (x) {
          x = x || {};
          return { text: String(x.text == null ? "" : x.text).slice(0, 300), x: Number(x.x), y: Number(x.y), w: Number(x.w), h: Number(x.h) };
        });
      }
      var bitmap = canvas.transferToImageBitmap();
      post({ type: "frame", id: m.id, bitmap: bitmap, texts: error || pose ? [] : clean, ms: ms, stats: stats, error: error }, [bitmap]);
    }
  });
})();`;

// The iframe's relay: it starts the worker, passes the host's messages on without the token (only the ones from its
// parent with the token), and the worker's answers back with it. An error in the worker before it said "ready" (a
// syntax error, a throw at the top of the code) is the "ready" answer, with the line in the person's code.
const RELAY = `(function () {
  "use strict";
  var TOKEN = __TOKEN__;
  var CODE_LINE = __LINE__;
  var CODE_END = __END__;
  var MASCOT_LINE = __MASCOT_LINE__;
  var MASCOT_END = __MASCOT_END__;
  var MASCOT_MAIN = __MASCOT_MAIN__;
  var host = window.parent;
  var ready = false;
  function post(m, transfer) { m.token = TOKEN; host.postMessage(m, "*", transfer || []); }
  function failed(message, n) {
    if (ready) return;
    ready = true;
    n = Number(n);
    var error = { message: message };
    if (n >= CODE_LINE && n <= CODE_END) error.line = n - CODE_LINE + 1;
    else if (MASCOT_LINE > 0 && n >= MASCOT_LINE && n <= MASCOT_END) {
      if (MASCOT_MAIN) error.line = n - MASCOT_LINE + 1;
      else error.message = "en el código de la mascota (línea " + (n - MASCOT_LINE + 1) + "): " + message;
    }
    post({ type: "ready", hasDraw: false, hasMascot: false, error: error });
  }
  var worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([__WORKER__], { type: "text/javascript" })));
  } catch (x) {
    failed("No pude arrancar la animación en su caja: " + String((x && x.message) || x), 0);
    return;
  }
  worker.addEventListener("error", function (e) {
    if (ready) return;
    e.preventDefault();
    failed(String(e.message || "Error").replace(/^Uncaught /, ""), e.lineno);
  });
  worker.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "ready") {
      if (ready) return;
      ready = true;
    }
    post(m, m.bitmap ? [m.bitmap] : []);
  });
  window.addEventListener("message", function (e) {
    if (e.source !== host) return;
    var m = e.data;
    if (!m || typeof m !== "object" || m.token !== TOKEN) return;
    var out = {};
    for (var k in m) if (k !== "token") out[k] = m[k];
    var transfer = m.type === "init" ? (m.assets || []).map(function (a) { return a && a.bitmap; }).filter(Boolean) : [];
    worker.postMessage(out, transfer);
  });
})();`;

// The worker's script for this code: the runtime, the series' mascot when it has one, the scene's code, the line
// that says what it defined. `codeLine`: the script line where the person's code starts, so a line in an error
// reads as the line of their code. "Mascota en código": the series' mascot goes in before the scene's code, wrapped
// in a function so its helpers stay its own (a scene's `ease` never replaces the mascot's), and reaches the scene as
// info.mascot.draw and drawMascot. `main`: the mascot is the code under test (the paste box, a character scene), so
// its errors carry its own line numbers.
export function sandboxWorker(
  source: string,
  limitMs = CODE_FRAME_MS,
  mascot?: { source: string; main?: boolean } | null,
): { js: string; codeLine: number; codeEnd: number; mascotLine: number; mascotEnd: number } {
  // The pose normaliser goes in first: it has lines of its own.
  const withPose = WORKER_RUNTIME.replace("__POSE__", MASCOT_POSE_JS);
  const runtimeLines = withPose.split("\n").length;
  const mascotCode = mascot?.source.trim() ? mascot.source : null;
  // After the runtime: the mascot's wrapper (its first line, its code, its end), then the scene's code.
  const mascotLines = mascotCode ? ["var __mascot = (function () {", mascotCode, ';return typeof drawMascot === "function" ? drawMascot : null;', "})();"] : [];
  const mascotLine = mascotCode ? runtimeLines + 2 : 0;
  const mascotEnd = mascotCode ? mascotLine + mascotCode.split("\n").length - 1 : 0;
  const mascotLength = mascotCode ? mascotLines.join("\n").split("\n").length : 0;
  const codeLine = runtimeLines + mascotLength + 1;
  const codeEnd = codeLine + source.split("\n").length - 1;
  const runtime = withPose
    .replace("__LIMIT__", String(limitMs))
    .replace("__LINE__", String(codeLine))
    .replace("__END__", String(codeEnd))
    .replace("__MASCOT_LINE__", String(mascotLine))
    .replace("__MASCOT_END__", String(mascotEnd))
    .replace("__MASCOT_MAIN__", mascot?.main ? "true" : "false");
  const js = [
    runtime,
    ...mascotLines,
    source,
    ';self.__codeReady(typeof draw === "function" ? draw : null, typeof __mascot === "function" ? __mascot : null);',
  ].join("\n");
  return { js, codeLine, codeEnd, mascotLine, mascotEnd };
}

// The iframe's whole document for this code and token: a strict CSP (only its own inline script, blob: workers,
// blob:/data: pictures and fonts) and the relay, with the worker's script inside it as a string.
export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; img-src blob: data:; font-src blob: data:";
export function sandboxDoc(
  source: string,
  token: string,
  limitMs = CODE_FRAME_MS,
  mascot?: { source: string; main?: boolean } | null,
): { html: string; worker: string; codeLine: number; mascotLine: number } {
  const w = sandboxWorker(source, limitMs, mascot);
  // As a string literal inside a <script>: a "<" never reaches the HTML parser ("</script", "<!--").
  const literal = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  const relay = RELAY.replace("__TOKEN__", literal(token))
    .replace("__LINE__", String(w.codeLine))
    .replace("__END__", String(w.codeEnd))
    .replace("__MASCOT_LINE__", String(w.mascotLine))
    .replace("__MASCOT_END__", String(w.mascotEnd))
    .replace("__MASCOT_MAIN__", mascot?.main ? "true" : "false")
    .replace("__WORKER__", () => literal(w.js));
  const html = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
    "</head><body>",
    "<script>",
    relay,
    "</script>",
    "</body></html>",
  ].join("\n");
  return { html, worker: w.js, codeLine: w.codeLine, mascotLine: w.mascotLine };
}

// The scene code of a sandbox that only draws the mascot (the paste box's test, a character scene).
export const MASCOT_STUB = "function draw(ctx, t, info) {\n  return [];\n}";

// ── The host side of the protocol ──────────────────────────────────────────────────────────────────────────────
// Where messages go (the iframe in the page; a fake in the tests).
export type SandboxPort = { post(message: HostMessage, transfer: Transferable[]): void; close(): void };
export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

// A bitmap as the runner keeps it (an ImageBitmap; a fake in the tests).
export type Bitmap = CanvasImageSource & { close?: () => void };
export type CodeFrame = { bitmap: Bitmap | null; texts: CodeText[] | null; ms: number; stats?: PoseStats; error?: { message: string; line?: number } };

type Pending = { resolve: (value: unknown) => void; reject: (e: Error) => void; timer: unknown };

// One sandbox: it says it is ready (and whether draw exists), takes the info, the fonts and the pictures once, then
// answers frames one at a time. Anything without its token is ignored. A request that gets no answer in time tears
// the sandbox down and fails everything still waiting.
export class CodeRunner {
  state: "loading" | "ready" | "inited" | "dead" = "loading";
  failure: string | null = null;
  // Whether the sandbox holds the series' mascot (drawMascot) once it is ready.
  hasMascot = false;
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
    // What the code under test must define: a scene's draw, or the mascot's drawMascot.
    private needs: "draw" | "mascot" = "draw",
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
      const missing = this.needs === "mascot" ? !m.hasMascot : !m.hasDraw;
      if (m.error || missing) {
        const why = m.error
          ? problemText(m.error)
          : this.needs === "mascot"
            ? "No encuentro la función drawMascot(ctx, t, pose): el código tiene que definirla."
            : "No encuentro la función draw(ctx, t, info): el código tiene que definirla.";
        this.failure = why;
        this.state = "dead";
        this.port.close();
        wait.reject(new Error(why));
        return;
      }
      this.state = "ready";
      this.hasMascot = m.hasMascot;
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
    p.resolve({ bitmap: (m.bitmap as Bitmap) ?? null, texts, ms: m.ms, ...(m.stats && { stats: m.stats }), ...(m.error && { error: m.error }) } satisfies CodeFrame);
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

  // The mascot alone at `pose`, at second t, on a transparent w x h canvas (measured when asked), after any frame
  // asked for before it.
  pose(t: number, pose: MascotPose, w: number, h: number, measure = false): Promise<CodeFrame> {
    const run = () => {
      if (this.state === "dead") return Promise.reject(new Error(this.failure ?? "La animación se detuvo."));
      const id = this.nextId++;
      return this.request(id, { token: this.token, type: "pose", id, t, pose, w, h, measure }, [], this.limits.hang, t) as Promise<CodeFrame>;
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

// The iframe's loads: the first is its own document; any later one means it went somewhere else (`onLeave` once).
export function loadGuard(onLeave: () => void): { onLoad: () => void; readonly left: boolean } {
  let loads = 0;
  return {
    onLoad: () => {
      loads++;
      if (loads === 2) onLeave();
    },
    get left() {
      return loads > 1;
    },
  };
}

// A runner that never had a sandbox: code the static check refused.
export function deadRunner(reason: string): CodeRunner {
  const timers: Timers = { set: () => 0, clear: () => undefined };
  const runner = new CodeRunner("", { post: () => undefined, close: () => undefined }, timers);
  runner.kill(reason);
  return runner;
}

// A sandbox in this page: a hidden iframe whose only channel is postMessage, checked by its window and token.
export type MascotMount = { source: string; main?: boolean } | null;
export function mountSandbox(source: string, mascot: MascotMount = null): CodeRunner {
  const token = crypto.randomUUID();
  const { html } = sandboxDoc(source, token, CODE_FRAME_MS, mascot);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:8px;height:8px;border:0;visibility:hidden;pointer-events:none";
  let runner: CodeRunner | null = null;
  // A document that loads a second time is no longer the relay (nothing in it navigates): nothing more goes to it.
  const navigated = loadGuard(() => runner?.kill("La animación intentó salir de su caja y se cerró."));
  const onMessage = (e: MessageEvent) => {
    if (!navigated.left && e.source === frame.contentWindow) runner?.receive(e.data);
  };
  const port: SandboxPort = {
    post: (message, transfer) => {
      if (!navigated.left) frame.contentWindow?.postMessage(message, "*", transfer);
    },
    close: () => {
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", navigated.onLoad);
      frame.remove();
    },
  };
  runner = new CodeRunner(token, port, realTimers, { load: CODE_LOAD_MS, hang: CODE_HANG_MS }, mascot?.main ? "mascot" : "draw");
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", navigated.onLoad);
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return runner;
}

// ── What a scene's code gets ─────────────────────────────────────────────────────────────────────────────────
export const sizeOf = (format: "vertical" | "horizontal") => (format === "vertical" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 });
export const formatOf = (w: number, h: number): "vertical" | "horizontal" => (h > w ? "vertical" : "horizontal");

// The info a scene's draw reads, at full size for the format: its timing, words and voice, the brand, the safe zone
// and the floor above the app's subtitle.
export function codeInfo(
  scene: TimedScene,
  format: "vertical" | "horizontal",
  world: Pick<MotionWorld, "brand" | "subtitles" | "disclosure">,
  tone?: string,
  mascot?: { name: string; description: string } | null,
): CodeInfoWire {
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
    mascot: mascot ? { name: mascot.name, description: mascot.description } : null,
  };
}

// The info of a sandbox that only draws the mascot: the brand and the canvas it is tested or drawn on.
export function mascotInfo(brand: MotionWorld["brand"], mascot: { name: string; description: string }, size: { w: number; h: number }): CodeInfoWire {
  return {
    width: size.w,
    height: size.h,
    format: formatOf(size.w, size.h),
    duration: 0,
    fps: 30,
    brand: { bg: brand.bg, text: brand.text, accent: brand.accent, displayFont: brand.displayFont, uiFont: brand.uiFont },
    tone: "warm",
    voice: "",
    words: [],
    emotion: "",
    safe: { x: 0, y: 0, w: size.w, h: size.h },
    floor: size.h,
    mascot: { name: mascot.name, description: mascot.description },
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

// "Mascota en código": which mascot poses frame t of the piece draws (piece time, pose): every character scene the
// series' code mascot hosts, on screen or leaving during the push, for every blur subframe. The same pose drawMotionFrame
// asks for (mascotPoseAt), so the frame is in hand under the same key.
export function mascotNeeds(script: MotionScript, t: number, world: MotionWorld, vertical: boolean, blur = false): { t: number; pose: MascotPose }[] {
  const scenes = timeScenes(script.scenes);
  if (!scenes.some((s) => s.template === "character" && s.asset === MASCOT_ASSET)) return [];
  const push = cutPush(script.tone);
  const times = blur ? blurSamples(script.scenes, push, t).map((s) => s.at) : [t];
  const out = new Map<string, { t: number; pose: MascotPose }>();
  const add = (scene: TimedScene, at: number, lt: number) => {
    if (scene.template !== "character" || scene.asset !== MASCOT_ASSET) return;
    const pose = mascotPoseAt(world, scene, at, lt, vertical, script.tone);
    out.set(mascotKey(at, pose), { t: at, pose });
  };
  for (const at of times) {
    const i = sceneAt(scenes, at);
    const s = scenes[i];
    const lt = at - s.start;
    add(s, at, lt);
    if (i > 0 && lt < pushOf(s, push)) add(scenes[i - 1], at, scenes[i - 1].seconds - 0.001);
  }
  return [...out.values()];
}

const frameKey = (lt: number) => lt.toFixed(4);
// How many frames a scene keeps (the latest is never dropped while it is shown); the mascot's are bigger and fewer,
// but never fewer than one frame can ask for: every blur subframe of a push between two mascot scenes, and a margin.
const KEEP = 32;
const MASCOT_KEEP = BLUR_SUBFRAMES * 2 + 8;

type Entry = {
  runner: CodeRunner;
  sig: string;
  started: Promise<void>;
  frames: Map<string, Bitmap>;
  latest: Bitmap | null;
  inflight: boolean;
  wanted: { key: string; ask: () => Promise<CodeFrame>; at: number } | null;
  problem: string | null;
  keep: number;
};

export type CodeDeckOptions = {
  // The brand fonts' files (fontBytes in src/lib/fonts.ts).
  fonts: (families: string[]) => Promise<FontBytes[]>;
  // The format of a frame asked for without a size.
  format: "vertical" | "horizontal";
  // A sandbox for this code, with the series' mascot when it has one (mountSandbox; a fake in the tests).
  mount?: (source: string, mascot?: MascotMount) => CodeRunner;
  // A render: a frame that fails stops it (ready throws), never a placeholder in a finished video.
  strict?: boolean;
  // "Mascota en código": the series' mascot, injected into every code scene's sandbox and drawn by the character
  // scenes that use it (MASCOT_ASSET). null: the series has none.
  mascot?: MascotCode | null;
};

export const NO_MASCOT = "La serie no tiene mascota en código: armala en Editar serie → Mascota en código.";

// Every code scene's sandbox, one per scene and format, made again when its code, pictures, info or the series'
// mascot change; and one sandbox for the mascot itself when a character scene draws it.
export class CodeDeck implements CodeFrames {
  private entries = new Map<string, Entry>();
  constructor(readonly opts: CodeDeckOptions) {}

  private get mascotCode(): MascotCode | null {
    return this.opts.mascot?.source.trim() ? this.opts.mascot : null;
  }

  // The series' mascot changed (saved in Editar serie, or loaded after the deck was made): every sandbox that carries
  // it is made again on its next frame.
  setMascot(mascot: MascotCode | null) {
    const before = this.mascotCode ? mascotSig(this.mascotCode.source) : "";
    this.opts.mascot = mascot;
    const after = this.mascotCode ? mascotSig(this.mascotCode.source) : "";
    if (before === after) return;
    for (const key of [...this.entries.keys()]) this.drop(key);
  }

  private entry(scene: TimedScene, format: "vertical" | "horizontal", world: MotionWorld, tone?: string): Entry | null {
    const code = scene.code;
    const key = `${scene.id}|${format}`;
    if (!code?.source.trim()) {
      this.drop(key);
      return null;
    }
    const mascot = this.mascotCode;
    const info = codeInfo(scene, format, world, tone, mascot);
    const sig = codeSig([code.source, code.assets, info, mascot ? mascotSig(mascot.source) : ""]);
    const had = this.entries.get(key);
    if (had && had.sig === sig) return had;
    if (had) this.drop(key);
    const static_ = validateSource(code.source, { mascot: Boolean(mascot) }).find((p) => p.fatal);
    // Code the static check refuses never runs (an imported project's code included).
    const runner = static_ ? deadRunner(static_.message) : (this.opts.mount ?? mountSandbox)(code.source, mascot ? { source: mascot.source } : null);
    const entry: Entry = { runner, sig, started: Promise.resolve(), frames: new Map(), latest: null, inflight: false, wanted: null, problem: null, keep: KEEP };
    entry.started = (async () => {
      if (static_) throw new Error(static_.message);
      await runner.whenReady();
      const families = [info.brand.displayFont, info.brand.uiFont];
      const [fonts, assets] = await Promise.all([this.opts.fonts(families).catch(() => [] as FontBytes[]), assetBitmaps(code.assets, world.assets)]);
      const fontErrors = await runner.init(info, fonts, assets);
      // A render never goes out with another typeface: a brand font that did not reach the sandbox stops it.
      if (this.opts.strict) {
        const missing = [...new Set(families.filter((f) => f.trim() && !fonts.some((b) => b.family === f)))];
        if (missing.length || fontErrors.length)
          throw new Error(`No cargó la fuente ${[...missing.map((f) => `«${f}»`), ...fontErrors.map((f) => `«${f}»`)].join(", ")} en la escena de código: el render se frena para no salir con otra letra.`);
      }
    })().catch((e: unknown) => {
      entry.problem = e instanceof Error ? e.message : String(e);
      runner.dispose();
    });
    this.entries.set(key, entry);
    return entry;
  }

  // The mascot's own sandbox (the character scenes draw it at their pose). Null when the series has none.
  private mascotEntry(world: MotionWorld): Entry | null {
    const mascot = this.mascotCode;
    const key = "mascot";
    if (!mascot) {
      this.drop(key);
      return null;
    }
    const sig = codeSig([mascotSig(mascot.source), world.brand.bg, world.brand.text, world.brand.accent]);
    const had = this.entries.get(key);
    if (had && had.sig === sig) return had;
    if (had) this.drop(key);
    const static_ = validateMascotSource(mascot.source).find((p) => p.fatal);
    const runner = static_ ? deadRunner(`La mascota: ${static_.message}`) : (this.opts.mount ?? mountSandbox)(MASCOT_STUB, { source: mascot.source, main: true });
    const entry: Entry = { runner, sig, started: Promise.resolve(), frames: new Map(), latest: null, inflight: false, wanted: null, problem: null, keep: MASCOT_KEEP };
    entry.started = (async () => {
      if (static_) throw new Error(`La mascota: ${static_.message}`);
      await runner.whenReady();
      await runner.init(mascotInfo(world.brand, mascot, MASCOT_FRAME), [], []);
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

  private keep(e: Entry, key: string, bitmap: Bitmap) {
    const old = e.frames.get(key);
    if (old && old !== bitmap && old !== e.latest) old.close?.();
    e.frames.delete(key);
    e.frames.set(key, bitmap);
    this.show(e, bitmap);
    while (e.frames.size > e.keep) {
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

  // Asks one frame and keeps it under its key. A failure is kept as the entry's problem.
  private async fetchWith(e: Entry, key: string, ask: () => Promise<CodeFrame>, at: number): Promise<void> {
    await e.started;
    if (e.problem) return;
    try {
      const got = await ask();
      if (got.error) {
        e.problem = problemText(got.error, at);
        got.bitmap?.close?.();
        return;
      }
      if (got.bitmap) this.keep(e, key, got.bitmap);
    } catch (err) {
      e.problem = err instanceof Error ? err.message : String(err);
    }
  }
  private fetch(e: Entry, lt: number): Promise<void> {
    return this.fetchWith(e, frameKey(lt), () => e.runner.frame(lt), lt);
  }
  private fetchPose(e: Entry, t: number, pose: MascotPose): Promise<void> {
    return this.fetchWith(e, mascotKey(t, pose), () => e.runner.pose(t, pose, MASCOT_FRAME.w, MASCOT_FRAME.h), t);
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

  // The mascot painted at `pose` at piece time t (MASCOT_FRAME's canvas), else the latest one painted.
  mascot(t: number, pose: MascotPose): CanvasImageSource | null {
    const e = this.entries.get("mascot");
    if (!e || e.problem) return null;
    return e.frames.get(mascotKey(t, pose)) ?? e.latest;
  }

  mascotProblem(): string | null {
    if (!this.mascotCode) return NO_MASCOT;
    const e = this.entries.get("mascot");
    return e?.problem ? `La mascota: ${e.problem}` : null;
  }

  // Asks a mascot frame and, while one is on its way, keeps only the newest wish (the live preview).
  private follows(e: Entry, key: string, ask: () => Promise<CodeFrame>, at: number) {
    const had = e.frames.get(key);
    if (had) {
      this.show(e, had);
      return;
    }
    if (e.inflight) {
      e.wanted = { key, ask, at };
      return;
    }
    e.inflight = true;
    const go = (k: string, q: () => Promise<CodeFrame>, a: number): Promise<void> =>
      this.fetchWith(e, k, q, a).then(() => {
        const again = e.wanted;
        e.wanted = null;
        return again && again.key !== k ? go(again.key, again.ask, again.at) : undefined;
      });
    void go(key, ask, at).finally(() => {
      e.inflight = false;
    });
  }

  // Frame-exact: every code frame and mascot pose frame t draws is in hand before this resolves. Strict (a render): a
  // scene with no code, a failed test, a failing frame or a missing or failing mascot throws.
  async ready(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }): Promise<void> {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    const needs = codeNeeds(script, t, Boolean(world.cutBlur));
    const poses = mascotNeeds(script, t, world, format === "vertical", Boolean(world.cutBlur));
    await Promise.all([
      ...needs.map(async ({ scene, lt }) => {
        const failed = this.errorOf(scene, format, script.tone);
        if (this.opts.strict && failed) throw new Error(`La escena ${scene.index + 1} (código) falló en su última prueba: ${failed}`);
        const e = this.entry(scene, format, world, script.tone);
        if (!e) {
          if (this.opts.strict) throw new Error(`La escena ${scene.index + 1} es una escena de código sin código: pegalo o cambiá la plantilla.`);
          return;
        }
        if (!e.frames.has(frameKey(lt))) await this.fetch(e, lt);
        if (this.opts.strict && e.problem) throw new Error(`La escena ${scene.index + 1} (código): ${e.problem}`);
      }),
      (async () => {
        if (!poses.length) return;
        const e = this.mascotEntry(world);
        if (!e) {
          if (this.opts.strict) throw new Error(NO_MASCOT);
          return;
        }
        for (const { t: at, pose } of poses) if (!e.frames.has(mascotKey(at, pose))) await this.fetchPose(e, at, pose);
        if (this.opts.strict && e.problem) throw new Error(`La mascota: ${e.problem}`);
      })(),
    ]);
  }

  // The live preview (no wait): asks the frame for t when the scene's sandbox is free; the drawing shows the latest.
  follow(script: MotionScript, t: number, world: MotionWorld, size?: { w: number; h: number }) {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    for (const { scene, lt } of codeNeeds(script, t, false)) {
      const e = this.entry(scene, format, world, script.tone);
      if (!e || e.problem) continue;
      this.follows(e, frameKey(lt), () => e.runner.frame(lt), lt);
    }
    const poses = mascotNeeds(script, t, world, format === "vertical", false);
    if (!poses.length) return;
    const e = this.mascotEntry(world);
    if (!e || e.problem) return;
    for (const { t: at, pose } of poses) this.follows(e, mascotKey(at, pose), () => e.runner.pose(at, pose, MASCOT_FRAME.w, MASCOT_FRAME.h), at);
  }

  // Loads every code scene of the script and draws its first frame, and the mascot when a character scene uses it:
  // the problems, by scene (a render stops on them).
  async check(script: MotionScript, world: MotionWorld, size?: { w: number; h: number }): Promise<{ index: number; problem: string }[]> {
    const format = size ? formatOf(size.w, size.h) : this.opts.format;
    const out: { index: number; problem: string }[] = [];
    const timed = timeScenes(script.scenes);
    for (const scene of timed.filter((s) => s.template === "code")) {
      const failed = this.errorOf(scene, format, script.tone);
      if (failed) {
        out.push({ index: scene.index, problem: failed });
        continue;
      }
      const e = this.entry(scene, format, world, script.tone);
      if (!e) {
        out.push({ index: scene.index, problem: "no tiene código" });
        continue;
      }
      await this.fetch(e, 0);
      if (e.problem) {
        out.push({ index: scene.index, problem: e.problem });
        continue;
      }
      // A 9:16 render checks the texts against the phone's safe zone in this very format, whatever format the piece
      // was tested in (a horizontal piece also rendered vertical).
      if (this.opts.strict && format === "vertical") {
        const breaches = await this.verticalBreaches(e, scene, world, script.tone);
        if (breaches) out.push({ index: scene.index, problem: breaches });
      }
    }
    const hosted = timed.filter((s) => s.template === "character" && s.asset === MASCOT_ASSET);
    if (hosted.length) {
      const e = this.mascotEntry(world);
      const first = hosted[0];
      if (!e) out.push({ index: first.index, problem: NO_MASCOT });
      else {
        const pose = mascotPoseAt(world, first, first.start, 0, format === "vertical", script.tone);
        await this.fetchPose(e, first.start, pose);
        if (e.problem) out.push({ index: first.index, problem: `la mascota: ${e.problem}` });
      }
    }
    return out;
  }

  // The texts a code scene draws on 9:16 that leave the safe zone or reach the subtitle: from its samples when they
  // were taken on 9:16 as it plays now, else sampled here in this sandbox. null: none.
  private async verticalBreaches(e: Entry, scene: TimedScene, world: MotionWorld, tone?: string): Promise<string | null> {
    const { w, h } = sizeOf("vertical");
    const mascot = this.mascotCode;
    const sig = samplesSig(scene, "vertical", tone, mascot ? mascotSig(mascot.source) : undefined);
    let samples = scene.code?.samples?.sig === sig ? scene.code.samples : null;
    if (!samples) {
      const test = await sampleRunner(e.runner, scene.seconds, { w, h }, sig).catch((err: unknown) => ({ problems: [{ message: err instanceof Error ? err.message : String(err), fatal: true }], samples: null }));
      const fatal = test.problems.find((p) => p.fatal);
      if (fatal || !test.samples) return fatal?.message ?? "no se pudo probar en 9:16";
      samples = test.samples;
    }
    const breaches = verticalBreaches(scene, samples, Boolean(world.disclosure));
    return breaches.length ? breaches.map((b) => `«${b.text}» ${BREACH_LABEL[b.where]} en 9:16 (desde t = ${b.at.toFixed(1)} s)`).join("; ") + ". Pedile a Opus que lo suba o lo achique." : null;
  }

  // The scene's last failed test, while it is for the way the scene plays now in this format (codeError).
  private errorOf(scene: TimedScene, format: "vertical" | "horizontal", tone?: string): string | null {
    const mascot = this.mascotCode;
    return codeError(scene.code, samplesSig(scene, format, tone, mascot ? mascotSig(mascot.source) : undefined));
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
  // The same t again, after every other sample: a frame that keeps something between calls (a counter, a clock the
  // runtime missed) draws something else. The one with the most texts, so a change shows.
  if (frames.length && !problems.some((p) => p.fatal)) {
    const k = frames.reduce((best, f, i) => (f.length > frames[best].length ? i : best), frames.length - 1);
    const again = await runner.frame(times[k]).catch(() => null);
    again?.bitmap?.close?.();
    const before = JSON.stringify(frames[k]);
    const after = again && !again.error ? JSON.stringify(shareTexts(again.texts ?? [], size.w, size.h)) : before;
    if (after !== before) {
      const said = (f: CodeText[]) => f.map((x) => x.text).join(" · ") || "nada";
      problems.push({
        message: `draw no es una función pura de t: en t = ${times[k].toFixed(2)} s dibujó «${said(frames[k])}» y la segunda vez «${said(shareTexts(again!.texts ?? [], size.w, size.h))}». No guardes variables entre cuadros ni leas un reloj o azar: todo sale de t (y de info.random).`,
        fatal: true,
      });
    }
  }
  return { problems, samples: problems.some((p) => p.fatal) ? null : { sig, step: times.length > 1 ? times[1] - times[0] : 0.1, frames }, slowest };
}

// The whole test of pasted code in a fresh sandbox: the static check, loading, then every sample time. With the
// series' mascot, the sandbox carries it as it will in the video (info.mascot, drawMascot).
export async function testCode(
  source: string,
  scene: TimedScene,
  format: "vertical" | "horizontal",
  world: MotionWorld,
  tone: string | undefined,
  fonts: (families: string[]) => Promise<FontBytes[]>,
  sig: string,
  mount: (source: string, mascot?: MascotMount) => CodeRunner = mountSandbox,
  mascot: MascotCode | null = null,
): Promise<CodeTest> {
  const withMascot = mascot?.source.trim() ? mascot : null;
  const problems = validateSource(source, { mascot: Boolean(withMascot) });
  if (problems.some((p) => p.fatal)) return { problems, samples: null, slowest: 0 };
  const runner = mount(source, withMascot ? { source: withMascot.source } : null);
  try {
    await runner.whenReady();
    const info = codeInfo(scene, format, world, tone, withMascot);
    const [fontFiles, assets] = await Promise.all([fonts([info.brand.displayFont, info.brand.uiFont]).catch(() => []), assetBitmaps(scene.code?.assets ?? [], world.assets)]);
    const fontErrors = await runner.init(info, fontFiles, assets);
    const result = await sampleRunner(runner, scene.seconds, sizeOf(format), sig);
    if (fontErrors.length) result.problems.push({ message: `No cargaron estas fuentes en la animación: ${fontErrors.join(", ")}. Se ve con otra letra.`, fatal: false });
    if (withMascot && !runner.hasMascot) result.problems.push({ message: "La mascota de la serie no cargó en esta escena (su código tiene un error): probala de nuevo en Editar serie.", fatal: false });
    return { ...result, problems: [...problems, ...result.problems] };
  } catch (e) {
    return { problems: [...problems, { message: e instanceof Error ? e.message : String(e), fatal: true }], samples: null, slowest: 0 };
  } finally {
    runner.dispose();
  }
}

// ── "Mascota en código": the paste box's test ──────────────────────────────────────────────────────────────────
// Every sample pose drawn on the test canvas, measured, with its picture (the contact sheet); what they say
// (checkMascotSamples) after the static check. Each shot's bitmap is the caller's to close.
export type MascotShot = { id: string; label: string; bitmap: Bitmap | null; sheet: boolean };
export type MascotTest = { problems: CodeProblem[]; shots: MascotShot[]; slowest: number };
export async function testMascot(
  source: string,
  brand: MotionWorld["brand"],
  meta: { name: string; description: string },
  mount: (source: string, mascot?: MascotMount) => CodeRunner = mountSandbox,
): Promise<MascotTest> {
  const problems = validateMascotSource(source, brand);
  if (problems.some((p) => p.fatal)) return { problems, shots: [], slowest: 0 };
  const runner = mount(MASCOT_STUB, { source, main: true });
  const shots: MascotShot[] = [];
  const results: MascotResult[] = [];
  let slowest = 0;
  try {
    await runner.whenReady();
    await runner.init(mascotInfo(brand, meta, MASCOT_TEST), [], []);
    for (const sample of MASCOT_SAMPLES) {
      const got = await runner.pose(sample.t, sample.pose, MASCOT_TEST.w, MASCOT_TEST.h, true);
      slowest = Math.max(slowest, got.ms);
      results.push({ id: sample.id, label: sample.label, ms: got.ms, stats: got.stats ?? null, ...(got.error && { error: got.error }) });
      shots.push({ id: sample.id, label: sample.label, bitmap: got.error ? null : got.bitmap, sheet: Boolean(sample.sheet) });
      if (got.error) got.bitmap?.close?.();
    }
    return { problems: [...problems, ...checkMascotSamples(results)], shots, slowest };
  } catch (e) {
    for (const s of shots) s.bitmap?.close?.();
    return { problems: [...problems, { message: e instanceof Error ? e.message : String(e), fatal: true }], shots: [], slowest };
  } finally {
    runner.dispose();
  }
}

// ── What blocks a render ───────────────────────────────────────────────────────────────────────────────────────
// A code scene with no code, whose last test failed, not tested as it is now (its code, length, words or the format
// changed: the studio tests it again by itself), or with a text out of the 9:16 safe zone or over the subtitle.
// Reading holds go with readingIssues and numbers with figureIssues, like every other scene.
export type CodeIssue = { sceneId: string; index: number; text: string; stale?: true };
// The texts of a scene's samples out of the 9:16 safe zone or over the subtitle.
function verticalBreaches(scene: TimedScene, samples: CodeSamples, notice: boolean) {
  const { w, h } = sizeOf("vertical");
  const safe = safeRect(w, h);
  return codeBreaches(samples, { x: safe.x / w, y: safe.y / h, w: safe.w / w, h: safe.h / h }, floorOf(scene, w, h, notice) / h);
}
export function codeIssues(scenes: TimedScene[], format: "vertical" | "horizontal", notice: boolean, sigOf: (scene: TimedScene) => string): CodeIssue[] {
  return scenes.flatMap((s): CodeIssue[] => {
    if (s.template !== "code") return [];
    const n = s.index + 1;
    if (!s.code?.source.trim()) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: es de código y todavía no tiene código. Copiá el prompt para Opus y pegá su respuesta.` }];
    const sig = sigOf(s);
    const error = codeError(s.code, sig);
    if (error) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: la última prueba del código falló (${error}).` }];
    const samples = s.code.samples;
    if (!samples || samples.sig !== sig) return [{ sceneId: s.id, index: s.index, text: `Escena ${n}: probando el código otra vez (cambió la escena, su largo o el formato)…`, stale: true }];
    if (format !== "vertical") return [];
    return verticalBreaches(s, samples, notice).map((b) => ({ sceneId: s.id, index: s.index, text: `Escena ${n}: «${b.text}» ${BREACH_LABEL[b.where]} (desde t = ${b.at.toFixed(1)} s). Pedile a Opus que lo suba o lo achique.` }));
  });
}
