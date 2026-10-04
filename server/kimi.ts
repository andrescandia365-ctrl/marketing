// OpenAI-compatible Chat Completions: Kimi (Moonshot), NVIDIA, OpenRouter or another gateway, whichever the
// "Modelos" section picks (server/settings.ts).
// Streams so a long reasoning pass never trips a response-header timeout; only `content` is parsed,
// never `reasoning_content`. An empty reply is retried once, and the error says why it was empty.
import { z } from "zod";

// Where a request goes: the provider's name for messages, its base URL, key and model.
export type ChatTarget = { label: string; baseUrl: string; key: string; model: string };

export class KimiError extends Error {}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Message = { role: "system" | "user" | "assistant"; content: string | Part[] };
type Format = "json_schema" | "json_object";

// What each provider and model accepts, learnt from its rejections and kept for the rest of the run.
type Learnt = {
  // JSON mode after the first rejection of a strict schema.
  format: Format;
  // Lower means less invention. Optional: some reasoning models only take their own value.
  temperature: number | undefined;
  // Room for the reasoning and the answer. Some providers cap it lower and reject it.
  maxTokens: number | undefined;
};
const learnt = new Map<string, Learnt>();

function learntFor(target: ChatTarget): Learnt {
  const id = `${target.baseUrl} ${target.model}`;
  let l = learnt.get(id);
  if (!l) {
    const temperature = process.env.KIMI_TEMPERATURE ? Number(process.env.KIMI_TEMPERATURE) : undefined;
    const maxTokens = Number(process.env.KIMI_MAX_TOKENS || 32768);
    l = {
      format: "json_schema",
      temperature: temperature !== undefined && Number.isFinite(temperature) ? temperature : undefined,
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined,
    };
    learnt.set(id, l);
  }
  return l;
}

