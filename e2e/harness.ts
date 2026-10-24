// Starts the app the way CI will: API and Vite on free ports, temporary folders, no writer keys.
// Sample mode stays sample mode even when this machine has a .env, because the API is started without --env-file.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { chromium, type Browser, type LaunchOptions, type Page } from "playwright-core";

export const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "MOONSHOT_API_KEY",
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "LLM_PROVIDER",
  "REPLICATE_API_TOKEN",
];

export type Running = {
  root: string;
  projects: string;
  ads: string;
  library: string;
  url: string;
  browser: Browser;
  stop: () => Promise<void>;
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function launchBrowser(): Promise<Browser> {
  const tries: LaunchOptions[] = [
    ...(process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : []),
    { channel: "chrome" },
    { channel: "msedge" },
    {},
  ];
  const errors: string[] = [];
  const next = async (i: number): Promise<Browser> => {
    if (i >= tries.length) throw new Error(`No encontré un navegador para el recorrido.\n${errors.join("\n")}`);
    try {
      return await chromium.launch({ headless: true, ...tries[i] });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return next(i + 1);
    }
  };
  return next(0);
}

function pipe(child: ChildProcess, sink: string[]) {
  const take = (chunk: Buffer) => {
    sink.push(chunk.toString());
    if (sink.length > 80) sink.shift();
  };
  child.stdout?.on("data", take);
  child.stderr?.on("data", take);
}

async function waitFor(url: string, child: ChildProcess, log: () => string, ms: number) {
  const deadline = Date.now() + ms;
  let last = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`El proceso se cerró (${child.exitCode}) antes de responder ${url}\n${log()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = String(response.status);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nada respondió en ${url} (${last})\n${log()}`);
}

export async function startApp(): Promise<Running> {
  const root = await mkdtemp(join(tmpdir(), "playbook-e2e-"));
  const projects = join(root, "proyectos");
  const ads = join(root, "publicidad");
  const library = join(root, "biblioteca");
  await mkdir(projects);
  await mkdir(ads);
  await mkdir(library);
  const apiPort = await freePort();
  const webPort = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(apiPort), PROJECTS_DIR: projects, ADS_DIR: ads, LIBRARY_DIR: library };
  for (const key of KEYS) delete env[key];
  delete env.NODE_ENV;
  const apiLog: string[] = [];
  const webLog: string[] = [];
  const api = spawn(join(REPO, "node_modules/.bin/tsx"), ["server/index.ts"], {
    cwd: REPO,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(join(REPO, "node_modules/.bin/vite"), ["--port", String(webPort), "--strictPort", "--host", "127.0.0.1"], {
    cwd: REPO,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe(api, apiLog);
  pipe(web, webLog);
  const log = () => `--- api ---\n${apiLog.join("")}\n--- vite ---\n${webLog.join("")}`;
  let browser: Browser | null = null;
  try {
    await waitFor(`http://127.0.0.1:${apiPort}/api/status`, api, log, 60_000);
    await waitFor(`http://127.0.0.1:${webPort}/`, web, log, 90_000);
    browser = await launchBrowser();
  } catch (e) {
    api.kill("SIGTERM");
    web.kill("SIGTERM");
    await rm(root, { recursive: true, force: true });
    throw e;
  }
  const url = `http://127.0.0.1:${webPort}`;
  return {
    root,
    projects,
    ads,
    library,
    url,
    browser,
    stop: async () => {
      await browser.close();
      api.kill("SIGTERM");
      web.kill("SIGTERM");
      await rm(root, { recursive: true, force: true });
    },
  };
}

// A fresh page. Sample mode is on when the header says the writer is not connected.
export async function openPage(app: Running): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.goto(app.url);
  await page.getByText("IA sin conectar").waitFor();
  return page;
}
