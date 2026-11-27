// "Charlar con Claude" on the server: the conversations saved in PROJECTS_DIR/.chats/<id>.json, and one reply
// streamed back as NDJSON lines ({"t":"text","d":...}, then {"t":"done",...} or {"t":"error",...}). The answer is
// saved with the conversation when it ends, with what it cost by the chat's price table.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  ChatFileSchema,
  chatCost,
  chatSystem,
  chatTitle,
  newChatId,
  toClaudeMessages,
  type ChatFile,
  type ChatRequest,
  type ChatSummary,
} from "../shared/chat.ts";
import { chatClaude } from "./claude.ts";
import { PROJECTS_DIR } from "./projects.ts";
import { loadSkills } from "./skills.ts";

const DIR = join(PROJECTS_DIR, ".chats");
const file = (id: string) => join(DIR, `${id}.json`);

export async function listChats(): Promise<ChatSummary[]> {
  let names: string[] = [];
  try {
    names = (await readdir(DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: ChatSummary[] = [];
  for (const name of names) {
    const chat = await readChat(name.replace(/\.json$/, ""));
    if (chat) out.push({ id: chat.id, title: chat.title, updated: chat.updated, skills: chat.skills, usd: chat.usd });
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function readChat(id: string): Promise<ChatFile | null> {
  try {
    const parsed = ChatFileSchema.safeParse(JSON.parse(await readFile(file(id), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function deleteChat(id: string): Promise<boolean> {
  try {
    await rm(file(id));
    return true;
  } catch {
    return false;
  }
}

async function saveChat(chat: ChatFile): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(chat.id), JSON.stringify(chat));
}

// One turn: the reply streams to `write` as it comes; the whole conversation is saved at the end (also when the
// reply failed, so the person's message is not lost).
export async function chatTurn(req: ChatRequest, write: (line: object) => void, signal?: AbortSignal): Promise<void> {
  const id = req.id ?? newChatId(new Date(), randomBytes(4).toString("hex"));
  const before = req.id ? await readChat(req.id) : null;
  const skills = await loadSkills(req.skills);
  const base: ChatFile = {
    id,
    title: before?.title ?? chatTitle(req.messages),
    updated: new Date().toISOString(),
    model: req.model,
    effort: req.effort,
    skills: skills.map((s) => s.id),
    messages: req.messages,
    usd: before?.usd ?? 0,
  };
  write({ t: "start", id, skills: base.skills });
  try {
    const reply = await chatClaude({
      model: req.model,
      effort: req.effort,
      system: chatSystem(skills),
      messages: toClaudeMessages(req.messages),
      onText: (d) => write({ t: "text", d }),
      signal,
    });
    const usd = reply.tokens ? chatCost(req.model, reply.tokens) : 0;
    const note =
      reply.stop === "refusal"
        ? "\n\n(Claude no quiso responder esto. Reformulalo.)"
        : reply.stop === "max_tokens"
          ? "\n\n(La respuesta se cortó por larga: pedile que siga.)"
          : "";
    const text = reply.text + note;
    await saveChat({ ...base, messages: [...req.messages, { role: "assistant", text, images: [] }], usd: base.usd + usd });
    write({ t: "done", id, text, model: reply.model, usd, tokens: reply.tokens, stop: reply.stop });
  } catch (e) {
    await saveChat(base).catch(() => undefined);
    write({ t: "error", id, error: e instanceof Error ? e.message : String(e) });
  }
}
