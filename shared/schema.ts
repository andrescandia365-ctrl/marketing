// Shapes shared by the server (Claude output validation) and the browser (types only).
// Flow: Brief → Menu (topics) → Story (Good vs Bad, in rounds) → Board (shots) → production.
import { z } from "zod";
import type { LyricStyle } from "./lyrics.ts";
import type { Brand, CastMember, SeriesLook, SeriesType, TextStyle } from "./series.ts";
import type { WebCastPick } from "./webCast.ts";
import type { KeepOut } from "./stillLayout.ts";
import type { MascotMeta } from "./mascot.ts";
import { MOVES_FOR_WRITER, pickMove, pickMoves, type Move } from "./moves.ts";

export const BEATS = ["negative", "touching", "good"] as const;
export type Beat = (typeof BEATS)[number];

export const ROLES = ["good", "bad", "human", "narrator"] as const;
export type Role = (typeof ROLES)[number];

export const BriefSchema = z.object({
  series: z.string(),
  length: z.enum(["short", "episode"]),
  // Máshogar: this episode's product. IMAN: an optional focus (a loop step or feature).
  product: z.string(),
  // A moment the audience already feels: a date, a season, something everyone is talking about.
  angle: z.string(),
  notes: z.string(),
  tone: z.enum(["dry", "warm", "absurdist"]),
  language: z.enum(["en", "es"]),
  format: z.enum(["vertical", "horizontal"]),
  tool: z.string(),
  // Software series: which of the series' real screens this piece may show.
  screens: z.array(z.string()).default([]),
  // lines: one line per shot (6/10/15 s). continuous: 15 s handheld takes, each a scene with timed beats.
  takes: z.enum(["lines", "continuous"]).default("lines"),
  // story: Good vs Bad with a storyboard. explainer: a motion-graphics video that explains (software or one product).
  // still: "Imagen fija", one picture where the pain and the relief meet, with the words set on top by the app.
  piece: z.enum(["story", "explainer", "still"]).default("story"),
  // with: a narrator may speak (a story character with the narrator role, the explainer's voice lines). without: the
  // characters' own words, the action and the text on screen carry the piece.
  narrator: z.enum(["with", "without"]).default("with"),
  // How a story is staged (PLAYBOOK §2.5, shared/segment.ts). desk: the story in its own scenes (as before).
  // correspondent: a cut to the series' correspondent "on location" (Remote Stand-up). field: a Field Visit.
  segment: z.enum(["desk", "correspondent", "field"]).default("desk"),
});
export type Brief = z.infer<typeof BriefSchema>;

// ── Step 1: the menu ────────────────────────────────────────────────────────────
// Every piece is named by the problem it solves; the hook title comes second.
const PROBLEM = z
  .string()
  .describe(
    "The problem this piece solves, named plainly in Spanish in 3–8 words, clear with no context (e.g. 'Armar el pedido antes del corte del proveedor'). When the series has a loop, name the step it fixes.",
  );
const HOOK_TITLE = z
  .string()
  .describe(
    "The hook title: states the tension, not the answer, and makes sense with no context. In Spanish. Never copy the playbook's example lines or numbers.",
  );

export const TopicIdeaSchema = z.object({
  problem: PROBLEM,
  title: HOOK_TITLE,
  pain: z.string().describe("The concrete pain, with the object, the number or the hour."),
  bad: z.string().describe("How the Bad shows up and what it says in this topic."),
  good: z.string().describe("How the Good fixes it on screen (only real features)."),
  peg: z.string().describe("The concrete opening artifact or bridge: a date, a number, a time, a live report."),
  why: z.string().describe("One sentence on why this lands with the audience now."),
});
export type TopicIdea = z.infer<typeof TopicIdeaSchema>;

export const MenuSchema = z.object({
  ideas: z.array(TopicIdeaSchema).describe("Six topic ideas, each a different pain."),
  questions: z.array(z.string()).describe("Gaps the person should fill. Empty if none."),
});
export type Menu = z.infer<typeof MenuSchema>;

