// The explainer studio's checks under the preview (Se lee, Cifras con fuente, Lo que existe hoy, Algo nuevo cada 2 a 4 s)
// and the poster. Each open problem blocks the render until it is fixed or dismissed.
import {
  conceptIssues,
  conceptKey,
  figureIssues,
  figureKey,
  readingIssues,
  readingKey,
  quietGaps,
  timeScenes,
  type MotionPiece,
  type MotionScene,
} from "../../shared/motion.ts";
import type { Selection } from "./MotionTimeline.tsx";
import type { CodeIssue } from "../lib/codeSandbox.ts";
import { Button } from "./ui.tsx";

type Props = {
  scenes: MotionScene[];
  piece: MotionPiece;
  set: (patch: Partial<MotionPiece>) => void;
  seek: (t: number) => void;
  setSelected: (selection: Selection | null) => void;
  updateScene: (id: string, patch: Partial<MotionScene>) => void;
  openReading: ReturnType<typeof readingIssues>;
  openFigures: ReturnType<typeof figureIssues>;
  openConcepts: ReturnType<typeof conceptIssues>;
  openGaps: ReturnType<typeof quietGaps>;
  gapKey: (g: { from: number; to: number }) => string;
  posterRef: React.RefObject<HTMLCanvasElement | null>;
  posterT: number;
  timeRef: React.RefObject<number>;
  vertical: boolean;
  // "Escena de código": scenes with no code, a failed test or text out of the safe zone (they block the render).
  openCode?: CodeIssue[];
};

