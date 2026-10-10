// The writer for Publicidad: hooks, meats and CTAs by awareness level, the catalogue of uploaded clips, the review of
// a run and the platform texts. Same providers as the rest of the app (Claude or Kimi), through askWith. The system
// prompt (the 50-5-3 method and the playbook) is frozen so it stays in the prompt cache; the series bible, the offer
// profile and the tool profile come after it.
import { readFileSync } from "node:fs";
import {
  ANGLES,
  BUDGETS,
  BUTTONS,
  ClipAnalysisWireSchema,
  CopiesWireSchema,
  CtasWireSchema,
  FORMULAS,
  HooksWireSchema,
  LEVEL_INFO,
  LEVELS,
  MEAT_FORMATS,
  MeatsWireSchema,
  ReviewWireSchema,
  isAdSeconds,
  wordsFor,
  type AdSeconds,
  type ClipAnalysisWire,
  type CopiesWire,
  type Cta,
  type CtasWire,
  type Hook,
  type HooksWire,
  type Level,
  type Meat,
  type MeatFormat,
  type MeatsWire,
  type Offer,
  type ReviewWire,
  offerBlock,
} from "../shared/ads.ts";
import { PRACTICES, WORKS_TODAY } from "../shared/series.ts";
import { momentsForWriter } from "../shared/calendar.ts";
import { WriterError, askWith, currentWriter } from "./claude.ts";
import { getSeries } from "./series.ts";
import { getTool } from "./tools.ts";

const METHOD = readFileSync(new URL("./ads.md", import.meta.url), "utf8");
const PLAYBOOK = readFileSync(new URL("./playbook.md", import.meta.url), "utf8");

const SYSTEM = `You write paid ads for brands in Argentina, by the 50-5-3 method below: pieces (hooks, meats, CTAs) that code combines into hundreds of ads. The playbook after it is the house's research: its writing rules and guardrails apply (the customer is the hero, concrete beats clever, punch at the problem, no invented claims, [VERIFY] on anything unconfirmed, no borrowed IP, no politics); its story template does not.

${METHOD}

---

${PLAYBOOK}`;

function blocks(series: string, offer: Offer, tool: string | null): string[] {
  const s = getSeries(series);
  if (!s) throw new WriterError(`No existe la serie "${series}".`);
  const out = [
    `The brand's series bible (Spanish). Its "${WORKS_TODAY}" list is the only thing that may be shown as real. Its "${PRACTICES}" list is how people work today without the brand.\n\n${s.text}`,
    offerBlock(offer),
  ];
  // Calendar hooks: the series' moments, nearest first (a hook may open on one, like an occasion).
  const moments = momentsForWriter(s.moments, new Date());
  if (moments) out.push(moments);
  if (tool) {
    const t = getTool(tool);
    out.push(`The person makes every image and clip by pasting your prompts into ${t.name}. Write visualPrompt and videoPrompt in this tool's format; never rely on anything marked [NOT SURE].\n\n${t.text}`);
  }
  return out;
}

async function ask<T>(series: string, offer: Offer, tool: string | null, prompt: string, schema: Parameters<typeof askWith<T>>[3]): Promise<T> {
  const who = currentWriter();
  if (!who) throw new WriterError("No hay ninguna IA conectada. Cargá una clave en Modelos.");
  return askWith(who, [SYSTEM, ...blocks(series, offer, tool)], prompt, schema);
}

const levelLines = (levels: Level[]) => levels.map((l) => `${l}. ${LEVEL_INFO[l].label}: ${LEVEL_INFO[l].desc}`).join("\n");
const budgetOf = (seconds: number) => (isAdSeconds(seconds) ? BUDGETS[seconds] : BUDGETS[15]);

export type HookRequest = {
  levels: Level[];
  count: number;
  seconds: AdSeconds;
  winners: string[];
  existing: string[];
  language: "es" | "en";
};

