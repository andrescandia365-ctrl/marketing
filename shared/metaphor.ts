// "Escenas metáfora" (explainer template "metaphor", IDEAS idea 63): one simple picture that explains an idea (the
// order as a pile of boxes about to fall), with a short line. The picture is made with Grok: the scene carries the
// moment to draw (and, optionally, how to animate it), written by the writer or by Opus in claude.ai; the app builds
// the full prompts in the tool profile's order (server/tools/grok-imagine.md), with the series look and the cast's
// @refs, and never asks for text in the picture (the line is set by the app, in the brand's type). The person uploads
// what Grok made into the scene (a still, a short clip, or both), kept as project media in slot METAPHOR_BASE + N
// (metafora-NN-imagen / metafora-NN-clip), and the scene's asset says which: "metafora:N". Until then the scene shows
// a placeholder with the prompt and a render stops (metaphorIssues). Everything here is pure.
import type { SeriesLook } from "./series.ts";
import { PLAIN_PHOTO, lookPhrase } from "./prompt.ts";
import { withElementPrompt, type HookElement } from "./hookElements.ts";

// What a metaphor scene carries: the moment to draw (English, one frozen moment, no words in it), how the still moves
// when animated (English, one action and one camera move; empty: no clip), and the cast ids that appear in it (each
// called by its @ref in Grok).
export type SceneMetaphor = { image: string; video: string; cast: string[] };
export const emptyMetaphor = (): SceneMetaphor => ({ image: "", video: "", cast: [] });

// The project media slots of the uploaded pictures: 600 + N (the shots are 0-99, voices 100+, layers 200+, sheets and
// posters 300-303, story sketches 400+, the still 500).
export const METAPHOR_BASE = 600;
export const METAPHOR_MAX = 99;
export const METAPHOR_PREFIX = "metafora:";
export const metaphorAsset = (n: number) => `${METAPHOR_PREFIX}${n}`;
export const isMetaphorAsset = (id: string | undefined): boolean => Boolean(id && /^metafora:\d{1,2}$/.test(id));
// The slot number of a "metafora:N" asset, or null.
export function metaphorSlot(id: string | undefined): number | null {
  if (!isMetaphorAsset(id)) return null;
  const n = Number(id!.slice(METAPHOR_PREFIX.length));
  return n >= 0 && n <= METAPHOR_MAX ? n : null;
}
// The next free slot: past every one the scenes use (a removed scene's file is overwritten only once nothing uses it).
export function nextMetaphorSlot(scenes: { asset: string }[]): number {
  const used = scenes.map((s) => metaphorSlot(s.asset)).filter((n): n is number => n !== null);
  return Math.min(METAPHOR_MAX, used.length ? Math.max(...used) + 1 : 0);
}

// Where an upload for a scene goes: its own slot, or the next free one. A fresh slot may still hold the picture and
// clip of a scene that was deleted (deleting a scene keeps its media, so undo can bring it back): the part not being
// uploaded is cleared too, or the render would play the old scene's clip under the new still.
export function metaphorUploadSlot(sceneAsset: string, scenes: { asset: string }[], kind: "image" | "clip"): { n: number; clear: ("image" | "clip")[] } {
  const own = metaphorSlot(sceneAsset);
  if (own !== null) return { n: own, clear: [] };
  return { n: nextMetaphorSlot(scenes), clear: [kind === "image" ? "clip" : "image"] };
}

// The project file of an uploaded picture or clip: metafora-01-imagen.png, metafora-01-clip.mp4 (slot 600 → 01).
export const isMetaphorSlot = (index: number) => Number.isInteger(index) && index >= METAPHOR_BASE && index <= METAPHOR_BASE + METAPHOR_MAX;
export const metaphorFileBase = (index: number, kind: "image" | "clip") => `metafora-${String(index - METAPHOR_BASE + 1).padStart(2, "0")}-${kind === "image" ? "imagen" : "clip"}`;

