// The final render of an explainer: `node render.mjs` opens the piece in a headless browser, paints every frame with
// window.seek(t) and pipes them to ffmpeg (H.264, yuv420p, CRF 16). The app starts it here and polls its progress;
// the same script runs by hand from a terminal.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PROJECTS_DIR } from "./projects.ts";

const SCRIPT = fileURLToPath(new URL("../render.mjs", import.meta.url));
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/;

export class RenderError extends Error {}

let ffmpeg: boolean | null = null;
export function ffmpegAvailable(): boolean {
  ffmpeg ??= spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  return ffmpeg;
}

export type FinalJob = {
  id: string;
  project: string;
  formats: string[];
  // The format being rendered and how far along (0 to 1, over all formats).
  current: string;
  progress: number;
  done: boolean;
  error: string;
  files: string[];
};

const jobs = new Map<string, FinalJob>();

export function startFinal(project: string, formats: ("vertical" | "horizontal")[], origin: string): FinalJob {
  if (!ffmpegAvailable()) throw new RenderError("Para el render final hace falta ffmpeg. En la Mac: brew install ffmpeg (o volvé a correr bash iniciar.sh).");
  if (!LOCAL.test(origin)) throw new RenderError("El render final solo corre desde la app en esta compu.");
  if ([...jobs.values()].some((j) => j.project === project && !j.done)) throw new RenderError("Ya hay un render final andando para esta pieza.");
  const job: FinalJob = { id: randomUUID(), project, formats, current: formats[0], progress: 0, done: false, error: "", files: [] };
  jobs.set(job.id, job);
  const child = spawn(process.execPath, [SCRIPT, project, formats.length > 1 ? "ambos" : formats[0], "--url", origin], {
    env: { ...process.env, PROJECTS_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  let rest = "";
  child.stdout.on("data", (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      const [word, a, b] = line.trim().split(/\s+/);
      if (word === "progreso") {
        job.current = a;
        job.progress = Math.min(1, Number(b) || 0);
      } else if (word === "listo" && a) job.files.push(a);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors = (errors + chunk.toString()).slice(-2000);
  });
  child.on("error", (e) => {
    job.error = e.message;
    job.done = true;
  });
  child.on("close", (code) => {
    if (code !== 0 && !job.error) job.error = errors.trim().split("\n").slice(-3).join(" ") || `El render terminó con el código ${code}.`;
    if (code === 0) job.progress = 1;
    job.done = true;
    // Kept a while so the page can read the result, then dropped.
    setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref();
  });
  return job;
}

export function getFinal(id: string): FinalJob | undefined {
  return jobs.get(id);
}