export function writeHooks(series: string, offer: Offer, tool: string, req: HookRequest): Promise<HooksWire> {
  const budget = budgetOf(req.seconds);
  const words = wordsFor(budget.hook);
  const perLevel = Math.ceil(req.count / req.levels.length);
  return ask(
    series,
    offer,
    tool,
    `Write ${req.count} hooks for ${req.seconds}-second ads. Each hook lasts ${budget.hook} s: at most ${words} spoken words (about 2.7 words per second), in ${req.language === "es" ? "Rioplatense Spanish" : "English"}.

Awareness levels to cover (about ${perLevel} hooks each):
${levelLines(req.levels)}

Cover a grid inside each level: spread the angles (${ANGLES.join(", ")}) and the formulas (${FORMULAS.join(", ")}) so no two hooks of a level share both. Each hook names a different concrete situation from the offer's problem and the audience's words.

${req.winners.length ? `Hooks that already worked (metrics or organic content). Learn their structure and angle; never reuse their words:\n${req.winners.map((w) => `- ${w}`).join("\n")}` : "No winning hooks are known yet."}
${req.existing.length ? `\nHooks that already exist; do not write these or near-duplicates:\n${req.existing.map((w) => `- ${w}`).join("\n")}` : ""}

Give every hook its onScreenText, visualPrompt and videoPrompt (one frozen moment with the presenter and setting of the offer, so every piece cuts with every other).`,
    HooksWireSchema,
  );
}

export type MeatRequest = {
  levels: Level[];
  formats: MeatFormat[];
  count: number;
  seconds: AdSeconds;
  hooks: Hook[];
  language: "es" | "en";
};

export function writeMeats(series: string, offer: Offer, tool: string, req: MeatRequest): Promise<MeatsWire> {
  const budget = budgetOf(req.seconds);
  const words = wordsFor(budget.meat);
  return ask(
    series,
    offer,
    tool,
    `Write ${req.count} meats for ${req.seconds}-second ads. Each meat lasts ${budget.meat} s: at most ${words} spoken words, in ${req.language === "es" ? "Rioplatense Spanish" : "English"}.

They will follow these approved hooks (any hook of the meat's levels, chosen by code), so open neutral: never refer back to a hook's words, never repeat one.
${req.hooks.map((h) => `- [${h.id} · N${h.level}] ${h.text}`).join("\n") || "- (no hooks approved yet: write for the levels below)"}

Levels to serve:
${levelLines(req.levels)}

Formats to use, one or two meats each, spread over the count: ${req.formats.map((f) => `${f}`).join(", ")}. Each meat says which levels it serves (levels whose hooks it can follow: usually two or three neighbouring ones).
A testimonial quotes only the offer's proofs; a demo shows only what "${WORKS_TODAY}" lists; a "faceless" meat has nobody on camera.

Give every meat its onScreenText, visualPrompt and videoPrompt, same presenter and setting as the hooks.`,
    MeatsWireSchema,
  );
}

export type CtaRequest = { levels: Level[]; count: number; seconds: AdSeconds; hooks: Hook[]; language: "es" | "en" };

export function writeCtas(series: string, offer: Offer, tool: string, req: CtaRequest): Promise<CtasWire> {
  const budget = budgetOf(req.seconds);
  const words = wordsFor(budget.cta);
  return ask(
    series,
    offer,
    tool,
    `Write ${req.count} CTAs for ${req.seconds}-second ads. Each CTA lasts ${budget.cta} s: at most ${words} spoken words, in ${req.language === "es" ? "Rioplatense Spanish" : "English"}.

Each CTA says, in one breath: what to do (the exact action), why it matters (the benefit), when (a real urgency) and how easy it is (only from the landing page facts in the offer). Fill the four fields with the parts and put them together in text.

Levels to serve and the push each one takes:
${req.levels.map((l) => `${l}. ${LEVEL_INFO[l].label}: ${LEVEL_INFO[l].cta}`).join("\n")}

The hooks they will close (the CTA follows any meat, so it never refers back to a specific line):
${req.hooks.map((h) => `- [${h.id} · N${h.level}] ${h.text}`).join("\n") || "- (none approved yet)"}

No invented deadline, discount or scarcity: if the offer gives none, the urgency is the benefit of starting today. Give every CTA its onScreenText, visualPrompt and videoPrompt, same presenter and setting.`,
    CtasWireSchema,
  );
}

export function analyzeClip(series: string, offer: Offer, transcript: string, name: string): Promise<ClipAnalysisWire> {
  return ask(
    series,
    offer,
    null,
    `A previous ad was uploaded ("${name}"). Its transcript, with timestamps where available:

${transcript}

Split it into Hook (usually the first 3–5 seconds), Meat and CTA. Label the hook's awareness level (1–5), angle and formula, and the meat's format (${MEAT_FORMATS.join(", ")}). Quote the words as heard. Say in one or two lines why it works or fails.`,
    ClipAnalysisWireSchema,
  );
}

