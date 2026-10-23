// "Usar en Publicidad": the explainer's saved render (the final render if there is one, else the browser's) becomes
// the clip of a meat or a CTA of the same series, copied on the server (shared/adsFromExplainer.ts). No AI involved:
// it works the same with no key.
import { useEffect, useMemo, useRef, useState } from "react";
import { AD_MAX_SECONDS, AD_MIN_SECONDS, ADS_SETTINGS_KEY, isAdSeconds, lengthsForKind, noShareNote, parseSavedLength, splitForLength, type AdsState, type SavedLength } from "../../shared/ads.ts";
import {
  EXPLAINER_KIND_LABEL,
  TARGET_KINDS,
  explainerTargets,
  fitClip,
  pickExplainerVideo,
  pieceSecondsFor,
  voiceInRange,
  type TargetKind,
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
  // The piece id written into the brief ("Desde Publicidad (H12, …)"). Applied once, when that piece is an approved
  // target. A later refresh does not move a choice the person already made.
  preferId?: string | null;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const s1 = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")} s`;
const videoLabel = (v: ExplainerVideo) =>
  `${v.final ? "Render final" : "Generado en el navegador"} ${v.format === "vertical" ? "9:16" : "16:9"}${v.file.endsWith(".webm") ? " (.webm)" : ""}`;

export function ExplainerToAds({ series, projectId, format, spans, version, preferId = null }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AdsState | null>(null);
  const [videos, setVideos] = useState<ExplainerVideo[] | null>(null);
  const [file, setFile] = useState("");
  const [duration, setDuration] = useState(0);
  const [kind, setKind] = useState<TargetKind>("meat");
  const [target, setTarget] = useState<string>("new");
  const [adSeconds, setAdSeconds] = useState(15);
  const [typedSeconds, setTypedSeconds] = useState("15");
  const [savedLength, setSavedLength] = useState<SavedLength | null>(null);
  const applied = useRef<string | null>(null);
  const [start, setStart] = useState(0);
  const [text, setText] = useState("");
  const [textTouched, setTextTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      setSavedLength(parseSavedLength(localStorage.getItem(ADS_SETTINGS_KEY)));
    } catch {
      setSavedLength(parseSavedLength(null));
    }
  }, [open]);

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

  useEffect(() => {
    if (!state || !preferId || applied.current === preferId) return;
    applied.current = preferId;
    for (const k of TARGET_KINDS) {
      if (explainerTargets(state, k).some((t) => t.piece.id === preferId)) {
        setKind(k);
        setTarget(preferId);
        return;
      }
    }
  }, [state, preferId]);

  const targets = useMemo(() => (state ? explainerTargets(state, kind) : []), [state, kind]);
  const chosen = targets.find((t) => t.piece.id === target)?.piece ?? null;
  const savedSplit = splitForLength(adSeconds, savedLength);
  const share = pieceSecondsFor(kind, adSeconds, savedSplit);
  const shareNote = noShareNote(kind, adSeconds, savedSplit);
  const lengthChoices = lengthsForKind(kind, adSeconds, savedLength);
  const pieceSeconds = chosen ? chosen.seconds : share;
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
        ...(chosen ? { pieceId: chosen.id } : { create: { kind: kind === "hook" ? "meat" : kind, seconds: pieceSeconds, text } }),
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
      {!open && <p className="text-xs text-muted">Pasa el video guardado a un gancho, un cuerpo (meat) o un llamado (CTA) de esta serie, sin descargarlo ni subirlo.</p>}
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
              <Segmented<TargetKind>
                value={kind}
                onChange={(k) => (setKind(k), setTarget("new"))}
                options={[
                  { value: "hook", label: "Como gancho (hook)" },
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
                {!targets.length && (
                  <p className="text-xs text-muted">
                    No hay {EXPLAINER_KIND_LABEL[kind]} aprobados en Publicidad.
                    {kind === "hook" ? " Un gancho nuevo se escribe en Publicidad: aprobalo y volvé acá." : " Podés crear uno nuevo con este video."}
                  </p>
                )}
                {kind !== "hook" && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="explainer-target" checked={target === "new"} onChange={() => setTarget("new")} />
                    <span>
                      <b>Uno nuevo</b> para anuncios de{" "}
                      <select
                        className="rounded border border-line bg-white px-1 py-0.5"
                        value={adSeconds}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!isAdSeconds(n)) return;
                          setAdSeconds(n);
                          setTypedSeconds(String(n));
                        }}
                        disabled={target !== "new"}
                      >
                        {lengthChoices.map((n) => (
                          <option key={n} value={n}>
                            {n} s
                          </option>
                        ))}
                      </select>{" "}
                      <input
                        type="number"
                        min={AD_MIN_SECONDS}
                        max={AD_MAX_SECONDS}
                        step={1}
                        className="w-16 rounded border border-line bg-white px-1 py-0.5"
                        value={typedSeconds}
                        aria-label="Segundos del anuncio"
                        disabled={target !== "new"}
                        onChange={(e) => {
                          setTypedSeconds(e.target.value);
                          const n = Number(e.target.value);
                          if (isAdSeconds(n)) setAdSeconds(n);
                        }}
                        onBlur={() => setTypedSeconds(String(adSeconds))}
                      />{" "}
                      s ({share < 1 ? "sin segundos" : s1(share)} de {EXPLAINER_KIND_LABEL[kind]})
                    </span>
                  </label>
                )}
                {target === "new" && shareNote && <p className="text-xs text-neg">{shareNote}</p>}
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
              {target === "new" && kind !== "hook" && fit && (
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
              <Button className="w-full" onClick={use} disabled={busy || !fit || !file || (target === "new" && (kind === "hook" || !text.trim() || share < 1))}>
                {busy ? <Spinner /> : chosen ? `Usar en ${chosen.id}` : kind === "hook" ? "Elegí un gancho" : `Crear ${kind === "meat" ? "el meat" : "el CTA"} con este video`}
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
