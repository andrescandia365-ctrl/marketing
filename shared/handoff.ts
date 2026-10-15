// "Sin clave": with no AI key, every writer task can go to claude.ai by copy and paste. The server builds the exact
// text the writer would get (system blocks, the request, and a closing line with the JSON schema), the person pastes
// it into claude.ai, and pastes the reply back. The reply is read here as tolerantly as server/kimi.ts reads a model's
// reply (a code fence, prose around it, <think> blocks, a wrapper object, trailing commas), then checked with the
// same zod schema the writer's answer goes through.
import { z } from "zod";
import { checkErrorText } from "./errors.ts";

// What a writer route takes on top of its own fields: "prompt" returns the text to copy; "paste" reads a reply.
export const HandoffSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("prompt") }),
  z.object({ mode: z.literal("paste"), reply: z.string().min(1, "Pegá la respuesta de claude.ai.").max(2_000_000) }),
]);
export type Handoff = z.infer<typeof HandoffSchema>;

// What a "prompt" request answers.
export type PromptOnly = { prompt: string; chars: number };

// The line that closes every copied prompt, before the schema.
export const ANSWER_LINE = "Answer with ONLY one JSON object that matches this schema: no text before or after it, no code fence, these exact field names.";

export function jsonSchemaOf(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

// The whole text for claude.ai: the system blocks as the writer gets them, then the request, then the schema.
export function assemblePrompt(system: string[], prompt: string, schema: z.ZodType): string {
  return [
    "You are working as the writer for a content app. Read the instructions (SYSTEM) and do the task (REQUEST). Your reply is pasted back into the app and read by a program.",
    "",
    "===== SYSTEM =====",
    "",
    system.join("\n\n---\n\n"),
    "",
    "===== REQUEST =====",
    "",
    prompt.trim(),
    "",
    "===== ANSWER FORMAT =====",
    "",
    ANSWER_LINE,
    "",
    JSON.stringify(jsonSchemaOf(schema)),
  ].join("\n");
}

// How the app talks about a prompt's size. claude.ai turns a long paste into an attachment, which still works.
export const LONG_PROMPT = 40_000;
export const VERY_LONG_PROMPT = 150_000;

export function promptSizeText(chars: number): string {
  const size = chars < 1000 ? `${chars} caracteres` : `${Math.round(chars / 1000)} mil caracteres`;
  if (chars > VERY_LONG_PROMPT) {
    return `Es muy largo (${size}). Pegalo entero en un chat nuevo; si claude.ai dice que no entra, achicá el pedido (menos temas, una historia más corta) y copialo de nuevo.`;
  }
  if (chars > LONG_PROMPT) return `Es largo (${size}). Pegalo entero: claude.ai lo puede mostrar como un archivo adjunto y está bien.`;
  return `${size}. Pegalo entero en un chat nuevo.`;
}

// Reasoning written into the reply: <think>…</think>, or only the closing tag.
export function stripThinking(text: string): string {
  const t = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  const close = t.search(/<\/think(?:ing)?>/i);
  return close >= 0 ? t.slice(t.indexOf(">", close) + 1) : t;
}

// A comma right before } or ], outside strings, is dropped (a common slip in hand-edited or model-written JSON).
export function dropTrailingCommas(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (inString) {
      out += c;
      if (c === "\\") out += json[++i] ?? "";
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    if (c === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j++;
      if (json[j] === "}" || json[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

function parseLoose(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(dropTrailingCommas(text)) };
    } catch {
      return { ok: false };
    }
  }
}

// Every top-level JSON object in the text, in order (a code fence, a sentence or a second object around it is fine).
export function jsonObjects(text: string): unknown[] {
  const found: unknown[] = [];
  let i = text.indexOf("{");
  while (i >= 0) {
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inString) {
        if (c === "\\") j++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) break;
    const parsed = parseLoose(text.slice(i, end + 1));
    if (parsed.ok) {
      found.push(parsed.value);
      i = text.indexOf("{", end + 1);
    } else {
      i = text.indexOf("{", i + 1);
    }
  }
  return found;
}

// What a model may have wrapped the answer in: {"reply": {...}}, {"json": {...}} or a one-item array.
export function candidates(value: unknown): unknown[] {
  const out = [value];
  if (Array.isArray(value) && value.length === 1) out.push(value[0]);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.values(value);
    if (entries.length === 1 && entries[0] && typeof entries[0] === "object") out.push(entries[0]);
  }
  return out;
}

export type ReadReply<T> = { ok: true; value: T } | { ok: false; error: z.ZodError | null };

// The first object (or what it wraps) that passes the schema. When none does, the error of the candidate closest to
// passing (the fewest problems), so the message names the field that is really wrong.
export function readReply<T>(text: string, schema: z.ZodType<T>): ReadReply<T> {
  const objects = jsonObjects(stripThinking(text));
  let best: z.ZodError | null = null;
  for (const object of objects) {
    for (const candidate of candidates(object)) {
      const result = schema.safeParse(candidate);
      if (result.success) return { ok: true, value: result.data };
      if (!best || result.error.issues.length < best.issues.length) best = result.error;
    }
  }
  return { ok: false, error: best };
}

export const NO_JSON =
  "No encontré la respuesta en lo que pegaste. Copiá la respuesta entera de claude.ai: tiene que traer un objeto JSON completo, que empieza con { y termina con }.";

// The Spanish message for a pasted reply that could not be used (null: it can be used).
export function replyErrorText(result: ReadReply<unknown>): string | null {
  if (result.ok) return null;
  if (!result.error) return NO_JSON;
  return checkErrorText(result.error, "La respuesta pegada no tiene la forma que espera la app");
}
