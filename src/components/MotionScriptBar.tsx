// The top of the explainer studio: the piece's problem and length, how long it should be, writing the script, and the
// director's note (the writer changes only what it asks).
import { useEffect, useState } from "react";
import { durationChoices, type MotionPiece, type MotionScript } from "../../shared/motion.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";
import { Button, Field, Segmented, Spinner, inputClass } from "./ui.tsx";

type Props = {
  series: SeriesInfo;
  script: MotionScript | null;
  total: number;
  piece: MotionPiece;
  set: (patch: Partial<MotionPiece>) => void;
  busy: string | null;
  writeScript: () => Promise<void>;
  // "Sin clave": the script and the director's note by copy and paste with claude.ai (null: a writer is connected).
  handoffs: { write: Handoff; note: Handoff } | null;
  fitToTarget: () => void;
  directorNote: string;
  setDirectorNote: (note: string) => void;
  applyNote: () => Promise<void>;
};

export function MotionScriptBar({ series, script, total, piece, set, busy, writeScript, handoffs, fitToTarget, directorNote, setDirectorNote, applyNote }: Props) {
  // The field keeps what is being typed. Committing on every key would drop "100" at the "1".
  const [typed, setTyped] = useState(String(piece.target));
  useEffect(() => setTyped(String(piece.target)), [piece.target]);
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
              <>
                <Segmented
                  value={String(piece.target)}
                  onChange={(v) => set({ target: Number(v) })}
                  options={durationChoices(piece.target).map((d) => ({ value: String(d), label: `${d} s` }))}
                />
                <input
                  type="number"
                  min={2}
                  max={120}
                  className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
                  aria-label="Segundos del explicativo"
                  value={typed}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTyped(raw);
                    const n = Number(raw);
                    if (raw.trim() !== "" && Number.isInteger(n) && n >= 2 && n <= 120) set({ target: n });
                  }}
                  onBlur={() => setTyped(String(piece.target))}
                />
              </>
            )}
          </div>
        </Field>
        <Button onClick={writeScript} disabled={busy !== null} variant={handoffs ? "secondary" : "primary"}>
          {busy === "write" ? (
            <>
              <Spinner /> Escribiendo…
            </>
          ) : handoffs ? (
            "Ver un ejemplo"
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
        {handoffs && (
          <ClaudeHandoff
            className="min-w-[16rem] flex-1"
            title={script ? "Otro guion" : "El guion"}
            what="el guion del explicativo"
            disabled={busy !== null}
            via={handoffs.write}
          />
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
          {/* Without a key the sample cannot change the script: the note goes to claude.ai. */}
          {!handoffs && (
            <Button variant="secondary" onClick={applyNote} disabled={!directorNote.trim() || busy !== null}>
              {busy === "note" ? (
                <>
                  <Spinner /> Aplicando la nota…
                </>
              ) : (
                "Aplicar la nota"
              )}
            </Button>
          )}
          {handoffs && (
            <ClaudeHandoff
              title="La nota"
              what="el guion con la nota aplicada"
              disabled={busy !== null || !directorNote.trim()}
              via={handoffs.note}
            />
          )}
        </div>
      )}
    </>
  );
}
