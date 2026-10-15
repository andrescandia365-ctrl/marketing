// "Copiar el prompt para Opus": everything Opus needs in claude.ai to write one code scene (shared/codeScene.ts): a
// Spanish note for the person, then the technical brief in English (the contract and a working example, the scene's
// words and timing, the brand, the pictures, the motion vocabulary mapped to emotions, and the house rules with this
// scene's own reading times). With an AI key the same prompt goes to the writer ("Que la IA escriba la animación").
import { CODE_CONTRACT, CODE_EXAMPLE, CODE_FRAME_MS } from "./codeScene.ts";
import { mascotForScenePrompt } from "./mascot.ts";
import { READ_LETTERS_PER_SECOND, readingNeed, type MotionTone } from "./motion.ts";

// The moves the motion-design repos studied in idea 62 use, in canvas terms.
export const MOTION_VOCABULARY: { move: string; how: string }[] = [
  { move: "assemble / disassemble letters", how: "letters start scattered (seeded positions and small rotations) and travel into their place, then lock; reverse it to leave" },
  { move: "stagger", how: "each letter, word or item starts 40-90 ms after the one before, never all at once" },
  { move: "rise / fall", how: "enter from 30-80 px below with an ease-out; leave falling with an ease-in" },
  { move: "spin", how: "a quarter or half turn into place around its own centre; never while the words are being read" },
  { move: "bounce", how: "a landing that overshoots once and settles (not in the dry tone)" },
  { move: "mask reveal", how: "a clip rectangle or a wipe uncovers the text or shape; the text itself does not move" },
  { move: "text morphing into an object", how: "the letters collapse to points that redraw as a simple object made of paths (a box, a check mark, a clock, a shelf), and back" },
  { move: "counters", how: "a number counts up in its own format and settles on the exact written value (no rounding at the end)" },
  { move: "line draw", how: "strokes draw themselves (setLineDash with a moving lineDashOffset, or a partial path): underlines, arrows, outlines, ticks" },
  { move: "split screen", how: "the frame divides in two (before | after, pain | relief) with a moving divider" },
];

// How each feeling moves (picked by the scene's emotion).
export const EMOTION_MOTION: { feeling: string; words: RegExp; motion: string }[] = [
  { feeling: "surprise", words: /sorpr|asombr|wow|incre[ií]ble|surpris/i, motion: "pops: a quick scale from 0.85 to 1.06 and back to 1 (never from 0), a short accent flash, things arriving a little early" },
  { feeling: "frustration", words: /fastid|frustr|enoj|bronca|harto|cansad|molest|irrit|angry|annoy/i, motion: "shakes and crumbles: a small seeded jitter that decays, letters that sag, tilt and drop out of line, a pile that tips over" },
  { feeling: "relief", words: /alivi|tranq|calm|paz|respir|relaj|relief/i, motion: "settles and breathes: slow ease-in-out landings, then shapes (never text being read) breathe 1-2 % in size" },
  { feeling: "joy", words: /alegr|feliz|content|entusias|happy|joy|festej/i, motion: "rises and staggers upward, light bounces (not in the dry tone), the accent colour spreads" },
  { feeling: "worry", words: /preocup|nervi|ansie|urgen|apur|worr|tens/i, motion: "a tighter frame, small fast ticks of a clock or counter, items crowding in, then one thing holding still" },
];

export function emotionMotion(emotion: string): string {
  const hit = EMOTION_MOTION.find((e) => e.words.test(emotion));
  return hit ? `${hit.feeling}: ${hit.motion}` : "neutral: clear, even moves; one idea at a time";
}

const TONE_RULE: Record<MotionTone, string> = {
  dry: "dry: deadpan. Few moves, long holds, hard changes. Nothing bounces or overshoots, ever. Ease-out curves only.",
  warm: "warm: a comfortable rhythm, soft ease-in-out landings, a small overshoot at most.",
  absurdist: "absurdist: faster, livelier moves and one comic accent at a time; overshoots are fine, but text still holds still to be read.",
};

export type CodePromptInput = {
  piece: { title: string; problem: string; tone?: MotionTone; language?: string };
  scene: { index: number; count: number; seconds: number; title: string; text: string; voice: string; emotion: string; disclosure?: string };
  format: "vertical" | "horizontal";
  width: number;
  height: number;
  fps: number;
  brand: { bg: string; text: string; accent: string; displayFont: string; uiFont: string; motion?: string };
  // The pictures attached to the scene, by the name the code reads them with.
  assets: { name: string; kind: string; what: string; width: number; height: number }[];
  words: { text: string; start: number; end: number }[];
  safe: { x: number; y: number; w: number; h: number };
  floor: number;
  // The scenes around it, in a few words (so the animation connects).
  before?: string;
  after?: string;
  // The code the scene has now, to change instead of starting over.
  current?: string;
  // The person's own note for this animation.
  note?: string;
  // "Mascota en código": the series' mascot, which the scene's sandbox carries (info.mascot).
  mascot?: { name: string; description: string };
};

const r = (n: number) => Math.round(n);

