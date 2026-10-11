// "Mascota en código": a series can hold its mascot as code, one JavaScript function drawMascot(ctx, t, pose) that
// Opus designs in claude.ai from the prompt the app builds (mascotPrompt). The source lives in the series library
// (biblioteca/<series>/mascota.js, server-owned like a puppet's files); the bible keeps only one header line with its
// name, description and fingerprint ("Mascota en código: {…}"), so the writer knows the character without reading its
// code, and a series without that line simply has no mascot. Every code scene of the series gets the code in its
// sandbox (info.mascot.draw, also drawMascot), and the explainer "character" template draws it as the series'
// explainer character when no puppet host is set (asset MASCOT_ASSET). This file is what both sides read: the
// contract, the pose and its normaliser (the sandbox runs the same one as MASCOT_POSE_JS), the static check, the
// sample poses the paste box tests and the checks on what they drew. Pure: no DOM, no clock.
import { z } from "zod";
import { CODE_FRAME_MS, CODE_MAX_CHARS, bannedProblems, codeSig, fencedBlocks, stripComments, type CodeProblem } from "./codeScene.ts";
import type { Brand } from "./series.ts";

// The asset id a character scene uses for the series' code mascot (never a cast id: those have no colon).
export const MASCOT_ASSET = "mascota:codigo";
// The file in the series library.
export const MASCOT_FILE = "mascota.js";
// At scale 1 the character is this many pixels tall, feet to the top of the head.
export const MASCOT_UNIT = 400;
// The canvas a character scene's mascot is painted on (then drawn into the scene like a puppet): feet at (x, y).
export const MASCOT_FRAME = { w: 1000, h: 1000, x: 500, y: 960, scale: 2.2 } as const;
// The canvas the paste box tests on: one character at scale 1 with room for raised arms and a reach to each side.
export const MASCOT_TEST = { w: 640, h: 560, x: 320, y: 520 } as const;

export const MASCOT_EXPRESSIONS = ["neutral", "happy", "surprised", "worried", "talking"] as const;
export type MascotExpression = (typeof MASCOT_EXPRESSIONS)[number];
export const MASCOT_GESTURES = ["idle", "wave", "point", "present", "cheer"] as const;
export type MascotGesture = (typeof MASCOT_GESTURES)[number];
export const MASCOT_EXPRESSION_LABEL: Record<MascotExpression, string> = {
  neutral: "neutral",
  happy: "contenta",
  surprised: "sorprendida",
  worried: "preocupada",
  talking: "hablando",
};
export const MASCOT_GESTURE_LABEL: Record<MascotGesture, string> = {
  idle: "quieta",
  wave: "saluda",
  point: "señala",
  present: "presenta",
  cheer: "festeja",
};

export type MascotPose = {
  x: number;
  y: number;
  scale: number;
  facing: 1 | -1;
  expression: MascotExpression;
  mouth: number;
  gesture: MascotGesture;
  reach: number;
  lookAt: { x: number; y: number } | null;
};

// Any pose the code may be handed, made safe: finite numbers, scale within 0.05..20, facing ±1, a known expression
// and gesture, mouth and reach within 0..1 (reach defaults to 0 at rest and 1 in a gesture), lookAt a point or null.
// The sandbox runs MASCOT_POSE_JS, the same function written in plain JavaScript (a test checks they agree).
export function normalizePose(input: unknown): MascotPose {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const expression = (MASCOT_EXPRESSIONS as readonly unknown[]).includes(p.expression) ? (p.expression as MascotExpression) : "neutral";
  const gesture = (MASCOT_GESTURES as readonly unknown[]).includes(p.gesture) ? (p.gesture as MascotGesture) : "idle";
  const look = p.lookAt && typeof p.lookAt === "object" ? (p.lookAt as Record<string, unknown>) : null;
  const lookAt = look && typeof look.x === "number" && Number.isFinite(look.x) && typeof look.y === "number" && Number.isFinite(look.y) ? { x: look.x, y: look.y } : null;
  return {
    x: num(p.x, 0),
    y: num(p.y, 0),
    scale: clamp(num(p.scale, 1), 0.05, 20),
    facing: num(p.facing, 1) < 0 ? -1 : 1,
    expression,
    mouth: clamp(num(p.mouth, 0), 0, 1),
    gesture,
    reach: clamp(num(p.reach, gesture === "idle" ? 0 : 1), 0, 1),
    lookAt,
  };
}

