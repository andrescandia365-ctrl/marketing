// "Sin clave": one quality-review round by hand with claude.ai. The app builds the contact sheet and what it measured,
// the person downloads the sheet, attaches it in claude.ai with the copied prompt, and pastes the reply back: the same
// parser and the same fixes (takeReview) as when a writer is connected.
import { MAX_ROUNDS, sheetFileName } from "../../shared/motionQuality.ts";
import { download } from "../lib/markdown.ts";
import type { ManualRound, SheetFormat } from "../lib/motionQuality.ts";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";
import { Button, Spinner } from "./ui.tsx";

type Props = {
  manual: ManualRound | null;
  // The piece changed after the sheet was built: its reply would not match.
  stale: boolean;
  format: SheetFormat;
  preparing: boolean;
  disabled: boolean;
  onPrepare: (formats: SheetFormat[]) => void;
  via: Handoff | null;
};

const label = (f: SheetFormat) => (f === "vertical" ? "9:16" : "16:9");

export function ReviewHandoff({ manual, stale, format, preparing, disabled, onPrepare, via }: Props) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-line bg-white p-3 text-sm" aria-label="Revisión con claude.ai">
      <p className="font-semibold">Revisión con claude.ai (sin clave)</p>
      <p className="text-xs text-muted">
        La app arma la hoja de cuadros y lo que midió. Descargá la hoja, copiá el prompt y mandá las dos cosas juntas en un mensaje de claude.ai (la
        imagen adjunta). Pegá acá la respuesta: los arreglos se aplican como con la IA conectada.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={disabled || preparing} onClick={() => onPrepare([format])}>
          {preparing ? <Spinner /> : null}
          {manual && !stale ? "Armar la hoja de nuevo" : `Armar la hoja de cuadros ${label(format)}`}
        </Button>
        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={disabled || preparing} onClick={() => onPrepare(["vertical", "horizontal"])}>
          Las dos hojas
        </Button>
      </div>
      {manual && (
        <div className="space-y-2">
          {stale ? (
            <p className="text-xs text-neg">Cambiaste el explicativo después de armar la hoja: armala de nuevo antes de copiar el prompt.</p>
          ) : (
            <>
              <p className="text-xs">
                Ronda {manual.round} de {MAX_ROUNDS}
                {manual.earlier.length ? ` (sigue a ${manual.round - 1} ${manual.round - 1 === 1 ? "ronda" : "rondas"} de esta pieza)` : ""}.
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-xs">
                <li>
                  <div className="flex flex-wrap gap-2">
                    {manual.sheets.map((s) =>
                      s.blob ? (
                        <Button key={s.format} variant="secondary" className="px-2 py-1 text-xs" onClick={() => download(s.blob!, sheetFileName(s.format))}>
                          Descargar la hoja de cuadros {label(s.format)}
                        </Button>
                      ) : (
                        <span key={s.format} className="text-neg">
                          No se pudo armar la hoja {label(s.format)}.
                        </span>
                      ),
                    )}
                  </div>
                </li>
                <li>Copiá el prompt (abajo) y pegalo en un chat nuevo de claude.ai.</li>
                <li>Adjuntá {manual.sheets.length > 1 ? "las hojas" : "la hoja"} ({manual.sheets.map((s) => sheetFileName(s.format)).join(", ")}) en el mismo mensaje y mandalo.</li>
                <li>Pegá la respuesta entera abajo.</li>
              </ol>
              {via && <ClaudeHandoff title={`Ronda ${manual.round}`} what="la revisión de calidad" disabled={disabled} via={via} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
