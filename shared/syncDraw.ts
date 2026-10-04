// Mute preview of the lyric clock. Every pixel is a function of t: no timers, no Math.random, no frame memory.
// The field is the series brand, flat. The word sits on its own plate. A cut is a hard swap on the downbeat.
import type { Brand } from "./series.ts";
import {
  TYPE_SPRING,
  UI_SPRING,
  activeMove,
  activeWord,
  applyClockFixes,
  nearestKick,
  spring,
  type Fix,
  type SyncDoc,
  type SyncMove,
} from "./clock.ts";

export type RGB = [number, number, number];
export type Rect = { x: number; y: number; w: number; h: number };

export type SyncLayout = {
  bg: RGB;
  panel: Rect & { color: RGB };
  floor: Rect & { color: RGB };
  body: Rect & { color: RGB };
  head: Rect & { color: RGB };
  arm: Rect & { color: RGB };
  feet: Rect;
  kick: Rect & { on: boolean; color: RGB };
  plate: (Rect & { color: RGB }) | null;
  ink: RGB;
  glyphs: { x: number; y: number; scale: number; text: string } | null;
  cursor: Rect & { color: RGB };
  underline: Rect & { color: RGB } | null;
  word: string | null;
  cut: number;
};

const FONT_SRC = `
A 01110 10001 10001 11111 10001 10001 10001
B 11110 10001 11110 10001 10001 10001 11110
C 01111 10000 10000 10000 10000 10000 01111
D 11110 10001 10001 10001 10001 10001 11110
E 11111 10000 11110 10000 10000 10000 11111
F 11111 10000 11110 10000 10000 10000 10000
G 01111 10000 10000 10111 10001 10001 01111
H 10001 10001 11111 10001 10001 10001 10001
I 11111 00100 00100 00100 00100 00100 11111
J 00111 00010 00010 00010 10010 10010 01100
K 10001 10010 10100 11000 10100 10010 10001
L 10000 10000 10000 10000 10000 10000 11111
M 10001 11011 10101 10101 10001 10001 10001
N 10001 11001 10101 10011 10001 10001 10001
O 01110 10001 10001 10001 10001 10001 01110
P 11110 10001 10001 11110 10000 10000 10000
Q 01110 10001 10001 10001 10101 10010 01101
R 11110 10001 10001 11110 10100 10010 10001
S 01111 10000 10000 01110 00001 00001 11110
T 11111 00100 00100 00100 00100 00100 00100
U 10001 10001 10001 10001 10001 10001 01110
V 10001 10001 10001 10001 10001 01010 00100
W 10001 10001 10001 10101 10101 10101 01010
X 10001 10001 01010 00100 01010 10001 10001
Y 10001 10001 01010 00100 00100 00100 00100
Z 11111 00001 00010 00100 01000 10000 11111
0 01110 10001 10011 10101 11001 10001 01110
1 00100 01100 00100 00100 00100 00100 01110
2 01110 10001 00001 00010 00100 01000 11111
3 11110 00001 00001 01110 00001 00001 11110
4 00010 00110 01010 10010 11111 00010 00010
5 11111 10000 11110 00001 00001 10001 01110
6 00110 01000 10000 11110 10001 10001 01110
7 11111 00001 00010 00100 01000 01000 01000
8 01110 10001 10001 01110 10001 10001 01110
9 01110 10001 10001 01111 00001 00010 01100
? 01110 10001 00010 00100 00100 00000 00100
`;

const FONT: Record<string, string> = {};
for (const line of FONT_SRC.trim().split("\n")) {
  const [ch, ...bits] = line.trim().split(/\s+/);
  const body = bits.join("");
  if (ch && body.length === 35) FONT[ch] = body;
}

