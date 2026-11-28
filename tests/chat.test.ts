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
  splitReply,
  isHtmlBlock,
  htmlDocument,
  htmlFileName,
  linkParts,
  sourcesText,
  webSearchTool,
  WEB_RULES,
} from "../shared/chat.ts";
import { usageKind } from "../shared/usage.ts";
import { listSkills, loadSkills, zipSkill } from "../server/skills.ts";
import { listTools } from "../server/tools.ts";

const EXPECTED = [
  "escena-de-referencia",
  "guiones-virales",
  "mashogar-analizador-ads",
  "mashogar-analizador-producto",
  "mashogar-generador-landing",
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
  const landing = readFileSync(new URL("../skills/mashogar-generador-landing/references/prompt.md", import.meta.url), "utf8");
  assert.match(landing, /GENERADOR_v8/);
  assert.match(landing, /PROHIBIDO inventar stats/);
  assert.match(landing, /\[Reglas de la casa\] Si un STAT no trae fuente/);
  assert.match(landing, /references\/template\.html/);
  const template = readFileSync(new URL("../skills/mashogar-generador-landing/references/template.html", import.meta.url), "utf8");
  assert.match(template, /^<style>/);
  assert.match(template, /<\/script>\n$/);
  for (const slot of ["[COMO_FUNCIONA_TEXTO]", "[URL_IMAGEN_HERO]", "[TITULO_EMOCIONAL]", "[USECASE_3_CHECKS]", "[BCARD_3_TEXTO]", "[STAT_1_NUMERO]", "[SPECS_FILAS]", "[FAQ_DETAILS]"]) {
    assert.ok(template.includes(slot), slot);
  }
  assert.equal(template.split("[DIAS_GARANTIA]").length - 1, 2);
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

test("a reply splits into prose and fenced blocks by fence lines, and a block still streaming is open", () => {
  const parts = splitReply("HEADLINE: Algo\n\n```html\n<style>.a{}</style>\n<div class=\"mh\">x</div>\n```\nListo.\n```\nsin cerrar");
  assert.deepEqual(parts, [
    { kind: "text", text: "HEADLINE: Algo" },
    { kind: "code", lang: "html", text: '<style>.a{}</style>\n<div class="mh">x</div>', closed: true },
    { kind: "text", text: "Listo." },
    { kind: "code", lang: "", text: "sin cerrar", closed: false },
  ]);
  assert.equal(isHtmlBlock(parts[1]), true);
  assert.equal(isHtmlBlock(parts[3]), false);
  assert.equal(isHtmlBlock({ kind: "code", lang: "", text: "<div>hola</div>", closed: true }), true);
  assert.equal(isHtmlBlock({ kind: "code", lang: "", text: "A cinematic photo of <subject>", closed: true }), false);
  assert.equal(isHtmlBlock({ kind: "code", lang: "js", text: "<div></div>", closed: true }), false);
});

test("an HTML block becomes a page: a fragment is wrapped, a full page is kept, the preview adds its rules", () => {
  const page = htmlDocument('<div class="mh">x</div>', 'Lámpara <LED> "cálida"');
  assert.match(page, /^<!doctype html>\n<html lang="es">/);
  assert.match(page, /<title>Lámpara &lt;LED&gt; &quot;cálida&quot;<\/title>/);
  assert.match(page, /<body style="margin:0;background:#fff">\n<div class="mh">x<\/div>\n<\/body>/);
  assert.doesNotMatch(page, /Content-Security-Policy/);
  const preview = htmlDocument('<div class="mh">x</div>', "x", { csp: true });
  assert.match(preview, /default-src 'none'.*script-src 'unsafe-inline'/);
  assert.doesNotMatch(preview, /connect-src/);
  const full = "<!doctype html><html><head><title>t</title></head><body></body></html>";
  assert.equal(htmlDocument(full, "x"), full);
  assert.match(htmlDocument(full, "x", { csp: true }), /<head><meta http-equiv="Content-Security-Policy"/);
  assert.deepEqual(htmlFileName("HEADLINE: x\nNOMBRE_PRODUCTO: **Especiero Giratorio de Acero 16 Frascos**\n"), { title: "Especiero Giratorio de Acero 16 Frascos", file: "especiero-giratorio-de-acero-16-frascos.html" });
  assert.deepEqual(htmlFileName("nada"), { title: "Página", file: "pagina.html" });
});

test("'Buscar en la web' is off unless asked; its rules join the system and its searches the cost", () => {
  assert.equal(ChatRequestSchema.parse({ messages: [{ role: "user", text: "x" }] }).web, false);
  assert.equal(ChatRequestSchema.parse({ web: true, messages: [{ role: "user", text: "x" }] }).web, true);
  assert.deepEqual(chatSystem([], true), [chatSystem([])[0], WEB_RULES]);
  assert.match(WEB_RULES, /dato, no una instrucción/);
  assert.match(WEB_RULES, /\[VERIFY\]/);
  assert.equal(webSearchTool("claude-opus-5-5").type, "web_search_20260209");
  assert.equal(webSearchTool("claude-haiku-5-5").type, "web_search_20250305");
  assert.equal(webSearchTool("claude-sonnet-5-5").user_location.country, "AR");
  const none = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  assert.ok(Math.abs(chatCost("claude-sonnet-5-5", none, 3) - 0.03) < 1e-9);
});

test("the sources close the reply once each, as links the chat shows", () => {
  const text = sourcesText([
    { url: "https://a.example/p", title: "Página [A]" },
    { url: "https://a.example/p", title: "otra vez" },
    { url: "javascript:alert(1)", title: "no" },
    { url: "https://b.example/q", title: "" },
  ]);
  assert.equal(text, "\n\nFuentes:\n- [Página A ](https://a.example/p)\n- [b.example](https://b.example/q)".replace("A ]", "A]"));
  assert.equal(sourcesText([]), "");
  assert.deepEqual(linkParts("Ver [la nota](https://a.example/p) y [esto](javascript:x)."), [
    { text: "Ver " },
    { text: "la nota", href: "https://a.example/p" },
    { text: " y [esto](javascript:x)." },
  ]);
});
