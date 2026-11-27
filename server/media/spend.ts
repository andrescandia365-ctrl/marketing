// What image and video generations cost by the price table, logged next to the projects
// (PROJECTS_DIR/.gastos-media.json, the last 500). The provider's own bill is the truth; this is the estimate the app
// showed before each call, so the person sees how much a week of production is spending.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTS_DIR } from "../projects.ts";

// where: "web" for what the person made by hand on a website and noted in the app ("Lo generé afuera"); missing on
// API calls. project and slot say which clip it was for (a story's project id and "toma-03", or "ads:<series>" and a
// piece's clip), so each slot can show what was made for it.
export type SpendEntry = {
  at: string;
  provider: string;
  model: string;
  kind: "imagen" | "video";
  seconds?: number;
  usd: number;
  where?: "web";
  label?: string;
  resolution?: string;
  project?: string;
  slot?: string;
  count?: number;
};

const FILE = join(PROJECTS_DIR, ".gastos-media.json");
const MAX = 500;
let log: SpendEntry[] | null = null;

async function load(): Promise<SpendEntry[]> {
  if (log) return log;
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as { entries?: unknown };
    log = Array.isArray(parsed.entries) ? (parsed.entries as SpendEntry[]).filter((e) => e && typeof e.usd === "number" && typeof e.at === "string") : [];
  } catch {
    log = [];
  }
  return log;
}

let saving: Promise<unknown> = Promise.resolve();
export async function logSpend(entry: Omit<SpendEntry, "at">): Promise<void> {
  const list = await load();
  list.push({ at: new Date().toISOString(), ...entry });
  if (list.length > MAX) list.splice(0, list.length - MAX);
  const snapshot = JSON.stringify({ entries: list });
  saving = saving
    .catch(() => undefined)
    .then(() => mkdir(PROJECTS_DIR, { recursive: true }))
    .then(() => writeFile(FILE, snapshot))
    .catch(() => undefined);
}

// Totals for the last 7 and 30 days (all, and the part made by hand on a website), plus the latest entries.
export async function spendView(now = Date.now()): Promise<{ week: number; month: number; webWeek: number; webMonth: number; recent: SpendEntry[] }> {
  const list = await load();
  const since = (days: number, web = false) =>
    list.filter((e) => now - Date.parse(e.at) <= days * 86_400_000 && (!web || e.where === "web")).reduce((s, e) => s + e.usd, 0);
  return { week: since(7), month: since(30), webWeek: since(7, true), webMonth: since(30, true), recent: list.slice(-20).reverse() };
}

// What was noted by hand for one project, newest first (every slot of it, so a page asks once).
export async function spendForProject(project: string): Promise<SpendEntry[]> {
  return (await load()).filter((e) => e.where === "web" && e.project === project).reverse();
}

// Takes back one hand-noted entry (a wrong note): only a "web" entry, matched by its time and slot.
export async function removeWebSpend(at: string, slot: string): Promise<boolean> {
  const list = await load();
  const i = list.findIndex((e) => e.where === "web" && e.at === at && e.slot === slot);
  if (i < 0) return false;
  list.splice(i, 1);
  const snapshot = JSON.stringify({ entries: list });
  saving = saving
    .catch(() => undefined)
    .then(() => mkdir(PROJECTS_DIR, { recursive: true }))
    .then(() => writeFile(FILE, snapshot))
    .catch(() => undefined);
  return true;
}
