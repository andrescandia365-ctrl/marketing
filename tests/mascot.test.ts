// "Mascota en código": the series' mascot as code. The pose contract (its normaliser here and in the sandbox), the
// static check and the colours, the reply parsing, the checks on the sample poses, the bible line, the injection into
// every code scene's sandbox (its document run for real in a node:vm context standing in for the iframe), the deck
// that draws the mascot in a character scene, and the prompts.
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { CODE_CONTRACT, validateSource, type HostMessage, type SandboxMessage } from "../shared/codeScene.ts";
import { codePrompt } from "../shared/codePrompt.ts";
import {
  MASCOT_ASSET,
  MASCOT_CONTRACT,
  MASCOT_EXAMPLE,
  MASCOT_FRAME,
  MASCOT_POSE_JS,
  MASCOT_SAMPLES,
  MASCOT_TEST,
  MASCOT_UNIT,
  SHEET_SAMPLES,
  checkMascotSamples,
  mascotFromReply,
  mascotKey,
  mascotLine,
  mascotPrompt,
  mascotSig,
  normalizePose,
  offBrandColours,
  readMascotLine,
  scenePose,
  validateMascotSource,
  type MascotResult,
  type MascotStats,
} from "../shared/mascot.ts";
import { blankScene, hostScenes, timeScenes, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { DEFAULT_BRAND, EMPTY_SERIES, markdownToSeries, seriesToMarkdown } from "../shared/series.ts";
import { CodeDeck, CodeRunner, MASCOT_STUB, NO_MASCOT, codeInfo, mascotNeeds, sandboxDoc, testCode, testMascot, type SandboxPort, type Timers } from "../src/lib/codeSandbox.ts";
import { drawMotionFrame, mascotPoseAt, type MotionWorld } from "../src/lib/motion.ts";

const world = (o: Partial<MotionWorld> = {}): MotionWorld => ({ brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 1, disclosure: "", ...o });
const script = (scenes: MotionScene[], tone: MotionScript["tone"] = "warm"): MotionScript => ({ problem: "p", title: "t", durationNote: "", note: "", music: { mood: "drive", bpm: 100 }, tone, scenes });
const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("character"), ...o });

// A 2D context that records what is drawn (enough for the example to run in node).
function recorder() {
  const ops: string[] = [];
  const own: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : (...args: unknown[]) => ops.push(`${k}(${args.map((a) => (typeof a === "number" ? a.toFixed(2) : String(a))).join(",")})`)),
    set: (_o, k: string, v: unknown) => (ops.push(`${k}=${String(v)}`), true),
  });
  return { ctx, ops };
}

// ── The pose ─────────────────────────────────────────────────────────────────────────────────────────────────
const POSE_CASES: unknown[] = [
  undefined,
  null,
  {},
  { x: 10, y: 20, scale: 2, facing: -1, expression: "happy", mouth: 0.4, gesture: "wave", lookAt: { x: 1, y: 2 } },
  { x: NaN, y: Infinity, scale: 999, facing: 0, expression: "angry", mouth: 7, gesture: "dance", reach: -3, lookAt: { x: "a", y: 2 } },
  { scale: -1, facing: -0.2, mouth: -1, gesture: "point" },
  { gesture: "idle", reach: 0.5, expression: "talking", lookAt: 5 },
];

test("a pose is always complete and in range: defaults, clamps, known expressions and gestures", () => {
  assert.deepEqual(normalizePose(undefined), { x: 0, y: 0, scale: 1, facing: 1, expression: "neutral", mouth: 0, gesture: "idle", reach: 0, lookAt: null });
  const wild = normalizePose(POSE_CASES[4]);
  assert.equal(wild.x, 0);
  assert.equal(wild.y, 0);
  assert.equal(wild.scale, 20);
  assert.equal(wild.facing, 1, "0 faces right");
  assert.equal(wild.expression, "neutral");
  assert.equal(wild.gesture, "idle");
  assert.equal(wild.mouth, 1);
  assert.equal(wild.reach, 0);
  assert.equal(wild.lookAt, null);
  assert.equal(normalizePose({ gesture: "point" }).reach, 1, "a gesture with no reach is fully done");
  assert.equal(normalizePose({ scale: -1 }).scale, 0.05);
  assert.equal(normalizePose({ facing: -0.2 }).facing, -1);
});

test("the sandbox's pose normaliser is the same function as the app's", () => {
  const js = new Function(`return ${MASCOT_POSE_JS};`)() as (p: unknown) => unknown;
  for (const c of POSE_CASES) assert.deepEqual(JSON.parse(JSON.stringify(js(c))), normalizePose(c));
  assert.ok(Object.isFrozen(js({})), "the code cannot change the pose it was given");
});

