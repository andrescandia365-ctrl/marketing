import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  BoardWireSchema,
  BrandSuggestionSchema,
  HookVariantsWireSchema,
  normalizeHookVariants,
  type HookVariant,
  ImageReviewSchema,
  MenuSchema,
  ProductShotSchema,
  SegmentEditSchema,
  SheetSchema,
  ShotWireSchema,
  StoryWireSchema,
  normalizeBoard,
  normalizeShot,
  normalizeStory,
  type Board,
  type Brief,
  type ImageReview,
  type Menu,
  type ProductShot,
  type SegmentEdit,
  type Sheet,
  type SheetTemplate,
  type Shot,
  type Story,
  type TopicIdea,
  type BrandSuggestion,
} from "../shared/schema.ts";
import { EMPTY_BRIEF } from "../shared/example.ts";
import type { SiteFacts } from "./brandWeb.ts";
import { MotionNoteSchema, MotionScriptSchema, READ_LETTERS_PER_SECOND, hostScenes, normalizeMotion, pickCamera, readingNeed, type MotionScript } from "../shared/motion.ts";
import { mergeNote, noteView, type NoteMerge } from "../shared/motionNote.ts";
import { MotionReviewSchema, normalizeReview, type MotionReview } from "../shared/motionQuality.ts";
import {
  BackgroundPromptsSchema,
  LyricElementsSchema,
  LyricIdeasSchema,
  SecondLinesSchema,
  type BackgroundPrompts,
  type LyricElements,
  type LyricIdeas,
  type SecondLanguage,
} from "../shared/lyrics.ts";
import { LyricPlatesSchema, type LyricPlatesDraft } from "../shared/plates.ts";
import { LENGTHS } from "../shared/template.ts";
import { CAST, PRACTICES, WORKS_TODAY, explainerHost } from "../shared/series.ts";
import { momentsForWriter } from "../shared/calendar.ts";
import { getSeries } from "./series.ts";
import { askKimi, listChatModels, type ChatTarget, type ListedModel } from "./kimi.ts";
import { baseUrlOf, claudeEffort, keyOf, labelOf, visionChoice, writerChoice, EFFORTS, type Effort, type ProviderId } from "./settings.ts";
import { getTool } from "./tools.ts";
import { offerOf } from "./ads.ts";
import { offerBlock } from "../shared/ads.ts";

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

// Who writes: the provider and model chosen in "Modelos" (or .env). Null means sample mode.
export type Writer = { provider: ProviderId; label: string; model: string };

export function currentWriter(): Writer | null {
  const w = writerChoice();
  return w && { provider: w.provider, label: labelOf(w.provider), model: w.model };
}

export function currentVision(): Writer | null {
  const v = visionChoice();
  return v && { provider: v.provider, label: labelOf(v.provider), model: v.model };
}

// One client per key: a key changed in the app takes effect on the next request.
let client: { key: string; sdk: Anthropic } | null = null;
function getClient(): Anthropic {
  const key = keyOf("claude") ?? "";
  if (!client || client.key !== key) {
    // Without ANTHROPIC_API_KEY the SDK reads ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
    client = { key, sdk: key ? new Anthropic({ apiKey: key }) : new Anthropic() };
  }
  return client.sdk;
}

// ── What each Claude model accepts ─────────────────────────────────────────────────
// From the Models API when the list was fetched (capabilities); otherwise from the model's name.
type Caps = { adaptive: boolean; efforts: Effort[]; structured: boolean; vision: boolean; maxTokens: number };
const knownCaps = new Map<string, Caps>();

function guessCaps(model: string): Caps {
  const old = /claude-(haiku|sonnet|opus)-4-[0-5]\b|claude-3/.test(model);
  const fourSix = /claude-(opus|sonnet)-4-6\b/.test(model);
  return {
    adaptive: !old,
    efforts: old ? [] : fourSix ? ["low", "medium", "high", "max"] : [...EFFORTS],
    // Structured outputs: every current model but Opus 4.7/4.6 and Sonnet 4.6.
    structured: !/claude-(opus-4-[67]|sonnet-4-6)\b/.test(model),
    vision: true,
    maxTokens: /haiku/.test(model) ? 64000 : 128000,
  };
}

const capsOf = (model: string) => knownCaps.get(model) ?? guessCaps(model);

// The server-side refusal fallback ("default" routing) is documented for these models.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

type Leaf = { supported?: boolean };
function readCaps(model: { id: string; max_tokens?: number | null; capabilities?: unknown }): Caps {
  const c = (model.capabilities ?? {}) as Record<string, Leaf & Record<string, Leaf & Record<string, Leaf>>>;
  if (!model.capabilities) return guessCaps(model.id);
  return {
    adaptive: Boolean(c.thinking?.types?.adaptive?.supported),
    efforts: c.effort?.supported ? EFFORTS.filter((e) => (c.effort?.[e] as Leaf | undefined)?.supported) : [],
    structured: Boolean(c.structured_outputs?.supported),
    vision: Boolean(c.image_input?.supported),
    maxTokens: model.max_tokens ?? 64000,
  };
}

// The models this key can use, with what each accepts.
export async function listClaudeModels(): Promise<(ListedModel & { efforts: Effort[] })[]> {
  const list: (ListedModel & { efforts: Effort[] })[] = [];
  try {
    for await (const m of getClient().models.list()) {
      const caps = readCaps(m);
      knownCaps.set(m.id, caps);
      list.push({ id: m.id, name: m.display_name, vision: caps.vision, structured: caps.structured, efforts: caps.efforts });
    }
  } catch (error) {
    throw claudeError(error);
  }
  return list;
}

export function claudeEfforts(model: string): Effort[] {
  return capsOf(model).efforts;
}

function claudeError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) return new WriterError("La clave de Claude fue rechazada. Revisala en Modelos.");
  if (error instanceof Anthropic.NotFoundError) return new WriterError("Claude no encontró ese modelo. Elegí otro en Modelos.");
  if (error instanceof Anthropic.RateLimitError) return new WriterError("Claude está saturado de pedidos. Probá en un minuto.");
  if (error instanceof Anthropic.APIError) return new WriterError(`Claude devolvió un error (${error.status ?? "red"}): ${error.message}`);
  if (error instanceof Anthropic.AnthropicError) return new WriterError("La respuesta de Claude no vino con la forma esperada. Probá de nuevo.");
  return error instanceof Error ? error : new Error(String(error));
}

