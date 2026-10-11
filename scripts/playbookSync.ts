// The two playbooks stay in step. PLAYBOOK.md is the research; server/playbook.md is what the writer reads, summarized
// by hand (no show name, no real people, no politics), so it cannot be generated from the research. Instead
// scripts/playbook.snapshot.md keeps the PLAYBOOK.md sections the summary follows, as they were when it was last brought
// up to date, plus the summary's fingerprint. When either file changes, the check says what changed until someone
// updates the other and records the new state (`npm run playbook -- --write`).
import { createHash } from "node:crypto";
import { fenceAfter } from "../shared/fence.ts";

export type Section = { title: string; body: string };

const HEADING = /^(#{2,3}) (.+)$/;

// Every "## " and "### " heading with its text up to the next one ("####" stays inside its section).
export function sections(md: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const was = fence;
    fence = fenceAfter(fence, line);
    const m = was === null && fence === null ? HEADING.exec(line) : null;
    if (m) {
      current = { title: m[2].trim(), body: "" };
      out.push(current);
    } else if (current) current.body += `${line}\n`;
  }
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

// The sections the summary follows: §1 to §7 of PLAYBOOK.md, except §2.1 (the show's business facts). Headings with
// no number belong to the numbered section above them.
export function trackedSections(md: string): Section[] {
  let top = 0;
  return sections(md).filter((s) => {
    const n = /^(\d+)(?:\.(\d+))?[.\s]/.exec(s.title);
    if (n) top = Number(n[1]);
    if (n && n[1] === "2" && n[2] === "1") return false;
    return top >= 1 && top <= 7;
  });
}

export const fingerprint = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n").trim()).digest("hex").slice(0, 16);

const MARK = /<!-- playbook\.md: ([0-9a-f]{16}) -->/;

// The snapshot file: a note for people, the summary's fingerprint, and the tracked sections as they are now.
export function snapshot(research: string, summary: string): string {
  return renderSnapshot(fingerprint(summary), trackedSections(research));
}

function renderSnapshot(mark: string, tracked: Section[]): string {
  const body = tracked.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n");
  return `<!-- Generado por \`npm run playbook -- --write\`. No se edita a mano. -->
<!-- Las secciones de PLAYBOOK.md que resume server/playbook.md, tal como estaban la última vez que se pusieron al día. -->
<!-- playbook.md: ${mark} -->

${body}
`;
}

export type Drift = {
  // PLAYBOOK.md sections that changed, appeared or went away since the last sync, with the lines that differ.
  sections: { title: string; status: "changed" | "added" | "removed"; lines: string[] }[];
  // server/playbook.md changed since the last sync.
  summaryChanged: boolean;
};

function lineDiff(before: string, after: string): string[] {
  const a = before.split("\n").map((l) => l.trimEnd());
  const b = after.split("\n").map((l) => l.trimEnd());
  const inA = new Set(a);
  const inB = new Set(b);
  return [...a.filter((l) => l && !inB.has(l)).map((l) => `- ${l}`), ...b.filter((l) => l && !inA.has(l)).map((l) => `+ ${l}`)];
}

export function drift(snapshotMd: string, research: string, summary: string): Drift {
  const recorded = MARK.exec(snapshotMd)?.[1] ?? "";
  const before = new Map(sections(snapshotMd).map((s) => [s.title, s.body]));
  const now = new Map(trackedSections(research).map((s) => [s.title, s.body]));
  const out: Drift["sections"] = [];
  for (const [title, body] of now) {
    if (!before.has(title)) out.push({ title, status: "added", lines: [] });
    else if (fingerprint(before.get(title)!) !== fingerprint(body)) out.push({ title, status: "changed", lines: lineDiff(before.get(title)!, body) });
  }
  for (const title of before.keys()) if (!now.has(title)) out.push({ title, status: "removed", lines: [] });
  return { sections: out, summaryChanged: recorded !== fingerprint(summary) };
}

export function describeDrift(d: Drift): string {
  const parts: string[] = [];
  if (d.sections.length) {
    parts.push("PLAYBOOK.md cambió en secciones que resume server/playbook.md. Llevá el cambio a server/playbook.md (sin nombres del programa, de personas reales ni política):");
    for (const s of d.sections) {
      parts.push(`  · ${s.title} (${s.status === "changed" ? "cambió" : s.status === "added" ? "nueva" : "ya no está"})`);
      for (const l of s.lines.slice(0, 12)) parts.push(`      ${l}`);
      if (s.lines.length > 12) parts.push(`      … y ${s.lines.length - 12} líneas más`);
    }
  }
  if (d.summaryChanged) parts.push("server/playbook.md cambió: fijate que PLAYBOOK.md diga lo mismo (es la fuente).");
  if (parts.length) parts.push("Cuando las dos digan lo mismo: npm run playbook -- --write");
  return parts.join("\n");
}

// "Episodios estudiados" appends an episode to §2.6 with the person's ok. §2.6 is tracked (server/playbook.md keeps a
// few rules taken from the episode library), but an appended episode never goes to the summary: names, quotes and
// politics stay in the research. So the app records the append itself, and only the append:
// - everything was in step before → the snapshot is written again, the same as `npm run playbook -- --write`;
// - other sections (or the summary) had drifted, but §2.6 was in step → only §2.6 is brought up to date in the
//   snapshot, so the other drift is still reported;
// - §2.6 itself had drifted (a hand edit nobody recorded) → nothing is recorded, and the check keeps saying so.
// A hand edit to the log, including to an earlier episode, still shows as drift.
export type AppendRecord = { snapshot: string | null; status: "recorded" | "patched" | "left" };

export function recordAppend(snapshotMd: string, before: string, after: string, summary: string, section = "2.6"): AppendRecord {
  const d = drift(snapshotMd, before, summary);
  if (!d.sections.length && !d.summaryChanged) return { snapshot: snapshot(after, summary), status: "recorded" };
  const isLog = (title: string) => title.startsWith(`${section} `);
  if (d.sections.some((s) => isLog(s.title))) return { snapshot: null, status: "left" };
  const fresh = trackedSections(after).find((s) => isLog(s.title));
  if (!fresh) return { snapshot: null, status: "left" };
  const recorded = sections(snapshotMd).map((s) => (isLog(s.title) ? fresh : s));
  return { snapshot: renderSnapshot(MARK.exec(snapshotMd)?.[1] ?? "", recorded), status: "patched" };
}