// ── The static check ────────────────────────────────────────────────────────────────────────────────────────
test("the static check: drawMascot defined, nothing banned (with the line), colours from the brand only", () => {
  assert.deepEqual(validateMascotSource(MASCOT_EXAMPLE, DEFAULT_BRAND), [], "the example follows its own contract");
  assert.match(validateMascotSource("")[0].message, /No hay código/);
  assert.ok(validateMascotSource("function draw(ctx, t, info) { return []; }").some((p) => p.fatal && /drawMascot\(ctx, t, pose\)/.test(p.message)));
  const random = validateMascotSource("function drawMascot(ctx, t, pose) {\n  const k = Math.random();\n}");
  assert.equal(random[0].line, 2);
  assert.match(random[0].message, /Línea 2: usa Math\.random.*generador con semilla/);
  assert.ok(validateMascotSource("function drawMascot(ctx, t, pose) { setTimeout(() => 0, 1); }").some((p) => p.fatal && /temporizadores/.test(p.message)));
  // A colour off the brand is a warning, not a stop.
  const off = validateMascotSource('const C = "#00ff00";\nfunction drawMascot(ctx, t, pose) { ctx.fillStyle = C; }', DEFAULT_BRAND);
  assert.equal(off.length, 1);
  assert.equal(off[0].fatal, false);
  assert.match(off[0].message, /#00ff00/);
});

test("colours: the brand's, steps between two of them, black and white are fine; anything else is named once", () => {
  const brand = { bg: "#101418", text: "#f4f4f1", accent: "#ff6b35" };
  assert.deepEqual(offBrandColours('a = "#101418"; b = "#FF6B35"; c = "#fff"; d = "#000000"; e = "#ff9370"; f = "#7f3519"', brand), [], "a lighter accent, a darker accent");
  assert.deepEqual(offBrandColours('a = "#3366ff"; b = "#3366ff"; // "#00ff00" in a comment\nc = "#0f0"', brand), ["#3366ff", "#0f0"]);
});

test("a reply pasted from claude.ai: the name, the description and the code block that defines drawMascot", () => {
  const reply = [
    "NOMBRE: Yerbi",
    "**DESCRIPCIÓN:** Un paquete de yerba con piernitas, curioso y amable.",
    "",
    "```json",
    '{"not": "code"}',
    "```",
    "",
    "```js",
    "const K = 1;",
    "function drawMascot(ctx, t, pose) {",
    "  ctx.save();",
    "  ctx.restore();",
    "}",
    "```",
  ].join("\r\n");
  const got = mascotFromReply(reply);
  assert.equal(got.name, "Yerbi");
  assert.equal(got.description, "Un paquete de yerba con piernitas, curioso y amable.");
  assert.ok(got.source.startsWith("const K = 1;\nfunction drawMascot"));
  assert.ok(!got.source.includes("```"));
  // Plain code with no fences is the code, with no name.
  assert.deepEqual(mascotFromReply("function drawMascot(ctx, t, pose) {}"), { source: "function drawMascot(ctx, t, pose) {}", name: "", description: "" });
});

// ── The sample poses and what they say ──────────────────────────────────────────────────────────────────────
const box = (o: Partial<MascotStats["box"] & object> = {}) => ({ x: MASCOT_TEST.x - 110, y: MASCOT_TEST.y - MASCOT_UNIT, w: 220, h: MASCOT_UNIT, ...o });
// Results a healthy mascot gives: every sample its own picture, the box where its pose says.
function healthy(): MascotResult[] {
  return MASCOT_SAMPLES.map((s) => {
    let b = box();
    if (s.id === "small") b = box({ y: MASCOT_TEST.y - MASCOT_UNIT / 2, h: MASCOT_UNIT / 2, x: MASCOT_TEST.x - 55, w: 110 });
    if (s.id === "moved") b = box({ x: MASCOT_TEST.x - 10 });
    const hash = s.id === "repeat" ? "base" : s.id;
    return { id: s.id, label: s.label, ms: 3, stats: { box: b, ink: 40000, share: 0.11, hash } };
  });
}
const edit = (results: MascotResult[], id: string, change: (r: MascotResult) => MascotResult) => results.map((r) => (r.id === id ? change(r) : r));

test("the sample poses cover every expression, gesture, the mouth, facing, scale, a shift, a look and several t", () => {
  const ids = MASCOT_SAMPLES.map((s) => s.id);
  for (const id of ["base", "repeat", "happy", "surprised", "worried", "talking", "mouth0", "mouth1", "wave", "point", "present", "cheer", "halfway", "left", "small", "moved", "look"]) assert.ok(ids.includes(id), id);
  assert.ok(MASCOT_SAMPLES.filter((s) => s.id.startsWith("t")).length >= 4);
  assert.deepEqual(MASCOT_SAMPLES.find((s) => s.id === "repeat")?.pose, MASCOT_SAMPLES.find((s) => s.id === "base")?.pose);
  assert.ok(SHEET_SAMPLES.length >= 8 && SHEET_SAMPLES.every((s) => s.sheet));
  // Every pose fits the test canvas at scale 1 (feet inside, room above for the head).
  for (const s of MASCOT_SAMPLES) assert.ok(s.pose.y <= MASCOT_TEST.h && s.pose.y - MASCOT_UNIT * s.pose.scale >= 0, s.id);
});

test("the pose contract validator: a healthy mascot passes; each broken promise is named", () => {
  assert.deepEqual(checkMascotSamples(healthy()), []);
  // An error is fatal, once, with its line and the pose.
  const err = checkMascotSamples(edit(edit(healthy(), "wave", (r) => ({ ...r, stats: null, error: { message: "arm is not defined", line: 12 } })), "cheer", (r) => ({ ...r, stats: null, error: { message: "arm is not defined", line: 12 } })));
  assert.equal(err.length, 1);
  assert.deepEqual(err[0], { message: "Línea 12 (pose «Saluda»): arm is not defined", line: 12, fatal: true });
  // Too slow.
  assert.ok(checkMascotSamples(edit(healthy(), "base", (r) => ({ ...r, ms: 400 }))).some((p) => p.fatal && /400 ms/.test(p.message)));
  // Nothing drawn.
  assert.match(checkMascotSamples(healthy().map((r) => ({ ...r, stats: { box: null, ink: 0, share: 0, hash: "0" } })))[0].message, /No dibujó nada en ninguna pose/);
  // A background.
  assert.match(checkMascotSamples(edit(healthy(), "base", (r) => ({ ...r, stats: { box: { x: 0, y: 0, w: 640, h: 560 }, ink: 358400, share: 1, hash: "base" } })))[0].message, /Pintó todo el cuadro/);
  // Not pure.
  assert.ok(checkMascotSamples(edit(healthy(), "repeat", (r) => ({ ...r, stats: { ...r.stats!, hash: "other" } }))).some((p) => p.fatal && /función pura/.test(p.message)));
  // Feet not on y.
  assert.ok(checkMascotSamples(edit(healthy(), "base", (r) => ({ ...r, stats: { ...r.stats!, box: box({ y: 0 }) } }))).some((p) => p.fatal && /pies en \(x, y\)/.test(p.message)));
  // Warnings: faces and gestures that change nothing, a mouth that never opens, no mirror, scale and x ignored, no t.
  const flat = healthy().map((r) => (["happy", "worried", "point", "left", "look", "t1", "t2", "t3", "t4", "t5"].includes(r.id) ? { ...r, stats: { ...r.stats!, hash: "base" } } : r));
  const said = checkMascotSamples(edit(edit(flat, "mouth1", (r) => ({ ...r, stats: { ...r.stats!, hash: "mouth0" } })), "small", (r) => ({ ...r, stats: { ...r.stats!, box: box() } })));
  assert.ok(said.every((p) => !p.fatal));
  const text = said.map((p) => p.message).join("\n");
  assert.match(text, /caras se ven igual que la neutral: contenta, preocupada/);
  assert.match(text, /gestos no cambian nada: señala/);
  assert.match(text, /La boca no se abre/);
  assert.match(text, /facing -1/);
  assert.match(text, /scale 0,5/);
  assert.match(text, /lookAt/);
  assert.match(text, /respirar y parpadear/);
});

test("the example mascot keeps its contract in node: pure in t and pose, every expression, mouth, gesture and facing differ", () => {
  const drawMascot = new Function(`${MASCOT_EXAMPLE}; return drawMascot;`)() as (ctx: unknown, t: number, pose: unknown) => void;
  const run = (t: number, pose: unknown) => {
    const { ctx, ops } = recorder();
    drawMascot(ctx, t, normalizePose(pose));
    return ops.join("\n");
  };
  const at = (o: object) => ({ x: 320, y: 520, scale: 1, ...o });
  const base = run(0, at({}));
  run(2.2, at({ gesture: "cheer" }));
  assert.equal(run(0, at({})), base, "the same t and pose paint the same frame, whatever came before");
  assert.ok(base.startsWith("save()") && base.endsWith("restore()"), "ctx is left as it was");
  for (const expression of ["happy", "surprised", "worried"]) assert.notEqual(run(0, at({ expression })), base, expression);
  for (const gesture of ["wave", "point", "present", "cheer"]) assert.notEqual(run(0, at({ gesture })), base, gesture);
  assert.notEqual(run(0, at({ mouth: 1 })), run(0, at({ mouth: 0 })));
  assert.notEqual(run(0, at({ facing: -1 })), base);
  assert.notEqual(run(1.3, at({})), base, "it breathes");
  assert.ok(!base.includes("fillRect(0.00,0.00"), "no background");
});

// ── Saved with the series ───────────────────────────────────────────────────────────────────────────────────
test("the bible keeps one header line (name, description, fingerprint); a series without it has no mascot", () => {
  const meta = { file: "mascota.js" as const, name: "Yerbi", description: "Un paquete de yerba: curioso.", sig: mascotSig(MASCOT_EXAMPLE) };
  const md = seriesToMarkdown({ ...EMPTY_SERIES, name: "IMAN", mascot: meta });
  assert.ok(md.includes(`Mascota en código: {"file":"mascota.js","name":"Yerbi"`));
  assert.ok(!md.includes("drawMascot"), "the code never goes into the bible the writer reads");
  assert.deepEqual(markdownToSeries(md, "iman").mascot, meta);
  assert.equal(markdownToSeries(seriesToMarkdown({ ...EMPTY_SERIES, name: "Viejo" }), "viejo").mascot, null);
  assert.equal(readMascotLine("Mascota en código: {roto"), null);
  assert.deepEqual(mascotLine(null), []);
  assert.equal(mascotSig(`  ${MASCOT_EXAMPLE}\n`), mascotSig(MASCOT_EXAMPLE), "the server's fingerprint of the trimmed file is the studio's");
});

// ── The injection into the sandbox ──────────────────────────────────────────────────────────────────────────
test("the sandbox document: the mascot in its own wrapped script before the scene's code, both first lines known", () => {
  const mascot = 'function ease(x) { return x; }\nfunction drawMascot(ctx, t, pose) {\n  ctx.fillText("</script>", 0, 0);\n}';
  const scene = "function draw(ctx, t, info) {\n  return [];\n}";
  const { html, codeLine, mascotLine: first } = sandboxDoc(scene, "tok", 250, { source: mascot });
  const lines = html.split("\n");
  assert.equal(lines[first - 1], "function ease(x) { return x; }");
  assert.equal(lines[first - 2], "var __mascot = (function () {");
  assert.equal(lines[codeLine - 1], "function draw(ctx, t, info) {");
  assert.ok(html.indexOf("var __mascot") < html.indexOf("function draw(ctx, t, info)"), "the mascot comes first");
  assert.ok(!lines[first + 1].includes("</script>"), "a </script> in the mascot cannot close its tag");
  assert.ok(html.includes('window.__codeReady(typeof draw === "function" ? draw : null, typeof __mascot === "function" ? __mascot : null);'));
  assert.ok(html.includes(`var MASCOT_LINE = ${first};`));
  assert.ok(html.includes("var MASCOT_MAIN = false;"));
  // Without a mascot, the scene's code sits where it always did.
  const plain = sandboxDoc(scene, "tok");
  assert.equal(plain.mascotLine, 0);
  assert.equal(plain.html.split("\n")[plain.codeLine - 1], "function draw(ctx, t, info) {");
  assert.ok(!plain.html.includes("var __mascot"));
  assert.ok(sandboxDoc(MASCOT_STUB, "tok", 250, { source: mascot, main: true }).html.includes("var MASCOT_MAIN = true;"));
});

// The iframe stood in by a node:vm context: the document's scripts run in order in one global (each at its own line,
// named about:srcdoc as in the browser), with the browser parts the runtime needs faked.
function bootSandbox(html: string) {
  const posted: SandboxMessage[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const parent = { postMessage: (m: SandboxMessage) => posted.push(JSON.parse(JSON.stringify({ ...m, bitmap: undefined }))) };
  const drawn: string[][] = [];
  class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      const { ctx, ops } = recorder();
      drawn.push(ops);
      return ctx;
    }
    transferToImageBitmap() {
      return { close() {} };
    }
  }
  const global: Record<string, unknown> = {
    parent,
    performance: { now: () => 0 },
    OffscreenCanvas,
    FontFace: class {},
    document: { fonts: { add() {} } },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    console,
  };
  global.window = global;
  const context = vm.createContext(global);
  const scripts = [...html.matchAll(/<script>(\n?)([\s\S]*?)\n?<\/script>/g)];
  for (const m of scripts) {
    const line = html.slice(0, m.index! + "<script>".length + m[1].length).split("\n").length;
    try {
      vm.runInContext(m[2], context, { filename: "about:srcdoc", lineOffset: line - 1 });
    } catch (e) {
      listeners.error?.({ message: String((e as Error).message), lineno: undefined });
    }
  }
  const send = (data: HostMessage) => listeners.message({ source: parent, data });
  return { posted, send, drawn, context };
}
const sceneInfo = () => codeInfo(timeScenes([{ ...blankScene("code"), id: "c", seconds: 2 }])[0], "vertical", world(), "warm", { name: "Yerbi", description: "Un paquete de yerba" });

