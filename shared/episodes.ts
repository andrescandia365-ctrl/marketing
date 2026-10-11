// "Episodios estudiados" (idea 57): the episode case library of PLAYBOOK.md §2.6, from the app. The person pastes an
// episode summary, the writer fills the §2.6 entry template (EpisodeWire → episodeMarkdown), the person edits it and
// says ok, and the entry is appended to §2.6 with the next EP number (appendEpisode). The log stays in the research
// file only: names, quotes and politics never reach server/playbook.md. Moves that repeat in 3+ logged episodes are
// shown as a proposal to fold into §2.5 (repeatedMoves); nothing is folded by the app.
import { z } from "zod";
import { fenceAfter, openFence, unixLines } from "./fence.ts";
import { MOVE_LABEL, pickMove } from "./moves.ts";

export const EPISODES_SECTION = "2.6";
export const MOVES_SECTION = "2.5";
// A move logged in this many episodes is proposed for §2.5 (PLAYBOOK §7.7: "fold any move that repeats").
export const REPEAT_MIN = 3;
export const ENTRY_MAX = 20000;
export const SUMMARY_MAX = 30000;

// What the writer returns: the parts of the §2.6 template, in English like the rest of PLAYBOOK.md.
export const EpisodeWireSchema = z.object({
  title: z.string().describe("The episode's title as the summary gives it, in quotes if it is the show's own title"),
  source: z.string().describe("URL and air date if the summary gives them; else say they were not provided (ask)"),
  runtime: z.string().describe("Runtime covered, e.g. 0:00–10:44, and whether it may be an excerpt"),
  subject: z.string().describe("One sentence; names and quotes only as given, marked as not independently verified"),
  terminology: z.array(z.string()).describe("Each of the summary's own labels we are interpreting, and how we read it"),
  topics: z.array(
    z.object({
      time: z.string().describe("m:ss–m:ss"),
      duration: z.string().describe("m:ss, or empty to compute from time"),
      topic: z.string(),
      opens: z.string().describe("How the topic opens (the bridge into it)"),
      beats: z.string().describe("Key beats with their timecodes"),
      callback: z.string().describe("Timecode and what it returns to, or None listed"),
    }),
  ),
  moves: z.array(z.string()).describe("Playbook §2.5 moves the episode really shows, by their §2.5 names; a recurring device not in §2.5 in plain words"),
  observations: z.array(z.string()).describe("Structural observations [INF]; one episode only, no generalising"),
  translation: z.array(z.string()).describe("Marketing translation, non-political: no names, quotes or claims from the episode"),
  check: z.array(z.string()).describe("What to confirm against the video"),
});
export type EpisodeWire = z.infer<typeof EpisodeWireSchema>;

export type EpisodeEntry = { n: number; title: string; body: string; moves: string[] };

const pad = (n: number) => String(n).padStart(2, "0");
const cell = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
const ENTRY_HEAD = /^#{1,6}\s*EP-(\d+)\s*(?:[—–-]+\s*)?(.*)$/;
const MOVES_LINE = /^\s*(?:[-*]\s*)?\*\*Moves:?\*\*\s*(?:\(§2\.5\)\s*)?:?\s*(.*)$/i;
const BIG_HEADING = /^ {0,3}#{1,3}(\s|$)/;

// "2:09–4:47" → "2:38" (empty when it cannot read both ends).
export function spanDuration(time: string): string {
  const m = /(\d+):(\d{2})\s*[–—-]\s*(\d+):(\d{2})/.exec(time);
  if (!m) return "";
  const s = Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
  return s > 0 ? `${Math.floor(s / 60)}:${pad(s % 60)}` : "";
}

const bullets = (items: string[], empty: string) => (items.filter((i) => i.trim()).length ? items.filter((i) => i.trim()).map((i) => `- ${i.trim()}`) : [`- ${empty}`]);

