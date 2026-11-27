// "Banco de pruebas" on the server: each tool profile's tagged lines and tests, and marking one line after a real
// try (shared/toolChecks.ts markLine), written back to server/tools/<id>.md and logged in PROJECTS_DIR/.pruebas.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { markLine, profileLines, profileTests, shortDate, type Verdict } from "../shared/toolChecks.ts";
import { PROJECTS_DIR } from "./projects.ts";
import { listTools, reloadTools, toolFile } from "./tools.ts";

export type TrialEntry = { at: string; tool: string; line: string; verdict: Verdict; note: string };

const LOG = join(PROJECTS_DIR, ".pruebas.json");
const MAX = 300;

async function readLog(): Promise<TrialEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(LOG, "utf8")) as { entries?: TrialEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

export async function benchView() {
  const log = await readLog();
  return {
    tools: listTools().map((t) => {
      const text = toolFile(t.id)?.text ?? "";
      return { id: t.id, name: t.name, lines: profileLines(text), tests: profileTests(text) };
    }),
    recent: log.slice(-30).reverse(),
  };
}

export class BenchError extends Error {}

let writing: Promise<unknown> = Promise.resolve();
export function markTrial(tool: string, line: number, verdict: Verdict, note: string, now = new Date()) {
  const run = writing.catch(() => undefined).then(async () => {
    const found = toolFile(tool);
    if (!found) throw new BenchError("Esa herramienta no existe.");
    // Read the file again: it may have been edited by hand since the app started.
    const text = await readFile(found.file, "utf8");
    const before = profileLines(text).find((l) => l.line === line);
    const next = markLine(text, line, verdict, note, shortDate(now));
    if (!next || !before) throw new BenchError("Esa línea ya no está en el perfil: recargá la página.");
    await writeFile(found.file, next);
    reloadTools();
    const log = await readLog();
    log.push({ at: now.toISOString(), tool, line: before.text.slice(0, 200), verdict, note: note.trim().slice(0, 300) });
    if (log.length > MAX) log.splice(0, log.length - MAX);
    await mkdir(PROJECTS_DIR, { recursive: true });
    await writeFile(LOG, JSON.stringify({ entries: log }));
  });
  writing = run;
  return run;
}
