// The quality loop as the person sees it: each round's six scores, what the AI fixed, the contact sheet it looked at,
// and what is left when the rounds run out.
import { CRITERIA, CRITERION_LABEL, MAX_ROUNDS, PASS, type QualityState } from "../../shared/motionQuality.ts";
import { Button, Spinner } from "./ui.tsx";

type Props = {
  quality: QualityState | null;
  // The review matches the piece as it is now (no edit since).
  current: boolean;
  running: string;
  sheets: { format: string; url: string }[];
  disabled: boolean;
  onRun: () => void;
  onAccept: () => void;
};

export function QualityPanel({ quality, current, running, sheets, disabled, onRun, onAccept }: Props) {
  const last = quality?.rounds.at(-1);
  const tone = running ? "border-line bg-white" : !quality || !current ? "border-line bg-white" : quality.passed ? "border-good/30 bg-good-soft" : "border-neg/40 bg-neg-soft";
  return (
    <div className={`space-y-2 rounded-xl border p-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Control de calidad (IA)</p>
        <Button variant="secondary" className="ml-auto px-2 py-1 text-xs" disabled={disabled} onClick={onRun}>
          {running ? (
            <>
              <Spinner /> Revisando…
            </>
          ) : quality && current ? (
            "Otra vuelta"
          ) : (
            "Revisar ahora"
          )}
        </Button>
      </div>
      {running ? (
        <p className="text-xs text-muted">{running}</p>
      ) : !quality ? (
        <p className="text-xs text-muted">
          Antes de generar, la IA mira una hoja de contactos (un cuadro por beat) y pone notas del 1 al 10. Arregla lo peor y repite hasta {PASS} o más, en {MAX_ROUNDS} rondas como máximo.
        </p>
      ) : !current ? (
        <p className="text-xs text-muted">Cambiaste la pieza después de la última revisión: se revisa de nuevo al generar.</p>
      ) : quality.passed ? (
        <p className="text-xs font-semibold text-good">
          ✓ Todo en {PASS} o más ({quality.rounds.length} {quality.rounds.length === 1 ? "ronda" : "rondas"}).
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-neg">
            Quedaron notas por debajo de {PASS} después de {quality.rounds.length} {quality.rounds.length === 1 ? "ronda" : "rondas"}.
            {quality.accepted ? " Elegiste generar igual." : " Arreglalo a mano y revisá otra vez, o generá igual."}
          </p>
          {!quality.accepted && (
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onAccept}>
              Generar igual
            </Button>
          )}
        </div>
      )}
      {last && (
        <table className="w-full text-xs">
          <tbody>
            {CRITERIA.map((c) => {
              const s = last.scores[c];
              return (
                <tr key={c} className="align-top">
                  <td className="py-0.5 pr-2 whitespace-nowrap">{CRITERION_LABEL[c]}</td>
                  <td className={`py-0.5 pr-2 font-mono font-semibold ${s.score >= PASS ? "text-good" : "text-neg"}`}>{s.score}</td>
                  <td className="py-0.5 text-muted">{s.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {quality && quality.rounds.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Las rondas</summary>
          <ol className="mt-1 space-y-1.5">
            {quality.rounds.map((r) => (
              <li key={r.round}>
                <b>Ronda {r.round}</b>
                {r.demo && <span className="text-muted"> (muestra)</span>}: {CRITERIA.map((c) => r.scores[c].score).join(" · ")}. {r.summary}
                {r.applied.map((a) => (
                  <span key={a} className="block text-good">
                    Arreglado: {a}
                  </span>
                ))}
                {r.pending.map((a) => (
                  <span key={a} className="block text-neg">
                    Queda: {a}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </details>
      )}
      {sheets.map((s) => (
        <details key={s.format} className="text-xs">
          <summary className="cursor-pointer text-muted">Hoja de contactos {s.format === "vertical" ? "9:16" : "16:9"}</summary>
          <a href={s.url} target="_blank" rel="noreferrer">
            <img src={s.url} alt={`Hoja de contactos ${s.format === "vertical" ? "9:16" : "16:9"}`} className="mt-1 w-full rounded border border-line" />
          </a>
        </details>
      ))}
    </div>
  );
}
