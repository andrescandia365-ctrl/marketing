import { useEffect, useRef } from "react";
import { PLATE_LOOK_LABEL, PLATE_LOOKS, type LyricPiece, type LyricPlate, type PlateLook } from "../../shared/lyrics.ts";
import { joinPlate, splitPlate } from "../../shared/plates.ts";
import { drawLyricFrame } from "../lib/lyricRender.ts";
import { Button, Field, inputClass } from "./ui.tsx";

type Props = {
  piece: LyricPiece;
  cuts: number[];
  busy: boolean;
  suggesting: boolean;
  onChange: (plates: LyricPlate[]) => void;
  onNote: (note: string) => void;
  onToggle: (on: boolean) => void;
  onBuild: () => void;
  onAsk: () => void;
  onSeek: (t: number) => void;
};

// The edit: one plate per stretch, a thumb of the frame, and the one thing the plate is about.
export function LyricPlates({ piece, cuts, busy, suggesting, onChange, onNote, onToggle, onBuild, onAsk, onSeek }: Props) {
  const vertical = piece.format === "vertical";
  const [tw, th] = vertical ? [120, 213] : [240, 135];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cada tramo es una placa. La letra se prende con la palabra, no con el beat.
        {cuts.length ? " El corte entra en el uno del compás." : " Sin el Reloj, cada placa entra con su primera palabra."} Un motivo por placa, adentro de la escena.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onBuild} disabled={busy || piece.lines.length === 0}>
          Armar desde la letra
        </Button>
        <Button variant="secondary" onClick={onAsk} disabled={busy || piece.lines.length === 0}>
          {suggesting ? "Pidiendo…" : "Pedir la dirección"}
        </Button>
        {piece.plates.length > 0 && (
          <Button variant="ghost" onClick={() => onToggle(!piece.plateOn)} disabled={busy}>
            {piece.plateOn ? "Volver a la letra de siempre" : "Ver las placas"}
          </Button>
        )}
      </div>
      <Field label="Nota para la dirección" hint="Qué cambiar en la próxima pasada. La IA la lee cuando se la pedís.">
        <textarea className={`${inputClass} min-h-20`} value={piece.plateNote} onChange={(e) => onNote(e.target.value)} />
      </Field>
      {piece.plates.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay placas. Armalas desde la letra, o pedile la dirección a la IA.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {piece.plates.map((plate, index) => (
            <li key={plate.id} className="rounded-xl border border-line bg-white p-3">
              <div className="flex items-start gap-3">
                <button type="button" className="shrink-0" onClick={() => onSeek(piece.lines[plate.from]?.start ?? 0)} title="Ir a esta placa">
                  <PlateThumb piece={piece} cuts={cuts} plate={plate} width={tw} height={th} />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-mono text-[11px] text-muted">
                    {index + 1} · líneas {plate.from + 1}–{plate.to + 1}
                  </p>
                  <input
                    className={inputClass}
                    value={plate.title}
                    aria-label={`Nombre de la placa ${index + 1}`}
                    onChange={(e) => onChange(piece.plates.map((item) => (item.id === plate.id ? { ...item, title: e.target.value } : item)))}
                  />
                  <select
                    className={inputClass}
                    value={plate.look}
                    aria-label={`Look de la placa ${index + 1}`}
                    onChange={(e) =>
                      onChange(piece.plates.map((item) => (item.id === plate.id ? { ...item, look: e.target.value as PlateLook } : item)))
                    }
                  >
                    {PLATE_LOOKS.map((look) => (
                      <option key={look} value={look}>
                        {PLATE_LOOK_LABEL[look]}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    value={plate.motif}
                    aria-label={`Motivo de la placa ${index + 1}`}
                    onChange={(e) => onChange(piece.plates.map((item) => (item.id === plate.id ? { ...item, motif: e.target.value } : item)))}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs leading-snug text-muted">{piece.lines.slice(plate.from, plate.to + 1).map((line) => line.text).join(" / ")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {plate.to > plate.from && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => onChange(splitPlate(piece.plates, plate.id, plate.from + 1))}
                  >
                    Cortar
                  </Button>
                )}
                {index < piece.plates.length - 1 && (
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onChange(joinPlate(piece.plates, plate.id))}>
                    Unir con la siguiente
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlateThumb({ piece, cuts, plate, width, height }: { piece: LyricPiece; cuts: number[]; plate: LyricPlate; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const at = (piece.lines[plate.from]?.start ?? 0) + 0.2;
  const key = `${plate.look}|${plate.motif}|${plate.from}|${plate.to}|${piece.style.palette.join()}|${piece.style.font}|${width}`;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawLyricFrame(ctx, canvas.width, canvas.height, at, { ...piece, plateOn: true }, null, [], [], {}, cuts);
  }, [piece, cuts, plate, at, key, width, height]);
  return <canvas ref={ref} width={width} height={height} className="rounded-lg border border-line" />;
}
