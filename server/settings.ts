// Who writes and with which model, and the API keys, set from the app ("Modelos") or from .env. Keys entered in the
// app are written to .env on this computer (mode 600) and to this process; they are never sent back to the browser,
// only whether one is set and its last four characters.
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type ProviderId = "claude" | "moonshot" | "nvidia" | "openrouter" | "custom";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

type Provider = {
  label: string;
  keyVar: string;
  modelVar: string;
  defaultModel: string;
  // OpenAI-compatible Chat Completions; Claude goes through the Anthropic SDK.
  baseUrl?: string;
  keyHint: string;
};

export const PROVIDERS: Record<Exclude<ProviderId, "custom">, Provider> = {
  claude: { label: "Claude", keyVar: "ANTHROPIC_API_KEY", modelVar: "CLAUDE_MODEL", defaultModel: "claude-opus-5-5", keyHint: "Empieza con sk-ant-" },
  moonshot: {
    label: "Kimi (Moonshot)",
    keyVar: "MOONSHOT_API_KEY",
    modelVar: "MOONSHOT_MODEL",
    defaultModel: "kimi-k3",
    baseUrl: "https://api.moonshot.ai/v1",
    keyHint: "La de platform.moonshot.ai",
  },
  nvidia: {
    label: "NVIDIA",
    keyVar: "NVIDIA_API_KEY",
    modelVar: "NVIDIA_MODEL",
    defaultModel: "moonshotai/kimi-k3",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyHint: "Solo el texto que empieza con nvapi-",
  },
  openrouter: {
    label: "OpenRouter",
    keyVar: "OPENROUTER_API_KEY",
    modelVar: "OPENROUTER_MODEL",
    defaultModel: "moonshotai/kimi-k3",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "Empieza con sk-or-",
  },
};

// Keys used by other parts of the app.
export const OTHER_KEYS = [
  { name: "OPENAI_API_KEY", label: "OpenAI", use: "Voz generada, sincronizar canciones e imágenes", hint: "Empieza con sk-" },
  { name: "REPLICATE_API_TOKEN", label: "Replicate", use: "Imágenes", hint: "Empieza con r8_" },
] as const;

const ENV_FILE = resolve(".env");
const env = (name: string) => process.env[name]?.trim() || undefined;
const trimUrl = (url: string) => url.replace(/\/+$/, "");

// Before the picker, one OpenAI-compatible provider lived in KIMI_API_KEY / KIMI_BASE_URL / KIMI_MODEL. Those still
// work: the base URL says which provider they belong to, or they are a custom one.
function legacyProvider(): Exclude<ProviderId, "claude"> | null {
  if (!env("KIMI_API_KEY") && !env("KIMI_BASE_URL") && !env("KIMI_MODEL")) return null;
  const base = trimUrl(env("KIMI_BASE_URL") ?? PROVIDERS.moonshot.baseUrl!);
  const preset = (["moonshot", "nvidia", "openrouter"] as const).find((p) => trimUrl(PROVIDERS[p].baseUrl!) === base);
  return preset ?? "custom";
}

// Where a provider's key lives in .env: its own variable, or the old KIMI_API_KEY it came from.
export function keyVarsOf(id: ProviderId): string[] {
  if (id === "custom") return ["KIMI_API_KEY"];
  if (id === "claude") return ["ANTHROPIC_API_KEY"];
  return [PROVIDERS[id].keyVar, ...(legacyProvider() === id ? ["KIMI_API_KEY"] : [])];
}

export function keyOf(id: ProviderId): string | undefined {
  if (id === "custom") return env("KIMI_API_KEY");
  if (id === "claude") return env("ANTHROPIC_API_KEY");
  return env(PROVIDERS[id].keyVar) ?? (legacyProvider() === id ? env("KIMI_API_KEY") : undefined);
}

export function modelOf(id: ProviderId): string {
  if (id === "custom") return env("KIMI_MODEL") ?? "kimi-k3";
  return env(PROVIDERS[id].modelVar) ?? (legacyProvider() === id ? env("KIMI_MODEL") : undefined) ?? PROVIDERS[id].defaultModel;
}

export function baseUrlOf(id: Exclude<ProviderId, "claude">): string {
  return trimUrl(id === "custom" ? (env("KIMI_BASE_URL") ?? PROVIDERS.moonshot.baseUrl!) : PROVIDERS[id].baseUrl!);
}