export function MotionChecks({ scenes, piece, set, seek, setSelected, updateScene, openReading, openFigures, openConcepts, openGaps, gapKey, posterRef, posterT, timeRef, vertical, openCode = [] }: Props) {
  return (
    <>
      {openCode.length > 0 && (
        <div className={`rounded-xl border p-3 text-sm ${openCode.every((c) => c.stale) ? "border-line bg-white" : "border-neg/40 bg-neg-soft"}`}>
          <p className={`font-semibold ${openCode.every((c) => c.stale) ? "text-muted" : "text-neg"}`}>Escenas de código: no se puede generar hasta que estén listas.</p>
          <ul className="mt-1 space-y-1">
            {openCode.map((c, k) => (
              <li key={`${c.sceneId}-${k}`}>
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => {
                    const at = timeScenes(scenes).find((x) => x.id === c.sceneId);
                    if (at) seek(at.start + 0.5);
                    setSelected({ sceneId: c.sceneId, key: null });
                  }}
                >
                  {c.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`rounded-xl border p-3 text-sm ${openReading.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
        {openReading.length ? (
          <>
            <p className="font-semibold text-neg">Se lee: {openReading.length} texto(s) no llegan a leerse. No se puede generar hasta arreglarlo.</p>
            <ul className="mt-1 space-y-1">
              {openReading.map((r) => (
                <li key={readingKey(r)} className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => {
                      const at = timeScenes(scenes).find((x) => x.id === r.sceneId);
                      if (at) seek(at.end - 0.1);
                      setSelected({ sceneId: r.sceneId, key: r.key === "voice" || r.key.startsWith("code:") ? null : r.key });
                    }}
                  >
                    Escena {r.index + 1} · {r.label} (“{r.text.length > 40 ? `${r.text.slice(0, 40)}…` : r.text}”): queda quieto {r.has.toFixed(1)} s y necesita {r.needs.toFixed(1)} s. Hacelo entrar antes, acortalo o alargá la escena.
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted hover:text-ink"
                    onClick={() => set({ readingOk: [...(piece.readingOk ?? []), readingKey(r)] })}
                  >
                    No es un problema
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="font-semibold text-good">✓ Cada texto se queda lo suficiente para leerlo.</p>
        )}
      </div>

      <div className={`rounded-xl border p-3 text-sm ${openFigures.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
        {openFigures.length ? (
          <>
            <p className="font-semibold text-neg">
              Cifras con fuente: {openFigures.length} sin fuente o con [VERIFY]. No se puede generar hasta arreglarlo.
            </p>
            <ul className="mt-1 space-y-1">
              {openFigures.map((i) => (
                <li key={figureKey(i)} className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => {
                      const at = timeScenes(scenes).find((x) => x.id === i.sceneId);
                      if (at) seek(at.end - 0.1);
                      setSelected({ sceneId: i.sceneId, key: i.key === "voice" ? null : i.key });
                    }}
                  >
                    {i.verify
                      ? `Escena ${i.index + 1} · ${i.label} lleva [VERIFY]: confirmalo y sacá la marca, o cambiá el texto.`
                      : `Escena ${i.index + 1} · ${i.label}: “${i.figure}” no está en la serie («Lo que existe hoy», «Cómo se trabaja hoy») ni en el brief. Sumalo a la serie si es real, o cambialo.`}
                  </button>
                  {!i.verify && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted hover:text-ink"
                      title="Es real, o es claramente un ejemplo (una hora, un paso)"
                      onClick={() => set({ figuresOk: [...(piece.figuresOk ?? []), figureKey(i)] })}
                    >
                      Lo confirmo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="font-semibold text-good">✓ Cada número tiene fuente.</p>
        )}
      </div>

      {openConcepts.length > 0 && (
        <div className="rounded-xl border border-neg/40 bg-neg-soft p-3 text-sm">
          <p className="font-semibold text-neg">
            Lo que existe hoy: {openConcepts.length} escena(s) muestran algo que no está en la serie y se ven como reales. No se puede generar hasta
            arreglarlo.
          </p>
          <ul className="mt-1 space-y-1">
            {openConcepts.map((i) => (
              <li key={conceptKey(i)} className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => {
                    const at = timeScenes(scenes).find((x) => x.id === i.sceneId);
                    if (at) seek(at.start + Math.min(1, at.seconds / 2));
                    setSelected({ sceneId: i.sceneId, key: null });
                  }}
                >
                  Escena {i.index + 1}: “{i.what}” no está en «Lo que existe hoy» (lo marcó {i.by === "ia" ? "la IA al escribir" : "la revisión"}). Marcala como
                  concepto o simulación, o cambiá la escena.
                </button>
                <span className="flex gap-2">
                  <button type="button" className="text-xs font-semibold text-ink hover:underline" onClick={() => updateScene(i.sceneId, { disclosure: "concept" })}>
                    Concepto
                  </button>
                  <button type="button" className="text-xs font-semibold text-ink hover:underline" onClick={() => updateScene(i.sceneId, { disclosure: "simulation" })}>
                    Simulación
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted hover:text-ink"
                    title="Existe hoy: sumalo también a «Lo que existe hoy» de la serie"
                    onClick={() => set({ conceptsOk: [...(piece.conceptsOk ?? []), conceptKey(i)] })}
                  >
                    Lo confirmo
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
        <canvas
          ref={posterRef}
          width={vertical ? 108 : 192}
          height={vertical ? 192 : 108}
          aria-label="Portada"
          className="rounded border border-line"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-semibold">Portada (el primer cuadro del video)</p>
          <p className="text-xs text-muted">
            X, Slack y Discord muestran el primer cuadro como miniatura. Ahora: {posterT.toFixed(1)} s ·{" "}
            {piece.poster?.by === "vos" ? "la elegiste vos" : piece.poster?.by === "ia" ? "la eligió la IA" : "automática (el gancho entero)"}
            {piece.poster && Math.abs(posterT - piece.poster.t) > 0.01 ? " (se corrió para no caer en un corte)" : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => set({ poster: { t: Math.round(timeRef.current * 100) / 100, by: "vos" } })}>
              Usar el cuadro de ahora
            </Button>
            {piece.poster && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => set({ poster: null })}>
                Automática
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={`rounded-xl border p-3 text-sm ${openGaps.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
        {openGaps.length ? (
          <>
            <p className="font-semibold text-neg">Algo nuevo cada 2 a 4 s: {openGaps.length} tramo(s) quieto(s). No se puede generar hasta arreglarlo.</p>
            <ul className="mt-1 space-y-1">
              {openGaps.map((g) => (
                <li key={gapKey(g)} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Entre {g.from.toFixed(1)} y {g.to.toFixed(1)} s no aparece nada nuevo. Partí la escena, sumá un elemento o acortala.
                  </span>
                  <button type="button" className="text-xs font-semibold text-muted hover:text-ink" onClick={() => set({ dismissed: [...piece.dismissed, gapKey(g)] })}>
                    No es un problema
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="font-semibold text-good">✓ Algo nuevo cada 2 a 4 s.</p>
        )}
      </div>
    </>
  );
}
