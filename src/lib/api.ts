import type { Brief, Hook, HooksResult, Script, Shot, Status } from "../../shared/schema.ts";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "El servidor no respondió. ¿Está andando?" }));
  if (!res.ok) throw new Error(data.error ?? `Falló el pedido (${res.status}).`);
  return data as T;
}

export const api = {
  status: () => call<Status>("/api/status"),
  hooks: (brief: Brief) => call<HooksResult & { demo: boolean }>("/api/hooks", { brief }),
  script: (brief: Brief, hook: Hook) => call<{ script: Script; demo: boolean }>("/api/script", { brief, hook }),
  rewrite: (brief: Brief, script: Script, index: number, note: string) =>
    call<{ shot: Shot; demo: boolean }>("/api/rewrite", { brief, script, index, note }),
  image: (provider: string, prompt: string, style: string, aspect: Brief["format"], section: string) =>
    call<{ dataUrl: string }>("/api/image", { provider, prompt, style, aspect, section }),
};
