// The quality loop's eyes: the contact sheet (one frame per beat, at phone-thumbnail size, with the second under
// each frame) and the facts the app measures itself (cuts and entrances against the beats, still stretches, the
// hook's timing, voices that run over, elements off the frame), so the reviewer never has to guess them.
import {
  BLUR_SHUTTER,
  BLUR_SUBFRAMES,
  DISCLOSURE_TAG,
  READ_LETTERS_PER_SECOND,
  STEP_DOWN_OVER,
  cutPush,
  focusShare,
  beyondNow,
  labelled,
  pushOf,
  pushWindows,
  quietGaps,
  readingIssues,
  sceneElements,
  settledAt,
  timeScenes,
  type MotionScript,
} from "../../shared/motion.ts";
import { CONTRAST_ACCENT, CONTRAST_TEXT, STEP_DOWN_CONTRAST, brandContrast, stepDownContrast, type Brand } from "../../shared/series.ts";
import { OVERLAP, SAFE_BAND_LABEL, overlapShare, safeBands, type SafeBand } from "../../shared/safeZone.ts";
import { disclosureBox, drawMotionFrame, sceneAt, scriptDuration, subtitleBox, type Box, type MotionWorld } from "./motion.ts";

export type SheetFormat = "vertical" | "horizontal";
export type Outside = { t: number; scene: number; key: string; format: SheetFormat };
// Text under a phone's top bar, caption or buttons (9:16 only).
export type Zoned = { t: number; scene: number; key: string; bands: SafeBand[] };
// Two settled lines of text on top of each other ("subtitle" is the voice's subtitle, "label" the CONCEPTO /
// SIMULACIÓN label). `down`: which of the two is an
// earlier label stepped down for the newest ("Foco de a uno"): still text on screen, so still an overlap.
export type Overlap = { t: number; scene: number; a: string; b: string; format: SheetFormat; down?: string[] };

// The elements that carry words to read.
const isText = (key: string) => key === "title" || key === "text" || key === "tag" || key === "subtitle" || key === "label" || /^item\d+$/.test(key);


const MAX_FRAMES = 28;
const ON_BEAT = 0.06;
// Things enter on the beat, so a frame right on it shows them just starting. The sheet looks a moment later, when
// what entered has settled.
export const SHEET_SETTLE = 0.3;

// The seconds the sheet shows: just after every beat (evenly thinned when there are too many), plus the first two
// seconds at half-second steps for the hook, and the middle of every cut (to see two scenes overlapping). Without
// music, one a second.
export function sheetTimes(script: MotionScript, beats: number[]): number[] {
  const duration = scriptDuration(script);
  const end = Math.max(0, duration - 0.05);
  const push = cutPush(script.tone);
  // A hard cut (dry tone) has no middle to look at; a camera journey ("through") has one whatever the tone.
  const cuts = timeScenes(script.scenes)
    .slice(1)
    .filter((s) => pushOf(s, push) > 0)
    .map((s) => s.start + pushOf(s, push) / 2);
  const grid = beats.length > 1 ? beats.map((b) => b + SHEET_SETTLE).filter((b) => b > 0 && b < end) : Array.from({ length: Math.floor(end) }, (_, i) => i + 1);
  const room = MAX_FRAMES - 4;
  const thinned = grid.length > room ? Array.from({ length: room }, (_, i) => grid[Math.round((i * (grid.length - 1)) / (room - 1))]) : grid;
  const all = [0.5, 1, 1.5, 2, ...thinned.filter((t) => t > 2.1), ...cuts, end];
  return [...new Set(all.map((t) => Math.round(Math.min(end, t) * 100) / 100))].sort((a, b) => a - b);
}

