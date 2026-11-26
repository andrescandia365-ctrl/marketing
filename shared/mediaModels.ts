// Image and video models called by API (server/media/modelos-api.md). Pure: the table is parsed here, and the
// helpers that turn one request into a provider's own fields (lengths, aspect, inputs) live here so they are tested.

export type MediaProvider = "xai" | "fal";
export type MediaKind = "imagen" | "video";
export type VideoInput = "texto" | "imagen" | "ambas";

export type MediaModel = {
  provider: MediaProvider;
  kind: MediaKind;
  model: string;
  label: string;
  // US dollars per unit: one image, or one second of video.
  price: number;
  unit: "imagen" | "segundo";
  // Video only.
  input?: VideoInput;
  seconds?: number[];
  tag: string;
};

// What the browser sees: a model plus whether its key is set.
export type MediaModelInfo = MediaModel & { available: boolean };

export const MEDIA_KEYS: Record<MediaProvider, string> = { xai: "XAI_API_KEY", fal: "FAL_KEY" };
export const MEDIA_PROVIDER_LABEL: Record<MediaProvider, string> = { xai: "xAI", fal: "fal.ai" };

// "1-15" → 1..15, "4,6,8" → [4, 6, 8]. Anything else: [].
export function parseSeconds(text: string): number[] {
  const t = text.trim();
  const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    if (a < 1 || b < a || b > 120) return [];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const list = t
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 120);
  return [...new Set(list)].sort((x, y) => x - y);
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

// The first pipe table of the file whose header names "proveedor". Rows that do not read are skipped and listed.
export function parseModelTable(md: string): { models: MediaModel[]; skipped: string[] } {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith("|") && /\bproveedor\b/i.test(l));
  if (start < 0) return { models: [], skipped: [] };
  const header = cells(lines[start]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const models: MediaModel[] = [];
  const skipped: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith("|")) break;
    const c = cells(line);
    if (c.every((x) => /^:?-+:?$/.test(x) || x === "")) continue;
    const get = (name: string) => (col(name) >= 0 ? (c[col(name)] ?? "") : "");
    const provider = get("proveedor").toLowerCase();
    const kind = get("tipo").toLowerCase();
    const unit = get("unidad").toLowerCase();
    const price = Number(get("precio").replace(",", "."));
    const model = get("modelo");
    if ((provider !== "xai" && provider !== "fal") || (kind !== "imagen" && kind !== "video") || !model || !(price >= 0) || (unit !== "imagen" && unit !== "segundo")) {
      skipped.push(line.trim());
      continue;
    }
    const entry: MediaModel = { provider, kind, model, label: get("nombre") || model, price, unit, tag: get("etiqueta") };
    if (kind === "video") {
      const input = get("entrada").toLowerCase();
      entry.input = input === "texto" || input === "imagen" ? input : "ambas";
      entry.seconds = parseSeconds(get("segundos"));
      if (!entry.seconds.length) {
        skipped.push(line.trim());
        continue;
      }
    }
    models.push(entry);
  }
  return { models, skipped };
}

// The length to ask the model for: the smallest it accepts that covers what is wanted, else its longest.
export function pickDuration(accepted: number[], wanted: number): number {
  const sorted = [...accepted].sort((a, b) => a - b);
  if (!sorted.length) return Math.max(1, Math.round(wanted));
  return sorted.find((s) => s >= wanted - 1e-6) ?? sorted[sorted.length - 1];
}

// What one generation costs by the table, in US dollars.
export function estimateCost(model: Pick<MediaModel, "price" | "unit">, seconds = 0): number {
  return model.unit === "segundo" ? model.price * Math.max(0, seconds) : model.price;
}

// "US$ 0,30" (Rioplatense: comma decimals). Under a cent shows "menos de US$ 0,01".
export function costText(usd: number): string {
  if (usd > 0 && usd < 0.005) return "menos de US$ 0,01";
  return `US$ ${usd.toFixed(2).replace(".", ",")}`;
}

export type Aspect = "vertical" | "horizontal";
export const aspectRatio = (aspect: Aspect) => (aspect === "vertical" ? "9:16" : "16:9");

// A model that only takes a start picture cannot run without one; one that only takes text ignores it.
export function needsImage(model: Pick<MediaModel, "input">): boolean {
  return model.input === "imagen";
}
export function usesImage(model: Pick<MediaModel, "input">, hasImage: boolean): boolean {
  return hasImage && model.input !== "texto";
}

export type VideoRequest = {
  model: string;
  prompt: string;
  seconds: number;
  aspect: Aspect;
  // A data URL of the start frame, when the model takes one.
  image?: string;
  audio: boolean;
  resolution?: "480p" | "720p" | "1080p";
};

// xAI POST /v1/videos/generations. With a start picture the clip keeps its shape, so aspect_ratio is left out.
export function xaiVideoBody(req: VideoRequest): Record<string, unknown> {
  return {
    model: req.model,
    prompt: req.prompt,
    duration: req.seconds,
    ...(req.image ? { image: { url: req.image } } : { aspect_ratio: aspectRatio(req.aspect) }),
    resolution: req.resolution ?? "480p",
    ...(req.audio ? {} : { generate_audio: false }),
  };
}

// fal queue input for a video model. Each family names its fields its own way.
export function falVideoInput(req: VideoRequest): Record<string, unknown> {
  if (req.model.includes("kling-video")) {
    return { prompt: req.prompt, image_url: req.image, duration: String(req.seconds), generate_audio: req.audio };
  }
  if (req.model.includes("veo3")) {
    return {
      prompt: req.prompt,
      aspect_ratio: aspectRatio(req.aspect),
      duration: `${req.seconds}s`,
      resolution: req.resolution === "1080p" ? "1080p" : "720p",
      generate_audio: req.audio,
    };
  }
  return { prompt: req.prompt, ...(req.image ? { image_url: req.image } : {}), duration: String(req.seconds), aspect_ratio: aspectRatio(req.aspect) };
}

// fal queue input for an image model.
export function falImageInput(model: string, prompt: string, aspect: Aspect): Record<string, unknown> {
  if (model.includes("flux")) return { prompt, image_size: aspect === "vertical" ? "portrait_16_9" : "landscape_16_9", num_images: 1, output_format: "png" };
  return { prompt, aspect_ratio: aspectRatio(aspect), num_images: 1, output_format: "png" };
}

// The image-provider id the existing image picker uses for one API model: "xai:grok-imagine-image".
export const mediaProviderId = (m: Pick<MediaModel, "provider" | "model">) => `${m.provider}:${m.model}`;
export function splitProviderId(id: string): { provider: MediaProvider; model: string } | null {
  const at = id.indexOf(":");
  if (at < 0) return null;
  const provider = id.slice(0, at);
  if (provider !== "xai" && provider !== "fal") return null;
  const model = id.slice(at + 1);
  return model ? { provider, model } : null;
}
