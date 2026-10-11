// How many tokens each writer request used ("Modelos → Tokens por pedido"). The server reads the usage every reply
// carries, Claude's or an OpenAI-compatible provider's, turns it into one shape here and keeps the last requests.
// Tokens only: a price is shown only when the provider itself returns one (OpenRouter's `cost`).

// Claude's split: `input` is the prompt read at full price, apart from what came from the cache (`cacheRead`) and
// what was written to it (`cacheWrite`). `output` includes any thinking; `reasoning` is the part of it the provider
// names as reasoning, when it says.
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number };

export type UsageEntry = {
  // ISO time the request finished.
  at: string;
  // What was asked, in the app's words ("Historia", "Storyboard"…), from the route.
  kind: string;
  provider: string;
  model: string;
  // Null: the provider sent no usage.
  tokens: Tokens | null;
  // The provider's own price for the request (OpenRouter: credits, in US dollars); never estimated here.
  cost?: number;
  // HTTP requests behind it (a retry counts).
  calls: number;
  // False when the request ended in an error (the tokens were spent anyway).
  ok: boolean;
};

export const USAGE_LOG_MAX = 200;

export const zeroTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 });

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Anthropic Messages API: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens.
export function claudeUsage(usage: unknown): Tokens | null {
  if (!isObject(usage)) return null;
  if (usage.input_tokens === undefined && usage.output_tokens === undefined) return null;
  return {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    reasoning: 0,
  };
}