// normalizePose for the sandbox (no imports there): an expression that evaluates to the function.
export const MASCOT_POSE_JS = `(function () {
  var EXPRESSIONS = ${JSON.stringify(MASCOT_EXPRESSIONS)};
  var GESTURES = ${JSON.stringify(MASCOT_GESTURES)};
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  return function normalizePose(input) {
    var p = input && typeof input === "object" ? input : {};
    var expression = EXPRESSIONS.indexOf(p.expression) >= 0 ? p.expression : "neutral";
    var gesture = GESTURES.indexOf(p.gesture) >= 0 ? p.gesture : "idle";
    var look = p.lookAt && typeof p.lookAt === "object" ? p.lookAt : null;
    var lookAt = look && typeof look.x === "number" && isFinite(look.x) && typeof look.y === "number" && isFinite(look.y) ? { x: look.x, y: look.y } : null;
    return Object.freeze({
      x: num(p.x, 0),
      y: num(p.y, 0),
      scale: clamp(num(p.scale, 1), 0.05, 20),
      facing: num(p.facing, 1) < 0 ? -1 : 1,
      expression: expression,
      mouth: clamp(num(p.mouth, 0), 0, 1),
      gesture: gesture,
      reach: clamp(num(p.reach, gesture === "idle" ? 0 : 1), 0, 1),
      lookAt: lookAt ? Object.freeze(lookAt) : null
    });
  };
})()`;

// The contract, word for word what the prompt gives Opus and what the sandbox runs.
export const MASCOT_CONTRACT = `CONTRACT (the app runs your code exactly like this; anything else fails)
1. Define one top-level function: function drawMascot(ctx, t, pose) { ... } (it returns nothing).
   Top-level helper functions and constants are fine (they stay private to your code), but no top-level code that
   draws or keeps state.
2. ctx is a 2D canvas context (an OffscreenCanvas) of any size, transparent. Draw ONLY the character: no background,
   no floor, no text, no frame. Leave ctx as you found it (ctx.save() at the start, ctx.restore() at the end).
3. pose = { x, y, scale, facing, expression, mouth, gesture, reach, lookAt } (the app always sends all of them):
   x, y        pixels: the point on the ground between the feet. The character stands centred on x, feet on y.
   scale       at 1 the character is ${MASCOT_UNIT} px tall from the feet to the top of the head; everything scales
               with it (raised arms may reach ~${Math.round(MASCOT_UNIT * 0.3)} px higher, a pointing arm ~${Math.round(MASCOT_UNIT * 0.5)} px to the side).
   facing      1 faces screen right, -1 faces screen left: mirror the whole figure.
   expression  "neutral" | "happy" | "surprised" | "worried" | "talking": each one clearly different at phone size
               (eyes, brows, mouth shape, a small change in posture).
   mouth       0..1, how open the mouth is right now (the app takes it from the voice); 0 is closed. It applies on
               top of any expression.
   gesture     "idle" | "wave" | "point" | "present" | "cheer". point and present aim in the facing direction.
   reach       0..1, how far into the gesture (0 at rest, 1 fully done; the app eases it in on the beat). A wave
               keeps waving from t while reach is 1.
   lookAt      null, or { x, y } in the same pixels: the eyes (and a little the head) turn toward it.
4. t is in seconds. drawMascot is a pure function of t and pose: the same t and pose paint the same pixels, whatever
   was drawn before. Breathing (1-2 % of the body's height, a period of 2.5 to 4 s) and blinking (one blink of
   0.12-0.18 s every 2.5 to 4.5 s, at irregular moments from a seeded formula of t) come from t only.
5. Forbidden (they are blocked and throw): Date, performance, Math.random, setTimeout, setInterval,
   requestAnimationFrame, fetch, XMLHttpRequest, WebSocket, import, eval, async/await, promises, and any variable
   that keeps state between calls. For randomness, a small seeded generator (mulberry32) inside your code.
6. One call must take under ${CODE_FRAME_MS} ms; aim for under 8 ms (it is drawn on every frame of a video).
7. Colours: only the brand palette below, lighter or darker steps of those colours, black and white. Shading flat,
   or halftone dots / an ordered dither in a palette colour. No gradients into other colours, no images, no fonts.`;

