import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  BoardWireSchema,
  MenuSchema,
  ShotWireSchema,
  StoryWireSchema,
  normalizeBoard,
  normalizeShot,
  normalizeStory,
  type Board,
  type Brief,
  type Menu,
  type Shot,
  type Story,
  type TopicIdea,
} from "../shared/schema.ts";
import { LENGTHS } from "../shared/template.ts";
import { getSeries } from "./series.ts";
import { getTool } from "./tools.ts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const ENGINE = readFileSync(new URL("./engine.md", import.meta.url), "utf8");
const PLAYBOOK = readFileSync(new URL("./playbook.md", import.meta.url), "utf8");

// Frozen system prompt: identical bytes on every request so it stays in the prompt cache.
const SYSTEM = `You are the writers' room of a content studio in Argentina. You plan, write and storyboard recurring social-media content series (Reels, TikTok, Shorts, longer YouTube episodes). A separate image and video tool will illustrate your storyboards shot by shot, so every shot needs a concrete, filmable picture.

The storytelling engine below is how every piece is built. The playbook after it is the house's research: use its moves, writing rules and guardrails, but its 75-second ad template does not apply; the engine's formats do.

${ENGINE}

---

${PLAYBOOK}`;

export class ClaudeError extends Error {}

let client: Anthropic | null = null;

// The SDK also reads ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles; an explicit key is the documented setup.
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// The series bible and the tool profile come after the cached system block, so switching either never
// re-bills the engine and playbook.
function contextBlocks(brief: Brief, withTool: boolean): string[] {
  const series = getSeries(brief.series);
  if (!series) throw new ClaudeError(`No existe la serie "${brief.series}".`);
  const blocks = [
    `The series for this piece. Its "Works today" list is the only thing that may be shown as real.\n\n${series.text}`,
  ];
  if (withTool) {
    const tool = getTool(brief.tool);
    blocks.push(
      `The person makes every image and video by pasting your prompts into ${tool.name}. Write visualPrompt and videoPrompt in the format this tool profile describes, and never rely on anything it marks [NOT SURE].\n\n${tool.text}`,
    );
  }
  return blocks;
}

function describeBrief(brief: Brief): string {
  const len = LENGTHS[brief.length];
  const lines = [
    `Series: ${getSeries(brief.series)?.name ?? brief.series}`,
    `Length: ${brief.length === "short" ? `a short, ${len.min}–${len.max} s, ONE topic` : `an episode, ${len.min / 60}–${len.max / 60} min, 3–4 topics`}`,
    `${brief.series === "masogar" ? "This episode's product" : "Focus (optional)"}: ${brief.product || "your call"}`,
    `A moment the audience already feels (optional peg): ${brief.angle || "none given"}`,
    `Notes, verified facts, off-limits: ${brief.notes || "none given"}`,
    `Comedic voice: ${brief.tone}`,
    `Spoken lines and on-screen text in: ${brief.language === "es" ? "Spanish (Rioplatense)" : "English"}`,
    `Everything else the person reads in the app (ideas, directions, names, notes, checklist, [VERIFY] list) in Spanish (Rioplatense).`,
    `Image and video prompts and identity lines: always in English.`,
    `Picture format: ${brief.format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}`,
  ];
  return lines.map((l) => `- ${l}`).join("\n");
}

