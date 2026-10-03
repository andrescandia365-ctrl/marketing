import { useEffect, useRef, useState } from "react";
import type { AudioSettings } from "../../shared/audio.ts";
import type { Board, Brief, Story } from "../../shared/schema.ts";
import type { TextStyle } from "../../shared/series.ts";
import { formatTime, totalSeconds } from "../../shared/template.ts";
import { download, slug } from "../lib/markdown.ts";
import { renderPreview, renderVideo, type RenderResult, type ShotMedia } from "../lib/render.ts";
import type { AudioFile } from "./Audio.tsx";
import { Button, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

const DISCLOSURE = { en: "Illustrative images", es: "Imágenes ilustrativas" };

type Props = {
  brief: Brief;
  story: Story;
  board: Board;
  media: Record<number, ShotMedia>;
  // Tools that watermark their output start with the full frame on.
  watermarked: boolean;
  seriesName: string;
  seriesStyle: TextStyle;
  onSaveStyle: (style: TextStyle) => Promise<void>;
  // Called with each finished video so it can be saved into the project folder.
  onRendered: (video: Blob) => Promise<string | null>;
  audio: AudioSettings;
  onAudio: (patch: Partial<AudioSettings>) => void;
  // Shots where someone is heard speaking, so the music ducks under them.
  spoken: boolean[];
  music: AudioFile | null;
  onMusic: (file: File) => Promise<void>;
  onRemoveMusic: () => void;
};

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="flex justify-between font-semibold">
        {label} <span className="font-mono text-muted">{value}%</span>
      </span>
      <input
        type="range"
        min={60}
        max={160}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded border border-line" />
      {label}
    </label>
  );
}