export function reviewRun(series: string, offer: Offer, hooks: Hook[], meats: Meat[], ctas: Cta[]): Promise<ReviewWire> {
  const line = (p: Hook | Meat | Cta) =>
    `- ${p.id} (${p.kind}${p.kind === "hook" ? ` N${p.level} ${p.angle}/${p.formula}` : ` N${p.levels.join(",")}${p.kind === "meat" ? ` ${p.format}` : ""}`}): ${p.text}`;
  return ask(
    series,
    offer,
    null,
    `Review this run before it is rendered. Code will combine every hook with every meat and CTA of its level.

Hooks:
${hooks.map(line).join("\n") || "- none"}

Meats:
${meats.map(line).join("\n") || "- none"}

CTAs:
${ctas.map(line).join("\n") || "- none"}

Flag: promises the ad platforms usually reject (health, money, body results, guarantees); hooks that are near-duplicates (same idea in other words); meats that cannot follow a hook of their levels (they refer back, repeat it, or contradict it); claims the offer and "${WORKS_TODAY}" do not back. For each flag give the piece id and a rewrite. Empty flags if the run is clean.`,
    ReviewWireSchema,
  );
}

export function writeCopies(series: string, offer: Offer, pairs: { key: string; hook: string; cta: string; level: Level }[]): Promise<CopiesWire> {
  return ask(
    series,
    offer,
    null,
    `Write the platform texts for these ads (one per hook + CTA pair, keyed as given): the primary text (1–3 sentences, postable as is, built from the hook's problem and the CTA's action; never "excited to share" or generic SaaS lines), a headline of up to 40 characters, and the button from this list: ${BUTTONS.join(", ")}. Spanish (Rioplatense). Levels 1–3 run cold, 4–5 to people who know the brand.

${pairs.map((p) => `- ${p.key} (N${p.level})\n  Hook: ${p.hook}\n  CTA: ${p.cta}`).join("\n")}`,
    CopiesWireSchema,
  );
}

// ── Sample mode (no AI key): fixed examples that show the shape of each step ───────
const SAMPLE_HOOKS: Record<Level, [string, string, string][]> = {
  1: [
    ["¿Sabés cuántas veces abriste la heladera hoy sin encontrar nada?", "pain", "question"],
    ["Tres de cada diez cosas que compraste esta semana se van a tirar.", "myth", "number"],
    ["Dejá de anotar en el papel pegado en la heladera.", "pain", "stop"],
  ],
  2: [
    ["¿Otra vez el proveedor cerró antes de que armes el pedido?", "pain", "question"],
    ["Antes: inventario a ojo. Después: la góndola llena a las seis.", "desire", "beforeAfter"],
    ["Cuarenta en el sistema, tres en la góndola. ¿Cuál miente?", "curiosity", "number"],
  ],
  3: [
    ["Dejá de pagar una planilla que nadie actualiza.", "objection", "stop"],
    ["Hay sistemas que avisan. Este pide por vos.", "desire", "beforeAfter"],
    ["¿Y si el pedido se armara solo mientras cerrás caja?", "curiosity", "question"],
  ],
  4: [
    ["«No tengo tiempo de cargar todo»: eso dijo Marta, y lo cargó en una tarde.", "objection", "beforeAfter"],
    ["Lo probaste en la cabeza mil veces. Probalo en el local.", "objection", "stop"],
    ["¿Qué pasa el primer lunes con el sistema puesto?", "curiosity", "question"],
  ],
  5: [
    ["Hasta el viernes, el primer mes no se paga.", "proof", "number"],
    ["Ya lo conocés. Solo falta que lo prendas hoy.", "desire", "stop"],
    ["¿Cuánto te costó esta semana no tenerlo?", "pain", "question"],
  ],
};

export function sampleHooks(req: HookRequest): HooksWire {
  const hooks: HooksWire["hooks"] = [];
  const perLevel = Math.ceil(req.count / req.levels.length);
  for (const level of req.levels) {
    for (let i = 0; i < perLevel && hooks.length < req.count; i++) {
      const [text, angle, formula] = SAMPLE_HOOKS[level][i % 3];
      hooks.push({
        text: i >= 3 ? `${text} (variante ${Math.floor(i / 3) + 1})` : text,
        level,
        angle,
        formula,
        onScreenText: level <= 3 ? "La góndola a las 6" : "El primer lunes",
        visualPrompt: "A woman in her forties behind the counter of a small corner store at dusk, phone camera, direct flash, visible pores, shelves half empty behind her, one frozen moment, no text.",
        videoPrompt: "She looks up from the counter straight at the camera and raises an eyebrow; handheld phone, slight shake, no speech, no music.",
      });
    }
  }
  return { hooks, note: "Hooks de muestra: sin clave de IA. Cargá una en Modelos para escribir los de verdad." };
}

