// "Escena de código": the scene's animation is JavaScript the person pastes (written by Opus in claude.ai). The paste
// cleaning, the static check, the prompt, the checks on the texts the code says it drew, the sandbox's document and its
// message protocol (with a fake iframe), and the deck every exact capture waits on.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODE_CONTRACT,
  CODE_EXAMPLE,
  CODE_FRAME_MS,
  codeBreaches,
  codeHolds,
  codeReveals,
  readSandboxMessage,
  sampleTimes,
  samplesSig,
  stripFences,
  textsOf,
  validateSource,
  type CodeSamples,
  type HostMessage,
} from "../shared/codeScene.ts";
import { MOTION_VOCABULARY, codePrompt, emotionMotion, type CodePromptInput } from "../shared/codePrompt.ts";
import { blankScene, figureIssues, quietGaps, readingIssues, readingNeed, timeScenes, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { CodeDeck, CodeRunner, codeInfo, codeIssues, codeNeeds, sampleRunner, sandboxDoc, type SandboxPort, type Timers } from "../src/lib/codeSandbox.ts";
import { drawMotionFrame, type MotionWorld } from "../src/lib/motion.ts";
import { pieceMarkdown } from "../src/lib/motionMarkdown.ts";
import { drawReady } from "../src/lib/screenVideo.ts";
import { newMotionPiece } from "../shared/motion.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("code"), ...o });
const world = (o: Partial<MotionWorld> = {}): MotionWorld => ({ brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 1, disclosure: "", ...o });
const script = (scenes: MotionScene[], tone: MotionScript["tone"] = "warm"): MotionScript => ({ problem: "p", title: "t", durationNote: "", note: "", music: { mood: "drive", bpm: 100 }, tone, scenes });

// ── Pasting ────────────────────────────────────────────────────────────────────────────────────────────────────
test("the code comes out of a pasted reply: its fenced block, the one that defines draw, no fences", () => {
  assert.equal(stripFences("function draw(ctx, t, info) { return []; }\n"), "function draw(ctx, t, info) { return []; }");
  const reply = "Acá va la animación: las letras caen.\n\n```js\nfunction draw(ctx, t, info) {\n  return [];\n}\n```\n\nCualquier cosa avisame.";
  assert.equal(stripFences(reply), "function draw(ctx, t, info) {\n  return [];\n}");
  assert.equal(stripFences(reply.replace("```js", "```javascript").replace(/\n/g, "\r\n")), "function draw(ctx, t, info) {\n  return [];\n}");
  // Two blocks: the one with draw wins over a longer helper or a JSON sample.
  const two = "```json\n{\"a\": 1, \"long\": \"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"}\n```\n\n```js\nconst draw = (ctx, t, info) => [];\n```";
  assert.equal(stripFences(two), "const draw = (ctx, t, info) => [];");
  // A reply cut before its closing fence still gives its code.
  assert.equal(stripFences("Va:\n```js\nfunction draw(ctx, t) { return []; }"), "function draw(ctx, t) { return []; }");
});

test("the static check says what is wrong, with the line, before anything runs", () => {
  assert.deepEqual(validateSource(CODE_EXAMPLE), []);
  assert.match(validateSource("")[0].message, /No hay código/);
  assert.match(validateSource("function paint(ctx) {}")[0].message, /draw\(ctx, t, info\)/);
  const random = validateSource("function draw(ctx, t, info) {\n  const x = 1;\n  const y = Math.random();\n  return [];\n}");
  assert.equal(random.length, 1);
  assert.equal(random[0].line, 3);
  assert.match(random[0].message, /Línea 3: usa Math\.random/);
  assert.ok(validateSource("function draw(ctx, t) { setTimeout(() => 0, 9); return []; }").some((p) => /temporizadores/.test(p.message)));
  assert.ok(validateSource("async function draw(ctx, t) { return []; }").some((p) => /asíncrono/.test(p.message)));
  assert.ok(validateSource("function draw(ctx, t) { fetch('/api/status'); return []; }").some((p) => /red/.test(p.message)));
  assert.ok(validateSource("function draw(ctx, t) { const d = new Date(); return []; }").some((p) => /Date/.test(p.message)));
  // A banned word in a comment or inside a string on screen is not code.
  assert.deepEqual(validateSource('// no Math.random, no setTimeout\nfunction draw(ctx, t) {\n  ctx.fillText("Date de vencimiento", 0, 0);\n  /* fetch nothing */\n  return [];\n}'), []);
  assert.match(validateSource(`function draw(){return []}\n//${"x".repeat(90_000)}`)[0].message, /muy largo/);
});

