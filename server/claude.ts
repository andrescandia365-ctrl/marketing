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
import { CAST, WORKS_TODAY } from "../shared/series.ts";
import { getSeries } from "./series.ts";
import { KIMI_MODEL, askKimi, kimiKey } from "./kimi.ts";
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

// Errors whose message is shown to the person as is.
export class WriterError extends Error {}

// Who writes: Claude or Kimi. LLM_PROVIDER picks one; without it, Claude if its key is set, else Kimi.
// Neither key means sample mode.
export type Writer = { id: "claude" | "kimi"; label: string; model: string };

export function currentWriter(): Writer | null {
  // The SDK also reads ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles; an explicit key is the documented setup.
  const claude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const kimi = Boolean(kimiKey());
  const pick = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const id = pick === "kimi" ? (kimi ? "kimi" : null) : pick === "claude" ? (claude ? "claude" : null) : claude ? "claude" : kimi ? "kimi" : null;
  if (id === "claude") return { id, label: "Claude", model: MODEL };
  if (id === "kimi") return { id, label: "Kimi", model: KIMI_MODEL };
  return null;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// The series bible and the tool profile come after the cached system block, so switching either never
// re-bills the engine and playbook.
function contextBlocks(brief: Brief, withTool: boolean): string[] {
  const series = getSeries(brief.series);
  if (!series) throw new WriterError(`No existe la serie "${brief.series}".`);
  const blocks = [
    `The series for this piece (its bible is written in Spanish). Its "${WORKS_TODAY}" list is the only thing that may be shown as real. Its "${CAST}", if any, is the series' fixed cast: characters, places and products with an approved image (reuse them: same id as castId, identity word for word) and real screens of the product (kind "screen": real screenshots, shown only in screen shots).\n\n${series.text}`,
  ];
  if (withTool) {
    const tool = getTool(brief.tool);
    blocks.push(
      `The person makes every image and video by pasting your prompts into ${tool.name}. Write visualPrompt and videoPrompt in the format this tool profile describes, and never rely on anything it marks [NOT SURE].\n\n${tool.text}`,
    );
  }
  return blocks;
}

function screensFor(brief: Brief): string {
  const screens = (getSeries(brief.series)?.cast ?? []).filter((m) => m.kind === "screen" && brief.screens.includes(m.id));
  return screens.length ? screens.map((m) => `${m.id} (${m.name}: ${m.identity})`).join("; ") : "none; never use kind screen";
}

function describeBrief(brief: Brief): string {
  const len = LENGTHS[brief.length];
  const lines = [
    `Series: ${getSeries(brief.series)?.name ?? brief.series}`,
    `Length: ${brief.length === "short" ? `a short, ${len.min}–${len.max} s, ONE topic` : `an episode, ${len.min / 60}–${len.max / 60} min, 3–4 topics`}`,
    `${getSeries(brief.series)?.productPerEpisode ? "This episode's product" : "Focus (optional)"}: ${brief.product || "your call"}`,
    `A moment the audience already feels (optional peg): ${brief.angle || "none given"}`,
    `Notes, verified facts, off-limits: ${brief.notes || "none given"}`,
    `Comedic voice: ${brief.tone}`,
    `Spoken lines and on-screen text in: ${brief.language === "es" ? "Spanish (Rioplatense)" : "English"}`,
    `Everything else the person reads in the app (ideas, directions, names, notes, checklist, [VERIFY] list) in Spanish (Rioplatense).`,
    `Image and video prompts and identity lines: always in English.`,
    `Picture format: ${brief.format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}`,
    `Real screens this piece may show (screen shots): ${screensFor(brief)}`,
  ];
  return lines.map((l) => `- ${l}`).join("\n");
}

async function ask<T>(brief: Brief, withTool: boolean, prompt: string, schema: z.ZodType<T>): Promise<T> {
  if (currentWriter()?.id === "kimi") return askKimi([SYSTEM, ...contextBlocks(brief, withTool)], prompt, schema);
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
      throw new WriterError("La respuesta de Claude no vino con la forma esperada. Probá de nuevo.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new WriterError("La clave de Claude fue rechazada. Revisá ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new WriterError("Claude está saturado de pedidos. Probá en un minuto.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new WriterError(`Claude devolvió un error (${error.status ?? "red"}): ${error.message}`);
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new WriterError("Claude no aceptó este pedido. Reformulalo y probá de nuevo.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new WriterError("La respuesta se cortó por larga. Probá con un formato corto o menos temas.");
  }
  if (!message.parsed_output) throw new WriterError("No se pudo leer la respuesta de Claude. Probá de nuevo.");
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

Write the story. Cast the Good, the Bad (named and personified for this piece) and any human characters. Each topic gets a concrete bridge in and its lines in Negative → Touching → Good order, with the Negative escalating in three beats and one sincere Touching line. Plant callbacks and pay them off; the last line calls back to the first. Spoken lines should add up to ${len.min}–${len.max} seconds at about 2.5 words per second.

${STORY_CHECKS}`,
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

Rewrite the story to answer the notes. Keep everything the notes don't touch; don't add what they don't ask for.

${STORY_CHECKS}`,
      StoryWireSchema,
    ),
  );
}

// The checks the writer runs on its own story; the app blocks approval on any that fail.
const STORY_CHECKS = `Then check the story like a strict critic who did not write it. A pass you cannot point to in the text is a fail.
- checklist: Gancho (the first 3 seconds stop the scroll with a concrete pain or a question), Retención (open questions and tension keep people watching; the escalation grows), Recompensa (every open loop pays off), Bueno contra Malo, Momento emotivo, Detalle concreto, Puentes, Callbacks, Continuidad (each line follows from the one before), Lo que existe hoy, El chiste es el problema.
- loops: every open loop (the hook's question, each tension, each planted callback), where it opens and where it pays off. One that never pays off is not closed.
- seriesLoop: walk the series loop from the bible step by step: does the piece show it, and if so, does it show the pain, the step doing its job and the result?
- claims: everything the brand or product is shown doing, each checked against "${WORKS_TODAY}". A thing that is not on the list is only allowed as a clearly labelled concept; the same goes for anything that could break a law or the brand's rules (for example, selling an expired product).`;

const BOARD_RULES = `Shot rules:
- Cover every line of the story, in order, once. A shot holds one line, or two short lines from the same speaker.
- title and action come first: the slate says in a few words what happens, and action says in one sentence what we see, following on from the previous shot. The prompts must show exactly that action.
- visualPrompt is the first frame of the action: ONE frozen moment. Nothing that changes over time and no sequence words (now, then, after, reaches, lifts, turns, becomes). Every action and change goes in videoPrompt, which is one action.
- seconds: exactly 6, 10 or 15, the only clip lengths the tool makes. Pick the shortest that fits the spoken line at about 2.5 words per second (6 s up to 15 words, 10 s up to 25, 15 s up to 37). Split a longer line into two shots. A silent shot is 6 s. toolSettings says the same length.
- onScreenText is the headline at the top of the frame: up to 6 words that make sense without the voice (a fact, a time, a number, a name). Leave it empty rather than write a joke that needs the spoken line. The spoken line is added on its own as the subtitle.
- setups: every character, place and product that appears in more than one shot gets a setup with a short identity line; reuse the story's character identity lines word for word. A setup that matches a member of the series' fixed cast takes its id as castId and its identity line word for word; the person already has its approved image. Each shot lists in setups every setup in the frame, main one first, and every prompt repeats the identity line of everything it shows, word for word.
- kind: "single" for most shots. "transform" where one clip should carry a change on screen, usually the turn from the Bad to the Good: visualPrompt is the initial frame, endPrompt the final frame and middlePrompt an optional middle frame (each one frozen moment), and videoPrompt describes the change between them; give it 10 or 15 s. "screen" only to show the product's real interface with one of the real screens the brief allows: put its id in screen and leave the image prompts empty; the videoPrompt can be empty too.
- editFrom: when a shot shows the same setup in the same place as an earlier shot, set editFrom to that shot's number and write editPrompt: only what changes in that image, keeping everything else. The person edits the earlier image instead of drawing a new one, so the character stays the same. Still write the full visualPrompt as a fallback.
- Put the style line inside each visualPrompt so it stands alone. No text, signs, logos, brand names or real people's likeness in any image. A phone or computer screen faces away from the camera or is out of focus; the tool cannot draw the real interface. How the Bad looks on screen follows the story's character line.
- The spoken lines and captions are added on top later, so video prompts never ask anyone to speak or sing, and ask for no music.
- disclosure: "concept" or "simulation" for anything the brand is shown doing that is not in the series' "${WORKS_TODAY}" list.
- issues: after writing the board, check it like a strict critic: a shot whose action does not follow the previous one (continuity), the brand shown doing something not on its list without a label (reality), an image prompt with more than one moment (image), an open loop never paid off (loop). List every problem you still see; empty only if there are none.`;

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

// In production: one shot, one note. The neighbours come along so the shot keeps following on.
export async function rewriteShot(brief: Brief, story: Story, board: Board, index: number, note: string): Promise<Shot> {
  const shot = board.shots[index];
  if (!shot) throw new WriterError("Esa toma ya no existe.");
  const setups = shot.setups.map((id) => board.setups.find((s) => s.id === id)?.name ?? id).join(", ");
  const slate = (i: number) => {
    const s = board.shots[i];
    return s ? `Shot ${i + 1}: "${s.title}". ${s.action} (line: "${s.voiceover || "none"}")` : "none";
  };
  const wire = await ask(
    brief,
    true,
    `Brief:
${describeBrief(brief)}

The story "${story.title}". Board style: ${board.style}. Setups:
${board.setups.map((s) => `- ${s.id} · ${s.name}: ${s.identity}`).join("\n") || "- none"}

The shot before: ${slate(index - 1)}
The shot after: ${slate(index + 1)}

Shot ${index + 1} of ${board.shots.length} (setups: ${setups || "none"}):
${JSON.stringify(shot, null, 2)}

The director's note on this shot: "${note}"

Rewrite this one shot to answer the note, so it follows the shot before and leads into the shot after. Keep its topic, beat and speaker, keep identity lines word for word, and change its setups or its kind only if the note asks for it. Change the spoken line or the headline only if the note asks for it; if the line changes, pick the length again. Update the title and action if the note changes what happens. Fix the source in the prompt; never ask for anything to be painted on later.

${BOARD_RULES}`,
    ShotWireSchema,
  );
  const next = normalizeShot(wire);
  return { ...next, topic: shot.topic, beat: shot.beat, speaker: shot.speaker };
}
