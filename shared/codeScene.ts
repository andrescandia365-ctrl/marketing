// "Escena de código": an explainer scene whose animation is JavaScript the person pastes (written by Opus in
// claude.ai from the prompt the app builds, shared/codePrompt.ts). This file holds what both sides read: the contract
// (one constant, quoted by the prompt and enforced by the runner in src/lib/codeSandbox.ts), the paste cleaning, the
// static validator, and the checks on the texts the code says it drew (reading holds, the 9:16 safe zone, [VERIFY]).
// Pure: no DOM, no clock.

// How long one frame may take inside the sandbox before it counts as too slow, and how long the app waits for an
// answer before it tears the sandbox down (an endless loop never answers).
export const CODE_FRAME_MS = 250;
export const CODE_HANG_MS = 2500;
export const CODE_LOAD_MS = 8000;
// The longest code the paste box takes (a scene, not a library).
export const CODE_MAX_CHARS = 80_000;
// The texts are sampled every this many seconds of the scene to check how long each holds still.
export const CODE_SAMPLE_STEP = 0.1;
// How many texts one frame may report (more are dropped).
export const CODE_MAX_TEXTS = 60;
// A text whose box moves less than this (share of the frame's short side) between samples counts as still.
export const STILL_TOLERANCE = 0.004;

// The contract, word for word what the prompt gives Opus and what the sandbox runs.
export const CODE_CONTRACT = `CONTRACT (the app runs your code exactly like this; anything else fails)
1. Define one top-level function: function draw(ctx, t, info) { ...; return texts; }
   You may add top-level helper functions and constants, but no top-level code that draws or keeps state.
2. ctx is a 2D canvas context (an OffscreenCanvas) of exactly info.width x info.height pixels. Every call gets a
   fresh, transparent canvas with the default state: paint the whole frame, starting with the background (info.brand.bg).
3. t is the second inside this scene, 0 <= t <= info.duration. The app asks for frames in any order (frame 90, then
   frame 12, then frame 90 again): draw must be a pure function of t. The same t always paints the same frame.
4. Forbidden (they are blocked and throw): Date, performance, Math.random, setTimeout, setInterval,
   requestAnimationFrame, fetch, XMLHttpRequest, WebSocket, import, eval, async/await, promises, and any variable that
   keeps state between calls. For randomness use info.random(seed): it returns a function that gives numbers in
   0..1, the same sequence for the same seed; create it inside draw.
5. One frame must take under ${CODE_FRAME_MS} ms (aim for under 20 ms).
6. Return an array with every piece of text you drew this frame, as it appears in this frame:
   [{ text: "the exact words", x, y, w, h }] where x, y is the top-left corner of its box and w, h its size, in
   pixels (use ctx.measureText(text).width for w and the font size for h). Return [] when there is no text. The app
   uses it to check that each text holds still long enough to read and stays inside the safe zone.
7. info = {
     width, height,            // pixels: 1080 x 1920 (vertical, 9:16) or 1920 x 1080 (horizontal, 16:9)
     format,                   // "vertical" or "horizontal"
     duration,                 // seconds this scene lasts
     fps,                      // 30
     brand: { bg, text, accent, displayFont, uiFont },   // colours as "#rrggbb", Google Fonts family names
     tone,                     // "dry", "warm" or "absurdist"
     voice,                    // what the narrator says during this scene ("" if nothing)
     words,                    // [{ text, start, end }] seconds inside the scene when each word is said ([] if unknown)
     emotion,                  // how the line is said, in Spanish
     assets,                   // { name: ImageBitmap } the pictures attached to this scene (draw with ctx.drawImage)
     safe: { x, y, w, h },     // the box where text may go (on 9:16 the phone apps cover the rest)
     floor,                    // y in pixels: keep text above it (the app's subtitle and notice sit below)
     random(seed)              // seeded generator, see 4
   }
8. Fonts: ctx.font = \`700 120px "\${info.brand.displayFont}"\` (weights 400, 500, 600 and 700 of both brand fonts are
   loaded). Colours only from info.brand.
9. Do not draw subtitles, the voice's words as a caption, the AI notice or the CONCEPTO label: the app draws them on top.`;

