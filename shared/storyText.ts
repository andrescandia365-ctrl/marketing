// Where the story's text sits on a frame (IDEAS idea 21): the headline (arriba / centro) and the subtitle block,
// the speaker's name plus its line (abajo / centro / arriba). Pure, so the render, the storyboard's phone frames,
// "Ver la pieza" and Publicidad's pieces place it the same way, and the tests can check it per format.
// On a 9:16 frame everything stays inside the platform's safe zone (shared/safeZone.ts); the subtitle never sits
// over the headline. The defaults (headline arriba, subtitle abajo) give exactly the look every series had before.
import { isPhoneFrame, safeRect } from "./safeZone.ts";

export const SUBTITLE_POSITIONS = ["bottom", "center", "top"] as const;
export type SubtitlePosition = (typeof SUBTITLE_POSITIONS)[number];
export const HEADLINE_POSITIONS = ["top", "center"] as const;
export type HeadlinePosition = (typeof HEADLINE_POSITIONS)[number];
export const SUBTITLE_POSITION_LABEL: Record<SubtitlePosition, string> = { bottom: "Abajo", center: "Centro", top: "Arriba" };
export const HEADLINE_POSITION_LABEL: Record<HeadlinePosition, string> = { top: "Arriba", center: "Centro" };

// A short list of Google Fonts for the story's text when the series has no brand font it wants there.
export const STORY_FONTS = ["Inter", "DM Sans", "Work Sans", "Manrope", "Space Grotesk", "Archivo Black", "Bebas Neue", "Fraunces"] as const;

export type StoryTextInput = {
  w: number;
  h: number;
  // Heights in pixels of what is drawn: the headline (0 when there is none) and the subtitle's lines (0 when none).
  headline: number;
  subtitle: number;
  // Room the speaker's name takes above the subtitle (0 when no name is drawn).
  name: number;
  // The shot carries CONCEPTO / SIMULACIÓN in the top right; the AI notice sits at the bottom.
  labelled: boolean;
  disclosure: boolean;
  headlinePosition?: HeadlinePosition;
  subtitlePosition?: SubtitlePosition;
};

export type StoryTextLayout = {
  // Top of the headline's first line, and of the subtitle's first line (the name sits `name` above it).
  headlineTop: number;
  subtitleTop: number;
  // Where text may go: under the top bar (and the label), above the notice and the platform's caption.
  area: { top: number; bottom: number };
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

export function storyTextLayout(o: StoryTextInput): StoryTextLayout {
  const { w, h } = o;
  const unit = Math.min(w, h);
  const phone = isPhoneFrame(w, h);
  const safe = safeRect(w, h);
  const top = phone ? safe.y + unit * (o.labelled ? 0.1 : 0.03) : h * 0.08;
  const bottom = phone ? safe.y + safe.h - unit * (o.disclosure ? 0.06 : 0.01) : h - unit * (o.disclosure ? 0.13 : 0.08);
  const gap = unit * 0.03;
  const block = o.name + o.subtitle;

  let headlineTop = o.headlinePosition === "center" ? clamp(h / 2 - o.headline / 2, top, bottom - o.headline) : top;

  // Where the subtitle block (name and line) would go on its own.
  const bottomBlock = Math.min(h * 0.8, bottom - o.subtitle) - o.name;
  let blockTop =
    o.subtitlePosition === "top" ? top : o.subtitlePosition === "center" ? clamp(h / 2 - block / 2, top, bottom - block) : bottomBlock;

  if (o.headline > 0 && block > 0) {
    const overlaps = (t: number, head: number) => t < head + o.headline + gap && t + block + gap > head;
    if (overlaps(blockTop, headlineTop)) {
      // Below the headline first, then above it; with no room either way the headline goes up to the top and the
      // subtitle under it, or (text too big for the frame) to the old place at the bottom.
      const below = headlineTop + o.headline + gap;
      const above = headlineTop - gap - block;
      if (below + block <= bottom) blockTop = below;
      else if (above >= top) blockTop = above;
      else {
        headlineTop = top;
        blockTop = top + o.headline + gap + block <= bottom ? top + o.headline + gap : Math.max(bottomBlock, top + o.headline + gap);
      }
    }
  }
  return { headlineTop, subtitleTop: blockTop + o.name, area: { top, bottom } };
}