// The prompt, ready to paste in claude.ai.
export function codePrompt(o: CodePromptInput): string {
  const tone = o.piece.tone ?? "warm";
  const texts = [o.scene.title, o.scene.text].map((t) => t.trim()).filter(Boolean);
  const readLines = texts.length
    ? texts.map((t) => `   - "${t}": still and fully visible for at least ${readingNeed(t).toFixed(1)} s`).join("\n")
    : "   - (no fixed words: if you add any text, each one holds still for its reading time)";
  const assets = o.assets.length
    ? o.assets.map((a) => `- info.assets["${a.name}"]: ${a.kind}, ${a.width} x ${a.height} px${a.what ? ` — ${a.what}` : ""}`).join("\n")
    : "- none (draw everything with shapes and text)";
  const words = o.words.length ? o.words.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(" ") : "(unknown: spread over the voice)";
  const vertical = o.format === "vertical";
  return [
    "Hola Opus. Estoy armando un video explicativo en mi app (Playbook Studio) y necesito el código de UNA escena animada.",
    "La app dibuja cada cuadro llamando a una función draw(ctx, t, info) en un canvas 2D. Seguí el contrato de abajo al pie de la letra.",
    "Respondé con un solo bloque de código JavaScript (```js … ```) que defina draw. Antes del bloque, una línea en castellano con la idea de la animación; nada más.",
    "",
    "--- TECHNICAL BRIEF (English) ---",
    "",
    CODE_CONTRACT,
    "",
    "A TINY WORKING EXAMPLE (the shape to follow, not the look):",
    "```js",
    CODE_EXAMPLE,
    "```",
    "",
    "THE SCENE",
    `- Video: "${o.piece.title}". The problem it solves: ${o.piece.problem || "(not written)"}.`,
    `- This is scene ${o.scene.index + 1} of ${o.scene.count}. It lasts ${o.scene.seconds.toFixed(2)} s (info.duration).`,
    `- Format: ${o.format} ${vertical ? "9:16" : "16:9"}, ${o.width} x ${o.height} px, ${o.fps} fps.`,
    `- Title on screen: ${o.scene.title.trim() ? `"${o.scene.title.trim()}"` : "(none)"}`,
    `- Supporting text: ${o.scene.text.trim() ? `"${o.scene.text.trim()}"` : "(none)"}`,
    `- Narrator says (the app shows it as the subtitle; do not draw it): ${o.scene.voice.trim() ? `"${o.scene.voice.trim()}"` : "(nothing)"}`,
    `- Word times (seconds in the scene): ${words}`,
    `- Emotion: ${o.scene.emotion.trim() || "(none)"} → ${emotionMotion(o.scene.emotion)}`,
    `- Tone: ${TONE_RULE[tone]}`,
    ...(o.scene.disclosure === "concept" || o.scene.disclosure === "simulation"
      ? [`- This scene is a ${o.scene.disclosure === "concept" ? "CONCEPT" : "SIMULATION"}: the app labels it at the top right; keep that corner clear.`]
      : []),
    ...(o.before ? [`- The scene before: ${o.before}`] : []),
    ...(o.after ? [`- The scene after: ${o.after}`] : []),
    ...(o.note?.trim() ? [`- What I want: ${o.note.trim()}`] : []),
    "",
    "BRAND (the only colours and fonts)",
    `- background ${o.brand.bg}, text ${o.brand.text}, accent ${o.brand.accent} (one accent: use it for one thing at a time)`,
    `- display font "${o.brand.displayFont}", UI font "${o.brand.uiFont}"`,
    ...(o.brand.motion ? [`- how the brand moves: ${o.brand.motion}`] : []),
    "",
    ...(o.mascot ? [...mascotForScenePrompt(o.mascot), ""] : []),
    "PICTURES ATTACHED TO THIS SCENE (real screens and products: draw them as they are, never redraw or invent their content)",
    assets,
    "",
    "MOTION VOCABULARY (pick 2-3 that fit the emotion; do not use them all)",
    ...MOTION_VOCABULARY.map((m) => `- ${m.move}: ${m.how}`),
    "",
    "HOUSE RULES",
    `1. Text holds still while it is read: once a line is fully in, it stays still and fully visible for its reading time (0.3 s per word, a sentence at least 1.2 s, a 1-3 word label 0.8 s, and never less than its letters at ${READ_LETTERS_PER_SECOND} letters a second). Fast in, then hold. In this scene:`,
    readLines,
    `2. Safe zone: all text inside x ${r(o.safe.x)}-${r(o.safe.x + o.safe.w)}, y ${r(o.safe.y)}-${r(o.floor)} px (info.safe and info.floor).${vertical ? " On 9:16 the phone apps cover the top bar, the caption at the bottom and the buttons on the right." : ""} Pictures may run under the edges; words may not.`,
    "3. Banned looks: a centred title on a gradient, glow, particles or confetti, frame borders, corner labels, everything fading in at once, an end logo.",
    "4. Nothing grows from scale 0: start entrances at 0.6 or more, or slide, mask or assemble them in.",
    `5. ${tone === "dry" ? "The tone is dry: nothing bounces or overshoots." : "Overshoot at most once per landing; text never wobbles while it is read."}`,
    "6. Colours only from the brand (lighter or darker steps of them are fine). No real people, no faces of real people, no logos but the brand's own; no other brand's names.",
    "7. Show what the product really does today; no invented numbers, prices, reviews or results. If you must put a number that is not given here, write it with [VERIFY] (the app will block it until checked).",
    `8. Something new on screen every 2 to 4 seconds. Keep each frame under ${CODE_FRAME_MS} ms.`,
    "9. Every frame should be worth pausing on: no filler, no generic motion that could belong to any video.",
    ...(o.current?.trim() ? ["", "THE CURRENT CODE (change it; keep what works):", "```js", o.current.trim(), "```"] : []),
    "",
    "Reply with the one ```js block that defines draw(ctx, t, info).",
  ].join("\n");
}