test("the injection, run: a scene's draw reaches the mascot as info.mascot.draw and drawMascot, helpers never collide", async () => {
  const mascot = "function ease(x) { return 'mascot'; }\nfunction drawMascot(ctx, t, pose) {\n  ctx.fillText(ease(0) + ':' + pose.expression + ':' + pose.facing + ':' + pose.mouth, pose.x, pose.y);\n}";
  const sceneCode = [
    "function ease(x) { return x * 2; }",
    "function draw(ctx, t, info) {",
    "  info.mascot.draw(ctx, t, { x: 10, y: 20, expression: 'happy', mouth: 9 });",
    "  drawMascot(ctx, t, { facing: -1 });",
    "  ctx.fillText(info.mascot.name + ' ' + ease(2), 0, 0);",
    "  return [];",
    "}",
  ].join("\n");
  const box = bootSandbox(sandboxDoc(sceneCode, "T", 250, { source: mascot }).html);
  assert.deepEqual(box.posted[0], { type: "ready", hasDraw: true, hasMascot: true, token: "T" });
  box.send({ token: "T", type: "init", info: sceneInfo(), fonts: [], assets: [] });
  await new Promise((r) => setImmediate(r));
  box.send({ token: "T", type: "frame", id: 1, t: 0.5 });
  const frame = box.posted.find((m) => m.type === "frame")!;
  assert.equal(frame.type === "frame" && frame.error, undefined);
  const ops = box.drawn.flat();
  assert.ok(ops.includes("fillText(mascot:happy:1:1,10.00,20.00)"), "the pose arrives normalised (mouth 9 → 1)");
  assert.ok(ops.includes("fillText(mascot:neutral:-1:0,0.00,0.00)"), "drawMascot is the same mascot");
  assert.ok(ops.includes("fillText(Yerbi 4,0.00,0.00)"), "the scene's own ease stays its own");
  assert.equal(ops.filter((o) => o === "save()").length, 2, "every call is wrapped in save/restore");
});

