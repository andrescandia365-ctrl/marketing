// Lyric videos (series of type music): the song and its lyrics, the sync (automatic or tapping), and the look with a
// live preview and the final video. Autosaves into the project folder like a story piece.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  LYRIC_ELEMENT_MAX,
  LYRIC_ELEMENT_SLOT,
  LYRIC_ELEMENT_SLOTS,
  LYRIC_ENTRANCES,
  LYRIC_ENTRANCE_LABEL,
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
import { voiceStemHelps } from "../../shared/demucs.ts";
import { buildPlates } from "../../shared/plates.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { api, projectFileUrl, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { blobToDataUrl } from "../lib/files.ts";
import type { MotionAsset } from "../lib/motion.ts";
import { lyricPulse, pulseNote, type LyricPulse } from "../../shared/lyricPulse.ts";
import { actNote, monoOf, withLevels, wordLevels, wordSpans } from "../../shared/lyricAct.ts";
import { decodeSong, drawLyricFrame, loadLyricFonts, renderLyricVideo, songBeats, type Backdrop, type ElementGlyph } from "../lib/lyricRender.ts";
import { rasterSvg } from "../lib/svgSanitize.ts";
import { ClockPanel } from "./ClockPanel.tsx";
import { LyricElements } from "./LyricElements.tsx";
import { LyricPlates } from "./LyricPlates.tsx";
import { download, slug } from "../lib/markdown.ts";
import { mediaClock } from "../lib/playClock.ts";
import { CopyButton } from "./ScriptView.tsx";
import type { RenderResult } from "../lib/render.ts";
import { audioDuration, type AudioFile } from "./Audio.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

export type LyricOpen = { piece: LyricPiece; music: MediaFileRecord | null; media: Record<string, MediaRecord> };
// Background clips (Grok's or the person's own) play one after the other; each sits in a media slot of the project.
type BgClip = { slot: number; url: string; blob: Blob; name: string };
const MAX_CLIPS = 8;
const FRAME = 1 / 30;
const LAYER_BASE = 200;

type Props = {
  projectId: string | null;
  brief: Brief;
  series: SeriesInfo;
  initial: LyricOpen | null;
  autoSync: boolean;
  // Demucs is on this computer: the sync can hear the voice alone, and the Reloj splits a missing stem.
  demucs: boolean;
  projectsDir: string;
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
  onSeries: (series: SeriesInfo[]) => void;
};

type Tab = "song" | "sync" | "clock" | "plates" | "elements" | "video";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
// inputClass without its full width, for the small time fields.
const smallInput = inputClass.replace("w-full", "");
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function pieceMarkdown(piece: LyricPiece): string {
  return `# ♪ ${piece.title || "Sin título"}${piece.artist ? ` — ${piece.artist}` : ""}

Video de letra · ${LYRIC_LANGUAGE_LABEL[piece.language]} · ${piece.format === "vertical" ? "vertical 9:16" : "horizontal 16:9"}

${piece.plateOn && piece.plates.length ? `## Placas\n\n${piece.plates.map((p) => `- ${p.title}: ${p.motif}`).join("\n")}\n\n` : ""}${piece.elements.length ? `## Elementos\n\n${piece.elements.map((e) => `- verso ${e.line + 1} · ${e.label} · ${e.seconds}s`).join("\n")}\n\n` : ""}## Letra sincronizada (.lrc)

\`\`\`
${toLrc(piece)}
\`\`\`
`;
}