export function hexRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function luma(c: RGB): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function contrast(a: RGB, b: RGB): number {
  const l1 = luma(a);
  const l2 = luma(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

type Pose = { x: number; lift: number; arm: number; face: number };

function poseOf(move: SyncMove, index: number): Pose {
  const kind = move.move.split("-")[0].toLowerCase();
  const side = index % 2 === 0 ? 0.22 : 0.58;
  if (kind === "land" || kind === "accent") return { x: 0.36, lift: 0, arm: 0.15, face: 1 };
  if (kind === "step") return { x: side, lift: 0, arm: 0.12, face: 1 };
  if (kind === "hit") return { x: side, lift: 0.08, arm: 1, face: 1 };
  if (kind === "turn" || kind === "cut") return { x: side, lift: 0, arm: 0.2, face: -1 };
  return { x: 0.36, lift: 0, arm: 0.2, face: 1 };
}

function poseAt(t: number, moves: SyncMove[]): Pose {
  const rest: Pose = { x: 0.36, lift: 0, arm: 0.15, face: 1 };
  if (!moves.length) return rest;
  const keys = moves.map((move, index) => ({ t: move.t, pose: poseOf(move, index) }));
  for (const key of keys) {
    if (Math.abs(t - key.t) <= 1e-4) return key.pose;
  }
  if (t <= keys[0].t) return keys[0].pose;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < t) i++;
  if (i >= keys.length - 1) return keys[keys.length - 1].pose;
  const a = keys[i];
  const b = keys[i + 1];
  const u = (t - a.t) / (b.t - a.t || 1);
  return {
    x: a.pose.x + (b.pose.x - a.pose.x) * u,
    lift: a.pose.lift + (b.pose.lift - a.pose.lift) * u,
    arm: a.pose.arm + (b.pose.arm - a.pose.arm) * u,
    face: a.pose.face,
  };
}

function cursorX(t: number, moves: SyncMove[], width: number): number {
  const hits = moves.filter((move) => {
    const kind = move.move.split("-")[0].toLowerCase();
    return kind === "hit" || kind === "step";
  });
  let from = width * 0.18;
  let to = from;
  let t0 = 0;
  for (const hit of hits) {
    if (hit.t > t) break;
    from = spring(from, to, t0, hit.t, UI_SPRING);
    to = hit.move.toLowerCase().startsWith("hit") ? width * 0.72 : width * 0.42;
    t0 = hit.t;
  }
  return spring(from, to, t0, t, UI_SPRING);
}

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function layoutSync(w: number, h: number, t: number, doc: SyncDoc, brand: Brand): SyncLayout {
  const bg = hexRgb(brand.bg);
  const text = hexRgb(brand.text);
  const accent = hexRgb(brand.accent);
  const cut = doc.grid.downbeats.filter((d) => d <= t + 1e-6).length % 2;
  const panelW = Math.round(w * 0.56);
  const floorY = Math.round(h * 0.78);
  const floorH = Math.max(8, Math.round(h * 0.05));
  const pose = poseAt(t, doc.moves);
  const panelX = cut ? w - panelW : 0;
  const bodyW = Math.max(12, Math.round(panelW * 0.24));
  const bodyH = Math.max(28, Math.round(h * 0.2));
  const liftPx = Math.round(pose.lift * bodyH);
  const feetBottom = floorY - liftPx;
  const bodyX = Math.round(panelX + pose.x * (panelW - bodyW));
  const bodyY = feetBottom - bodyH;
  const headW = Math.round(bodyW * 0.72);
  const headH = Math.round(headW * 0.9);
  const headX = bodyX + Math.round((bodyW - headW) / 2);
  const armW = Math.max(6, Math.round(bodyW * (0.35 + pose.arm * 0.7)));
  const armH = Math.max(6, Math.round(bodyH * 0.12));
  const armX = pose.face < 0 ? bodyX - armW + 4 : bodyX + bodyW - 4;
  const armY = bodyY + Math.round(bodyH * 0.28);
  const word = activeWord(doc, t);
  const onKick = nearestKick(doc, t) !== null;
  const kickW = onKick && doc.grid.downbeats.some((d) => Math.abs(d - t) <= 0.5 / doc.grid.fps) ? 14 : 8;
  const kickH = onKick ? Math.round(h * 0.09) : Math.round(h * 0.03);
  let plate: SyncLayout["plate"] = null;
  let glyphs: SyncLayout["glyphs"] = null;
  let underline: SyncLayout["underline"] = null;
  const ink = contrast(accent, bg) >= contrast(accent, text) ? bg : text;
  if (word?.t != null) {
    const label = fold(word.text);
    const openW = Math.max(24, w - panelW);
    let scale = Math.max(2, Math.round(h / 110));
    while (scale > 1 && label.length * 6 * scale + scale * 4 > openW - 4) scale--;
    const gw = label.length * (5 * scale + scale);
    const pad = Math.max(2, scale * 2);
    const pw = gw + pad * 2;
    const ph = 7 * scale + pad * 2;
    const px = cut ? Math.round(w * 0.04) : w - pw - Math.round(w * 0.04);
    const py = floorY - ph - Math.max(4, Math.round(h * 0.03));
    plate = { x: px, y: py, w: pw, h: ph, color: accent };
    glyphs = { x: px + pad, y: py + pad, scale, text: label };
    const full = Math.max(scale * 4, pw - pad * 2);
    const grown = spring(0, full, word.t, t, TYPE_SPRING);
    underline = { x: px + pad, y: py + ph - Math.max(2, Math.round(scale * 0.6)), w: Math.max(0, Math.min(full, grown)), h: Math.max(2, Math.round(scale * 0.45)), color: ink };
  }
  const cursorW = Math.max(6, Math.round(panelW * 0.08));
  return {
    bg,
    panel: { x: panelX, y: 0, w: panelW, h: floorY, color: mix(bg, text, cut ? 0.14 : 0.07) },
    floor: { x: 0, y: floorY, w, h: floorH, color: accent },
    body: { x: bodyX, y: bodyY, w: bodyW, h: bodyH, color: text },
    head: { x: headX, y: bodyY - headH - 2, w: headW, h: headH, color: text },
    arm: { x: armX, y: armY, w: armW, h: armH, color: text },
    feet: { x: bodyX, y: feetBottom - 2, w: bodyW, h: 2 },
    kick: { x: w - kickW - 10, y: 12, w: kickW, h: kickH, on: onKick, color: onKick ? accent : mix(bg, accent, 0.45) },
    plate,
    ink,
    glyphs,
    cursor: {
      x: panelX + Math.round(cursorX(t, doc.moves, Math.max(cursorW + 4, panelW - cursorW))),
      y: Math.max(8, bodyY + Math.round(bodyH * 0.22)),
      w: cursorW,
      h: cursorW,
      color: accent,
    },
    underline,
    word: word?.text ?? null,
    cut,
  };
}

function fill(rgba: Uint8Array, w: number, h: number, rect: Rect, color: RGB) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(w, rect.x + rect.w);
  const y1 = Math.min(h, rect.y + rect.h);
  for (let y = y0; y < y1; y++) {
    let i = (y * w + x0) * 4;
    for (let x = x0; x < x1; x++) {
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
      i += 4;
    }
  }
}

