// Embudo: three floors on top of awareness levels 1–5. A missing floor means today's behaviour.
// This file does not import the ads module (that module already exports levelsOf for a chosen list).

export const FLOORS = ["arriba", "medio", "abajo"] as const;
export type Floor = (typeof FLOORS)[number];

export type FloorInfo = {
  id: Floor;
  label: string;
  purpose: string;
  levels: readonly number[];
  angles: readonly string[];
  formulas: readonly string[];
  cta: string;
  seconds: number;
  range: string;
};

export const FLOOR_INFO: Record<Floor, FloorInfo> = {
  arriba: {
    id: "arriba",
    label: "Descubrir",
    purpose: "Que reconozca el problema, todavía sin la marca.",
    levels: [1, 2],
    angles: ["pain", "curiosity", "myth"],
    formulas: ["question", "stop"],
    cta: "seguir, guardar o compartir",
    seconds: 45,
    range: "30 a 60 s",
  },
  medio: {
    id: "medio",
    label: "Considerar",
    purpose: "Que compare y vea cómo funciona, todavía sin comprar.",
    levels: [3],
    angles: ["desire", "objection"],
    formulas: ["beforeAfter", "number"],
    cta: "ver cómo funciona o guardar",
    seconds: 45,
    range: "30 a 60 s",
  },
  abajo: {
    id: "abajo",
    label: "Decidir",
    purpose: "Que pruebe, compre o escriba, solo con una oferta real.",
    levels: [4, 5],
    angles: ["proof", "objection"],
    formulas: ["beforeAfter", "stop"],
    cta: "probar, comprar o escribir",
    seconds: 15,
    range: "15 s",
  },
};

export function isFloor(value: unknown): value is Floor {
  return value === "arriba" || value === "medio" || value === "abajo";
}

/** The awareness levels that sit on this floor. Not the ads helper that turns [] into all five. */
export function levelsOf(floor: Floor): number[] {
  return [...FLOOR_INFO[floor].levels];
}

export function floorOf(level: number): Floor | null {
  if (level === 1 || level === 2) return "arriba";
  if (level === 3) return "medio";
  if (level === 4 || level === 5) return "abajo";
  return null;
}

