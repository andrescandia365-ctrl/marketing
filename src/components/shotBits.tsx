// Small pieces the storyboard and the production view share. Kept apart from BoardView, which draws with the video
// renderer, so production does not load the renderer until it is needed.
import { actionWords } from "../../shared/checks.ts";

export const BEAT_EDGE = { negative: "border-l-neg", touching: "border-l-touch", good: "border-l-good" };

// Yellow, not blocking: an image prompt that seems to describe more than one moment.
export function ActionWarning({ prompt }: { prompt: string }) {
  const words = actionWords(prompt);
  if (!words.length) return null;
  return (
    <p className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
      ¿Acción en la imagen? ({words.join(", ")}). Una imagen es un solo momento; las acciones van en el prompt de video.
    </p>
  );
}
