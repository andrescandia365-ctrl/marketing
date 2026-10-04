// Graphics timed to a lyric line: an app-drawn motif, or a pasted PNG, JPG or SVG.
import {
  LYRIC_MOTIFS,
  LYRIC_MOTIF_LABEL,
  LYRIC_MOTIONS,
  LYRIC_MOTION_LABEL,
  LYRIC_PLACES,
  LYRIC_PLACE_LABEL,
  type LyricElement,
  type LyricPiece,
} from "../../shared/lyrics.ts";
import { Button, Notice, inputClass } from "./ui.tsx";

type Props = {
  piece: LyricPiece;
  busy: boolean;
  suggesting: boolean;
  images: Record<number, HTMLImageElement>;
  onSuggest: () => void;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<LyricElement>) => void;
  onRemove: (id: string) => void;
  onImage: (id: string, file: File) => void;
  onClearImage: (id: string) => void;
  onNext: () => void;
};

const small = inputClass.replace("w-full", "");

export function LyricElements({ piece, busy, suggesting, images, onSuggest, onAdd, onChange, onRemove, onImage, onClearImage, onNext }: Props) {
  const ready = piece.lines.length > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Gráficos que entran con un verso. La app dibuja la forma, o pegás un PNG, un JPG o un SVG (el SVG pasa a PNG, entero,
        sin recortar). La IA propone de 3 a 6; después los acomodás.
      </p>
      {!ready && <Notice tone="warn">Sincronizá la letra primero. Cada elemento se prende cuando empieza su verso.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSuggest} disabled={!ready || busy}>
          {suggesting ? "Pensando…" : "Sugerir con IA"}
        </Button>
        <Button variant="secondary" onClick={onAdd} disabled={!ready || busy || piece.elements.length >= 6}>
          Agregar uno
        </Button>
      </div>
      <ul className="space-y-3">
        {piece.elements.map((el) => {
          const img = el.slot ? images[el.slot] : undefined;
          return (
            <li key={el.id} className="space-y-2 rounded-xl border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                {img ? (
                  <img src={img.src} alt="" className="h-12 w-12 rounded border border-line bg-paper object-contain" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded border border-line bg-paper text-[10px] font-semibold text-muted">
                    {LYRIC_MOTIF_LABEL[el.motif]}
                  </span>
                )}
                <input
                  className={`${small} min-w-0 flex-1 px-2 py-1`}
                  value={el.label}
                  aria-label="Texto del elemento"
                  maxLength={40}
                  onChange={(e) => onChange(el.id, { label: e.target.value })}
                />
                <button type="button" className="text-xs font-semibold text-muted hover:text-neg" disabled={busy} onClick={() => onRemove(el.id)}>
                  Quitar
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  Forma
                  <select
                    className={`${inputClass} mt-1 py-1 text-xs`}
                    value={el.motif}
                    aria-label="Forma"
                    onChange={(e) => onChange(el.id, { motif: e.target.value as LyricElement["motif"] })}
                  >
                    {LYRIC_MOTIFS.map((m) => (
                      <option key={m} value={m}>
                        {LYRIC_MOTIF_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  Movimiento
                  <select
                    className={`${inputClass} mt-1 py-1 text-xs`}
                    value={el.motion}
                    aria-label="Movimiento"
                    onChange={(e) => onChange(el.id, { motion: e.target.value as LyricElement["motion"] })}
                  >
                    {LYRIC_MOTIONS.map((m) => (
                      <option key={m} value={m}>
                        {LYRIC_MOTION_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  Lugar
                  <select
                    className={`${inputClass} mt-1 py-1 text-xs`}
                    value={el.place}
                    aria-label="Lugar"
                    onChange={(e) => onChange(el.id, { place: e.target.value as LyricElement["place"] })}
                  >
                    {LYRIC_PLACES.map((m) => (
                      <option key={m} value={m}>
                        {LYRIC_PLACE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  Verso
                  <select
                    className={`${inputClass} mt-1 py-1 text-xs`}
                    value={String(el.line)}
                    aria-label="Verso"
                    onChange={(e) => onChange(el.id, { line: Number(e.target.value) })}
                  >
                    {piece.lines.map((l, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {l.text.slice(0, 42)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  Segundos
                  <input
                    type="number"
                    min={0.4}
                    max={8}
                    step={0.1}
                    className={`${inputClass} mt-1 py-1 text-xs`}
                    aria-label="Segundos"
                    value={el.seconds}
                    onChange={(e) => onChange(el.id, { seconds: Math.min(8, Math.max(0.4, Number(e.target.value) || 0.4)) })}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Imagen (PNG, JPG o SVG)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                    className="mt-1 block w-full text-xs"
                    aria-label="Imagen del elemento"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImage(el.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {img && (
                <button type="button" className="text-xs font-semibold text-muted hover:text-ink" disabled={busy} onClick={() => onClearImage(el.id)}>
                  Volver al dibujo
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {ready && (
        <Button onClick={onNext} disabled={busy}>
          Seguir → estilo y video
        </Button>
      )}
    </div>
  );
}
