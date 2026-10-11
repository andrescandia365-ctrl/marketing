// Idea 52 (first part): every writer reply's usage, Claude's or an OpenAI-compatible provider's, in one shape.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addTokens,
  chatUsage,
  chunkUsage,
  claudeUsage,
  pushUsage,
  readUsageLog,
  totalTokens,
  usageAverages,
  usageKind,
  type UsageEntry,
} from "../shared/usage.ts";

test("Claude: input apart from cache read and cache write", () => {
  const t = claudeUsage({ input_tokens: 812, output_tokens: 3400, cache_read_input_tokens: 9100, cache_creation_input_tokens: 0, service_tier: "standard" });
  assert.deepEqual(t, { input: 812, output: 3400, cacheRead: 9100, cacheWrite: 0, reasoning: 0 });
  assert.equal(totalTokens(t!), 13312);
  // First request of the day writes the cache; null cache fields count as zero.
  assert.deepEqual(claudeUsage({ input_tokens: 500, output_tokens: 20, cache_read_input_tokens: null, cache_creation_input_tokens: 9100 }), {
    input: 500,
    output: 20,
    cacheRead: 0,
    cacheWrite: 9100,
    reasoning: 0,
  });
  assert.equal(claudeUsage(undefined), null);
  assert.equal(claudeUsage({}), null);
});

test("OpenAI shape (NVIDIA): cached tokens are taken out of prompt_tokens, reasoning kept apart", () => {
  const r = chatUsage({
    prompt_tokens: 12000,
    completion_tokens: 2500,
    total_tokens: 14500,
    prompt_tokens_details: { cached_tokens: 8000 },
    completion_tokens_details: { reasoning_tokens: 1800 },
  });
  assert.deepEqual(r, { tokens: { input: 4000, output: 2500, cacheRead: 8000, cacheWrite: 0, reasoning: 1800 } });
  assert.equal(totalTokens(r!.tokens), 14500);
  // No details at all: everything is input.
  assert.deepEqual(chatUsage({ prompt_tokens: 100, completion_tokens: 7, total_tokens: 107 })?.tokens, {
    input: 100,
    output: 7,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  });
});

test("Moonshot: cached_tokens at the top of usage", () => {
  const r = chatUsage({ prompt_tokens: 9000, completion_tokens: 1200, total_tokens: 10200, cached_tokens: 6000 });
  assert.deepEqual(r?.tokens, { input: 3000, output: 1200, cacheRead: 6000, cacheWrite: 0, reasoning: 0 });
});

test("OpenRouter: cache writes and the provider's cost", () => {
  const r = chatUsage({
    prompt_tokens: 10000,
    completion_tokens: 900,
    total_tokens: 10900,
    cost: 0.0123,
    prompt_tokens_details: { cached_tokens: 2000, cache_write_tokens: 7000 },
    completion_tokens_details: { reasoning_tokens: 0 },
  });
  assert.deepEqual(r, { tokens: { input: 1000, output: 900, cacheRead: 2000, cacheWrite: 7000, reasoning: 0 }, cost: 0.0123 });
  assert.equal(totalTokens(r!.tokens), 10900);
});

test("odd shapes never go negative or break", () => {
  // A cache count larger than the prompt is clamped.
  assert.deepEqual(chatUsage({ prompt_tokens: 50, completion_tokens: 5, cached_tokens: 80 })?.tokens, {
    input: 0,
    output: 5,
    cacheRead: 50,
    cacheWrite: 0,
    reasoning: 0,
  });
  // Only a total: the answer is what is not the prompt.
  assert.equal(chatUsage({ prompt_tokens: 40, total_tokens: 100 })?.tokens.output, 60);
  assert.equal(chatUsage({ prompt_tokens: "40", completion_tokens: -3 })?.tokens.output, 0);
  assert.equal(chatUsage(null), null);
  assert.equal(chatUsage({ id: "x" }), null);
  assert.equal(chatUsage({ prompt_tokens: 1, completion_tokens: 1, cost: "free" })?.cost, undefined);
});

test("streamed usage: on the chunk (include_usage) or inside the choice (Moonshot)", () => {
  const openai = { id: "c", choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } };
  assert.deepEqual(chunkUsage(openai), { prompt_tokens: 3, completion_tokens: 4 });
  const moonshot = { choices: [{ index: 0, delta: {}, finish_reason: "stop", usage: { prompt_tokens: 8, completion_tokens: 2, cached_tokens: 5 } }] };
  assert.deepEqual(chatUsage(chunkUsage(moonshot))?.tokens, { input: 3, output: 2, cacheRead: 5, cacheWrite: 0, reasoning: 0 });
  assert.equal(chunkUsage({ choices: [{ delta: { content: "hola" } }] }), undefined);
  // Some gateways send usage: null on every chunk but the last.
  assert.equal(chunkUsage({ choices: [], usage: null }), undefined);
});

