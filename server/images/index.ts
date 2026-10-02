// Image generators the app can call. Each one turns a shot's prompt into a data URL the browser can draw
// into the video canvas (a data URL never taints the canvas, a cross-origin URL would).
import type { ImageProviderInfo } from "../../shared/schema.ts";
import { openai } from "./openai.ts";
import { placeholder } from "./placeholder.ts";
import { replicate } from "./replicate.ts";
import type { ImageProvider } from "./util.ts";

const PROVIDERS: ImageProvider[] = [openai, replicate, placeholder];

export function listProviders(): ImageProviderInfo[] {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, available: p.available(), hint: p.hint }));
}

export function getProvider(id: string): ImageProvider | undefined {
  return PROVIDERS.find((p) => p.id === id && p.available());
}
