// "Charlar con Claude": a chat window in the app that talks to Claude through the API key (no claude.ai plan needed).
// The person can switch on skills (skills/<id>/SKILL.md, the same folders that upload to claude.ai) and attach
// pictures. Pure: the request shape, the model list with prices, the system prompt, the Claude message blocks, the
// cost of a reply and the copy-to-claude.ai text. The server streams the reply (server/chat.ts).
import { z } from "zod";

// The models offered in the chat, cheapest first, with their prices per million tokens (input, output, cache read).
// Prices from the Claude API's model table (Nov 2026); the bill is the truth.
export const CHAT_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (el más barato)", input: 0.1, output: 0.5, cacheRead: 0.01 },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.1 },
  { id: "claude-opus-5-5", label: "Opus 5.5 (el mejor)", input: 4, output: 20, cacheRead: 0.2 },
] as const;
export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];
export const DEFAULT_CHAT_MODEL: ChatModelId = "claude-sonnet-5-5";
export const CHAT_EFFORTS = ["low", "medium", "high"] as const;
export const CHAT_EFFORT_LABEL: Record<(typeof CHAT_EFFORTS)[number], string> = { low: "Rápido", medium: "Normal", high: "Pensar más" };

// Limits: a picture is a downscaled JPEG (src/lib/files.ts pictureForReview), base64.
export const CHAT_MAX_MESSAGES = 200;
export const CHAT_MAX_TEXT = 60_000;
export const CHAT_MAX_IMAGES = 4;
export const CHAT_MAX_IMAGE = 3_000_000;
export const CHAT_MAX_SKILLS = 4;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(CHAT_MAX_TEXT, "Ese mensaje es demasiado largo."),
  images: z.array(z.string().max(CHAT_MAX_IMAGE, "Esa imagen es demasiado grande.")).max(CHAT_MAX_IMAGES, `Hasta ${CHAT_MAX_IMAGES} imágenes por mensaje.`).default([]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatIdSchema = z.string().regex(/^[a-z0-9-]{1,60}$/, "Id de conversación no válido.");
export const SkillIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, "Skill no válida.");

