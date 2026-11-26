// The checks that gate each approval. The writer grades its own story and board; these turn that grading
// into a list of problems. A problem blocks approval until it is fixed ("Arreglalo") or the person dismisses it.
import type { Board, Brief, Story } from "./schema.ts";
import type { CastKind } from "./series.ts";
import { MOVE_LABEL } from "./moves.ts";
import { SEGMENT_MOVE, segmentOf } from "./segment.ts";
import { PRACTICES } from "./series.ts";
import { funnelProblems, isFloor, type FunnelFacts } from "./funnel.ts";
import { elementProblems } from "./hookElements.ts";

export type Problem = {
  id: string;
  // What failed, for the person.
  label: string;
  detail: string;
  // The shot it belongs to, from 0, when there is one.
  shot?: number;
};

// Words a runner landing claims are spoken. «», “” and straight quotes all count.
function quoted(text: string): string[] {
  const out: string[] = [];
  const re = /«([^»]{2,})»|“([^”]{2,})”|"([^"]{2,})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const q = (m[1] || m[2] || m[3] || "").replace(/\s+/g, " ").trim();
    if (q) out.push(q);
  }
  return out;
}

export type RunnerLanding = {
  where: "Arranque" | "Medio" | "Cierre";
  text: string;
  quotes: string[];
  // A quoted phrase from this landing is in a spoken line.
  hit: boolean;
  // The same quoted phrase is also another landing.
  same: boolean;
};

export function runnerInUse(story: Pick<Story, "runner">): boolean {
  const runner = story.runner;
  return Boolean(runner && [runner.bit, runner.open, runner.middle, runner.tag].some((s) => (s ?? "").trim()));
}

// The three landings, and whether each one is actually said. Empty when the piece has no runner.
export function runnerLandings(story: Pick<Story, "runner" | "topics">): RunnerLanding[] {
  const runner = story.runner;
  if (!runner || !runnerInUse(story)) return [];
  const said = (story.topics ?? [])
    .flatMap((t) => t.lines.map((l) => l.text))
    .join("\n")
    .toLowerCase();
  const raw = [
    ["Arranque", runner.open],
    ["Medio", runner.middle],
    ["Cierre", runner.tag],
  ] as const;
  const quotes = raw.map(([, text]) => quoted(text ?? ""));
  const keys = quotes.map((qs) => qs.map((q) => q.toLowerCase()).sort().join("|"));
  return raw.map(([where, text], i) => ({
    where,
    text: text ?? "",
    quotes: quotes[i],
    hit: quotes[i].some((q) => said.includes(q.toLowerCase())),
    same: Boolean(keys[i]) && keys.some((key, j) => j !== i && key === keys[i]),
  }));
}

// PLAYBOOK §6: never the show's name, its people or the shows around it, in a line, a title or a prompt. The writer is
// told so; this catches it anyway.
const BORROWED = [
  "daily show",
  "jon stewart",
  "saturday night live",
  "snl",
  "colbert",
  "comedy central",
  "crossfire",
  "jordan klepper",
  "ronny chieng",
  "josh johnson",
  "michael kosta",
  "desi lydic",
  "troy iwata",
  "grace kuhlenschmidt",
  "fingers the pulse",
];
export function borrowedNames(text: string): string[] {
  const t = ` ${text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `;
  return BORROWED.filter((name) => new RegExp(`[^a-z]${name.replace(/ /g, "\\s+")}[^a-z]`).test(t));
}

function storyText(story: Story): string {
  return [
    story.problem,
    story.title,
    story.logline,
    story.close,
    ...story.topics.flatMap((t) => [t.title, t.bridge, ...t.lines.flatMap((l) => [l.text, l.direction])]),
    ...story.characters.flatMap((c) => [c.name, c.identity]),
  ].join("\n");
}