// ── Step 2: the story ───────────────────────────────────────────────────────────
const CharacterWire = z.object({
  id: z.string().describe("Short id, e.g. 'bad', 'good', 'marta'."),
  name: z.string().describe("Name as shown on screen, in Spanish."),
  role: z.string().describe("One of: good, bad, human, narrator."),
  voice: z.string().describe("How they talk, one line, in Spanish."),
  identity: z
    .string()
    .describe("Visual identity line in English, repeated word for word in every image prompt with them."),
});
export type Character = Omit<z.infer<typeof CharacterWire>, "role"> & { role: Role };

const LineWire = z.object({
  beat: z.string().describe("One of: negative, touching, good."),
  speaker: z.string().describe("A character id."),
  text: z.string().describe("The spoken line, in the piece's language."),
  emotion: z.string().describe("How it is said, one to three words in Spanish (e.g. divertida, con fastidio, en voz baja)."),
  direction: z.string().describe("What is on screen while it is said, in Spanish."),
});
export type Line = Omit<z.infer<typeof LineWire>, "beat"> & { beat: Beat };

const TopicWire = z.object({
  id: z.string().describe("T1, T2…"),
  title: z.string(),
  bridge: z.string().describe("The concrete bridge into this topic (for the first topic: the opening artifact)."),
  lines: z.array(LineWire),
  moves: z
    .array(z.string())
    .describe(`The playbook moves this topic really uses on screen, by id, from: ${MOVES_FOR_WRITER}. Only what a line or a direction shows; may be empty.`),
});
export type Topic = Omit<z.infer<typeof TopicWire>, "lines" | "moves"> & { lines: Line[]; moves: Move[] };

const ChecklistItemSchema = z.object({ item: z.string(), pass: z.boolean(), note: z.string() });
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const StoryWireSchema = z.object({
  problem: PROBLEM,
  title: HOOK_TITLE,
  logline: z.string(),
  characters: z.array(CharacterWire),
  topics: z.array(TopicWire),
  callbacks: z
    .array(z.object({ planted: z.string(), payoff: z.string() }))
    .describe("Each callback: the line planted and where and how it pays off."),
  close: z.string().describe("The last line of the piece; it calls back to the first. A soft close, not a pitch."),
  runner: z
    .object({
      bit: z
        .string()
        .describe("One concrete bit — an object, a short phrase or a gesture — that this piece hits three times. Spanish. Empty if the piece has no runner."),
      open: z
        .string()
        .describe("The opening landing. Quote a few spoken words inside «». Spanish. Empty if there is no runner."),
      middle: z
        .string()
        .describe("The middle landing. The bit has changed. Quote different spoken words inside «». Spanish."),
      tag: z
        .string()
        .describe("The tag landing, tied to the close. The bit has changed again. Quote different spoken words inside «». Spanish."),
    })
    .describe("The runner: one bit, three landings, each one changed."),
  tease: z
    .string()
    .describe(
      "One concrete thing left hanging for a later episode. Not an open loop of this piece: do not list it in loops and do not pay it off here. Empty if the piece closes clean. Spanish.",
    ),
  canon: z
    .array(
      z.object({
        fact: z
          .string()
          .describe("A fact this episode makes true for later ones: an object that now exists, a relationship that changed, or a rule of the place. Not a product claim. Spanish."),
      }),
    )
    .describe("Up to three facts later episodes treat as already true. Empty if the world did not change."),
  checklist: z
    .array(ChecklistItemSchema)
    .describe(
      "A strict critic's checklist, items named in Spanish: Gancho (the first 3 seconds stop the scroll), Retención (open questions keep people watching, the escalation grows), Recompensa (every open loop pays off), Bueno contra Malo, Momento emotivo, Detalle concreto, Puentes, Callbacks, Continuidad (each line follows the one before), Lo que existe hoy (the brand only does what its list says), El chiste es el problema, Cliente héroe (the customer or the person on screen is the hero; the brand guides and never opens the piece), Un solo llamado (at most one soft call to action, at the end), Nada prestado (no show, host, real person, character, catchphrase or another brand's ad borrowed). A pass you cannot point to in the text is a fail.",
    ),
  loops: z
    .array(
      z.object({
        question: z.string().describe("The open loop: the question or tension that keeps people watching. Spanish."),
        opens: z.string().describe("Where it opens: topic and a few quoted words."),
        closes: z.string().describe("Where it pays off: topic and a few quoted words. Empty if it never does."),
        closed: z.boolean(),
      }),
    )
    .describe("Every open loop: the hook's question, each tension, each planted callback. One that never pays off is closed=false."),
  seriesLoop: z
    .array(
      z.object({
        step: z.string().describe("A step of the series loop, as the series bible names it."),
        appears: z.boolean().describe("The piece mentions or shows this step."),
        complete: z.boolean().describe("If it appears: the piece shows the pain, the step doing its job and the result."),
        note: z.string().describe("Where and how, or why it is left out. Spanish."),
      }),
    )
    .describe("Each step of the series loop from the bible. Empty if the bible has no loop."),
  claims: z
    .array(
      z.object({
        claim: z.string().describe("Something the brand or product is shown doing. Spanish."),
        real: z.boolean().describe("true only if it is in the series' list of what exists today."),
        concept: z.boolean().describe("true if the story clearly presents it as a concept or the future."),
        note: z.string(),
      }),
    )
    .describe("Everything the brand or product does in the story, each checked against the list of what exists today."),
  practices: z
    .array(
      z.object({
        practice: z.string().describe("A habit, routine, schedule or tool people use in the story to run the business or the home. Spanish."),
        known: z.boolean().describe("true only if the series' list of how people work today or the brief's notes say people do it this way."),
        note: z.string(),
      }),
    )
    .describe("Every way of working the story shows (how people order, count, check, pay, close…), each checked against how people work today."),
  verify: z.array(z.string()).describe("Every claim marked [VERIFY]. Empty if none."),
});
export type Story = Omit<z.infer<typeof StoryWireSchema>, "characters" | "topics"> & {
  characters: Character[];
  topics: Topic[];
};

