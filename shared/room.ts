// The writers' room across saved pieces of one series.
// A tease is planted for a later episode. It is not an open loop of the piece that plants it.
// A runner is one concrete bit that lands in the opening, the middle and the tag, and changes each time.
// Canon is a fact later episodes treat as already true.
import { MOVES, MOVE_LABEL, moveCounts, pickMoves, type Move } from "./moves.ts";

export type RoomCard = {
  id: string;
  updatedAt: string;
  problem: string;
  title: string;
  tease: string;
  open: string[];
  canon: string[];
  runner: string;
  paid: string[];
  // The playbook moves the piece used (any topic), so the series sees which ones it leans on.
  moves: Move[];
};

type LooseStory = {
  problem?: string;
  title?: string;
  tease?: string;
  callbacks?: { planted?: string; payoff?: string }[];
  loops?: { question?: string; closed?: boolean }[];
  canon?: { fact?: string }[];
  runner?: { bit?: string };
  topics?: { moves?: string[] }[];
};

export function clipText(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

// One card per saved story. Pieces with no story (a brief, a lyric video) contribute nothing.
export function storyCard(id: string, updatedAt: string, story: LooseStory | null | undefined): RoomCard | null {
  if (!story || typeof story !== "object") return null;
  const problem = clipText(story.problem || story.title || "", 120);
  if (!problem) return null;
  return {
    id,
    updatedAt,
    problem,
    title: story.problem && story.title ? clipText(story.title, 120) : "",
    tease: clipText(story.tease || ""),
    open: (story.loops ?? [])
      .filter((l) => l && l.closed === false && (l.question || "").trim())
      .map((l) => clipText(l.question || ""))
      .slice(0, 4),
    canon: (story.canon ?? [])
      .map((c) => clipText(c?.fact || ""))
      .filter(Boolean)
      .slice(0, 3),
    runner: clipText(story.runner?.bit || "", 120),
    paid: (story.callbacks ?? [])
      .map((c) => clipText(c?.payoff || ""))
      .filter(Boolean)
      .slice(0, 2),
    moves: pickMoves((story.topics ?? []).flatMap((t) => (Array.isArray(t?.moves) ? t.moves : []))),
  };
}

// Moves used by more than half the pieces of the series (at least three pieces): the series leans on them.
export function overusedMoves(cards: Pick<RoomCard, "moves">[]): { move: Move; label: string; pieces: number }[] {
  if (cards.length < 3) return [];
  const counts = moveCounts(cards.map((c) => c.moves ?? []));
  return MOVES.filter((m) => counts[m] > cards.length / 2).map((m) => ({ move: m, label: MOVE_LABEL[m], pieces: counts[m] }));
}

// What the writer sees. Empty when this is the first piece.
export function roomBrief(cards: RoomCard[]): string {
  if (cards.length === 0) return "";
  // Moves the other pieces keep using (the Turn and the Button are in every piece on purpose).
  const leaning = overusedMoves(cards).filter((m) => m.move !== "turn" && m.move !== "button");
  const moves = leaning.length
    ? `\nMoves most earlier pieces already lean on (open or escalate differently this time): ${leaning.map((m) => `${m.move} (${m.pieces} of ${cards.length})`).join(", ")}.`
    : "";
  return cards
    .slice(0, 8)
    .map((c) => {
      const bits = [
        c.tease && `Still hanging (pay it, or move it one step; do not open it as if it were new): ${c.tease}`,
        c.open.length && `Open loops (pay one only when it is this episode's problem): ${c.open.join(" | ")}`,
        c.canon.length && `Already true for the audience: ${c.canon.join(" | ")}`,
        c.runner && `Runner already used (invent a different bit): ${c.runner}`,
        c.paid.length && `Already paid off: ${c.paid.join(" | ")}`,
      ].filter(Boolean);
      return `- “${c.problem}”${c.title ? ` (hook: ${c.title})` : ""}\n  ${bits.join("\n  ") || "Nothing left open."}`;
    })
    .join("\n")
    .concat(moves);
}

export function retakeTease(card: RoomCard): string {
  return `En “${card.problem}” quedó para el próximo: ${card.tease}. En esta pieza retomalo: o lo pagás, o lo movés un paso.`;
}

export function retakeLoop(card: RoomCard, question: string): string {
  return `En “${card.problem}” quedó sin pagar: ${question}. Si es el problema de esta pieza, pagalo. Si no entra, no lo menciones.`;
}

export function retakeCanon(fact: string, episode = ""): string {
  const where = episode ? `En “${episode}” ` : "";
  return `${where}el público ya lo vio y en la serie es verdad: ${fact}. Arrancá como si ya hubiera pasado.`;
}

export function retakeRunner(card: RoomCard): string {
  return `El corredor de “${card.problem}” ya se usó (${card.runner}). Esta pieza lleva otro bit, concreto, que caiga tres veces y cambie.`;
}
