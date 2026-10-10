// Lyric videos, "Estilo y video": the live preview next to the background, lettering and render panels.
import { useState } from "react";
import {
  LYRIC_ENTRANCES,
  LYRIC_ENTRANCE_LABEL,
  LYRIC_FONT_LABEL,
  LYRIC_FONTS,
  type LyricPiece,
  type BackgroundPrompts,
  type LyricStyle,
} from "../../shared/lyrics.ts";
import { api } from "../lib/api.ts";
import { pulseNote, type LyricPulse } from "../../shared/lyricPulse.ts";
import { actNote } from "../../shared/lyricAct.ts";
import { renderLyricVideo } from "../lib/lyricRender.ts";
import { download, slug } from "../lib/markdown.ts";
import { CopyButton } from "./ScriptView.tsx";
import type { RenderResult } from "../lib/render.ts";
import type { AudioFile } from "./Audio.tsx";
import { LyricPreview } from "./LyricPreview.tsx";
import { Button, Field, Segmented, Spinner, inputClass } from "./ui.tsx";

// Background clips (Grok's or the person's own) play one after the other; each sits in a media slot of the project.
export type BgClip = { slot: number; url: string; blob: Blob; name: string };
export const MAX_CLIPS = 8;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
// inputClass without its full width, for the small time fields.
const smallInput = inputClass.replace("w-full", "");

type VideoTabProps = {
  piece: LyricPiece;
  song: AudioFile | null;
  beats: LyricPulse;
  cuts: number[];
  grid: { usable: boolean; kicks: number[]; downbeats: number[] } | null;
  audio: React.RefObject<HTMLAudioElement | null>;
  bgImage: HTMLImageElement | null;
  bgClips: BgClip[];
  layers: HTMLImageElement[];
  elementImages: Record<number, HTMLImageElement>;
  onLayers: (files: File[]) => void;
  onClearLayers: () => void;
  onRemoveClip: (slot: number) => void;
  onPrompts: () => Promise<BackgroundPrompts | null>;
  busy: string | null;
  projectId: string | null;
  projectsDir: string;
  set: (patch: Partial<LyricPiece>) => void;
  setStyle: (patch: Partial<LyricStyle>) => void;
  onBackground: (files: File[]) => void;
  onRemoveBackground: () => void;
  onIdeas: () => void;
  onSaveStyle: () => void;
  setBusy: (b: null | "render") => void;
  setError: (e: string) => void;
  demucs: boolean;
  onMeasureDemucs: () => void;
  onMeasureStem: (file: File) => void;
};