// A tiny mascot that follows the contract: the shape of the code, never the look (the prompt says so).
export const MASCOT_EXAMPLE = `const PALETTE = { body: "#ff5a36", ink: "#111418", light: "#f4f1ea" };

function blinkAt(t) {
  // One blink every 3.4 s, moved inside its window by a fixed formula (no Math.random).
  const k = Math.floor(t / 3.4);
  const start = k * 3.4 + ((k * 0.618) % 1) * 1.8;
  const b = (t - start) / 0.15;
  return b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
}

function dots(ctx, x, y, w, h, colour, r) {
  // Halftone shading: dots that grow toward the bottom of the box.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = colour;
  const step = r * 3;
  for (let row = 0, yy = y; yy < y + h; row++, yy += step) {
    for (let xx = x + (row % 2) * step * 0.5; xx < x + w; xx += step) {
      ctx.beginPath();
      ctx.arc(xx, yy, r * (0.3 + 0.7 * ((yy - y) / h)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function arm(ctx, x, y, angle) {
  // angle 0 hangs down; negative swings forward and up.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = PALETTE.light;
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 110);
  ctx.stroke();
  ctx.restore();
}

function drawMascot(ctx, t, pose) {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.scale * pose.facing, pose.scale);
  // From here: feet at (0, 0), facing right, 400 units tall (legs 60, body 340).
  const breath = 1 + 0.015 * Math.sin((t * Math.PI * 2) / 3.2);
  const top = -60 - 340 * breath;
  ctx.fillStyle = PALETTE.light;
  ctx.fillRect(-62, -60, 26, 60);
  ctx.fillRect(36, -60, 26, 60);
  const r = pose.reach;
  const rest = { back: 0.18, front: -0.18 };
  const aim = {
    idle: rest,
    wave: { back: 0.18, front: -2.7 + 0.35 * Math.sin(t * 9) },
    point: { back: 0.18, front: -1.6 },
    present: { back: -0.5, front: -1.1 },
    cheer: { back: 2.7, front: -2.7 },
  }[pose.gesture];
  arm(ctx, -110, top + 160, rest.back + (aim.back - rest.back) * r);
  ctx.fillStyle = PALETTE.body;
  ctx.beginPath();
  ctx.roundRect(-120, top, 240, 340 * breath, 46);
  ctx.fill();
  dots(ctx, -120, top + 200, 240, 140 * breath, PALETTE.ink, 4);
  arm(ctx, 110, top + 160, rest.front + (aim.front - rest.front) * r);
  // The face, nudged toward lookAt.
  let lx = 0;
  let ly = 0;
  if (pose.lookAt) {
    const dx = ((pose.lookAt.x - pose.x) / pose.scale) * pose.facing;
    const dy = (pose.lookAt.y - pose.y) / pose.scale - (top + 110);
    const d = Math.hypot(dx, dy) || 1;
    lx = (dx / d) * 8;
    ly = (dy / d) * 6;
  }
  const e = pose.expression;
  const eyeH = e === "surprised" ? 30 : 22 * (1 - 0.9 * blinkAt(t));
  ctx.fillStyle = PALETTE.light;
  for (const ex of [-44, 44]) {
    ctx.beginPath();
    if (e === "happy") ctx.arc(ex + lx, top + 112 + ly, 16, Math.PI, 0);
    else ctx.ellipse(ex + lx, top + 104 + ly, 15, Math.max(1, eyeH), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e === "worried") {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-64, top + 70);
    ctx.lineTo(-26, top + 80);
    ctx.moveTo(64, top + 70);
    ctx.lineTo(26, top + 80);
    ctx.stroke();
  }
  const open = Math.max(pose.mouth, e === "surprised" ? 0.6 : 0);
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  if (open > 0.05) ctx.ellipse(lx, top + 170, 26, 6 + 24 * open, 0, 0, Math.PI * 2);
  else if (e === "happy") ctx.arc(lx, top + 158, 30, 0.15 * Math.PI, 0.85 * Math.PI);
  else ctx.rect(-24 + lx, top + 166, 48, e === "worried" ? 5 : 8);
  ctx.fill();
  ctx.restore();
}`;

// What a series keeps of its mascot in the bible (the code itself is in the library file).
export const MascotMetaSchema = z.object({
  file: z.literal(MASCOT_FILE).default(MASCOT_FILE),
  name: z.string().trim().min(1, "Falta el nombre de la mascota.").max(60),
  description: z.string().trim().max(600).default(""),
  // codeSig of the source, so a hand-edited file shows as changed.
  sig: z.string().max(20).default(""),
});
export type MascotMeta = z.infer<typeof MascotMetaSchema>;
export const MASCOT_HEADING = "Mascota en código";