// Pictures go in the user message as image_url parts (data URLs); the model must be able to see them.
export async function askKimi<T>(
  target: ChatTarget,
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

  const l = learntFor(target);
  let text: string;
  try {
    text = await complete(target, messages, jsonSchema);
  } catch (error) {
    if (!(error instanceof FormatRejected)) throw error;
    l.format = "json_object";
    text = await complete(target, messages, jsonSchema);
  }

  const first = parse(text, schema);
  if (first.ok) return first.value;

  // One retry with the validation error, then give up.
  const retry = await complete(
    target,
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
  throw new KimiError(`${target.label} devolvió una respuesta con otra forma. Probá de nuevo o elegí otro modelo en Modelos.`);
}

class FormatRejected extends Error {}

class ConnectionLost extends KimiError {}

function appendText(content: string | Part[], text: string): string | Part[] {
  return typeof content === "string" ? content + text : [...content, { type: "text", text }];
}

type Reply = { content: string; finish: string | null; reasoning: number; ended: boolean };

// One request, retried once when it comes back empty (a cut connection or a reasoning pass that used up the room).
async function complete(target: ChatTarget, messages: Message[], jsonSchema: object): Promise<string> {
  const name = target.label;
  let reply: Reply;
  try {
    reply = await request(target, messages, jsonSchema);
  } catch (error) {
    if (!(error instanceof ConnectionLost)) throw error;
    console.warn(`${error.message}; reintento.`);
    reply = await request(target, messages, jsonSchema);
  }
  if (!reply.content.trim() && reply.finish !== "length" && reply.finish !== "content_filter") {
    console.warn(`${name} devolvió vacío (finish=${reply.finish}, razonamiento=${reply.reasoning} caracteres); reintento.`);
    reply = await request(target, messages, jsonSchema);
  }
  if (reply.finish === "length") {
    throw new KimiError(
      reply.content.trim()
        ? "La respuesta se cortó por larga. Probá con un formato corto o menos temas."
        : `${name} se quedó sin espacio pensando y no llegó a escribir. Subí KIMI_MAX_TOKENS o poné KIMI_REASONING_EFFORT=low en .env.`,
    );
  }
  if (reply.finish === "content_filter") throw new KimiError(`${name} no aceptó este pedido. Reformulalo y probá de nuevo.`);
  if (!reply.content.trim()) {
    if (!reply.ended) throw new KimiError(`La conexión con ${name} se cortó antes de terminar (dos veces). Probá de nuevo en un rato.`);
    if (reply.reasoning > 0) {
      throw new KimiError(
        `${name} pensó pero no escribió la respuesta (dos veces). Probá de nuevo; si se repite, poné KIMI_REASONING_EFFORT=low en .env.`,
      );
    }
    throw new KimiError(`${name} devolvió una respuesta vacía dos veces. Probá de nuevo en un rato o elegí otro modelo en Modelos.`);
  }
  return reply.content;
}

async function request(target: ChatTarget, messages: Message[], jsonSchema: object): Promise<Reply> {
  const { key, baseUrl, label: name } = target;
  if (!key) throw new KimiError(`Falta la clave de ${name}. Cargala en Modelos.`);
  const l = learntFor(target);
  const { format, temperature, maxTokens } = l;

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
    model: target.model,
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
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ConnectionLost(`No se pudo conectar con ${name} (${baseUrl}): ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    if (response.status === 400 && temperature !== undefined && /temperature/i.test(detail)) {
      console.warn(`${name} no acepta temperature=${temperature}; sigo sin ella. (${detail})`);
      l.temperature = undefined;
      return request(target, messages, jsonSchema);
    }
    if (response.status === 400 && maxTokens !== undefined && /max_tokens|max_completion_tokens|maximum/i.test(detail)) {
      console.warn(`${name} no acepta max_tokens=${maxTokens}; sigo sin él. (${detail})`);
      l.maxTokens = undefined;
      return request(target, messages, jsonSchema);
    }
    if (response.status === 400 && format === "json_schema" && /response_format|json_schema|schema/i.test(detail)) {
      throw new FormatRejected(detail);
    }
    if (response.status === 401 || response.status === 403) {
      throw new KimiError(`La clave de ${name} fue rechazada. Revisala en Modelos.`);
    }
    if (response.status === 429) {
      throw new KimiError(`${name} no aceptó más pedidos por ahora (límite o saldo): ${detail}`);
    }
    if (response.status === 404) throw new KimiError(`${name} no encontró el modelo "${target.model}". Elegí otro en Modelos. (${detail})`);
    throw new KimiError(`${name} devolvió un error (${response.status}): ${detail}`);
  }

  // Some gateways answer with one JSON body even when asked to stream.
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) return readWhole(response, name);
  return readStream(response, name);
}

type Choice = {
  delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  text?: string | null;
  finish_reason?: string | null;
};

async function readWhole(response: Response, name: string): Promise<Reply> {
  const raw = await response.text();
  let data: { choices?: Choice[]; error?: { message?: string } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new KimiError(`${name} devolvió algo que no se puede leer: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new KimiError(`${name} devolvió un error: ${data.error.message ?? "sin detalle"}`);
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

async function readStream(response: Response, name: string): Promise<Reply> {
  if (!response.body) throw new KimiError(`${name} no devolvió nada.`);
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
    if (chunk.error) throw new KimiError(`${name} cortó la respuesta: ${chunk.error.message ?? "error"}`);
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

// The provider's model list (GET /models). OpenRouter also says which models see pictures and which take a JSON
// schema; the others list names only.
export type ListedModel = { id: string; name: string; vision: boolean | null; structured: boolean | null };

export async function listChatModels(target: Omit<ChatTarget, "model">): Promise<ListedModel[]> {
  let response: Response;
  try {
    response = await fetch(`${target.baseUrl}/models`, { headers: { Authorization: `Bearer ${target.key}` } });
  } catch (error) {
    throw new KimiError(`No se pudo conectar con ${target.label}: ${(error as Error).message}`);
  }
  if (response.status === 401 || response.status === 403) throw new KimiError(`La clave de ${target.label} fue rechazada.`);
  if (!response.ok) throw new KimiError(`${target.label} no devolvió la lista de modelos (${response.status}): ${await errorDetail(response)}`);
  const data = (await response.json().catch(() => ({}))) as {
    data?: {
      id?: string;
      name?: string;
      architecture?: { input_modalities?: string[] };
      supported_parameters?: string[];
    }[];
  };
  return (data.data ?? [])
    .filter((m): m is NonNullable<typeof m> & { id: string } => typeof m?.id === "string")
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      vision: m.architecture?.input_modalities ? m.architecture.input_modalities.includes("image") : null,
      structured: m.supported_parameters ? m.supported_parameters.some((p) => p === "structured_outputs" || p === "response_format") : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