test("what draw returns is kept only as a list of texts with a finite box", () => {
  assert.equal(textsOf(undefined), null);
  assert.equal(textsOf({ text: "x" }), null);
  assert.deepEqual(textsOf([{ text: "Hola", x: 1, y: 2, w: 30, h: 10 }, { text: "", x: 0, y: 0, w: 1, h: 1 }, { text: "sin caja" }, null, { text: 12, x: 0, y: 0, w: -5, h: 4 }]), [
    { text: "Hola", x: 1, y: 2, w: 30, h: 10 },
    { text: "12", x: 0, y: 0, w: 5, h: 4 },
  ]);
});

test("the example in the prompt follows the contract: draw is a pure function of t and returns its texts", () => {
  const draw = new Function(`${CODE_EXAMPLE}; return draw;`)() as (ctx: unknown, t: number, info: unknown) => { text: string }[];
  const ops: string[] = [];
  const own: Record<string, unknown> = { measureText: (t: string) => ({ width: t.length * 50 }), fillText: (t: string, x: number, y: number) => ops.push(`${t}@${x.toFixed(1)},${y.toFixed(1)}`) };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true });
  const info = codeInfo(timeScenes([scene({ id: "c", seconds: 3 })])[0], "vertical", world());
  const late = draw(ctx, 2, info);
  assert.deepEqual(late.map((t) => t.text), ["Stock", "al", "día"]);
  const first = [...ops];
  ops.length = 0;
  draw(ctx, 0.3, info);
  ops.length = 0;
  draw(ctx, 2, info);
  assert.deepEqual(ops, first, "the same t paints the same frame, whatever came before");
  assert.deepEqual(draw(ctx, 0, info), [], "nothing on screen yet");
});

// ── The prompt ─────────────────────────────────────────────────────────────────────────────────────────────────
const input = (o: Partial<CodePromptInput> = {}): CodePromptInput => ({
  piece: { title: "El pedido sale solo", problem: "Pedir a ojo deja la góndola vacía", tone: "dry" },
  scene: { index: 1, count: 4, seconds: 4.5, title: "Planificación automatizada", text: "", voice: "El pedido se arma solo.", emotion: "con fastidio", disclosure: "concept" },
  format: "vertical",
  width: 1080,
  height: 1920,
  fps: 30,
  brand: { bg: "#101418", text: "#f4f4f1", accent: "#ff6b35", displayFont: "Archivo Black", uiFont: "Inter" },
  assets: [{ name: "stock-buscar", kind: "real screen of the app (a screenshot)", what: "Buscar un producto en el stock", width: 1170, height: 2532 }],
  words: [{ text: "El", start: 0.25, end: 0.4 }],
  safe: { x: 54, y: 192, w: 896, h: 1344 },
  floor: 1400,
  ...o,
});

