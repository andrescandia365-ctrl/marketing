import { guardedPrompt, type ImageProvider } from "./util.ts";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export const openai: ImageProvider = {
  id: "openai",
  label: "OpenAI Images",
  hint: "Configurá OPENAI_API_KEY (y si querés OPENAI_IMAGE_MODEL).",
  available: () => Boolean(process.env.OPENAI_API_KEY),
  async generate(req) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: guardedPrompt(req),
        size: req.aspect === "vertical" ? "1024x1536" : "1536x1024",
        n: 1,
      }),
    });
    const body = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`OpenAI Images: ${body.error?.message ?? res.statusText}`);
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI Images no devolvió ninguna imagen.");
    return `data:image/png;base64,${b64}`;
  },
};