// ── Five hook variants for a story (PLAYBOOK §3: 5 hook variants per script, each naming its move) ──────────
export const HookVariantsWireSchema = z.object({
  variants: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "The hook: what stops the scroll in the first 2 seconds, for the same problem and story. Up to 12 words, concrete (the object, the number, the hour), makes sense with no context. Spanish (Rioplatense). Never the playbook's example lines.",
          ),
        move: z.string().describe(`The one move it leans on, by id, from: ${MOVES_FOR_WRITER}.`),
        level: z
          .number()
          .describe(
            "The viewer's awareness it speaks to, 1 to 5: 1 does not know they have the problem; 2 knows the problem, not the way out; 3 knows ways out exist, not this brand's; 4 knows this brand and doubts; 5 is ready and needs a push.",
          ),
        why: z.string().describe("One line in Spanish: why it stops the scroll."),
      }),
    )
    .describe("Exactly five variants, each on a different move."),
});
export type HookVariant = { title: string; move: Move; level: 1 | 2 | 3 | 4 | 5; why: string };

export function normalizeHookVariants(wire: z.infer<typeof HookVariantsWireSchema>): HookVariant[] {
  const level = (n: number) => (Number.isFinite(n) ? (Math.min(5, Math.max(1, Math.round(n))) as HookVariant["level"]) : 2);
  return wire.variants
    .filter((v) => v.title.trim())
    .slice(0, 5)
    .map((v) => ({ title: v.title.trim().slice(0, 200), move: pickMove(v.move) ?? "curiosityGap", level: level(v.level), why: v.why.trim().slice(0, 300) }));
}

// ── Review of an uploaded image or clip frame ───────────────────────────────────
export const ImageReviewSchema = z.object({
  checks: z
    .array(z.object({ item: z.string(), pass: z.boolean(), note: z.string() }))
    .describe(
      "Each check, named in Spanish: Momento de la toma (it shows the shot's moment), Personajes y lugares (they look like their setup lines and reference images), Sin texto ni logos, Sin personas reales (no real person's likeness), Pantallas (screens face away or are out of focus; skip if none), Estilo. A pass you cannot see in the picture is a fail. Notes in Spanish.",
    ),
  fixPrompt: z
    .string()
    .describe("If anything failed: an edit prompt in English for the tool that fixes only that and keeps everything else. Empty if all pass."),
});
export type ImageReview = z.infer<typeof ImageReviewSchema>;