test("the prompt for Opus carries the contract, the example, the scene, the brand, the pictures, the moves and the rules", () => {
  const p = codePrompt(input());
  assert.match(p, /^Hola Opus/);
  assert.ok(p.includes(CODE_CONTRACT), "the same contract the runner enforces");
  assert.ok(p.includes(CODE_EXAMPLE));
  assert.ok(p.includes('"Planificación automatizada": still and fully visible for at least 1.7 s'), "its own reading time (long Spanish words)");
  assert.equal(readingNeed("Planificación automatizada"), 1.7);
  assert.ok(p.includes("background #101418, text #f4f4f1, accent #ff6b35"));
  assert.ok(p.includes('display font "Archivo Black"'));
  assert.ok(p.includes('info.assets["stock-buscar"]: real screen of the app (a screenshot), 1170 x 2532 px'));
  for (const m of MOTION_VOCABULARY) assert.ok(p.includes(m.move), m.move);
  assert.ok(p.includes("shakes and crumbles"), "frustration shakes");
  assert.match(p, /dry: deadpan.*Nothing bounces/);
  assert.ok(p.includes("nothing bounces or overshoots"));
  assert.ok(p.includes("Nothing grows from scale 0"));
  assert.ok(p.includes("x 54-950, y 192-1400 px"), "the safe zone in pixels, down to the floor");
  assert.ok(p.includes("CONCEPT"), "a labelled scene keeps its corner clear");
  assert.ok(p.includes("El@0.25"));
  assert.ok(p.includes(`${CODE_FRAME_MS} ms`));
  assert.ok(!p.includes("THE CURRENT CODE"));
  assert.ok(codePrompt(input({ current: "function draw(){return []}" })).includes("THE CURRENT CODE"));
  assert.ok(codePrompt(input({ piece: { title: "x", problem: "y", tone: "warm" } })).includes("Overshoot at most once"));
});

test("each feeling has its motion", () => {
  assert.match(emotionMotion("sorprendida"), /^surprise: pops/);
  assert.match(emotionMotion("con fastidio"), /^frustration: shakes/);
  assert.match(emotionMotion("aliviado"), /^relief: settles and breathes/);
  assert.match(emotionMotion(""), /^neutral/);
});

// ── The texts it drew ─────────────────────────────────────────────────────────────────────────────────────────
const box = (text: string, x = 0.1, y = 0.4) => ({ text, x, y, w: 0.3, h: 0.04 });
// Frames every 0.1 s: `fill(k)` gives the texts of frame k.
const samples = (n: number, fill: (k: number) => ReturnType<typeof box>[], sig = "s"): CodeSamples => ({ sig, step: 0.1, frames: Array.from({ length: n }, (_, k) => fill(k)) });

test("a text holds while it is drawn still; a moving one never holds; the hold starts after the scene comes in", () => {
  const s = samples(30, (k) => [...(k >= 5 && k < 20 ? [box("Hola mundo")] : []), ...(k >= 10 ? [box("se mueve", 0.1 + k * 0.01)] : [])]);
  const holds = codeHolds(s, 3);
  assert.deepEqual(holds.find((h) => h.text === "Hola mundo"), { text: "Hola mundo", from: 0.5, hold: 1.5 });
  assert.ok((holds.find((h) => h.text === "se mueve")?.hold ?? 0) <= 0.1 + 1e-9);
  // Held to the end of the scene, never past it.
  assert.equal(codeHolds(samples(30, () => [box("Fin")]), 2.95).find((h) => h.text === "Fin")?.hold, 2.95);
  // A scene sliding in for 0.4 s: the stretch counts from there.
  assert.equal(codeHolds(samples(10, () => [box("Ya")]), 1, 0.4)[0].hold, 0.6);
  assert.deepEqual(codeReveals(s), [0.5, 1]);
});

