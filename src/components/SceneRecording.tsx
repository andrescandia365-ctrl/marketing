// "Videos de la app funcionando" in a scene of the explainer studio: when the scene shows a real screen that has a
// recording (hook, screen, zoom, callouts, or what a character presents), it can play a stretch of it inside the device,
// muted: from, to, speed, and what happens when the stretch ends before the scene (hold the last frame or loop).
import { elementTimes, SCENE_SECONDS, type MotionScene } from "../../shared/motion.ts";
import { CLIP_RATES, clipRange, clipSeconds, videoAssetOf, type ScreenClip } from "../../shared/screenVideo.ts";
import type { CastMember } from "../../shared/series.ts";
import { secondsText } from "./ScreenVideoBox.tsx";
import { Button, inputClass } from "./ui.tsx";

const smallInput = inputClass.replace("w-full", "");

export function SceneRecording({ scene, cast, update }: { scene: MotionScene; cast: CastMember[]; update: (patch: Partial<MotionScene>) => void }) {
  const v = videoAssetOf(scene);
  const member = v ? cast.find((m) => m.id === v.id && m.kind === "screen") : undefined;
  const video = member?.video;
  if (!v || !video) return null;
  const clip = scene.recording;
  const set = (patch: Partial<ScreenClip>) => update({ recording: { ...(clip ?? { from: 0, rate: 1 }), ...patch } });
  const range = clip ? clipRange(clip, video.seconds) : null;
  const plays = clip ? clipSeconds(clip, video.seconds) : 0;
  const startAt = elementTimes(scene)[v.key] ?? 0;
  const room = scene.seconds - startAt;
  const fit = Math.min(SCENE_SECONDS.max, Math.max(SCENE_SECONDS.min, Math.ceil((startAt + plays) * 2) / 2));
  return (
    <div className="space-y-1 rounded-lg border border-line bg-paper p-2 text-[11px]">
      <label className="flex items-center gap-1.5 font-semibold">
        <input type="checkbox" checked={Boolean(clip)} onChange={(e) => update({ recording: e.target.checked ? { from: 0, rate: 1 } : undefined })} />
        Reproducir el video de la app ({secondsText(video.seconds)})
      </label>
      {clip && range && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-muted">
            <label>
              Desde{" "}
              <input
                type="number"
                min={0}
                max={video.seconds}
                step={0.1}
                className={`${smallInput} w-16 py-0.5 text-xs`}
                value={Math.round(range.from * 10) / 10}
                aria-label="Desde (segundos del video)"
                onChange={(e) => set({ from: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label>
              hasta{" "}
              <input
                type="number"
                min={0}
                max={video.seconds}
                step={0.1}
                className={`${smallInput} w-16 py-0.5 text-xs`}
                value={clip.to === undefined ? "" : Math.round(range.to * 10) / 10}
                placeholder="fin"
                aria-label="Hasta (segundos del video; vacío: hasta el final)"
                onChange={(e) => set({ to: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </label>
            <select className={`${smallInput} py-0.5 text-xs`} value={clip.rate} aria-label="Velocidad" onChange={(e) => set({ rate: Number(e.target.value) })}>
              {[...new Set([...CLIP_RATES, clip.rate])].sort((a, b) => a - b).map((r) => (
                <option key={r} value={r}>
                  {r === 1 ? "velocidad real" : `×${String(r).replace(".", ",")}`}
                </option>
              ))}
            </select>
            <select
              className={`${smallInput} py-0.5 text-xs`}
              value={clip.end ?? "hold"}
              aria-label="Al terminar el tramo"
              onChange={(e) => set({ end: e.target.value === "loop" ? "loop" : undefined })}
            >
              <option value="hold">al terminar: queda el último cuadro</option>
              <option value="loop">al terminar: vuelve a empezar</option>
            </select>
          </div>
          <p className="text-muted">
            Arranca cuando entra la pantalla ({secondsText(startAt)}) y el tramo dura {secondsText(plays)}
            {plays > room + 0.05
              ? `: la escena termina antes (le quedan ${secondsText(Math.max(0, room))}), así que se ve solo una parte.`
              : plays < room - 0.05
                ? `: sobran ${secondsText(room - plays)} de escena, ${clip.end === "loop" ? "y vuelve a empezar" : "con el último cuadro quieto"}.`
                : "."}{" "}
            Sin sonido: lo que suena es la mezcla de la pieza.
          </p>
          {Math.abs(fit - scene.seconds) >= 0.5 && plays > 0 && (
            <Button variant="secondary" className="px-2 py-0.5 text-[11px]" onClick={() => update({ seconds: fit })}>
              Ajustar la escena al tramo ({secondsText(fit)})
            </Button>
          )}
        </>
      )}
    </div>
  );
}
