import { buildImagePrompt } from "../../shared/prompt.ts";

export type Aspect = "vertical" | "horizontal";

// look: the series look as one line (lookPhrase), "" with none.
export type ImageRequest = { prompt: string; style: string; aspect: Aspect; beat: string; look?: string };

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
export function guardedPrompt({ prompt, style, look }: ImageRequest): string {
  return buildImagePrompt(prompt, style, look);
}
