// Lyric videos (series of type music): the song and its lyrics, the sync (automatic or tapping), and the look with a
// live preview and the final video. Autosaves into the project folder like a story piece.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LYRIC_FONT_LABEL,
  LYRIC_FONTS,
  LYRIC_LANGUAGE_LABEL,
  LYRIC_LANGUAGES,
  markKeywords,
  newLyricPiece,
  retimeLine,
  splitLyrics,
  tapLines,
  toLrc,
  type LyricLine,
  type LyricPiece,
  type LyricStyle,
} from "../../shared/lyrics.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { api, projectFileUrl, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { blobToDataUrl } from "../lib/files.ts";
import { decodeSong, drawLyricFrame, loadLyricFonts, renderLyricVideo, songBeats, type Backdrop } from "../lib/lyricRender.ts";
import { download, slug } from "../lib/markdown.ts";
import type { RenderResult } from "../lib/render.ts";
import { audioDuration, type AudioFile } from "./Audio.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

export type LyricOpen = { piece: LyricPiece; music: MediaFileRecord | null; media: MediaRecord | undefined };

type Props = {
  projectId: string | null;
  brief: Brief;
  series: SeriesInfo;
  initial: LyricOpen | null;
  autoSync: boolean;
  projectsDir: string;
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
  onSeries: (series: SeriesInfo[]) => void;
};

type Tab = "song" | "sync" | "video";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
// inputClass without its full width, for the small time fields.
const smallInput = inputClass.replace("w-full", "");
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function pieceMarkdown(piece: LyricPiece): string {
  return `# ♪ ${piece.title || "Sin título"}${piece.artist ? ` — ${piece.artist}` : ""}

Video de letra · ${LYRIC_LANGUAGE_LABEL[piece.language]} · ${piece.format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}

## Letra sincronizada (.lrc)

\`\`\`
${toLrc(piece)}
\`\`\`
`;
}

