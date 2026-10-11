// "Videos de la app funcionando" in Editar serie: a real screen can also carry a screen recording of the app working
// (MP4, WebM or MOV that this browser plays, up to 200 MB). The explainers play a stretch of it inside the phone or the
// laptop, muted; the stories can take it as a shot's clip in Producción.
import { useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import { SCREEN_VIDEO_ACCEPT, SCREEN_VIDEO_MAX_BYTES } from "../../shared/screenVideo.ts";
import type { CastMember } from "../../shared/series.ts";
import { api, libraryFileUrl } from "../lib/api.ts";
import { probeScreenVideo } from "../lib/videoProbe.ts";

export const secondsText = (s: number) => `${(Math.round(s * 10) / 10).toLocaleString("es-AR")} s`;

export function ScreenVideoBox({
  seriesId,
  member,
  beforeUpload,
  onSaved,
}: {
  seriesId: string;
  member: CastMember;
  // The member is saved first, so the server knows it.
  beforeUpload: () => Promise<void>;
  onSaved: (member: CastMember, series: SeriesInfo[]) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const video = member.video;

  async function upload(file: File) {
    setError("");
    try {
      setBusy("Abriendo el video…");
      const probed = await probeScreenVideo(file);
      setBusy("Subiendo el video…");
      await beforeUpload();
      let saved = await api.uploadScreenVideo(seriesId, member.id, file, { seconds: probed.seconds, width: probed.width, height: probed.height, name: file.name });
      if (probed.poster) saved = await api.uploadScreenVideoPoster(seriesId, member.id, probed.poster);
      onSaved(saved.member, saved.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    setError("");
    setBusy("Sacando el video…");
    try {
      const saved = await api.removeScreenVideo(seriesId, member.id);
      onSaved(saved.member, saved.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <details className="text-xs" open={video ? true : undefined}>
      <summary className="cursor-pointer font-semibold text-muted">Video de la app funcionando {video ? `(${secondsText(video.seconds)})` : "(opcional)"}</summary>
      <div className="mt-1.5 space-y-2">
        <p className="text-muted">
          Una grabación de pantalla de la app de verdad (MP4, WebM o MOV que este navegador reproduzca, hasta {SCREEN_VIDEO_MAX_BYTES / 1024 / 1024} MB). En los
          explicativos, las escenas que muestran esta pantalla pueden reproducir un tramo adentro del celular o la compu, sin sonido. En
          las historias se puede usar como clip de una toma.
        </p>
        {video && (
          <div className="flex flex-wrap items-start gap-3">
            <video
              src={libraryFileUrl(seriesId, video.file)}
              poster={video.poster ? libraryFileUrl(seriesId, video.poster) : undefined}
              controls
              muted
              playsInline
              preload="metadata"
              className="max-h-48 rounded-md border border-line bg-black"
            />
            <p className="text-muted">
              {video.name || video.file} · {secondsText(video.seconds)} · {video.width}×{video.height}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex items-center gap-2 ${busy ? "opacity-50" : ""}`}>
            <span className="rounded-lg border border-line bg-white px-2.5 py-1 font-semibold hover:border-ink">{busy || (video ? "Cambiar el video" : "Subir video")}</span>
            <input
              type="file"
              accept={SCREEN_VIDEO_ACCEPT}
              disabled={Boolean(busy)}
              className="hidden"
              aria-label={`Subir video de ${member.name}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {video && !busy && (
            <button type="button" onClick={() => void remove()} className="font-semibold text-muted hover:text-neg">
              Sacar el video
            </button>
          )}
        </div>
        {error && <p className="text-neg">{error}</p>}
      </div>
    </details>
  );
}
