import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  HooksResultSchema,
  ScriptWireSchema,
  ShotWireSchema,
  normalizeScript,
  type Brief,
  type Hook,
  type HooksResult,
  type Script,
  type Shot,
} from "../shared/schema.ts";
import { TEMPLATE, timeShots } from "../shared/template.ts";
import { getTool } from "./tools.ts";

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
    `Image and video prompts: always in English.`,
    `Everything else the person reads in the app (hook visuals and reasons, questions, checklist items and notes, the [VERIFY] list, setup names) is in Spanish (Rioplatense), whatever the ad's language.`,
    `Visual style wish: ${brief.visualStyle || "your call; consistent across shots"}`,
    `Format: ${brief.format === "vertical" ? "vertical 9:16 for Shorts/Reels/TikTok" : "horizontal 16:9 for YouTube"}`,
  ];
  return lines.map((l) => `- ${l}`).join("\n");
}

// The tool profile sits after the cached playbook block, so switching tools never re-bills the playbook.
function toolBlock(toolId: string): string {
  const tool = getTool(toolId);
  return `The person makes every image and video by pasting your prompts into ${tool.name}. Write visualPrompt and videoPrompt in the format this tool profile describes, and never rely on anything it marks [NOT SURE].

${tool.text}`;
}

async function ask<T>(prompt: string, schema: z.ZodType<T>, toolId?: string): Promise<T> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ...(toolId ? [{ type: "text" as const, text: toolBlock(toolId) }] : []),
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
    if (error instanceof Anthropic.AuthenticationError) throw new ClaudeError("La clave de Claude fue rechazada. Revisá ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude está saturado de pedidos. Probá en un minuto.");
    if (error instanceof Anthropic.APIError) throw new ClaudeError(`Claude devolvió un error (${error.status ?? "red"}): ${error.message}`);
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new ClaudeError("Claude no aceptó este brief. Reformulá el dolor o el producto y probá de nuevo.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("La respuesta se cortó. Probá con un brief más corto.");
  }
  if (!message.parsed_output) {
    throw new ClaudeError("No se pudo leer la respuesta de Claude. Probá de nuevo.");
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

Write the full 75-second script with the template. Shots, in order: 1 hook (use the chosen hook), 3 agitate shots that escalate, 1 turn, 1 or 2 resolve, 1 button. The button calls back to the hook. Keep each voiceover short enough to say in its time slot (about 2.5 words per second); shot lengths are: ${shotLengths()}.

Group the shots into setups: each person or place that recurs gets one setup with a short identity line, and every prompt with that person or place repeats the line word for word. Give one style line so every image matches, and put it inside each visualPrompt too: every prompt must stand alone. No text, signs, logos, brand names or real people's likeness in any image. The voiceover and captions are added on top later, so video prompts never ask for speech or music unless the shot needs them. In toolSettings, say what to set in the tool's controls for the shot's shape and length, using only lengths the tool profile documents. Mark any shot that shows roadmap features as "concept" or "simulation". Then run the checklist honestly and list every [VERIFY] claim.`,
      ScriptWireSchema,
      brief.tool,
    ),
  );
  if (!script.shots.some((s) => s.section === "hook") || !script.shots.some((s) => s.section === "button")) {
    throw new ClaudeError("El guion vino sin gancho o sin remate. Probá de nuevo.");
  }
  return script;
}

// Typical shot lengths for the standard shot layout, so Claude can match tool settings to them.
function shotLengths(): string {
  const counts = { hook: 1, agitate: 3, turn: 1, resolve: 2, button: 1 } as const;
  return (Object.keys(counts) as (keyof typeof counts)[])
    .map((k) => `${TEMPLATE[k].label} ${((TEMPLATE[k].end - TEMPLATE[k].start) / counts[k]).toFixed(1)} s each`)
    .join(", ");
}

export async function rewriteShot(brief: Brief, script: Script, index: number, note: string): Promise<Shot> {
  const timed = timeShots(script.shots).find((s) => s.index === index);
  if (!timed) throw new ClaudeError("Esa toma ya no existe.");
  const setup = script.setups.find((s) => s.id === timed.setup);
  const wire = await ask(
    `Brief:
${describeBrief(brief)}

The script "${script.title}" (style: ${script.style}). Setups:
${script.setups.map((s) => `- ${s.id} · ${s.name}: ${s.identity}`).join("\n") || "- none"}

Shot ${index + 1} (${TEMPLATE[timed.section].label}, ${(timed.end - timed.start).toFixed(1)} s, setup ${timed.setup}${setup ? ` · ${setup.name}` : ""}):
${JSON.stringify(timed, null, 2)}

The director's note on this shot: "${note}"

Rewrite this one shot to answer the note. Keep its section, setup and timing, keep the identity line word for word, and change only what the note asks: usually the visualPrompt and videoPrompt, the voiceover or caption only if the note is about them. Fix the source in the prompt; never ask for anything to be painted on later.`,
    ShotWireSchema,
    brief.tool,
  );
  const [shot] = normalizeScript({ ...script, shots: [wire] }).shots;
  if (!shot) throw new ClaudeError("La reescritura no trajo una toma válida. Probá de nuevo.");
  return { ...shot, section: timed.section, setup: timed.setup };
}
