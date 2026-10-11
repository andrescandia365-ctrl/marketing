// "Episodios estudiados" (idea 57): reads and appends the episode log of PLAYBOOK.md §2.6, and asks the writer to put
// a pasted summary into the §2.6 entry template. Only the research file and the snapshot are written: the app's
// operative playbook (server/playbook.md) never receives an episode.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EpisodeError, EpisodeWireSchema, REPEAT_MIN, appendEpisode, episodeEntries, episodeMarkdown, moveTally, nextEpisodeNumber, type MoveTally } from "../shared/episodes.ts";
import { describeDrift, drift, recordAppend, sections, type AppendRecord } from "../scripts/playbookSync.ts";
import { askWith, currentWriter, WriterError } from "./claude.ts";

export const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RESEARCH = "PLAYBOOK.md";
const SUMMARY = "server/playbook.md";
const SNAPSHOT = "scripts/playbook.snapshot.md";

export type EpisodesView = {
  episodes: { n: number; title: string; moves: string[] }[];
  next: number;
  moves: MoveTally[];
  repeatMin: number;
  // What `npm run playbook` would say now (empty when the two playbooks are in step).
  drift: string;
};

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
function write(root: string, path: string, text: string) {
  const file = join(root, path);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

function driftText(root: string, research: string): string {
  if (!existsSync(join(root, SNAPSHOT))) return `Falta ${SNAPSHOT}. Corré: npm run playbook -- --write`;
  return describeDrift(drift(read(root, SNAPSHOT), research, read(root, SUMMARY)));
}

export function episodesView(root = REPO_ROOT): EpisodesView {
  const research = read(root, RESEARCH);
  return {
    episodes: episodeEntries(research).map(({ n, title, moves }) => ({ n, title, moves })),
    next: nextEpisodeNumber(research),
    moves: moveTally(research),
    repeatMin: REPEAT_MIN,
    drift: driftText(root, research),
  };
}

// The person's ok: the entry goes to the end of §2.6 as the next EP, and the snapshot records the append (recordAppend).
export function addEpisode(entry: string, root = REPO_ROOT): { n: number; record: AppendRecord["status"]; view: EpisodesView } {
  const before = read(root, RESEARCH);
  const { text, n } = appendEpisode(before, entry);
  // The append touches §2.6 only: every other tracked section reads the same as before.
  const other = (md: string) => sections(md).filter((s) => !s.title.startsWith("2.6 "));
  if (JSON.stringify(other(before)) !== JSON.stringify(other(text))) throw new EpisodeError("La ficha cambiaría otras secciones del playbook. Revisá sus títulos.");
  const summary = read(root, SUMMARY);
  const record: AppendRecord = existsSync(join(root, SNAPSHOT)) ? recordAppend(read(root, SNAPSHOT), before, text, summary) : { snapshot: null, status: "left" };
  write(root, RESEARCH, text);
  if (record.snapshot !== null) write(root, SNAPSHOT, record.snapshot);
  return { n, record: record.status, view: episodesView(root) };
}

// The research's own §2.5 and §2.6, so the writer follows the template and the move names, and sees how EP-01 reads.
function libraryContext(research: string): string {
  return sections(research)
    .filter((s) => /^2\.[56] /.test(s.title))
    .map((s) => `### ${s.title}\n\n${s.body}`)
    .join("\n\n");
}

export async function draftEpisode(summary: string, root = REPO_ROOT): Promise<{ n: number; entry: string }> {
  const who = currentWriter();
  if (!who) throw new WriterError("Para pasar un resumen a la plantilla hace falta una IA conectada. Cargá una clave en Modelos.");
  const research = read(root, RESEARCH);
  const n = nextEpisodeNumber(research);
  const system = `You keep the episode case library of a marketing research file that studies how a satirical news show builds its segments, to borrow the structure (never the content, names or politics) for brand storytelling. Below are the file's move library (§2.5) and the episode library (§2.6) with its entry template and the episodes logged so far.

${libraryContext(research)}`;
  const prompt = `The user pasted this episode summary. Put it into the §2.6 entry template as EP-${String(n).padStart(2, "0")}, in English, like the entries above.

Rules:
- Everything comes from the summary only: it is a user-supplied summary [EP], not checked against the video. Never add facts, quotes, timecodes or names the summary does not give; if something the template asks for is missing, say so ("not given") and add it to the check list.
- Names and quotes only as the summary gives them, marked as not independently verified. Take no side and add no political opinion.
- Keep the user's own labels; each one you interpret goes in terminology with how you read it, tagged [INF] and "Confirm with the user".
- topics: one row per topic, in order, with its timecode, duration, how it opens (the bridge into it), key beats with their timecodes, and its callback (timecode and what it returns to) or "None listed".
- moves: only the §2.5 moves the summary really shows, by their §2.5 names ("The Callback"); a recurring device that is not in §2.5 in a few plain words. Do not tag a move the summary does not show.
- observations [INF]: structure only (pacing, bridges, callbacks, role split, whether a Turn is visible), for this episode alone; compare with the logged episodes only to say what repeats, never to generalise.
- translation: what the structure means for brand storytelling, non-political, with no names, quotes or claims from the episode; a number only as "a real, cited number"; roadmap ideas only labelled as concept.
- check: what to confirm against the video (URL/date if missing, who hosts, whether a sincere beat exists, the opener line, anything the summary left unclear).

The summary:
"""
${summary}
"""`;
  const ep = await askWith(who, [system], prompt, EpisodeWireSchema);
  return { n, entry: episodeMarkdown(n, ep) };
}
