// "Charlar con Claude" and the skills folder: every skill is valid for claude.ai and the Skills API (name, description,
// SKILL.md at the top), the chat's request shape, its system prompt with skills, the Claude messages with pictures, the
// cost of a reply, and the house rules the Mashogar prompts were adjusted to.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ChatRequestSchema,
  CHAT_MODELS,
  chatCopyText,
  chatCost,
  chatSystem,
  chatTitle,
  newChatId,
  readFrontmatter,
  shotChatText,
  toClaudeMessages,
  TOOL_SKILL,
  IMAGE_SKILL,
} from "../shared/chat.ts";
import { usageKind } from "../shared/usage.ts";
import { listSkills, loadSkills, zipSkill } from "../server/skills.ts";
import { listTools } from "../server/tools.ts";

const EXPECTED = [
  "escena-de-referencia",
  "guiones-virales",
  "mashogar-analizador-ads",
  "mashogar-analizador-producto",
  "mashogar-seleccionador",
  "omni-prompts",
  "omni-ugc-prompts",
  "prompts-gpt-image-2",
  "prompts-nano-banana",
  "seedance-prompts",
  "seedance-ugc-prompts",
];

test("every skill folder is a valid skill: name = folder, the name and description rules, SKILL.md short enough", async () => {
  const skills = await listSkills();
  assert.deepEqual(
    skills.map((s) => s.id),
    EXPECTED,
  );
  for (const s of skills) {
    assert.equal(s.name, s.id, s.id);
    assert.match(s.name, /^[a-z0-9-]{1,64}$/, s.id);
    assert.doesNotMatch(s.name, /claude|anthropic/, s.id);
    assert.ok(s.description.length > 40 && s.description.length <= 1024, `${s.id}: ${s.description.length}`);
    assert.doesNotMatch(s.description, /[<>]/, s.id);
    assert.equal(s.files[0], "SKILL.md");
    const body = readFileSync(new URL(`../skills/${s.id}/SKILL.md`, import.meta.url), "utf8");
    assert.ok(body.split("\n").length < 500, `${s.id} SKILL.md is too long`);
  }
});

test("a skill loads with its reference files, and zips with its folder at the top for claude.ai", async () => {
  const [g] = await loadSkills(["guiones-virales", "nope", "guiones-virales"]);
  assert.equal(g.id, "guiones-virales");
  assert.deepEqual(
    g.body.map((f) => f.path),
    ["SKILL.md", "references/ganchos.md", "references/retencion.md"],
  );
  const zip = await zipSkill("guiones-virales");
  assert.ok(zip);
  const text = new TextDecoder().decode(zip!);
  assert.ok(text.includes("guiones-virales/SKILL.md"));
  assert.ok(text.includes("guiones-virales/references/ganchos.md"));
  assert.equal(await zipSkill("../server"), null);
  assert.deepEqual(await loadSkills(["../tests"]), []);
});

test("the Mashogar prompts keep their method but invent no stats, testimonials or press", () => {
  const product = readFileSync(new URL("../skills/mashogar-analizador-producto/references/prompt.md", import.meta.url), "utf8");
  assert.doesNotMatch(product, /87% notó|91% la recomendaria|entre 78 y 94/);
  assert.match(product, /STATS \(solo con fuente real\)/);
  assert.match(product, /LAS 7 DIMENSIONES DEL ANALISIS/);
  assert.match(product, /KIT_CONTRACT/);
  const ads = readFileSync(new URL("../skills/mashogar-analizador-ads/references/prompt.md", import.meta.url), "utf8");
  assert.doesNotMatch(ads, /si el quote es real o creíble/);
  assert.doesNotMatch(ads, /"El producto que está reemplazando a X"\.\s*Patrones/);
  assert.match(ads, /REGLAS DE LA CASA/);
  assert.match(ads, /FASE 3 - PROMPT PARA NANO BANANA PRO/);
  const selector = readFileSync(new URL("../skills/mashogar-seleccionador/references/prompt.md", import.meta.url), "utf8");
  assert.match(selector, /LOGICA DE SCORING/);
});