// ── A reference sheet for the series' cast: a character (girl or boy template), a 3D-look puppet character (a
// person, a mascot or a talking object, for motion graphics) or a place ──
export const SHEET_TEMPLATES = ["girl", "boy", "puppet", "place"] as const;
export type SheetTemplate = (typeof SHEET_TEMPLATES)[number];
export const SheetSchema = z.object({
  name: z.string().describe("The name as the cast will call it, in Spanish."),
  identity: z
    .string()
    .describe("The identity line in English, repeated word for word in every prompt: for a person, age, skin, eyes, hair, build, wardrobe and jewellery; for a place, what it is and its fixed details."),
  sheetPrompt: z.string().describe("The whole reference sheet as one image prompt in English, in the tool's format."),
  views: z
    .array(z.object({ title: z.string().describe("In Spanish."), prompt: z.string().describe("English.") }))
    .describe("The same sheet split into separate prompts, one per view or panel, for when the tool does not hold the grid."),
  filled: z
    .array(z.object({ field: z.string(), value: z.string() }))
    .describe("Each detail the person left empty and you chose, in Spanish (field name as given)."),
  note: z.string().describe("In Spanish: what to check in the result. Empty if nothing."),
});
export type Sheet = z.infer<typeof SheetSchema>;

// ── E-commerce: the episode's product, clean, to cut out in the tool and reuse ──
export const ProductShotSchema = z.object({
  name: z.string().describe("The product's short name in Spanish, as the cast will call it."),
  identity: z.string().describe("The product's identity line in English: shape, material, colour, size cues. Repeated word for word in every prompt."),
  prompt: z
    .string()
    .describe(
      "An image prompt in English in the tool's format: the product alone, whole and centred, front three-quarter view, on a plain light-grey seamless background, soft even studio light, sharp edges, nothing else in frame, no text, no logo, no brand name. Made to cut out with the tool's background removal.",
    ),
  note: z.string().describe("One line in Spanish: anything to check (a detail of the product the prompt guesses)."),
});
export type ProductShot = z.infer<typeof ProductShotSchema>;

// ── Change one object in a shot's image with the tool's segments ──
export const SegmentEditSchema = z.object({
  select: z.string().describe("In Spanish: exactly what to select with the tool's segment tool (one object or area)."),
  prompt: z.string().describe("The edit prompt in English for that selection only; everything else stays as it is."),
  note: z.string().describe("In Spanish: what to check after the edit, or why it cannot be done this way. Empty if nothing."),
});
export type SegmentEdit = z.infer<typeof SegmentEditSchema>;

// ── Step 3: the storyboard ──────────────────────────────────────────────────────
// Grok makes clips of exactly these lengths, so every shot is one of them.
export const SHOT_LENGTHS = [6, 10, 15] as const;

