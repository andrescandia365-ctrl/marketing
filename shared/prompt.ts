// The full text sent to an image generator API for a single shot.
export function buildImagePrompt(prompt: string, style: string): string {
  const parts = [prompt, style].map((p) => p.trim().replace(/\.+$/, "")).filter(Boolean);
  return `${parts.join(". ")}. Photographic, cinematic still. No text, letters, signs, logos or brand names in the image. No real public figures.`;
}

// Storyboard sketches made with an image tool live in the project's image slots SKETCH_BASE + shot index.
export const SKETCH_BASE = 400;

// The drawn storyboard's "Boceto con IA": the shot's frozen moment as a quick pencil sketch, to check framing and
// staging before paying for the real image. The look's flaws and the realism words go; no colour, no text.
export function sketchPrompt(visualPrompt: string, format: "vertical" | "horizontal"): string {
  const moment = visualPrompt
    .replace(/\b(photo-?realistic|hyper-?realistic|realistic|photograph(ic)?|photo|cinematic|film still|film grain|grain(y)?|bokeh|shallow depth of field|depth of field|muted colou?rs?|warm colou?rs?|cold colou?rs?|35mm|50mm|85mm|f\/\d(\.\d)?|skin (texture|pores)[^,.]*|visible pores|freckles)\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*(?=[.;]|$)/g, "")
    .replace(/\s+\./g, ".")
    .trim();
  return `Rough storyboard sketch, pencil on white paper, loose confident lines, grey shading only, no colour, no text, no logos, simple faces with no likeness of any real person. ${format === "vertical" ? "Vertical 9:16 frame" : "Horizontal 16:9 frame"}. The moment: ${moment}`;
}

// What the person pastes into their image tool: the prompt is already complete for that tool,
// so only the frame shape is added as a reminder (the tool's own control sets it).
export function buildCopyPrompt(prompt: string, format: "vertical" | "horizontal"): string {
  return `${prompt.trim()} ${format === "vertical" ? "Vertical 9:16." : "Horizontal 16:9."}`;
}