test("the frontmatter reader takes name and description, and refuses a file without them", () => {
  assert.deepEqual(readFrontmatter('---\nname: a-b\ndescription: "Hace X. Usala cuando Y."\n---\n# T'), { name: "a-b", description: "Hace X. Usala cuando Y." });
  assert.equal(readFrontmatter("# No frontmatter"), null);
  assert.equal(readFrontmatter("---\nname: x\n---\n"), null);
});

test("a chat request needs the person's message last and keeps to the limits", () => {
  const ok = ChatRequestSchema.parse({ messages: [{ role: "user", text: "hola" }] });
  assert.equal(ok.model, "claude-sonnet-5-5");
  assert.equal(ok.effort, "medium");
  assert.deepEqual(ok.messages[0].images, []);
  assert.equal(ChatRequestSchema.safeParse({ messages: [] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ messages: [{ role: "assistant", text: "x" }] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ model: "gpt-5", messages: [{ role: "user", text: "x" }] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ skills: ["a", "b", "c", "d", "e"], messages: [{ role: "user", text: "x" }] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ skills: ["../x"], messages: [{ role: "user", text: "x" }] }).success, false);
});

test("the system has the house rules first and each skill's files in its own block", async () => {
  const skills = await loadSkills(["escena-de-referencia"]);
  const system = chatSystem(skills);
  assert.equal(system.length, 2);
  assert.match(system[0], /personas? real/);
  assert.match(system[1], /^Skill activa: escena-de-referencia\./);
  assert.match(system[1], /<file path="escena-de-referencia\/SKILL.md">/);
  assert.equal(chatSystem([]).length, 1);
});

test("Claude's messages: pictures before their text, an empty reply dropped, a picture alone gets a short text", () => {
  const out = toClaudeMessages([
    { role: "user", text: "Mirá", images: ["AAA"] },
    { role: "assistant", text: "", images: [] },
    { role: "user", text: "", images: ["BBB"] },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].content, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
    { type: "text", text: "Mirá" },
  ]);
  assert.deepEqual((out[1].content as { type: string; text?: string }[])[1], { type: "text", text: "(mirá la imagen)" });
});

test("title, id, cost and the copy for claude.ai", () => {
  assert.equal(chatTitle([{ role: "user", text: "  Hola   che ", images: [] }]), "Hola che");
  assert.ok(chatTitle([{ role: "user", text: "x".repeat(100), images: [] }]).endsWith("…"));
  assert.equal(newChatId(new Date("2026-11-27T10:20:30Z"), "AB12cd99"), "chat-20261127-102030-ab12cd");
  const sonnet = CHAT_MODELS.find((m) => m.id === "claude-sonnet-5-5")!;
  assert.ok(Math.abs(chatCost(sonnet.id, { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 }) - 3) < 1e-9);
  const copy = chatCopyText([], [{ role: "user", text: "Dame ganchos", images: ["x"] }]);
  assert.match(copy, /Yo: Dame ganchos\n\(adjunto 1 imagen: las subo aparte\)/);
  assert.match(copy, /Respondé mi último mensaje\.$/);
});

test("'Al chat' from a shot: the message carries the prompt, and video prompts pick the tool's skill when there is one", () => {
  const text = shotChatText({ kind: "video", shot: 3, title: "Marta abre", action: "Abre la heladera.", tool: "Seedance 2.5", prompt: "  She opens the fridge.  " });
  assert.match(text, /^Mejorá este prompt de video para la toma 3 \(«Marta abre»: Abre la heladera\.\)\. Herramienta: Seedance 2\.5\./);
  assert.match(text, /```\nShe opens the fridge\.\n```$/);
  const tools = listTools().map((t) => t.id);
  for (const [tool, skill] of Object.entries(TOOL_SKILL)) {
    assert.ok(tools.includes(tool), tool);
    assert.ok(EXPECTED.includes(skill), skill);
  }
  assert.ok(EXPECTED.includes(IMAGE_SKILL));
  assert.equal(usageKind("/api/chat/send"), "Chat");
});