// A floor only when the set is exactly that floor's levels. [] is every level, so it is no floor.
export function exactFloor(levels: readonly number[]): Floor | null {
  const set = [...new Set(levels.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  for (const floor of FLOORS) {
    const want = [...FLOOR_INFO[floor].levels].sort((a, b) => a - b);
    if (set.length === want.length && set.every((n, i) => n === want[i])) return floor;
  }
  return null;
}

// True when every given level sits on the floor. An empty list is every level, so it is not covered.
export function floorCovers(floor: Floor | null | undefined, levels: readonly number[]): boolean {
  if (!isFloor(floor) || levels.length === 0) return false;
  const own = new Set(FLOOR_INFO[floor].levels);
  return levels.every((n) => own.has(n));
}

// One tag when every level maps to the same floor. A meat that spans two floors has none.
export function tagFloor(levels: readonly number[]): Floor | null {
  if (!levels.length) return null;
  let found: Floor | null = null;
  for (const level of levels) {
    const floor = floorOf(level);
    if (!floor) return null;
    if (found && found !== floor) return null;
    found = floor;
  }
  return found;
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const HARD_SELL = /compr[aá]\s+ya|descuento|oferta\s+por\s+tiempo|[uú]ltimas\s+unidades|\d+\s*%|\$\s?\d/i;

export function hardSell(text: string): boolean {
  return HARD_SELL.test(text);
}

// The opening names the brand before the pain. A mention later in the line does not count.
export function namesBrandFirst(text: string, brand: string): boolean {
  const name = fold(brand).trim();
  if (!name) return false;
  const opening = fold(text).trim();
  if (!opening.startsWith(name)) return false;
  const next = opening.charAt(name.length);
  return next === "" || !/[a-z0-9]/.test(next);
}

export type FunnelFacts = {
  floor?: string | null;
  proofs?: readonly string[];
  landing?: string;
  proofOk?: boolean;
  brandName?: string;
  brandSpeaksFirst?: boolean;
  openingText?: string;
  sellText?: string;
};

export type FunnelProblem = { id: string; label: string; detail: string; shot?: number };

export function hasProof(facts: Pick<FunnelFacts, "proofs" | "landing" | "proofOk">): boolean {
  if (facts.proofOk) return true;
  if ((facts.proofs ?? []).some((p) => p.trim())) return true;
  return Boolean((facts.landing ?? "").trim());
}

export function funnelProblems(facts: FunnelFacts): FunnelProblem[] {
  if (!isFloor(facts.floor)) return [];
  const info = FLOOR_INFO[facts.floor];
  const problems: FunnelProblem[] = [];
  if (facts.floor === "abajo" && !hasProof(facts)) {
    problems.push({
      id: "embudo:prueba",
      label: "Abajo sin prueba",
      detail: `El piso Abajo (Decidir) pide una oferta real: falta una prueba confirmada o una oferta real. Confirmá una prueba o una landing, o cambiá de piso.`,
    });
  }
  if (facts.floor === "arriba" && hardSell(facts.sellText ?? "")) {
    problems.push({
      id: "embudo:venta",
      label: "Venta dura en Descubrir",
      detail: `El piso Arriba (${info.label}) no vende: el texto pide comprar, un precio o un descuento. En este piso el llamado es ${info.cta}.`,
    });
  }
  const opensWithBrand = Boolean(facts.brandSpeaksFirst) || namesBrandFirst(facts.openingText ?? "", facts.brandName ?? "");
  if (facts.floor === "arriba" && opensWithBrand) {
    problems.push({
      id: "embudo:marca",
      label: "La marca abre",
      detail: "En Arriba (Descubrir) los primeros 2 segundos nombran la marca antes del dolor. Que arranque el problema; la marca entra después.",
    });
  }
  return problems;
}

export function openFunnelProblems(
  piece: { funnel?: string | null; funnelDismissed?: readonly string[] | null; text?: string; onScreenText?: string },
  facts: { proofs?: readonly string[]; landing?: string; brandName?: string },
): FunnelProblem[] {
  if (!isFloor(piece.funnel)) return [];
  const dismissed = new Set(piece.funnelDismissed ?? []);
  return funnelProblems({
    floor: piece.funnel,
    proofs: facts.proofs,
    landing: facts.landing,
    brandName: facts.brandName,
    openingText: piece.text ?? "",
    sellText: `${piece.text ?? ""}\n${piece.onScreenText ?? ""}`,
  }).filter((p) => !dismissed.has(p.id));
}

// English, after the prompt cache, only when a floor is set.
export function funnelBlock(floor: Floor): string {
  const info = FLOOR_INFO[floor];
  const levels = info.levels.join(", ");
  const sell =
    floor === "abajo"
      ? "This floor is only with a real offer or a confirmed proof already in the materials. Do not invent a price, a discount or a deadline."
      : "Do not ask them to buy. Do not invent a price, a discount or a deadline.";
  return [
    `Funnel floor: ${floor} (${info.label}).`,
    `It covers awareness levels ${levels}.`,
    `Purpose: ${info.purpose}`,
    `Lean hooks toward angles ${info.angles.join(", ")} and formulas ${info.formulas.join(", ")}. Other angles and formulas stay available.`,
    `The story's Button and the explainer's caption use this kind of call: ${info.cta}.`,
    `Suggested length for an ad is ${info.seconds} s (${info.range}). An explainer uses about that length. A story stays a short and does not become an episode. A still is one picture. Do not change a length the person already chose.`,
    floor === "abajo"
      ? "Proof: at least one confirmed proof or a real offer already in the materials. If neither is there, do not invent one."
      : "Proof: do not treat an unconfirmed claim as real.",
    sell,
    `Each variant's awareness level is one of ${levels}.`,
  ].join(" ");
}

export type FloorCounts = Record<Floor, number>;

export function floorTally(floors: readonly (string | null | undefined)[]): FloorCounts {
  const counts: FloorCounts = { arriba: 0, medio: 0, abajo: 0 };
  for (const floor of floors) if (isFloor(floor)) counts[floor] += 1;
  return counts;
}

export function floorTallyLine(counts: FloorCounts): string {
  return `arriba ${counts.arriba} · medio ${counts.medio} · abajo ${counts.abajo}`;
}

// Null when nothing has a floor, so the screens that have never used one stay as they are.
export function shownTally(floors: readonly (string | null | undefined)[]): string | null {
  const counts = floorTally(floors);
  if (counts.arriba + counts.medio + counts.abajo === 0) return null;
  return floorTallyLine(counts);
}

export function floorTallyWriter(counts: FloorCounts): string {
  return `Saved pieces of this series already sit on these funnel floors (stories, explainers and stills; pieces with no floor are not counted): ${floorTallyLine(counts)}.`;
}

export function embudoMarkdown(floor: unknown): string {
  if (!isFloor(floor)) return "";
  const info = FLOOR_INFO[floor];
  return `\n**Embudo:** ${info.label} (${floor})\n`;
}
