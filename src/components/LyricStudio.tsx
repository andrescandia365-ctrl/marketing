// Lyric videos (series of type music): the song and its lyrics, the sync (automatic or tapping), and the look with a
// live preview and the final video. Autosaves into the project folder like a story piece.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LYRIC_ELEMENT_SLOT,
  LYRIC_ELEMENT_SLOTS,
  LYRIC_FONT_LABEL,
  LYRIC_FONTS,
  LYRIC_LANGUAGE_LABEL,
  LYRIC_LANGUAGES,
  SECOND_LANGUAGES,
  SECOND_LANGUAGE_LABEL,
  markKeywords,
  newLyricPiece,
  parseLrc,
  retimeLine,
  sectionHeaders,
  splitLyrics,
  tapLines,
  toLrc,
  type LyricElement,
  type LyricLine,
  type LyricPiece,
  type BackgroundPrompts,
  type LyricStyle,
  type SecondLanguage,
} from "../../shared/lyrics.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { api, projectFileUrl, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { blobToDataUrl } from "../lib/files.ts";
import type { MotionAsset } from "../lib/motion.ts";
import { decodeSong, drawLyricFrame, loadLyricFonts, renderLyricVideo, songBeats, type Backdrop, type ElementGlyph } from "../lib/lyricRender.ts";
import { rasterSvg } from "../lib/svgSanitize.ts";
import { ClockPanel } from "./ClockPanel.tsx";
import { LyricElements } from "./LyricElements.tsx";
import { download, slug } from "../lib/markdown.ts";
import { CopyButton } from "./ScriptView.tsx";
import type { RenderResult } from "../lib/render.ts";
import { audioDuration, type AudioFile } from "./Audio.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

export type LyricOpen = { piece: LyricPiece; music: MediaFileRecord | null; media: Record<string, MediaRecord> };
// Background clips (Grok's or the person's own) play one after the other; each sits in a media slot of the project.
type BgClip = { slot: number; url: string; blob: Blob; name: string };
const MAX_CLIPS = 4;
const LAYER_BASE = 200;

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

type Tab = "song" | "sync" | "clock" | "elements" | "video";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
// inputClass without its full width, for the small time fields.
const smallInput = inputClass.replace("w-full", "");
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function pieceMarkdown(piece: LyricPiece): string {
  return `# ♪ ${piece.title || "Sin título"}${piece.artist ? ` — ${piece.artist}` : ""}

Video de letra · ${LYRIC_LANGUAGE_LABEL[piece.language]} · ${piece.format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}

${piece.elements.length ? `## Elementos\n\n${piece.elements.map((e) => `- verso ${e.line + 1} · ${e.label} · ${e.seconds}s`).join("\n")}\n\n` : ""}## Letra sincronizada (.lrc)

\`\`\`
${toLrc(piece)}
\`\`\`
`;
}