test("a code scene's texts go through the reading check, the numbers check and the 2-to-4-seconds check", () => {
  const short = samples(30, (k) => (k >= 20 && k < 26 ? [box("Planificación automatizada lista")] : []));
  const sc = scene({ id: "c", seconds: 3, code: { source: "function draw(){return []}", assets: [], samples: short } });
  const issues = readingIssues([sc], 0);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, "Texto de la animación");
  assert.equal(issues[0].has, 0.6);
  // Held long enough: no issue.
  const long = { ...sc, code: { ...sc.code!, samples: samples(30, (k) => (k >= 2 ? [box("Planificación automatizada lista")] : [])) } };
  assert.deepEqual(readingIssues([long], 0), []);
  // [VERIFY] and a number with no source, drawn by the code.
  const claims = { ...sc, code: { ...sc.code!, samples: samples(30, () => [box("Ahorrás 40 horas [VERIFY]")]) } };
  const figures = figureIssues([claims], "");
  assert.ok(figures.some((f) => f.verify));
  assert.ok(figures.some((f) => f.figure === "40"));
  // A quiet 6 s code scene whose only text arrives at once is a gap; one that brings a text every 2 s is not.
  const quiet = scene({ id: "q", seconds: 6, code: { source: "x", assets: [], samples: samples(60, () => [box("Uno")]) } });
  assert.equal(quietGaps([quiet], 0).length, 1);
  const busy = { ...quiet, code: { ...quiet.code!, samples: samples(60, (k) => [box("Uno"), ...(k >= 20 ? [box("Dos", 0.1, 0.5)] : []), ...(k >= 40 ? [box("Tres", 0.1, 0.6)] : [])]) } };
  assert.deepEqual(quietGaps([busy], 0), []);
});

test("a text out of the 9:16 safe zone or over the subtitle is named once, with where", () => {
  const safe = { x: 0.05, y: 0.1, w: 0.83, h: 0.7 };
  const s = samples(10, (k) => [box("Arriba", 0.1, 0.02), box("Bien", 0.1, 0.4), box("Abajo", 0.1, k > 4 ? 0.74 : 0.4), box("Botones", 0.8, 0.5)]);
  assert.deepEqual(
    codeBreaches(s, safe, 0.75).map((b) => [b.text, b.where, b.at]),
    [
      ["Arriba", "top", 0],
      ["Botones", "right", 0],
      ["Abajo", "subtitle", 0.5],
    ],
  );
});

test("a render waits for every code scene: no code, a failed test, untested as it plays now, or text out of the zone", () => {
  const sig = (s: MotionScene) => samplesSig(s, "vertical", "warm");
  const none = scene({ id: "a" });
  const failed = scene({ id: "b", code: { source: "function draw(){return []}", assets: [], error: "Línea 2: x is not defined" } });
  const stale = scene({ id: "c", code: { source: "function draw(){return []}", assets: [], samples: samples(30, () => []) } });
  const fresh: MotionScene = scene({ id: "d", seconds: 3, code: { source: "function draw(){return []}", assets: [] } });
  fresh.code!.samples = samples(30, () => [box("Afuera", 0.1, 0.01)], sig(fresh));
  const issues = codeIssues(timeScenes([none, failed, stale, fresh]), "vertical", false, sig);
  assert.equal(issues.length, 4);
  assert.match(issues[0].text, /todavía no tiene código/);
  assert.match(issues[1].text, /x is not defined/);
  assert.equal(issues[2].stale, true);
  assert.match(issues[3].text, /«Afuera» queda arriba/);
  // On 16:9 there is no phone band.
  assert.equal(codeIssues(timeScenes([{ ...fresh, code: { ...fresh.code!, samples: { ...fresh.code!.samples!, sig: samplesSig(fresh, "horizontal", "warm") } } }]), "horizontal", false, (s) => samplesSig(s, "horizontal", "warm")).length, 0);
  assert.deepEqual(sampleTimes(0.35), [0, 0.1, 0.2, 0.3]);
});

// ── The sandbox ────────────────────────────────────────────────────────────────────────────────────────────────
test("the sandbox document: a strict CSP, the token, the code on its own script with its first line known", () => {
  const code = 'function draw(ctx, t) {\n  ctx.fillText("</script><b>", 0, 0);\n  return [];\n}';
  const { html, codeLine } = sandboxDoc(code, "tok-123");
  assert.ok(html.includes(`content="default-src 'none'; script-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:"`));
  assert.ok(html.includes('var TOKEN = "tok-123";'));
  assert.ok(html.includes("var LIMIT = 250;"));
  assert.ok(!html.slice(html.indexOf("function draw")).split("\n")[1].includes("</script>"), "a </script> in the code cannot close its tag");
  assert.equal(html.split("\n")[codeLine - 1], "function draw(ctx, t) {");
  assert.ok(html.includes(`var CODE_LINE = ${codeLine};`));
  assert.ok(html.includes('Math.random = blocked("Math.random"'));
});

