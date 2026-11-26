// Image generators the app can call. Each one turns a shot's prompt into a data URL the browser can draw
// into the video canvas (a data URL never taints the canvas, a cross-origin URL would).
import type { ImageProviderInfo } from "../../shared/schema.ts";
import { MEDIA_KEYS, MEDIA_PROVIDER_LABEL, costText, estimateCost, mediaProviderId, type MediaModelInfo } from "../../shared/mediaModels.ts";
import { mediaModels } from "../media/catalog.ts";
import { falImage, xaiImage } from "../media/clients.ts";
import { logSpend } from "../media/spend.ts";
import { openai } from "./openai.ts";
import { placeholder } from "./placeholder.ts";
import { replicate } from "./replicate.ts";
import { guardedPrompt, type ImageProvider } from "./util.ts";

// One provider per image model in server/media/modelos-api.md ("xai:grok-imagine-image", "fal:fal-ai/nano-banana").
function apiProvider(m: MediaModelInfo): ImageProvider {
  return {
    id: mediaProviderId(m),
    label: `${m.label} · ${costText(estimateCost(m))} por imagen`,
    hint: `Configurá ${MEDIA_KEYS[m.provider]} (${MEDIA_PROVIDER_LABEL[m.provider]}) en Modelos.`,
    available: () => mediaModels().some((x) => x.provider === m.provider && x.model === m.model && x.available),
    async generate(req) {
      const prompt = guardedPrompt(req);
      const dataUrl = m.provider === "xai" ? await xaiImage(m.model, prompt, req.aspect) : await falImage(m.model, prompt, req.aspect);
      await logSpend({ provider: m.provider, model: m.model, kind: "imagen", usd: estimateCost(m) });
      return dataUrl;
    },
  };
}

function providers(): ImageProvider[] {
  const api = mediaModels()
    .filter((m) => m.kind === "imagen")
    .map(apiProvider);
  return [openai, replicate, ...api, placeholder];
}

export function listProviders(): ImageProviderInfo[] {
  return providers().map((p) => ({ id: p.id, label: p.label, available: p.available(), hint: p.hint }));
}

export function getProvider(id: string): ImageProvider | undefined {
  return providers().find((p) => p.id === id && p.available());
}
