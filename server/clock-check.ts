// Harness for the lyric clock. A kick grid that locks onto hats, a snapped word, or a gradient card fails here.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { EMPTY_BRIEF } from "../shared/example.ts";
import { DEFAULT_LYRIC_STYLE, newLyricPiece } from "../shared/lyrics.ts";
import { DEFAULT_BRAND } from "../shared/series.ts";
import {
  ClockError,
  assembleSync,
  decodeWav,
  encodeWav,
  fitKicks,
  qaMarkdown,
  spring,
  synthDrumStem,
  wordClock,
  type SyncDoc,
  UI_SPRING,
  TYPE_SPRING,
} from "../shared/clock.ts";
import { critique, pixel, syncPixels, layoutSync } from "../shared/syncDraw.ts";
import { drumsFromUpload, writeSyncFiles } from "./sync.ts";
import { demucsCommand } from "./demucs.ts";
import { PROJECTS_DIR } from "./projects.ts";

const GRID0 = 0.4542;
const PERIOD = 0.4615;
const HAT_EARLY = 0.214;
const FPS = 24;
const SR = 44100;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function near(a: number, b: number, tol: number, message: string) {
  assert(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b} (tol ${tol})`);
}

function train(grid0: number, period: number, count: number): number[] {
  return Array.from({ length: count }, (_, n) => grid0 + n * period);
}

const planted = train(GRID0, PERIOD, 40);
const hats = planted.map((t) => t - HAT_EARLY);
const pcm = synthDrumStem(SR, planted, hats, planted[planted.length - 1] + 0.8);

const grid = fitKicks(pcm, FPS);
console.log(
  `grid0 ${grid.grid0.toFixed(4)}  period ${grid.period.toFixed(4)}  bpm ${grid.bpm.toFixed(2)}  kicks ${grid.kicks.length}  within ±0.5 ms ${grid.kicksWithinHalfMs}  median ${grid.medianErrorMs.toFixed(3)} ms`,
);
near(grid.period, PERIOD, 0.002, "period");
near(grid.grid0, GRID0, 0.015, "grid0");
assert(Math.abs(grid.grid0 - (GRID0 - HAT_EARLY)) > 0.05, `la grilla cayó en los hats (${grid.grid0})`);
assert(grid.kicks.length === planted.length, `kicks ${grid.kicks.length}, esperaba ${planted.length}: ${grid.kicks.slice(0, 8).join(", ")}`);
planted.forEach((t, i) => near(grid.kicks[i], t, 0.015, `kick ${i}`));
for (const hat of hats) {
  const closest = Math.min(...grid.kicks.map((k) => Math.abs(k - hat)));
  assert(closest > 0.05, `un hat quedó como kick (${hat})`);
}
assert(grid.kicksWithinHalfMs === grid.kicks.length, `kicks fuera de ±0.5 ms: ${grid.kicks.length - grid.kicksWithinHalfMs}`);
assert(grid.medianErrorMs <= 0.5, `error mediano ${grid.medianErrorMs} ms`);
assert(grid.usable && grid.sections.length === 1, "un tempo constante tiene que ser una sola grilla");
assert(grid.downbeats.length >= 8, "faltan downbeats");
grid.downbeats.forEach((t) => {
  const onGrid = grid.kicks.some((k) => Math.abs(k - t) < 0.02);
  assert(onGrid, `downbeat ${t} no cae en un kick`);
});

try {
  fitKicks(synthDrumStem(SR, [], hats, 8), FPS);
  throw new Error("los hats solos armaron una grilla");
} catch (error) {
  assert(error instanceof ClockError, String(error));
}

const mildB0 = planted[15] + PERIOD * 1.005;
const mild = synthDrumStem(SR, [...planted.slice(0, 16), ...train(mildB0, PERIOD * 1.005, 16)], [], mildB0 + 16 * PERIOD);
const mildGrid = fitKicks(mild, FPS);
assert(mildGrid.usable && mildGrid.sections.length === 1, `0.5% no se parte: drift ${mildGrid.drift} secciones ${mildGrid.sections.length}`);

const hardPeriod = PERIOD * 1.04;
const hardB0 = planted[15] + hardPeriod;
const hard = synthDrumStem(SR, [...planted.slice(0, 16), ...train(hardB0, hardPeriod, 16)], [], hardB0 + 16 * hardPeriod);
const hardGrid = fitKicks(hard, FPS);
assert(!hardGrid.usable && hardGrid.sections.length >= 2, `4% tiene que partir secciones (drift ${hardGrid.drift}, ${hardGrid.sections.length})`);
const hardQa = qaMarkdown({
  grid: hardGrid,
  words: [],
  moves: [],
  lyric_gate: "0/0",
  lyric_gate_ok: false,
  unaligned: [],
  engines: { beats: "drums-lowpass-150", words: "none" },
});
assert(hardQa.trim().endsWith("Hay que partir secciones: el tempo deriva " + (hardGrid.drift * 100).toFixed(1) + `% (${hardGrid.sections.length} tramos).`) || hardQa.includes("Hay que partir secciones:"), hardQa);

const kickAt = grid.kicks[8];
const heard = [
  { word: "HOLA", start: kickAt, end: kickAt + 0.18 },
  { word: "MANO", start: kickAt + 0.25, end: kickAt + 0.4 },
  { word: "FIN", start: kickAt + 1.2, end: kickAt + 1.4 },
];
const lyrics = "[verso]\nHOLA MANO\n[coro]\nFIN\n";
const moves = ["step", "step", "step", "step", "step", "step", "step", "step", "land-taskbar", "hit-cursor", "turn"].join("\n");
const doc = assembleSync({ drums: pcm, lyrics, moves, heard, fps: FPS, wordsEngine: "fixture" });
assert(doc.lyric_gate === "3/3", doc.lyric_gate);
const hola = doc.words[0];
const mano = doc.words[1];
const fin = doc.words[2];
assert(hola.section === "verso" && fin.section === "coro", "se perdieron las secciones");
near(hola.t ?? -1, kickAt, 1e-3, "HOLA no está en su t");
near(hola.t_out ?? -1, mano.t ?? -1, 1e-3, "t_out de HOLA");
near(mano.t_out ?? -1, kickAt + 0.4, 0.02, "MANO cierra la frase en el silencio");
const manoOff = Math.min(...doc.grid.kicks.map((k) => Math.abs(k - (mano.t ?? 0))));
assert(manoOff > 0.03, `MANO se pegó al kick (${manoOff})`);
const land = doc.moves.find((move) => move.move === "land-taskbar");
assert(land, "falta el land");
near(land.t, kickAt, 1e-3, "el land no cayó en el kick 8");
assert(land.offset_ms === 0 && land.on === "kick", "el land no quedó en el kick");
assert(doc.moves.find((move) => move.move === "turn")?.on === "downbeat", "el turn no está en el downbeat");
const qa = qaMarkdown(doc);
assert(qa.includes(`gate de letra: ${doc.lyric_gate}`), qa);
assert(qa.trim().split("\n").at(-1) === "La grilla sirve.", qa);

const missed = wordClock("[verso]\nHOLA ZUT\n", [{ word: "HOLA", start: 1, end: 1.2 }]);
assert(missed.gate === "1/2" && missed.unaligned.includes("ZUT") && missed.words[1].t === null, JSON.stringify(missed));

let over = false;
let typeOver = false;
for (let i = 0; i <= 80; i++) {
  const t = i / 40;
  if (spring(0, 1, 0, t, UI_SPRING) > 1.001) over = true;
  if (spring(0, 1, 0, t, TYPE_SPRING) > 1.0001) typeOver = true;
}
assert(over, "el spring de UI no tiene overshoot");
assert(!typeOver, "el tipo grande se pasa del target");

const round = decodeWav(encodeWav(pcm.samples, SR));
const roundGrid = fitKicks(round, FPS);
near(roundGrid.grid0, grid.grid0, 0.001, "wav roundtrip grid0");
near(roundGrid.period, grid.period, 0.001, "wav roundtrip period");

const w = 180;
const h = 320;
const brand = DEFAULT_BRAND;
const frame = (index: number) => syncPixels(w, h, index / FPS, doc, brand);
const at400 = frame(400);
const at100 = frame(100);
const at400Again = frame(400);
assert(at400.length === at400Again.length && at400.every((v, i) => v === at400Again[i]), "el frame 400 cambió al redibujarlo");
assert(at100.some((v, i) => v !== at400[i]), "el frame 100 y el 400 salieron iguales");

const at = land.t;
const shot = syncPixels(w, h, at, doc, brand);
const layout = layoutSync(w, h, at, doc, brand);
const foot = pixel(shot, w, layout.feet.x + Math.floor(layout.feet.w / 2), layout.feet.y);
const floor = pixel(shot, w, layout.feet.x + Math.floor(layout.feet.w / 2), layout.floor.y + 1);
const mark = pixel(shot, w, layout.kick.x + 1, layout.kick.y + 1);
assert(layout.word === "HOLA", `en el acento la palabra es ${layout.word}`);
assert(foot[0] === layout.body.color[0] && floor[0] === layout.floor.color[0], "los pies no pisan el piso");
assert(mark[0] === layout.kick.color[0] && layout.kick.on, "el kick no está marcado");
assert(layout.plate && layout.plate.y > h * 0.45 && layout.plate.w < w * 0.7, "la placa no queda abajo, en su propio ancho");
const top = pixel(shot, w, 2, 4);
const mid = pixel(shot, w, 2, Math.floor(h * 0.3));
assert(top[0] === mid[0] && top[1] === mid[1], "el campo izquierdo no es plano");

const good = critique(doc, brand);
assert(good.passed && good.score >= 8 && good.fixes.length === 0, JSON.stringify(good.worst));

const shifted: SyncDoc = { ...doc, moves: doc.moves.map((move, i) => (i === 8 ? { ...move, t: move.kick_t + 0.12, offset_ms: 120 } : move)) };
const bad = critique(shifted, brand);
assert(!bad.passed && bad.fixes.length > 0, "un acento fuera de tolerancia no puede pasar");
const again = critique(bad.applied, brand);
assert(again.passed, JSON.stringify(again.worst));

const gradient = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    gradient[i] = Math.round((y / h) * 255);
    gradient[i + 1] = 40;
    gradient[i + 2] = 80;
    gradient[i + 3] = 255;
  }
}
const banned = critique(doc, brand, [{ t: 1, rgba: gradient, w, h }]);
assert(banned.fixes.some((fix) => /gradiente/i.test(fix.problem)), "el gradiente pasó la crítica");

const hasDemucs = demucsCommand() !== null;
if (!hasDemucs) {
  let refused = false;
  try {
    await drumsFromUpload(null, encodeWav(pcm.samples, SR));
  } catch (error) {
    refused = error instanceof ClockError && /master/i.test(error.message);
  }
  assert(refused, "sin Demucs el master no puede convertirse en grilla");
}

const base = "http://127.0.0.1:8787";
let apiUp = false;
for (let i = 0; i < 40 && !apiUp; i++) {
  try {
    apiUp = (await fetch(`${base}/api/projects`)).ok;
  } catch {
    apiUp = false;
  }
  if (!apiUp) await new Promise((r) => setTimeout(r, 250));
}
assert(apiUp, "la API en 8787 no responde");

const created = await fetch(`${base}/api/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ series: "grimes" }),
});
const createdBody = (await created.json()) as { id?: string; error?: string };
assert(created.ok && createdBody.id, createdBody.error ?? "no se creó el proyecto");
const id = createdBody.id;
let uploaded = false;
try {
  const drumsWav = encodeWav(pcm.samples, SR);
  let res: Response | null = null;
  for (let i = 0; i < 20; i++) {
    const form = new FormData();
    form.append("lyrics", lyrics);
    form.append("moves", moves);
    form.append("language", "es");
    form.append("fps", "24");
    form.append("drums", new Blob([drumsWav.buffer as ArrayBuffer], { type: "audio/wav" }), "drums.wav");
    res = await fetch(`${base}/api/projects/${id}/sync`, { method: "POST", body: form });
    if (res.status !== 404) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const body = (await res!.json()) as { sync?: SyncDoc; qa?: string; error?: string };
  assert(res!.ok && body.sync && body.qa, body.error ?? `sync HTTP ${res!.status}`);
  assert(body.sync.lyric_gate === "0/3", `el gate sin voz tiene que imprimirse 0/3, salió ${body.sync.lyric_gate}`);
  assert(body.qa.includes("La grilla sirve."), body.qa);
  near(body.sync.grid.grid0, GRID0, 0.015, "grid0 HTTP");
  const onDisk = JSON.parse(await readFile(join(PROJECTS_DIR, id, "sync", "sync.json"), "utf8")) as { lyric_gate: string };
  assert(onDisk.lyric_gate === "0/3", "sync.json no guardó el gate");
  const qaDisk = await readFile(join(PROJECTS_DIR, id, "sync", "QA.md"), "utf8");
  assert(qaDisk.trim().split("\n").at(-1) === "La grilla sirve.", qaDisk);
  uploaded = true;

  const piece = { ...newLyricPiece(DEFAULT_LYRIC_STYLE, "vertical"), title: "Reloj de prueba", text: lyrics, language: "es" as const };
  const saved = await fetch(`${base}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: { version: 1, kind: "lyrics", step: "lyrics", pieceBrief: { ...EMPTY_BRIEF, series: "grimes" }, lyrics: piece },
      markdown: "# Reloj de prueba",
    }),
  });
  assert(saved.ok, "no se guardó el estado del proyecto");
  await writeSyncFiles(id, doc);
  const finalQa = await readFile(join(PROJECTS_DIR, id, "sync", "QA.md"), "utf8");
  assert(finalQa.includes("gate de letra: 3/3"), finalQa);
  console.log(`PROJECT=${id}`);
} finally {
  if (!uploaded) await rm(join(PROJECTS_DIR, id), { recursive: true, force: true });
}

console.log("reloj ok");