// The series bible and the tool profile come after the cached system block, so switching either never
// re-bills the engine and playbook.
function contextBlocks(brief: Brief, withTool: boolean): string[] {
  const series = getSeries(brief.series);
  if (!series) throw new WriterError(`No existe la serie "${brief.series}".`);
  const blocks = [
    `The series for this piece (its bible is written in Spanish). Its "${WORKS_TODAY}" list is the only thing that may be shown as real. Its "${PRACTICES}" list, if any, is how people work today without the brand: pains are built only on it and the brief's notes. Its "${CAST}", if any, is the series' fixed cast: characters, places and products with an approved image (reuse them: same id as castId, identity word for word) and real screens of the product (kind "screen": real screenshots, shown only in screen shots).\n\n${series.text}`,
  ];
  // The series' calendar moments, nearest first with how far each one is (after the cache: it changes every day).
  const moments = momentsForWriter(series.moments, new Date());
  if (moments) blocks.push(moments);
  // The offer profile from Publicidad, when the series has one: the same audience, promise and proofs as the ads.
  const offer = offerOf(brief.series);
  if (offer) blocks.push(`${offerBlock(offer)}\nThis profile adds to the bible; where they differ, the bible's "${WORKS_TODAY}" wins on what is real.`);
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
    `Takes: ${brief.takes === "continuous" ? "CONTINUOUS — 15 s handheld takes, each a scene with timed beats (see the continuous-take rules)" : "one line per shot (6, 10 or 15 s)"}`,
    brief.narrator === "without"
      ? "Narrator: NONE. No character has the narrator role and nobody speaks from outside the scene. The characters' own words, what they do, and the text on screen carry the whole piece; every beat must be clear without a narrator. A shot may have no line at all (action only)."
      : "Narrator: allowed (the narrator role may speak when it helps).",
  ];
  return lines.map((l) => `- ${l}`).join("\n");
}

// A picture sent along with a prompt (JPEG, base64), with a line saying what it is.
export type Picture = { label: string; jpeg: string };

function chatTarget(w: Writer): ChatTarget {
  const provider = w.provider as Exclude<ProviderId, "claude">;
  return { label: w.label, baseUrl: baseUrlOf(provider), key: keyOf(provider) ?? "", model: w.model };
}

// Requests with pictures go to the model chosen to look at them (the writer if none is set).
async function ask<T>(brief: Brief, withTool: boolean, prompt: string, schema: z.ZodType<T>, pictures: Picture[] = []): Promise<T> {
  const who = (pictures.length ? currentVision() : currentWriter()) ?? currentWriter();
  if (!who) throw new WriterError("No hay ninguna IA conectada. Cargá una clave en Modelos.");
  return askWith(who, [SYSTEM, ...contextBlocks(brief, withTool)], prompt, schema, pictures);
}

