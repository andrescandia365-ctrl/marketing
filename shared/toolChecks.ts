// "Banco de pruebas": what a tool profile (server/tools/*.md) still has to prove, and what the person found when they
// tried it. Each tagged bullet ("- [NOT SURE] …") is a line that can be marked after a real try: it worked → [TESTED],
// it did not → it stays [NOT SURE] with the finding written next to it. The "Tests to run" list is shown as is. Pure:
// the server reads and writes the file (server/toolChecks.ts).

export type ProfileTag = "DOCS" | "NOT SURE" | "TESTED";
export type ProfileLine = { line: number; tag: ProfileTag; text: string; section: string };
export type ProfileTest = { n: number; text: string };
export type Verdict = "worked" | "failed";

const TAGGED = /^(\s*-\s*)\[(DOCS|NOT SURE|TESTED)\]\s*(.*)$/;

// Every tagged bullet with its 0-based line number and the "## " section it sits in.
export function profileLines(md: string): ProfileLine[] {
  let section = "";
  const out: ProfileLine[] = [];
  md.split("\n").forEach((raw, line) => {
    const head = raw.match(/^##\s+(.+)$/);
    if (head) section = head[1].trim();
    const m = raw.match(TAGGED);
    if (m) out.push({ line, tag: m[2] as ProfileTag, text: m[3].trim(), section });
  });
  return out;
}

// The numbered list under "## Tests to run".
export function profileTests(md: string): ProfileTest[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+Tests to run/i.test(l));
  if (start < 0) return [];
  const out: ProfileTest[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    const m = l.match(/^\s*(\d+)\.\s+(.+)$/);
    if (m) out.push({ n: Number(m[1]), text: m[2].trim() });
  }
  return out;
}

const clean = (note: string) => note.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);

// The profile with one tagged line marked after a try: worked → [TESTED]; failed → [NOT SURE]. Either way the finding
// goes at the end of the line, dated, so the writer reads it next time. null when that line is not a tagged bullet.
export function markLine(md: string, line: number, verdict: Verdict, note: string, date: string): string | null {
  const lines = md.split("\n");
  const m = lines[line]?.match(TAGGED);
  if (!m) return null;
  const said = clean(note);
  const finding = verdict === "worked" ? `Probado ${date}: funcionó${said ? `, ${said}` : ""}.` : `Probado ${date}: no funcionó${said ? `, ${said}` : ""}.`;
  const body = m[3].trim().replace(/\s*$/, "");
  lines[line] = `${m[1]}[${verdict === "worked" ? "TESTED" : "NOT SURE"}] ${body} (${finding})`;
  return lines.join("\n");
}

// "26 nov 2026"
export function shortDate(d: Date): string {
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