export function storyProblems(
  story: Story,
  brief?: Partial<Pick<Brief, "narrator" | "segment" | "piece">>,
  // Runners already used by other pieces of the series. The open piece is not in this list.
  usedRunners: { bit: string; problem: string }[] = [],
  // The funnel, when this piece has one. Omitted: the same list as before.
  facts?: FunnelFacts,
): Problem[] {
  const problems: Problem[] = [];
  // A piece without a narrator: no line may be the narrator's.
  if (brief?.narrator === "without") {
    const narrators = new Set(story.characters.filter((c) => c.role === "narrator").map((c) => c.id));
    const lines = story.topics.flatMap((t) => t.lines).filter((l) => narrators.has(l.speaker));
    if (lines.length)
      problems.push({
        id: `sin-narrador:${lines.length}`,
        label: "Sin narrador",
        detail: `La pieza es sin narrador y el narrador dice ${lines.length === 1 ? "una línea" : `${lines.length} líneas`} ("${lines[0].text.slice(0, 60)}"). Que lo cuenten los personajes, la acción o el texto en pantalla.`,
      });
  }
  story.checklist.forEach((c, i) => {
    if (!c.pass) problems.push({ id: `check:${i}:${c.item}`, label: c.item, detail: c.note });
  });
  story.loops.forEach((l, i) => {
    if (!l.closed)
      problems.push({
        id: `loop:${i}:${l.question}`,
        label: "Loop abierto",
        detail: `${l.question} (se abre en ${l.opens}; nunca se cierra)`,
      });
  });
  // A runner lands three times, and each landing quotes words that are actually said. An empty runner is allowed.
  const runner = story.runner;
  if (runner && runnerInUse(story)) {
    if (!(runner.bit ?? "").trim()) {
      problems.push({
        id: "corredor:bit",
        label: "El corredor",
        detail: "Tiene caídas y no tiene bit. Nombrá el objeto, la frase o el gesto que vuelve.",
      });
    }
    const lands = runnerLandings(story);
    for (const land of lands) {
      if (!land.text.trim() || land.quotes.length === 0) {
        problems.push({
          id: `corredor:${land.where}`,
          label: "El corredor",
          detail: `${land.where} no cita, entre «», palabras que alguien dice. El corredor cae en una línea.`,
        });
        continue;
      }
      if (!land.hit) {
        problems.push({
          id: `corredor:${land.where}:${land.quotes[0]}`,
          label: "El corredor",
          detail: `${land.where} cita “${land.quotes[0]}” y esa frase no está en ninguna línea.`,
        });
      }
    }
    if (lands.some((land) => land.same)) {
      problems.push({
        id: "corredor:igual",
        label: "El corredor",
        detail: "Cae igual más de una vez. Cada caída cambia el bit.",
      });
    }
    const bit = (runner.bit ?? "").trim().toLowerCase();
    const prior = bit ? usedRunners.filter((u) => u.bit.trim().toLowerCase() === bit) : [];
    if (prior.length) {
      problems.push({
        id: `corredor:repetido:${bit}`,
        label: "El corredor",
        detail: `“${(runner.bit ?? "").trim()}” ya lo usó ${prior.map((p) => `“${p.problem}”`).join(", ")}. Esta pieza lleva otro bit.`,
      });
    }
  }
  story.seriesLoop.forEach((s, i) => {
    if (s.appears && !s.complete)
      problems.push({
        id: `serie:${i}:${s.step}`,
        label: `Loop de la serie: ${s.step}`,
        detail: `Aparece pero no se muestra completo (dolor → paso → resultado). ${s.note}`,
      });
  });
  story.claims.forEach((c, i) => {
    if (!c.real && !c.concept)
      problems.push({
        id: `real:${i}:${c.claim}`,
        label: "No existe hoy",
        detail: `${c.claim}. No está en "Lo que existe hoy" y la historia lo muestra como real. ${c.note}`,
      });
  });
  // PLAYBOOK §3 rule 1: the customer is the hero, so the brand (the Good) never says the first line.
  const first = story.topics[0]?.lines[0];
  const opener = first && story.characters.find((c) => c.id === first.speaker);
  if (opener?.role === "good") {
    problems.push({
      id: "cliente-heroe",
      label: "Cliente héroe",
      detail: `La pieza la abre ${opener.name}, la marca ("${first.text.slice(0, 60)}"). Que arranque el dolor o la persona; la marca entra después.`,
    });
  }
  const borrowed = borrowedNames(storyText(story));
  if (borrowed.length) {
    problems.push({
      id: `prestado:${borrowed.join(",")}`,
      label: "Nada prestado",
      detail: `Nombra ${borrowed.map((b) => `"${b}"`).join(", ")}: se toma la estructura del programa, nunca su nombre ni su gente.`,
    });
  }
  // The playbook's moves (§2.5): every piece has a Turn and ends on a Button. Stories written before the moves were
  // data have none tagged and are not judged on them.
  const tagged = story.topics.flatMap((t) => t.moves ?? []);
  if (tagged.length) {
    if (!tagged.includes("turn"))
      problems.push({
        id: "jugada:giro",
        label: `Sin ${MOVE_LABEL.turn}`,
        detail: "Ningún tema tiene el Giro: una línea sincera, sin ironía, sobre lo que el problema le cuesta a alguien.",
      });
    if (!tagged.includes("button"))
      problems.push({
        id: "jugada:boton",
        label: `Sin ${MOVE_LABEL.button}`,
        detail: "Ningún tema cierra con el Botón: la última línea, corta, que vuelve al gancho.",
      });
    // The brief's format puts its own move on screen: the correspondent's report, or the visit.
    const segment = segmentOf(brief);
    const move = SEGMENT_MOVE[segment];
    if (move && !tagged.includes(move))
      problems.push({
        id: `jugada:${move}`,
        label: `Sin ${MOVE_LABEL[move]}`,
        detail:
          segment === "correspondent"
            ? "La pieza es «Con corresponsal» y ningún tema corta al corresponsal en el lugar, que escala lo absurdo y vuelve al problema real."
            : "La pieza es «Visita de campo» y ningún tema va adonde está la gente ni la deja hablar.",
      });
  }
  (story.practices ?? []).forEach((p, i) => {
    if (!p.known)
      problems.push({
        id: `practica:${i}:${p.practice}`,
        label: "¿Pasa así de verdad?",
        detail: `${p.practice.replace(/\.+$/, "")}. No está en "${PRACTICES}" de la serie ni en las notas del brief. ${p.note}`,
      });
  });
  if (facts && isFloor(facts.floor)) {
    const spoken = story.topics.flatMap((t) => t.lines.map((l) => l.text));
    problems.push(
      ...funnelProblems({
        floor: facts.floor,
        proofs: facts.proofs,
        landing: facts.landing,
        proofOk: facts.proofOk,
        brandName: facts.brandName,
        brandSpeaksFirst: opener?.role === "good",
        openingText: first?.text ?? "",
        sellText: [story.close, ...spoken].join("\n"),
      }),
    );
  }
  problems.push(...elementProblems(story.hookElements, { shot: 0 }));
  return problems;
}