export function contactSheet(
  script: MotionScript,
  world: MotionWorld,
  format: SheetFormat,
): { canvas: HTMLCanvasElement; times: number[]; outside: Outside[]; zoned: Zoned[]; overlaps: Overlap[] } {
  const vertical = format === "vertical";
  const [cw, ch] = vertical ? [216, 384] : [384, 216];
  const cols = vertical ? 7 : 4;
  const label = 24;
  const times = sheetTimes(script, world.beats);
  const rows = Math.ceil(times.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw;
  canvas.height = rows * (ch + label);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const frame = document.createElement("canvas");
  frame.width = cw;
  frame.height = ch;
  const fctx = frame.getContext("2d")!;
  const timed = timeScenes(script.scenes);
  const push = cutPush(script.tone);
  const outside: Outside[] = [];
  const zoned: Zoned[] = [];
  const overlaps: Overlap[] = [];
  times.forEach((t, n) => {
    const seen = new Map<string, Box>();
    drawMotionFrame(fctx, cw, ch, t, script, world, (sceneId, key, box) => seen.set(`${sceneId}:${key}`, box));
    for (const [id, box] of seen) {
      if (box.x < -1 || box.y < -1 || box.x + box.w > cw + 1 || box.y + box.h > ch + 1) {
        const [sceneId, key] = id.split(":");
        const scene = timed.find((s) => s.id === sceneId);
        if (scene) outside.push({ t, scene: scene.index + 1, key, format });
      }
    }
    // Settled text only: an entrance passing over something is not a problem.
    const scene = timed[sceneAt(timed, t)];
    if (scene) {
      const els = sceneElements(scene);
      const settled = [...seen]
        .filter(([id]) => id.startsWith(`${scene.id}:`))
        .map(([id, box]) => ({ key: id.slice(scene.id.length + 1), box }))
        .filter(({ key }) => {
          const el = els.find((e) => e.key === key);
          return isText(key) && el !== undefined && t - scene.start >= settledAt(scene, el, pushOf(scene, push));
        });
      const sub = t - scene.start >= pushOf(scene, push) ? subtitleBox(fctx, cw, ch, t, script, world) : null;
      const label = disclosureBox(fctx, cw, ch, t, script, world);
      const texts = [...settled, ...(sub ? [{ key: "subtitle", box: sub }] : []), ...(label ? [{ key: "label", box: label }] : [])];
      for (const { key, box } of settled) {
        const bands = safeBands(box, cw, ch);
        if (bands.length) zoned.push({ t, scene: scene.index + 1, key, bands });
      }
      const stepped = (key: string) => focusShare(scene, key, t - scene.start) > 0;
      texts.forEach((a, i) =>
        texts.slice(i + 1).forEach((b) => {
          if (overlapShare(a.box, b.box) <= OVERLAP) return;
          const down = [a.key, b.key].filter(stepped);
          overlaps.push({ t, scene: scene.index + 1, a: a.key, b: b.key, format, ...(down.length && { down }) });
        }),
      );
    }
    const x = (n % cols) * cw;
    const y = Math.floor(n / cols) * (ch + label);
    ctx.drawImage(frame, x, y);
    ctx.fillStyle = "#15171c";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const i = sceneAt(timed, t);
    const cut = i > 0 && t - timed[i].start < pushOf(timed[i], push);
    ctx.fillStyle = cut ? "#b52f12" : "#15171c";
    ctx.fillText(cut ? `${t.toFixed(2)} s · corte ${i}→${i + 1}` : `${t.toFixed(2)} s · escena ${i + 1}`, x + 6, y + ch + label / 2);
    ctx.strokeStyle = "#d9dbe0";
    ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch + label - 1);
  });
  return { canvas, times, outside, zoned, overlaps };
}

export function sheetJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

const nearestGap = (t: number, beats: number[]) => beats.reduce((best, b) => Math.min(best, Math.abs(b - t)), Infinity);