// Two metaphors say the same (trimmed moment and animation, the same cast in order).
export function sameMetaphor(a: SceneMetaphor | undefined, b: SceneMetaphor | undefined): boolean {
  const x = a ?? emptyMetaphor();
  const y = b ?? emptyMetaphor();
  return x.image.trim() === y.image.trim() && x.video.trim() === y.video.trim() && x.cast.join(",") === y.cast.join(",");
}

// The writer's fields, tolerant: trimmed, the cast ids split on commas or spaces (only ids the cast has, when known).
export function pickMetaphor(image: string | undefined, video: string | undefined, cast: string | string[] | undefined, known?: readonly string[]): SceneMetaphor {
  const list = (Array.isArray(cast) ? cast : (cast ?? "").split(/[,\s]+/))
    .map((c) => c.trim().replace(/^@/, ""))
    .filter((c) => c && (!known || known.includes(c)));
  return { image: (image ?? "").trim().slice(0, 1500), video: (video ?? "").trim().slice(0, 800), cast: [...new Set(list)].slice(0, 4) };
}

// The words that make Grok's pictures look fake (the profile: ask for flaws, never polish), dropped from the moment.
const POLISH = /\b(cinematic|film still|vintage|hyper-?realistic|8k|4k|award[- ]winning|masterpiece)\b/gi;
const clean = (s: string) =>
  s
    .replace(POLISH, "")
    .replace(/\s+,/g, ",")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,;\s]+$/, "");

// A cast member as the prompt calls it.
export type MetaphorCast = { id: string; ref: string; identity: string; kind?: string };

// The cast a metaphor's picture may call by @ref: characters, places and products with an approved image (a reference
// Grok can hold). Never a real screen: a screen is never drawn by an AI.
export function metaphorCastOf(cast: readonly { id: string; ref: string; identity: string; kind: string; image?: string }[]): MetaphorCast[] {
  return cast.filter((m) => m.kind !== "screen" && m.image).map((m) => ({ id: m.id, ref: m.ref, identity: m.identity, kind: m.kind }));
}

// The picture is square: one picture serves both formats of the explainer (9:16 above the line, 16:9 beside it), and
// the line is never inside it.
export const METAPHOR_SHAPE = "Square 1:1 frame";
export const NO_TEXT = "Bare surfaces, blank labels and boxes, no signage: no text, letters, numbers or logos anywhere in the picture";

// The full Grok image prompt (the profile's order: subject and moment first, then the cast's one-line identities, the
// look, the frame): the series look or the plain photo line, never "cinematic", no words in the picture, a simple
// picture with one idea and room around it. Empty when the scene has no moment written yet.
export function metaphorImagePrompt(m: SceneMetaphor, opts: { look?: SeriesLook; cast?: readonly MetaphorCast[]; elements?: readonly HookElement[] } = {}): string {
  const moment = clean(m.image);
  if (!moment) return "";
  const members = m.cast.map((id) => opts.cast?.find((c) => c.id === id)).filter((c): c is MetaphorCast => Boolean(c));
  const who = members.map((c) => `@${c.ref}${c.identity.trim() ? ` (${clean(c.identity)})` : ""}`).join("; ");
  const look = lookPhrase(opts.look);
  const parts = [
    moment,
    who && `Featuring ${who}, kept exactly as in the reference`,
    "One simple idea, readable at a glance on a phone: one subject, a plain uncluttered background, generous empty space around it",
    look ? `Look: ${look}` : PLAIN_PHOTO,
    NO_TEXT,
    "No real public figures",
    `${METAPHOR_SHAPE}`,
  ];
  return withElementPrompt(`${parts.filter(Boolean).join(". ")}.`, opts.elements, "image");
}

