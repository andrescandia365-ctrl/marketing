// "Storyboard" of an explainer: one panel per scene, read from the scenes as they play (arrangeScenes), so it says
// what the preview, the render page and the contact sheet show and sound. Each panel has the scene's settled frame
// (drawn by drawMotionFrame at one moment once everything in it has arrived), its time range, template, what is said,
// what sounds (soundHits, and whether the bed dips: roomWindows), how it comes in, its camera and its CONCEPTO /
// SIMULACIÓN label. The panel data and the Markdown are pure; only the PNG sheet touches a canvas.
import { metaphorLine } from "../../shared/metaphor.ts";
import { clipText, videoAssetOf } from "../../shared/screenVideo.ts";
import {
  DISCLOSURE_TAG,
  MOTION_CAMERA_LABEL,
  MOTION_MOOD_LABEL,
  MOTION_TEMPLATE_LABEL,
  MOTION_TONE_LABEL,
  cutPush,
  labelled,
  pushOf,
  sceneElements,
  settledAt,
  shownText,
  timeScenes,
  type MotionCamera,
  type MotionPiece,
  type MotionScript,
  type MotionTemplate,
} from "../../shared/motion.ts";
import { roomWindows } from "../../shared/sound.ts";
import { drawMotionFrame, type MotionWorld } from "./motion.ts";
import type { HitKind } from "./motionAudio.ts";
import { soundHits } from "./motionProject.ts";

export const HIT_LABEL: Record<HitKind, string> = {
  whoosh: "Barrido",
  glide: "Deslizamiento suave",
  pop: "Golpecito",
  reveal: "Golpe de revelación",
  logo: "Campana del logo",
  tap: "Toque",
  key: "Teclas",
};

export type PanelEntry = { kind: "start" | "cut" | "hard" | "through" | "match"; seconds: number; label: string };
export type PanelSound = { kind: HitKind; label: string; count: number; at: number };
export type StoryboardPanel = {
  id: string;
  number: number;
  start: number;
  end: number;
  seconds: number;
  // The moment the panel's frame is drawn (absolute seconds): everything in the scene has arrived and settled.
  frameAt: number;
  template: MotionTemplate;
  templateLabel: string;
  onScreen: { label: string; text: string }[];
  voice: string;
  // False when the piece has no voice: the line is only the subtitle.
  voiceHeard: boolean;
  // Empty when the piece has no effects.
  sounds: PanelSound[];
  // The bed makes room before the product or the logo (seconds from the scene's start), or null.
  musicDip: { from: number; to: number } | null;
  entry: PanelEntry;
  camera: { kind: MotionCamera; label: string; byAi: boolean };
  disclosure: string | null;
  // "Videos de la app funcionando": the stretch of its real screen's recording the scene plays (none: the still).
  recording?: string;
  // "Escenas metáfora": what Grok draws for the scene, and whether the picture is uploaded.
  metaphor?: string;
};