const KIND_LABEL: Record<string, string> = {
  continuity: "Continuidad",
  reality: "No existe hoy",
  practice: "¿Pasa así de verdad?",
  image: "Imagen con más de un momento",
  loop: "Loop abierto",
  hook: "Gancho en 2 s",
  product: "El producto en uso",
};

// The video's part of the checklist (PLAYBOOK §7.4), measured on the board itself. castKinds: the series' cast by id,
// to know which setups are the product or a real screen; without them the product check is left to the writer.
export function boardChecks(board: Board, castKinds: Record<string, CastKind> = {}): Problem[] {
  const problems: Problem[] = [];
  const first = board.shots[0];
  if (first) {
    if (first.beat !== "negative") {
      problems.push({ id: "gancho:dolor", label: "Gancho en 2 s · toma 1", detail: "La primera toma no es el dolor: los primeros 2 segundos tienen que mostrarlo o nombrarlo.", shot: 0 });
    } else if (!first.voiceover.trim() && !first.onScreenText.trim()) {
      problems.push({
        id: "gancho:mudo",
        label: "Gancho en 2 s · toma 1",
        detail: "La primera toma no tiene línea ni headline: en los primeros 2 segundos nada dice cuál es el problema.",
        shot: 0,
      });
    }
  }
  const showable = new Set(Object.entries(castKinds).filter(([, k]) => k === "product" || k === "screen").map(([id]) => id));
  if (showable.size) {
    const inUse = board.shots.some(
      (s) =>
        s.beat === "good" &&
        (s.kind === "screen" || (s.kind === "transform" && Boolean(s.screenAt)) || s.setups.some((id) => showable.has(board.setups.find((x) => x.id === id)?.castId ?? ""))),
    );
    if (!inUse) {
      problems.push({
        id: "producto-en-uso",
        label: "El producto en uso",
        detail: "Ninguna toma del Bueno muestra el producto haciendo su trabajo: una pantalla real o el producto del elenco en cuadro.",
      });
    }
  }
  const borrowed = borrowedNames(board.shots.flatMap((s) => [s.title, s.action, s.voiceover, s.onScreenText, s.visualPrompt, s.videoPrompt]).join("\n"));
  if (borrowed.length) {
    problems.push({ id: `prestado-board:${borrowed.join(",")}`, label: "Nada prestado", detail: `El storyboard nombra ${borrowed.map((b) => `"${b}"`).join(", ")}.` });
  }
  return problems;
}