export const ChatRequestSchema = z.object({
  id: ChatIdSchema.optional(),
  model: z.enum(CHAT_MODELS.map((m) => m.id) as [ChatModelId, ...ChatModelId[]]).default(DEFAULT_CHAT_MODEL),
  effort: z.enum(CHAT_EFFORTS).default("medium"),
  skills: z.array(SkillIdSchema).max(CHAT_MAX_SKILLS, `Hasta ${CHAT_MAX_SKILLS} skills a la vez.`).default([]),
  messages: z
    .array(ChatMessageSchema)
    .min(1, "Escribí un mensaje.")
    .max(CHAT_MAX_MESSAGES, "La conversación es muy larga: empezá una nueva.")
    .refine((m) => m.at(-1)?.role === "user", "El último mensaje tiene que ser tuyo."),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// A saved conversation (PROJECTS_DIR/.chats/<id>.json).
export const ChatFileSchema = z.object({
  id: ChatIdSchema,
  title: z.string().max(120),
  updated: z.string(),
  model: z.string(),
  effort: z.enum(CHAT_EFFORTS).default("medium"),
  skills: z.array(SkillIdSchema).default([]),
  messages: z.array(ChatMessageSchema),
  usd: z.number().default(0),
});
export type ChatFile = z.infer<typeof ChatFileSchema>;
export type ChatSummary = Pick<ChatFile, "id" | "title" | "updated" | "skills" | "usd">;

// A skill as the app lists it: its folder name, the frontmatter's name and description, and its files.
export type SkillInfo = { id: string; name: string; description: string; files: string[] };
// A skill's text for the chat: SKILL.md and its reference files, each with its path.
export type SkillText = SkillInfo & { body: { path: string; text: string }[] };

// The frontmatter of a SKILL.md ("---\nname: x\ndescription: y\n---").
export function readFrontmatter(md: string): { name: string; description: string } | null {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const field = (key: string) => {
    const line = m[1].match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
    return line.replace(/^["']|["']$/g, "");
  };
  const name = field("name");
  const description = field("description");
  return name && description ? { name, description } : null;
}

// What every chat knows, in Spanish for the person. Skills come after it, each in its own block.
export const CHAT_BASE = `Sos Claude, hablando con la persona que usa Playbook Studio: una app local para hacer contenido con historia (el Bueno contra el Malo), explicativos, imágenes fijas y anuncios (Método 50-5-3) para marcas que sacan un dolor.
Respondé en castellano rioplatense, claro y directo, sin relleno. Los prompts para modelos de imagen o video van en inglés salvo que te pidan otra cosa; las líneas habladas, en el idioma que pidan.
Reglas que siempre valen:
- Nunca la cara, la voz o el nombre de una persona real o de un personaje conocido: siempre adultos inventados.
- Nunca copies el anuncio, las fotos o los textos de otra marca: se toma la estructura, no el contenido.
- Lo que no esté confirmado (cifras, testimonios, premios, prensa) va marcado [VERIFY]; no se inventan.
- Nunca propongas tapar, recortar o borrar marcas de agua ni metadatos de IA.
- Si te piden algo que choca con esto, decilo en una línea y ofrecé la versión que sí se puede.`;

// The system blocks: the base, then one per skill ("Skill activa: <name>" + its files).
export function chatSystem(skills: SkillText[]): string[] {
  return [
    CHAT_BASE,
    ...skills.map(
      (s) =>
        `Skill activa: ${s.name}. Seguila cuando el pedido encaje con su descripción (${s.description}).\n\n` +
        s.body.map((f) => `<file path="${s.id}/${f.path}">\n${f.text.trim()}\n</file>`).join("\n\n"),
    ),
  ];
}

type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };

// The conversation as Claude's message list: pictures before the text of their message; an empty assistant turn is
// dropped (a reply that never came).
export function toClaudeMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string | Block[] }[] {
  return messages
    .filter((m) => m.role === "user" || m.text.trim())
    .map((m) =>
      m.images.length && m.role === "user"
        ? {
            role: m.role,
            content: [
              ...m.images.map((data): Block => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
              { type: "text", text: m.text.trim() || "(mirá la imagen)" },
            ],
          }
        : { role: m.role, content: m.text },
    );
}

// The title of a conversation: its first message, short.
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  if (!first) return "Conversación";
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

export type ChatTokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

// What a reply cost by the table (cache writes at 1.25× input).
export function chatCost(model: string, t: ChatTokens): number {
  const m = CHAT_MODELS.find((x) => x.id === model) ?? CHAT_MODELS[CHAT_MODELS.length - 1];
  return (t.input * m.input + t.output * m.output + t.cacheRead * m.cacheRead + t.cacheWrite * m.input * 1.25) / 1_000_000;
}

// With no API key: the same conversation as one text to paste into claude.ai (pictures are attached by hand there).
export function chatCopyText(skills: SkillText[], messages: ChatMessage[]): string {
  const parts = [chatSystem(skills).join("\n\n---\n\n"), "---", "Conversación hasta ahora:"];
  for (const m of messages) {
    parts.push(`${m.role === "user" ? "Yo" : "Claude"}: ${m.text.trim()}${m.images.length ? `\n(adjunto ${m.images.length} imagen${m.images.length === 1 ? "" : "es"}: las subo aparte)` : ""}`);
  }
  parts.push("Respondé mi último mensaje.");
  return parts.join("\n\n");
}

// A new conversation id: time-ordered, readable, never reused.
export function newChatId(now: Date, rand: string): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{6})$/, "$1-$2");
  return `chat-${stamp}-${rand.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "x"}`;
}

// The skill that knows each tool's video prompts (server/tools/<id>.md → skills/<id>/), for "Al chat" from a shot.
export const TOOL_SKILL: Record<string, string> = { seedance: "seedance-prompts", "gemini-omni": "omni-prompts" };
export const IMAGE_SKILL = "prompts-nano-banana";

// The message "Al chat" writes for a shot's prompt.
export function shotChatText(input: { kind: "imagen" | "video"; shot: number; title: string; action: string; tool: string; prompt: string }): string {
  return [
    `Mejorá este prompt de ${input.kind} para la toma ${input.shot} («${input.title}»${input.action ? `: ${input.action}` : ""}). Herramienta: ${input.tool}.`,
    "Mantené la línea de identidad de cada personaje palabra por palabra y lo que pasa en la toma. Devolvé el prompt nuevo en un bloque de código y en dos líneas qué cambiaste.",
    "",
    "Prompt actual:",
    "```",
    input.prompt.trim(),
    "```",
  ].join("\n");
}
