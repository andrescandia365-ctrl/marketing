import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  HooksResultSchema,
  ScriptWireSchema,
  normalizeScript,
  type Brief,
  type Hook,
  type HooksResult,
  type Script,
} from "../shared/schema.ts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const PLAYBOOK = readFileSync(new URL("./playbook.md", import.meta.url), "utf8");

// Frozen system prompt: identical bytes on every request so the playbook stays in the prompt cache.
const SYSTEM = `You are the writers' room for short marketing videos. You write hooks and 75-second scripts that a separate image generator will illustrate shot by shot, so every shot needs a concrete, filmable visual.

Follow the playbook below. It is the house style; its hard rules and guardrails are not optional.

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

function describeBrief(brief: Brief): string {
  const lines = [
    `Job: ${brief.job === "A" ? "A (planner for stores)" : "B (good emotions at home)"}`,
    `Product: ${brief.productName}`,
    `What it does: ${brief.whatItDoes}`,
    `Buyer: ${brief.buyer}`,
    `Works today (shipped): ${brief.shippedToday}`,
    `Roadmap (NOT shipped, label as concept): ${brief.roadmap || "none given"}`,
    `The pain to open on: ${brief.pain}`,
    `Offer / call to action: ${brief.offer}`,
    `Verified facts the copy may use (anything else is [VERIFY]): ${brief.facts || "none given"}`,
    `Off-limits: ${brief.offLimits || "none given"}`,
    `Comedic voice: ${brief.tone}`,
    `Write all copy (lines, voiceover, captions, title, CTA) in: ${brief.language === "es" ? "Spanish (Rioplatense, plain shop-floor words)" : "English"}`,
    `Image prompts: always in English.`,
    `Visual style wish: ${brief.visualStyle || "your call; consistent across shots"}`,
    `Format: ${brief.format === "vertical" ? "vertical 9:16 for Shorts/Reels/TikTok" : "horizontal 16:9 for YouTube"}`,
  ];
  return lines.map((l) => `- ${l}`).join("\n");
}

async function ask<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "high", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    if (!(error instanceof Anthropic.APIError) && error instanceof Anthropic.AnthropicError) {
      throw new ClaudeError("Claude's answer did not match the expected shape. Try again.");
    }
    if (error instanceof Anthropic.AuthenticationError) throw new ClaudeError("The Claude API key was rejected. Check ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude is rate limited right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw new ClaudeError(`Claude returned an error (${error.status ?? "network"}): ${error.message}`);
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new ClaudeError("Claude declined this brief. Rephrase the pain or product and try again.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("The answer was cut off. Try again with a shorter brief.");
  }
  if (!message.parsed_output) {
    throw new ClaudeError("Claude's answer could not be read. Try again.");
  }
  return message.parsed_output as T;
}

export function writeHooks(brief: Brief): Promise<HooksResult> {
  return ask(
    `Brief:
${describeBrief(brief)}

Write exactly five hook variants for the first five seconds. Each uses a different move from §3 and names it. Each hook is one line plus what is on screen. Then list any gaps in the brief the user should fill before this ships (§7 of the house workflow: product name, buyer, shipped vs. roadmap, offer, channel, tone limits).`,
    HooksResultSchema,
  );
}

export async function writeScript(brief: Brief, hook: Hook): Promise<Script> {
  const script = normalizeScript(
    await ask(
    `Brief:
${describeBrief(brief)}

Chosen hook (${hook.move}): "${hook.line}"
On screen: ${hook.visual}

Write the full 75-second script with the template. Shots, in order: 1 hook (use the chosen hook), 3 agitate shots that escalate, 1 turn, 1 or 2 resolve, 1 button. The button calls back to the hook. Keep each voiceover short enough to say in its time slot (about 2.5 words per second). Give one style line so every image matches, and write each visualPrompt so it stands alone for an image generator: no text, signs, logos, brand names or real people's likeness in the images. Mark any shot that shows roadmap features as "concept" or "simulation". Then run the checklist honestly and list every [VERIFY] claim.`,
      ScriptWireSchema,
    ),
  );
  if (!script.shots.some((s) => s.section === "hook") || !script.shots.some((s) => s.section === "button")) {
    throw new ClaudeError("The script came back without a hook or a button. Try again.");
  }
  return script;
}