// A tiny example that follows the contract (the prompt shows it; the tests run it).
export const CODE_EXAMPLE = `function draw(ctx, t, info) {
  const { width: w, height: h, brand } = info;
  ctx.fillStyle = brand.bg;
  ctx.fillRect(0, 0, w, h);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const size = Math.round(Math.min(w, h) * 0.1);
  ctx.font = \`700 \${size}px "\${brand.displayFont}"\`;
  ctx.textBaseline = "top";
  const words = ["Stock", "al", "día"];
  const texts = [];
  let x = info.safe.x + size * 0.4;
  const y = info.safe.y + info.safe.h * 0.3;
  words.forEach((word, i) => {
    const p = ease((t - 0.2 - i * 0.08) / 0.45); // stagger, then hold still
    if (p <= 0) return;
    ctx.globalAlpha = p;
    ctx.fillStyle = i === 2 ? brand.accent : brand.text;
    ctx.fillText(word, x, y + (1 - p) * size * 0.6); // rise into place
    const width = ctx.measureText(word).width;
    if (p >= 1) texts.push({ text: word, x, y, w: width, h: size });
    x += width + size * 0.3;
  });
  ctx.globalAlpha = 1;
  return texts;
}`;

export type CodeText = { text: string; x: number; y: number; w: number; h: number };
// Every CODE_SAMPLE_STEP seconds from 0: the texts drawn, with their boxes as shares of the frame (x, w of its width;
// y, h of its height), so the checks read the same at any size. `sig`: what was sampled (codeSig).
export type CodeSamples = { sig: string; step: number; frames: CodeText[][] };
// What a code scene saves (MotionScene.code): the code, the pictures it gets (cast ids or "layer:N"), and its sampled
// texts. `error`: the last test run failed (the scene does not render until it passes again).
export type SceneCode = { source: string; assets: string[]; samples?: CodeSamples; error?: string };

// A problem with the code, in Spanish, with its line when known.
export type CodeProblem = { message: string; line?: number; fatal: boolean };

