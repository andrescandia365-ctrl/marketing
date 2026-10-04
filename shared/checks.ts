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

export function storyProblems(story: Story, brief?: Pick<Brief, "narrator">): Problem[] {
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
