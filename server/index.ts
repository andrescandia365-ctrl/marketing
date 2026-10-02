import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { BriefSchema, HookSchema, type Script, type Status } from "../shared/schema.ts";
import { ClaudeError, MODEL, claudeConfigured, rewriteShot, writeHooks, writeScript } from "./claude.ts";
import { DEMO_HOOKS, DEMO_SCRIPT } from "./demo.ts";
import { getProvider, listProviders } from "./images/index.ts";
import { listTools } from "./tools.ts";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof ClaudeError) return c.json({ error: error.message }, 502);
  if (error instanceof z.ZodError) return c.json({ error: "Al pedido le faltaban datos." }, 400);
  console.error(error);
  return c.json({ error: error.message || "Algo salió mal." }, 500);
});

app.get("/api/status", (c) =>
  c.json<Status>({ claude: claudeConfigured(), model: MODEL, imageProviders: listProviders(), tools: listTools() }),
);

app.post("/api/hooks", async (c) => {
  const { brief } = z.object({ brief: BriefSchema }).parse(await c.req.json());
  if (!claudeConfigured()) return c.json({ ...DEMO_HOOKS, demo: true });
  return c.json({ ...(await writeHooks(brief)), demo: false });
});

app.post("/api/script", async (c) => {
  const { brief, hook } = z.object({ brief: BriefSchema, hook: HookSchema }).parse(await c.req.json());
  if (!claudeConfigured()) return c.json({ script: DEMO_SCRIPT, demo: true });
  return c.json({ script: await writeScript(brief, hook), demo: false });
});

app.post("/api/rewrite", async (c) => {
  const body = await c.req.json();
  const { brief, index, note } = z
    .object({ brief: BriefSchema, index: z.number().int().min(0), note: z.string().min(1) })
    .parse(body);
  // The script comes from this app's own state; only its shape matters to the prompt.
  const script = body.script as Script;
  if (!Array.isArray(script?.shots) || !script.shots[index]) return c.json({ error: "Esa toma ya no existe." }, 400);
  if (!claudeConfigured()) return c.json({ shot: script.shots[index], demo: true });
  return c.json({ shot: await rewriteShot(brief, script, index, note), demo: false });
});

app.post("/api/image", async (c) => {
  const req = z
    .object({
      provider: z.string(),
      prompt: z.string().min(1),
      style: z.string(),
      aspect: z.enum(["vertical", "horizontal"]),
      section: z.string(),
    })
    .parse(await c.req.json());
  const provider = getProvider(req.provider);
  if (!provider) return c.json({ error: `El generador de imágenes "${req.provider}" no está conectado.` }, 400);
  return c.json({ dataUrl: await provider.generate(req) });
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port} · Claude ${claudeConfigured() ? "conectado" : "sin clave (modo de muestra)"}`);
});
