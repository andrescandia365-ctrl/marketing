// Kimi (Moonshot AI) through its OpenAI-compatible Chat Completions API.
// Streams so a long reasoning pass never trips a response-header timeout; only `content` is parsed,
// never `reasoning_content`. An empty reply is retried once, and the error says why it was empty.
import { z } from "zod";

export const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k3";
const BASE_URL = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/+$/, "");

export function kimiKey(): string | undefined {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
}

export class KimiError extends Error {}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Message = { role: "system" | "user" | "assistant"; content: string | Part[] };
type Format = "json_schema" | "json_object";

// Remembered after the first rejection so later requests skip straight to JSON mode.
let format: Format = "json_schema";
// Lower means less invention. Optional: some reasoning models only take their own value, so a rejected
// temperature is dropped for the rest of the run.
let temperature: number | undefined = process.env.KIMI_TEMPERATURE ? Number(process.env.KIMI_TEMPERATURE) : undefined;
if (temperature !== undefined && !Number.isFinite(temperature)) temperature = undefined;
// Room for the reasoning and the answer. Some providers cap it lower and reject it: then it is dropped too.
let maxTokens: number | undefined = Number(process.env.KIMI_MAX_TOKENS || 32768);
if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = undefined;

// Pictures go in the user message as image_url parts (data URLs); the model must be able to see them.
export async function askKimi<T>(
  system: string[],
  prompt: string,
  schema: z.ZodType<T>,
  pictures: { label: string; jpeg: string }[] = [],
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);
  delete (jsonSchema as { $schema?: string }).$schema;
  const messages: Message[] = [
    ...system.map((content) => ({ role: "system" as const, content })),
    {
      role: "user",
      content: pictures.length
        ? [
            ...pictures.flatMap((p): Part[] => [
              { type: "text", text: p.label },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.jpeg}` } },
            ]),
            { type: "text", text: prompt },
          ]
        : prompt,
    },
  ];

  let text: string;
  try {
    text = await complete(messages, jsonSchema);
  } catch (error) {
    if (!(error instanceof FormatRejected)) throw error;
    format = "json_object";
    text = await complete(messages, jsonSchema);
  }

  const first = parse(text, schema);
  if (first.ok) return first.value;

  // One retry with the validation error, then give up.
  const retry = await complete(
    [
      ...messages,
      { role: "assistant", content: text },
      {
        role: "user",
        content: `That reply did not match the JSON schema: ${first.error}\nReply again with only the corrected JSON object.`,
      },
    ],
    jsonSchema,
  );
  const second = parse(retry, schema);
  if (second.ok) return second.value;
  throw new KimiError("Kimi devolvió una respuesta con otra forma. Probá de nuevo.");
}

class FormatRejected extends Error {}

class ConnectionLost extends KimiError {}

function appendText(content: string | Part[], text: string): string | Part[] {
  return typeof content === "string" ? content + text : [...content, { type: "text", text }];
}

type Reply = { content: string; finish: string | null; reasoning: number; ended: boolean };

// One request, retried once when it comes back empty (a cut connection or a reasoning pass that used up the room).
async function complete(messages: Message[], jsonSchema: object): Promise<string> {
  let reply: Reply;
  try {
    reply = await request(messages, jsonSchema);
  } catch (error) {
    if (!(error instanceof ConnectionLost)) throw error;
    console.warn(`${error.message}; reintento.`);
    reply = await request(messages, jsonSchema);
  }
  if (!reply.content.trim() && reply.finish !== "length" && reply.finish !== "content_filter") {
    console.warn(`Kimi devolvió vacío (finish=${reply.finish}, razonamiento=${reply.reasoning} caracteres); reintento.`);
    reply = await request(messages, jsonSchema);
  }
  if (reply.finish === "length") {
    throw new KimiError(
      reply.content.trim()
        ? "La respuesta se cortó por larga. Probá con un formato corto o menos temas."
        : "Kimi se quedó sin espacio pensando y no llegó a escribir. Subí KIMI_MAX_TOKENS o poné KIMI_REASONING_EFFORT=low en .env.",
    );
  }
  if (reply.finish === "content_filter") throw new KimiError("Kimi no aceptó este pedido. Reformulalo y probá de nuevo.");
  if (!reply.content.trim()) {
    if (!reply.ended) throw new KimiError("La conexión con Kimi se cortó antes de terminar (dos veces). Probá de nuevo en un rato.");
    if (reply.reasoning > 0) {
      throw new KimiError(
        "Kimi pensó pero no escribió la respuesta (dos veces). Probá de nuevo; si se repite, poné KIMI_REASONING_EFFORT=low en .env.",
      );
    }
    throw new KimiError("Kimi devolvió una respuesta vacía dos veces. Probá de nuevo en un rato o revisá el modelo (KIMI_MODEL).");
  }
  return reply.content;
}

async function request(messages: Message[], jsonSchema: object): Promise<Reply> {
  const key = kimiKey();
  if (!key) throw new KimiError("Falta KIMI_API_KEY.");

  // JSON mode has no schema slot, so the schema goes into the prompt.
  const sent =
    format === "json_object"
      ? [
          ...messages.slice(0, -1),
          {
            ...messages[messages.length - 1],
            content: appendText(
              messages[messages.length - 1].content,
              `\n\nReply with one JSON object that follows this JSON schema exactly:\n${JSON.stringify(jsonSchema)}`,
            ),
          },
        ]
      : messages;

  const body: Record<string, unknown> = {
    model: KIMI_MODEL,
    messages: sent,
    stream: true,
    response_format:
      format === "json_schema"
        ? { type: "json_schema", json_schema: { name: "reply", strict: true, schema: jsonSchema } }
        : { type: "json_object" },
  };
  if (process.env.KIMI_REASONING_EFFORT) body.reasoning_effort = process.env.KIMI_REASONING_EFFORT;
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ConnectionLost(`No se pudo conectar con Kimi (${BASE_URL}): ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    if (response.status === 400 && temperature !== undefined && /temperature/i.test(detail)) {
      console.warn(`Kimi no acepta temperature=${temperature}; sigo sin ella. (${detail})`);
      temperature = undefined;
      return request(messages, jsonSchema);
    }
    if (response.status === 400 && maxTokens !== undefined && /max_tokens|max_completion_tokens|maximum/i.test(detail)) {
      console.warn(`Kimi no acepta max_tokens=${maxTokens}; sigo sin él. (${detail})`);
      maxTokens = undefined;
      return request(messages, jsonSchema);
    }
    if (response.status === 400 && format === "json_schema" && /response_format|json_schema|schema/i.test(detail)) {
      throw new FormatRejected(detail);
    }
    if (response.status === 401 || response.status === 403) {
      throw new KimiError("La clave de Kimi fue rechazada. Revisá KIMI_API_KEY (y KIMI_BASE_URL si tu cuenta es de China).");
    }
    if (response.status === 429) {
      throw new KimiError(`Kimi no aceptó más pedidos por ahora (límite o saldo): ${detail}`);
    }
    throw new KimiError(`Kimi devolvió un error (${response.status}): ${detail}`);
  }

  // Some gateways answer with one JSON body even when asked to stream.
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) return readWhole(response);
  return readStream(response);
}

type Choice = {
  delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  text?: string | null;
  finish_reason?: string | null;
};

async function readWhole(response: Response): Promise<Reply> {
  const raw = await response.text();
  let data: { choices?: Choice[]; error?: { message?: string } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new KimiError(`Kimi devolvió algo que no se puede leer: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new KimiError(`Kimi devolvió un error: ${data.error.message ?? "sin detalle"}`);
  const choice = data.choices?.[0];
  const m = choice?.message;
  return {
    content: m?.content ?? choice?.text ?? "",
    finish: choice?.finish_reason ?? null,
    reasoning: (m?.reasoning_content ?? m?.reasoning ?? "").length,
    ended: true,
  };
}

async function errorDetail(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const err = parsed.error;
    return (typeof err === "string" ? err : err?.message) || parsed.message || raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300) || response.statusText;
  }
}

type Chunk = { choices?: Choice[]; error?: { message?: string } };

async function readStream(response: Response): Promise<Reply> {
  if (!response.body) throw new KimiError("Kimi no devolvió nada.");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = 0;
  let finish: string | null = null;
  let ended = false;

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") ended = true;
    if (!data || data === "[DONE]") return;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      return;
    }
    if (chunk.error) throw new KimiError(`Kimi cortó la respuesta: ${chunk.error.message ?? "error"}`);
    const choice = chunk.choices?.[0];
    const part = choice?.delta ?? choice?.message;
    if (part?.content) content += part.content;
    else if (choice?.text) content += choice.text;
    reasoning += (part?.reasoning_content ?? part?.reasoning ?? "").length;
    if (choice?.finish_reason) finish = choice.finish_reason;
  };

  try {
    for await (const piece of response.body) {
      buffer += decoder.decode(piece, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handle(line.trim());
    }
  } catch (error) {
    if (error instanceof KimiError) throw error;
    // The connection dropped mid-answer: what arrived is kept and the caller decides.
    return { content, finish, reasoning, ended: false };
  }
  handle(buffer.trim());
  return { content, finish, reasoning, ended: ended || finish !== null };
}

function parse<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  // Tolerate a code fence or a sentence around the object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "no JSON object found" };
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return { ok: false, error: `invalid JSON (${(error as Error).message})` };
  }
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}