class FakePort implements SandboxPort {
  sent: { message: HostMessage; transfer: unknown[] }[] = [];
  closed = false;
  post(message: HostMessage, transfer: Transferable[]) {
    this.sent.push({ message, transfer });
  }
  close() {
    this.closed = true;
  }
}
class FakeTimers implements Timers {
  next = 1;
  live = new Map<number, { fn: () => void; ms: number }>();
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.live.set(id, { fn, ms });
    return id;
  }
  clear(h: unknown) {
    this.live.delete(h as number);
  }
  fire(ms: number) {
    for (const [id, t] of [...this.live]) if (t.ms === ms) {
      this.live.delete(id);
      t.fn();
    }
  }
}
const tick = () => new Promise((r) => setImmediate(r));
const bitmap = (name: string) => ({ name, closed: false, close() { this.closed = true; } });

test("the protocol: ready, init with the pictures transferred, frames one at a time, other tokens ignored", async () => {
  const port = new FakePort();
  const timers = new FakeTimers();
  const r = new CodeRunner("T", port, timers);
  r.receive({ token: "other", type: "ready", hasDraw: true });
  assert.equal(r.state, "loading");
  r.receive({ token: "T", type: "ready", hasDraw: true });
  await r.whenReady();
  const pic = bitmap("pic");
  const init = r.init(codeInfo(timeScenes([scene({ id: "c" })])[0], "vertical", world()), [], [{ name: "stock", bitmap: pic as unknown as CanvasImageSource }]);
  await tick();
  assert.equal(port.sent[0].message.type, "init");
  assert.deepEqual(port.sent[0].transfer, [pic]);
  r.receive({ token: "T", type: "inited", fontErrors: ["Inter 700"] });
  assert.deepEqual(await init, ["Inter 700"]);
  const a = r.frame(0.5);
  const b = r.frame(1);
  await tick();
  assert.equal(port.sent.length, 2, "the second frame waits for the first");
  const first = port.sent[1].message as Extract<HostMessage, { type: "frame" }>;
  assert.equal(first.t, 0.5);
  r.receive({ token: "T", type: "frame", id: first.id, bitmap: bitmap("f1"), texts: [{ text: "Hola", x: 1, y: 2, w: 3, h: 4 }, "basura"], ms: 4 });
  const got = await a;
  assert.deepEqual(got.texts, [{ text: "Hola", x: 1, y: 2, w: 3, h: 4 }]);
  assert.equal((got.bitmap as unknown as { name: string }).name, "f1");
  await tick();
  const second = port.sent[2].message as Extract<HostMessage, { type: "frame" }>;
  assert.equal(second.t, 1);
  r.receive({ token: "T", type: "frame", id: second.id, texts: [], ms: 1, error: { message: "x is not defined", line: 4 } });
  assert.deepEqual((await b).error, { message: "x is not defined", line: 4 });
  assert.equal(readSandboxMessage({ token: "T", type: "frame" }, "T"), null, "a frame answer needs its id");
});

test("a syntax error or a missing draw fails the start with the line, and closes the sandbox", async () => {
  const port = new FakePort();
  const r = new CodeRunner("T", port, new FakeTimers());
  r.receive({ token: "T", type: "ready", hasDraw: false, error: { message: "Unexpected token '}'", line: 7 } });
  await assert.rejects(r.whenReady(), /Línea 7: Unexpected token/);
  assert.equal(port.closed, true);
  const p2 = new FakePort();
  const r2 = new CodeRunner("U", p2, new FakeTimers());
  r2.receive({ token: "U", type: "ready", hasDraw: false });
  await assert.rejects(r2.whenReady(), /No encuentro la función draw/);
});