// The writer's parts as a §2.6 entry, in the shape of EP-01.
export function episodeMarkdown(n: number, ep: EpisodeWire): string {
  const title = ep.title.trim().replace(/\s*`?\[EP\]`?\s*$/, "") || "Untitled episode";
  const lines = [
    `#### EP-${pad(n)} — ${title} \`[EP]\``,
    `- **Source:** ${ep.source.trim() || "user-supplied summary. Video URL and air date **not yet provided** (ask)."} Runtime covered: ${ep.runtime.trim() || "not given"}.`,
    `- **Subject:** ${ep.subject.trim()}`,
    ...(ep.terminology.some((t) => t.trim()) ? [`- **Terminology:** ${ep.terminology.filter((t) => t.trim()).join(" ")}`] : []),
    `- **Moves** (§2.5): ${ep.moves.filter((m) => m.trim()).join(" · ") || "none named yet"}`,
    "",
    "| # | Time | Dur. | Topic | How it opens | Key beats | Callback |",
    "|---|---|---|---|---|---|---|",
    ...ep.topics.map(
      (t, i) =>
        `| ${i + 1} | ${cell(t.time)} | ${cell(t.duration) || spanDuration(t.time)} | ${cell(t.topic)} | ${cell(t.opens)} | ${cell(t.beats)} | ${cell(t.callback) || "None listed"} |`,
    ),
    "",
    "**Observations** `[INF]` (one episode only; do not generalize until more are logged):",
    ...bullets(ep.observations, "None yet."),
    "",
    "**Marketing translation (non-political):**",
    ...bullets(ep.translation, "None yet."),
    "",
    `**Check against the video:** ${ep.check.filter((c) => c.trim()).map((c) => c.trim().replace(/[.;]$/, "")).join("; ") || "URL/date; who hosts; whether a sincere beat exists"}.`,
  ];
  return lines.join("\n");
}

// An empty entry to fill by hand (no AI key, or the person prefers to).
export function episodeTemplate(n: number): string {
  return episodeMarkdown(n, {
    title: '"<title>"',
    source: "",
    runtime: "",
    subject: "<one sentence; names and quotes only as given, not independently verified>",
    terminology: [],
    topics: [{ time: "0:00–0:00", duration: "", topic: "", opens: "", beats: "", callback: "" }],
    moves: [],
    observations: [],
    translation: [],
    check: [],
  });
}

type Region = { lines: string[]; start: number; end: number };

// The lines of a numbered section ("2.6") up to the next heading of level 1–3, outside code fences.
function region(md: string, number: string): Region | null {
  const lines = md.split("\n");
  const head = new RegExp(`^#{2,3} ${number.replace(".", "\\.")}[.\\s]`);
  let fence: string | null = null;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const was = fence;
    fence = fenceAfter(fence, lines[i]);
    if (was !== null || fence !== null) continue;
    if (start < 0) {
      if (head.test(lines[i])) start = i;
    } else if (BIG_HEADING.test(lines[i])) return { lines, start, end: i };
  }
  return start < 0 ? null : { lines, start, end: lines.length };
}

