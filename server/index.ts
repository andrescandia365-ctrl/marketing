import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { BriefSchema, HookSchema, type Status } from "../shared/schema.ts";
import { ClaudeError, MODEL, claudeConfigured, writeHooks, writeScript } from "./claude.ts";
import { DEMO_HOOKS, DEMO_SCRIPT } from "./demo.ts";
import { getProvider, listProviders } from "./images/index.ts";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof ClaudeError) return c.json({ error: error.message }, 502);
  if (error instanceof z.ZodError) return c.json({ error: "The request was missing fields." }, 400);
  console.error(error);
  return c.json({ error: error.message || "Something went wrong." }, 500);
});

app.get("/api/status", (c) =>
  c.json<Status>({ claude: claudeConfigured(), model: MODEL, imageProviders: listProviders() }),
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
  if (!provider) return c.json({ error: `Image generator "${req.provider}" is not connected.` }, 400);
  return c.json({ dataUrl: await provider.generate(req) });
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port} · Claude ${claudeConfigured() ? "connected" : "not set (sample mode)"}`);
});
