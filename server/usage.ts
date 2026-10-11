// The rolling log of writer requests and their tokens ("Modelos → Tokens por pedido"). In memory, plus a small JSON
// file next to the projects (PROJECTS_DIR/.tokens.json) so it survives a restart; a file that cannot be read or
// written is ignored. Which kind of request it was comes from the route that asked (`usageScope`, set by a
// middleware in index.ts), so the writer functions need no extra argument.
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTS_DIR } from "./projects.ts";
import { USAGE_LOG_MAX, addTokens, pushUsage, readUsageLog, usageAverages, type Tokens, type UsageEntry } from "../shared/usage.ts";

export const usageScope = new AsyncLocalStorage<{ kind: string }>();

const FILE = join(PROJECTS_DIR, ".tokens.json");
let log: UsageEntry[] | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  if (log) return;
  loading ??= readFile(FILE, "utf8")
    .then((text) => readUsageLog(JSON.parse(text)))
    .catch(() => [] as UsageEntry[])
    .then((saved) => {
      log = saved.slice(-USAGE_LOG_MAX);
    });
  await loading;
}

let saving: Promise<unknown> = Promise.resolve();
function save(): void {
  const snapshot = JSON.stringify({ entries: log ?? [] });
  saving = saving
    .catch(() => undefined)
    .then(() => mkdir(PROJECTS_DIR, { recursive: true }))
    .then(() => writeFile(FILE, snapshot))
    .catch(() => undefined);
}

// One writer request: the provider calls `add` with each reply's usage (a retry adds again), then `done` records it.
export function meter(provider: string, model: string) {
  let tokens: Tokens | null = null;
  let cost: number | undefined;
  let calls = 0;
  const kind = usageScope.getStore()?.kind ?? "Otro";
  return {
    // `served`: the model that really answered (a fallback may differ from the one asked).
    add(t: Tokens | null, c?: number, served?: string) {
      calls++;
      tokens = addTokens(tokens, t);
      if (c !== undefined) cost = (cost ?? 0) + c;
      if (served) model = served;
    },
    async done(ok: boolean): Promise<void> {
      // Nothing came back at all (no connection): nothing was spent that the provider told us of.
      if (!calls) return;
      const entry: UsageEntry = { at: new Date().toISOString(), kind, provider, model, tokens, ...(cost !== undefined && { cost }), calls, ok };
      await load();
      log = pushUsage(log ?? [], entry);
      save();
    },
  };
}

export async function usageView(): Promise<{ entries: UsageEntry[]; averages: ReturnType<typeof usageAverages> }> {
  await load();
  const entries = log ?? [];
  return { entries: [...entries].reverse(), averages: usageAverages(entries) };
}
