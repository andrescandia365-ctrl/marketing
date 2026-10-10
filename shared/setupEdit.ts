// Changing a setup's description once and carrying it into every shot's prompts.
// The writer repeats a setup's identity line word for word in every prompt with that setup (BoardWireSchema), but the
// prompts are its free text, so the new line replaces the old one where it is found and the shots where it is not
// are reported for a hand edit. Pure: the app keeps the returned edit to undo it.
import type { Board, Shot } from "./schema.ts";

// Every prompt of a shot that can describe a setup.
export const SETUP_PROMPT_FIELDS = ["visualPrompt", "middlePrompt", "endPrompt", "editPrompt", "videoPrompt"] as const;
export type SetupPromptField = (typeof SETUP_PROMPT_FIELDS)[number];

// Shorter descriptions would match unrelated words inside a prompt.
const MIN_MATCH = 8;

export type SetupIdentityEdit = {
  setupId: string;
  before: string;
  after: string;
  // Per shot index: each field it touched, as it was and as it was written.
  fields: Record<number, Partial<Record<SetupPromptField, { before: string; after: string }>>>;
  // Shots whose prompts now carry the new description.
  changed: number[];
  // Shots that list the setup (and have a prompt) where the old description was not found.
  missing: number[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The old line as a pattern: any run of spaces matches any other, the first letter may be a capital (the line often
// opens the prompt), and a trailing full stop or comma is left out, since the writer folds the line into a sentence.
export function identityPattern(identity: string): RegExp | null {
  const core = identity.trim().replace(/[\s.,;:]+$/, "");
  if (core.length < MIN_MATCH) return null;
  const first = core[0];
  const head = first.toLowerCase() !== first.toUpperCase() ? `[${first.toLowerCase()}${first.toUpperCase()}]` : escape(first);
  return new RegExp(head + core.slice(1).split(/\s+/).map(escape).join("\\s+"), "g");
}

// Where the old line opened a sentence with a capital, so does the new one (never lowered: it may open on a name).
function caseLike(match: string, line: string): string {
  const m = match[0];
  return m && m === m.toUpperCase() && m !== m.toLowerCase() ? line[0].toUpperCase() + line.slice(1) : line;
}

// A shot with nothing to describe: a real screen draws no picture.
const hasPrompt = (shot: Shot) => SETUP_PROMPT_FIELDS.some((f) => (shot[f] ?? "").trim());

export function propagateSetupIdentity(
  board: Board,
  setupId: string,
  identity: string,
): { board: Board; edit: SetupIdentityEdit } | null {
  const setup = board.setups.find((s) => s.id === setupId);
  const after = identity.trim();
  if (!setup || !after || after === setup.identity.trim()) return null;
  const before = setup.identity;
  const pattern = identityPattern(before);
  const replacement = after.replace(/[\s.,;:]+$/, "");
  const fields: SetupIdentityEdit["fields"] = {};
  const changed: number[] = [];
  const missing: number[] = [];
  const shots = board.shots.map((shot, index) => {
    let next = shot;
    if (pattern) {
      for (const f of SETUP_PROMPT_FIELDS) {
        const text = shot[f] ?? "";
        const written = text.replace(pattern, (m) => caseLike(m, replacement));
        if (written === text) continue;
        if (next === shot) next = { ...shot };
        next[f] = written;
        (fields[index] ??= {})[f] = { before: text, after: written };
      }
    }
    if (next !== shot) changed.push(index);
    else if (shot.setups.includes(setupId) && shot.kind !== "screen" && hasPrompt(shot)) missing.push(index);
    return next;
  });
  return {
    board: { ...board, setups: board.setups.map((s) => (s.id === setupId ? { ...s, identity: after } : s)), shots },
    edit: { setupId, before, after, fields, changed, missing },
  };
}

// Puts back what the edit wrote. A field edited by hand since then stays as it is, and its shot is reported.
export function undoSetupIdentity(board: Board, edit: SetupIdentityEdit): { board: Board; kept: number[] } {
  const kept = new Set<number>();
  const shots = board.shots.map((shot, index) => {
    const touched = edit.fields[index];
    if (!touched) return shot;
    let next = shot;
    for (const f of SETUP_PROMPT_FIELDS) {
      const t = touched[f];
      if (!t) continue;
      if ((shot[f] ?? "") !== t.after) {
        kept.add(index);
        continue;
      }
      if (next === shot) next = { ...shot };
      next[f] = t.before;
    }
    return next;
  });
  const setups = board.setups.map((s) => (s.id === edit.setupId && s.identity === edit.after ? { ...s, identity: edit.before } : s));
  return { board: { ...board, setups, shots }, kept: [...kept].sort((a, b) => a - b) };
}