export const ShotWireSchema = z.object({
  title: z.string().describe("The slate: what happens in this shot, up to 8 words, in Spanish."),
  action: z
    .string()
    .describe("One sentence in Spanish: what we see happen, following on from the previous shot. The prompts must match it."),
  topic: z.string().describe("The topic id this shot belongs to."),
  beat: z.string().describe("One of: negative, touching, good."),
  speaker: z.string().describe("Character id of who speaks, or 'none' for no line."),
  voiceover: z.string().describe("The exact line(s) spoken during this shot, taken from the story. May be empty."),
  onScreenText: z
    .string()
    .describe("The headline at the top of the frame: up to 6 words that make sense without the voice (a fact, a time, a number). May be empty."),
  seconds: z.number().describe("Exactly 6, 10 or 15: the shortest that fits the spoken line at ~2.5 words/s."),
  setups: z
    .array(z.string())
    .describe("Ids of every setup in the frame (characters, the place, products), the main one first."),
  kind: z
    .string()
    .describe(
      "One of: single (one image, then animate it), transform (the clip moves from an initial to a final frame, optionally through a middle one), screen (a real screenshot of the product, no image prompt).",
    ),
  screen: z
    .string()
    .describe("screen, or a transform with screenAt: the id of the real screen from the series' fixed cast. Empty otherwise."),
  screenAt: z
    .string()
    .describe(
      "transform only: \"end\" when the final frame is the real screen in screen (the clip moves from the AI scene into the real screenshot; endPrompt empty), \"start\" when the initial frame is (the clip leaves the screenshot into the scene; endPrompt is that scene). Empty otherwise.",
    ),
  visualPrompt: z
    .string()
    .describe(
      "Complete, standalone image prompt in the chosen tool's format (style included): the first frame of the action, one frozen moment, nothing that changes over time. For transform: the initial frame. Empty for screen. English.",
    ),
  middlePrompt: z
    .string()
    .describe("transform only, optional: the middle frame (the turn), one frozen moment. Empty otherwise. English."),
  endPrompt: z.string().describe("transform only: the final frame, one frozen moment. Empty otherwise. English."),
  editFrom: z
    .number()
    .describe(
      "When this shot shows the same setup in the same place as an earlier shot, that shot's number (from 1): its image is edited instead of drawn from zero. 0 if none.",
    ),
  editPrompt: z
    .string()
    .describe("If editFrom: an edit instruction for that image, only what changes (e.g. 'Add …; keep everything else'). English. Empty otherwise."),
  videoPrompt: z
    .string()
    .describe("Prompt that animates this shot's still: the one action of this shot, in the chosen tool's format. English."),
  toolSettings: z.string().describe("What to set in the tool's own controls, very short, e.g. '9:16 · 6 s'."),
  disclosure: z.string().describe("One of: none, concept, simulation."),
  timeline: z
    .array(
      z.object({
        from: z.number().describe("Seconds from the start of this shot."),
        to: z.number(),
        speaker: z.string().describe("Character id, or 'none'."),
        line: z.string().describe("The exact line said in this beat, or empty."),
        emotion: z.string().describe("How it is said, in Spanish."),
        action: z.string().describe("What the bodies and the camera do, including its mistakes, in Spanish."),
      }),
    )
    .describe("Continuous takes only: the timed beats inside the shot, in order, covering it. Empty for a one-line shot."),
});
export type TimelineBeat = z.infer<typeof ShotWireSchema>["timeline"][number];
export const SHOT_KINDS = ["single", "transform", "screen"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

export type ScreenAt = "" | "start" | "end";
export type Shot = Omit<z.infer<typeof ShotWireSchema>, "beat" | "disclosure" | "kind" | "screenAt"> & {
  beat: Beat;
  kind: ShotKind;
  screenAt: ScreenAt;
  disclosure: "none" | "concept" | "simulation";
};

const SetupSchema = z.object({
  id: z.string().describe("A, B, C…"),
  name: z.string().describe("Two to four words, in Spanish."),
  identity: z.string().describe("The identity line repeated word for word in every prompt with this setup. English."),
  castId: z
    .string()
    .describe("The id of the matching member of the series' fixed cast (it has an approved image), or empty if new."),
});
export type Setup = z.infer<typeof SetupSchema>;

const BoardIssueSchema = z.object({
  shot: z.number().describe("Shot number, from 1. 0 for the whole board."),
  kind: z.string().describe("One of: continuity, reality, practice, image, loop, hook, product, other."),
  note: z.string().describe("The problem, in Spanish, specific enough to fix."),
});
export type BoardIssue = z.infer<typeof BoardIssueSchema>;

export const BoardWireSchema = z.object({
  style: z.string().describe("One visual style line, also included inside every visualPrompt. English."),
  setups: z.array(SetupSchema),
  shots: z.array(ShotWireSchema).describe("Every line of the story covered, in order."),
  issues: z
    .array(BoardIssueSchema)
    .describe(
      "A strict critic's pass over the finished board: a shot that does not follow the one before (continuity); the brand shown doing something not in its list of what exists today without a concept or simulation label (reality); an image prompt with more than one moment (image); an open loop never paid off (loop); the first 2 seconds do not show or name the pain (hook); the Good never shows the product in use, a real screen or the product doing its job (product). Empty only if none.",
    ),
});
export type Board = { style: string; setups: Setup[]; shots: Shot[]; issues: BoardIssue[] };

// ── Normalizers: the SDK sends enum choices only as hints, so Claude returns plain strings ──
function pick<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const v = value.toLowerCase();
  return options.find((o) => v.includes(o)) ?? fallback;
}

