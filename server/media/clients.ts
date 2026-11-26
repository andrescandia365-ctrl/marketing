// The two API providers, xAI (Grok Imagine) and fal.ai, as plain fetch calls. Shapes come from their docs
// (docs.x.ai images/videos REST reference; fal.ai queue docs); see modelos-api.md for what was checked when.
import { falImageInput, falVideoInput, xaiVideoBody, type Aspect, type VideoRequest } from "../../shared/mediaModels.ts";
import { mediaKey } from "./catalog.ts";

const XAI = "https://api.x.ai/v1";
const FAL_QUEUE = "https://queue.fal.run";

function keyOrThrow(provider: "xai" | "fal"): string {
  const key = mediaKey(provider);
  if (!key) throw new Error(provider === "xai" ? "Falta la clave de xAI (XAI_API_KEY) en Modelos." : "Falta la clave de fal.ai (FAL_KEY) en Modelos.");
  return key;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

// A rejected key says so in Spanish; anything else keeps the provider's own words.
// xAI answers a wrong key with a 400 that names the key, so the words count too.
function keyProblem(provider: "xai" | "fal", status: number, body: Record<string, unknown> = {}): string | null {
  const said = errorText(body, "");
  if (status !== 401 && status !== 403 && !/api key|unauthori[sz]ed|authenticat/i.test(said)) return null;
  return provider === "xai" ? "xAI no aceptó la clave. Revisala en Modelos (XAI_API_KEY)." : "fal.ai no aceptó la clave. Revisala en Modelos (FAL_KEY).";
}

function errorText(body: Record<string, unknown>, fallback: string): string {
  const e = body.error ?? body.detail ?? body.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  if (Array.isArray(e)) return JSON.stringify(e).slice(0, 300);
  return fallback;
}

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar la imagen generada.");
  const type = res.headers.get("content-type") || "image/png";
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

// ── Images ───────────────────────────────────────────────────────────────────────────────

export async function xaiImage(model: string, prompt: string, aspect: Aspect): Promise<string> {
  const res = await fetch(`${XAI}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${keyOrThrow("xai")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, aspect_ratio: aspect === "vertical" ? "9:16" : "16:9", response_format: "b64_json" }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(keyProblem("xai", res.status, body) ?? `xAI: ${errorText(body, res.statusText)}`);
  const first = (body.data as { b64_json?: string | null; url?: string; mime_type?: string }[] | undefined)?.[0];
  if (first?.b64_json) return `data:${first.mime_type || "image/jpeg"};base64,${first.b64_json}`;
  if (first?.url) return toDataUrl(first.url);
  throw new Error("xAI no devolvió ninguna imagen.");
}

// fal: submit to the queue, wait on the status URL it returns, then read the result.
async function falRun(model: string, input: Record<string, unknown>, timeoutMs: number, onProgress?: (p: number) => void): Promise<Record<string, unknown>> {
  const key = keyOrThrow("fal");
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const submit = await fetch(`${FAL_QUEUE}/${model}`, { method: "POST", headers, body: JSON.stringify(input) });
  const queued = await readJson(submit);
  if (!submit.ok) throw new Error(keyProblem("fal", submit.status, queued) ?? `fal.ai: ${errorText(queued, submit.statusText)}`);
  const statusUrl = typeof queued.status_url === "string" ? queued.status_url : null;
  const responseUrl = typeof queued.response_url === "string" ? queued.response_url : null;
  if (!statusUrl || !responseUrl) throw new Error("fal.ai no devolvió el pedido en cola.");
  const until = Date.now() + timeoutMs;
  for (let wait = 1500; Date.now() < until; wait = Math.min(5000, wait + 500)) {
    await new Promise((r) => setTimeout(r, wait));
    const s = await readJson(await fetch(statusUrl, { headers }));
    if (s.error) throw new Error(`fal.ai: ${errorText(s, "falló")}`);
    if (s.status === "IN_PROGRESS") onProgress?.(50);
    if (s.status === "COMPLETED") {
      const out = await fetch(responseUrl, { headers });
      const result = await readJson(out);
      if (!out.ok) throw new Error(`fal.ai: ${errorText(result, out.statusText)}`);
      return result;
    }
  }
  throw new Error("fal.ai tardó demasiado. Probá de nuevo.");
}

export async function falImage(model: string, prompt: string, aspect: Aspect): Promise<string> {
  const result = await falRun(model, falImageInput(model, prompt, aspect), 3 * 60_000);
  const url = (result.images as { url?: string }[] | undefined)?.[0]?.url;
  if (!url) throw new Error("fal.ai no devolvió ninguna imagen.");
  return toDataUrl(url);
}

// ── Video ────────────────────────────────────────────────────────────────────────────────

export type VideoPoll = { status: "pending" | "done" | "failed"; progress: number; url?: string; error?: string };

export async function xaiVideoStart(req: VideoRequest): Promise<string> {
  const res = await fetch(`${XAI}/videos/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${keyOrThrow("xai")}`, "Content-Type": "application/json" },
    body: JSON.stringify(xaiVideoBody(req)),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(keyProblem("xai", res.status, body) ?? `xAI: ${errorText(body, res.statusText)}`);
  if (typeof body.request_id !== "string") throw new Error("xAI no devolvió el pedido.");
  return body.request_id;
}

export async function xaiVideoPoll(requestId: string): Promise<VideoPoll> {
  const res = await fetch(`${XAI}/videos/${encodeURIComponent(requestId)}`, { headers: { Authorization: `Bearer ${keyOrThrow("xai")}` } });
  const body = await readJson(res);
  const status = body.status;
  if (status === "done") {
    const url = (body.video as { url?: string } | undefined)?.url;
    if (!url) return { status: "failed", progress: 100, error: "xAI no entregó el video (puede haberlo frenado la moderación)." };
    return { status: "done", progress: 100, url };
  }
  if (status === "failed" || status === "expired") return { status: "failed", progress: 0, error: `xAI: ${errorText(body, "el video falló")}` };
  if (!res.ok && res.status !== 202) return { status: "failed", progress: 0, error: `xAI: ${errorText(body, res.statusText)}` };
  return { status: "pending", progress: typeof body.progress === "number" ? body.progress : 0 };
}

export async function falVideo(req: VideoRequest, onProgress: (p: number) => void): Promise<string> {
  const result = await falRun(req.model, falVideoInput(req), 15 * 60_000, onProgress);
  const url = (result.video as { url?: string } | undefined)?.url;
  if (!url) throw new Error("fal.ai no devolvió ningún video.");
  return url;
}
