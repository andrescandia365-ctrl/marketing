// Shapes shared by the server (Claude output validation) and the browser (types only).
// Flow: Brief → Menu (topics) → Story (Good vs Bad, in rounds) → Board (shots) → production.
import { z } from "zod";
import type { CastMember, SeriesType, TextStyle } from "./series.ts";

export const BEATS = ["negative", "touching", "good"] as const;
export type Beat = (typeof BEATS)[number];

export const ROLES = ["good", "bad", "human", "narrator"] as const;
export type Role = (typeof ROLES)[number];

export const BriefSchema = z.object({
  series: z.string(),
  length: z.enum(["short", "episode"]),
  // Masogar: this episode's product. IMAN: an optional focus (a loop step or feature).
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
});
export type Brief = z.infer<typeof BriefSchema>;

// ── Step 1: the menu ────────────────────────────────────────────────────────────
export const TopicIdeaSchema = z.object({
  title: z.string().describe("States the tension, not the answer. In Spanish."),
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
  direction: z.string().describe("What is on screen while it is said, in Spanish."),
});
export type Line = Omit<z.infer<typeof LineWire>, "beat"> & { beat: Beat };

const TopicWire = z.object({
  id: z.string().describe("T1, T2…"),
  title: z.string(),
  bridge: z.string().describe("The concrete bridge into this topic (for the first topic: the opening artifact)."),
  lines: z.array(LineWire),
});
export type Topic = Omit<z.infer<typeof TopicWire>, "lines"> & { lines: Line[] };

const ChecklistItemSchema = z.object({ item: z.string(), pass: z.boolean(), note: z.string() });
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const StoryWireSchema = z.object({
  title: z.string().describe("States the tension, not the answer."),
  logline: z.string(),
  characters: z.array(CharacterWire),
  topics: z.array(TopicWire),
  callbacks: z
    .array(z.object({ planted: z.string(), payoff: z.string() }))
    .describe("Each callback: the line planted and where and how it pays off."),
  close: z.string().describe("The last line of the piece; it calls back to the first. A soft close, not a pitch."),
  checklist: z
    .array(ChecklistItemSchema)
    .describe(
      "A strict critic's checklist, items named in Spanish: Gancho (the first 3 seconds stop the scroll), Retención (open questions keep people watching, the escalation grows), Recompensa (every open loop pays off), Bueno contra Malo, Momento emotivo, Detalle concreto, Puentes, Callbacks, Continuidad (each line follows the one before), Lo que existe hoy (the brand only does what its list says), El chiste es el problema. A pass you cannot point to in the text is a fail.",
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
  verify: z.array(z.string()).describe("Every claim marked [VERIFY]. Empty if none."),
});
export type Story = Omit<z.infer<typeof StoryWireSchema>, "characters" | "topics"> & {
  characters: Character[];
  topics: Topic[];
};

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
  screen: z.string().describe("screen only: the id of the real screen from the series' fixed cast. Empty otherwise."),
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
});
export const SHOT_KINDS = ["single", "transform", "screen"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

export type Shot = Omit<z.infer<typeof ShotWireSchema>, "beat" | "disclosure" | "kind"> & {
  beat: Beat;
  kind: ShotKind;
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
  kind: z.string().describe("One of: continuity, reality, image, loop, other."),
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
      "A strict critic's pass over the finished board: a shot that does not follow the one before (continuity); the brand shown doing something not in its list of what exists today without a concept or simulation label (reality); an image prompt with more than one moment (image); an open loop never paid off (loop). Empty only if none.",
    ),
});
export type Board = { style: string; setups: Setup[]; shots: Shot[]; issues: BoardIssue[] };

// ── Normalizers: the SDK sends enum choices only as hints, so Claude returns plain strings ──
function pick<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const v = value.toLowerCase();
  return options.find((o) => v.includes(o)) ?? fallback;
}

export function normalizeStory(wire: z.infer<typeof StoryWireSchema>): Story {
  return {
    ...wire,
    characters: wire.characters.map((c) => ({ ...c, role: pick(c.role, ROLES, "human") })),
    topics: wire.topics.map((t) => ({
      ...t,
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
  let kind = pick(wire.kind, SHOT_KINDS, "single");
  if (kind === "screen" && !wire.screen.trim()) kind = "single";
  if (kind === "transform" && !wire.endPrompt.trim()) kind = "single";
  return {
    ...wire,
    kind,
    setups: wire.setups.map((x) => x.trim()).filter(Boolean),
    editFrom: Math.max(0, Math.round(wire.editFrom || 0)),
    beat: pick(wire.beat, BEATS, "negative"),
    seconds: snapSeconds(wire.seconds),
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
        middlePrompt: old.middlePrompt ?? "",
        endPrompt: old.endPrompt ?? "",
        editFrom: old.editFrom ?? 0,
        editPrompt: old.editPrompt ?? "",
      } as Shot;
    }),
  };
}

// ── Server status ───────────────────────────────────────────────────────────────
export type ToolInfo = { id: string; name: string; checked: string };
// productPerEpisode: every episode features a different product (Masogar), so the brief must name it.
export type SeriesInfo = {
  id: string;
  name: string;
  tagline: string;
  type: SeriesType;
  productPerEpisode: boolean;
  textStyle: TextStyle;
  cast: CastMember[];
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
};