// The Grok video prompt that animates the still (image-to-video: the still is the first frame, so nobody is described
// again): the action, a slow camera, what holds still, and a sound line. The clip plays muted in the explainer (the
// piece has its own voice and music), so it asks for no speech and no music. Empty: no clip asked for.
export function metaphorVideoPrompt(m: SceneMetaphor, elements?: readonly HookElement[]): string {
  const action = clean(m.video);
  if (!action) return "";
  const camera = /push|zoom|pan|track|locked|static|dolly|camera/i.test(action) ? "" : "Locked-off camera, or one slow push-in.";
  const base = [`${action}.`, camera, "Everything else holds still; the square frame stays as it is. No text appears.", "Audio: none needed (the clip plays muted), no music, no speech."]
    .filter(Boolean)
    .join(" ");
  return withElementPrompt(base, elements, "video");
}

// The Grok settings the prompt cannot set (the profile: shape and length are controls).
export const METAPHOR_SETTINGS = "En Grok: imagen 1:1 (cuadrada). Para el clip: Crear video desde esa imagen, 6 s, sonido apagado.";

// "Copiar todos los prompts de metáforas": every metaphor scene's prompts in order, ready to paste into Grok one by one.
export type MetaphorBatchScene = { index: number; title: string; metaphor?: SceneMetaphor; asset: string; hookElements?: readonly HookElement[] };
export function metaphorBatch(scenes: readonly MetaphorBatchScene[], opts: { look?: SeriesLook; cast?: readonly MetaphorCast[] } = {}): string {
  const blocks = scenes.map((s) => {
    const m = s.metaphor ?? emptyMetaphor();
    const image = metaphorImagePrompt(m, { ...opts, elements: s.hookElements });
    const video = metaphorVideoPrompt(m, s.hookElements);
    const head = `## Escena ${s.index + 1}${s.title.trim() ? ` — «${s.title.trim()}»` : ""}${isMetaphorAsset(s.asset) ? " (ya tiene imagen)" : ""}`;
    return [head, `Imagen (Grok):\n${image || "(falta escribir qué se ve)"}`, ...(video ? [`Video (Grok, opcional):\n${video}`] : [])].join("\n\n");
  });
  if (!blocks.length) return "";
  return [`# Prompts de metáforas para Grok\n\n${METAPHOR_SETTINGS} Subí cada resultado a su escena.`, ...blocks].join("\n\n");
}

// "Copiar pedido para Opus": with no key, Opus (in claude.ai) writes the moment and the animation of one metaphor
// scene; the reply is pasted back and read by parseMetaphorReply.
export function metaphorOpusPrompt(scene: { title: string; text: string; voice: string; metaphor?: SceneMetaphor }, ctx: { series: string; problem: string; cast: readonly MetaphorCast[]; look?: SeriesLook }): string {
  const m = scene.metaphor ?? emptyMetaphor();
  const cast = ctx.cast.length ? ctx.cast.map((c) => `- ${c.id} (@${c.ref}${c.kind ? `, ${c.kind}` : ""}): ${c.identity}`).join("\n") : "- (sin elenco)";
  return `Necesito una imagen metáfora para una escena de un video explicativo de la serie «${ctx.series}». La imagen la hago con Grok Imagine y la app pone el texto encima, así que la imagen no lleva ninguna palabra.

The video's problem: ${ctx.problem || "(sin escribir)"}
This scene's line on screen: "${scene.title}"${scene.text.trim() ? ` / "${scene.text}"` : ""}
What the voice says: "${scene.voice}"
${m.image.trim() ? `The current idea for the picture: ${m.image}\n` : ""}
The series' cast (use one only if it helps the idea; refer to it by its id in CAST):
${cast}
${lookPhrase(ctx.look) ? `The series look (the app adds it to the prompt): ${lookPhrase(ctx.look)}\n` : ""}
Write ONE simple picture that explains the idea as a metaphor a phone viewer gets in one second (e.g. the order as a pile of boxes about to fall). One frozen moment, one subject, plain background, concrete objects, square frame, no text, letters, numbers or logos in it, no real people or known characters, no brand that is not this one. Then one short animation for it (one action, one slow camera move or a locked camera).

Answer only these three lines, in English after the colon:
IMAGEN: <the moment, 30 to 70 words: subject, action, place, light, framing>
VIDEO: <25 to 50 words: what moves, the camera; or empty>
CAST: <cast ids that appear, comma separated, or empty>`;
}

