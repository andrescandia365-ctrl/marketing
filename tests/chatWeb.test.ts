// "Buscar en la web" in the chat, against a stand-in for the Claude API on this computer: the search tool goes in the
// request only when it is on, a paused reply (pause_turn) is sent back unchanged and resumed, the cited pages come
// back once each, and the searches are counted for the cost.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

type Sent = { tools?: { type: string; name: string; max_uses?: number }[]; messages: { role: string; content: unknown }[]; system: { text: string }[] };
const sent: Sent[] = [];
let replies: object[][] = [];

const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const start = (stop = null) => ({
  type: "message_start",
  message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: stop, usage: { input_tokens: 100, output_tokens: 0 } },
});
const end = (stop: string, searches: number) => [
  { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20, server_tool_use: { web_search_requests: searches } } },
  { type: "message_stop" },
];
const citation = (url: string, title: string) => ({ type: "web_search_result_location", url, title, cited_text: "x", encrypted_index: "e" });

const server = createServer(async (req: IncomingMessage, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  sent.push(JSON.parse(body));
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(sse(replies.shift() ?? []));
});

let chatClaude: typeof import("../server/claude.ts").chatClaude;
before(async () => {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as { port: number };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.PROJECTS_DIR = mkdtempSync(join(tmpdir(), "chatweb-"));
  ({ chatClaude } = await import("../server/claude.ts"));
});
after(() => server.close());

test("with the web on, a paused reply is resumed with the same assistant turn, and its sources and searches add up", async () => {
  sent.length = 0;
  replies = [
    [
      start(),
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"especieros giratorios precio"}' } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] } },
      { type: "content_block_stop", index: 1 },
      { type: "content_block_start", index: 2, content_block: { type: "text", text: "", citations: [] } },
      { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "Rondan los 20 mil. " } },
      { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: citation("https://a.example/p", "Página A") } },
      { type: "content_block_stop", index: 2 },
      ...end("pause_turn", 1),
    ],
    [
      start(),
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Listo." } },
      { type: "content_block_delta", index: 0, delta: { type: "citations_delta", citation: citation("https://a.example/p", "Página A") } },
      { type: "content_block_delta", index: 0, delta: { type: "citations_delta", citation: citation("https://b.example/q", "Página B") } },
      { type: "content_block_stop", index: 0 },
      ...end("end_turn", 1),
    ],
  ];
  const streamed: string[] = [];
  const queries: string[] = [];
  const reply = await chatClaude({
    model: "claude-sonnet-5-5",
    effort: "low",
    system: ["base"],
    messages: [{ role: "user", content: "¿Cuánto sale un especiero giratorio?" }],
    web: true,
    onText: (d) => streamed.push(d),
    onSearch: (q) => queries.push(q),
  });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].tools?.map((t) => [t.type, t.max_uses]), [["web_search_20260209", 5]]);
  assert.equal(sent[1].messages.length, 2);
  assert.equal(sent[1].messages[1].role, "assistant");
  assert.deepEqual(
    (sent[1].messages[1].content as { type: string }[]).map((b) => b.type),
    ["server_tool_use", "web_search_tool_result", "text"],
  );
  assert.equal(reply.text, "Rondan los 20 mil. Listo.");
  assert.equal(streamed.join(""), "Rondan los 20 mil. Listo.");
  assert.deepEqual(queries, ["especieros giratorios precio"]);
  assert.equal(reply.stop, "end_turn");
  assert.equal(reply.searches, 2);
  assert.deepEqual(reply.sources, [
    { url: "https://a.example/p", title: "Página A" },
    { url: "https://b.example/q", title: "Página B" },
  ]);
  assert.equal(reply.tokens?.input, 200);
});

test("with the web off, no tool is sent; Haiku gets the basic search tool", async () => {
  sent.length = 0;
  const plain = () => [
    start(),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hola." } },
    { type: "content_block_stop", index: 0 },
    ...end("end_turn", 0),
  ];
  replies = [plain(), plain()];
  const off = await chatClaude({ model: "claude-sonnet-5-5", effort: "low", system: ["base"], messages: [{ role: "user", content: "hola" }], onText: () => undefined });
  assert.equal(sent[0].tools, undefined);
  assert.equal(off.searches, 0);
  assert.deepEqual(off.sources, []);
  await chatClaude({ model: "claude-haiku-5-5", effort: "low", system: ["base"], messages: [{ role: "user", content: "hola" }], web: true, onText: () => undefined });
  assert.equal(sent[1].tools?.[0].type, "web_search_20250305");
});