export function labelOf(id: ProviderId): string {
  return id === "custom" ? "Otro (OpenAI compatible)" : PROVIDERS[id].label;
}

// Claude can also sign in without a key (ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile set by hand).
export function ready(id: ProviderId): boolean {
  if (id === "claude") return Boolean(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"));
  return Boolean(keyOf(id));
}

export const providerIds = (): ProviderId[] => [...(Object.keys(PROVIDERS) as ProviderId[]), ...(legacyProvider() === "custom" ? ["custom" as const] : [])];

function parseProvider(value: string | undefined): ProviderId | null {
  const v = value?.toLowerCase();
  if (!v) return null;
  if (v === "kimi") return legacyProvider() ?? "moonshot";
  return (providerIds() as string[]).includes(v) ? (v as ProviderId) : null;
}

// The provider and model that write. LLM_PROVIDER picks; without it, Claude if it has a key, else the first
// OpenAI-compatible provider with one. Null: sample mode.
export function writerChoice(): { provider: ProviderId; model: string } | null {
  const picked = parseProvider(env("LLM_PROVIDER"));
  const provider = picked && ready(picked) ? picked : (providerIds().find((p) => ready(p)) ?? null);
  return provider ? { provider, model: modelOf(provider) } : null;
}

// The provider and model that look at pictures (the review of uploads, the quality loop); the writer if none is set.
export function visionChoice(): { provider: ProviderId; model: string } | null {
  const picked = parseProvider(env("VISION_PROVIDER"));
  if (picked && ready(picked)) return { provider: picked, model: env("VISION_MODEL") ?? modelOf(picked) };
  return writerChoice();
}

export function claudeEffort(): Effort {
  const e = env("WRITER_EFFORT") as Effort | undefined;
  return e && EFFORTS.includes(e) ? e : "high";
}

export const mask = (key: string | undefined) => (key ? `…${key.slice(-4)}` : "");

// ── Writing .env ─────────────────────────────────────────────────────────────────
// Only these names can be changed from the app.
const WRITABLE = new Set([
  ...Object.values(PROVIDERS).flatMap((p) => [p.keyVar, p.modelVar]),
  ...OTHER_KEYS.map((k) => k.name),
  "LLM_PROVIDER",
  "VISION_PROVIDER",
  "VISION_MODEL",
  "WRITER_EFFORT",
  // Where Demucs is (Modelos → Demucs; demucs.ts only runs a file named demucs).
  "DEMUCS_BIN",
  "KIMI_MODEL",
  // Only removed from the app: the old single key, when the person deletes the provider it belonged to.
  "KIMI_API_KEY",
]);

export class SettingsError extends Error {}

const SAFE_VALUE = /^[\x21-\x7e]{1,400}$/;

// Sets (or, with null, removes) variables in .env and in this process, keeping every other line as it is.
let writing: Promise<unknown> = Promise.resolve();
export function setEnv(values: Record<string, string | null>): Promise<void> {
  for (const [name, value] of Object.entries(values)) {
    if (!WRITABLE.has(name)) throw new SettingsError(`No se puede cambiar ${name} desde la app.`);
    if (value !== null && !SAFE_VALUE.test(value)) throw new SettingsError("Ese valor tiene espacios o caracteres raros. Pegalo de nuevo.");
  }
  const run = writing.catch(() => undefined).then(async () => {
    let text = "";
    try {
      text = await readFile(ENV_FILE, "utf8");
    } catch {
      text = "# Creado por Playbook Studio (Modelos). Nunca lo subas a GitHub.\n";
    }
    const lines = text.split("\n");
    for (const [name, value] of Object.entries(values)) {
      const at = lines.findIndex((l) => new RegExp(`^(# )?${name}=`).test(l));
      const line = value === null ? null : `${name}=${value}`;
      if (at >= 0) {
        if (line === null) lines.splice(at, 1);
        else lines[at] = line;
      } else if (line !== null) {
        if (lines.length && lines[lines.length - 1] === "") lines.splice(lines.length - 1, 0, line);
        else lines.push(line);
      }
      if (value === null) delete process.env[name];
      else process.env[name] = value;
    }
    await writeFile(ENV_FILE, lines.join("\n"), { mode: 0o600 });
    await chmod(ENV_FILE, 0o600);
  });
  writing = run;
  return run;
}
