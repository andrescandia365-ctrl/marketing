// The full text sent to an image generator API for a single shot.
export function buildImagePrompt(prompt: string, style: string): string {
  const parts = [prompt, style].map((p) => p.trim().replace(/\.+$/, "")).filter(Boolean);
  return `${parts.join(". ")}. Photographic, cinematic still. No text, letters, signs, logos or brand names in the image. No real public figures.`;
}

// What the person pastes into their image tool: the prompt is already complete for that tool,
// so only the frame shape is added as a reminder (the tool's own control sets it).
export function buildCopyPrompt(prompt: string, format: "vertical" | "horizontal"): string {
  return `${prompt.trim()} ${format === "vertical" ? "Vertical 9:16." : "Horizontal 16:9."}`;
}
