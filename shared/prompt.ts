// The full text sent to an image generator (or copied for one) for a single shot.
export function buildImagePrompt(prompt: string, style: string): string {
  const parts = [prompt, style].map((p) => p.trim().replace(/\.+$/, "")).filter(Boolean);
  return `${parts.join(". ")}. Photographic, cinematic still. No text, letters, signs, logos or brand names in the image. No real public figures.`;
}

// Same prompt plus the frame shape, for pasting into an image tool by hand.
export function buildCopyPrompt(prompt: string, style: string, format: "vertical" | "horizontal"): string {
  const shape = format === "vertical" ? "Vertical 9:16 (portrait)." : "Horizontal 16:9 (landscape).";
  return `${buildImagePrompt(prompt, style)} ${shape}`;
}