export function sampleMeats(req: MeatRequest): MeatsWire {
  const formats = req.formats.length ? req.formats : (["education", "demo", "testimonial"] as MeatFormat[]);
  const meats = Array.from({ length: req.count }, (_, i) => {
    const format = formats[i % formats.length];
    return {
      format,
      levels: req.levels.slice(0, 3).map(Number),
      text:
        format === "demo"
          ? "Se abre la app, se toca el pedido del día y aparece armado con lo que faltó ayer. Un vistazo, un toque, listo."
          : format === "testimonial"
            ? "«Antes cerraba a las nueve y seguía contando. Ahora cierro a las nueve.» Eso dijo una dueña después de un mes."
            : format === "story"
              ? "Lunes. Marta abre, mira la góndola del pan y ya sabe qué pedir, porque el sistema lo contó anoche mientras ella dormía."
              : format === "faceless"
                ? "Una planilla en papel, un ticket arrugado y una app abierta. Solo una de las tres sabe cuánto queda."
                : "La mitad de lo que se tira no se vendió porque no estaba: se pidió tarde. Pedir a tiempo no es memoria, es dato.",
      onScreenText: "Pedir a tiempo",
      visualPrompt: "Close-up of hands holding a phone over a shop counter, a paper order list beside it, phone camera, direct flash, grain, one frozen moment, no text on the screen.",
      videoPrompt: "The thumb taps once and the hand lifts the phone slightly; handheld, slight shake, no speech, no music.",
    };
  });
  return { meats, note: "Meats de muestra: sin clave de IA." };
}

export function sampleCtas(req: CtaRequest): CtasWire {
  const ctas = Array.from({ length: req.count }, (_, i) => ({
    text: i === 0 ? "Probalo gratis hoy: en diez segundos tenés el pedido de mañana." : i === 1 ? "Escribinos ahora y te lo mostramos en tu local esta semana." : "Seguinos para ver cómo lo usa un local real cada lunes.",
    levels: req.levels.map(Number),
    what: i === 0 ? "Probarlo" : i === 1 ? "Escribir" : "Seguir",
    why: i === 0 ? "El pedido de mañana armado" : i === 1 ? "Verlo en tu local" : "Ver cómo lo usan",
    when: i === 0 ? "Hoy" : i === 1 ? "Ahora" : "Cada lunes",
    easy: i === 0 ? "Gratis, diez segundos" : i === 1 ? "Un mensaje" : "Un toque",
    onScreenText: i === 0 ? "Gratis · 10 segundos" : i === 1 ? "Escribinos" : "Seguinos",
    visualPrompt: "The same woman behind the counter smiling slightly, holding the phone up towards the camera, phone camera, direct flash, visible pores, one frozen moment, no text.",
    videoPrompt: "She nods once and tilts the phone a little towards the lens; handheld, slight shake, no speech, no music.",
  }));
  return { ctas, note: "CTAs de muestra: sin clave de IA." };
}

export function sampleAnalysis(transcript: string): ClipAnalysisWire {
  const plain = transcript.replace(/\[[^\]]*\]\s*/g, "");
  const sentences = plain.split(/(?<=[.!?…])\s+/).filter(Boolean);
  return {
    hook: sentences[0] ?? plain.slice(0, 120),
    meat: sentences.slice(1, -1).join(" ") || plain,
    cta: sentences.length > 2 ? sentences[sentences.length - 1] : "",
    hookEndsAt: 4,
    level: 2,
    format: "education",
    angle: "pain",
    formula: /\?/.test(sentences[0] ?? "") ? "question" : "stop",
    note: "Catálogo de muestra: sin clave de IA, se cortó por oraciones.",
  };
}

export function sampleCopies(pairs: { key: string; hook: string; cta: string }[]): CopiesWire {
  return {
    copies: pairs.map((p) => ({
      key: p.key,
      primary: `${p.hook} ${p.cta}`.slice(0, 300),
      headline: p.cta.split(/[:.,]/)[0].slice(0, 40) || "Probalo hoy",
      button: "Más información",
    })),
  };
}

export const ALL_LEVELS: Level[] = [...LEVELS];