export type StoryboardOptions = {
  // The music as it is mixed: a "track" with no file loaded mixes as none (soundPlan).
  music: MotionPiece["music"];
  effects?: MotionPiece["effects"];
  voice: MotionPiece["voice"];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// The scene's settled moment, from its start: past its entrance (pushOf) and once every element has fully arrived,
// plus a breath; never past its last frame. Elements that never arrive within the scene do not wait.
function settledLocal(scene: ReturnType<typeof timeScenes>[number], push: number): number {
  const coming = Math.min(pushOf(scene, push), scene.seconds);
  const els = sceneElements(scene).filter((e) => e.lane !== "voice" && e.at < scene.seconds - 0.05);
  const settled = Math.max(coming, ...els.map((e) => settledAt(scene, e, coming)));
  const last = Math.max(0, scene.seconds - 0.05);
  return Math.min(last, Math.max(settled + 0.15, coming + 0.1));
}

// One panel per scene of the arranged script (arrangeScenes), in order.
export function storyboardPanels(script: MotionScript, opts: StoryboardOptions): StoryboardPanel[] {
  const push = cutPush(script.tone);
  const timed = timeScenes(script.scenes);
  const hits = soundHits(script);
  // The same windows the mix ducks the bed in (buildSound): half a beat of the score, or 0.3 s on a track.
  const dips = opts.music === "none" ? [] : roomWindows(hits, opts.music === "synth" ? 30 / script.music.bpm : 0.3);
  return timed.map((s) => {
    const inScene = (t: number) => t >= s.start - 1e-6 && t < s.end - 1e-6;
    const sounds: PanelSound[] = [];
    if (opts.effects !== "none") {
      for (const h of hits.filter((x) => inScene(x.at))) {
        const same = sounds.find((x) => x.kind === h.kind);
        if (same) same.count++;
        else sounds.push({ kind: h.kind, label: HIT_LABEL[h.kind], count: 1, at: r2(h.at - s.start) });
      }
    }
    // A dip belongs to the scene its hit lands in.
    const dip = dips.find((w) => inScene(w.to));
    const coming = r2(Math.min(pushOf(s, push), s.seconds));
    const entry: PanelEntry =
      s.index === 0
        ? { kind: "start", seconds: 0, label: "Arranca el video" }
        : s.carryIn
          ? { kind: "match", seconds: coming, label: `Continuidad · ${coming.toFixed(2)} s` }
          : s.entry === "through"
            ? { kind: "through", seconds: coming, label: `Pasar a través · ${coming.toFixed(2)} s` }
            : coming > 0
              ? { kind: "cut", seconds: coming, label: `Corte del tono (${MOTION_TONE_LABEL[script.tone ?? "warm"]}) · ${coming.toFixed(2)} s` }
              : { kind: "hard", seconds: 0, label: "Corte seco" };
    const onScreen = sceneElements(s)
      .filter((e) => e.lane !== "voice")
      .map((e) => ({ label: e.key === "title" || e.key === "text" || e.key === "tag" ? e.label : e.label.split(":")[0], text: shownText(s, e.key).trim() }))
      .filter((x) => x.text);
    const camera = s.camera ?? "hold";
    return {
      id: s.id,
      number: s.index + 1,
      start: r2(s.start),
      end: r2(s.end),
      seconds: r2(s.seconds),
      frameAt: r2(s.start + settledLocal(s, push)),
      template: s.template,
      templateLabel: MOTION_TEMPLATE_LABEL[s.template],
      onScreen,
      voice: s.voice.trim(),
      voiceHeard: opts.voice !== "none" && Boolean(s.voice.trim()),
      sounds,
      musicDip: dip ? { from: r2(Math.max(0, dip.from - s.start)), to: r2(dip.to - s.start) } : null,
      entry,
      camera: { kind: camera, label: MOTION_CAMERA_LABEL[camera], byAi: s.cameraBy === "ai" },
      disclosure: labelled(s) ? DISCLOSURE_TAG[s.disclosure as "concept" | "simulation"] : null,
      ...(s.recording && videoAssetOf(s) && { recording: `Video de la app ${videoAssetOf(s)!.id}, tramo ${clipText(s.recording)} s, sin sonido` }),
      ...(s.template === "metaphor" && { metaphor: metaphorLine(s) }),
    };
  });
}

const secs = (n: number) => `${n.toFixed(1)} s`;

export function soundsLine(p: StoryboardPanel): string {
  const parts = p.sounds.map((s) => (s.count > 1 ? `${s.label} ×${s.count} (desde ${secs(s.at)})` : `${s.label} (${secs(s.at)})`));
  if (p.musicDip) parts.push(`la música baja antes del golpe (${secs(p.musicDip.from)}–${secs(p.musicDip.to)})`);
  return parts.join(" · ");
}

// The panel as short lines, for the PNG sheet (the studio's panels show the same fields).
export function panelLines(p: StoryboardPanel): string[] {
  const lines = [`Entra: ${p.entry.label}`, `Cámara: ${p.camera.label}`, ...(p.recording ? [p.recording] : []), ...(p.metaphor ? [p.metaphor] : [])];
  if (p.voice) lines.push(`${p.voiceHeard ? "Se dice" : "Subtítulo (sin voz)"}: “${p.voice}”`);
  const sound = soundsLine(p);
  lines.push(`Suena: ${sound || "solo la música"}`);
  return lines;
}

export const musicLabel = (script: MotionScript, music: MotionPiece["music"]) =>
  music === "none" ? "sin música" : music === "track" ? "tu tema" : `música ${MOTION_MOOD_LABEL[script.music.mood].toLowerCase()} a ${script.music.bpm} bpm`;

export function storyboardName(title: string, format: MotionPiece["format"], ext: "md" | "png", slugOf: (t: string) => string): string {
  return `${slugOf(title) || "explicativo"}-storyboard-${format === "vertical" ? "9x16" : "16x9"}.${ext}`;
}

// The storyboard as Markdown, in the style of the piece's other exports (lib/markdown.ts). The frames live in the PNG
// sheet downloaded next to it (`sheetName`): the file links it, and each scene says which panel is its frame.
export function storyboardMarkdown(
  script: MotionScript,
  panels: StoryboardPanel[],
  meta: { format: MotionPiece["format"]; music: MotionPiece["music"]; sheetName: string },
): string {
  const total = panels.at(-1)?.end ?? 0;
  const head = `# Storyboard · ${script.problem || script.title}
${script.problem ? `\n**Gancho:** ${script.title}\n` : ""}
${meta.format === "vertical" ? "9:16" : "16:9"} · ${secs(total)} · ${panels.length} escenas · tono ${MOTION_TONE_LABEL[script.tone ?? "warm"]} · ${musicLabel(script, meta.music)}

![Hoja del storyboard](${meta.sheetName})
`;
  const scenes = panels
    .map((p) => {
      const lines = [
        `- **Cuadro:** el ${p.number} de la hoja, a los ${secs(p.frameAt)}`,
        `- **Entra:** ${p.entry.label}`,
        `- **Cámara:** ${p.camera.label}${p.camera.byAi ? " (la eligió la IA)" : ""}`,
        ...(p.recording ? [`- **Pantalla:** ${p.recording}`] : []),
        ...(p.metaphor ? [`- **Metáfora:** ${p.metaphor}`] : []),
        ...(p.onScreen.length ? [`- **En pantalla:**\n${p.onScreen.map((x) => `  - ${x.label}: “${x.text}”`).join("\n")}`] : []),
        p.voice ? `- **${p.voiceHeard ? "Se dice" : "Subtítulo (la pieza no tiene voz)"}:** “${p.voice}”` : "- **Se dice:** nada",
        `- **Suena:** ${soundsLine(p) || "solo la música"}`,
        ...(p.disclosure ? [`- **Etiqueta:** ${p.disclosure}`] : []),
      ];
      return `## Escena ${p.number} · ${secs(p.start)}–${secs(p.end)} · ${p.templateLabel}\n\n${lines.join("\n")}`;
    })
    .join("\n\n");
  const caption = script.caption?.trim() ? `\n\n## Texto para compartir\n\n${script.caption.trim()}\n` : "\n";
  return `${head}\n${scenes}${caption}`;
}

// ── The PNG sheet (canvas; the frames are drawn by the same path as the preview and the render) ──────────────────

export const PANEL_SIZE = { vertical: [216, 384], horizontal: [384, 216] } as const;

// One scene's settled frame at its panel size.
export function drawPanelFrame(ctx: CanvasRenderingContext2D, w: number, h: number, panel: StoryboardPanel, script: MotionScript, world: MotionWorld) {
  ctx.clearRect(0, 0, w, h);
  drawMotionFrame(ctx, w, h, panel.frameAt, script, world);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

// What a capture waits for before it draws frame t (a screen's recording sought to that frame); none: nothing to wait.
export type PrepareFrame = (t: number) => Promise<void>;

// Every panel on one sheet: the frame, then its number, time range, template, label and the panel's lines.
export async function storyboardSheet(
  script: MotionScript,
  world: MotionWorld,
  panels: StoryboardPanel[],
  format: MotionPiece["format"],
  prepare?: PrepareFrame,
): Promise<HTMLCanvasElement> {
  const [cw, ch] = PANEL_SIZE[format];
  const cols = format === "vertical" ? Math.min(5, Math.max(1, panels.length)) : Math.min(3, Math.max(1, panels.length));
  const gap = 20;
  const pad = 28;
  const lineH = 16;
  const headH = 64;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "13px system-ui, sans-serif";
  const textOf = (p: StoryboardPanel) => panelLines(p).flatMap((l) => wrap(measure, l, cw));
  const rows = Array.from({ length: Math.ceil(panels.length / cols) }, (_, r) => panels.slice(r * cols, r * cols + cols));
  const rowText = rows.map((row) => Math.max(...row.map((p) => textOf(p).length)) * lineH + 46);
  const canvas = document.createElement("canvas");
  canvas.width = pad * 2 + cols * cw + (cols - 1) * gap;
  canvas.height = pad + headH + rows.reduce((n, _, r) => n + ch + rowText[r] + gap, 0) + pad - gap;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#15171c";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(script.problem || script.title, pad, pad, canvas.width - pad * 2);
  ctx.fillStyle = "#5b6070";
  ctx.font = "14px system-ui, sans-serif";
  const total = panels.at(-1)?.end ?? 0;
  ctx.fillText(`${format === "vertical" ? "9:16" : "16:9"} · ${secs(total)} · ${panels.length} escenas · tono ${MOTION_TONE_LABEL[script.tone ?? "warm"]}`, pad, pad + 30);
  const frame = document.createElement("canvas");
  frame.width = cw;
  frame.height = ch;
  const fctx = frame.getContext("2d")!;
  let y = pad + headH;
  for (const [r, row] of rows.entries()) {
    for (const [c, p] of row.entries()) {
      const x = pad + c * (cw + gap);
      await prepare?.(p.frameAt);
      drawPanelFrame(fctx, cw, ch, p, script, world);
      ctx.drawImage(frame, x, y);
      ctx.strokeStyle = "#d9dbe1";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      let ty = y + ch + 8;
      ctx.fillStyle = "#15171c";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.fillText(`${p.number} · ${secs(p.start)}–${secs(p.end)}`, x, ty, cw);
      if (p.disclosure) {
        ctx.fillStyle = "#b52f12";
        ctx.textAlign = "right";
        ctx.fillText(p.disclosure, x + cw, ty, cw / 2);
        ctx.textAlign = "left";
      }
      ty += 18;
      ctx.fillStyle = "#5b6070";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(p.templateLabel, x, ty, cw);
      ty += 20;
      ctx.fillStyle = "#15171c";
      ctx.font = "13px system-ui, sans-serif";
      for (const line of textOf(p)) {
        ctx.fillText(line, x, ty, cw);
        ty += lineH;
      }
    }
    y += ch + rowText[r] + gap;
  }
  return canvas;
}

export async function storyboardPng(
  script: MotionScript,
  world: MotionWorld,
  panels: StoryboardPanel[],
  format: MotionPiece["format"],
  prepare?: PrepareFrame,
): Promise<Blob | null> {
  const canvas = await storyboardSheet(script, world, panels, format, prepare);
  return new Promise((done) => canvas.toBlob(done, "image/png"));
}
