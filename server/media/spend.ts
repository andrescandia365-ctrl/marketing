// What image and video generations cost by the price table, logged next to the projects
// (PROJECTS_DIR/.gastos-media.json, the last 500). The provider's own bill is the truth; this is the estimate the app
// showed before each call, so the person sees how much a week of production is spending.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTS_DIR } from "../projects.ts";

export type SpendEntry = { at: string; provider: string; model: string; kind: "imagen" | "video"; seconds?: number; usd: number };

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

// Totals for the last 7 and 30 days, plus the latest entries.
export async function spendView(now = Date.now()): Promise<{ week: number; month: number; recent: SpendEntry[] }> {
  const list = await load();
  const since = (days: number) => list.filter((e) => now - Date.parse(e.at) <= days * 86_400_000).reduce((s, e) => s + e.usd, 0);
  return { week: since(7), month: since(30), recent: list.slice(-20).reverse() };
}