test("the injection, run: an error inside the mascot says so, with the mascot's own line", async () => {
  const mascot = "function drawMascot(ctx, t, pose) {\n  const a = 1;\n  missing.call();\n}";
  const sceneCode = "function draw(ctx, t, info) {\n  info.mascot.draw(ctx, t, {});\n  return [];\n}";
  const box = bootSandbox(sandboxDoc(sceneCode, "T", 250, { source: mascot }).html);
  box.send({ token: "T", type: "init", info: sceneInfo(), fonts: [], assets: [] });
  await new Promise((r) => setImmediate(r));
  box.send({ token: "T", type: "frame", id: 1, t: 0 });
  const frame = box.posted.find((m) => m.type === "frame");
  assert.ok(frame?.type === "frame" && frame.error);
  assert.match(frame.error!.message, /^en el código de la mascota \(línea 3\): missing is not defined/);
  // Tested on its own (the paste box), the line is the mascot's.
  const alone = bootSandbox(sandboxDoc(MASCOT_STUB, "M", 250, { source: mascot, main: true }).html);
  alone.send({ token: "M", type: "init", info: sceneInfo(), fonts: [], assets: [] });
  await new Promise((r) => setImmediate(r));
  alone.send({ token: "M", type: "pose", id: 1, t: 0, pose: {}, w: 64, h: 56, measure: true });
  const own = alone.posted.find((m) => m.type === "frame");
  assert.ok(own?.type === "frame");
  assert.deepEqual(own.error, { message: "missing is not defined", line: 3 });
});

