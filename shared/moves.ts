// The playbook's moves (PLAYBOOK.md §2.5) as data. Each topic of a story says which moves it really uses on screen;
// the app shows them per topic, counts them per piece and across the series (the writers' room), and the checks ask
// for a Turn and a Button. Hook variants name the move they lean on.

export const MOVES = [
  "clipDrop",
  "contradiction",
  "slowReaction",
  "escalator",
  "turn",
  "button",
  "curiosityGap",
  "fieldVisit",
  "callback",
  "remoteStandup",
] as const;
export type Move = (typeof MOVES)[number];

export const MOVE_LABEL: Record<Move, string> = {
  clipDrop: "Clip Drop",
  contradiction: "Contradicción",
  slowReaction: "Reacción lenta",
  escalator: "Escalera",
  turn: "Giro",
  button: "Botón",
  curiosityGap: "Brecha de curiosidad",
  fieldVisit: "Visita de campo",
  callback: "Callback",
  remoteStandup: "Corresponsal",
};

// One line each, in Spanish, for the chips' tooltips.
export const MOVE_HINT: Record<Move, string> = {
  clipDrop: "Abre con el objeto real, sin presentación: la góndola vacía, la pared húmeda.",
  contradiction: "Dicen X; acá los vemos haciendo Y.",
  slowReaction: "Deja que lo absurdo respire un momento antes del chiste.",
  escalator: "Tres golpes del mismo problema, cada uno peor y más concreto.",
  turn: "Se cae la ironía: una línea sincera sobre lo que le cuesta a alguien.",
  button: "La última línea, corta, que vuelve al gancho.",
  curiosityGap: "La apertura promete algo que hay que ver hasta el final.",
  fieldVisit: "Ir adonde está la gente y dejarla hablar.",
  callback: "Se planta temprano y se paga después.",
  remoteStandup: "Un corresponsal en el lugar escala lo absurdo y vuelve al problema real.",
};

// For the writer: the move ids with what each one is, in the schema's description and the prompts.
export const MOVES_FOR_WRITER =
  "clipDrop (open on the real artifact, no setup), contradiction (they say X, here they do Y), slowReaction (let the absurd thing sit before the joke), escalator (three beats of the same pain, each worse and more specific), turn (the irony drops: one plain, sincere line about what it costs someone), button (a short last line that calls back to the hook), curiosityGap (the open promises a payoff the viewer must stay for), fieldVisit (go where the people are and let them talk), callback (plant early, pay off later), remoteStandup (a correspondent on location escalates, then snaps back to the real problem)";

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

// The ids, the English names of the playbook and the Spanish labels, squashed, all point to a move.
const ALIASES: Record<string, Move> = Object.fromEntries([
  ...MOVES.map((m) => [squash(m), m] as const),
  ...MOVES.map((m) => [squash(MOVE_LABEL[m]), m] as const),
  ["theclipdrop", "clipDrop"],
  ["thecontradiction", "contradiction"],
  ["theslowreaction", "slowReaction"],
  ["theescalator", "escalator"],
  ["theturn", "turn"],
  ["thebutton", "button"],
  ["thecuriositygap", "curiosityGap"],
  ["thefieldvisit", "fieldVisit"],
  ["thecallback", "callback"],
  ["remotestandup", "remoteStandup"],
  ["theremotestandup", "remoteStandup"],
  ["correspondent", "remoteStandup"],
  ["escalada", "escalator"],
]);

// The writer's strings as moves: known names only, each once, in the playbook's order.
export function pickMoves(values: readonly string[] | undefined): Move[] {
  const found = new Set<Move>();
  for (const v of values ?? []) {
    const m = ALIASES[squash(v)];
    if (m) found.add(m);
  }
  return MOVES.filter((m) => found.has(m));
}

export function pickMove(value: string): Move | null {
  return ALIASES[squash(value)] ?? null;
}

// How many topics (or pieces) use each move.
export function moveCounts(lists: readonly (readonly Move[])[]): Record<Move, number> {
  const counts = Object.fromEntries(MOVES.map((m) => [m, 0])) as Record<Move, number>;
  for (const list of lists) for (const m of new Set(list)) counts[m]++;
  return counts;
}
