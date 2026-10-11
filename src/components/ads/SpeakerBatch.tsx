// "Que lo digan los personajes": the "Que lo diga un personaje" prompts of the approved pieces one after another, to
// paste in Grok one by one. Each piece keeps its own character when it has one; the rest take the one chosen here.
import { useMemo, useState } from "react";
import type { Piece } from "../../../shared/ads.ts";
import { speakerBatch, speakerBatchText, speakerCandidates } from "../../../shared/adsSpeaker.ts";
import type { SeriesInfo } from "../../../shared/schema.ts";
import { CopyButton } from "../ScriptView.tsx";
import { Button, inputClass } from "../ui.tsx";

type Props = {
  pieces: Piece[];
  series: SeriesInfo;
  format: "vertical" | "horizontal";
  label: string;
};

export function SpeakerBatch({ pieces, series, format, label }: Props) {
  const candidates = useMemo(() => speakerCandidates(series.cast), [series.cast]);
  const approved = pieces.filter((p) => p.status === "approved");
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState(candidates[0]?.id ?? "");
  const [count, setCount] = useState<number | null>(null);
  const n = Math.max(1, Math.min(count ?? approved.length, approved.length || 1));
  const batch = useMemo(
    () =>
      speakerBatch({
        pieces,
        cast: series.cast,
        fallback,
        count: n,
        format,
        look: series.look,
        type: series.type,
      }),
    [pieces, series.cast, series.look, series.type, fallback, n, format],
  );
  const text = speakerBatchText(batch.entries);

  if (!approved.length) return null;
  if (!open) {
    return (
      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpen(true)}>
        Que lo digan los personajes (lote)
      </Button>
    );
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `personajes-${label}-${series.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-paper p-3 text-xs">
      <div className="flex items-center gap-2">
        <p className="font-semibold">Que lo digan los personajes: los prompts para Grok, uno detrás del otro</p>
        <button type="button" className="ml-auto text-muted underline" onClick={() => setOpen(false)}>
          cerrar
        </button>
      </div>
      {!candidates.length ? (
        <p className="text-touch">La serie no tiene personajes con imagen aprobada. Sumalos en Editar serie y volvé.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="font-semibold">Personaje para los que no tienen</span>
              <select className={inputClass} value={fallback} onChange={(e) => setFallback(e.target.value)}>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (@{m.ref})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="font-semibold">Cuántos</span>{" "}
              <input
                type="number"
                min={1}
                max={approved.length}
                className="w-20 rounded-lg border border-line px-2 py-1"
                value={n}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
              />
              <span className="text-muted"> de {approved.length} aprobados</span>
            </label>
          </div>
          <p className="text-muted">
            Solo personajes inventados y adultos; el video lleva el aviso de personaje hecho con IA. Para cada uno: adjuntá su @referencia en Grok, pegá su
            prompt, elegí el largo que dice y subí el clip a su pieza.
          </p>
          {batch.entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CopyButton text={text} idle={`Copiar los ${batch.entries.length} prompts`} />
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={download}>
                Descargar .txt
              </Button>
            </div>
          )}
          {batch.skipped.length > 0 && <p className="text-touch">Quedan afuera: {batch.skipped.map((s) => `${s.id} (${s.why})`).join(" · ")}</p>}
          {batch.entries.length > 0 && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-muted">{text}</pre>
          )}
        </>
      )}
    </div>
  );
}