test("the injection, run: a series without a mascot gives info.mascot null; a pose request is measured", async () => {
  const box = bootSandbox(sandboxDoc("function draw(ctx, t, info) {\n  ctx.fillText(String(info.mascot), 0, 0);\n  return [];\n}", "T").html);
  assert.deepEqual(box.posted[0], { type: "ready", hasDraw: true, hasMascot: false, token: "T" });
  box.send({ token: "T", type: "init", info: { ...sceneInfo(), mascot: null }, fonts: [], assets: [] });
  await new Promise((r) => setImmediate(r));
  box.send({ token: "T", type: "frame", id: 1, t: 0 });
  assert.ok(box.drawn.flat().includes("fillText(null,0.00,0.00)"));
  const alone = bootSandbox(sandboxDoc(MASCOT_STUB, "M", 250, { source: MASCOT_EXAMPLE, main: true }).html);
  assert.deepEqual(alone.posted[0], { type: "ready", hasDraw: true, hasMascot: true, token: "M" });
  alone.send({ token: "M", type: "init", info: sceneInfo(), fonts: [], assets: [] });
  await new Promise((r) => setImmediate(r));
  alone.send({ token: "M", type: "pose", id: 7, t: 0, pose: { x: 32, y: 50, scale: 0.1 }, w: 64, h: 56, measure: true });
  const got = alone.posted.find((m) => m.type === "frame");
  assert.ok(got?.type === "frame" && !got.error);
  assert.deepEqual(got.stats && { box: got.stats.box, ink: got.stats.ink }, { box: null, ink: 0 }, "the stand-in canvas reads back blank; the shape of the answer is what counts here");
});