export function LyricStudio({ projectId, brief, series, initial, autoSync, projectsDir, onSaveStatus, onSeries }: Props) {
  const [piece, setPiece] = useState<LyricPiece>(() =>
    initial ? { ...newLyricPiece(series.lyricStyle, brief.format), ...initial.piece } : newLyricPiece(series.lyricStyle, brief.format),
  );
  const [tab, setTab] = useState<Tab>(initial?.piece.lines.length ? "video" : "song");
  const [song, setSong] = useState<AudioFile | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgClip, setBgClip] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState<null | "sync" | "ideas" | "second" | "render" | "upload" | "style">(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef<string[]>([]);

  const set = (patch: Partial<LyricPiece>) => setPiece((p) => ({ ...p, ...patch }));
  const setStyle = (patch: Partial<LyricStyle>) => setPiece((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const texts = useMemo(() => splitLyrics(piece.text), [piece.text]);
  const seconds = useMemo(() => splitLyrics(piece.secondText), [piece.secondText]);
  const stale = piece.lines.length > 0 && piece.lines.map((l) => l.text).join("\n") !== texts.join("\n");
  const beats = useMemo(() => (buffer ? songBeats(buffer) : []), [buffer]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const objectUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };

  // A saved piece brings back its song and its background from the folder.
  useEffect(() => {
    if (!projectId || !initial) return;
    const { music, media } = initial;
    if (music) {
      fetch(projectFileUrl(projectId, music.file))
        .then((r) => r.blob())
        .then((blob) => setSong({ url: objectUrl(blob), blob, name: music.name, duration: music.duration }))
        .catch(() => setError("No se pudo leer la canción guardada."));
    }
    if (media?.image) {
      const img = new Image();
      img.onload = () => setBgImage(img);
      img.src = projectFileUrl(projectId, media.image);
    }
    if (media?.clip) {
      fetch(projectFileUrl(projectId, media.clip.file))
        .then((r) => r.blob())
        .then((blob) => setBgClip({ url: objectUrl(blob), blob }))
        .catch(() => setError("No se pudo leer el video de fondo guardado."));
    }
    // Only when the piece is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBuffer(null);
    if (!song) return;
    decodeSong(song.blob)
      .then(setBuffer)
      .catch((e) => setError(message(e)));
  }, [song]);

  // Autosave.
  useEffect(() => {
    if (!projectId) return;
    onSaveStatus("saving");
    const timer = setTimeout(() => {
      api
        .saveProject(projectId, { version: 1, kind: "lyrics", step: "lyrics", pieceBrief: brief, lyrics: piece }, pieceMarkdown(piece))
        .then(() => onSaveStatus("saved"))
        .catch((e) => {
          onSaveStatus("error");
          setError(`No se pudo guardar el proyecto: ${message(e)}`);
        });
    }, 800);
    return () => clearTimeout(timer);
    // onSaveStatus and brief do not change while the piece is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, piece]);

  async function work<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>): Promise<T | null> {
    setError("");
    setBusy(kind);
    try {
      return await fn();
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function addSong(file: File) {
    await work("upload", async () => {
      const duration = await audioDuration(file);
      setSong({ url: objectUrl(file), blob: file, name: file.name, duration });
      if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
    });
  }

  async function addBackground(file: File) {
    await work("upload", async () => {
      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.src = await blobToDataUrl(file);
        await img.decode();
        setBgImage(img);
        setBgClip(null);
        if (projectId) {
          await api.uploadMedia(projectId, 0, "image", file);
          await api.removeMedia(projectId, 0, "clip").catch(() => undefined);
        }
      } else if (file.type.startsWith("video/")) {
        setBgClip({ url: objectUrl(file), blob: file });
        setBgImage(null);
        if (projectId) {
          await api.uploadMedia(projectId, 0, "clip", file, { name: file.name, duration: 0 });
          await api.removeMedia(projectId, 0, "image").catch(() => undefined);
        }
      } else throw new Error("Subí una foto o un video.");
      setStyle({ background: "media" });
    });
  }

  async function removeBackground() {
    setBgImage(null);
    setBgClip(null);
    setStyle({ background: "organic" });
    if (projectId) {
      await api.removeMedia(projectId, 0, "image").catch(() => undefined);
      await api.removeMedia(projectId, 0, "clip").catch(() => undefined);
    }
  }

  async function autoSyncNow() {
    if (!song) return;
    const result = await work("sync", () => api.syncLyrics(song.blob, song.name, texts, seconds, piece.language));
    if (!result) return;
    set({ lines: result.lines, synced: "auto" });
    setNote(`Sincronizado: la transcripción escuchó ${result.heard} palabras. Revisá los tiempos abajo.`);
  }

  // Keeps the second lines (romanization or translation) in step with the lyric lines.
  function setSecondText(secondText: string) {
    const list = splitLyrics(secondText);
    setPiece((p) => ({ ...p, secondText, lines: p.lines.map((l, i) => ({ ...l, second: list[i] ?? "" })) }));
  }

  async function aiSecond(mode: "romanize" | "translate") {
    const result = await work("second", () => api.secondLines(series.id, texts, mode));
    if (!result) return;
    setSecondText(result.lines.join("\n"));
    setNote(
      [mode === "romanize" ? "Revisá la romanización: la IA se puede equivocar con las lecturas." : "Revisá la traducción.", result.note]
        .filter(Boolean)
        .join(" "),
    );
  }

  async function aiIdeas() {
    const result = await work("ideas", () => api.lyricIdeas(series.id, piece.title, piece.artist, texts));
    if (!result) return;
    setPiece((p) => ({
      ...p,
      style: { ...p.style, palette: result.palette, mood: result.mood },
      lines: markKeywords(p.lines, result.keywords),
    }));
    setNote(result.note);
  }

  async function saveStyleToSeries() {
    const result = await work("style", () => api.saveLyricStyle(series.id, piece.style));
    if (result) {
      onSeries(result.series);
      setNote(`Estilo guardado en la serie ${series.name}: los próximos videos arrancan así.`);
    }
  }

  function setLineStart(i: number, start: number) {
    setPiece((p) => {
      const lines = [...p.lines];
      const line = lines[i];
      const s = Math.max(0, start);
      lines[i] = retimeLine(line, s, Math.max(s + 0.3, line.end + (s - line.start)));
      if (i > 0 && lines[i - 1].end > s) lines[i - 1] = retimeLine(lines[i - 1], lines[i - 1].start, Math.max(lines[i - 1].start + 0.2, s - 0.05));
      return { ...p, lines };
    });
  }

  function toggleKey(i: number, w: number) {
    setPiece((p) => ({
      ...p,
      lines: p.lines.map((l, li) => (li !== i ? l : { ...l, words: l.words.map((x, wi) => (wi === w ? { ...x, key: !x.key } : x)) })),
    }));
  }

  function playFrom(t: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, t);
    audio.play().catch(() => undefined);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "song", label: "Canción y letra" },
    { id: "sync", label: "Sincronizar" },
    { id: "video", label: "Estilo y video" },
  ];

  return (
    <section className="space-y-5">
      <div>
        <p className="font-mono text-xs text-muted">{series.name} · video de letra</p>
        <h2 className="text-xl font-bold tracking-tight">♪ {piece.title || "Canción sin título"}</h2>
        {piece.artist && <p className="text-sm text-muted">{piece.artist}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {song && <audio ref={audioRef} src={song.url} controls className="h-9 min-w-0 flex-1" />}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}

      {tab === "song" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Título de la canción">
            <input className={inputClass} value={piece.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Artista (va en el crédito)">
            <input className={inputClass} value={piece.artist} onChange={(e) => set({ artist: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="La canción" hint="Un .mp3, .wav o .m4a. Se guarda en la carpeta del proyecto.">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="audio/*"
                  className="text-sm"
                  onChange={(e) => e.target.files?.[0] && addSong(e.target.files[0])}
                />
                {song && (
                  <span className="text-sm text-muted">
                    {song.name} · {clock(song.duration)}
                  </span>
                )}
                {busy === "upload" && <Spinner />}
              </div>
            </Field>
          </div>
          <Field label="Idioma de la letra" group hint="Guaraní, japonés, coreano, romanizada o mezcla: la letra se muestra tal cual.">
            <Segmented
              value={piece.language}
              onChange={(language) => set({ language })}
              options={LYRIC_LANGUAGES.map((l) => ({ value: l, label: LYRIC_LANGUAGE_LABEL[l] }))}
            />
          </Field>
          <label className="flex items-start gap-2 self-end text-sm">
            <input type="checkbox" className="mt-1" checked={piece.rights} onChange={(e) => set({ rights: e.target.checked })} />
            <span>
              <b>La canción es mía o tengo licencia para usarla.</b>
              <span className="block text-xs text-muted">Sin esto no se genera el video.</span>
            </span>
          </label>
          <Field label="Letra" hint="Una línea por renglón, como se canta. Los renglones vacíos y las marcas como [Estribillo] no se muestran.">
            <textarea
              className={`${inputClass} font-mono`}
              rows={14}
              value={piece.text}
              onChange={(e) => set({ text: e.target.value })}
            />
          </Field>
          <Field
            label="Segunda línea (opcional)"
            hint="Va más chica debajo de cada línea: la romanización o la traducción. Una por renglón, en el mismo orden que la letra."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={14}
              value={piece.secondText}
              onChange={(e) => setSecondText(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!texts.length || busy !== null} onClick={() => aiSecond("romanize")}>
                {busy === "second" ? <Spinner /> : null} Romanizar con IA
              </Button>
              <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!texts.length || busy !== null} onClick={() => aiSecond("translate")}>
                Traducir al español con IA
              </Button>
            </div>
          </Field>
          <div className="md:col-span-2">
            <Button onClick={() => setTab("sync")} disabled={!song || !texts.length}>
              Seguir → sincronizar
            </Button>
            <span className="ml-3 text-sm text-muted">{texts.length} líneas</span>
          </div>
        </div>
      )}

      {tab === "sync" && (
        <div className="space-y-4">
          {!song || !texts.length ? (
            <Notice tone="warn">Primero subí la canción y pegá la letra.</Notice>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm font-semibold">Automático</p>
                  <p className="text-xs text-muted">
                    La IA escucha la canción y le pone tiempo a cada palabra de tu letra.
                    {piece.language === "gn" && " No conoce el guaraní: escucha sin idioma. Si sale mal, sincronizá tocando."}
                    {!autoSync && " Necesita OPENAI_API_KEY en .env."}
                  </p>
                  <Button onClick={autoSyncNow} disabled={!autoSync || busy !== null}>
                    {busy === "sync" ? (
                      <>
                        <Spinner /> Escuchando la canción…
                      </>
                    ) : (
                      "Sincronizar automático"
                    )}
                  </Button>
                </div>
                <TapSync
                  texts={texts}
                  audio={audioRef}
                  onDone={(starts) => {
                    set({ lines: tapLines(texts, seconds, starts, song.duration), synced: "tap" });
                    setNote("Sincronizado tocando. Ajustá cualquier línea abajo.");
                  }}
                />
              </div>
              {stale && <Notice tone="warn">La letra cambió después de sincronizar: volvé a sincronizar.</Notice>}
              {piece.lines.length > 0 && (
                <LineEditor lines={piece.lines} onStart={setLineStart} onKey={toggleKey} onPlay={playFrom} />
              )}
              {piece.lines.length > 0 && (
                <Button onClick={() => setTab("video")}>Seguir → estilo y video</Button>
              )}
            </>
          )}
        </div>
      )}

      {tab === "video" && (
        <VideoTab
          piece={piece}
          song={song}
          beats={beats}
          audio={audioRef}
          bgImage={bgImage}
          bgClip={bgClip}
          busy={busy}
          projectId={projectId}
          projectsDir={projectsDir}
          set={set}
          setStyle={setStyle}
          onBackground={addBackground}
          onRemoveBackground={removeBackground}
          onIdeas={aiIdeas}
          onSaveStyle={saveStyleToSeries}
          setBusy={setBusy}
          setError={setError}
        />
      )}
    </section>
  );
}

// Hand sync: the song plays and the person taps (or presses the space bar) when each line starts.
function TapSync({
  texts,
  audio,
  onDone,
}: {
  texts: string[];
  audio: React.RefObject<HTMLAudioElement | null>;
  onDone: (starts: number[]) => void;
}) {
  const [starts, setStarts] = useState<number[] | null>(null);

  function begin() {
    const a = audio.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => undefined);
    setStarts([]);
  }

  function tap() {
    const a = audio.current;
    if (!a || !starts) return;
    const next = [...starts, a.currentTime];
    if (next.length >= texts.length) {
      setStarts(null);
      onDone(next);
    } else setStarts(next);
  }

  useEffect(() => {
    if (!starts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!starts) {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Tocando</p>
        <p className="text-xs text-muted">
          Suena la canción desde el principio y tocás <b>Ahora</b> (o la barra espaciadora) justo cuando empieza cada línea. Sirve
          para cualquier idioma.
        </p>
        <Button variant="secondary" onClick={begin}>
          Empezar a tocar
        </Button>
      </div>
    );
  }
  const i = starts.length;
  return (
    <div className="space-y-3 rounded-xl border-2 border-ink bg-white p-4">
      <p className="text-xs text-muted">
        Línea {i + 1} de {texts.length}. Tocá cuando empiece:
      </p>
      <p className="text-lg font-bold">{texts[i]}</p>
      {texts[i + 1] && <p className="text-sm text-muted">Después: {texts[i + 1]}</p>}
      <div className="flex gap-2">
        <Button className="flex-1 py-4 text-base" onClick={tap}>
          Ahora
        </Button>
        <Button variant="secondary" onClick={() => setStarts(starts.slice(0, -1))} disabled={!i}>
          Deshacer
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            audio.current?.pause();
            setStarts(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function LineEditor({
  lines,
  onStart,
  onKey,
  onPlay,
}: {
  lines: LyricLine[];
  onStart: (i: number, start: number) => void;
  onKey: (line: number, word: number) => void;
  onPlay: (t: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-white">
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Ajustá cuándo empieza cada línea. Tocá una palabra para que salga más grande (palabra clave).
      </p>
      <ol className="divide-y divide-line">
        {lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" className="px-2 py-1 text-xs" title="Escuchar desde acá" onClick={() => onPlay(l.start - 0.5)}>
                ▶
              </Button>
              <Button variant="ghost" className="px-1.5 py-1 text-xs" onClick={() => onStart(i, l.start - 0.1)}>
                −
              </Button>
              <input
                type="number"
                step={0.1}
                min={0}
                aria-label={`Empieza la línea ${i + 1}`}
                className={`${smallInput} w-20 px-2 py-1 font-mono text-xs`}
                value={Number(l.start.toFixed(2))}
                onChange={(e) => onStart(i, Number(e.target.value))}
              />
              <Button variant="ghost" className="px-1.5 py-1 text-xs" onClick={() => onStart(i, l.start + 0.1)}>
                +
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                {l.words.map((w, wi) => (
                  <button
                    key={wi}
                    type="button"
                    onClick={() => onKey(i, wi)}
                    aria-pressed={w.key}
                    className={`rounded px-1 text-sm ${w.key ? "bg-touch-soft font-bold text-touch" : "hover:bg-black/5"}`}
                  >
                    {w.text}
                  </button>
                ))}
              </div>
              {l.second && <p className="text-xs text-muted">{l.second}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type VideoTabProps = {
  piece: LyricPiece;
  song: AudioFile | null;
  beats: number[];
  audio: React.RefObject<HTMLAudioElement | null>;
  bgImage: HTMLImageElement | null;
  bgClip: { url: string; blob: Blob } | null;
  busy: string | null;
  projectId: string | null;
  projectsDir: string;
  set: (patch: Partial<LyricPiece>) => void;
  setStyle: (patch: Partial<LyricStyle>) => void;
  onBackground: (file: File) => void;
  onRemoveBackground: () => void;
  onIdeas: () => void;
  onSaveStyle: () => void;
  setBusy: (b: null | "render") => void;
  setError: (e: string) => void;
};

function VideoTab(props: VideoTabProps) {
  const { piece, song, beats, audio, bgImage, bgClip, busy, set, setStyle } = props;
  const style = piece.style;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pieceRef = useRef(piece);
  pieceRef.current = piece;
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(RenderResult & { url: string }) | null>(null);
  const [saved, setSaved] = useState("");
  const vertical = piece.format === "vertical";
  const [pw, ph] = vertical ? [360, 640] : [640, 360];

  useEffect(() => {
    loadLyricFonts(piece).catch(() => undefined);
    // Fonts only depend on the words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.lines]);

  // The live preview follows the song player.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const t = audio.current?.currentTime ?? 0;
        const video = videoRef.current;
        let bg: Backdrop = null;
        if (video && video.readyState >= 2) bg = { source: video, width: video.videoWidth, height: video.videoHeight };
        else if (bgImage) bg = { source: bgImage, width: bgImage.naturalWidth, height: bgImage.naturalHeight };
        drawLyricFrame(ctx, canvas.width, canvas.height, t, pieceRef.current, bg, beats);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [audio, bgImage, beats]);

  async function render() {
    if (!song) return;
    props.setError("");
    props.setBusy("render");
    setProgress(0);
    setSaved("");
    try {
      const out = await renderLyricVideo(song.blob, { image: bgImage ?? undefined, clip: bgClip?.blob }, piece, setProgress);
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
      if (props.projectId) {
        const { file } = await api.saveVideo(props.projectId, out.blob);
        setSaved(`${props.projectsDir}/${props.projectId}/${file}`);
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
      <div className="space-y-3">
        <div className="flex justify-center rounded-xl bg-black/90 p-3">
          <canvas
            ref={canvasRef}
            width={pw}
            height={ph}
            className={vertical ? "h-[640px] max-h-[70vh] w-auto" : "w-full"}
            aria-label="Vista previa"
          />
        </div>
        {bgClip && <video ref={videoRef} src={bgClip.url} muted loop autoPlay playsInline className="hidden" />}
        <p className="text-center text-xs text-muted">La vista previa sigue al reproductor de arriba: dale play.</p>
      </div>

      <div className="space-y-5">
        <Field label="Fondo" group>
          <Segmented
            value={style.background}
            onChange={(background) => setStyle({ background })}
            options={[
              { value: "organic", label: "Orgánico" },
              { value: "media", label: "Foto o video propio" },
            ]}
          />
        </Field>
        {style.background === "organic" ? (
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
            <input type="file" accept="image/*,video/*" className="text-sm" onChange={(e) => e.target.files?.[0] && props.onBackground(e.target.files[0])} />
            {(bgImage || bgClip) && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={props.onRemoveBackground}>
                Quitar fondo
              </Button>
            )}
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
            <Segmented
              value={style.entrance}
              onChange={(entrance) => setStyle({ entrance })}
              options={[
                { value: "fade", label: "Aparece" },
                { value: "slide", label: "Sube" },
                { value: "pop", label: "Salta" },
              ]}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style.karaoke} onChange={(e) => setStyle({ karaoke: e.target.checked })} />
              Karaoke: se ilumina la palabra que suena
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style.keywords} onChange={(e) => setStyle({ keywords: e.target.checked })} />
              Palabras clave más grandes
            </label>
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

        <Button className="w-full" onClick={render} disabled={busy !== null || missing.length > 0}>
          {busy === "render" ? (
            <>
              <Spinner /> Generando…
            </>
          ) : (
            "Generar video"
          )}
        </Button>
        {missing.length > 0 && <p className="text-xs text-muted">Falta: {missing.join(", ")}.</p>}
        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-paper">
            <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {result && (
          <div className="space-y-2">
            <video src={result.url} controls playsInline className={`mx-auto w-full rounded-lg bg-black ${vertical ? "max-h-[70vh] w-auto" : ""}`} />
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => download(result.blob, `${slug(piece.title) || "video-de-letra"}.${result.extension}`)}
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
    </div>
  );
}