// The code out of a reply pasted from claude.ai: the fenced block that defines draw (or the longest one), without
// its fences; a reply with no fences is taken as it is. Windows line ends become plain ones.
export function stripFences(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const blocks = [...clean.matchAll(/(^|\n)[ \t]*(`{3,}|~{3,})[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g)].map((m) => ({ lang: m[3].toLowerCase(), body: m[4] }));
  if (!blocks.length) {
    // An opened fence never closed (the reply was cut): everything after it.
    const open = clean.match(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*)$/);
    return (open ? open[3] : clean).trim();
  }
  const code = blocks.filter((b) => !b.lang || /^(js|javascript|jsx|ts|typescript|mjs)$/.test(b.lang));
  const pool = code.length ? code : blocks;
  const withDraw = pool.filter((b) => definesDraw(b.body));
  const pick = (withDraw.length ? withDraw : pool).reduce((a, b) => (b.body.length > a.body.length ? b : a));
  return pick.body.trim();
}

const definesDraw = (code: string) => /\bfunction\s+draw\s*\(|\b(?:const|let|var)\s+draw\s*=/.test(stripComments(code));

// Comments out, strings left alone as far as a small scanner can: line numbers stay where they were.
export function stripComments(code: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      const body = code.slice(i, end < 0 ? code.length : end + 2);
      out += body.replace(/[^\n]/g, " ");
      i += body.length;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// What the code may not use, and what to say. The sandbox blocks them too; this says so before it runs, with the line.
const BANNED: { re: RegExp; message: string }[] = [
  { re: /\bMath\s*\.\s*random\b/, message: "usa Math.random: la animación tiene que salir igual cada vez; usá info.random(semilla)" },
  { re: /\bDate\b/, message: "usa Date: el cuadro depende solo de t, nunca del reloj" },
  { re: /\bperformance\s*\./, message: "usa performance: el cuadro depende solo de t, nunca del reloj" },
  { re: /\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, message: "usa temporizadores: la app pide cada cuadro con su t, el código no anima solo" },
  { re: /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|navigator\s*\.\s*sendBeacon)\b/, message: "intenta usar la red: la escena no tiene acceso a internet" },
  { re: /(^|[^.\w])import\s*[(\s{*"']/, message: "usa import: todo tiene que estar en el mismo código" },
  { re: /\b(eval|Function)\s*\(|\bnew\s+Function\b/, message: "usa eval o new Function: no está permitido" },
  { re: /\b(async|await)\b|\bnew\s+Promise\b|\.then\s*\(/, message: "es asíncrono (async, await o promesas): draw tiene que dibujar y devolver en el momento" },
  { re: /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/, message: "intenta guardar datos: la escena no guarda nada entre cuadros" },
  { re: /\b(window\s*\.\s*)?(parent|top|opener)\s*\.\s*(postMessage|location|document)\b/, message: "intenta salir de su caja (parent, top): no está permitido" },
];

// The static check before running: not empty, not too long, defines draw, nothing banned (with the line).
export function validateSource(source: string): CodeProblem[] {
  const code = source.trim();
  if (!code) return [{ message: "No hay código: pegá la respuesta de Opus.", fatal: true }];
  if (code.length > CODE_MAX_CHARS) return [{ message: `El código es muy largo (${code.length} caracteres, hasta ${CODE_MAX_CHARS}): pedile a Opus una versión más corta.`, fatal: true }];
  const problems: CodeProblem[] = [];
  const bare = stripComments(code);
  if (/<\/?(html|body|script|canvas)\b/i.test(bare) && !definesDraw(code))
    problems.push({ message: "Parece una página HTML, no el código de la escena: pedile a Opus solo la función draw(ctx, t, info) en JavaScript.", fatal: true });
  if (!definesDraw(code)) problems.push({ message: "No encuentro la función draw(ctx, t, info): el código tiene que definirla (function draw(ctx, t, info) { … }).", fatal: true });
  const lines = bare.split("\n");
  for (const { re, message } of BANNED) {
    const at = lines.findIndex((l) => re.test(stringsOut(l)));
    if (at >= 0) problems.push({ message: `Línea ${at + 1}: ${message}.`, line: at + 1, fatal: true });
  }
  return problems;
}

// A line with its string contents blanked, so a word inside quotes ("Date" as text on screen) is not code.
const stringsOut = (line: string) => line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');

// What draw returned, as the app keeps it: the texts with a finite box, clipped to CODE_MAX_TEXTS. null: it did not
// return a list (the contract asks for one, even empty).
export function textsOf(value: unknown): CodeText[] | null {
  if (!Array.isArray(value)) return null;
  const out: CodeText[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text : typeof o.text === "number" ? String(o.text) : "";
    const [x, y, w, h] = [o.x, o.y, o.w, o.h].map((n) => (typeof n === "number" && Number.isFinite(n) ? n : NaN));
    if (!text.trim() || [x, y, w, h].some((n) => Number.isNaN(n))) continue;
    out.push({ text: text.slice(0, 300), x, y, w: Math.abs(w), h: Math.abs(h) });
    if (out.length >= CODE_MAX_TEXTS) break;
  }
  return out;
}

// The boxes as shares of the frame (and back), so samples taken at one size check at any other.
export const shareTexts = (texts: CodeText[], w: number, h: number): CodeText[] =>
  texts.map((t) => ({ text: t.text, x: t.x / w, y: t.y / h, w: t.w / w, h: t.h / h }));

// The seconds a scene is sampled at: every step from 0 to just before its end.
export function sampleTimes(seconds: number, step = CODE_SAMPLE_STEP): number[] {
  const n = Math.max(1, Math.floor((Math.max(0, seconds) - 1e-6) / step) + 1);
  return Array.from({ length: n }, (_, k) => Math.round(k * step * 1000) / 1000);
}

// A short fingerprint (FNV-1a) of what the samples depend on.
export function codeSig(parts: unknown): string {
  const text = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// What the sampled texts depend on: the code, its pictures, the format, the scene's length and its words.
export function samplesSig(scene: { seconds: number; voice: string; emotion: string; code?: SceneCode }, format: "vertical" | "horizontal", tone?: string): string {
  return codeSig([scene.code?.source ?? "", scene.code?.assets ?? [], format, Math.round(scene.seconds * 100) / 100, scene.voice.trim(), scene.emotion.trim(), tone ?? "warm"]);
}

// One stretch where a text holds still: from (seconds), how long.
export type CodeHold = { text: string; from: number; hold: number };

// Each text's longest still stretch, counted from `after` (a scene still sliding in is not readable yet) and never past
// the scene's end. A text is still while it is drawn in every sample with its box within STILL_TOLERANCE of where it
// was (shares of the short side). `aspect`: width / height of the frame the shares belong to.
export function codeHolds(samples: CodeSamples, seconds: number, after = 0, aspect = 9 / 16): CodeHold[] {
  const best = new Map<string, CodeHold>();
  const tolX = aspect >= 1 ? STILL_TOLERANCE / aspect : STILL_TOLERANCE;
  const tolY = aspect >= 1 ? STILL_TOLERANCE : STILL_TOLERANCE * aspect;
  const near = (a: CodeText, b: CodeText) => Math.abs(a.x - b.x) <= tolX && Math.abs(a.y - b.y) <= tolY && Math.abs(a.w - b.w) <= tolX * 2 && Math.abs(a.h - b.h) <= tolY * 2;
  type Run = { box: CodeText; from: number };
  let open = new Map<string, Run[]>();
  const close = (text: string, run: Run, until: number) => {
    const from = Math.max(run.from, after);
    const hold = Math.max(0, Math.min(until, seconds) - from);
    const had = best.get(text);
    if (!had || hold > had.hold) best.set(text, { text, from, hold: Math.round(hold * 1000) / 1000 });
  };
  samples.frames.forEach((texts, k) => {
    const t = k * samples.step;
    const next = new Map<string, Run[]>();
    for (const box of texts) {
      const key = box.text.trim();
      const runs = open.get(key) ?? [];
      const i = runs.findIndex((r) => near(r.box, box));
      const run = i >= 0 ? runs.splice(i, 1)[0] : { box, from: t };
      next.set(key, [...(next.get(key) ?? []), { box: run.box, from: run.from }]);
    }
    for (const [text, runs] of open) for (const run of runs) close(text, run, t);
    open = next;
  });
  const end = samples.frames.length * samples.step;
  for (const [text, runs] of open) for (const run of runs) close(text, run, end);
  return [...best.values()].sort((a, b) => a.from - b.from);
}

// When each text first shows, in seconds (for the "something new every 2 to 4 s" check).
export function codeReveals(samples: CodeSamples): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  samples.frames.forEach((texts, k) => {
    for (const t of texts) {
      const key = t.text.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(Math.round(k * samples.step * 1000) / 1000);
    }
  });
  return out;
}

// Every distinct text the code drew.
export const codeTexts = (samples: CodeSamples | undefined): string[] => [...new Set((samples?.frames ?? []).flat().map((t) => t.text.trim()))].filter(Boolean);

// A text that leaves the box where the app's text may go: on 9:16 the safe zone (shares of the frame) and, above the
// subtitle, the floor (share of the height). Each text once, at the first sample where it is out.
export type CodeBreach = { text: string; at: number; where: "top" | "bottom" | "left" | "right" | "subtitle" };
export function codeBreaches(samples: CodeSamples, safe: { x: number; y: number; w: number; h: number }, floor: number): CodeBreach[] {
  const out: CodeBreach[] = [];
  const told = new Set<string>();
  const slack = 0.002;
  samples.frames.forEach((texts, k) => {
    for (const t of texts) {
      const key = t.text.trim();
      if (told.has(key)) continue;
      const where: CodeBreach["where"] | null =
        t.y < safe.y - slack
          ? "top"
          : t.x < safe.x - slack
            ? "left"
            : t.x + t.w > safe.x + safe.w + slack
              ? "right"
              : t.y + t.h > safe.y + safe.h + slack
                ? "bottom"
                : t.y + t.h > floor + slack
                  ? "subtitle"
                  : null;
      if (!where) continue;
      told.add(key);
      out.push({ text: key, at: Math.round(k * samples.step * 1000) / 1000, where });
    }
  });
  return out;
}

export const BREACH_LABEL: Record<CodeBreach["where"], string> = {
  top: "queda arriba, bajo la barra de la app",
  bottom: "queda abajo, bajo el texto y la cuenta de la app",
  left: "se sale por la izquierda",
  right: "queda a la derecha, bajo los botones de la app",
  subtitle: "baja hasta donde va el subtítulo",
};

// ── The sandbox's messages ──────────────────────────────────────────────────────────────────────────────────────
// Every message carries the instance's token; anything without it is ignored.
export type FontBytes = { family: string; weight: string; data: ArrayBuffer };
export type CodeInfoWire = {
  width: number;
  height: number;
  format: "vertical" | "horizontal";
  duration: number;
  fps: number;
  brand: { bg: string; text: string; accent: string; displayFont: string; uiFont: string };
  tone: string;
  voice: string;
  words: { text: string; start: number; end: number }[];
  emotion: string;
  safe: { x: number; y: number; w: number; h: number };
  floor: number;
};
export type HostMessage =
  | { token: string; type: "init"; info: CodeInfoWire; fonts: FontBytes[]; assets: { name: string; bitmap: unknown }[] }
  | { token: string; type: "frame"; id: number; t: number };
export type SandboxMessage =
  | { token: string; type: "ready"; hasDraw: boolean; error?: { message: string; line?: number } }
  | { token: string; type: "inited"; fontErrors: string[] }
  | { token: string; type: "frame"; id: number; bitmap?: unknown; texts: unknown; ms: number; error?: { message: string; line?: number } };

// A message from the sandbox, checked: the right token and a known shape; null otherwise.
export function readSandboxMessage(data: unknown, token: string): SandboxMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.token !== token) return null;
  const error = (e: unknown) => {
    if (!e || typeof e !== "object") return undefined;
    const o = e as Record<string, unknown>;
    return { message: String(o.message ?? "Error").slice(0, 500), ...(typeof o.line === "number" && Number.isFinite(o.line) && { line: o.line }) };
  };
  if (m.type === "ready") return { token, type: "ready", hasDraw: m.hasDraw === true, ...(m.error ? { error: error(m.error) } : {}) };
  if (m.type === "inited") return { token, type: "inited", fontErrors: Array.isArray(m.fontErrors) ? m.fontErrors.map(String) : [] };
  if (m.type === "frame" && typeof m.id === "number")
    return { token, type: "frame", id: m.id, bitmap: m.bitmap, texts: m.texts, ms: typeof m.ms === "number" ? m.ms : 0, ...(m.error ? { error: error(m.error) } : {}) };
  return null;
}

// A runtime error as the person reads it: the message and the line of their code.
export const problemText = (e: { message: string; line?: number }, t?: number) =>
  `${e.line ? `Línea ${e.line}` : "El código"}${t !== undefined ? ` (en t = ${t.toFixed(2)} s)` : ""}: ${e.message}`;
