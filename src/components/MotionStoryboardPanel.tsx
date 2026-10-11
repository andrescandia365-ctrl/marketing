// "Storyboard" in the explainer studio: closed by default, and its code (MotionStoryboard) downloads only when opened.
import { Suspense, lazy, type Dispatch, type SetStateAction } from "react";
import type { MotionPiece, MotionScene, MotionScript } from "../../shared/motion.ts";
import type { MotionWorld } from "../lib/motion.ts";
import type { AudioFile } from "./Audio.tsx";
import type { Selection } from "./MotionTimeline.tsx";
import { Button, PartBoundary, Spinner } from "./ui.tsx";

// "Storyboard": downloaded only when the person opens it.
const MotionStoryboard = lazy(() => import("./MotionStoryboard.tsx").then((m) => ({ default: m.MotionStoryboard })));

type Props = {
  boardOpen: boolean;
  setBoardOpen: Dispatch<SetStateAction<boolean>>;
  script: MotionScript;
  scenes: MotionScene[];
  world: MotionWorld;
  piece: MotionPiece;
  track: { file: AudioFile; buffer: AudioBuffer } | null;
  seek: (t: number) => void;
  setSelected: (selection: Selection | null) => void;
};

export function MotionStoryboardPanel({ boardOpen, setBoardOpen, script, scenes, world, piece, track, seek, setSelected }: Props) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">Storyboard</h3>
            <p className="text-xs text-muted">Una viñeta por escena: el cuadro ya armado, lo que se dice, lo que suena, cómo entra y la cámara.</p>
          </div>
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setBoardOpen((v) => !v)}>
            {boardOpen ? "Cerrar el storyboard" : "Ver el storyboard"}
          </Button>
        </div>
        {boardOpen && (
          <PartBoundary>
            <Suspense
              fallback={
                <div className="flex items-center gap-2 p-4 text-sm text-muted">
                  <Spinner /> Cargando…
                </div>
              }
            >
              <MotionStoryboard
                script={script}
                scenes={scenes}
                world={world}
                format={piece.format}
                music={piece.music === "track" && !track ? "none" : piece.music}
                effects={piece.effects ?? "library"}
                voice={piece.voice}
                onSeek={(t, sceneId) => {
                  seek(t);
                  setSelected({ sceneId, key: null });
                }}
              />
            </Suspense>
          </PartBoundary>
        )}
      </div>
    </>
  );
}
