// The explainer studio's way out: the quality review, the in-browser renders, the subtitles and the final render
// (render.mjs through the server), with what each one produced.
import type { MotionPiece, MotionScene, MotionScript } from "../../shared/motion.ts";
import type { QualityState } from "../../shared/motionQuality.ts";
import { projectFileUrl, type FinalJob } from "../lib/api.ts";
import { download, slug } from "../lib/markdown.ts";
import type { SheetFormat } from "../lib/motionQuality.ts";
import type { RenderResult } from "../lib/render.ts";
import { type SubtitleCue, toSrt } from "../../shared/subtitles.ts";
import { QualityPanel } from "./QualityPanel.tsx";
import { Button, Spinner } from "./ui.tsx";

type Props = {
  piece: MotionPiece;
  set: (patch: Partial<MotionPiece>) => void;
  script: MotionScript;
  quality: QualityState | null;
  keyNow: string;
  reviewing: string;
  sheets: { format: string; url: string }[];
  busy: string | null;
  setBusy: (busy: "review" | "final" | null) => void;
  runQuality: (formats: SheetFormat[]) => Promise<unknown>;
  render: (formats: ("vertical" | "horizontal")[]) => Promise<void>;
  finalRender: (formats: SheetFormat[]) => Promise<void>;
  blocked: boolean;
  subtitles: SubtitleCue[];
  srtName: (format: "vertical" | "horizontal") => string;
  voiced: MotionScene[];
  heardCount: number;
  heardNote: string;
  ffmpeg: boolean;
  projectId: string | null;
  projectsDir: string;
  finalJob: FinalJob | null;
  progress: number | null;
  results: (RenderResult & { url: string; format: "vertical" | "horizontal"; saved: string; srt: string })[];
  vertical: boolean;
};

export function MotionOutputs({ piece, set, script, quality, keyNow, reviewing, sheets, busy, setBusy, runQuality, render, finalRender, blocked, subtitles, srtName, voiced, heardCount, heardNote, ffmpeg, projectId, projectsDir, finalJob, progress, results, vertical }: Props) {
  return (
    <>
      <QualityPanel
        quality={quality}
        current={Boolean(quality && quality.key === keyNow)}
        running={reviewing}
        sheets={sheets}
        disabled={busy !== null || Boolean(reviewing)}
        onRun={async () => {
          setBusy("review");
          await runQuality(quality?.key === keyNow && quality.formats.length > 1 ? quality.formats : [piece.format]);
          setBusy(null);
        }}
        onAccept={() => quality && set({ quality: { ...quality, accepted: true } })}
      />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => render([piece.format])} disabled={busy !== null || Boolean(reviewing) || blocked}>
          {busy === "render" ? (
            <>
              <Spinner /> Generando…
            </>
          ) : (
            `Generar ${vertical ? "9:16" : "16:9"}`
          )}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => render(["vertical", "horizontal"])} disabled={busy !== null || Boolean(reviewing) || blocked}>
          Los dos formatos
        </Button>
      </div>
      <p className="text-xs text-muted">Generar arma el video en el navegador. El render final lo hace ffmpeg en tu compu: H.264, CRF 16, la mejor calidad.</p>
      {subtitles.length > 0 && (
        <div className="space-y-1">
          <Button variant="secondary" className="w-full" onClick={() => download(new Blob([toSrt(subtitles)], { type: "application/x-subrip" }), srtName(piece.format))}>
            Descargar subtítulos .srt
          </Button>
          <p className="text-xs text-muted">
            Los mismos tiempos que el video{voiced.length ? ` · ${heardCount ? `${heardCount} de ${voiced.length} escenas con las palabras escuchadas en la voz` : "tiempos estimados por el largo de la voz"}` : ""}.
          </p>
          {heardNote && <p className="text-xs text-muted">{heardNote}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            setBusy("final");
            await finalRender([piece.format]);
            setBusy(null);
          }}
          disabled={!ffmpeg || !projectId || busy !== null || Boolean(reviewing) || blocked}
        >
          {busy === "final" ? (
            <>
              <Spinner /> Render final…
            </>
          ) : (
            `Render final ${vertical ? "9:16" : "16:9"}`
          )}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            setBusy("final");
            await finalRender(["vertical", "horizontal"]);
            setBusy(null);
          }}
          disabled={!ffmpeg || !projectId || busy !== null || Boolean(reviewing) || blocked}
        >
          Render final de los dos
        </Button>
      </div>
      {!ffmpeg && <p className="text-xs text-neg">Para el render final hace falta ffmpeg. En la Mac: <code>brew install ffmpeg</code>, o volvé a correr <code>bash iniciar.sh</code>.</p>}
      {finalJob && (
        <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-xs">
          {!finalJob.done ? (
            <>
              <p>
                Render final ({finalJob.current === "vertical" ? "9:16" : "16:9"}): {Math.round(finalJob.progress * 100)}%. Cada cuadro sale de <code>seek(t)</code> y va sin pérdida a ffmpeg.
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-good transition-all" style={{ width: `${finalJob.progress * 100}%` }} />
              </div>
            </>
          ) : finalJob.error ? (
            <p className="text-neg">El render final no terminó.</p>
          ) : (
            finalJob.files.map((file) => (
              <div key={file} className="space-y-1">
                <video
                  src={`${projectFileUrl(finalJob.project, file)}?v=${finalJob.id}`}
                  controls
                  playsInline
                  className={`mx-auto w-full rounded-lg bg-black ${file.includes("vertical") ? "max-h-[70vh] w-auto" : ""}`}
                />
                <p className="text-good">
                  Render final (H.264, CRF 16): {projectsDir}/{finalJob.project}/{file}
                </p>
                {finalJob.subtitles?.includes(file.replace(/\.mp4$/, ".srt")) && (
                  <a className="text-accent underline" href={projectFileUrl(finalJob.project, file.replace(/\.mp4$/, ".srt"))} download>
                    Subtítulos: {file.replace(/\.mp4$/, ".srt")}
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {results.map((r) => (
        <div key={r.format} className="space-y-2">
          <video src={r.url} controls playsInline className={`mx-auto w-full rounded-lg bg-black ${r.format === "vertical" ? "max-h-[70vh] w-auto" : ""}`} />
          <Button variant="secondary" className="w-full" onClick={() => download(r.blob, `${slug(script.title) || "explicativo"}-${r.format === "vertical" ? "9x16" : "16x9"}.${r.extension}`)}>
            Descargar {r.format === "vertical" ? "9:16" : "16:9"} .{r.extension}
          </Button>
          {r.srt && (
            <Button variant="secondary" className="w-full" onClick={() => download(new Blob([r.srt], { type: "application/x-subrip" }), srtName(r.format))}>
              Descargar subtítulos .srt
            </Button>
          )}
          {r.saved && <p className="text-xs text-good">Guardado en el proyecto: {r.saved}{r.srt ? " (con su .srt al lado)" : ""}</p>}
          {r.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}
        </div>
      ))}
    </>
  );
}