export function LyricStudio({ projectId, brief, series, initial, autoSync, demucs, projectsDir, onSaveStatus, onSeries }: Props) {
  const [piece, setPiece] = useState<LyricPiece>(() => {
    const base = initial ? { ...newLyricPiece(series.lyricStyle, brief.format), ...initial.piece } : newLyricPiece(series.lyricStyle, brief.format);
    const secondLanguage: SecondLanguage = (SECOND_LANGUAGES as readonly string[]).includes(base.secondLanguage) ? base.secondLanguage : "es";
    return {
      ...base,
      elements: base.elements ?? [],
      plates: base.plates ?? [],
      plateOn: base.plateOn ?? false,
      plateNote: base.plateNote ?? "",
      // On for new pieces; a piece saved with lyrics before the switch keeps the video it had until it is turned on.
      act: initial ? (initial.piece.act ?? !initial.piece.lines?.length) : true,
      secondLanguage,
      secondOther: base.secondOther ?? "",
    };
  });
  const [tab, setTab] = useState<Tab>(initial?.piece.lines.length ? "video" : "song");
  const [song, setSong] = useState<AudioFile | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  // Grok's separated layers, back to front (project media slots 200 + n).
  const [layers, setLayers] = useState<HTMLImageElement[]>([]);
  const [elementImages, setElementImages] = useState<Record<number, HTMLImageElement>>({});
  const [bgClips, setBgClips] = useState<BgClip[]>([]);
  const [busy, setBusy] = useState<null | "sync" | "ideas" | "second" | "elements" | "plates" | "render" | "upload" | "style" | "prompts" | "lrc" | "levels">(null);
  // The Reloj's grid. Plate cuts use its downbeats, and never peaks off the master; the pulse uses its kicks.
  const [grid, setGrid] = useState<{ usable: boolean; kicks: number[]; downbeats: number[] } | null>(null);
  const cuts = useMemo(() => (grid?.usable && grid.downbeats.length ? grid.downbeats : []), [grid]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // The automatic sync hears the vocal stem Demucs splits (worth it when the music covers the voice).
  const [voiceOnly, setVoiceOnly] = useState(false);
  // How much of the lyrics the last automatic sync really heard, when it was too little.
  const [heardShare, setHeardShare] = useState<{ matched: number; total: number; voiceOnly: boolean } | null>(null);
  // How far "Correr toda la letra" has moved this visit. It lives here so a tab change does not reset the slider.
  const [nudge, setNudge] = useState(0);
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
  // The master's peaks only matter while there is no kick grid (shared/lyricPulse.ts).
  const kickGrid = !!(grid?.usable && grid.kicks.length);
  const masterBeats = useMemo(() => (buffer && !kickGrid ? songBeats(buffer) : []), [buffer, kickGrid]);
  const beats = useMemo(() => lyricPulse(masterBeats, grid), [masterBeats, grid]);

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

  // Plate cuts read the Reloj. Opening Placas or the video picks up a grid that was just written.
  useEffect(() => {
    if (!projectId || (tab !== "plates" && tab !== "video")) return;
    let cancel = false;
    api
      .readClock(projectId)
      .then((found) => {
        if (cancel) return;
        const g = found?.sync.grid;
        setGrid(g ? { usable: g.usable, kicks: g.kicks ?? [], downbeats: g.downbeats ?? [] } : null);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [projectId, tab]);

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
      setHeardShare(null);
      if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
    });
  }

  // A photo replaces everything; videos add up (up to MAX_CLIPS) and play in order.
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
    const separated = demucs && voiceOnly;
    const result = await work("sync", () => api.syncLyrics(song.blob, song.name, texts, seconds, piece.language, separated));
    if (!result) return;
    set({ lines: result.lines, synced: "auto" });
    setNudge(0);
    setHeardShare(voiceStemHelps(result.matched, result.total) ? { matched: result.matched, total: result.total, voiceOnly: separated } : null);
    setNote(
      `Sincronizado${separated ? " sobre la voz separada" : ""}: encontró ${result.matched} de ${result.total} palabras de la letra (las demás quedan entre sus vecinas). Revisá los tiempos abajo.`,
    );
  }

  // "La letra actúa el canto": each word's loudness on the voice alone. Demucs splits it on the server (cached per song);
  // an uploaded vocal stem is read here. The master is never measured.
  async function measureWithDemucs() {
    if (!song || !piece.lines.length) return;
    const result = await work("levels", () => api.lyricLevels(song.blob, song.name, wordSpans(piece.lines)));
    if (!result) return;
    const lines = withLevels(piece.lines, result.levels);
    set({ lines });
    setNote(`Medí la fuerza del canto en la voz que separó Demucs: ${result.levels.filter((x) => x !== null).length} palabras.`);
  }

  async function measureStem(file: File) {
    if (!piece.lines.length) return;
    await work("levels", async () => {
      const stem = await decodeSong(file);
      const channels = Array.from({ length: stem.numberOfChannels }, (_, c) => stem.getChannelData(c));
      const levels = wordLevels({ samples: monoOf(channels), sampleRate: stem.sampleRate }, wordSpans(piece.lines));
      set({ lines: withLevels(piece.lines, levels) });
      const off = buffer && Math.abs(buffer.duration - stem.duration) > 1;
      setNote(
        `Medí la fuerza del canto en el stem de voz: ${levels.filter((x) => x !== null).length} palabras.` +
          (off ? " Ojo: el stem no dura lo mismo que la canción; tiene que empezar en el mismo segundo." : ""),
      );
    });
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
    setNudge(0);
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

  function armPlates() {
    if (!piece.lines.length) return;
    if (piece.plates.length && !confirm("Esto reemplaza las placas que ya armaste.")) return;
    set({ plates: buildPlates(piece.text, piece.lines.map((line) => line.text)), plateOn: true });
  }

  async function aiPlates() {
    if (!piece.lines.length) return;
    if (piece.plates.length && !confirm("Esto reemplaza las placas que ya armaste.")) return;
    const result = await work("plates", () =>
      api.lyricPlates(
        series.id,
        piece.title,
        piece.artist,
        piece.lines.map((line) => line.text),
        piece.plateNote,
        piece.plates,
      ),
    );
    if (!result) return;
    set({ plates: result.plates, plateOn: true, plateNote: piece.plateNote || result.idea });
    setNote([result.idea, result.note, "Revisá el motivo de cada placa."].filter(Boolean).join(" "));
  }

  function addElement() {
    const line = 0;
    const words = piece.lines[line]?.text.split(/\s+/).slice(0, 2).join(" ") || "texto";
    setPiece((p) => ({
      ...p,
      elements:
        p.elements.length >= LYRIC_ELEMENT_MAX
          ? p.elements
          : [
              ...p.elements,
              {
                id: newElementId(),
                label: words.slice(0, 40),
                motif: "heart",
                motion: "beat",
                place: (["top", "left", "right"] as const)[p.elements.length % 3],
                line,
                seconds: 3,
                slot: 0,
              },
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

  // Moves every line by the same amount. Words keep their place inside the line.
  function shiftLines(delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setPiece((p) => ({
      ...p,
      lines: p.lines.map((line) => {
        const start = Math.max(0, line.start + delta);
        const end = Math.max(start + 0.2, line.end + (start - line.start));
        return retimeLine(line, start, end);
      }),
    }));
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
    { id: "plates", label: "Placas" },
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
              onClick={() => {
                setError("");
                setTab(t.id);
              }}
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
                  {demucs && (
                    <label className="flex items-start gap-2 text-xs">
                      <input type="checkbox" className="mt-0.5" checked={voiceOnly} onChange={(e) => setVoiceOnly(e.target.checked)} />
                      <span>
                        Escuchar solo la voz (Demucs). Conviene cuando la música tapa la voz; la primera vez tarda unos minutos y la separación
                        queda guardada para el Reloj.
                      </span>
                    </label>
                  )}
                  <Button onClick={autoSyncNow} disabled={!autoSync || busy !== null || !texts.length}>
                    {busy === "sync" ? (
                      <>
                        <Spinner /> {demucs && voiceOnly ? "Separando la voz y escuchando…" : "Escuchando la canción…"}
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
                    setNudge(0);
                    setHeardShare(null);
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
              {heardShare && (
                <Notice tone="warn">
                  La transcripción encontró solo {heardShare.matched} de {heardShare.total} palabras de la letra: la música probablemente tapa la
                  voz.{" "}
                  {heardShare.voiceOnly
                    ? "Ya escuchó la voz separada: revisá los tiempos abajo o sincronizá tocando."
                    : demucs
                      ? "Probá de nuevo con «Escuchar solo la voz (Demucs)»."
                      : "Con Demucs instalado en esta compu, la app separa la voz antes de escuchar (Modelos → Demucs dice cómo). Mientras, sincronizá tocando."}
                </Notice>
              )}
              {stale && <Notice tone="warn">La letra cambió después de sincronizar: volvé a sincronizar.</Notice>}
              {piece.lines.length > 0 && (
                <LineEditor
                  lines={piece.lines}
                  duration={Math.max(song.duration || 0, 1)}
                  nudge={nudge}
                  onNudge={setNudge}
                  onStart={setLineStart}
                  onShift={shiftLines}
                  onKey={toggleKey}
                  onPlay={playFrom}
                />
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
          demucs={demucs}
        />
      )}

      {tab === "plates" && (
        <LyricPlates
          piece={piece}
          cuts={cuts}
          busy={busy !== null}
          suggesting={busy === "plates"}
          onChange={(plates) => set({ plates })}
          onNote={(plateNote) => set({ plateNote })}
          onToggle={(plateOn) => set({ plateOn })}
          onBuild={armPlates}
          onAsk={() => void aiPlates()}
          onSeek={playFrom}
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
          cuts={cuts}
          grid={grid}
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
          demucs={demucs}
          onMeasureDemucs={() => void measureWithDemucs()}
          onMeasureStem={(file) => void measureStem(file)}
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

function stamp(t: number) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

// One lane per line that overlaps another, so a long song does not stack every block on the same pixel.
function lineLanes(lines: { start: number; end: number }[]): number[] {
  const laneEnd: number[] = [];
  return lines.map((l) => {
    let lane = laneEnd.findIndex((end) => end <= l.start + 0.02);
    if (lane < 0) {
      lane = laneEnd.length;
      laneEnd.push(l.end);
    } else laneEnd[lane] = l.end;
    return lane;
  });
}

function LineEditor({
  lines,
  duration,
  nudge,
  onNudge,
  onStart,
  onShift,
  onKey,
  onPlay,
}: {
  lines: LyricLine[];
  duration: number;
  nudge: number;
  onNudge: (n: number) => void;
  onStart: (i: number, start: number) => void;
  onShift: (delta: number) => void;
  onKey: (line: number, word: number) => void;
  onPlay: (t: number) => void;
}) {
  const [picked, setPicked] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const i = Math.min(picked, Math.max(0, lines.length - 1));
  const line = lines[i];
  const span = Math.max(duration, ...lines.map((l) => l.end), 1);
  const lanes = lineLanes(lines);
  const rows = lanes.length ? Math.max(...lanes) + 1 : 1;
  const px = 96;

  useEffect(() => {
    trackRef.current?.querySelector(`[data-line="${i}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [i]);

  // The slider and the buttons share one offset, clamped to ±4 s, so they cannot drift apart.
  function applyNudge(next: number) {
    const clamped = Math.max(-4, Math.min(4, Math.round(next * 1000) / 1000));
    const delta = Math.round((clamped - nudge) * 1000) / 1000;
    onNudge(clamped);
    if (delta !== 0) onShift(delta);
  }

  function dragLine(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const originX = event.clientX;
    const origin = lines[index].start;
    const width = track.getBoundingClientRect().width || 1;
    setPicked(index);
    const move = (ev: PointerEvent) => onStart(index, Math.max(0, Math.min(span, origin + ((ev.clientX - originX) / width) * span)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Correr toda la letra</p>
          <p className="font-mono text-xs text-muted">{nudge >= 0 ? "+" : ""}{nudge.toFixed(2)} s</p>
        </div>
        <input
          type="range"
          min={-4}
          max={4}
          step={FRAME}
          aria-label="Correr toda la letra"
          className="h-10 w-full cursor-ew-resize accent-ink"
          value={nudge}
          onChange={(e) => applyNudge(Number(e.target.value))}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - 0.5)}>−0.5 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - 0.1)}>−0.1 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - FRAME)}>−1 cuadro</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + FRAME)}>+1 cuadro</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + 0.1)}>+0.1 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + 0.5)}>+0.5 s</Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-muted">Arrastrá una línea en la canción. El slider de abajo afina la que está elegida, de a un cuadro.</p>
        <div ref={trackRef} className="overflow-x-auto rounded-lg bg-paper">
          <div className="relative" style={{ width: Math.max(span * px, 280), height: rows * 40 + 8 }}>
            {lines.map((l, n) => (
              <button
                key={n}
                type="button"
                data-line={n}
                title={`${n + 1}. ${l.text}`}
                aria-label={`Mover la línea ${n + 1}`}
                className={`absolute truncate rounded px-1.5 text-left text-[11px] leading-8 ${n === i ? "z-10 bg-ink text-white" : "bg-ink/15 text-ink hover:bg-ink/25"}`}
                style={{ left: l.start * px, width: Math.max(44, (l.end - l.start) * px), top: 4 + lanes[n] * 40, height: 32 }}
                onPointerDown={(e) => dragLine(n, e)}
              >
                {n + 1}. {l.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {line && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold">Línea {i + 1} · {line.text}</p>
            <p className="shrink-0 font-mono text-xs text-muted">{stamp(line.start)}</p>
          </div>
          <input
            type="range"
            min={0}
            max={span}
            step={FRAME}
            aria-label={`Empieza la línea ${i + 1}`}
            className="h-12 w-full cursor-ew-resize accent-ink"
            value={Math.min(span, line.start)}
            onChange={(e) => onStart(i, Number(e.target.value))}
          />
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" title="Escuchar desde acá" onClick={() => onPlay(Math.max(0, line.start - 0.4))}>▶</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start - FRAME)}>−1 cuadro</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start - 0.1)}>−0.1</Button>
            <input
              type="number"
              step={0.01}
              min={0}
              aria-label={`Segundos de la línea ${i + 1}`}
              className={`${smallInput} w-24 px-2 py-1 font-mono text-xs`}
              value={Number(line.start.toFixed(2))}
              onChange={(e) => onStart(i, Number(e.target.value))}
            />
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start + 0.1)}>+0.1</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start + FRAME)}>+1 cuadro</Button>
          </div>
        </div>
      )}

      <ol className="divide-y divide-line border-t border-line">
        {lines.map((l, n) => (
          <li key={n} className={`flex flex-wrap items-center gap-3 py-2 ${n === i ? "bg-paper/80" : ""}`}>
            <button type="button" className="w-16 shrink-0 text-left font-mono text-xs text-muted" onClick={() => setPicked(n)}>
              {stamp(l.start)}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                {l.words.map((w, wi) => (
                  <button
                    key={wi}
                    type="button"
                    onClick={() => {
                      setPicked(n);
                      onKey(n, wi);
                    }}
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
      <p className="text-xs text-muted">Tocá una palabra para que salga más grande. Un cuadro es 1/30 de segundo.</p>
    </div>
  );
}

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

function VideoTab(props: VideoTabProps) {
  const { piece, song, beats, cuts, audio, bgImage, bgClips, layers, elementImages, busy, set, setStyle } = props;
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

  // The live preview follows the song player, through a smooth clock: the player's own time moves in steps.
  useEffect(() => {
    let frame = 0;
    const clock = mediaClock();
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const t = clock(audio.current);
        const video = videoRef.current;
        let bg: Backdrop = null;
        if (video && video.readyState >= 2) bg = { source: video, width: video.videoWidth, height: video.videoHeight };
        else if (bgImage) bg = { source: bgImage, width: bgImage.naturalWidth, height: bgImage.naturalHeight };
        drawLyricFrame(ctx, canvas.width, canvas.height, t, pieceRef.current, bg, beats, layerAssets, glyphs, cuts);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [audio, bgImage, beats, cuts, layerAssets, glyphs]);

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

