// Shapes shared by the server (Claude output validation) and the browser (types only).
// Flow: Brief → Menu (topics) → Story (Good vs Bad, in rounds) → Board (shots) → production.
import { z } from "zod";

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
      "Good vs Bad present, three beats per topic, a sincere beat, concrete details, bridges, callbacks paid off, last line calls back to the first, no invented claims, joke at the problem not the person.",
    ),
  verify: z.array(z.string()).describe("Every claim marked [VERIFY]. Empty if none."),
});
export type Story = Omit<z.infer<typeof StoryWireSchema>, "characters" | "topics"> & {
  characters: Character[];
  topics: Topic[];
};

// ── Step 3: the storyboard ──────────────────────────────────────────────────────
export const ShotWireSchema = z.object({
  topic: z.string().describe("The topic id this shot belongs to."),
  beat: z.string().describe("One of: negative, touching, good."),
  speaker: z.string().describe("Character id of who speaks, or 'none' for no line."),
  voiceover: z.string().describe("The exact line(s) spoken during this shot, taken from the story. May be empty."),
  onScreenText: z.string().describe("Short caption burned into the frame, max ~8 words. May be empty."),
  seconds: z.number().describe("Length of the shot in seconds, 2 to 15, enough to say its line (~2.5 words/s)."),
  setup: z.string().describe("Setup id (a character or place shown in more than one shot)."),
  visualPrompt: z
    .string()
    .describe("Complete, standalone image prompt in the chosen tool's format (style included). English."),
  videoPrompt: z.string().describe("Prompt that animates this shot's still, in the chosen tool's format. English."),
  toolSettings: z.string().describe("What to set in the tool's own controls, very short, e.g. '9:16 · 6 s'."),
  disclosure: z.string().describe("One of: none, concept, simulation."),
});
export type Shot = Omit<z.infer<typeof ShotWireSchema>, "beat" | "disclosure"> & {
  beat: Beat;
  disclosure: "none" | "concept" | "simulation";
};

const SetupSchema = z.object({
  id: z.string().describe("A, B, C…"),
  name: z.string().describe("Two to four words, in Spanish."),
  identity: z.string().describe("The identity line repeated word for word in every prompt with this setup. English."),
});
export type Setup = z.infer<typeof SetupSchema>;

export const BoardWireSchema = z.object({
  style: z.string().describe("One visual style line, also included inside every visualPrompt. English."),
  setups: z.array(SetupSchema),
  shots: z.array(ShotWireSchema).describe("Every line of the story covered, in order."),
});
export type Board = { style: string; setups: Setup[]; shots: Shot[] };

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

export function normalizeShot(wire: z.infer<typeof ShotWireSchema>): Shot {
  const d = wire.disclosure.toLowerCase();
  return {
    ...wire,
    beat: pick(wire.beat, BEATS, "negative"),
    seconds: Math.min(Math.max(Math.round(wire.seconds * 10) / 10 || 4, 2), 15),
    disclosure: d.includes("concept") ? "concept" : d.includes("simulation") ? "simulation" : "none",
  };
}

export function normalizeBoard(wire: z.infer<typeof BoardWireSchema>): Board {
  return { ...wire, shots: wire.shots.map(normalizeShot) };
}

// ── Server status ───────────────────────────────────────────────────────────────
export type ToolInfo = { id: string; name: string; checked: string };
export type SeriesInfo = { id: string; name: string; tagline: string };
export type ImageProviderInfo = { id: string; label: string; available: boolean; hint: string };

export type Status = {
  claude: boolean;
  model: string;
  imageProviders: ImageProviderInfo[];
  tools: ToolInfo[];
  series: SeriesInfo[];
};