function blitGlyph(rgba: Uint8Array, w: number, h: number, rows: string[], x: number, y: number, scale: number, color: RGB) {
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] !== "1") continue;
      fill(rgba, w, h, { x: x + col * scale, y: y + row * scale, w: scale, h: scale }, color);
    }
  }
}

export function drawSyncFrame(rgba: Uint8Array, w: number, h: number, t: number, doc: SyncDoc, brand: Brand): SyncLayout {
  const layout = layoutSync(w, h, t, doc, brand);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = layout.bg[0];
    rgba[i + 1] = layout.bg[1];
    rgba[i + 2] = layout.bg[2];
    rgba[i + 3] = 255;
  }
  fill(rgba, w, h, layout.panel, layout.panel.color);
  fill(rgba, w, h, layout.floor, layout.floor.color);
  fill(rgba, w, h, layout.body, layout.body.color);
  fill(rgba, w, h, layout.head, layout.head.color);
  fill(rgba, w, h, layout.arm, layout.arm.color);
  fill(rgba, w, h, layout.cursor, layout.cursor.color);
  fill(rgba, w, h, layout.kick, layout.kick.color);
  if (layout.plate) fill(rgba, w, h, layout.plate, layout.plate.color);
  if (layout.glyphs) {
    let x = layout.glyphs.x;
    const box = "11111100011000110001100011000111111";
    for (const ch of layout.glyphs.text) {
      if (ch === " ") {
        x += layout.glyphs.scale * 3;
        continue;
      }
      const raw = FONT[ch] ?? box;
      const rows: string[] = [];
      for (let i = 0; i < 7; i++) rows.push(raw.slice(i * 5, i * 5 + 5));
      blitGlyph(rgba, w, h, rows, x, layout.glyphs.y, layout.glyphs.scale, layout.ink);
      x += 6 * layout.glyphs.scale;
    }
  }
  if (layout.underline && layout.underline.w > 0) fill(rgba, w, h, layout.underline, layout.underline.color);
  return layout;
}

export function syncPixels(w: number, h: number, t: number, doc: SyncDoc, brand: Brand): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  drawSyncFrame(rgba, w, h, t, doc, brand);
  return rgba;
}