// The names of the §2.5 moves table (its first column, in bold).
export function playbookMoveNames(md: string): string[] {
  const r = region(md, MOVES_SECTION);
  if (!r) return [];
  const out: string[] = [];
  for (const line of r.lines.slice(r.start + 1, r.end)) {
    const m = /^\|\s*\*\*([^*|]+)\*\*/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// The moves an entry names on its "**Moves**" line.
export function entryMoves(body: string): string[] {
  for (const line of body.split("\n")) {
    const m = MOVES_LINE.exec(line);
    if (!m) continue;
    return m[1]
      .split(/\s*[·;,]\s*/)
      .map((s) => s.replace(/[`*_]/g, "").replace(/\s*\(.*?\)\s*/g, " ").trim())
      .filter((s) => s && !/^none\b/i.test(s));
  }
  return [];
}

// Every logged episode in §2.6 (the template inside its code fence is not one).
export function episodeEntries(md: string): EpisodeEntry[] {
  const r = region(md, EPISODES_SECTION);
  if (!r) return [];
  const out: EpisodeEntry[] = [];
  let current: { n: number; title: string; body: string[] } | null = null;
  let fence: string | null = null;
  const close = () => {
    if (!current) return;
    const body = current.body.join("\n").replace(/\n-{3,}\s*$/, "").trim();
    out.push({ n: current.n, title: current.title, body, moves: entryMoves(body) });
  };
  for (const line of r.lines.slice(r.start + 1, r.end)) {
    const was = fence;
    fence = fenceAfter(fence, line);
    const m = was !== null || fence !== null ? null : /^####\s*EP-(\d+)\s*(?:[—–-]+\s*)?(.*)$/.exec(line);
    if (m) {
      close();
      current = { n: Number(m[1]), title: m[2].replace(/\s*`?\[EP\]`?\s*$/, "").trim(), body: [] };
    } else if (current) current.body.push(line);
  }
  close();
  return out;
}

export const nextEpisodeNumber = (md: string) => Math.max(0, ...episodeEntries(md).map((e) => e.n)) + 1;

export class EpisodeError extends Error {}

// The person's (edited) entry, made safe to append as EP-n: its heading renumbered (the number is the file's next one,
// whatever the draft said), no heading of level 1–3 inside it (that would split §2.6 for the playbook check), no
// second EP heading, and the [EP] tag on its title.
export function prepareEntry(text: string, n: number): string {
  const lines = unixLines(text).trim().split("\n");
  if (!lines[0]?.trim()) throw new EpisodeError("La ficha está vacía: pegá un resumen y pasalo a la plantilla, o escribila a mano.");
  if (text.length > ENTRY_MAX) throw new EpisodeError(`La ficha es muy larga (más de ${ENTRY_MAX} caracteres). Acortala.`);
  // The first line is the title when it is a heading; otherwise the whole text is the body.
  const titled = /^#/.test(lines[0]);
  const head = ENTRY_HEAD.exec(lines[0]);
  const title = (titled ? (head ? head[2] : lines[0].replace(/^#+\s*/, "")) : "").replace(/\s*`?\[EP\]`?\s*$/, "").trim() || "Untitled episode";
  const body = (titled ? lines.slice(1) : lines).map((line) => {
    if (/^\s*#{1,6}\s*EP-\d+/.test(line)) return line.replace(/^\s*#+\s*/, "**").replace(/$/, "**");
    if (BIG_HEADING.test(line)) return line.replace(/^ {0,3}#{1,3}(\s|$)/, "#### ");
    return line;
  });
  if (!body.some((l) => l.trim())) throw new EpisodeError("La ficha tiene solo el título: falta la tabla de temas y lo demás.");
  // An unclosed code fence would swallow the rest of the playbook.
  const open = openFence(body);
  if (open) throw new EpisodeError(`La ficha abre un bloque de código (${open}) y no lo cierra.`);
  return [`#### EP-${pad(n)} — ${title} \`[EP]\``, ...body].join("\n").trimEnd();
}

// PLAYBOOK.md with the entry added at the end of §2.6, before the rule that closes the section, as the next EP.
export function appendEpisode(md: string, entry: string): { text: string; n: number; entry: string } {
  const r = region(md, EPISODES_SECTION);
  if (!r) throw new EpisodeError("PLAYBOOK.md no tiene la sección 2.6 (el registro de episodios).");
  const n = nextEpisodeNumber(md);
  const ready = prepareEntry(entry, n);
  let at = r.end;
  while (at > r.start + 1 && !r.lines[at - 1].trim()) at--;
  if (at > r.start + 1 && /^-{3,}\s*$/.test(r.lines[at - 1])) at--;
  while (at > r.start + 1 && !r.lines[at - 1].trim()) at--;
  const after = r.lines.slice(at);
  while (after.length && !after[0].trim()) after.shift();
  const lines = [...r.lines.slice(0, at), "", ...ready.split("\n"), ...(after.length ? ["", ...after] : [""])];
  return { text: lines.join("\n"), n, entry: ready };
}

export type MoveTally = { name: string; episodes: number[]; inPlaybook: boolean; propose: boolean };

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// How many logged episodes name each move. A move in REPEAT_MIN or more episodes that §2.5 does not have yet is a
// proposal to fold into §2.5; one it has is confirmed by those episodes. Sorted by episodes, most first.
export function moveTally(md: string, min = REPEAT_MIN): MoveTally[] {
  const known = new Set(playbookMoveNames(md).map(squash));
  const byKey = new Map<string, { name: string; episodes: Set<number>; inPlaybook: boolean }>();
  for (const e of episodeEntries(md)) {
    for (const raw of e.moves) {
      const move = pickMove(raw);
      const key = move ?? squash(raw);
      if (!key) continue;
      const inPlaybook = move !== null || known.has(squash(raw));
      const t = byKey.get(key) ?? { name: move ? MOVE_LABEL[move] : raw, episodes: new Set<number>(), inPlaybook };
      t.episodes.add(e.n);
      byKey.set(key, t);
    }
  }
  return [...byKey.values()]
    .map((t) => ({ name: t.name, episodes: [...t.episodes].sort((a, b) => a - b), inPlaybook: t.inPlaybook, propose: !t.inPlaybook && t.episodes.size >= min }))
    .sort((a, b) => b.episodes.length - a.episodes.length || a.name.localeCompare(b.name));
}