// ── The scene code's own check, the prompt, the runner ──────────────────────────────────────────────────────
test("with a mascot, a scene that defines its own drawMascot is redrawing the character", () => {
  const code = "function drawMascot(ctx) {}\nfunction draw(ctx, t, info) { return []; }";
  assert.deepEqual(validateSource(code), []);
  const p = validateSource(code, { mascot: true });
  assert.equal(p.length, 1);
  assert.match(p[0].message, /Línea 1: vuelve a dibujar la mascota/);
  assert.ok(CODE_CONTRACT.includes("info.mascot.draw"));
});

test("the prompts: Opus designs one original mascot by the contract; every code scene is told to reuse it", () => {
  const prompt = mascotPrompt({
    series: { name: "IMAN", tagline: "El almacén en orden", type: "software", what: "Planifica pedidos y stock.", audience: "Dueños de almacén." },
    brand: { bg: "#101418", text: "#f4f4f1", accent: "#ff6b35", motion: "solid" },
    note: "un frasco de yerba",
    problems: ["La boca no se abre"],
  });
  assert.ok(prompt.includes(MASCOT_CONTRACT));
  assert.ok(prompt.includes(MASCOT_EXAMPLE));
  assert.ok(prompt.includes("#101418") && prompt.includes("#ff6b35"));
  assert.match(prompt, /Never a known character/);
  assert.match(prompt, /never "in the style of" a named studio/);
  assert.ok(prompt.includes("NOMBRE") && prompt.includes("DESCRIPCIÓN"));
  assert.ok(prompt.includes("- un frasco de yerba".replace("- ", "What I want: ")));
  assert.ok(prompt.includes("- La boca no se abre"));
  const base = {
    piece: { title: "t", problem: "p" },
    scene: { index: 0, count: 1, seconds: 3, title: "Hola", text: "", voice: "", emotion: "" },
    format: "vertical" as const,
    width: 1080,
    height: 1920,
    fps: 30,
    brand: { bg: "#000000", text: "#ffffff", accent: "#ff0000", displayFont: "Inter", uiFont: "Inter" },
    assets: [],
    words: [],
    safe: { x: 0, y: 0, w: 1080, h: 1920 },
    floor: 1600,
  };
  const scenePrompt = codePrompt({ ...base, mascot: { name: "Yerbi", description: "Un paquete de yerba" } });
  assert.match(scenePrompt, /reuse drawMascot, never redraw the character/);
  assert.match(scenePrompt, /Yerbi: Un paquete de yerba/);
  assert.match(scenePrompt, /info\.mascot\.draw\(ctx, t, pose\)/);
  assert.ok(!codePrompt(base).includes("THE SERIES MASCOT"));
});

class FakePort implements SandboxPort {
  sent: HostMessage[] = [];
  closed = false;
  post(message: HostMessage) {
    this.sent.push(message);
  }
  close() {
    this.closed = true;
  }
}
const noTimers: Timers = { set: () => 0, clear: () => undefined };
const tick = () => new Promise((r) => setImmediate(r));

// A runner that answers at once: frames and poses (with stats from `stats`), as a mounted sandbox would.
function autoRunner(opts: { needs?: "draw" | "mascot"; hasMascot?: boolean; stats?: (m: Extract<HostMessage, { type: "pose" }>) => MascotStats | undefined; error?: string } = {}) {
  const port = new FakePort();
  const r = new CodeRunner(`R${Math.random()}`, port, noTimers, undefined, opts.needs ?? "draw");
  port.post = (message) => {
    port.sent.push(message);
    queueMicrotask(() => {
      if (message.type === "init") r.receive({ token: r.token, type: "inited", fontErrors: [] });
      if (message.type === "frame") r.receive({ token: r.token, type: "frame", id: message.id, bitmap: { name: `t${message.t}`, close() {} }, ms: 1, texts: [] });
      if (message.type === "pose")
        r.receive({ token: r.token, type: "frame", id: message.id, bitmap: { name: `pose${message.t}`, close() {} }, ms: 2, texts: [], stats: opts.stats?.(message), ...(opts.error && { error: { message: opts.error, line: 4 } }) });
    });
  };
  r.receive({ token: r.token, type: "ready", hasDraw: true, hasMascot: opts.hasMascot ?? true });
  return { r, port };
}

test("the runner: a mascot sandbox needs drawMascot; a pose request carries the pose, the size and the measure flag", async () => {
  const missing = new CodeRunner("X", new FakePort(), noTimers, undefined, "mascot");
  missing.receive({ token: "X", type: "ready", hasDraw: true, hasMascot: false });
  await assert.rejects(missing.whenReady(), /drawMascot\(ctx, t, pose\)/);
  const { r, port } = autoRunner({ needs: "mascot", stats: () => ({ box: { x: 1, y: 2, w: 3, h: 4 }, ink: 12, share: 0.1, hash: "ab" }) });
  await r.whenReady();
  assert.equal(r.hasMascot, true);
  const got = await r.pose(1.5, normalizePose({ gesture: "wave" }), 640, 560, true);
  const sent = port.sent.find((m) => m.type === "pose") as Extract<HostMessage, { type: "pose" }>;
  assert.equal(sent.t, 1.5);
  assert.equal(sent.w, 640);
  assert.equal(sent.measure, true);
  assert.equal((sent.pose as { gesture: string }).gesture, "wave");
  assert.deepEqual(got.stats, { box: { x: 1, y: 2, w: 3, h: 4 }, ink: 12, share: 0.1, hash: "ab" });
});