// The system blocks: the first (engine and playbook) is cached; the series and tool blocks come after it.
export async function askWith<T>(who: Writer, system: string[], prompt: string, schema: z.ZodType<T>, pictures: Picture[] = []): Promise<T> {
  if (who.provider !== "claude") return askKimi(chatTarget(who), system, prompt, schema, pictures);
  const caps = capsOf(who.model);
  if (!caps.structured) {
    throw new WriterError(`${who.model} no devuelve respuestas con forma fija, y la app las necesita. Elegí otro modelo de Claude en Modelos.`);
  }
  const effort = claudeEffort();
  const fallback = FALLBACK_MODELS.has(who.model);
  const stream = getClient().beta.messages.stream({
    model: who.model,
    max_tokens: Math.min(64000, caps.maxTokens),
    ...(fallback && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    // Adaptive thinking where the model has it; older ones (Haiku 4.5) answer without it.
    ...(caps.adaptive && { thinking: { type: "adaptive" as const } }),
    system: system.map((text, i) => ({ type: "text" as const, text, ...(i === 0 && { cache_control: { type: "ephemeral" as const } }) })),
    output_config: {
      ...(caps.efforts.length && { effort: caps.efforts.includes(effort) ? effort : caps.efforts.includes("high") ? "high" : caps.efforts.at(-1)! }),
      format: betaZodOutputFormat(schema),
    },
    messages: [
      {
        role: "user",
        content: pictures.length
          ? [
              ...pictures.flatMap((p) => [
                { type: "text" as const, text: p.label },
                { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: p.jpeg } },
              ]),
              { type: "text" as const, text: prompt },
            ]
          : prompt,
      },
    ],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    throw claudeError(error);
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

// The models a provider offers (for the picker).
export async function listModels(provider: ProviderId): Promise<(ListedModel & { efforts?: Effort[] })[]> {
  if (provider === "claude") return listClaudeModels();
  const p = provider as Exclude<ProviderId, "claude">;
  return listChatModels({ label: labelOf(p), baseUrl: baseUrlOf(p), key: keyOf(p) ?? "" });
}

// A tiny real request through the same path the app uses (a JSON reply, and a picture when it is for looking).
// A 64×64 red JPEG.
const RED =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgICAkICQsLCwsLCw0MDQ0NDQ0NDQ0NDQ0ODg4REREODg4NDQ4OEBARERITEhERERETExQUFBgYFxccHB0iIin/xABNAAEBAAAAAAAAAAAAAAAAAAAABgEBAQEAAAAAAAAAAAAAAAAAAAYHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAQABAAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AiAE+2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/9k=";

const PongSchema = z.object({ ok: z.boolean(), word: z.string() });
const SeenSchema = z.object({ colour: z.string().describe("The picture's colour, one word in Spanish.") });

export async function testModel(who: Writer, vision: boolean): Promise<string> {
  const schema = vision ? SeenSchema : PongSchema;
  const started = Date.now();
  const reply = await askWith(
    who,
    ["You check that a connection works. Reply with the JSON asked for, nothing else."],
    vision ? "What colour is the picture? One word, in Spanish." : 'Reply with ok: true and the word "listo".',
    schema as z.ZodType<{ ok?: boolean; word?: string; colour?: string }>,
    vision ? [{ label: "The picture:", jpeg: RED }] : [],
  );
  const ms = Date.now() - started;
  return vision ? `Vio la imagen: “${reply.colour ?? "?"}” (${(ms / 1000).toFixed(1)} s).` : `Respondió “${reply.word ?? "ok"}” (${(ms / 1000).toFixed(1)} s).`;
}

function ideasText(ideas: TopicIdea[]): string {
  return ideas
    .map(
      (t, i) =>
        `${i + 1}. Problem: ${t.problem || "(name it)"}\n   Hook title: "${t.title}"\n   Pain: ${t.pain}\n   The Bad: ${t.bad}\n   The Good: ${t.good}\n   Opening artifact / bridge: ${t.peg}`,
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

Propose six topic ideas for this piece, each built on a different concrete pain from the series and named by the problem it solves, ready for the Good-vs-Bad engine. Every pain follows how people really work today (the series' "${PRACTICES}" list and the brief's notes); never invent a way of working. Use the optional peg where it fits. Then list any gaps the person should fill.`,
    MenuSchema,
  );
}

// Step 2: the story, written as a Good-vs-Bad script with topics, bridges and callbacks.
export async function writeStory(brief: Brief, topics: TopicIdea[], room = "", askNote = ""): Promise<Story> {
  const len = LENGTHS[brief.length];
  return normalizeStory(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

The chosen topic${topics.length > 1 ? "s, in this order" : ""}:
${ideasText(topics)}

Write the story. Its problem is the chosen topic's problem (for several topics, the one problem they share). Cast the Good, the Bad (named and personified for this piece) and any human characters. Each topic gets a concrete bridge in and its lines in Negative → Touching → Good order, with the Negative escalating in three beats and one sincere Touching line. Plant callbacks and pay them off; the last line calls back to the first. Give every line its emotion: how it is said, not just the words. Spoken lines should add up to ${len.min}–${len.max} seconds at about 2.5 words per second.

${ROOM_CRAFT}
${brief.length === "episode" ? "This is an episode: give it a runner." : "This is a short: a runner is optional."}
${room ? `Writers' room. Other saved pieces of this series; the audience already lived them. Pay a hanging tease or an open loop only when it serves this episode's problem. Do not repeat a runner already used. Treat canon as already true.\n${room}` : "No earlier piece of this series is saved."}
${askNote ? `The room asked this episode to do this, without dropping the episode's own problem: "${askNote}"` : ""}

${STORY_CHECKS}`,
      StoryWireSchema,
    ),
  );
}

export async function reviseStory(brief: Brief, story: Story, note: string, room = ""): Promise<Story> {
  return normalizeStory(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

The current draft:
${JSON.stringify(story, null, 2)}

${room ? `Writers' room, other saved pieces. Do not contradict canon and do not repeat a runner already used.\n${room}\n` : ""}
The director's notes on this draft: "${note}"

Rewrite the story to answer the notes. Keep everything the notes don't touch; don't add what they don't ask for. If the notes ask you to pick up a tease or an open loop, do that. Keep the runner's three landings unless the notes change them. If the draft has an empty runner and the notes don't forbid one, you may add one.

${ROOM_CRAFT}
${STORY_CHECKS}`,
      StoryWireSchema,
    ),
  );
}

// PLAYBOOK §3: five hook variants per script, each naming the move it uses. Same problem and story, five ways in.
export async function hookVariants(brief: Brief, story: Story): Promise<HookVariant[]> {
  return normalizeHookVariants(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

The story (its problem: "${story.problem}"; its hook now: "${story.title}"):
${JSON.stringify({ problem: story.problem, title: story.title, logline: story.logline, topics: story.topics.map((t) => ({ title: t.title, bridge: t.bridge, lines: t.lines.map((l) => l.text) })), close: story.close }, null, 2)}

Write five hook variants for this piece: the same problem and story, five different ways into it, each leaning on a different playbook move (§2.5) and naming it. Each one stops the scroll in the first 2 seconds with something concrete (the object, the number, the hour) and makes sense with no context. Punch at the problem, never at the person. Only what the series shows as real; anything unconfirmed carries [VERIFY]. Do not repeat the current hook. Say which awareness level (1–5) of the viewer each one speaks to, so the best ones can also run as paid ads.`,
      HookVariantsWireSchema,
    ),
  );
}

// What a writers' room keeps across episodes, on top of the callbacks inside this one.
const ROOM_CRAFT = `Like a series writers' room, also fill:
- runner: one concrete bit (an object, a short phrase or a gesture) that lands in the opening, again in the middle and in the tag. Each landing changes the bit. open, middle and tag each quote, inside «», a few words that are spoken in a line, and the three quotes are different.
- tease: one concrete thing left hanging for a later episode, or an empty string if this piece should close clean. Do not put the tease in loops and do not pay it off here.
- canon: up to three facts this episode makes true for later episodes (an object, a relationship, a rule of the place). Not a product claim. Empty if the world did not change.`;

// The checks the writer runs on its own story; the app blocks approval on any that fail.
const STORY_CHECKS = `Tag each topic's moves: the playbook moves (§2.5) it really uses on screen, by id. Use them on purpose: open on the real artifact, escalate, let one Turn land (the irony drops, one sincere line) and end the piece on a Button that calls back to the hook. Do not tag a move the lines do not show.

Then check the story like a strict critic who did not write it. A pass you cannot point to in the text is a fail.
- checklist: Gancho (the first 3 seconds stop the scroll with a concrete pain or a question), Retención (open questions and tension keep people watching; the escalation grows), Recompensa (every open loop pays off), Bueno contra Malo, Momento emotivo, Detalle concreto, Puentes, Callbacks, Continuidad (each line follows from the one before), Lo que existe hoy, El chiste es el problema, Cliente héroe (the customer or the person on screen is the hero and the brand never opens the piece), Un solo llamado (at most one soft call to action, at the end), Nada prestado (no show, host, real person, character, catchphrase or another brand's ad borrowed). The runner's three «quotes» are three different phrases, each one said in the story. The tease is not listed as a loop.
- loops: every open loop (the hook's question, each tension, each planted callback), where it opens and where it pays off. One that never pays off is not closed.
- seriesLoop: walk the series loop from the bible step by step: does the piece show it, and if so, does it show the pain, the step doing its job and the result?
- claims: everything the brand or product is shown doing, each checked against "${WORKS_TODAY}". A thing that is not on the list is only allowed as a clearly labelled concept; the same goes for anything that could break a law or the brand's rules (for example, selling an expired product).
- practices: every way of working the story shows people using without the brand (how they order, count, check, pay, close, keep track), each checked against the series' "${PRACTICES}" list and the brief's notes. known is false when neither says people do it that way.`;

const BOARD_RULES = `Shot rules:
- Cover every line of the story, in order, once. A shot holds one line, or two short lines from the same speaker (continuous takes: see below).
- The look: if the series has a Look line, build the style line from it and put it in every image and video prompt. Always ask for flaws (the camera, its flash, grain, focus that misses, where the light hits) and real skin (pores, freckles, no smoothing); never "cinematic", "vintage" or "film still". The light never changes inside a shot; only the camera's auto-exposure does.
- title and action come first: the slate says in a few words what happens, and action says in one sentence what we see, following on from the previous shot. The prompts must show exactly that action.
- visualPrompt is the first frame of the action: ONE frozen moment. Nothing that changes over time and no sequence words (now, then, after, reaches, lifts, turns, becomes). Every action and change goes in videoPrompt, which is one action.
- seconds: exactly 6, 10 or 15, the only clip lengths the tool makes. Pick the shortest that fits the spoken line at about 2.5 words per second (6 s up to 15 words, 10 s up to 25, 15 s up to 37). Split a longer line into two shots. A silent shot is 6 s. toolSettings says the same length.
- onScreenText is the headline at the top of the frame: up to 6 words that make sense without the voice (a fact, a time, a number, a name). Leave it empty rather than write a joke that needs the spoken line. The spoken line is added on its own as the subtitle.
- setups: every character, place and product that appears in more than one shot gets a setup with a short identity line; reuse the story's character identity lines word for word. A setup that matches a member of the series' fixed cast takes its id as castId and its identity line word for word; the person already has its approved image. Each shot lists in setups every setup in the frame, main one first, and every prompt repeats the identity line of everything it shows, word for word.
- kind: "single" for most shots. "transform" where one clip should carry a change on screen, usually the turn from the Bad to the Good: visualPrompt is the initial frame, endPrompt the final frame and middlePrompt an optional middle frame (each one frozen moment), and videoPrompt describes the change between them; give it 10 or 15 s. "screen" only to show the product's real interface with one of the real screens the brief allows: put its id in screen and leave the image prompts empty; the videoPrompt can be empty too.
- editFrom: when a shot shows the same setup in the same place as an earlier shot, set editFrom to that shot's number and write editPrompt: only what changes in that image, keeping everything else. The person edits the earlier image instead of drawing a new one, so the character stays the same. Still write the full visualPrompt as a fallback.
- Put the style line inside each visualPrompt so it stands alone. No text, signs, logos, brand names or real people's likeness in any image. A phone or computer screen faces away from the camera or is out of focus; the tool cannot draw the real interface. How the Bad looks on screen follows the story's character line.
- The spoken lines and captions are added on top later, so video prompts never ask anyone to speak or sing, and ask for no music (continuous takes are the exception: their dialogue is spoken in the clip).
- Continuous takes, only when the brief asks for them: each shot is ONE continuous handheld take of exactly 15 s, holding the consecutive lines of one scene (one topic or part of it), kind "single". speaker is the first one who speaks and voiceover all its lines in order. timeline lists every beat from 0 to 15 s: who speaks, the exact line, its emotion, and what the bodies and the camera do, including real camera mistakes (a pan that arrives late and clips a face, autofocus hunting, auto-exposure rolling between inside and outside, a laugh that shakes the frame). visualPrompt is the hero still, frame 0 of the take: exact camera, exact flaws, exact light, everyone in place. videoPrompt is the director's prompt: first a reference map (the initial frame = the hero still; each character = its cast @ref; the place = its cast @ref, environment only; "these images are law"), then "one continuous handheld take, no cuts", then the timed spine with emotion and camera mistakes, then the hard rules: skin never smooth (visible pores, freckles, peach fuzz); grain the whole time; no stabilization, no grade, no music, no text, no digital zoom, no punch-in, no slow motion; brightness changes only from auto-exposure, the light never changes; each line spoken once, exactly as written, in Rioplatense Spanish, with the emotion given; raw phone-mic audio (room tone, handling noise, no denoising). One-line shots have an empty timeline.
- disclosure: "concept" or "simulation" for anything the brand is shown doing that is not in the series' "${WORKS_TODAY}" list.
- If the story has a runner, three shots show it: the opening landing, the changed middle landing and the tag. Do not pay the tease off on this board.
- issues: after writing the board, check it like a strict critic: a shot whose action does not follow the previous one (continuity), the brand shown doing something not on its list without a label (reality), people working in a way the series' "${PRACTICES}" list and the brief don't confirm (practice), an image prompt with more than one moment (image), an open loop never paid off (loop), a first shot that does not show or name the pain within 2 seconds (hook), a Good that never shows the product in use: a real screen, or the product doing its job on screen (product). List every problem you still see; empty only if there are none.`;

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

// Lyric videos (series of type music). There is no brief; the series bible still goes along.
function lyricBrief(series: string): Brief {
  return { ...EMPTY_BRIEF, series };
}

function numbered(lines: string[]): string {
  return lines.map((l, i) => `${i}. ${l}`).join("\n");
}

export function lyricIdeas(series: string, title: string, artist: string, lines: string[]): Promise<LyricIdeas> {
  return ask(
    lyricBrief(series),
    false,
    `This is a lyric video, not a story: the song's lines appear on a moving, organic colour background (soft colour fields that drift and swell with the beat), and some words stand out bigger.

Song: "${title || "sin título"}"${artist ? ` by ${artist}` : ""}. The lyrics may be in any language (Spanish, Guaraní, Japanese, Korean, romanized…). Lines, numbered from 0:
${numbered(lines)}

Suggest the background's three colours and pace from the song's feeling, and the words that should stand out.`,
    LyricIdeasSchema,
  );
}

const TRANSLATE_INTO: Record<Exclude<SecondLanguage, "otro">, string> = {
  es: "Spanish (Rioplatense), singable and plain",
  gn: "Guaraní as spoken in Paraguay, in the Guaraní alphabet (tilde on nasal vowels ã ẽ ĩ õ ũ ỹ, and g̃). Plain enough to sing under the line",
  en: "plain English",
  pt: "Brazilian Portuguese, plain and singable",
  ja: "natural Japanese",
  ko: "natural Korean",
  fr: "plain French",
  it: "plain Italian",
};

// The smaller line under each lyric line: its romanization, or a translation into the language asked for ("otro":
// the one the person typed).
export async function secondLines(
  series: string,
  lines: string[],
  mode: "romanize" | "translate",
  language: SecondLanguage = "es",
  other = "",
): Promise<{ lines: string[]; note: string }> {
  const into = language === "otro" ? other.trim() || "Spanish" : TRANSLATE_INTO[language];
  const task =
    mode === "romanize"
      ? "Romanize each line: Japanese in Hepburn romaji (spaces between words), Korean in Revised Romanization, anything already in Latin letters (Spanish, Guaraní…) copied as is. Keep the meaning out; only the sound."
      : `Translate each line into ${into}. A line already in that language is copied unchanged. Keep names and the feeling. One line per lyric line, in the same order. In the note, in Spanish, name the lines you are least sure of.`;
  const result = await ask(lyricBrief(series), false, `Song lyrics, numbered from 0:\n${numbered(lines)}\n\n${task}`, SecondLinesSchema);
  return { lines: lines.map((_, i) => result.lines[i] ?? ""), note: result.note };
}

// A few graphics timed to lyric lines. The app draws the motif; the person can paste a picture later.
export function lyricElements(series: string, title: string, artist: string, lines: string[]): Promise<LyricElements> {
  return ask(
    lyricBrief(series),
    false,
    `This is a lyric video. The app draws a few simple graphics over the moving background, each timed to one lyric line. It can draw only these motifs: word, circle, ring, star, heart, note. Motions: enter (it arrives), pulse (it beats in place), hold (it stays still), leave (it drifts away). Places: top, left, right. Do not describe scenes, people, cameras or HTML. No show names, no real people.

Song: "${title || "sin título"}"${artist ? ` by ${artist}` : ""}. Lines may be in any language. Lines, numbered from 0:
${numbered(lines)}

Propose 3 to 6 graphics. For each: the line number, a label of one to three words copied exactly from that line, a motif, a motion, a place (vary the places), and seconds between 1.5 and 4. Not every line needs one.`,
    LyricElementsSchema,
  );
}

// The director's pass: plates for a code-drawn lyric video. Not a finished frame, and not one picture per line.
export function lyricPlates(
  series: string,
  title: string,
  artist: string,
  lines: string[],
  note: string,
  current: { title: string; from: number; to: number; look: string; motif: string }[],
): Promise<LyricPlatesDraft> {
  return ask(
    lyricBrief(series),
    false,
    `Plan the plates of a code-drawn music video. You are directing the edit. The app draws each plate: flat colours already chosen, maximalist type, the lyric lighting up on the sung word. You do not write shaders, prompts or image descriptions.

Constraints:
- One motif per plate: a concrete thing, two or three words. It lives inside that plate and leaves with it. Not a readout that stays on screen for the whole song.
- Do not illustrate every line. A plate holds several lines and one idea.
- Choruses that repeat share a motif and change it: bigger, broken, or later.
- Cover every line from 0 to ${lines.length - 1} exactly once, in order, no gaps, no overlaps.
- A plate is 2 to 6 lines. A one-line intro is allowed. At most 8 plates.
- look is one of: type (one huge word), stack (the lines piled, a rule that fills as words are sung), margin (the line on one side, a giant letter of the motif on the other), count (a number of words sung so far, as the scene), stamp (the motif stamped across the frame, the line over a flat bar).
- Titles and motifs in the language of the lyrics. idea and note in Rioplatense Spanish.
- If the person wrote a note, follow it. Keep a plate they did not ask to change.

Song: "${title || "sin título"}"${artist ? ` by ${artist}` : ""}. Lines, numbered from 0:
${numbered(lines)}

The person's note: ${note.trim() || "(none)"}
Plates already there: ${current.length ? current.map((plate) => `${plate.from}-${plate.to} ${plate.look} “${plate.motif}” (${plate.title})`).join(" | ") : "(none)"}`,
    LyricPlatesSchema,
  );
}

// Background clips for a lyric video, written for the image/video tool the person uses (its profile goes along).
export function backgroundPrompts(
  series: string,
  tool: string,
  title: string,
  lines: string[],
  style: { palette: string[]; mood: string },
  format: "vertical" | "horizontal",
): Promise<BackgroundPrompts> {
  return ask(
    { ...lyricBrief(series), tool, format },
    true,
    `This is a lyric video: the song's lines are drawn on top of a moving background. Write prompts for background clips the person will make with the tool and loop under the song.

Song: "${title || "sin título"}". Lyrics, numbered from 0:
${numbered(lines)}

The background's colours: ${style.palette.join(", ")} (describe them in words). Pace: ${style.mood === "lively" ? "lively, with energy" : "calm and slow"}. Picture format: ${format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}.

Rules: abstract and organic (light, fabric, water, smoke, paint, plants, sky), soft and out of focus enough for words to read on top; no people, faces, hands, text, letters, logos or brands; slow continuous motion with no cuts that loops well; no music or sound needed.`,
    BackgroundPromptsSchema,
  );
}

// Looks at an uploaded image (or a frame of a clip) against its shot: the moment, the cast, no text or logos.
export function reviewPicture(
  brief: Brief,
  shot: { title: string; action: string; prompt: string; what: "image" | "clip" },
  setups: { name: string; identity: string }[],
  picture: string,
  refs: Picture[],
): Promise<ImageReview> {
  return ask(
    brief,
    true,
    `Review the ${shot.what === "clip" ? "middle frame of the clip" : "image"} the person made for this shot, like a strict continuity supervisor.

Shot: "${shot.title}". What happens: ${shot.action}
The prompt it was made from: ${shot.prompt}
In frame (identity lines): ${setups.map((s) => `${s.name}: ${s.identity}`).join(" | ") || "none listed"}
${refs.length ? "The approved reference images of the series' cast come first; the last picture is the one to review." : "The picture to review is the one above."}`,
    ImageReviewSchema,
    [...refs, { label: `The ${shot.what === "clip" ? "clip frame" : "image"} to review:`, jpeg: picture }],
  );
}

// E-commerce: a clean picture of the episode's product, made to cut out with the tool's background removal and
// keep in the series' cast as its reference.
export function productShot(brief: Brief): Promise<ProductShot> {
  return ask(
    brief,
    true,
    `This episode's product: ${brief.product || "(see the series)"}

Write the prompt for one clean product picture the person will make with the tool, cut out with its background removal and keep as the product's reference image for every scene of the series.`,
    ProductShotSchema,
  );
}

// One object changed in a shot's image with the tool's segments ("cambiá solo el yogur"). Never to cover or remove
// a watermark: the route refuses that before it gets here.
export function segmentEdit(brief: Brief, shot: Shot, note: string): Promise<SegmentEdit> {
  return ask(
    brief,
    true,
    `A shot's image already exists. The person wants to change only one thing in it, using the tool's segments (select one object or area, then describe the change).

The shot: "${shot.title}". ${shot.action}
Its image prompt: ${shot.visualPrompt}
The change: "${note}"

Say what to select and write the edit prompt for that selection only. Keep characters' identity lines word for word if they appear. Never select or alter a watermark, a logo of the tool or any provenance mark.`,
    SegmentEditSchema,
  );
}

// A reference sheet for the series' cast, made in the tool before any motion so faces and places never drift.
// People: always invented adults, never a real person's likeness, never sexualized.
export function referenceSheet(
  series: string,
  template: SheetTemplate,
  details: Record<string, string>,
  age: number,
): Promise<Sheet> {
  const given = Object.entries(details)
    .map(([k, v]) => `- ${k}: ${v.trim() || "(empty: choose it)"}`)
    .join("\n");
  const person = template === "girl" || template === "boy";
  const task = template === "puppet"
    ? `Build a reference sheet of one invented 3D-look character for this series' fixed cast, to be animated as a cut-out puppet in motion graphics: a person (always an adult, ${age} years old or as the details say, never a real person or a lookalike of anyone famous), a mascot or a talking object, as the details say.

Details (in Spanish; choose any that are empty so the character fits the series and its audience, and list your choices in filled):
${given}

The look: a stylized 3D render, soft rounded shapes, matte materials with a little texture (clay, felt or soft plastic), gentle studio light from the upper left, readable at phone size, the brand's colours where they fit. Never the style of a named studio, film or game, and never a known character. Nothing revealing or sexualized.
The sheet prompt: 16:9, plain flat mid-grey background, no text, no labels, no floor shadow. Top row: full body front, three-quarter, side profile, back (the three-quarter and the profile both turned toward screen right, arms hanging relaxed). Bottom row: the face with four expressions (neutral, happy, surprised, worried; each one with the mouth closed, same size and angle as the front view) and four mouth shapes (closed, A wide open, O round, E stretched), each mouth alone at the same size. Identical shapes and colours in every panel. Put the full description inside the prompt.
The views, as separate prompts with the same description; the FIRST view must be "Para el títere": full body, front, standing straight, arms held a little away from the body (a relaxed A-pose, hands not touching anything), mouth closed, eyes open looking at the camera, centred with space around it, plain flat mid-grey background, even light, no shadow, nothing in front of the body. That picture is cut into parts with the tool's Segments (head, body, each arm, mouth, eyes), so the parts must not overlap.
In note (Spanish): remind to make "Para el títere" in the tool, then Segmentos → select head, body, each arm, mouth and eyes → Descargar todo, and upload the layers in the character's card ("Títere 3D"). Optionally, from the sheet: cut the mouths A, O and E, the happy, surprised and worried faces and the 3/4 and profile bodies, upload them as "Partes sueltas" with those roles and line them up in "Armar a mano" (the mouths change with the voice, the face follows the line's emotion, the body turns when it points at something).`
    : person
    ? `Build a photorealistic character reference sheet of one invented adult ${template === "girl" ? "woman" : "man"}, ${age} years old, for this series' fixed cast. Never a real person or a lookalike of anyone famous. Everyday clothes, neutral relaxed poses, nothing revealing or sexualized.

Details (in Spanish; choose any that are empty so the character fits the series and its audience, and list your choices in filled):
${given}

The sheet prompt: 16:9, plain light-grey seamless background, soft even daylight, no text, no labels. Top row: full body front, three-quarter, side profile, back view, standing relaxed. Bottom row: close-up head front, three-quarter, profile, then a four-face expression strip (neutral, soft smile, mid-word talking, easy laugh; adapt them to the character's attitude). Small insets: jewellery or accessories, hands, fabric texture. Skin realism: visible pores, fine texture, faint unevenness, natural sheen, no smoothing, no retouching, no beauty filter. Identical face, hair and body in every panel. Put the full description (age, skin, eyes, brows, nose, lips, hair, build, wardrobe, jewellery) inside the prompt.
The views: the same character as separate prompts (full body front; three-quarter; side profile; back; head close-ups; expressions; insets), each standalone with the same description.`
    : `Build a photorealistic location reference sheet of one place for this series' fixed cast, so the set matches from every camera angle.

Details (in Spanish; choose any that are empty so the place fits the series, and list your choices in filled):
${given}

The sheet prompt: 16:9 grid of six panels, no people, no text. Panel 1: wide exterior. Panel 2: the hero angle, where most scenes are shot, at eye or seated height. Panel 3: the reverse angle. Panels 4 and 5: close details that will show in shots. Panel 6: the view out (a window, the street, the door). The same light in every panel, with where it comes from. Realism: real wear, scuffs, dust, uneven surfaces.
The views: each panel as a separate standalone prompt with the full description.`;
  return ask({ ...lyricBrief(series), tool: "grok-imagine" }, true, task, SheetSchema);
}

// A motion-graphics explainer (software: how the app does something; e-commerce: the episode's product). Follows the
// studio's rules: hook in 2 s, something new every 2 to 4 s, no stock defaults, one accent, the brand's fonts.
// What the explainer writer can show (the series' cast) and its host, shared by a new script and a director's note.
function explainerCast(brief: Brief) {
  const series = getSeries(brief.series);
  const host = series ? explainerHost(series) : null;
  const cast = (series?.cast ?? [])
    .map((m) => `- ${m.id} (${m.kind}${m.image ? ", has image" : ", no image yet"}${m.kind === "character" && m.puppet?.layers.length ? ", 3D puppet" : ""}${m.id === host?.id ? ", the series' explainer character" : ""}): ${m.name}. ${m.identity}`)
    .join("\n");
  const characters = (series?.cast ?? []).filter((m) => m.kind === "character").map((m) => m.id);
  return { series, host, cast, characters };
}

function castBlock(cast: string, layers: number): string {
  return `What you can show (the series' fixed cast; use ids exactly; only members with an image will render, others show a placeholder):
${cast || "- (nothing yet: use hook, steps, stat and logo, and say in note what is missing)"}
${layers ? `Uploaded layers: ${Array.from({ length: layers }, (_, i) => `layer:${i}`).join(", ")}.` : ""}`;
}

// The studio's rules for an explainer script (a new one or one revised by a note).
function explainerRules(brief: Brief, host: ReturnType<typeof explainerHost>): string {
  return `The studio's rules:
- The first scene is a hook that names the problem within 2 seconds, as the question the viewer already asks themselves, in their words.
- Something new appears on screen every 2 to 4 seconds: a scene change, a label, a step, a zoom. Never a still stretch longer than 4 seconds.
- Never the stock defaults: a centred title on a gradient, everything fading in, corner labels, frame borders, glow on UI chrome, generic particle bursts.
- The brand's colours with one accent, its display face for titles and its UI face for the rest (the "Marca" line).
- Readable on a phone: titles up to 6 words, up to 4 labels of up to 5 words. In callouts and steps the labels arrive one by one and only the newest is at full strength (the earlier ones step back as context), so list them in the order the voice names them. Every line stays fully on screen about 0.3 s per word (a 1-3 word label 0.8 s) after it is fully in, and never less than 1 s per ${READ_LETTERS_PER_SECOND} letters: long Spanish words need more ("Planificación automatizada" ${readingNeed("Planificación automatizada").toFixed(1)} s), so prefer short words. Fast in, then hold. Too much text for a scene's length: fewer words or another scene, never faster.
- Show the product in use when you can (entry → key action → result): for software, a real screen, then the type template (search or write something, tap the button, see the result).
- Only what the series lists as working today is shown as real; never invent a feature, a price or a number (leave items empty and note it).
- Grade every scene against that list: in beyondToday say, in a few Spanish words, anything it shows or says that is not on it (a roadmap feature, a screen that does not exist, a result the product does not give today), else leave it empty. Real cast screens and the cast product shown as they are count as real. A scene that does show something beyond today sets disclosure concept (an idea: how it could look) or simulation (a mock run of something not live), and the app labels it CONCEPTO or SIMULACIÓN on screen; every other scene is real. Lead with what works today; a concept, if any, comes after it and never as the payoff.
- Voice lines in Rioplatense Spanish, each with its emotion, fitting its scene at about 2.5 words per second.
- In a character scene the emotion also sets the puppet's face: name it plainly (contento, sorprendido, preocupado, or a calm word for a neutral face); a worried face only on the pain, never on the product.
${
  host
    ? `- The series has a fixed explainer character: ${host.id}, ${host.name}${host.note ? ` (${host.note})` : ""}. It is the same host in every explainer of the series, so the audience knows it. Every character scene uses it (asset ${host.id}), never another character. Bring it back at least once in this piece where a character scene fits (to present the product or point at the real screen), and at most twice: it guides, it never replaces showing the product. With the character template it says its scene's voice line (its mouth moves), makes one gesture (presenta, saluda, señala, festeja, se sorprende) and can point at or present a real screen or the product (assetB). Its voice lines sound like the same person every time.`
    : "- A character from the cast (a 3D puppet, or one with an image) can host with the character template: it says its scene's voice line (its mouth moves), makes one gesture (presenta, saluda, señala, festeja, se sorprende) and can point at or present a real screen or the product (assetB). Use it once or twice, to guide, never to replace showing the product."
}
- The Contradiction (contradiction template), when the pain is a mismatch people already live with: items[0] what the system, the label or the habit says, items[1] what really happens; the first gets struck through. Build it only on the series' "Cómo se trabaja hoy" list and the brief, never on an invented habit, and with real numbers only.
- Travel between scales when it helps the idea: from the whole to the detail (the shelf, the product on it, its expiry date) or back out to the whole. Make that move with entry "through" on the scene that opens inside the previous one (the camera dives into its main thing), once or twice per piece, never on every cut.
- In beforeAfter, reveal "iris" when the change starts in one spot and spreads (set focusX, focusY on that spot); "wipe" when it is a plain side-by-side.
- camera, the move inside each scene: hold (still), push (slowly closer), pull (slowly back to the whole), pan (slides across), drift (floats a little). Choose it for what the scene shows and vary it across the piece; never the same move three scenes in a row. Hold on scenes that are mostly words to read (a hook with no picture, type, steps, contradiction, stat, logo) and on zoom, which makes its own move: words never move while they are read. Push in on the product or the real screen. callouts and beforeAfter only hold, push or pull, so their labels stay pinned to the picture. Drift and pan suit a character or a picture.${brief.tone === "dry" ? " This piece is dry: mostly hold, and a slow push on the product or the real screen; no pull, pan or drift." : ""}
- The last scene is the logo with a soft call to action. Its line calls back to the hook: the same problem, now solved, not a new idea.
${brief.narrator === "without" ? "- No narrator: leave every scene's voice and emotion empty. Titles, labels, the typed text and the product in use carry the meaning; keep it readable without a voice.\n" : ""}- Pace for the brief's comic voice (${brief.tone}): ${TONE_PACE[brief.tone]}
- The product and the logo are the big moments: they land on the music's strongest hits (the app moves their cuts there).
- music: a mood (calm, drive or bright) and a tempo for the synthesized score.
- caption: the text to post with the video, 1 to 3 sentences in the piece's tone, about this problem in its own words; never "excited to share" or generic SaaS language; nothing unverified without [VERIFY].`;
}

// A motion-graphics explainer (software: how the app does something; e-commerce: the episode's product). Follows the
// studio's rules: hook in 2 s, something new every 2 to 4 s, no stock defaults, one accent, the brand's fonts.
export async function motionScript(brief: Brief, target: number | null, layers: number): Promise<MotionScript> {
  const { series, host, cast, characters } = explainerCast(brief);
  const motion = normalizeMotion(
    await ask(
      brief,
      false,
      `Brief:
${describeBrief(brief)}

Write a motion-graphics explainer, not a story: ${series?.type === "ecommerce" ? "this episode's product, what it is and what it fixes at home" : "how the app solves one concrete problem, shown on its real screens"}. ${target ? `It lasts ${target} seconds in total.` : "Choose the length from how much there is to explain (15 to 60 seconds) and say why in durationNote."}

${castBlock(cast, layers)}

${explainerRules(brief, host)}`,
      MotionScriptSchema,
    ),
    brief.tone,
  );
  // The series' explainer character hosts every character scene, whatever id the writer put there.
  return { ...motion, scenes: hostScenes(motion.scenes, host?.id, characters, false), tone: brief.tone };
}

// "Nota del director" for an explainer: the writer returns the whole script with only what the note asks changed,
// each scene naming the current scene it comes from; mergeNote keeps the rest as it was (ids, hand tweaks, voices).
export async function reviseMotion(brief: Brief, current: MotionScript, note: string, layers: number): Promise<NoteMerge> {
  const { series, host, cast, characters } = explainerCast(brief);
  const wire = await ask(
    brief,
    false,
    `Brief:
${describeBrief(brief)}

This is a motion-graphics explainer about ${series?.type === "ecommerce" ? "this episode's product, what it is and what it fixes at home" : "how the app solves one concrete problem, shown on its real screens"}. The current script, each scene with its id:
${noteView(current)}

The director's note on this script: "${note}"

Return the whole script with only what the note asks changed. Every scene the note does not touch comes back exactly as it is, field by field, with its id in from. A scene you change keeps its id in from. A new scene has an empty from. A scene the note asks to remove is left out. Never change a voice line, a title or a timing the note does not ask about. Keep problem, title, music and caption unless the note changes them. In note, say in Spanish what you changed (one sentence), or what the note asks that the rules do not allow. The rules below are how the script was written: follow them in what you change, but never change an untouched scene only to follow them.

${castBlock(cast, layers)}

${explainerRules(brief, host)}`,
    MotionNoteSchema,
  );
  if (!wire.scenes.length) throw new WriterError("La IA devolvió el guion sin escenas. Probá de nuevo o escribí la nota de otra forma.");
  const links = wire.scenes.map((s) => ({ from: s.from, camera: pickCamera(s.camera) }));
  const revised = normalizeMotion({ ...wire, scenes: wire.scenes.map(({ from: _from, ...s }) => s) }, current.tone ?? brief.tone);
  // keepOthers as in the studio: a character the person chose for a scene stays.
  const hosted = { ...revised, scenes: hostScenes(revised.scenes, host?.id, characters, true), tone: current.tone ?? brief.tone };
  return mergeNote(current, hosted, links);
}

// "Traer la marca desde su web": the writer reads what the page uses and says, and proposes the brand kit.
export function brandFromSite(facts: SiteFacts, seriesId: string): Promise<BrandSuggestion> {
  return ask(
    { ...EMPTY_BRIEF, series: seriesId },
    false,
    `This is the brand's own web page, read by the app (its colours and fonts come from its styles, most used first).

Address: ${facts.url}
Title: ${facts.title}
Site name: ${facts.siteName || "(none)"}
Description: ${facts.description || "(none)"}
Theme colour: ${facts.themeColor || "(none)"}
Colours: ${facts.colors.map((c) => `${c.hex}×${c.count}`).join(", ") || "(none found)"}
Font families in its styles: ${facts.fonts.map((f) => `${f.family}×${f.count}`).join(", ") || "(none found)"}
Google Fonts it loads: ${facts.googleFonts.join(", ") || "(none)"}
Logo candidates: ${facts.logos.map((l, i) => `${i}. ${l.kind} ${l.url}`).join(" | ") || "(none)"}
What the page says:
${facts.text || "(no text found)"}

Propose the brand kit for the series' motion graphics: a background, a text colour and ONE accent, taken from the page's colours (the most used light or dark one for the background; the brand's signature colour as the accent, never a grey); two Google Fonts families; the logo candidate that is really the logo. Then list what the page says the product does, as short plain claims: they will be marked [VERIFY] until the person confirms each one, so never add anything the page does not say.`,
    BrandSuggestionSchema,
  );
}

// Voice → pacing (PLAYBOOK §3.1): how many scenes, how long they hold, how they change and how much sounds.
const TONE_PACE: Record<Brief["tone"], string> = {
  dry: "3 to 5 scenes, one claim each, long holds and empty space; scenes change with hard cuts; very few sounds (the product and the logo). Played straight, never winking.",
  warm: "4 to 5 scenes at a comfortable rhythm; soft pushes between scenes; a few gentle sounds, a soft one on the logo.",
  absurdist: "6 to 8 scenes, some under 2 seconds; hard, fast changes; one comic accent at a time. The scale can be big, the claims stay what the brand does today.",
};

// The quality loop: the reviewer looks at the contact sheet(s) and the app's measurements, scores six things from 1
// to 10 and turns the three worst problems into edits of the script.
export async function reviewMotion(
  brief: Brief,
  scenes: string,
  facts: string,
  sheets: { format: "vertical" | "horizontal"; jpeg: string }[],
  round: number,
  earlier: string,
): Promise<MotionReview> {
  const series = getSeries(brief.series);
  return normalizeReview(
    await ask(
      brief,
      false,
      `You are the motion studio's strict reviewer. ${sheets.length > 1 ? "The contact sheets above show" : "The contact sheet above shows"} one frame per beat of a motion-graphics explainer, taken 0.3 s after the beat so what entered has settled (the second and scene under each frame), at phone-thumbnail size. This is review round ${round}.

The script as it plays:
${scenes}

What the app measured (trust these over your eyes for timing and sound):
${facts}
${earlier ? `\nEarlier rounds, already applied:\n${earlier}\n` : ""}
The brand ("Marca" line of the series): ${JSON.stringify(series?.brand ?? {})}. Templates: hook, screen, zoom, type, character, callouts, steps, beforeAfter, contradiction, product, stat, logo.

Score each from 1 to 10, strictly (8 = ready to publish):
- hook: within the first 2 seconds the problem is named and something moves; no slow start.
- readability: every word reads at phone size (big enough, enough contrast, nothing cut off, not too many words at once) and stays on screen long enough to read (about 0.3 s per word once fully in, and 1 s per ${READ_LETTERS_PER_SECOND} letters when the words are long; the measured list above). On 9:16 no text sits under the platform's top bar, caption or buttons, and no settled text covers other text (both measured above). The subtitle and the AI notice cannot move: move the other element (dy, dx or scale). In callouts and steps only the newest label is at full strength and the earlier ones are dimmer on purpose (the measured "Focus one at a time" line): judge them by that measured contrast, never as a fault to fix.
- motion also covers the cuts: frames marked "corte" are the middle of a scene change; two busy layouts muddled together there is a problem.
- motion: purposeful, eased movement; no stock defaults (centred title on a gradient, everything fading in, corner labels or frame borders, glow on UI chrome, particle bursts).
- variety: the scenes do not repeat the same layout and move; something new every 2 to 4 seconds.
- brand: the brand's colours with one accent, its fonts, its logo at the end; nothing off-brand.
- sync: cuts and entrances land on the beats; voices fit their scenes.

Then fix the three worst problems (only scores under 8), worst first, each as one edit of one scene with the fields given. Fix with the script: shorter words, a bigger element (scale), an earlier or on-beat entrance (at), a scene shorter or longer, another template for variety, a move away from the edge. Never invent a feature, a number or a price; only what the series lists as working today may be shown as real. Never change what the voice says.

Then the hard rule on what is real: only the series' "${WORKS_TODAY}" list may be shown as real. In beyondToday list every scene that shows or says a feature, screen, result or capability not on that list and has no CONCEPTO or SIMULACIÓN label (the script says which scenes are labelled). Real cast screens and the cast product shown as they are count as real. A scene already flagged in the script needs no new entry. The person decides whether to label it or change it. Leave fixes empty when every score is 8 or more.

Also pick the thumbnail (poster): the second of the strongest settled frame, never a "corte" frame.`,
      MotionReviewSchema,
      sheets.map((s) => ({ label: `Contact sheet, ${s.format === "vertical" ? "9:16" : "16:9"}:`, jpeg: s.jpeg })),
    ),
  );
}
