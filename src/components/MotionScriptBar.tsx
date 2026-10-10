// The top of the explainer studio: the piece's problem and length, how long it should be, writing the script, and the
// director's note (the writer changes only what it asks).
import { DURATIONS, type MotionPiece, type MotionScript } from "../../shared/motion.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import { Button, Field, Segmented, Spinner, inputClass } from "./ui.tsx";

type Props = {
  series: SeriesInfo;
  script: MotionScript | null;
  total: number;
  piece: MotionPiece;
  set: (patch: Partial<MotionPiece>) => void;
  busy: string | null;
  writeScript: () => Promise<void>;
  fitToTarget: () => void;
  directorNote: string;
  setDirectorNote: (note: string) => void;
  applyNote: () => Promise<void>;
};

export function MotionScriptBar({ series, script, total, piece, set, busy, writeScript, fitToTarget, directorNote, setDirectorNote, applyNote }: Props) {
  return (
    <>
      <div>
        <p className="font-mono text-xs text-muted">{series.name} · explicativo (motion graphics)</p>
        <h2 className="text-xl font-bold tracking-tight">{script?.problem || "Explicativo sin guion todavía"}</h2>
        {script && <p className="text-sm text-muted">{script.title} · {total.toFixed(1)} s</p>}
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-white p-4">
        <Field label="Duración" group hint="Automática: la IA la elige según el tema. A mano: elegís los segundos.">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={piece.durationMode}
              onChange={(durationMode) => set({ durationMode })}
              options={[
                { value: "auto", label: "Automática" },
                { value: "manual", label: "A mano" },
              ]}
            />
            {piece.durationMode === "manual" && (
              <Segmented
                value={String(piece.target)}
                onChange={(v) => set({ target: Number(v) })}
                options={DURATIONS.map((d) => ({ value: String(d), label: `${d} s` }))}
              />
            )}
          </div>
        </Field>
        <Button onClick={writeScript} disabled={busy !== null}>
          {busy === "write" ? (
            <>
              <Spinner /> Escribiendo…
            </>
          ) : script ? (
            "Escribir otro guion"
          ) : (
            "Escribir el explicativo"
          )}
        </Button>
        {script && piece.durationMode === "manual" && Math.abs(total - piece.target) > 1 && (
          <Button variant="secondary" onClick={fitToTarget}>
            Ajustar a {piece.target} s
          </Button>
        )}
      </div>

      {script && (
        <div className="space-y-2 rounded-xl border border-line bg-white p-4">
          <label className="block">
            <span className="text-sm font-semibold">Nota del director</span>
            <span className="block text-xs text-muted">Qué cambiar. La IA toca solo eso y deja el resto como está, con tus ajustes y tus voces.</span>
            <textarea
              className={`${inputClass} mt-1.5 text-sm`}
              rows={2}
              value={directorNote}
              placeholder="ej. el gancho tarda mucho; en la escena 3 mostrá la pantalla de pedidos; sacá la estadística"
              onChange={(e) => setDirectorNote(e.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={applyNote} disabled={!directorNote.trim() || busy !== null}>
            {busy === "note" ? (
              <>
                <Spinner /> Aplicando la nota…
              </>
            ) : (
              "Aplicar la nota"
            )}
          </Button>
        </div>
      )}
    </>
  );
}
