// Code fences as CommonMark reads them (how editors and Claude Code read PLAYBOOK.md): three or more ``` or ~~~, up to
// three spaces in. A fence closes only with the same character, at least as many of it and nothing after. Every check
// that walks the playbook's headings uses this, so it sees what a Markdown reader sees.
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// The fence open after `line`, given the one open before it (null: none).
export function fenceAfter(open: string | null, line: string): string | null {
  const m = FENCE.exec(line);
  if (!m) return open;
  if (open === null) return m[1][0] === "`" && m[2].includes("`") ? null : m[1];
  return m[1][0] === open[0] && m[1].length >= open.length && !m[2].trim() ? null : open;
}

// The fence a block of lines leaves open at its end (null: all closed).
export const openFence = (lines: string[]) => lines.reduce<string | null>(fenceAfter, null);

// Markdown line breaks: \r\n, and a bare \r too, are line endings.
export const unixLines = (text: string) => text.replace(/\r\n?/g, "\n");