test("testMascot runs every sample pose in a mascot sandbox and turns what it measured into problems", async () => {
  const mounted: { source: string; mascot: unknown }[] = [];
  const healthyBy = new Map(healthy().map((h) => [h.id, h.stats]));
  const result = await testMascot(MASCOT_EXAMPLE, DEFAULT_BRAND, { name: "Caja", description: "" }, (source, mascot) => {
    mounted.push({ source, mascot });
    return autoRunner({
      needs: "mascot",
      stats: (m) => {
        const sample = MASCOT_SAMPLES.find((s) => s.t === m.t && JSON.stringify(s.pose) === JSON.stringify(m.pose));
        return healthyBy.get(sample!.id) ?? undefined;
      },
    }).r;
  });
  assert.deepEqual(mounted, [{ source: MASCOT_STUB, mascot: { source: MASCOT_EXAMPLE, main: true } }]);
  assert.deepEqual(result.problems, []);
  assert.equal(result.shots.length, MASCOT_SAMPLES.length);
  assert.equal(result.shots.filter((s) => s.sheet).length, SHEET_SAMPLES.length);
  // A static problem stops it before any sandbox.
  const bad = await testMascot("function nope() {}", DEFAULT_BRAND, { name: "x", description: "" }, () => assert.fail("never mounted"));
  assert.ok(bad.problems[0].fatal);
});

test("testCode carries the series' mascot into the scene's sandbox, and its info names it", async () => {
  const mounted: unknown[] = [];
  const timed = timeScenes([{ ...blankScene("code"), id: "c", seconds: 0.3 }])[0];
  const runner = autoRunner();
  await testCode("function draw(ctx, t, info) { return []; }", timed, "vertical", world(), "warm", async () => [], "sig", (_s, mascot) => (mounted.push(mascot), runner.r), { source: MASCOT_EXAMPLE, name: "Caja", description: "una caja" });
  assert.deepEqual(mounted, [{ source: MASCOT_EXAMPLE }]);
  const init = runner.port.sent.find((m) => m.type === "init") as Extract<HostMessage, { type: "init" }>;
  assert.deepEqual(init.info.mascot, { name: "Caja", description: "una caja" });
});

// ── The character scene ─────────────────────────────────────────────────────────────────────────────────────
test("the mascot hosts the character scenes when the series has no host character", () => {
  const scenes = [scene({ id: "a", asset: "pantalla-1" }), { ...blankScene("hook"), id: "b" }];
  const hosted = hostScenes(scenes, MASCOT_ASSET, [MASCOT_ASSET], false);
  assert.equal(hosted[0].asset, MASCOT_ASSET);
  assert.equal(hosted[0].assetB, "pantalla-1", "what was there becomes what it presents");
  assert.equal(hosted[1].asset, "");
});

test("a character scene's mascot pose: mouth from the voice, face from the emotion, gesture eased in on its beat", () => {
  const pose = scenePose({ gesture: "point", sinceGesture: -0.2, talk: 0.5, expression: "worried", toward: -1, lookAt: null, dry: false });
  assert.equal(pose.gesture, "point");
  assert.equal(pose.reach, 0, "before its beat it rests");
  assert.equal(pose.expression, "worried");
  assert.equal(pose.mouth, 0.5);
  assert.equal(pose.facing, -1);
  assert.equal(pose.x, MASCOT_FRAME.x);
  assert.equal(pose.scale, MASCOT_FRAME.scale);
  assert.equal(scenePose({ gesture: "point", sinceGesture: 1, talk: 0, expression: "neutral", toward: 1, lookAt: null, dry: false }).reach, 1);
  const half = scenePose({ gesture: "point", sinceGesture: 0.2, talk: 0, expression: "neutral", toward: 1, lookAt: null, dry: false }).reach;
  assert.ok(half > 0 && half < 1);
  assert.equal(scenePose({ gesture: "surprise", sinceGesture: 0.1, talk: 0, expression: "happy", toward: 1, lookAt: null, dry: false }).expression, "surprised");
  assert.equal(scenePose({ gesture: "surprise", sinceGesture: 0.1, talk: 0, expression: "happy", toward: 1, lookAt: null, dry: false }).gesture, "idle");
  assert.equal(scenePose({ gesture: "present", sinceGesture: 0, talk: 0.3, expression: "neutral", toward: 1, lookAt: null, dry: false }).expression, "talking");
  // In a scene: the line's emotion picks the face, the voice the mouth.
  const timed = timeScenes([scene({ id: "m", asset: MASCOT_ASSET, emotion: "preocupada", voice: "Otra vez sin pan", seconds: 3 })])[0];
  const inScene = mascotPoseAt(world(), timed, 1, 1, true, "warm");
  assert.equal(inScene.expression, "worried");
});