// What the app measured, in English for the reviewer.
export function measureFacts(
  script: MotionScript,
  beats: number[],
  music: string,
  voiceLengths: Record<string, number>,
  outside: Outside[],
  zoned: Zoned[] = [],
  overlaps: Overlap[] = [],
  brand?: Brand,
  // The piece's "Desenfoque en los cortes" (world.cutBlur): the sheet's cut frames are motion blurred.
  cutBlur = false,
): string {
  const timed = timeScenes(script.scenes);
  const total = scriptDuration(script);
  const tone = script.tone ?? "warm";
  const lines: string[] = [
    `Length: ${total.toFixed(1)} s, ${timed.length} scenes.`,
    `Tone: ${tone} (${tone === "dry" ? "hard cuts and very few sounds, on purpose" : tone === "absurdist" ? "fast pushes between scenes, more sounds" : "soft pushes between scenes"}).`,
    `Music: ${music}${beats.length ? ` (${beats.length} beats on the grid)` : ", no beat grid"}.`,
  ];
  if (beats.length) {
    const cuts = timed.slice(1).map((s) => s.start);
    const onCuts = cuts.filter((t) => nearestGap(t, beats) <= ON_BEAT).length;
    const entries = timed.flatMap((s) => sceneElements(s).filter((e) => e.lane !== "voice" && e.at > 0.05).map((e) => s.start + e.at));
    const onEntries = entries.filter((t) => nearestGap(t, beats) <= ON_BEAT).length;
    lines.push(`Cuts on a beat (within ${ON_BEAT * 1000} ms): ${onCuts} of ${cuts.length}. Elements entering on a beat: ${onEntries} of ${entries.length} (each sound hit lands exactly with its element).`);
  }
  const push = cutPush(script.tone);
  // The blur is the cut's own look: said up front, so a smeared "corte" frame is not read as a fault.
  if (cutBlur && pushWindows(script.scenes, push).length)
    lines.push(
      `Motion blur on the cuts: during each push between scenes a frame is the average of ${BLUR_SUBFRAMES} moments over the ${Math.round(BLUR_SHUTTER * 1000)} ms before it (a 180° shutter at 30 fps), so on the frames marked "corte" whatever moves is smeared along its path, on purpose. Outside the pushes every frame is sharp. The smear is not a fault; two busy layouts muddled together still is.`,
    );
  const gaps = quietGaps(script.scenes, push);
  lines.push(`Still stretches over 4 s: ${gaps.length ? gaps.map((g) => `${g.from.toFixed(1)}–${g.to.toFixed(1)} s`).join(", ") : "none"}.`);
  const first = timed[0];
  if (first) {
    const title = sceneElements(first).find((e) => e.key === "title");
    lines.push(
      title
        ? `Hook: scene 1's title starts at ${title.at.toFixed(2)} s and is fully on screen at about ${settledAt(first, title).toFixed(2)} s.`
        : "Hook: scene 1 has no title.",
    );
  }
  const over = timed.flatMap((s) => {
    const voice = sceneElements(s).find((e) => e.key === "voice");
    if (!voice) return [];
    const known = voiceLengths[s.id];
    const length = known ?? s.voice.trim().split(/\s+/).length / 2.5;
    return voice.at + length > s.seconds + 0.05
      ? [`scene ${s.index + 1}'s voice lasts ${known === undefined ? "about " : ""}${length.toFixed(1)} s from ${voice.at.toFixed(2)} s, and the scene ${s.seconds.toFixed(1)} s`]
      : [];
  });
  lines.push(`Voices that run past their scene (the mix fades them out on the cut, mid-word if need be): ${over.length ? over.join("; ") : "none"}.`);
  const off = [...new Map(outside.map((o) => [`${o.scene}:${o.key}:${o.format}`, o])).values()];
  lines.push(
    `Elements running off the frame: ${off.length ? off.map((o) => `scene ${o.scene} ${o.key} (${o.format === "vertical" ? "9:16" : "16:9"}, at ${o.t.toFixed(2)} s)`).join("; ") : "none"}.`,
  );
  const under = [...new Map(zoned.map((z) => [`${z.scene}:${z.key}`, z])).values()];
  lines.push(
    `9:16 text under the platforms' own interface (approximate: top bar 10%, caption 20% at the bottom, buttons on the right 12% from 40% down; the app already keeps the subtitle and the AI notice out): ${
      under.length ? under.map((z) => `scene ${z.scene} ${z.key} (${z.bands.map((b) => SAFE_BAND_LABEL[b]).join(", ")}, at ${z.t.toFixed(2)} s)`).join("; ") : "none"
    }.`,
  );
  const covered = [...new Map(overlaps.map((o) => [`${o.scene}:${o.a}:${o.b}:${o.format}`, o])).values()];
  lines.push(
    `Settled text on top of other text: ${
      covered.length
        ? covered
            .map((o) => {
              const name = (key: string) => (o.down?.includes(key) ? `${key} (stepped down)` : key);
              return `scene ${o.scene} ${name(o.a)} over ${name(o.b)} (${o.format === "vertical" ? "9:16" : "16:9"}, at ${o.t.toFixed(2)} s)`;
            })
            .join("; ")
        : "none"
    }.`,
  );
  if (brand?.motion && brand.motion !== "even")
    lines.push(
      `Brand physics: ${brand.motion} (${brand.motion === "solid" ? "firm landings, no bounce, nothing drifts" : brand.motion === "soft" ? "slow, gentle landings; pictures drift slightly once in" : "springy landings; pictures breathe once in"}). It is the brand's choice; text never moves while it is read.`,
    );
  if (brand) {
    const c = brandContrast(brand);
    lines.push(
      `Brand contrast (WCAG): text on background ${c.text.toFixed(1)}:1 (needs ${CONTRAST_TEXT}:1), accent on background ${c.accent.toFixed(1)}:1 (needs ${CONTRAST_ACCENT}:1 for big words and numbers).`,
    );
    // "Foco de a uno": earlier labels are dimmer on the sheet on purpose; say how far, so it is not read as a fault.
    const focused = timed.filter((s) => STEP_DOWN_OVER[s.template] !== undefined && s.items.filter((i) => i.trim()).length > 1);
    if (focused.length) {
      const d = stepDownContrast(brand);
      lines.push(
        `Focus one at a time (${focused.map((s) => `scene ${s.index + 1} ${s.template}`).join(", ")}): when a new label or step enters, the earlier ones step down toward the background during its entrance and stay as readable context, on purpose: text ${d.text.toFixed(1)}:1 and accent ${d.accent.toFixed(1)}:1 on the background once down (a step down never goes under ${STEP_DOWN_CONTRAST}:1, WCAG large text, and a colour already under it does not step down); the newest keeps the brand's full contrast. A dimmer earlier label is not a contrast fault or a fade-out.`,
      );
    }
  }
  // CONCEPTO / SIMULACIÓN: what the frames show on purpose, and what was flagged as beyond "Lo que existe hoy".
  const tagged = timed.filter((s) => labelled(s));
  const flagged = timed.filter((s) => beyondNow(s) && !labelled(s));
  lines.push(
    `Concept / simulation labels (a hard rule: only what the series lists as working today is shown as real; the app draws the label in the top right corner, inside the 9:16 safe zone, and keeps that scene's title under it; it cannot move or go): ${
      tagged.length ? tagged.map((s) => `scene ${s.index + 1} ${DISCLOSURE_TAG[s.disclosure as "concept" | "simulation"]}`).join(", ") : "none"
    }. Scenes already flagged as showing something not on the working-today list, with no label yet: ${
      flagged.length ? flagged.map((s) => `scene ${s.index + 1} ("${s.beyond!.what}")`).join("; ") : "none"
    }.`,
  );
  const reading = readingIssues(script.scenes, push);
  lines.push(
    `Lines on screen too briefly to read (need about 0.3 s per word once fully in, 0.8 s for a 1-3 word label, and 1 s per ${READ_LETTERS_PER_SECOND} letters when the words are long): ${
      reading.length
        ? reading.map((r) => `scene ${r.index + 1} ${r.key} "${r.text}" has ${r.has.toFixed(1)} s, needs ${r.needs.toFixed(1)} s`).join("; ")
        : "none"
    }.`,
  );
  lines.push("Loudness: the app normalizes the mix to -14 LUFS with peaks under -1.5 dBFS.");
  return lines.join("\n");
}