test("a frame that never answers (an endless loop) tears the sandbox down and fails what was waiting", async () => {
  const port = new FakePort();
  const timers = new FakeTimers();
  const r = new CodeRunner("T", port, timers, { load: 1000, hang: 500 });
  r.receive({ token: "T", type: "ready", hasDraw: true });
  const f = r.frame(2.25);
  await tick();
  timers.fire(500);
  await assert.rejects(f, /no respondió en 0\.5 s en t = 2\.25 s/);
  assert.equal(port.closed, true);
  assert.equal(r.state, "dead");
  await assert.rejects(r.frame(3), /no respondió/);
  // One that never even starts.
  const slow = new CodeRunner("S", new FakePort(), timers, { load: 1000, hang: 500 });
  timers.fire(1000);
  await assert.rejects(slow.whenReady(), /no arrancó/);
});

// A runner whose sandbox answers by itself with `answer(t)`.
function autoRunner(answer: (t: number) => { texts?: unknown; error?: { message: string; line?: number }; ms?: number }) {
  const port = new FakePort();
  const r = new CodeRunner(`R${Math.random()}`, port, new FakeTimers());
  port.post = (message) => {
    port.sent.push({ message, transfer: [] });
    queueMicrotask(() => {
      if (message.type === "init") r.receive({ token: r.token, type: "inited", fontErrors: [] });
      if (message.type === "frame") r.receive({ token: r.token, type: "frame", id: message.id, bitmap: bitmap(`t${message.t}`), ms: 1, texts: [], ...answer(message.t) });
    });
  };
  r.receive({ token: r.token, type: "ready", hasDraw: true });
  return { r, port };
}

test("testing pasted code samples every 0.1 s, keeps the boxes as shares, and reports each error once with its line", async () => {
  const ok = autoRunner((t) => ({ texts: t >= 0.2 ? [{ text: "Hola", x: 108, y: 960, w: 216, h: 96 }] : [] }));
  const res = await sampleRunner(ok.r, 0.5, { w: 1080, h: 1920 }, "sig");
  assert.deepEqual(res.problems, []);
  assert.equal(res.samples?.frames.length, 5);
  assert.deepEqual(res.samples?.frames[3], [{ text: "Hola", x: 0.1, y: 0.5, w: 0.2, h: 0.05 }]);
  const bad = autoRunner((t) => (t >= 0.2 ? { error: { message: "boom", line: 9 } } : {}));
  const res2 = await sampleRunner(bad.r, 0.5, { w: 1080, h: 1920 }, "sig");
  assert.equal(res2.problems.length, 1);
  assert.match(res2.problems[0].message, /^Línea 9 \(en t = 0\.20 s\): boom/);
  assert.equal(res2.samples, null);
  const noList = autoRunner(() => ({ texts: undefined }));
  const res3 = await sampleRunner(noList.r, 0.3, { w: 1080, h: 1920 }, "sig");
  assert.equal(res3.problems.length, 1);
  assert.match(res3.problems[0].message, /no devolvió la lista de textos/);
});

