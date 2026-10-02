export type Aspect = "vertical" | "horizontal";

export type ImageRequest = { prompt: string; style: string; aspect: Aspect; section: string };

export interface ImageProvider {
  id: string;
  label: string;
  hint: string;
  available(): boolean;
  generate(req: ImageRequest): Promise<string>;
}

export async function toDataUrl(res: Response): Promise<string> {
  const type = res.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}

// Every prompt gets the same guardrails, whatever the shot says.
export function guardedPrompt({ prompt, style }: ImageRequest): string {
  const parts = [prompt, style].map((p) => p.trim().replace(/\.+$/, "")).filter(Boolean);
  return `${parts.join(". ")}. Photographic, cinematic still. No text, letters, signs, logos or brand names in the image. No real public figures.`;
}