// The header line of the bible ("Mascota en código: {…}") and back. A line that does not parse is no mascot.
export const mascotLine = (m: MascotMeta | null | undefined): string[] => (m ? [`${MASCOT_HEADING}: ${JSON.stringify({ file: m.file, name: m.name, description: m.description, sig: m.sig })}`] : []);
export function readMascotLine(text: string): MascotMeta | null {
  const json = text.match(new RegExp(`^${MASCOT_HEADING}:[ \\t]*(\\{.*\\})[ \\t]*$`, "im"))?.[1];
  if (!json) return null;
  try {
    const parsed = MascotMetaSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The code and what the app shows of it, as the studio and the render page hold it.
export type MascotCode = { source: string; name: string; description: string };
export const mascotSig = (source: string) => codeSig(["mascot", source.trim()]);
// The key a painted pose is kept under: the piece second and the whole pose.
export const mascotKey = (t: number, pose: MascotPose) => `${t.toFixed(4)}|${codeSig(pose)}`;

// ── The static check ───────────────────────────────────────────────────────────────────────────────────────────
const definesMascot = (code: string) => /\bfunction\s+drawMascot\s*\(|\b(?:const|let|var)\s+drawMascot\s*=/.test(stripComments(code));
export const redefinesMascot = definesMascot;

// Colours in the code (#rgb or #rrggbb) that are not the brand's, a step of one toward another, black or white.
// Halftone and dither steps are mixes of two palette colours, so a colour near any such mix is fine.
export function offBrandColours(source: string, brand: Pick<Brand, "bg" | "text" | "accent">): string[] {
  const rgb = (hex: string) => {
    const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const anchors = [brand.bg, brand.text, brand.accent, "#000000", "#ffffff"].map(rgb);
  const nearMix = (c: number[]) => {
    for (let i = 0; i < anchors.length; i++)
      for (let j = i; j < anchors.length; j++) {
        const a = anchors[i];
        const b = anchors[j];
        const ab = b.map((v, k) => v - a[k]);
        const len = ab.reduce((n, v) => n + v * v, 0);
        const k = len ? Math.min(1, Math.max(0, ab.reduce((n, v, q) => n + v * (c[q] - a[q]), 0) / len)) : 0;
        const d = Math.hypot(...c.map((v, q) => v - (a[q] + ab[q] * k)));
        if (d <= 28) return true;
      }
    return false;
  };
  const found = [...stripComments(source).matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g)].map((m) => m[0].toLowerCase());
  return [...new Set(found)].filter((c) => !nearMix(rgb(c)));
}

// Before running: not empty, not too long, defines drawMascot, nothing banned (with the line); colours off the brand
// are a warning.
export function validateMascotSource(source: string, brand?: Pick<Brand, "bg" | "text" | "accent">): CodeProblem[] {
  const code = source.trim();
  if (!code) return [{ message: "No hay código: pegá la respuesta de Opus.", fatal: true }];
  if (code.length > CODE_MAX_CHARS) return [{ message: `El código es muy largo (${code.length} caracteres, hasta ${CODE_MAX_CHARS}): pedile a Opus una versión más corta.`, fatal: true }];
  const problems: CodeProblem[] = [];
  if (!definesMascot(code)) problems.push({ message: "No encuentro la función drawMascot(ctx, t, pose): el código tiene que definirla (function drawMascot(ctx, t, pose) { … }).", fatal: true });
  problems.push(...bannedProblems(code).map((p) => ({ ...p, message: p.message.replace("usá info.random(semilla)", "usá un generador con semilla dentro del código") })));
  if (brand) {
    const off = offBrandColours(code, brand);
    if (off.length) problems.push({ message: `Usa colores que no son de la marca: ${off.slice(0, 6).join(", ")}${off.length > 6 ? "…" : ""}. Pedile a Opus que use solo la paleta (y tonos más claros u oscuros de esos colores).`, fatal: false });
  }
  return problems;
}

// The reply pasted from claude.ai: the code (the fenced block that defines drawMascot, else the longest code block,
// else the whole text), and the name and description Opus wrote before it ("NOMBRE: …", "DESCRIPCIÓN: …").
export function mascotFromReply(text: string): MascotCode {
  const clean = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const blocks = fencedBlocks(clean);
  const code = blocks.filter((b) => !b.lang || /^(js|javascript|jsx|ts|typescript|mjs)$/.test(b.lang));
  const pool = code.length ? code : blocks;
  const withFn = pool.filter((b) => definesMascot(b.body));
  const source = pool.length ? (withFn.length ? withFn : pool).reduce((a, b) => (b.body.length > a.body.length ? b : a)).body.trim() : clean.trim();
  // The name and description are read outside the code.
  const prose = blocks.length ? blocks.reduce((rest, b) => rest.replace(b.raw, "\n"), clean) : "";
  const field = (re: RegExp) => prose.match(re)?.[1].replace(/[*_`]/g, "").trim() ?? "";
  return {
    source,
    name: field(/^[ \t>*-]*(?:\*\*)?(?:NOMBRE|NAME)(?:\*\*)?\s*:\s*(.+)$/im).slice(0, 60),
    description: field(/^[ \t>*-]*(?:\*\*)?(?:DESCRIPCI[OÓ]N|DESCRIPTION)(?:\*\*)?\s*:\s*(.+)$/im).slice(0, 600),
  };
}

// ── The sample poses ───────────────────────────────────────────────────────────────────────────────────────────
// What the paste box draws (each on the test canvas, at scale 1 with the feet at MASCOT_TEST's x, y unless it moves
// them), each with what it is for: a repeat for purity, several t for breathing and blinking, every expression, the
// mouth, every gesture, facing left, a smaller scale, a shift and a look.
export type MascotSample = { id: string; label: string; t: number; pose: MascotPose; sheet?: true };
const base = (o: Partial<MascotPose> = {}): MascotPose => normalizePose({ x: MASCOT_TEST.x, y: MASCOT_TEST.y, scale: 1, facing: 1, expression: "neutral", mouth: 0, gesture: "idle", reach: 0, lookAt: null, ...o });
export const MASCOT_SAMPLES: MascotSample[] = [
  { id: "base", label: "Neutral, quieta", t: 0, pose: base(), sheet: true },
  { id: "repeat", label: "La misma, otra vez", t: 0, pose: base() },
  { id: "t1", label: "t = 0,7 s", t: 0.7, pose: base() },
  { id: "t2", label: "t = 1,6 s", t: 1.6, pose: base() },
  { id: "t3", label: "t = 2,5 s", t: 2.5, pose: base() },
  { id: "t4", label: "t = 3,3 s", t: 3.3, pose: base() },
  { id: "t5", label: "t = 4,4 s", t: 4.4, pose: base() },
  { id: "happy", label: "Contenta", t: 0, pose: base({ expression: "happy" }), sheet: true },
  { id: "surprised", label: "Sorprendida", t: 0, pose: base({ expression: "surprised" }), sheet: true },
  { id: "worried", label: "Preocupada", t: 0, pose: base({ expression: "worried" }), sheet: true },
  { id: "talking", label: "Hablando (boca a medias)", t: 0, pose: base({ expression: "talking", mouth: 0.5 }), sheet: true },
  { id: "mouth0", label: "Hablando, boca cerrada", t: 0, pose: base({ expression: "talking", mouth: 0 }) },
  { id: "mouth1", label: "Hablando, boca abierta", t: 0, pose: base({ expression: "talking", mouth: 1 }) },
  { id: "wave", label: "Saluda", t: 0.5, pose: base({ gesture: "wave", reach: 1 }), sheet: true },
  { id: "point", label: "Señala", t: 0.5, pose: base({ gesture: "point", reach: 1 }), sheet: true },
  { id: "present", label: "Presenta", t: 0.5, pose: base({ gesture: "present", reach: 1 }), sheet: true },
  { id: "cheer", label: "Festeja", t: 0.5, pose: base({ gesture: "cheer", reach: 1, expression: "happy" }), sheet: true },
  { id: "halfway", label: "Señala a medias (reach 0,5)", t: 0.5, pose: base({ gesture: "point", reach: 0.5 }) },
  { id: "left", label: "Mirando a la izquierda", t: 0, pose: base({ facing: -1 }), sheet: true },
  { id: "small", label: "A la mitad de tamaño", t: 0, pose: base({ scale: 0.5 }) },
  { id: "moved", label: "Corrida 100 px", t: 0, pose: base({ x: MASCOT_TEST.x + 100 }) },
  { id: "look", label: "Mira arriba a la izquierda", t: 0, pose: base({ lookAt: { x: 20, y: 40 } }), sheet: true },
];

// What the sandbox measured of one sample: the box of the pixels it painted (alpha over 8), how many it painted, how
// much of the canvas that is, and a fingerprint of every pixel.
export type MascotStats = { box: { x: number; y: number; w: number; h: number } | null; ink: number; share: number; hash: string };
export type MascotResult = { id: string; label: string; ms: number; stats: MascotStats | null; error?: { message: string; line?: number } };

// Everything the samples say about the code, in Spanish. Fatal: an error, a slow call, nothing drawn, a background
// that fills the canvas, the same t and pose painting different pixels, or a figure nowhere near its pose. Warnings: a
// figure that does not follow scale, facing, x, the mouth, an expression, a gesture or lookAt, or never moves with t.
export function checkMascotSamples(results: MascotResult[], limitMs = CODE_FRAME_MS): CodeProblem[] {
  const out: CodeProblem[] = [];
  const byId = new Map(results.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const r of results) {
    if (r.error) {
      const key = r.error.message;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ message: `${r.error.line ? `Línea ${r.error.line}` : "El código"} (pose «${r.label}»): ${r.error.message}`, ...(r.error.line && { line: r.error.line }), fatal: true });
      }
      continue;
    }
    if (r.ms > limitMs) out.push({ message: `La pose «${r.label}» tardó ${Math.round(r.ms)} ms y el límite es ${limitMs} ms: pedile a Opus un dibujo más simple.`, fatal: true });
  }
  if (out.some((p) => p.fatal)) return out;
  const stats = (id: string) => byId.get(id)?.stats ?? null;
  const empty = results.filter((r) => !r.stats || r.stats.ink === 0);
  if (empty.length) {
    out.push({ message: `No dibujó nada en ${empty.length === results.length ? "ninguna pose" : `estas poses: ${empty.map((r) => `«${r.label}»`).join(", ")}`}. Revisá que use pose.x, pose.y y pose.scale.`, fatal: true });
    return out;
  }
  const b = stats("base")!;
  if (b.share > 0.9) {
    out.push({ message: "Pintó todo el cuadro: la mascota va sin fondo (el fondo lo pone cada escena). Pedile a Opus que dibuje solo el personaje.", fatal: true });
    return out;
  }
  const r2 = stats("repeat");
  if (r2 && r2.hash !== b.hash) out.push({ message: "La misma pose en el mismo t dio dos dibujos distintos: el código guarda algo entre llamadas o usa azar. Tiene que ser una función pura de t y pose.", fatal: true });
  const box = b.box!;
  const unit = MASCOT_UNIT;
  const feetOff = Math.abs(box.y + box.h - MASCOT_TEST.y);
  const centre = box.x + box.w / 2;
  if (box.h < unit * 0.4 || box.h > unit * 1.6 || feetOff > unit * 0.25 || Math.abs(centre - MASCOT_TEST.x) > unit * 0.4)
    out.push({
      message: `En escala 1 la mascota tiene que medir unos ${unit} px con los pies en (x, y); midió ${Math.round(box.h)} px con la base a ${Math.round(feetOff)} px de y y el centro a ${Math.round(Math.abs(centre - MASCOT_TEST.x))} px de x. Pedile a Opus que respete pose.x, pose.y y pose.scale.`,
      fatal: true,
    });
  const small = stats("small")?.box;
  if (small && (small.h / box.h < 0.35 || small.h / box.h > 0.65)) out.push({ message: `Con scale 0,5 midió ${Math.round((small.h / box.h) * 100)} % de su alto: tiene que achicarse a la mitad.`, fatal: false });
  const moved = stats("moved")?.box;
  if (moved && Math.abs(moved.x - box.x - 100) > 12) out.push({ message: "Al correr pose.x 100 px no se movió lo mismo: tiene que pararse centrada en x.", fatal: false });
  const same = (id: string) => stats(id)?.hash === b.hash;
  if (same("left")) out.push({ message: "Con facing -1 se ve igual que con 1: tiene que darse vuelta (espejada).", fatal: false });
  const m0 = stats("mouth0");
  const m1 = stats("mouth1");
  if (m0 && m1 && m0.hash === m1.hash) out.push({ message: "La boca no se abre con pose.mouth: con 1 tiene que verse bien abierta y con 0 cerrada (la app la mueve con la voz).", fatal: false });
  const flatFaces = (["happy", "surprised", "worried", "talking"] as const).filter((e) => same(e));
  if (flatFaces.length) out.push({ message: `Estas caras se ven igual que la neutral: ${flatFaces.map((e) => MASCOT_EXPRESSION_LABEL[e]).join(", ")}.`, fatal: false });
  const stiff = (["wave", "point", "present", "cheer"] as const).filter((g) => same(g));
  if (stiff.length) out.push({ message: `Estos gestos no cambian nada: ${stiff.map((g) => MASCOT_GESTURE_LABEL[g]).join(", ")}.`, fatal: false });
  const half = stats("halfway");
  const full = stats("point");
  if (half && full && (half.hash === full.hash || half.hash === b.hash)) out.push({ message: "pose.reach no hace nada: con 0,5 el gesto tiene que ir a medio camino (la app lo hace entrar sobre el beat).", fatal: false });
  if (same("look")) out.push({ message: "pose.lookAt no cambia la mirada: los ojos tienen que ir hacia ese punto.", fatal: false });
  const times = ["t1", "t2", "t3", "t4", "t5"].map(stats);
  if (times.every((s) => s?.hash === b.hash)) out.push({ message: "No se mueve con t: tiene que respirar y parpadear (siempre igual para el mismo t).", fatal: false });
  return out;
}

// ── The prompt ─────────────────────────────────────────────────────────────────────────────────────────────────
export type MascotPromptInput = {
  series: { name: string; tagline: string; type: string; what: string; audience: string };
  brand: Pick<Brand, "bg" | "text" | "accent" | "motion">;
  tone?: string;
  // The code saved now, to change instead of starting over.
  current?: MascotCode | null;
  // The person's note ("un tarrito de yerba", "que sea más chiquita").
  note?: string;
  // Problems from the last test, to fix.
  problems?: string[];
};

const short = (text: string, n: number) => (text.trim().length > n ? `${text.trim().slice(0, n).trim()}…` : text.trim());

// The prompt, ready to paste in claude.ai.
export function mascotPrompt(o: MascotPromptInput): string {
  const kind = o.series.type === "ecommerce" ? "an online shop of products for the home" : o.series.type === "music" ? "a music project" : "software for a business (its real users run small stores)";
  return [
    "Hola Opus. Estoy armando la mascota de una marca en mi app (Playbook Studio): un personaje que la app dibuja en código en todos los videos.",
    "Necesito UNA mascota original, como una función de JavaScript que la dibuja en un canvas 2D. Seguí el contrato de abajo al pie de la letra.",
    "Respondé así: una línea «NOMBRE: …», una línea «DESCRIPCIÓN: …» (1 a 3 frases en castellano: qué es, cómo se ve, su carácter) y después un solo bloque ```js … ``` con el código. Nada más.",
    "",
    "--- TECHNICAL BRIEF (English) ---",
    "",
    "THE BRAND",
    `- Name: ${o.series.name}${o.series.tagline.trim() ? ` ("${o.series.tagline.trim()}")` : ""}. It is ${kind}.`,
    ...(o.series.what.trim() ? [`- What it is (in Spanish): ${short(o.series.what, 700)}`] : []),
    ...(o.series.audience.trim() ? [`- Who watches (in Spanish): ${short(o.series.audience, 400)}`] : []),
    `- Palette (the only colours): background ${o.brand.bg}, text ${o.brand.text}, accent ${o.brand.accent}. Write them as constants at the top of your code.`,
    ...(o.brand.motion && o.brand.motion !== "even" ? [`- How the brand moves: ${o.brand.motion} (solid: lands and stays; soft: settles slowly; springy: a small bounce).`] : []),
    ...(o.tone ? [`- The videos' comic voice: ${o.tone}.`] : []),
    "",
    "THE CHARACTER",
    "- ONE original mascot, invented for this brand. Never a known character, mascot or franchise, never \"in the style of\" a named studio, artist or show, never a real person, no other brand's logo or product.",
    "- It reads at phone size: a simple, strong silhouette, big readable eyes and mouth, two arms that can wave, point and present. Flat shapes; shade with flat steps, halftone dots or an ordered dither in a palette colour.",
    "- It belongs to the brand's world and audience (an object, an animal or a creature from where the problem lives) and it is warm: it guides, it never mocks the viewer.",
    "- It stays legible on the brand background: its outline or main body colour must stand out from the background colour.",
    ...(o.note?.trim() ? [`- What I want: ${o.note.trim()}`] : []),
    "",
    MASCOT_CONTRACT,
    "",
    "A TINY WORKING EXAMPLE (the shape of the code only: design your own character, do not copy this box):",
    "```js",
    MASCOT_EXAMPLE,
    "```",
    "",
    "HOW THE APP USES IT",
    "- The app tests it at sample poses (every expression, the mouth at 0, 0.5 and 1, every gesture at reach 0.5 and 1, facing -1, scale 0.5, a shifted x, a lookAt, and several t) and shows them as a contact sheet.",
    "- Then every animated scene of the brand calls drawMascot(ctx, t, pose) instead of drawing the character again, and the explainer videos put it on screen saying the narrator's line: mouth from the voice, expression from the line's emotion, a gesture on the beat.",
    ...(o.current?.source.trim() ? ["", `THE CURRENT MASCOT${o.current.name ? ` ("${o.current.name}")` : ""} (change it; keep what works and keep it the same character):`, "```js", o.current.source.trim(), "```"] : []),
    ...(o.problems?.length ? ["", "WHAT THE APP'S TEST FOUND (fix these):", ...o.problems.map((p) => `- ${p}`)] : []),
    "",
    "Reply with NOMBRE, DESCRIPCIÓN and the one ```js block that defines drawMascot(ctx, t, pose).",
  ].join("\n");
}

// What the code-scene prompt says about the mascot (shared/codePrompt.ts).
export function mascotForScenePrompt(m: { name: string; description: string }): string[] {
  return [
    "THE SERIES MASCOT (the app already draws it: reuse drawMascot, never redraw the character)",
    `- ${m.name}${m.description.trim() ? `: ${m.description.trim()}` : ""}`,
    "- When the scene shows the character, call info.mascot.draw(ctx, t, pose) (the same function is also there as drawMascot(ctx, t, pose)). Never draw it with your own shapes, never trace it, never define a function called drawMascot.",
    `- pose = { x, y (the point between its feet, pixels), scale (1 = ${MASCOT_UNIT} px tall), facing (1 looks right, -1 left), expression ("neutral" | "happy" | "surprised" | "worried" | "talking"), mouth (0..1: open it from the word times while it is the one speaking), gesture ("idle" | "wave" | "point" | "present" | "cheer"), reach (0..1, how far into the gesture: ease it in), lookAt ({ x, y } or null) }. It draws only the character, on top of what you painted before.`,
    "- It is not text: do not put it in the list of texts you return. Keep it clear of the words the viewer reads.",
  ];
}

// ── The explainer's character scene ───────────────────────────────────────────────────────────────────────────
// The pose of the mascot when it hosts a character scene (no clock: t, the scene's gesture and its timing, how loud
// the voice is now, which way what it presents is). surprise is a face, not an arm move; cheer is happy.
export function scenePose(o: {
  gesture: string;
  // Seconds since the gesture's beat (negative before it).
  sinceGesture: number;
  talk: number;
  expression: Exclude<MascotExpression, "talking">;
  toward: 1 | -1;
  lookAt: { x: number; y: number } | null;
  dry: boolean;
}): MascotPose {
  const g = o.gesture as string;
  const gesture: MascotGesture = g === "wave" || g === "point" || g === "present" || g === "cheer" ? g : "idle";
  const into = Math.min(1, Math.max(0, o.sinceGesture / (o.dry ? 0.35 : 0.45)));
  const reach = gesture === "idle" ? 0 : into < 0.5 ? 2 * into * into : 1 - (-2 * into + 2) ** 2 / 2;
  const on = o.sinceGesture >= 0;
  const expression: MascotExpression = g === "surprise" && on ? "surprised" : g === "cheer" && on ? "happy" : o.expression === "neutral" && o.talk > 0.04 ? "talking" : o.expression;
  return normalizePose({
    x: MASCOT_FRAME.x,
    y: MASCOT_FRAME.y,
    scale: MASCOT_FRAME.scale,
    facing: o.toward,
    expression,
    mouth: Math.round(o.talk * 100) / 100,
    gesture,
    reach: Math.round(reach * 100) / 100,
    lookAt: o.lookAt,
  });
}

// The poses on "Hoja de la mascota" (the PNG sheet for an image tool's reference), in order.
export const SHEET_SAMPLES = MASCOT_SAMPLES.filter((s) => s.sheet);