export function pixel(rgba: Uint8Array, w: number, x: number, y: number): RGB {
  const i = (y * w + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2]];
}

function same(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function columnLooksGradient(rgba: Uint8Array, w: number, h: number, x: number): boolean {
  const cols: number[] = [];
  for (let i = 0; i < 8; i++) {
    const y = Math.min(h - 1, Math.floor((h * 0.7 * i) / 7));
    cols.push(rgba[(y * w + Math.min(w - 1, x)) * 4]);
  }
  const span = Math.max(...cols) - Math.min(...cols);
  if (span < 36) return false;
  let smooth = 0;
  let jumps = 0;
  let direction = 0;
  for (let i = 1; i < cols.length; i++) {
    const d = cols[i] - cols[i - 1];
    if (Math.abs(d) > 40) jumps++;
    else if (Math.abs(d) >= 2) {
      smooth++;
      direction += Math.sign(d);
    }
  }
  return jumps === 0 && smooth >= 5 && Math.abs(direction) === smooth;
}

export function sheetTimes(doc: SyncDoc): { start: number; mid: number; end: number; hit: number[] } {
  const kicks = doc.grid.kicks;
  const start = kicks[0] ?? 0;
  const end = kicks[kicks.length - 1] ?? start;
  const hitMove = doc.moves.find((move) => move.move.toLowerCase().startsWith("hit")) ?? doc.moves[0];
  const hitT = hitMove?.kick_t ?? start;
  const hit: number[] = [];
  for (let i = -6; i < 6; i++) hit.push(hitT + i / doc.grid.fps);
  return { start, mid: (start + end) / 2, end, hit };
}

export type CritiqueFrame = { t: number; rgba: Uint8Array; w: number; h: number };

export type Critique = {
  score: number;
  passed: boolean;
  fixes: Fix[];
  worst: Fix[];
  applied: SyncDoc;
};

function feetMove(doc: SyncDoc): SyncMove | null {
  return (
    doc.moves.find((move) => /^(land|accent)/i.test(move.move)) ??
    doc.moves.find((move) => poseOf(move, 0).lift === 0) ??
    null
  );
}

// Renders the contact moments, reads the pixels, and applies one pass of clock fixes.
// A failing pass always names a problem. It does not invent a word time.
export function critique(doc: SyncDoc, brand: Brand, frames?: CritiqueFrame[]): Critique {
  const fixes: Fix[] = [];
  if (!doc.lyric_gate_ok) {
    const pending = doc.unaligned.length ? doc.unaligned : ["(la letra)"];
    for (const text of pending) {
      fixes.push({
        t: 0,
        problem: `La palabra «${text}» no tiene tiempo.`,
        fix: "Alinearla en el stem vocal. No inventar el tiempo ni pegarla al kick.",
      });
    }
  }
  const pinned = applyClockFixes(doc);
  fixes.push(...pinned.fixes);
  if (!doc.grid.usable && doc.grid.sections.length < 2) {
    fixes.push({
      t: doc.grid.grid0,
      problem: `El tempo deriva ${(doc.grid.drift * 100).toFixed(1)}% y sigue en un solo periodo.`,
      fix: "Partir secciones y medir el periodo de cada tramo.",
    });
  }
  const supplied = frames ?? [];
  for (const frame of supplied) {
    if (columnLooksGradient(frame.rgba, frame.w, frame.h, 2) || columnLooksGradient(frame.rgba, frame.w, frame.h, Math.floor(frame.w / 2))) {
      fixes.push({
        t: frame.t,
        problem: "Texto centrado sobre un gradiente.",
        fix: "Campo plano del color de la marca, placa propia para la palabra y corte seco en el downbeat.",
      });
      break;
    }
  }
  const probeW = 180;
  const probeH = 320;
  const land = feetMove(doc);
  if (land) {
    const rgba = syncPixels(probeW, probeH, land.t, doc, brand);
    const layout = layoutSync(probeW, probeH, land.t, doc, brand);
    const foot = pixel(rgba, probeW, layout.feet.x + Math.floor(layout.feet.w / 2), layout.feet.y);
    const floor = pixel(rgba, probeW, layout.feet.x + Math.floor(layout.feet.w / 2), layout.floor.y + 1);
    if (!same(foot, layout.body.color) || !same(floor, layout.floor.color) || layout.feet.y + layout.feet.h !== layout.floor.y) {
      fixes.push({
        t: land.t,
        problem: "En el land los pies no coinciden con el piso.",
        fix: "Bajar la línea de los pies hasta la barra del piso en ese acento.",
      });
    }
  }
  const shown = doc.words.find((word) => word.t !== null && word.t_out !== null && word.t < word.t_out);
  if (shown?.t != null) {
    const rgba = syncPixels(probeW, probeH, shown.t, doc, brand);
    const layout = layoutSync(probeW, probeH, shown.t, doc, brand);
    if (!layout.plate || !layout.glyphs) {
      fixes.push({ t: shown.t, problem: `«${shown.text}» no está en una placa.`, fix: "Dibujar la palabra en su placa desde t hasta t_out." });
    } else {
      const plateAt = pixel(rgba, probeW, layout.plate.x + 1, layout.plate.y + 1);
      let foundInk = false;
      const gw = 5 * layout.glyphs.scale;
      const gh = 7 * layout.glyphs.scale;
      for (let dy = 0; dy < gh && !foundInk; dy++) {
        for (let dx = 0; dx < gw; dx++) {
          if (same(pixel(rgba, probeW, layout.glyphs.x + dx, layout.glyphs.y + dy), layout.ink)) foundInk = true;
        }
      }
      if (!same(plateAt, layout.plate.color) || !foundInk) {
        fixes.push({
          t: shown.t,
          problem: `La placa de «${shown.text}» no se lee.`,
          fix: "Subir el contraste de la placa contra el campo, sin centrar el texto en un gradiente.",
        });
      }
    }
  }
  const kickT = doc.grid.kicks[0];
  if (kickT !== undefined) {
    const rgba = syncPixels(probeW, probeH, kickT, doc, brand);
    const layout = layoutSync(probeW, probeH, kickT, doc, brand);
    const mark = pixel(rgba, probeW, layout.kick.x + 1, layout.kick.y + 1);
    if (!layout.kick.on || !same(mark, layout.kick.color)) {
      fixes.push({ t: kickT, problem: "El kick no se ve en su t.", fix: "Marcar el kick en ese frame, más alto si es downbeat." });
    }
  }
  const moveNow = doc.moves[0];
  if (moveNow && activeMove(doc, moveNow.t)?.move !== moveNow.move) {
    fixes.push({ t: moveNow.t, problem: `${moveNow.move} no está activo en su t.`, fix: "Mostrar el acento en el kick, no en un fade." });
  }
  let score = 10;
  if (!doc.lyric_gate_ok) score -= 4;
  if (pinned.fixes.length) score -= 2;
  if (!doc.grid.usable && doc.grid.sections.length < 2) score -= 2;
  if (fixes.some((fix) => /gradiente|pies|placa|kick no se ve/i.test(fix.problem))) score -= 2;
  score = Math.max(1, Math.min(10, score));
  if (fixes.length === 0) score = 10;
  else score = Math.min(score, 8);
  return { score, passed: fixes.length === 0, fixes, worst: fixes.slice(0, 3), applied: pinned.doc };
}

export type ContactSheet = { rgba: Uint8Array; w: number; h: number; times: number[] };

export function contactFrames(doc: SyncDoc, brand: Brand): CritiqueFrame[] {
  const times = sheetTimes(doc);
  const fw = 180;
  const fh = 320;
  return [times.start, times.mid, times.end, ...times.hit].map((t) => ({ t, w: fw, h: fh, rgba: syncPixels(fw, fh, t, doc, brand) }));
}

export function contactSheet(doc: SyncDoc, brand: Brand, shots = contactFrames(doc, brand)): ContactSheet {
  const frames = shots.map((shot) => shot.t);
  const fw = shots[0]?.w ?? 180;
  const fh = shots[0]?.h ?? 320;
  const gap = 6;
  const cols = 6;
  const rows = Math.ceil(frames.length / cols);
  const w = cols * fw + (cols - 1) * gap;
  const h = rows * fh + (rows - 1) * gap;
  const rgba = new Uint8Array(w * h * 4);
  shots.forEach((shot, index) => {
    const ox = (index % cols) * (fw + gap);
    const oy = Math.floor(index / cols) * (fh + gap);
    for (let y = 0; y < fh; y++) {
      const src = y * fw * 4;
      rgba.set(shot.rgba.subarray(src, src + fw * 4), ((oy + y) * w + ox) * 4);
    }
  });
  return { rgba, w, h, times: frames };
}
