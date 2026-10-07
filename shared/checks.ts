// The checks that gate each approval. The writer grades its own story and board; these turn that grading
// into a list of problems. A problem blocks approval until it is fixed ("Arreglalo") or the person dismisses it.
import type { Board, Brief, Story } from "./schema.ts";
import { PRACTICES } from "./series.ts";

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

export function storyProblems(
  story: Story,
  brief?: Pick<Brief, "narrator">,
  // Runners already used by other pieces of the series. The open piece is not in this list.
  usedRunners: { bit: string; problem: string }[] = [],
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
  (story.practices ?? []).forEach((p, i) => {
    if (!p.known)
      problems.push({
        id: `practica:${i}:${p.practice}`,
        label: "¿Pasa así de verdad?",
        detail: `${p.practice.replace(/\.+$/, "")}. No está en "${PRACTICES}" de la serie ni en las notas del brief. ${p.note}`,
      });
  });
  return problems;
}

const KIND_LABEL: Record<string, string> = {
  continuity: "Continuidad",
  reality: "No existe hoy",
  practice: "¿Pasa así de verdad?",
  image: "Imagen con más de un momento",
  loop: "Loop abierto",
};

export function boardProblems(board: Board): Problem[] {
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