test("the deck: frame t's code frames are in hand before drawing, the push asks the scene before too, strict renders stop", async () => {
  const code = { source: "function draw(ctx, t, info) { return []; }", assets: [] };
  const a = scene({ id: "a", seconds: 2, code });
  const b = scene({ id: "b", seconds: 2, code });
  const sc = script([a, b], "warm");
  // Inside the push into b, both a (at its end) and b are needed.
  assert.deepEqual(codeNeeds(sc, 2.1).map((n) => [n.scene.id, Number(n.lt.toFixed(3))]), [
    ["b", 0.1],
    ["a", 1.999],
  ]);
  assert.deepEqual(codeNeeds(sc, 1).map((n) => n.scene.id), ["a"]);
  // With the blur, every subframe.
  assert.ok(codeNeeds(sc, 2.1, true).length > 2);
  const mounted: string[] = [];
  const deck = new CodeDeck({ fonts: async () => [], format: "vertical", mount: (source) => (mounted.push(source), autoRunner(() => ({})).r) });
  const w = world();
  await deck.ready(sc, 1, w, { w: 1080, h: 1920 });
  const f = deck.frame("a", 1, 1080, 1920) as unknown as { name: string };
  assert.equal(f.name, "t1");
  assert.equal(deck.frame("a", 1, 1920, 1080), null, "the other format has its own sandbox");
  // The drawing paints it full frame; the placeholder only when there is none.
  const drawn: unknown[] = [];
  const texts: string[] = [];
  const own: Record<string, unknown> = { drawImage: (img: unknown) => drawn.push(img), measureText: (t: string) => ({ width: t.length * 6 }), fillText: (t: string) => texts.push(t) };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  drawMotionFrame(ctx, 1080, 1920, 1, sc, { ...w, code: deck });
  assert.ok(drawn.includes(f as unknown));
  drawMotionFrame(ctx, 1080, 1920, 1, script([scene({ id: "x" })]), w);
  assert.ok(texts.some((t) => /pegá el código/.test(t)));
  assert.equal(mounted.length, 1, "one sandbox per scene and format, kept while nothing changes");
  // Every exact capture goes through drawReady: the frame for t is there when it draws.
  let seen: unknown = null;
  await drawReady({ ...w, code: deck }, sc, 1.25, () => (seen = deck.frame("a", 1.25, 1080, 1920)), { w: 1080, h: 1920 });
  assert.equal((seen as unknown as { name: string }).name, "t1.25");
  await deck.ready(sc, 1.5, w, { w: 1080, h: 1920 });
  assert.equal(mounted.length, 1);
  // A render stops on a code scene with no code; a preview deck draws the placeholder instead.
  const empty = script([scene({ id: "e", seconds: 2 })]);
  await assert.rejects(deck.fork(true).ready(empty, 1, w), /sin código/);
  await deck.ready(empty, 1, w);
  const failing = new CodeDeck({ fonts: async () => [], format: "vertical", strict: true, mount: () => autoRunner(() => ({ error: { message: "boom", line: 2 } })).r });
  await assert.rejects(failing.ready(sc, 1, w), /La escena 1 \(código\): Línea 2 \(en t = 1\.00 s\): boom/);
  assert.deepEqual(await new CodeDeck({ fonts: async () => [], format: "vertical", mount: () => autoRunner(() => ({ error: { message: "boom" } })).r }).check(sc, w), [
    { index: 0, problem: "El código (en t = 0.00 s): boom" },
    { index: 1, problem: "El código (en t = 0.00 s): boom" },
  ]);
  deck.dispose();
});

test("the info a scene's code gets: full size, its own words in scene time, the safe zone and the floor", () => {
  const timed = timeScenes([scene({ id: "a", seconds: 2 }), scene({ id: "b", seconds: 3, voice: "Hola che", emotion: "alegre" })]);
  const info = codeInfo(timed[1], "vertical", world({ subtitles: [{ sceneId: "b", start: 2.25, end: 4, words: [{ text: "Hola", start: 2.25, end: 2.6 }, { text: "che", start: 2.6, end: 3 }], lines: [[0, 1]], karaoke: true }] }), "dry");
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1920);
  assert.equal(info.duration, 3);
  assert.deepEqual(info.words, [{ text: "Hola", start: 0.25, end: 0.6 }, { text: "che", start: 0.6, end: 1 }]);
  assert.equal(info.tone, "dry");
  assert.equal(info.voice, "Hola che");
  assert.ok(info.floor < info.safe.y + info.safe.h, "a voiced scene keeps its text above the subtitle");
  assert.equal(codeInfo(timed[0], "horizontal", world()).width, 1920);
});

test("pieza.md keeps the scene's code", () => {
  const piece = { ...newMotionPiece("vertical"), script: script([scene({ id: "a", code: { source: "function draw(){ return []; }", assets: ["stock"] } })]) };
  const md = pieceMarkdown(piece, piece.script.scenes);
  assert.ok(md.includes("Escena de código"));
  assert.ok(md.includes("```js\nfunction draw(){ return []; }\n```"));
  assert.ok(md.includes("con stock"));
});
