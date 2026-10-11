// Next to the inspector: undo, and the switches that change how the whole explainer plays (cuts on the beats, blur in the
// cuts, word by word subtitles) or what the preview shows (the platform's bands on 9:16).
import type { MotionPiece, MotionScene } from "../../shared/motion.ts";
import { wordByWordOn } from "../../shared/subtitles.ts";
import { Button } from "./ui.tsx";

type Props = {
  undoCount: number;
  undo: () => void;
  snap: boolean;
  set: (patch: Partial<MotionPiece>) => void;
  pushes: boolean;
  cutBlur: boolean;
  voiced: MotionScene[];
  heardCount: number;
  autoSync: boolean;
  piece: MotionPiece;
  vertical: boolean;
  guides: boolean;
  setGuides: (on: boolean) => void;
};

export function MotionToggles({ undoCount, undo, snap, set, pushes, cutBlur, voiced, heardCount, autoSync, piece, vertical, guides, setGuides }: Props) {
  return (
    <>
      <div className="flex shrink-0 flex-col items-end gap-2 text-xs">
        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={undoCount === 0} onClick={undo} title="Ctrl+Z">
          ↶ Deshacer
        </Button>
        <label className="flex items-center gap-1.5" title="Los cortes de escena caen en los beats de la música">
          <input type="checkbox" checked={snap} onChange={(e) => set({ snap: e.target.checked })} />
          Cortes en los beats
        </label>
        <label
          className={`flex items-center gap-1.5 ${pushes ? "" : "text-muted"}`}
          title={
            pushes
              ? "Mientras una escena entra empujando a la anterior, lo que se mueve deja un rastro, como con una cámara. Fuera de los cortes no cambia nada."
              : "Este guion corta seco: no hay empuje entre escenas para desenfocar."
          }
        >
          <input type="checkbox" checked={cutBlur} disabled={!pushes} onChange={(e) => set({ cutBlur: e.target.checked })} />
          Desenfoque en los cortes
        </label>
        <label
          className="flex items-center gap-1.5"
          title={
            !voiced.length
              ? "Ninguna escena tiene voz: no hay subtítulos."
              : heardCount
                ? `La palabra que se dice se marca en el subtítulo. ${heardCount} de ${voiced.length} escenas con los tiempos escuchados en su voz; el resto, estimados.`
                : `La palabra que se dice se marca en el subtítulo. Tiempos estimados por el largo de la voz${autoSync ? "" : " (con OPENAI_API_KEY se escuchan en la voz)"}.`
          }
        >
          <input type="checkbox" checked={wordByWordOn(piece)} onChange={(e) => set({ wordByWord: e.target.checked })} />
          Palabra por palabra
        </label>
        {vertical && (
          <label
            className="flex items-center gap-1.5"
            title="Dónde Reels, TikTok y Shorts ponen su barra, su texto y sus botones (medidas aproximadas). Solo se ve acá, nunca en el video."
          >
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            Ver lo que tapa la app
          </label>
        )}
      </div>
    </>
  );
}