export function VideoTab(props: VideoTabProps) {
  const { piece, song, beats, cuts, audio, bgImage, bgClips, layers, elementImages, busy, set, setStyle } = props;
  const style = piece.style;
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<(RenderResult & { url: string; format: LyricPiece["format"]; saved: string })[]>([]);
  const [prompts, setPrompts] = useState<BackgroundPrompts | null>(null);
  const vertical = piece.format === "vertical";

  // One format, or both one after the other; each is saved in the project as video-vertical / video-horizontal.
  async function render(formats: LyricPiece["format"][]) {
    if (!song) return;
    props.setError("");
    props.setBusy("render");
    setProgress(0);
    setResults([]);
    try {
      for (const [n, format] of formats.entries()) {
        const out = await renderLyricVideo(
          song.blob,
          { image: bgImage ?? undefined, clips: bgClips.map((c) => c.blob), layers, elements: elementImages },
          { ...piece, format },
          (f) => setProgress((n + f) / formats.length),
          cuts,
          props.grid,
        );
        let saved = "";
        if (props.projectId) {
          const { file } = await api.saveVideo(props.projectId, out.blob, format);
          saved = `${props.projectsDir}/${props.projectId}/${file}`;
        }
        setResults((r) => [...r, { ...out, url: URL.createObjectURL(out.blob), format, saved }]);
      }
    } catch (e) {
      props.setError(message(e));
    } finally {
      setProgress(null);
      props.setBusy(null);
    }
  }

  const missing = [!song && "la canción", !piece.lines.length && "sincronizar la letra", !piece.rights && "confirmar los derechos"].filter(Boolean);
  const color = (key: "textColor" | "highlightColor", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" value={style[key]} onChange={(e) => setStyle({ [key]: e.target.value })} />
      {label}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <LyricPreview
        piece={piece}
        audio={audio}
        beats={beats}
        cuts={cuts}
        bgImage={bgImage}
        bgClips={bgClips}
        layers={layers}
        elementImages={elementImages}
      />

      <div className="space-y-5">
        <Field label="Fondo" group>
          <Segmented
            value={style.background}
            onChange={(background) => setStyle({ background })}
            options={[
              { value: "organic", label: "Orgánico" },
              { value: "layers", label: "Capas de Grok" },
              { value: "media", label: "Foto o video propio" },
            ]}
          />
        </Field>
        {song && beats.source !== "none" && <p className="text-xs text-muted">{pulseNote(beats.source)}</p>}
        {style.background === "layers" && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Las capas que separa Grok (Segmentos → Descargar todo), del fondo al frente. Cada una se mueve según su profundidad y
              late con el ritmo.
            </p>
            <input
              type="file"
              accept="image/png,image/webp,image/*"
              multiple
              aria-label="Subir capas"
              className="text-sm"
              onChange={(e) => {
                if (e.target.files?.length) props.onLayers([...e.target.files]);
                e.target.value = "";
              }}
            />
            {layers.length > 0 && (
              <p className="flex items-center gap-2 text-xs text-muted">
                {layers.length} capa(s).
                <button type="button" className="font-semibold hover:text-ink" onClick={props.onClearLayers}>
                  Quitar
                </button>
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={piece.aiBackground} onChange={(e) => set({ aiBackground: e.target.checked })} />
              <span>
                <b>Aviso: fondo hecho con IA</b>
              </span>
            </label>
          </div>
        )}
        {style.background === "layers" ? null : style.background === "organic" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {style.palette.map((c, i) => (
                <input
                  key={i}
                  type="color"
                  aria-label={`Color ${i + 1}`}
                  value={c}
                  onChange={(e) => setStyle({ palette: style.palette.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              ))}
              <Segmented
                value={style.mood}
                onChange={(mood) => setStyle({ mood })}
                options={[
                  { value: "calm", label: "Calmo" },
                  { value: "lively", label: "Movido" },
                ]}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style.pulse} onChange={(e) => setStyle({ pulse: e.target.checked })} />
              Late con el ritmo
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Una foto, o hasta {MAX_CLIPS} videos que se pasan uno tras otro en loop (por ejemplo, clips de Grok).
            </p>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              aria-label="Subir fondo"
              className="text-sm"
              onChange={(e) => {
                if (e.target.files?.length) props.onBackground([...e.target.files]);
                e.target.value = "";
              }}
            />
            {bgClips.length > 0 && (
              <ol className="space-y-1 text-sm">
                {bgClips.map((c, i) => (
                  <li key={c.slot} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 py-1">
                    <span className="min-w-0 truncate">
                      {i + 1}. {c.name}
                    </span>
                    <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => props.onRemoveClip(c.slot)}>
                      Quitar
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            {(bgImage || bgClips.length > 0) && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={props.onRemoveBackground}>
                Quitar todo el fondo
              </Button>
            )}
            <div className="rounded-lg border border-line bg-white p-3">
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={busy !== null || !piece.lines.length}
                onClick={async () => setPrompts(await props.onPrompts())}
              >
                {busy === "prompts" ? <Spinner /> : null} Prompts para Grok (fondo en loop)
              </Button>
              {prompts && (
                <div className="mt-2 space-y-3">
                  {prompts.note && <p className="text-xs text-muted">{prompts.note}</p>}
                  {prompts.prompts.map((p, i) => (
                    <div key={i} className="space-y-1 border-t border-line pt-2 text-xs">
                      <p className="font-semibold">
                        {i + 1}. {p.title} · {p.seconds} s
                      </p>
                      <p className="text-muted">Imagen: {p.image}</p>
                      <p className="text-muted">Video: {p.video}</p>
                      <div className="flex gap-2">
                        <CopyButton text={p.image} idle="Copiar imagen" variant="secondary" />
                        <CopyButton text={p.video} idle="Copiar video" variant="secondary" />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted">Generalos en Grok, descargalos y subilos arriba: se pasan en orden.</p>
                </div>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={piece.fullFrame} onChange={(e) => set({ fullFrame: e.target.checked })} />
              <span>
                <b>Cuadro completo</b>
                <span className="block text-xs text-muted">Se ve entera, sin recortar (la marca de agua de Grok queda visible).</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={piece.aiBackground} onChange={(e) => set({ aiBackground: e.target.checked })} />
              <span>
                <b>Aviso: fondo hecho con IA</b>
                <span className="block text-xs text-muted">Dejalo prendido si la foto o el video los hizo una IA.</span>
              </span>
            </label>
          </div>
        )}

        <Button variant="secondary" onClick={props.onIdeas} disabled={busy !== null || !piece.lines.length}>
          {busy === "ideas" ? <Spinner /> : null} Ideas de la IA: colores y palabras clave
        </Button>

        <Field label="Letra" group>
          <div className="space-y-3">
            <Segmented
              value={style.font}
              onChange={(font) => setStyle({ font })}
              options={LYRIC_FONTS.map((f) => ({ value: f, label: LYRIC_FONT_LABEL[f] }))}
            />
            <label className="block text-sm">
              Tamaño {style.size}%
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                className="block w-full"
                value={style.size}
                onChange={(e) => setStyle({ size: Number(e.target.value) })}
              />
            </label>
            <div className="flex flex-wrap gap-4">
              {color("textColor", "Texto")}
              {color("highlightColor", "Resaltado")}
            </div>
            <Segmented
              value={style.position}
              onChange={(position) => setStyle({ position })}
              options={[
                { value: "center", label: "Al centro" },
                { value: "lower", label: "Abajo" },
              ]}
            />
            <div>
              <p className="mb-1 text-sm">Entrada de la letra</p>
              <div className="grid grid-cols-3 gap-1">
                {LYRIC_ENTRANCES.map((entrance) => (
                  <button
                    key={entrance}
                    type="button"
                    onClick={() => setStyle({ entrance })}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium ${style.entrance === entrance ? "bg-ink text-white" : "border border-line bg-white text-muted hover:text-ink"}`}
                  >
                    {LYRIC_ENTRANCE_LABEL[entrance]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style.karaoke} onChange={(e) => setStyle({ karaoke: e.target.checked })} />
              Karaoke: se ilumina la palabra que suena
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style.keywords} onChange={(e) => setStyle({ keywords: e.target.checked })} />
              Palabras clave más grandes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!piece.act} onChange={(e) => set({ act: e.target.checked })} />
              La letra actúa el canto
            </label>
            {piece.act && (
              <div className="space-y-2 pl-6">
                <p className="text-xs text-muted">{actNote(piece.lines, piece.synced)}</p>
                {piece.lines.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {props.demucs && song && (
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={props.onMeasureDemucs} disabled={busy !== null}>
                        {busy === "levels" ? "Midiendo…" : "Medir la voz con Demucs"}
                      </Button>
                    )}
                    <label className="text-muted">
                      {props.demucs && song ? "o subí el stem de voz: " : "Subí el stem de voz: "}
                      <input
                        type="file"
                        accept="audio/*"
                        aria-label="Subir el stem de voz"
                        className="text-xs"
                        disabled={busy !== null}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) props.onMeasureStem(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </Field>

        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={props.onSaveStyle} disabled={busy !== null}>
          Guardar este estilo en la serie
        </Button>

        <Field label="Video" group>
          <div className="space-y-3">
            <Segmented
              value={piece.format}
              onChange={(format) => set({ format })}
              options={[
                { value: "vertical", label: "Vertical 9:16" },
                { value: "horizontal", label: "Horizontal 16:9" },
              ]}
            />
            <div className="flex items-center gap-2 text-sm">
              Desde
              <input
                type="number"
                min={0}
                step={0.5}
                className={`${smallInput} w-20 px-2 py-1`}
                value={piece.from}
                onChange={(e) => set({ from: Math.max(0, Number(e.target.value)) })}
              />
              hasta
              <input
                type="number"
                min={0}
                step={0.5}
                className={`${smallInput} w-20 px-2 py-1`}
                value={piece.to || ""}
                placeholder="el final"
                onChange={(e) => set({ to: Math.max(0, Number(e.target.value)) })}
              />
              s
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={piece.credit} onChange={(e) => set({ credit: e.target.checked })} />
              Crédito de la canción al pie
            </label>
          </div>
        </Field>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => render([piece.format])} disabled={busy !== null || missing.length > 0}>
            {busy === "render" ? (
              <>
                <Spinner /> Generando…
              </>
            ) : (
              `Generar ${vertical ? "9:16" : "16:9"}`
            )}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => render(["vertical", "horizontal"])}
            disabled={busy !== null || missing.length > 0}
          >
            Generar los dos formatos
          </Button>
        </div>
        {missing.length > 0 && <p className="text-xs text-muted">Falta: {missing.join(", ")}.</p>}
        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-paper">
            <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {results.map((result) => (
          <div key={result.format} className="space-y-2">
            <p className="text-xs font-semibold">{result.format === "vertical" ? "Vertical 9:16" : "Horizontal 16:9"}</p>
            <video
              src={result.url}
              controls
              playsInline
              className={`mx-auto w-full rounded-lg bg-black ${result.format === "vertical" ? "max-h-[70vh] w-auto" : ""}`}
            />
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                download(result.blob, `${slug(piece.title) || "video-de-letra"}-${result.format === "vertical" ? "9x16" : "16x9"}.${result.extension}`)
              }
            >
              Descargar {result.format === "vertical" ? "9:16" : "16:9"} .{result.extension}
            </Button>
            {result.saved && <p className="text-xs text-good">Guardado en el proyecto: {result.saved}</p>}
            {result.notes.map((n) => (
              <p key={n} className="text-xs text-muted">
                {n}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