// The pasted reply: the IMAGEN / VIDEO / CAST lines (Spanish or English names, any case, with or without markdown).
export function parseMetaphorReply(reply: string, known?: readonly string[]): { metaphor: SceneMetaphor } | { error: string } {
  const text = reply.replace(/```[a-z]*\n?/gi, "").replace(/\*\*/g, "");
  const field = (names: string) => {
    // Spaces only (never a line break) around the name and the colon: an empty field stays empty.
    const re = new RegExp(`^[ \\t]*(?:[-#>][ \\t]*)*(?:${names})[ \\t]*:[ \\t]*(.*)$`, "im");
    const m = re.exec(text);
    if (!m) return undefined;
    // A value may run over several lines, until the next field.
    const rest = text.slice(m.index + m[0].length).split(/\n/);
    const more: string[] = [];
    for (const line of rest.slice(1)) {
      if (/^\s*(?:[-#>]\s*)*(imagen|image|video|clip|cast|elenco)\s*:/i.test(line)) break;
      more.push(line.trim());
    }
    return [m[1].trim(), ...more].filter(Boolean).join(" ");
  };
  const image = field("imagen|image");
  if (!image) return { error: "No encontré la línea «IMAGEN:». Pegá la respuesta completa de Opus." };
  return { metaphor: pickMetaphor(image, field("video|clip") ?? "", field("cast|elenco") ?? "", known) };
}

// ── Layout (the engine draws from it; pure, so the tests check it) ─────────────────
export type MetaphorBox = { x: number; y: number; w: number; h: number };
export type MetaphorLayout = { pic: MetaphorBox; titleX: number; titleY: number; titleMax: number; titleSize: number; textSize: number };

// Where the picture and the line go in a w×h frame: `top` is the highest the picture may start (below the platforms'
// top bar or the CONCEPTO label), `floor` the lowest the words may end (above the subtitle). 9:16 (and any frame taller
// than wide): the square picture on top, as wide as fits, the line under it. 16:9: the picture on the left, the line
// beside it. The picture never runs above `top`, and on a tall frame the words end above `floor` as they really wrap:
// `lines` says how many lines the title and the text take at a size and width (the engine measures them; without it,
// two of each). The block under the picture is what drawScene draws: the gap, the title's first baseline, its lines,
// the text's first baseline under them, its lines and their descent. When even the smallest picture leaves too little
// room, the type shrinks (to 60 % at most). The picture box is square; the uploaded picture fits inside it whole.
export function metaphorLayout(
  w: number,
  h: number,
  opts: { top: number; floor: number; hasText: boolean; lines?: (kind: "title" | "text", size: number, max: number) => number },
): MetaphorLayout {
  const unit = Math.min(w, h);
  const m = unit * 0.08;
  const vertical = h > w;
  const titleSize = unit * (vertical ? 0.085 : 0.075);
  const textSize = unit * 0.042;
  if (vertical) {
    const top = Math.max(opts.top, m * 0.5);
    const titleMax = w - m * 2;
    const words = (ts: number, xs: number) => {
      const tl = Math.max(1, opts.lines?.("title", ts, titleMax) ?? 2);
      const xl = opts.hasText ? Math.max(1, opts.lines?.("text", xs, titleMax) ?? 2) : 0;
      const block = unit * 0.05 + ts * 0.95;
      return xl ? block + tl * 1.02 * ts + unit * 0.01 + (xl - 1) * 1.3 * xs + 0.3 * xs : block + (tl - 1) * 1.02 * ts + 0.3 * ts;
    };
    let scale = 1;
    while (scale > 0.6 + 1e-9 && opts.floor - top - words(titleSize * scale, textSize * scale) < unit * 0.2) scale -= 0.05;
    const ts = titleSize * scale;
    const xs = textSize * scale;
    const side = Math.max(unit * 0.2, Math.min(w - m * 2, opts.floor - top - words(ts, xs)));
    const pic = { x: (w - side) / 2, y: top, w: side, h: side };
    return { pic, titleX: m, titleY: pic.y + side + unit * 0.05 + ts * 0.95, titleMax, titleSize: ts, textSize: xs };
  }
  const top = Math.max(opts.top, m);
  const side = Math.max(unit * 0.2, Math.min(w * 0.45, Math.min(h, opts.floor) - top - m));
  // Far enough from the edge that a camera push (up to 14 %) keeps the whole picture in the frame.
  const pic = { x: Math.max(m, w * 0.07), y: top + (Math.min(h, opts.floor) - top - m - side) / 2, w: side, h: side };
  const titleX = pic.x + side + m;
  return { pic, titleX, titleY: h * 0.44, titleMax: Math.max(unit * 0.3, w - titleX - m), titleSize, textSize };
}

// The picture's subtle settle (a pure function of scene time lt): the card comes in from 92 % (never from nothing) on
// the brand's landing over METAPHOR_ENTER seconds, and then sinks slowly from 103 % to its size by the end of the
// scene, a settle that never stops early or jumps. The whole picture always shows (never cropped or zoomed inside its
// frame: Grok's watermark stays whole). `land` is the landing curve (landFor).
export const METAPHOR_ENTER = 0.7;
export const METAPHOR_SETTLE = 1.03;
export function metaphorSettle(lt: number, at: number, seconds: number, land: (x: number) => number = (x) => x): { scale: number; alpha: number } {
  const c = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  const p = land(c((lt - at) / METAPHOR_ENTER));
  const u = c((lt - at) / Math.max(0.5, seconds - at));
  const ease = (1 - Math.cos(Math.PI * u)) / 2;
  return { scale: (0.92 + 0.08 * p) * (METAPHOR_SETTLE - (METAPHOR_SETTLE - 1) * ease), alpha: c((lt - at) / (METAPHOR_ENTER * 0.5)) };
}

// What the placeholder says (and how much of the prompt it shows) while the scene has no picture.
export const METAPHOR_MISSING = "Falta la imagen de Grok";
export function placeholderLines(m: SceneMetaphor | undefined, max = 140): string[] {
  const moment = (m?.image ?? "").trim();
  const shown = moment.length > max ? `${moment.slice(0, max - 1).trimEnd()}…` : moment;
  return [METAPHOR_MISSING, shown ? `Prompt: ${shown}` : "Escribí qué se ve en la escena", "Copiá el prompt para Grok y subí la imagen a la escena"];
}

// One line for the storyboard and pieza.md: what Grok draws, and whether the picture is in the scene yet.
export function metaphorLine(scene: { asset: string; metaphor?: SceneMetaphor }): string {
  const moment = (scene.metaphor?.image ?? "").trim();
  const cast = scene.metaphor?.cast.length ? ` (aparece: ${scene.metaphor.cast.join(", ")})` : "";
  return `${moment ? `imagen de Grok: “${moment}”${cast}` : "falta escribir qué se ve"} · ${isMetaphorAsset(scene.asset) ? "imagen subida" : "falta subir la imagen"}`;
}

// A render stops while a metaphor scene has no uploaded picture (never a placeholder in a finished video). `has`: the
// pictures loaded, by asset id.
export type MetaphorIssue = { sceneId: string; index: number; problem: string };
export function metaphorIssues(scenes: readonly { id: string; template: string; asset: string; metaphor?: SceneMetaphor }[], has: (asset: string) => boolean): MetaphorIssue[] {
  return scenes.flatMap((s, index) => {
    if (s.template !== "metaphor") return [];
    if (isMetaphorAsset(s.asset) && has(s.asset)) return [];
    const problem = isMetaphorAsset(s.asset)
      ? "La imagen de la metáfora no se pudo cargar: subila de nuevo."
      : (s.metaphor?.image ?? "").trim()
        ? "Falta subir la imagen de Grok (copiá el prompt y subí lo que hizo)."
        : "Falta escribir qué se ve y subir la imagen de Grok.";
    return [{ sceneId: s.id, index, problem }];
  });
}