async function ask<T>(brief: Brief, withTool: boolean, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ...contextBlocks(brief, withTool).map((text) => ({ type: "text" as const, text })),
    ],
    output_config: { effort: "high", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    if (!(error instanceof Anthropic.APIError) && error instanceof Anthropic.AnthropicError) {
      throw new ClaudeError("La respuesta de Claude no vino con la forma esperada. Probá de nuevo.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ClaudeError("La clave de Claude fue rechazada. Revisá ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ClaudeError("Claude está saturado de pedidos. Probá en un minuto.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new ClaudeError(`Claude devolvió un error (${error.status ?? "red"}): ${error.message}`);
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new ClaudeError("Claude no aceptó este pedido. Reformulalo y probá de nuevo.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("La respuesta se cortó por larga. Probá con un formato corto o menos temas.");
  }
  if (!message.parsed_output) throw new ClaudeError("No se pudo leer la respuesta de Claude. Probá de nuevo.");
  return message.parsed_output as T;
}

function ideasText(ideas: TopicIdea[]): string {
  return ideas
    .map(
      (t, i) =>
        `${i + 1}. "${t.title}"\n   Pain: ${t.pain}\n   The Bad: ${t.bad}\n   The Good: ${t.good}\n   Opening artifact / bridge: ${t.peg}`,
    )
    .join("\n");
}

// Step 1: like a show's morning menu, offer topics to pick from.
export function proposeMenu(brief: Brief): Promise<Menu> {
  return ask(
    brief,
    false,
    `Brief:
${describeBrief(brief)}

Propose six topic ideas for this piece, each built on a different concrete pain from the series, ready for the Good-vs-Bad engine. Use the optional peg where it fits. Then list any gaps the person should fill.`,
    MenuSchema,
  );
}

// Step 2: the story, written as a Good-vs-Bad script with topics, bridges and callbacks.
export async function writeStory(brief: Brief, topics: TopicIdea[]): Promise<Story> {
  const len = LENGTHS[brief.length];
  return normalizeStory(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

The chosen topic${topics.length > 1 ? "s, in this order" : ""}:
${ideasText(topics)}

Write the story. Cast the Good, the Bad (named and personified for this piece) and any human characters. Each topic gets a concrete bridge in and its lines in Negative → Touching → Good order, with the Negative escalating in three beats and one sincere Touching line. Plant callbacks and pay them off; the last line calls back to the first. Spoken lines should add up to ${len.min}–${len.max} seconds at about 2.5 words per second. Run the checklist honestly.`,
      StoryWireSchema,
    ),
  );
}

export async function reviseStory(brief: Brief, story: Story, note: string): Promise<Story> {
  return normalizeStory(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

The current draft:
${JSON.stringify(story, null, 2)}

The director's notes on this draft: "${note}"

Rewrite the story to answer the notes. Keep everything the notes don't touch; don't add what they don't ask for. Re-run the checklist.`,
      StoryWireSchema,
    ),
  );
}

const BOARD_RULES = `Shot rules:
- Cover every line of the story, in order, once. A shot holds one line, or two short lines from the same speaker.
- seconds: long enough to say its line at about 2.5 words per second, never under 2 or over 15; a silent shot (speaker "none") lasts 2–4 s.
- setups: every character and every place that appears in more than one shot gets a setup with a short identity line; reuse the story's character identity lines word for word. Every prompt with that setup repeats its line word for word.
- Put the style line inside each visualPrompt so it stands alone. No text, signs, logos, brand names or real people's likeness in any image. How the Bad looks on screen follows the story's character line.
- The spoken lines and captions are added on top later, so video prompts never ask anyone to speak or sing, and ask for no music.
- toolSettings uses only lengths the tool profile documents.
- disclosure: "concept" or "simulation" for anything not in the series' "Works today" list.`;

// Step 3: the storyboard.
export async function writeBoard(brief: Brief, story: Story): Promise<Board> {
  return normalizeBoard(
    await ask(
      brief,
      true,
      `Brief:
${describeBrief(brief)}

The approved story:
${JSON.stringify(story, null, 2)}

Break it into a storyboard.

${BOARD_RULES}`,
      BoardWireSchema,
    ),
  );
}

export async function reviseBoard(
  brief: Brief,
  story: Story,
  board: Board,
  note: string,
  shotNotes: { index: number; note: string }[],
): Promise<Board> {
  const perShot = shotNotes.map((n) => `- Shot ${n.index + 1}: "${n.note}"`).join("\n");
  return normalizeBoard(
    await ask(
      brief,
      true,
      `Brief:
${describeBrief(brief)}

The approved story:
${JSON.stringify(story, null, 2)}

The current storyboard (shots are numbered from 1 in order):
${JSON.stringify(board, null, 2)}

The director's notes on the whole board: "${note || "none"}"
Notes on single shots:
${perShot || "- none"}

Revise the storyboard to answer every note. Keep the shots the notes don't touch exactly as they are. Fix problems in the prompts themselves; never ask for anything to be painted on later.

${BOARD_RULES}`,
      BoardWireSchema,
    ),
  );
}

// In production: one shot, one note.
export async function rewriteShot(brief: Brief, story: Story, board: Board, index: number, note: string): Promise<Shot> {
  const shot = board.shots[index];
  if (!shot) throw new ClaudeError("Esa toma ya no existe.");
  const setup = board.setups.find((s) => s.id === shot.setup);
  const wire = await ask(
    brief,
    true,
    `Brief:
${describeBrief(brief)}

The story "${story.title}". Board style: ${board.style}. Setups:
${board.setups.map((s) => `- ${s.id} · ${s.name}: ${s.identity}`).join("\n") || "- none"}

Shot ${index + 1} of ${board.shots.length} (setup ${shot.setup}${setup ? ` · ${setup.name}` : ""}):
${JSON.stringify(shot, null, 2)}

The director's note on this shot: "${note}"

Rewrite this one shot to answer the note. Keep its topic, beat, speaker, line, setup and length, keep the identity line word for word, and change only what the note asks (usually the prompts). Fix the source in the prompt; never ask for anything to be painted on later.`,
    ShotWireSchema,
  );
  const next = normalizeShot(wire);
  return { ...next, topic: shot.topic, beat: shot.beat, speaker: shot.speaker, setup: shot.setup, seconds: shot.seconds };
}