// Stories saved before the problem title, the practices check, or the writers' room (runner, tease, canon).
export function migrateStory(story: Story): Story {
  const old = story as Story & { runner?: Partial<Story["runner"]>; tease?: string; canon?: Story["canon"] };
  return {
    ...story,
    problem: story.problem ?? "",
    practices: story.practices ?? [],
    runner: {
      bit: old.runner?.bit ?? "",
      open: old.runner?.open ?? "",
      middle: old.runner?.middle ?? "",
      tag: old.runner?.tag ?? "",
    },
    tease: old.tease ?? "",
    canon: old.canon ?? [],
    topics: story.topics.map((t) => ({ ...t, moves: t.moves ?? [], lines: t.lines.map((l) => ({ ...l, emotion: l.emotion ?? "" })) })),
  };
}

export function normalizeStory(wire: z.infer<typeof StoryWireSchema>): Story {
  return {
    ...wire,
    characters: wire.characters.map((c) => ({ ...c, role: pick(c.role, ROLES, "human") })),
    topics: wire.topics.map((t) => ({
      ...t,
      moves: pickMoves(t.moves),
      lines: t.lines.map((l) => ({ ...l, beat: pick(l.beat, BEATS, "negative") })),
    })),
  };
}

// The shortest Grok clip length that holds the shot.
export function snapSeconds(seconds: number): number {
  return SHOT_LENGTHS.find((l) => l >= (seconds || 0) - 0.5) ?? 15;
}

export function normalizeShot(wire: z.infer<typeof ShotWireSchema>): Shot {
  const d = wire.disclosure.toLowerCase();
  const seconds = snapSeconds(wire.seconds);
  // Beats stay inside the shot and in order.
  const timeline = wire.timeline
    .map((b) => ({ ...b, from: Math.max(0, Math.min(b.from, seconds)), to: Math.max(0, Math.min(b.to, seconds)) }))
    .filter((b) => b.to > b.from)
    .sort((a, b) => a.from - b.from);
  let kind = pick(wire.kind, SHOT_KINDS, "single");
  const at = (wire.screenAt ?? "").toLowerCase();
  // A real screen as one end of a transform needs a screen id; the other end stays an AI frame.
  let screenAt: ScreenAt = kind === "transform" && wire.screen.trim() ? (at.includes("end") ? "end" : at.includes("start") ? "start" : "") : "";
  if (kind === "screen" && !wire.screen.trim()) kind = "single";
  if (kind === "transform" && !wire.endPrompt.trim() && screenAt !== "end") kind = "single";
  if (kind !== "transform") screenAt = "";
  return {
    ...wire,
    kind,
    screenAt,
    setups: wire.setups.map((x) => x.trim()).filter(Boolean),
    editFrom: Math.max(0, Math.round(wire.editFrom || 0)),
    beat: pick(wire.beat, BEATS, "negative"),
    seconds,
    timeline,
    disclosure: d.includes("concept") ? "concept" : d.includes("simulation") ? "simulation" : "none",
  };
}

export function normalizeBoard(wire: z.infer<typeof BoardWireSchema>): Board {
  return { ...wire, shots: wire.shots.map(normalizeShot) };
}

// Boards saved before a field existed get its empty value, so old projects still open.
export function migrateBoard(board: Board): Board {
  type Old = Partial<Shot> & { setup?: string };
  return {
    ...board,
    issues: board.issues ?? [],
    setups: board.setups.map((s) => ({ ...s, castId: s.castId ?? "" })),
    shots: board.shots.map((shot) => {
      const old = shot as Old;
      return {
        ...shot,
        setups: old.setups ?? (old.setup ? [old.setup] : []),
        kind: old.kind ?? "single",
        screen: old.screen ?? "",
        screenAt: old.screenAt ?? "",
        middlePrompt: old.middlePrompt ?? "",
        endPrompt: old.endPrompt ?? "",
        editFrom: old.editFrom ?? 0,
        editPrompt: old.editPrompt ?? "",
        timeline: old.timeline ?? [],
      } as Shot;
    }),
  };
}