export function VideoPanel({
  brief,
  story,
  board,
  media,
  watermarked,
  seriesName,
  seriesStyle,
  onSaveStyle,
  onRendered,
  audio,
  onAudio,
  spoken,
  music,
  onMusic,
  onRemoveMusic,
}: Props) {
  const musicInput = useRef<HTMLInputElement>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(RenderResult & { url: string }) | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(true);
  const [disclosure, setDisclosure] = useState(DISCLOSURE[brief.language]);
  const [fullFrame, setFullFrame] = useState(watermarked);
  const [sound, setSound] = useState<"keep" | "mute">("keep");
  const [headlines, setHeadlines] = useState(true);
  const [style, setStyle] = useState<TextStyle>(seriesStyle);
  const [savingStyle, setSavingStyle] = useState<"" | "saving" | "saved">("");
  const [previewShot, setPreviewShot] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => setStyle(seriesStyle), [seriesStyle]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const total = board.shots.length;
  const clips = board.shots.filter((_, i) => media[i]?.clip).length;
  const empty = board.shots.filter((_, i) => !media[i]?.clip && !media[i]?.image).length;
  const speakers = Object.fromEntries(story.characters.map((c) => [c.id, { name: c.name, role: c.role }]));
  const disclosureText = showDisclosure ? disclosure : "";
  const styleChanged = JSON.stringify(style) !== JSON.stringify(seriesStyle);

  useEffect(() => {
    if (!preview.current) return;
    renderPreview(
      preview.current,
      board,
      media,
      { format: brief.format, disclosure: disclosureText, fullFrame, headlines, style, speakers },
      Math.min(previewShot, board.shots.length - 1),
    ).catch(() => undefined);
    // speakers is rebuilt on every render from story, so story stands in for it.
  }, [board, media, brief.format, disclosureText, fullFrame, headlines, style, story, previewShot]);

  const setStyleKey = <K extends keyof TextStyle>(key: K, value: TextStyle[K]) => {
    setStyle((s) => ({ ...s, [key]: value }));
    setSavingStyle("");
  };

  async function saveStyle() {
    setSavingStyle("saving");
    try {
      await onSaveStyle(style);
      setSavingStyle("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSavingStyle("");
    }
  }

  async function render() {
    setError("");
    setSaved(null);
    setProgress(0);
    try {
      const out = await renderVideo(
        board,
        media,
        {
          format: brief.format,
          disclosure: disclosureText,
          fullFrame,
          keepSound: sound === "keep",
          speakers,
          headlines,
          style,
          spoken,
          music: music?.blob,
          musicVolume: audio.musicVolume,
          sfxVolume: audio.sfxVolume,
          beatSync: audio.beatSync,
        },
        setProgress,
      );
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
      setSaved(await onRendered(out.blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const vertical = brief.format === "vertical";

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Video · {formatTime(totalSeconds(board.shots))}</p>
        <Button onClick={render} disabled={progress !== null}>
          {progress !== null ? `Generando ${Math.round(progress * 100)}%` : result ? "Generar de nuevo" : "Generar video"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {clips} de {total} tomas tienen clip. Las que solo tienen imagen llevan un acercamiento lento
        {empty > 0 ? `; las ${empty} vacías muestran una placa de color.` : "."}
      </p>

      <details className="rounded-lg border border-line p-3" open>
        <summary className="cursor-pointer text-xs font-semibold">Texto · estilo de {seriesName || "la serie"}</summary>
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <canvas
              ref={preview}
              className={`shrink-0 rounded-md bg-black ${vertical ? "w-28" : "w-44"}`}
              aria-label="Vista previa del texto"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-xs">
                <span className="font-semibold">Vista previa de la toma</span>
                <select
                  className={`${inputClass} mt-0.5 py-1 text-xs`}
                  value={previewShot}
                  onChange={(e) => setPreviewShot(Number(e.target.value))}
                >
                  {board.shots.map((s, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {s.title || s.voiceover.slice(0, 30)}
                    </option>
                  ))}
                </select>
              </label>
              <Slider label="Subtítulo" value={style.subtitleSize} onChange={(v) => setStyleKey("subtitleSize", v)} />
              <Slider label="Headline" value={style.headlineSize} onChange={(v) => setStyleKey("headlineSize", v)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Swatch label="Texto" value={style.textColor} onChange={(v) => setStyleKey("textColor", v)} />
            <Swatch label="Headline" value={style.headlineColor} onChange={(v) => setStyleKey("headlineColor", v)} />
            <Swatch label="Fondo / borde" value={style.backingColor} onChange={(v) => setStyleKey("backingColor", v)} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold">Para que se lea</span>
            <div>
              <Segmented
                value={style.backing}
                onChange={(v) => setStyleKey("backing", v)}
                options={[
                  { value: "shadow", label: "Sombra" },
                  { value: "outline", label: "Borde" },
                  { value: "box", label: "Caja" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={saveStyle} disabled={!styleChanged || savingStyle === "saving"}>
              {savingStyle === "saving" ? <Spinner /> : null}
              Guardar como estilo de {seriesName || "la serie"}
            </Button>
            {savingStyle === "saved" && <span className="text-xs text-good">Guardado ✓</span>}
            {styleChanged && savingStyle !== "saved" && (
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setStyle(seriesStyle)}>
                Volver al de la serie
              </button>
            )}
          </div>
        </div>
      </details>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={headlines} onChange={(e) => setHeadlines(e.target.checked)} />
        <span>
          <b>Headlines</b>
          <span className="block text-xs text-muted">El texto grande de arriba en cada toma. Apagalo para todo el video.</span>
        </span>
      </label>

      <div className="space-y-2 rounded-lg border border-line p-3">
        <p className="text-xs font-semibold">Música</p>
        {music ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <audio src={music.url} controls className="h-8 w-full" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {music.name} · {music.duration.toFixed(0)} s
              </span>
              <button type="button" onClick={onRemoveMusic} className="text-xs font-semibold text-muted hover:text-neg">
                Quitar
              </button>
            </div>
            <label className="block text-xs">
              <span className="flex justify-between font-semibold">
                Volumen <span className="font-mono text-muted">{Math.round(audio.musicVolume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audio.musicVolume}
                onChange={(e) => onAudio({ musicVolume: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5 size-4" checked={audio.beatSync} onChange={(e) => onAudio({ beatSync: e.target.checked })} />
              <span>
                <b>Cortes al ritmo</b>
                <span className="block text-muted">Cada corte se corre al golpe de la música más cercano (hasta un tercio de segundo).</span>
              </span>
            </label>
            {music.duration < totalSeconds(board.shots) && (
              <p className="text-xs text-muted">La música dura menos que el video: el final queda sin música.</p>
            )}
          </>
        ) : (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={musicBusy}
            onClick={() => musicInput.current?.click()}
          >
            {musicBusy ? <Spinner /> : null}
            Subir música
          </Button>
        )}
        <p className="text-xs text-muted">Libre de derechos. Baja sola cuando alguien habla.</p>
        <input
          ref={musicInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setMusicBusy(true);
            try {
              await onMusic(file);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setMusicBusy(false);
            }
          }}
        />
        <label className="block border-t border-line pt-2 text-xs">
          <span className="flex justify-between font-semibold">
            Efectos de sonido <span className="font-mono text-muted">{Math.round(audio.sfxVolume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.sfxVolume}
            onChange={(e) => onAudio({ sfxVolume: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      </div>

      <div className="space-y-1">
        <span className="text-xs font-semibold">Sonido de los clips</span>
        <div>
          <Segmented
            value={sound}
            onChange={setSound}
            options={[
              { value: "keep", label: "Mantener" },
              { value: "mute", label: "Silenciar" },
            ]}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={fullFrame} onChange={(e) => setFullFrame(e.target.checked)} />
        <span>
          <b>Cuadro completo</b>
          <span className="block text-xs text-muted">
            Sin zoom ni recorte, así la marca de agua de la herramienta queda visible{watermarked ? " (Grok lo exige)" : ""}.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={showDisclosure}
          onChange={(e) => setShowDisclosure(e.target.checked)}
        />
        <span>
          <b>Aviso al pie</b>
          <span className="block text-xs text-muted">Una línea chica abajo, en todo el video.</span>
        </span>
      </label>
      {showDisclosure && (
        <input
          className={`${inputClass} py-1.5 text-xs`}
          value={disclosure}
          onChange={(e) => setDisclosure(e.target.value)}
          placeholder="ej. Imágenes ilustrativas · Dramatización"
        />
      )}

      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <div className="space-y-2">
          <video
            src={result.url}
            controls
            playsInline
            className={`mx-auto w-full rounded-lg bg-black ${vertical ? "max-h-[70vh] w-auto" : ""}`}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => download(result.blob, `${slug(story.problem || story.title)}.${result.extension}`)}
          >
            Descargar .{result.extension}
          </Button>
          {saved && <p className="text-xs text-good">Guardado en el proyecto: {saved}</p>}
          {result.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}

        </div>
      )}
    </div>
  );
}
