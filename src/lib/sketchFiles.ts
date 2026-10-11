// The app's pencil sketch of each shot as a PNG in the project folder (boceto-app-NN.png), so pieza.md can show the
// sketch next to its "Prompt de boceto". The drawing is lib/sketch.ts (deterministic), so a shot is drawn again only
// when what its sketch reads changes; a shot with a sketch the person uploaded is skipped (pieza.md links that one).
import type { Board, Brief } from "../../shared/schema.ts";
import { timeShots, type TimedShot } from "../../shared/template.ts";
import { drawSketch, sketchSetups, type SketchSetup } from "./sketch.ts";

export type SketchJob = { index: number; key: string; shot: TimedShot; setups: SketchSetup[] };

export const SKETCH_SIZE: Record<Brief["format"], { w: number; h: number }> = {
  vertical: { w: 540, h: 960 },
  horizontal: { w: 960, h: 540 },
};

// What each shot's sketch is drawn from (drawSketch reads the index, the prompt, the action, the kind and the setups),
// as a key that changes exactly when the picture would.
export function sketchJobs(
  board: Board,
  castKinds: Record<string, string>,
  format: Brief["format"],
  uploaded: Record<number, string | undefined>,
): SketchJob[] {
  const setups = Object.fromEntries(board.setups.map((s) => [s.id, s]));
  return timeShots(board.shots)
    .filter((shot) => !uploaded[shot.index])
    .map((shot) => {
      const drawn = sketchSetups(shot, setups, castKinds);
      const key = JSON.stringify([format, shot.index, shot.kind, shot.visualPrompt, shot.action, drawn]);
      return { index: shot.index, key, shot, setups: drawn };
    });
}

export async function sketchPng(job: SketchJob, format: Brief["format"]): Promise<Blob> {
  const { w, h } = SKETCH_SIZE[format];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede dibujar el boceto.");
  drawSketch(ctx, job.shot, job.setups);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo guardar el boceto."))), "image/png"),
  );
}