test("a retry adds to the same request", () => {
  const a = claudeUsage({ input_tokens: 10, output_tokens: 1 });
  assert.equal(addTokens(null, null), null);
  assert.deepEqual(addTokens(a, null), a);
  assert.deepEqual(addTokens(a, a), { input: 20, output: 2, cacheRead: 0, cacheWrite: 0, reasoning: 0 });
});

const entry = (kind: string, total: number | null, ok = true): UsageEntry => ({
  at: "2026-10-10T12:00:00.000Z",
  kind,
  provider: "claude",
  model: "claude-opus-5-5",
  tokens: total === null ? null : { input: total - 100, output: 100, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
  calls: 1,
  ok,
});

test("the log keeps the newest 200 and averages each kind over finished requests with tokens", () => {
  let log: UsageEntry[] = [];
  for (let i = 0; i < 205; i++) log = pushUsage(log, { ...entry("Historia", 1000), at: String(i) });
  assert.equal(log.length, 200);
  assert.equal(log[0].at, "5");
  assert.equal(log.at(-1)!.at, "204");

  const avg = usageAverages([entry("Historia", 10000), entry("Historia", 14000), entry("Historia", 99999, false), entry("Storyboard", null), entry("Menú de temas", 3000)]);
  assert.deepEqual(
    avg.map((a) => [a.kind, a.count, a.total]),
    [
      ["Historia", 2, 12000],
      ["Menú de temas", 1, 3000],
    ],
  );
});

test("a saved log file is read back safely", () => {
  const good = entry("Historia", 500);
  const back = readUsageLog({ entries: [good, { kind: "x" }, null, { ...good, tokens: { input: -4, output: "3" }, calls: 0, cost: -1 }] });
  assert.equal(back.length, 2);
  assert.deepEqual(back[0], good);
  assert.deepEqual(back[1].tokens, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 });
  assert.equal(back[1].calls, 1);
  assert.equal(back[1].cost, undefined);
  assert.deepEqual(readUsageLog("not json"), []);
  assert.deepEqual(readUsageLog([good]), [good]);
});

test("the kind of request comes from the route", () => {
  assert.equal(usageKind("/api/story"), "Historia");
  assert.equal(usageKind("/api/story/revise"), "Nota a la historia");
  assert.equal(usageKind("/api/board/"), "Storyboard");
  assert.equal(usageKind("/api/motion?x=1"), "Guion del explicativo");
  assert.equal(usageKind("/api/ads/iman/hooks"), "Publicidad: hooks");
  assert.equal(usageKind("/api/ads/iman/batches/b1/run"), "Publicidad: tanda");
  assert.equal(usageKind("/api/ads/iman/offer"), "Publicidad");
  assert.equal(usageKind("/api/something/new"), "something/new");
});

// The OpenAI-compatible path end to end, with a stand-in for the provider: the usage of the streamed reply reaches
// the sink, and a provider that rejects stream_options is asked again without it.
test("askKimi reports streamed usage and drops stream_options when rejected", async () => {
  const { askKimi } = await import("../server/kimi.ts");
  const { z } = await import("zod");
  const realFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    bodies.push(body);
    if (body.stream_options) return new Response(JSON.stringify({ error: { message: "Unrecognized field stream_options" } }), { status: 400 });
    const sse = [
      { model: "kimi-k3", choices: [{ delta: { content: '{"word":' } }] },
      { choices: [{ delta: { content: '"listo"}' }, finish_reason: "stop", usage: { prompt_tokens: 900, completion_tokens: 12, cached_tokens: 600 } }] },
    ]
      .map((c) => `data: ${JSON.stringify(c)}\n\n`)
      .join("");
    return new Response(`${sse}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  try {
    const seen: unknown[] = [];
    const reply = await askKimi(
      { label: "Prueba", baseUrl: "http://stand-in.test/v1", key: "k", model: "kimi-k3" },
      ["system"],
      "prompt",
      z.object({ word: z.string() }),
      [],
      (tokens, cost, model) => seen.push({ tokens, cost, model }),
    );
    assert.deepEqual(reply, { word: "listo" });
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0].stream_options, { include_usage: true });
    assert.equal(bodies[1].stream_options, undefined);
    assert.deepEqual(seen, [{ tokens: { input: 300, output: 12, cacheRead: 600, cacheWrite: 0, reasoning: 0 }, cost: undefined, model: "kimi-k3" }]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