export function LyricStudio({ projectId, brief, series, initial, autoSync, projectsDir, onSaveStatus, onSeries }: Props) {
  const [piece, setPiece] = useState<LyricPiece>(() => {
    const base = initial ? { ...newLyricPiece(series.lyricStyle, brief.format), ...initial.piece } : newLyricPiece(series.lyricStyle, brief.format);
    const secondLanguage: SecondLanguage = (SECOND_LANGUAGES as readonly string[]).includes(base.secondLanguage) ? base.secondLanguage : "es";
    return { ...base, elements: base.elements ?? [], secondLanguage, secondOther: base.secondOther ?? "" };
  });
  const [tab, setTab] = useState<Tab>(initial?.piece.lines.length ? "video" : "song");
  const [song, setSong] = useState<AudioFile | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  // Grok's separated layers, back to front (project media slots 200 + n).
  const [layers, setLayers] = useState<HTMLImageElement[]>([]);
  const [elementImages, setElementImages] = useState<Record<number, HTMLImageElement>>({});
  const [bgClips, setBgClips] = useState<BgClip[]>([]);
  const [busy, setBusy] = useState<null | "sync" | "ideas" | "second" | "elements" | "render" | "upload" | "style" | "prompts" | "lrc">(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef<string[]>([]);

  const set = (patch: Partial<LyricPiece>) => setPiece((p) => ({ ...p, ...patch }));
  const setStyle = (patch: Partial<LyricStyle>) => setPiece((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const texts = useMemo(() => splitLyrics(piece.text), [piece.text]);
  const seconds = useMemo(() => splitLyrics(piece.secondText), [piece.secondText]);
  const headers = useMemo(() => sectionHeaders(piece.text), [piece.text]);
  // The language "Traducir con IA" writes into; "otro" is the one typed next to it.
  const toLanguage = piece.secondLanguage === "otro" ? piece.secondOther.trim() : SECOND_LANGUAGE_LABEL[piece.secondLanguage];
  // What "Seguir → sincronizar" still needs, said next to it.
  const missingSong = [!song && "subir la canción", !texts.length && "escribir la letra"].filter(Boolean);
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
    if (media["0"]?.image) {
      const img = new Image();
      img.onload = () => setBgImage(img);
      img.src = projectFileUrl(projectId, media["0"].image);
    }
    Promise.all(
      Array.from({ length: initial.piece.layers ?? 0 }, (_, k) => {
        const file = media[LAYER_BASE + k]?.image;
        if (!file) return Promise.resolve(null);
        const img = new Image();
        img.src = projectFileUrl(projectId, file);
        return img.decode().then(() => img, () => null);
      }),
    ).then((imgs) => setLayers(imgs.filter((x): x is HTMLImageElement => Boolean(x))));
    Promise.all(
      (initial.piece.elements ?? [])
        .filter((e) => e.slot >= LYRIC_ELEMENT_SLOT)
        .map(async (e) => {
          const file = media[String(e.slot)]?.image;
          if (!file) return null;
          const img = new Image();
          img.src = projectFileUrl(projectId, file);
          return img.decode().then(() => [e.slot, img] as const, () => null);
        }),
    ).then((pairs) => {
      const next: Record<number, HTMLImageElement> = {};
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      setElementImages(next);
    });
    for (let slot = 0; slot < MAX_CLIPS; slot++) {
      const clip = media[slot]?.clip;
      if (!clip) continue;
      fetch(projectFileUrl(projectId, clip.file))
        .then((r) => r.blob())
        .then((blob) =>
          setBgClips((c) => [...c, { slot, url: objectUrl(blob), blob, name: clip.name }].sort((a, b) => a.slot - b.slot)),
        )
        .catch(() => setError("No se pudo leer un video de fondo guardado."));
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

  // A photo replaces everything; videos add up (up to four) and play in order.
  async function addBackground(files: File[]) {
    await work("upload", async () => {
      const image = files.find((f) => f.type.startsWith("image/"));
      const videos = files.filter((f) => f.type.startsWith("video/"));
      if (!image && !videos.length) throw new Error("Subí una foto o un video.");
      if (image) {
        const img = new Image();
        img.src = await blobToDataUrl(image);
        await img.decode();
        await clearClips();
        setBgImage(img);
        if (projectId) await api.uploadMedia(projectId, 0, "image", image);
      } else {
        let clips = bgClips;
        for (const file of videos) {
          const slot = [...Array(MAX_CLIPS).keys()].find((n) => !clips.some((c) => c.slot === n));
          if (slot === undefined) throw new Error(`Entran hasta ${MAX_CLIPS} videos de fondo.`);
          clips = [...clips, { slot, url: objectUrl(file), blob: file, name: file.name }].sort((a, b) => a.slot - b.slot);
          setBgClips(clips);
          if (projectId) await api.uploadMedia(projectId, slot, "clip", file, { name: file.name, duration: 0 });
        }
        if (bgImage) {
          setBgImage(null);
          if (projectId) await api.removeMedia(projectId, 0, "image").catch(() => undefined);
        }
      }
      setStyle({ background: "media" });
    });
  }

  async function addLayers(files: File[]) {
    await work("upload", async () => {
      const start = layers.length;
      const images = files.filter((f) => f.type.startsWith("image/")).slice(0, 8 - start);
      const loaded: HTMLImageElement[] = [];
      for (const file of images) {
        const img = new Image();
        img.src = await blobToDataUrl(file);
        await img.decode();
        loaded.push(img);
      }
      setLayers((l) => [...l, ...loaded]);
      setPiece((p) => ({ ...p, layers: start + loaded.length, style: { ...p.style, background: "layers" } }));
      if (projectId) for (let k = 0; k < images.length; k++) await api.uploadMedia(projectId, LAYER_BASE + start + k, "image", images[k]);
    });
  }

  async function clearLayers() {
    const count = layers.length;
    setLayers([]);
    setPiece((p) => ({ ...p, layers: 0 }));
    if (projectId) for (let k = 0; k < count; k++) await api.removeMedia(projectId, LAYER_BASE + k, "image").catch(() => undefined);
  }

  async function removeClip(slot: number) {
    setBgClips((c) => c.filter((x) => x.slot !== slot));
    if (projectId) await api.removeMedia(projectId, slot, "clip").catch(() => undefined);
  }

  async function clearClips() {
    const slots = bgClips.map((c) => c.slot);
    setBgClips([]);
    if (projectId) for (const slot of slots) await api.removeMedia(projectId, slot, "clip").catch(() => undefined);
  }

  async function removeBackground() {
    setBgImage(null);
    await clearClips();
    setStyle({ background: "organic" });
    if (projectId) await api.removeMedia(projectId, 0, "image").catch(() => undefined);
  }

  async function autoSyncNow() {
    if (!song) return;
    const result = await work("sync", () => api.syncLyrics(song.blob, song.name, texts, seconds, piece.language));
    if (!result) return;
    set({ lines: result.lines, synced: "auto" });
    setNote(`Sincronizado: la transcripción escuchó ${result.heard} palabras. Revisá los tiempos abajo.`);
  }

  // An .lrc brings its own times; if its lines match the pasted lyrics they keep the pasted text, else it brings the text too.
  async function importLrc(file: File) {
    const lrc = parseLrc(await file.text());
    if (!lrc.texts.length) {
      setError("Ese archivo no tiene líneas con tiempo ([mm:ss.xx]).");
      return;
    }
    const same = texts.length === lrc.texts.length;
    const lineTexts = same ? texts : lrc.texts;
    const hasSeconds = lrc.seconds.some(Boolean);
    const lineSeconds = hasSeconds ? lrc.seconds : seconds;
    const end = song?.duration || lrc.starts[lrc.starts.length - 1] + 8;
    setPiece((p) => ({
      ...p,
      title: p.title || lrc.title,
      artist: p.artist || lrc.artist,
      text: same ? p.text : lrc.texts.join("\n"),
      secondText: hasSeconds ? lrc.seconds.join("\n") : p.secondText,
      lines: tapLines(lineTexts, lineSeconds, lrc.starts, end),
      synced: "lrc",
    }));
    setNote(
      same
        ? `Importado: los tiempos de ${file.name} sobre tu letra.`
        : `Importado: la letra y los tiempos salen de ${file.name} (${lrc.texts.length} líneas).`,
    );
  }

  // Keeps the second lines (romanization or translation) in step with the lyric lines.
  function setSecondText(secondText: string) {
    const list = splitLyrics(secondText);
    setPiece((p) => ({ ...p, secondText, lines: p.lines.map((l, i) => ({ ...l, second: list[i] ?? "" })) }));
  }

  async function aiSecond(mode: "romanize" | "translate") {
    const result = await work("second", () => api.secondLines(series.id, texts, mode, piece.secondLanguage, piece.secondOther));
    if (!result) return;
    setSecondText(result.lines.join("\n"));
    const check =
      mode === "romanize"
        ? "Revisá la romanización: la IA se puede equivocar con las lecturas."
        : piece.secondLanguage === "gn"
          ? "Las IAs traducen peor al guaraní: que la revise alguien que lo hable antes de publicar."
          : `Revisá la traducción al ${toLanguage.toLowerCase()}.`;
    setNote([check, result.note].filter(Boolean).join(" "));
  }

  function newElementId() {
    return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function freeElementSlot(elements: LyricElement[]): number {
    const used = new Set(elements.map((e) => e.slot));
    for (let i = 0; i < LYRIC_ELEMENT_SLOTS; i++) {
      const slot = LYRIC_ELEMENT_SLOT + i;
      if (!used.has(slot)) return slot;
    }
    throw new Error("Ya hay demasiadas imágenes en este video.");
  }

  async function forgetElementImage(slot: number) {
    if (slot < LYRIC_ELEMENT_SLOT) return;
    setElementImages((m) => {
      if (!m[slot]) return m;
      const next = { ...m };
      delete next[slot];
      return next;
    });
    if (projectId) await api.removeMedia(projectId, slot, "image").catch(() => undefined);
  }

  async function aiElements() {
    if (!piece.lines.length) return;
    if (piece.elements.length && !confirm("Esto reemplaza los elementos que ya cargaste.")) return;
    const result = await work("elements", () => api.lyricElements(series.id, piece.title, piece.artist, piece.lines.map((l) => l.text)));
    if (!result) return;
    const old = piece.elements.map((e) => e.slot);
    set({
      elements: result.elements.map((e) => ({ ...e, id: newElementId(), slot: 0 })),
    });
    for (const slot of old) await forgetElementImage(slot);
    setNote([result.note, "Revisá el verso y el texto de cada uno."].filter(Boolean).join(" "));
  }

  function addElement() {
    const line = 0;
    const words = piece.lines[line]?.text.split(/\s+/).slice(0, 2).join(" ") || "texto";
    setPiece((p) => ({
      ...p,
      elements: [
        ...p.elements,
        { id: newElementId(), label: words.slice(0, 40), motif: "heart", motion: "enter", place: "top", line, seconds: 3, slot: 0 },
      ],
    }));
  }

  function patchElement(id: string, patch: Partial<LyricElement>) {
    setPiece((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  async function removeElement(id: string) {
    const el = piece.elements.find((e) => e.id === id);
    setPiece((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
    if (el) await forgetElementImage(el.slot);
  }

  async function clearElementImage(id: string) {
    const el = piece.elements.find((e) => e.id === id);
    if (!el) return;
    patchElement(id, { slot: 0 });
    await forgetElementImage(el.slot);
  }

  async function elementImage(id: string, file: File) {
    await work("upload", async () => {
      const el = piece.elements.find((e) => e.id === id);
      if (!el) return;
      const svg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      let blob: Blob = file;
      if (svg) blob = await rasterSvg(await file.text());
      else if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Subí un PNG, un JPG o un SVG.");
      if (blob.size > 8_000_000) throw new Error("Esa imagen pesa más de 8 MB.");
      const img = new Image();
      img.src = await blobToDataUrl(blob);
      await img.decode();
      const slot = el.slot >= LYRIC_ELEMENT_SLOT ? el.slot : freeElementSlot(piece.elements);
      setElementImages((m) => ({ ...m, [slot]: img }));
      setPiece((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, slot } : e)) }));
      if (projectId) await api.uploadMedia(projectId, slot, "image", blob);
    });
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
    { id: "clock", label: "Reloj" },
    { id: "elements", label: "Elementos" },
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
        <div className="flex max-w-full flex-wrap rounded-lg border border-line bg-white p-0.5">
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
          <Field
            label="Letra"
            hint="Una línea por renglón, como se canta. Los renglones vacíos, las marcas como [Estribillo] o (x4) y los rótulos como «Chorus (Miku):» no se muestran."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={14}
              value={piece.text}
              onChange={(e) => set({ text: e.target.value })}
            />
          </Field>
          <Field
            label="Segunda línea (opcional)"
            hint="Va más chica debajo de cada línea: la romanización o la traducción al idioma de abajo. Una por renglón, en el mismo orden que la letra. Revisala."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={14}
              value={piece.secondText}
              onChange={(e) => setSecondText(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!texts.length || busy !== null} onClick={() => aiSecond("romanize")}>
                {busy === "second" ? <Spinner /> : null} Romanizar con IA
              </Button>
              <span className="flex flex-wrap items-center gap-1">
                <select
                  className={`${inputClass} w-auto! py-1 text-xs`}
                  aria-label="Idioma de la traducción"
                  value={piece.secondLanguage}
                  onChange={(e) => set({ secondLanguage: e.target.value as SecondLanguage })}
                >
                  {SECOND_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {SECOND_LANGUAGE_LABEL[l]}
                    </option>
                  ))}
                </select>
                {piece.secondLanguage === "otro" && (
                  <input
                    className={`${inputClass} w-36! py-1 text-xs`}
                    aria-label="Otro idioma"
                    placeholder="Ej.: alemán, quechua"
                    maxLength={40}
                    value={piece.secondOther}
                    onChange={(e) => set({ secondOther: e.target.value })}
                  />
                )}
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  disabled={!texts.length || !toLanguage || busy !== null}
                  onClick={() => aiSecond("translate")}
                >
                  Traducir con IA
                </Button>
              </span>
            </div>
          </Field>
          <div className="md:col-span-2">
            <Button onClick={() => setTab("sync")} disabled={missingSong.length > 0}>
              Seguir → sincronizar
            </Button>
            <span className="ml-3 text-sm text-muted">
              {texts.length} líneas
              {headers > 0 && ` · ${headers === 1 ? "salteé 1 rótulo" : `salteé ${headers} rótulos`} de sección`}
            </span>
            {missingSong.length > 0 && <span className="ml-3 text-sm font-medium text-amber-700">Falta {missingSong.join(" y ")}.</span>}
          </div>
        </div>
      )}

      {tab === "sync" && (
        <div className="space-y-4">
          {!song ? (
            <Notice tone="warn">Primero subí la canción (y pegá la letra, salvo que importes un .lrc).</Notice>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm font-semibold">Automático</p>
                  <p className="text-xs text-muted">
                    La IA escucha la canción y le pone tiempo a cada palabra de tu letra.
                    {piece.language === "gn" && " No conoce el guaraní: escucha sin idioma. Si sale mal, sincronizá tocando."}
                    {!autoSync && " Necesita OPENAI_API_KEY en .env."}
                  </p>
                  <Button onClick={autoSyncNow} disabled={!autoSync || busy !== null || !texts.length}>
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
                <div className="space-y-2 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm font-semibold">Importar .lrc</p>
                  <p className="text-xs text-muted">
                    Si ya tenés la letra sincronizada en un archivo .lrc. Si sus líneas coinciden con tu letra, usa tus líneas con sus
                    tiempos; si no, trae también la letra.
                  </p>
                  <input
                    type="file"
                    accept=".lrc,.txt,text/plain"
                    aria-label="Importar .lrc"
                    className="text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importLrc(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
              {stale && <Notice tone="warn">La letra cambió después de sincronizar: volvé a sincronizar.</Notice>}
              {piece.lines.length > 0 && (
                <LineEditor lines={piece.lines} onStart={setLineStart} onKey={toggleKey} onPlay={playFrom} />
              )}
              {piece.lines.length > 0 && (
                <Button onClick={() => setTab("elements")}>Seguir → elementos</Button>
              )}
            </>
          )}
        </div>
      )}

      {tab === "clock" && (
        <ClockPanel
          projectId={projectId}
          lyrics={piece.text}
          language={piece.language}
          song={song}
          brand={series.brand}
        />
      )}

      {tab === "elements" && (
        <LyricElements
          piece={piece}
          busy={busy !== null}
          suggesting={busy === "elements"}
          images={elementImages}
          onSuggest={() => void aiElements()}
          onAdd={addElement}
          onChange={patchElement}
          onRemove={(id) => void removeElement(id)}
          onImage={(id, file) => void elementImage(id, file)}
          onClearImage={(id) => void clearElementImage(id)}
          onNext={() => setTab("video")}
        />
      )}

      {tab === "video" && (
        <VideoTab
          piece={piece}
          song={song}
          beats={beats}
          audio={audioRef}
          bgImage={bgImage}
          bgClips={bgClips}
          layers={layers}
          elementImages={elementImages}
          onLayers={addLayers}
          onClearLayers={clearLayers}
          onRemoveClip={removeClip}
          onPrompts={() =>
            work("prompts", async () => {
              const result = await api.lyricBackgrounds(series.id, brief.tool, piece.title, texts, piece.style, piece.format);
              return result;
            })
          }
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
    if (!texts.length) {
      return (
        <div className="space-y-2 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-semibold">Tocando</p>
          <p className="text-xs text-muted">Primero pegá la letra en "Canción y letra".</p>
        </div>
      );
    }
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
};

function VideoTab(props: VideoTabProps) {
  const { piece, song, beats, audio, bgImage, bgClips, layers, elementImages, busy, set, setStyle } = props;
  const layerAssets: MotionAsset[] = useMemo(
    () => layers.map((img, k) => ({ image: img, width: img.naturalWidth, height: img.naturalHeight, name: `layer:${k}` })),
    [layers],
  );
  const glyphs: Record<number, ElementGlyph> = useMemo(() => {
    const out: Record<number, ElementGlyph> = {};
    for (const [slot, img] of Object.entries(elementImages)) {
      if (img.naturalWidth) out[Number(slot)] = { source: img, width: img.naturalWidth, height: img.naturalHeight };
    }
    return out;
  }, [elementImages]);
  const style = piece.style;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pieceRef = useRef(piece);
  pieceRef.current = piece;
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<(RenderResult & { url: string; format: LyricPiece["format"]; saved: string })[]>([]);
  const [prompts, setPrompts] = useState<BackgroundPrompts | null>(null);
  // The preview plays the background clips one after the other.
  const [clipIndex, setClipIndex] = useState(0);
  const clip = bgClips.length ? bgClips[clipIndex % bgClips.length] : null;
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
        drawLyricFrame(ctx, canvas.width, canvas.height, t, pieceRef.current, bg, beats, layerAssets, glyphs);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [audio, bgImage, beats, layerAssets, glyphs]);

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
        {clip && (
          <video
            ref={videoRef}
            key={clip.url}
            src={clip.url}
            muted
            loop={bgClips.length === 1}
            autoPlay
            playsInline
            onEnded={() => setClipIndex((i) => i + 1)}
            className="hidden"
          />
        )}
        <p className="text-center text-xs text-muted">La vista previa sigue al reproductor de arriba: dale play.</p>
      </div>

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

