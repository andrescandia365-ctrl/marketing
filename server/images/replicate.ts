import { guardedPrompt, toDataUrl, type ImageProvider } from "./util.ts";

const MODEL = process.env.REPLICATE_IMAGE_MODEL || "black-forest-labs/flux-schnell";

type Prediction = { status: string; output?: string | string[]; error?: string; detail?: string };

export const replicate: ImageProvider = {
  id: "replicate",
  label: "Replicate (Flux)",
  hint: "Set REPLICATE_API_TOKEN (and optionally REPLICATE_IMAGE_MODEL).",
  available: () => Boolean(process.env.REPLICATE_API_TOKEN),
  async generate(req) {
    const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt: guardedPrompt(req),
          aspect_ratio: req.aspect === "vertical" ? "9:16" : "16:9",
          output_format: "png",
        },
      }),
    });
    const body = (await res.json()) as Prediction;
    if (!res.ok) throw new Error(`Replicate: ${body.detail ?? body.error ?? res.statusText}`);
    if (body.status !== "succeeded") throw new Error(`Replicate: image not ready (${body.status}). Try again.`);
    const url = Array.isArray(body.output) ? body.output[0] : body.output;
    if (!url) throw new Error("Replicate returned no image.");
    const image = await fetch(url);
    if (!image.ok) throw new Error("Replicate: could not download the image.");
    return toDataUrl(image);
  },
};
