// Shapes shared by the server (Claude output validation) and the browser (types only).
import { z } from "zod";

// The ten moves from the playbook, §2.5.
export const MOVES = [
  "Clip Drop",
  "Contradiction",
  "Slow Reaction",
  "Escalator",
  "Turn",
  "Button",
  "Curiosity Gap",
  "Field Visit",
  "Callback",
  "Remote Stand-up",
] as const;

// The five sections of the §3 script template.
export const SECTIONS = ["hook", "agitate", "turn", "resolve", "button"] as const;
export type Section = (typeof SECTIONS)[number];

export const BriefSchema = z.object({
  job: z.enum(["A", "B"]),
  productName: z.string(),
  whatItDoes: z.string(),
  buyer: z.string(),
  shippedToday: z.string(),
  roadmap: z.string(),
  pain: z.string(),
  offer: z.string(),
  facts: z.string(),
  offLimits: z.string(),
  tone: z.enum(["dry", "warm", "absurdist"]),
  language: z.enum(["en", "es"]),
  format: z.enum(["vertical", "horizontal"]),
  visualStyle: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const HookSchema = z.object({
  move: z.string().describe(`One of: ${MOVES.join(", ")}.`),
  line: z.string().describe("The opening line, spoken or on screen, in the brief's language."),
  visual: z.string().describe("What is on screen during the first five seconds."),
  why: z.string().describe("One sentence on why this hook fits this buyer."),
});
export type Hook = z.infer<typeof HookSchema>;

export const HooksResultSchema = z.object({
  hooks: z.array(HookSchema).describe("Exactly five hooks, each using a different move."),
  questions: z
    .array(z.string())
    .describe("Gaps in the brief the user should fill before this ships. Empty if none."),
});
export type HooksResult = z.infer<typeof HooksResultSchema>;

// Claude returns plain strings for section and disclosure (the SDK sends enums only as hints),
// and normalizeScript() maps them onto the strict values the app relies on.
const ShotWireSchema = z.object({
  section: z.string().describe(`One of: ${SECTIONS.join(", ")}.`),
  voiceover: z.string().describe("What the narrator says during this shot."),
  onScreenText: z.string().describe("Short caption burned into the frame, max ~8 words. May be empty."),
  visualPrompt: z
    .string()
    .describe(
      "Image-generator prompt for this shot: subject, setting, framing, light. No words, logos or real people.",
    ),
  disclosure: z
    .string()
    .describe("One of: none, concept, simulation. 'concept' or 'simulation' when the shot shows anything not shipped today."),
});

export type Shot = Omit<z.infer<typeof ShotWireSchema>, "section" | "disclosure"> & {
  section: Section;
  disclosure: "none" | "concept" | "simulation";
};

export const ChecklistItemSchema = z.object({
  item: z.string(),
  pass: z.boolean(),
  note: z.string(),
});

export const ScriptWireSchema = z.object({
  title: z.string().describe("Video title that states the tension, not the answer (Curiosity Gap)."),
  logline: z.string().describe("One sentence: who, what pain, what changes."),
  style: z.string().describe("One visual style line applied to every image so the shots match."),
  shots: z
    .array(ShotWireSchema)
    .describe("In order: 1 hook, 3 agitate (escalating), 1 turn, 1-2 resolve, 1 button."),
  cta: z.string().describe("The single call to action shown on the last frame."),
  callback: z.object({
    planted: z.string().describe("The line or image planted in the hook."),
    payoff: z.string().describe("How the button pays it off."),
  }),
  checklist: z
    .array(ChecklistItemSchema)
    .describe(
      "The playbook checklist: customer is hero, concrete detail, target is the problem, Turn present, single CTA, no unverified claims, no borrowed IP.",
    ),
  verify: z.array(z.string()).describe("Every claim in the script marked [VERIFY]. Empty if none."),
});
export type Script = Omit<z.infer<typeof ScriptWireSchema>, "shots"> & { shots: Shot[] };

export function normalizeScript(wire: z.infer<typeof ScriptWireSchema>): Script {
  const shots: Shot[] = [];
  for (const shot of wire.shots) {
    const section = SECTIONS.find((s) => shot.section.toLowerCase().includes(s));
    if (!section) continue;
    const d = shot.disclosure.toLowerCase();
    const disclosure = d.includes("concept") ? "concept" : d.includes("simulation") ? "simulation" : "none";
    shots.push({ ...shot, section, disclosure });
  }
  return { ...wire, shots };
}

export type ImageProviderInfo = { id: string; label: string; available: boolean; hint: string };

export type Status = {
  claude: boolean;
  model: string;
  imageProviders: ImageProviderInfo[];
};