// OpenAI-compatible Chat Completions. prompt_tokens includes the cached part, unlike Claude's input_tokens, so the
// cached and cache-written tokens are taken out of it. Where the cache count lives depends on the provider:
// prompt_tokens_details.cached_tokens (OpenAI, OpenRouter, NVIDIA), a top-level cached_tokens (Moonshot) or
// prompt_cache_hit_tokens (DeepSeek-style gateways); OpenRouter also names cache_write_tokens and a cost.
export function chatUsage(usage: unknown): { tokens: Tokens; cost?: number } | null {
  if (!isObject(usage)) return null;
  if (usage.prompt_tokens === undefined && usage.completion_tokens === undefined && usage.total_tokens === undefined) return null;
  const prompt = isObject(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const completion = isObject(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
  const promptTokens = count(usage.prompt_tokens);
  const cachedRaw = count(prompt.cached_tokens) || count(usage.cached_tokens) || count(usage.prompt_cache_hit_tokens);
  // A gateway that reports a cache count larger than the prompt is clamped to it.
  const cacheRead = promptTokens ? Math.min(promptTokens, cachedRaw) : cachedRaw;
  const cacheWriteRaw = count(prompt.cache_write_tokens);
  const cacheWrite = promptTokens ? Math.min(promptTokens - cacheRead, cacheWriteRaw) : cacheWriteRaw;
  // Only a total: what is not the prompt is the answer.
  const output = usage.completion_tokens === undefined ? Math.max(0, count(usage.total_tokens) - promptTokens) : count(usage.completion_tokens);
  const tokens: Tokens = {
    input: Math.max(0, promptTokens - cacheRead - cacheWrite),
    output,
    cacheRead,
    cacheWrite,
    reasoning: Math.min(output, count(completion.reasoning_tokens)),
  };
  const cost = typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : undefined;
  return cost === undefined ? { tokens } : { tokens, cost };
}

// Where a streamed reply carries its usage: the chunk's own `usage` (OpenAI, OpenRouter, NVIDIA, sent last with
// stream_options.include_usage) or, on Moonshot, the choice's.
export function chunkUsage(chunk: unknown): unknown {
  if (!isObject(chunk)) return undefined;
  if (isObject(chunk.usage)) return chunk.usage;
  const choice = Array.isArray(chunk.choices) && isObject(chunk.choices[0]) ? chunk.choices[0] : null;
  return choice && isObject(choice.usage) ? choice.usage : undefined;
}

export function addTokens(a: Tokens | null, b: Tokens | null): Tokens | null {
  if (!a) return b && { ...b };
  if (!b) return { ...a };
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    reasoning: a.reasoning + b.reasoning,
  };
}

// Everything the request went through: the prompt (full, cached and cache-written) and the answer.
export const totalTokens = (t: Tokens) => t.input + t.cacheRead + t.cacheWrite + t.output;

// Adds an entry and keeps the newest `max`, oldest first.
export function pushUsage(log: UsageEntry[], entry: UsageEntry, max = USAGE_LOG_MAX): UsageEntry[] {
  const next = [...log, entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

// What a saved log file holds, kept only where its shape is right (an older or hand-edited file never breaks the panel).
export function readUsageLog(raw: unknown, max = USAGE_LOG_MAX): UsageEntry[] {
  const list = isObject(raw) && Array.isArray(raw.entries) ? raw.entries : Array.isArray(raw) ? raw : [];
  const out: UsageEntry[] = [];
  for (const e of list) {
    if (!isObject(e) || typeof e.at !== "string" || typeof e.kind !== "string" || typeof e.provider !== "string" || typeof e.model !== "string") continue;
    const t = isObject(e.tokens) ? e.tokens : null;
    out.push({
      at: e.at,
      kind: e.kind,
      provider: e.provider,
      model: e.model,
      tokens: t && {
        input: count(t.input),
        output: count(t.output),
        cacheRead: count(t.cacheRead),
        cacheWrite: count(t.cacheWrite),
        reasoning: count(t.reasoning),
      },
      ...(typeof e.cost === "number" && Number.isFinite(e.cost) && e.cost >= 0 && { cost: e.cost }),
      calls: count(e.calls) || 1,
      ok: e.ok !== false,
    });
  }
  return out.slice(-max);
}

export type KindAverage = {
  kind: string;
  // Requests that finished and reported tokens.
  count: number;
  total: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
};

// The average request of each kind ("una historia ~X tokens"), over the ones that finished and reported tokens;
// the most frequent kinds first.
export function usageAverages(log: UsageEntry[]): KindAverage[] {
  const sums = new Map<string, { n: number; t: Tokens }>();
  for (const e of log) {
    if (!e.ok || !e.tokens) continue;
    const s = sums.get(e.kind) ?? { n: 0, t: zeroTokens() };
    s.n++;
    s.t = addTokens(s.t, e.tokens)!;
    sums.set(e.kind, s);
  }
  return [...sums.entries()]
    .map(([kind, { n, t }]) => ({
      kind,
      count: n,
      total: Math.round(totalTokens(t) / n),
      input: Math.round(t.input / n),
      cacheRead: Math.round(t.cacheRead / n),
      cacheWrite: Math.round(t.cacheWrite / n),
      output: Math.round(t.output / n),
    }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

// The app's name for what a route asks the writer.
const KINDS: [RegExp, string][] = [
  [/^\/api\/menu$/, "Menú de temas"],
  [/^\/api\/story$/, "Historia"],
  [/^\/api\/story\/revise$/, "Nota a la historia"],
  [/^\/api\/story\/hooks$/, "5 variantes de gancho"],
  [/^\/api\/board$/, "Storyboard"],
  [/^\/api\/board\/revise$/, "Nota al storyboard"],
  [/^\/api\/shot\/rewrite$/, "Reescribir una toma"],
  [/^\/api\/shot\/segment$/, "Cambiar un solo objeto"],
  [/^\/api\/review$/, "Revisión de lo subido"],
  [/^\/api\/sheet$/, "Hoja de referencia"],
  [/^\/api\/product-shot$/, "Producto recortado"],
  [/^\/api\/motion$/, "Guion del explicativo"],
  [/^\/api\/motion\/revise$/, "Nota al explicativo"],
  [/^\/api\/motion\/review$/, "Control de calidad del explicativo"],
  [/^\/api\/lyrics\/ideas$/, "Ideas para la letra"],
  [/^\/api\/lyrics\/elements$/, "Elementos de la letra"],
  [/^\/api\/lyrics\/plates$/, "Fondos por parte de la letra"],
  [/^\/api\/lyrics\/second$/, "Segunda línea de la letra"],
  [/^\/api\/lyrics\/backgrounds$/, "Fondos de la letra"],
  [/^\/api\/brand\/from-web$/, "Marca desde la web"],
  [/^\/api\/reference\/teardown$/, "Analizar un anuncio"],
  [/^\/api\/still\/ask$/, "Imagen fija"],
  [/^\/api\/mascot\/code$/, "Mascota en código"],
  [/^\/api\/screens\/name$/, "Nombrar pantallas"],
  [/^\/api\/settings\/test$/, "Prueba de conexión"],
  [/^\/api\/ads\/[^/]+\/hooks(\/.*)?$/, "Publicidad: hooks"],
  [/^\/api\/ads\/[^/]+\/meats(\/.*)?$/, "Publicidad: meats"],
  [/^\/api\/ads\/[^/]+\/ctas(\/.*)?$/, "Publicidad: CTAs"],
  [/^\/api\/ads\/[^/]+\/clips(\/.*)?$/, "Publicidad: clips"],
  [/^\/api\/ads\/[^/]+\/review$/, "Publicidad: revisión"],
  [/^\/api\/ads\/[^/]+\/batches(\/.*)?$/, "Publicidad: tanda"],
];

export function usageKind(path: string): string {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  for (const [pattern, name] of KINDS) if (pattern.test(clean)) return name;
  if (/^\/api\/ads\//.test(clean)) return "Publicidad";
  return clean.replace(/^\/api\//, "") || "Otro";
}
