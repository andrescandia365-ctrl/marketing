// Kimi (Moonshot AI) through its OpenAI-compatible Chat Completions API.
// Streams so a long reasoning pass never trips a response-header timeout; only `content` is parsed,
// never `reasoning_content`.
import { z } from "zod";

export const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k3";
const BASE_URL = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/+$/, "");

export function kimiKey(): string | undefined {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
}

export class KimiError extends Error {}

type Message = { role: "system" | "user" | "assistant"; content: string };
type Format = "json_schema" | "json_object";

// Remembered after the first rejection so later requests skip straight to JSON mode.
let format: Format = "json_schema";

export async function askKimi<T>(system: string[], prompt: string, schema: z.ZodType<T>): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);
  delete (jsonSchema as { $schema?: string }).$schema;
  const messages: Message[] = [
    ...system.map((content) => ({ role: "system" as const, content })),
    { role: "user", content: prompt },
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

async function complete(messages: Message[], jsonSchema: object): Promise<string> {
  const key = kimiKey();
  if (!key) throw new KimiError("Falta KIMI_API_KEY.");

  // JSON mode has no schema slot, so the schema goes into the prompt.
  const sent =
    format === "json_object"
      ? [
          ...messages.slice(0, -1),
          {
            ...messages[messages.length - 1],
            content: `${messages[messages.length - 1].content}\n\nReply with one JSON object that follows this JSON schema exactly:\n${JSON.stringify(jsonSchema)}`,
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

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new KimiError(`No se pudo conectar con Kimi (${BASE_URL}): ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
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

  const { content, finish } = await readStream(response);
  if (finish === "length") {
    throw new KimiError("La respuesta se cortó por larga. Probá con un formato corto o menos temas.");
  }
  if (finish === "content_filter") throw new KimiError("Kimi no aceptó este pedido. Reformulalo y probá de nuevo.");
  if (!content.trim()) throw new KimiError("Kimi devolvió una respuesta vacía. Probá de nuevo.");
  return content;
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

type Chunk = {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  error?: { message?: string };
};

async function readStream(response: Response): Promise<{ content: string; finish: string | null }> {
  if (!response.body) throw new KimiError("Kimi no devolvió nada.");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finish: string | null = null;

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as Chunk;
    if (chunk.error) throw new KimiError(`Kimi cortó la respuesta: ${chunk.error.message ?? "error"}`);
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) content += choice.delta.content;
    if (choice?.finish_reason) finish = choice.finish_reason;
  };

  for await (const piece of response.body) {
    buffer += decoder.decode(piece, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line.trim());
  }
  handle(buffer.trim());
  return { content, finish };
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
