// Video generations by API as jobs: started here, watched from the browser, and downloaded into
// PROJECTS_DIR/.generados/ as soon as they are ready (the providers' URLs are temporary). The browser then takes the
// file and saves it through the same route as a hand upload, so every slot keeps its own checks.
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { estimateCost, pickDuration, type VideoRequest } from "../../shared/mediaModels.ts";
import { PROJECTS_DIR } from "../projects.ts";
import { findModel } from "./catalog.ts";
import { falVideo, xaiVideoPoll, xaiVideoStart } from "./clients.ts";
import { logSpend } from "./spend.ts";

const DIR = join(PROJECTS_DIR, ".generados");
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 300 * 1024 * 1024;

type Job = {
  id: string;
  provider: "xai" | "fal";
  model: string;
  seconds: number;
  usd: number;
  status: "pending" | "done" | "failed";
  progress: number;
  error?: string;
  remoteId?: string;
  lastPoll: number;
  created: number;
  file?: string;
  downloading?: Promise<void>;
};

const jobs = new Map<string, Job>();

async function download(job: Job, url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar el video generado.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("El video generado es demasiado grande.");
  await mkdir(DIR, { recursive: true });
  const file = join(DIR, `${job.id}.mp4`);
  await writeFile(file, bytes);
  job.file = file;
  job.status = "done";
  job.progress = 100;
  // Logged when a clip really came back: a failed call is not counted.
  await logSpend({ provider: job.provider, model: job.model, kind: "video", seconds: job.seconds, usd: job.usd });
}

function finishWith(job: Job, url: string) {
  job.downloading ??= download(job, url).catch((e: unknown) => {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
  });
}

// Old files go away after a day, on the next start.
async function prune(now: number): Promise<void> {
  for (const [id, job] of jobs) if (now - job.created > KEEP_MS) jobs.delete(id);
  const names = await readdir(DIR).catch(() => [] as string[]);
  for (const name of names) {
    const path = join(DIR, name);
    const info = await stat(path).catch(() => null);
    if (info && now - info.mtimeMs > KEEP_MS) await rm(path, { force: true }).catch(() => undefined);
  }
}

export type StartVideo = Omit<VideoRequest, "seconds"> & { provider: "xai" | "fal"; seconds: number };

export async function startVideo(input: StartVideo): Promise<{ id: string; seconds: number; usd: number }> {
  const model = findModel(input.provider, input.model);
  if (!model || model.kind !== "video") throw new Error("Ese modelo de video no está en la lista (server/media/modelos-api.md).");
  if (model.input === "imagen" && !input.image) throw new Error(`${model.label} necesita una imagen de inicio. Subí o generá la imagen primero.`);
  const seconds = pickDuration(model.seconds ?? [], input.seconds);
  const req: VideoRequest = { ...input, seconds, image: model.input === "texto" ? undefined : input.image };
  const now = Date.now();
  await prune(now);
  const job: Job = { id: randomUUID(), provider: input.provider, model: input.model, seconds, usd: estimateCost(model, seconds), status: "pending", progress: 0, lastPoll: now, created: now };
  if (input.provider === "xai") {
    job.remoteId = await xaiVideoStart(req);
  } else {
    // fal waits inside one call; the job follows it in the background.
    void falVideo(req, (p) => (job.progress = p))
      .then((url) => finishWith(job, url))
      .catch((e: unknown) => {
        job.status = "failed";
        job.error = e instanceof Error ? e.message : String(e);
      });
  }
  jobs.set(job.id, job);
  return { id: job.id, seconds, usd: job.usd };
}

export async function videoStatus(id: string): Promise<{ status: Job["status"]; progress: number; error?: string; seconds: number; usd: number } | null> {
  const job = jobs.get(id);
  if (!job) return null;
  // xAI is asked at most every 3 s, however often the browser asks here.
  if (job.status === "pending" && job.provider === "xai" && job.remoteId && !job.downloading && Date.now() - job.lastPoll > 3000) {
    job.lastPoll = Date.now();
    try {
      const poll = await xaiVideoPoll(job.remoteId);
      job.progress = poll.progress;
      if (poll.status === "done" && poll.url) finishWith(job, poll.url);
      if (poll.status === "failed") {
        job.status = "failed";
        job.error = poll.error;
      }
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
    }
  }
  return { status: job.status, progress: job.progress, error: job.status === "failed" ? job.error : undefined, seconds: job.seconds, usd: job.usd };
}

export function videoFile(id: string): { stream: ReadableStream } | null {
  const job = jobs.get(id);
  if (!job?.file || job.status !== "done") return null;
  return { stream: Readable.toWeb(createReadStream(job.file)) as ReadableStream };
}