export function boardProblems(board: Board, castKinds: Record<string, CastKind> = {}, facts?: FunnelFacts): Problem[] {
  const problems = [...boardChecks(board, castKinds), ...boardIssueProblems(board), ...elementProblems(board.hookElements, { shot: 0 })];
  if (!facts || !isFloor(facts.floor)) return problems;
  problems.push(...funnelProblems(facts));
  return problems;
}

function boardIssueProblems(board: Board): Problem[] {
  return board.issues.map((issue, i) => {
    const kind = Object.keys(KIND_LABEL).find((k) => issue.kind.toLowerCase().includes(k));
    const shot = issue.shot > 0 && issue.shot <= board.shots.length ? issue.shot - 1 : undefined;
    return {
      id: `board:${i}:${issue.note}`,
      label: `${kind ? KIND_LABEL[kind] : "Problema"}${shot === undefined ? "" : ` · toma ${shot + 1}`}`,
      detail: issue.note,
      shot,
    };
  });
}

// A director's note that asks the writer to fix the listed problems.
export function fixNote(problems: Problem[]): string {
  return `Arreglá estos problemas que marcó el check, sin cambiar lo que funciona:\n${problems
    .map((p) => `- ${p.label}: ${p.detail}`)
    .join("\n")}`;
}

// An image is one frozen moment. Words that describe change over time belong in the video prompt.
const ACTION_WORDS = [
  "now",
  "then",
  "afterwards",
  "after that",
  "later",
  "suddenly",
  "slowly",
  "begins to",
  "starts to",
  "turns into",
  "becomes",
  "reaches in",
  "reaches out",
  "lifts",
  "picks up",
  "walks",
  "moves",
  "falls",
  "opens the",
  "closes the",
];

// With a series look, prompts ask for flaws; these words ask for the polished fake look instead.
const POLISH_WORDS = ["cinematic", "vintage", "film still", "hyperrealistic", "8k", "masterpiece", "flawless", "airbrushed"];
export function polishWords(prompt: string): string[] {
  const text = prompt.toLowerCase();
  return POLISH_WORDS.filter((w) => text.includes(w));
}

export function actionWords(prompt: string): string[] {
  const text = ` ${prompt.toLowerCase()} `;
  return ACTION_WORDS.filter((w) => new RegExp(`[^a-z]${w.replace(/ /g, "\\s+")}[^a-z]`).test(text));
}