test("the deck draws the mascot of a character scene at the exact pose, frame-exact for renders; no mascot stops a render", async () => {
  const sc = script([scene({ id: "m", asset: MASCOT_ASSET, seconds: 2, emotion: "contento", gesture: "wave" }), scene({ id: "n", asset: MASCOT_ASSET, seconds: 2 })]);
  const w = world();
  // Inside the push into the second scene both are needed, each at its own pose.
  assert.equal(mascotNeeds(sc, 2.1, w, true).length, 2);
  assert.equal(mascotNeeds(script([{ ...blankScene("hook"), id: "h" }]), 1, w, true).length, 0);
  const mounted: unknown[] = [];
  const deck = new CodeDeck({
    fonts: async () => [],
    format: "vertical",
    mascot: { source: MASCOT_EXAMPLE, name: "Caja", description: "" },
    mount: (source, mascot) => (mounted.push({ source, mascot }), autoRunner({ needs: "mascot" }).r),
  });
  await deck.ready(sc, 1, w, { w: 1080, h: 1920 });
  assert.deepEqual(mounted, [{ source: MASCOT_STUB, mascot: { source: MASCOT_EXAMPLE, main: true } }]);
  const pose = mascotPoseAt(w, timeScenes(sc.scenes)[0], 1, 1, true, "warm");
  const img = deck.mascot(1, pose) as unknown as { name: string };
  assert.equal(img.name, "pose1");
  assert.ok(mascotKey(1, pose).startsWith("1.0000|"));
  // drawMotionFrame paints that very frame.
  const drawn: unknown[] = [];
  const own: Record<string, unknown> = { drawImage: (i: unknown) => drawn.push(i), measureText: (t: string) => ({ width: t.length * 6 }) };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  drawMotionFrame(ctx, 1080, 1920, 1, sc, { ...w, code: deck });
  assert.ok(drawn.includes(img as unknown));
  // A new mascot drops the sandboxes that carry the old one.
  deck.setMascot({ source: `${MASCOT_EXAMPLE}\n// v2`, name: "Caja", description: "" });
  assert.equal(deck.mascot(1, pose), null);
  deck.setMascot(null);
  assert.equal(deck.mascotProblem(), NO_MASCOT);
  await assert.rejects(deck.fork(true).ready(sc, 1, w), /no tiene mascota en código/);
  const texts: string[] = [];
  const own2: Record<string, unknown> = { measureText: (t: string) => ({ width: t.length * 6 }), fillText: (t: string) => texts.push(t) };
  const ctx2 = new Proxy(own2, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  drawMotionFrame(ctx2, 1080, 1920, 1, sc, { ...w, code: deck });
  assert.ok(texts.some((t) => /mascota/.test(t)), "the preview says the mascot is missing");
  // A failing mascot stops a render with its message.
  const failing = new CodeDeck({ fonts: async () => [], format: "vertical", strict: true, mascot: { source: MASCOT_EXAMPLE, name: "x", description: "" }, mount: () => autoRunner({ needs: "mascot", error: "boom" }).r });
  await assert.rejects(failing.ready(sc, 1, w), /La mascota: Línea 4 .*boom/);
  assert.deepEqual(
    (await new CodeDeck({ fonts: async () => [], format: "vertical", mount: () => autoRunner().r }).check(sc, w)).map((p) => p.problem),
    [NO_MASCOT],
  );
  await tick();
  deck.dispose();
});

test("every code scene's sandbox carries the series' mascot; a changed mascot makes them again", async () => {
  const code = { source: "function draw(ctx, t, info) { return []; }", assets: [] };
  const sc = script([{ ...blankScene("code"), id: "c", seconds: 2, code }]);
  const mounted: unknown[] = [];
  const deck = new CodeDeck({ fonts: async () => [], format: "vertical", mascot: { source: MASCOT_EXAMPLE, name: "Caja", description: "una caja" }, mount: (_s, mascot) => (mounted.push(mascot), autoRunner().r) });
  await deck.ready(sc, 1, world());
  assert.deepEqual(mounted, [{ source: MASCOT_EXAMPLE }]);
  await deck.ready(sc, 1.5, world());
  assert.equal(mounted.length, 1);
  deck.setMascot({ source: `${MASCOT_EXAMPLE}\n`, name: "Caja", description: "una caja" });
  await deck.ready(sc, 1.5, world());
  assert.equal(mounted.length, 1, "the same code (trimmed) keeps the sandbox");
  deck.setMascot(null);
  await deck.ready(sc, 1.5, world());
  assert.deepEqual(mounted[1], null);
  deck.dispose();
});