// ── Server status ───────────────────────────────────────────────────────────────
// maxRefs: how many reference images the tool takes at once, from its profile (null: the profile names no cap).
// watermark: where the tool's mark sits on its pictures ("Watermark keep-out:" in its profile), null when it names none.
// lipSync: the profile's "Lip sync:" line and its tag (shared/adsSpeaker.ts lipSyncNote), null when it says nothing.
export type ToolInfo = {
  id: string;
  name: string;
  checked: string;
  maxRefs?: number | null;
  watermark?: KeepOut | null;
  lipSync?: { tag: "DOCS" | "NOT SURE" | "TESTED"; text: string } | null;
};
// productPerEpisode: every episode features a different product (Máshogar), so the brief must name it.
export type SeriesInfo = {
  id: string;
  name: string;
  tagline: string;
  type: SeriesType;
  productPerEpisode: boolean;
  textStyle: TextStyle;
  lyricStyle: LyricStyle;
  look: SeriesLook;
  brand: Brand;
  cast: CastMember[];
  // "Momentos del calendario": "cuándo: qué pasa", one per line (shared/calendar.ts).
  moments: string[];
  // "Personaje de los explicativos": the cast id of the explainers' host ("" or missing: none).
  explainerCharacter?: string;
  // "Corresponsal": the cast id of the series' correspondent ("" or missing: none).
  correspondent?: string;
  // "Mascota en código": its name and description (the code is fetched on its own); null or missing: none.
  mascot?: MascotMeta | null;
};
export type ImageProviderInfo = { id: string; label: string; available: boolean; hint: string };

export type Status = {
  // The model that writes (Claude or Kimi); null in sample mode.
  writer: { label: string; model: string } | null;
  imageProviders: ImageProviderInfo[];
  tools: ToolInfo[];
  series: SeriesInfo[];
  // Where projects are saved on this computer.
  projectsDir: string;
  // Generated voice ("Voz generada"): needs an OpenAI key.
  voice: { available: boolean; defaultVoice: string };
  // Lyric videos: automatic sync needs the transcription API (same OpenAI key).
  lyrics: { autoSync: boolean };
  // The final render of explainers (render.mjs) needs ffmpeg on this computer. Demucs separates a track's drums.
  render: { ffmpeg: boolean; demucs: boolean };
};

// "Modelos": who writes, who looks at pictures, and which keys are set (never the keys themselves).
// "Traer la marca desde su web": the suggestion and what was read. Nothing is applied until the person picks it;
// claims are [VERIFY] until the person confirms them into "Lo que existe hoy".
export const BrandSuggestionSchema = z.object({
  name: z.string().describe("The brand or product name as the page writes it."),
  tagline: z.string().describe("The brand's own short line from the page, in its language. Empty if there is none."),
  bg: z.string().describe("Background colour, #rrggbb, from the page's colours."),
  text: z.string().describe("Text colour on that background, #rrggbb, readable (strong contrast)."),
  accent: z.string().describe("The ONE accent colour, #rrggbb: the brand's signature colour (buttons, logo), not black, white or grey."),
  displayFont: z.string().describe("A Google Fonts family for titles: the page's own when it is on Google Fonts, else the closest that is."),
  uiFont: z.string().describe("A Google Fonts family for body and UI text, same rule."),
  fontNote: z.string().describe("In Spanish: which fonts the page really uses and why these, when they differ. Empty if they are the page's own."),
  logo: z.number().describe("Index of the logo candidate that is the brand's logo (0-based), or -1 if none is."),
  claims: z.array(z.string()).describe("What the page says the product does or offers, one short plain sentence each in Spanish, up to 8. Only what the page says; no prices or numbers unless the page states them."),
  note: z.string().describe("In Spanish: anything to check (a page that looks like a reseller, not the brand's own; colours that come from a banner). Empty if nothing."),
});
export type BrandSuggestion = z.infer<typeof BrandSuggestionSchema>;
export type BrandFromWeb = {
  url: string;
  title: string;
  colors: string[];
  fonts: string[];
  suggestion: BrandSuggestion;
  // The chosen logo as a data URL (an SVG comes as SVG: the browser cleans and rasterizes it), or empty.
  logo: string;
  // Product photos or screenshots from the page for the cast (by the series type), checked and brought as data URLs.
  cast?: WebCastPick[];
  demo: boolean;
};

export type SettingsView = {
  writer: { provider: string; model: string } | null;
  // Chosen apart from the writer; null means the writer also looks at pictures.
  vision: { provider: string; model: string } | null;
  effort: string;
  providers: { id: string; label: string; ready: boolean; keyEnd: string; model: string; hint: string; editable: boolean }[];
  keys: { name: string; label: string; use: string; hint: string; set: boolean; keyEnd: string }[];
};
export type ListedModel = { id: string; name: string; vision: boolean | null; structured: boolean | null; efforts?: string[] };
