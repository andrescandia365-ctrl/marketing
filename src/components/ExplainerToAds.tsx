// "Usar en Publicidad": the explainer's saved render (the final render if there is one, else the browser's) becomes
// the clip of a meat or a CTA of the same series, copied on the server (shared/adsFromExplainer.ts). No AI involved:
// it works the same with no key.
import { useEffect, useMemo, useRef, useState } from "react";
import { AD_SECONDS, type AdSeconds, type AdsState } from "../../shared/ads.ts";
import {
  EXPLAINER_KIND_LABEL,
  explainerTargets,
  fitClip,
  pickExplainerVideo,
  pieceSecondsFor,
  voiceInRange,
  type ExplainerKind,
  type ExplainerVideo,
  type VoicedSpan,
} from "../../shared/adsFromExplainer.ts";
import { ads as adsApi, projectFileUrl } from "../lib/api.ts";
import { Button, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

type Props = {
  series: string;
  projectId: string | null;
  format: "vertical" | "horizontal";
  // The scenes as they play, for the words said in the chosen stretch.
  spans: VoicedSpan[];
  // Changes when a new render is saved, so the list is read again.
  version: string;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const s1 = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")} s`;
const videoLabel = (v: ExplainerVideo) =>
  `${v.final ? "Render final" : "Generado en el navegador"} ${v.format === "vertical" ? "9:16" : "16:9"}${v.file.endsWith(".webm") ? " (.webm)" : ""}`;

export function ExplainerToAds({ series, projectId, format, spans, version }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AdsState | null>(null);
  const [videos, setVideos] = useState<ExplainerVideo[] | null>(null);
  const [file, setFile] = useState("");
  const [duration, setDuration] = useState(0);
  const [kind, setKind] = useState<ExplainerKind>("meat");
  const [target, setTarget] = useState<string>("new");
  const [adSeconds, setAdSeconds] = useState<AdSeconds>(15);
  const [start, setStart] = useState(0);
  const [text, setText] = useState("");
  const [textTouched, setTextTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancel = false;
    setError("");
    Promise.all([adsApi.load(series), adsApi.explainerVideos(series, projectId)])
      .then(([view, list]) => {
        if (cancel) return;
        setState(view.state);
        setVideos(list.videos);
        setFile((f) => (list.videos.some((v) => v.file === f) ? f : (pickExplainerVideo(list.videos, format)?.file ?? "")));
      })
      .catch((e) => !cancel && setError(message(e)));
    return () => {
      cancel = true;
    };
  }, [open, projectId, series, format, version]);

  const targets = useMemo(() => (state ? explainerTargets(state, kind) : []), [state, kind]);
  const chosen = targets.find((t) => t.piece.id === target)?.piece ?? null;
  const pieceSeconds = chosen ? chosen.seconds : pieceSecondsFor(kind, adSeconds);
  const fit = duration ? fitClip(duration, pieceSeconds, start) : null;
  const said = fit ? voiceInRange(spans, fit.start, fit.end) : "";

  // A new piece's text follows the stretch until the person writes their own.
  useEffect(() => {
    if (!textTouched) setText(said);
  }, [said, textTouched]);

  if (!projectId) return null;

  async function use() {
    if (!fit || !file || !projectId) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const r = await adsApi.fromExplainer(series, {
        project: projectId,
        file,
        duration,
        start: fit.start,
        ...(chosen ? { pieceId: chosen.id } : { create: { kind, seconds: pieceSeconds, text } }),
      });
      setState(r.state);
      setTarget(r.pieceId);
      setDone(`Listo: ${r.pieceId} usa este video de ${s1(r.fit.start)} a ${s1(r.fit.end)}. Su render en caché se borró: se arma de nuevo en la próxima tanda o al probar un anuncio en Publicidad.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  function playRange() {
    const v = player.current;
    if (!v || !fit) return;
    v.currentTime = fit.start;
    void v.play();
    const stop = () => {
      if (v.currentTime >= fit.end) {
        v.pause();
        v.removeEventListener("timeupdate", stop);
      }
    };
    v.addEventListener("timeupdate", stop);
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(!open)}>
          {open ? "Cerrar «Usar en Publicidad»" : "Usar en Publicidad"}
        </Button>
      </div>
      {!open && <p className="text-xs text-muted">Pasa el video guardado a un cuerpo (meat) o un llamado (CTA) de esta serie, sin descargarlo ni subirlo.</p>}
      {open && (
        <>
          {error && <Notice tone="error">{error}</Notice>}
          {!videos ? (
            !error && (
              <p className="text-xs text-muted">
                <Spinner /> Buscando los videos del proyecto…
              </p>
            )
          ) : !videos.length ? (
            <p className="text-xs text-muted">Todavía no hay un video guardado. Generalo (en el navegador o con el render final) y volvé acá.</p>
          ) : (
            <>
              {videos.length > 1 && (
                <label className="block text-xs">
                  <span className="font-semibold">Video</span>
                  <select className={inputClass} value={file} onChange={(e) => (setFile(e.target.value), setDuration(0), setStart(0))}>
                    {videos.map((v) => (
                      <option key={v.file} value={v.file}>
                        {videoLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {videos.length === 1 && <p className="text-xs text-muted">Video: {videoLabel(videos[0])}.</p>}
              {file && (
                <video
                  ref={player}
                  key={`${file}-${version}`}
                  src={`${projectFileUrl(projectId, file)}?v=${encodeURIComponent(version)}`}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  className={`mx-auto w-full rounded-lg bg-black ${file.includes("vertical") ? "max-h-[40vh] w-auto" : ""}`}
                />
              )}
              <Segmented<ExplainerKind>
                value={kind}
                onChange={(k) => (setKind(k), setTarget("new"))}
                options={[
                  { value: "meat", label: "Como cuerpo (meat)" },
                  { value: "cta", label: "Como llamado (CTA)" },
                ]}
              />
              <div className="space-y-1">
                {targets.map((t) => (
                  <label key={t.piece.id} className="flex items-start gap-2 text-xs">
                    <input type="radio" name="explainer-target" checked={target === t.piece.id} onChange={() => setTarget(t.piece.id)} />
                    <span>
                      <b className="font-mono">{t.piece.id}</b> · {s1(t.piece.seconds)} · {t.piece.text.slice(0, 90)}
                      {t.piece.text.length > 90 ? "…" : ""}
                      {t.hasClip && <span className="text-touch"> · ya tiene clip{t.fromExplainer ? " de un explicativo" : ""}: se reemplaza</span>}
                    </span>
                  </label>
                ))}
                {!targets.length && <p className="text-xs text-muted">No hay {EXPLAINER_KIND_LABEL[kind]} aprobados en Publicidad. Podés crear uno nuevo con este video.</p>}
                <label className="flex items-center gap-2 text-xs">
                  <input type="radio" name="explainer-target" checked={target === "new"} onChange={() => setTarget("new")} />
                  <span>
                    <b>Uno nuevo</b> para anuncios de{" "}
                    <select className="rounded border border-line bg-white px-1 py-0.5" value={adSeconds} onChange={(e) => setAdSeconds(Number(e.target.value) as AdSeconds)} disabled={target !== "new"}>
                      {AD_SECONDS.map((n) => (
                        <option key={n} value={n}>
                          {n} s
                        </option>
                      ))}
                    </select>{" "}
                    ({s1(pieceSecondsFor(kind, adSeconds))} de {EXPLAINER_KIND_LABEL[kind]})
                  </span>
                </label>
              </div>
              {fit && fit.fit === "cut" && (
                <label className="block text-xs">
                  <span className="font-semibold">Desde qué segundo</span>{" "}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - pieceSeconds)}
                    step={0.1}
                    value={fit.start}
                    onChange={(e) => {
                      setStart(Number(e.target.value));
                      if (player.current) player.current.currentTime = Number(e.target.value);
                    }}
                    className="w-full"
                  />
                </label>
              )}
              {fit && <p className={`text-xs ${fit.fit === "whole" ? "text-good" : "text-muted"}`}>{fit.note}</p>}
              {fit && fit.fit === "cut" && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={playRange}>
                  Ver el tramo
                </Button>
              )}
              {target === "new" && fit && (
                <label className="block text-xs">
                  <span className="font-semibold">Texto de la pieza</span> <span className="text-muted">(lo que dice la voz en ese tramo; se puede cambiar)</span>
                  <textarea
                    className={`${inputClass} min-h-16`}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setTextTouched(true);
                    }}
                  />
                </label>
              )}
              <Button className="w-full" onClick={use} disabled={busy || !fit || !file || (target === "new" && !text.trim())}>
                {busy ? <Spinner /> : chosen ? `Usar en ${chosen.id}` : `Crear ${kind === "meat" ? "el meat" : "el CTA"} con este video`}
              </Button>
              {!duration && file && <p className="text-xs text-muted">Leyendo cuánto dura el video…</p>}
              <p className="text-xs text-muted">El video ya trae sus palabras, subtítulos y aviso: en el anuncio no se dibuja nada encima. Su sonido (voz y música) va tal cual.</p>
              {done && <p className="text-xs text-good">{done}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
