// Lyric videos (series of type music): the song and its lyrics, the sync (automatic or tapping), and the look with a
// live preview and the final video. Autosaves into the project folder like a story piece.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LYRIC_ELEMENT_MAX,
  LYRIC_ELEMENT_SLOT,
  LYRIC_ELEMENT_SLOTS,
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
  type LyricPiece,
  type LyricStyle,
  type SecondLanguage,
} from "../../shared/lyrics.ts";
import { voiceStemHelps } from "../../shared/demucs.ts";
import { buildPlates } from "../../shared/plates.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { api, projectFileUrl, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { blobToDataUrl } from "../lib/files.ts";
import { lyricPulse } from "../../shared/lyricPulse.ts";
import { levelsFor, monoOf, wordLevels, wordSpans } from "../../shared/lyricAct.ts";
import { decodeSong, songBeats } from "../lib/lyricRender.ts";
import { rasterSvg } from "../lib/svgSanitize.ts";
import { ClockPanel } from "./ClockPanel.tsx";
import { LyricElements } from "./LyricElements.tsx";
import { LyricPlates } from "./LyricPlates.tsx";
import { audioDuration, type AudioFile } from "./Audio.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";
import { MAX_CLIPS, VideoTab, type BgClip } from "./LyricVideoTab.tsx";
import { TapSync, LineEditor } from "./LyricSync.tsx";

export type LyricOpen = { piece: LyricPiece; music: MediaFileRecord | null; media: Record<string, MediaRecord> };
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
  // The piece as last rendered: a measurement that took a while checks it before writing its levels back.
  const current = useRef(piece);
  current.current = piece;

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
    const spans = wordSpans(piece.lines);
    const result = await work("levels", () => api.lyricLevels(song.blob, song.name, spans));
    if (!result) return;
    if (!keepLevels(spans, result.levels)) return;
    setNote(`Medí la fuerza del canto en la voz que separó Demucs: ${result.levels.filter((x) => x !== null).length} palabras.`);
  }

  // Writes measured levels onto the current lines, never over them: when the words' times changed while measuring,
  // nothing is written and the note asks to measure again.
  function keepLevels(spans: { start: number; end: number }[], levels: (number | null)[]): boolean {
    if (!levelsFor(current.current.lines, spans, levels)) {
      setNote("Cambiaste los tiempos de la letra mientras medía la voz: no guardé la medición. Medila de nuevo.");
      return false;
    }
    setPiece((p) => {
      const lines = levelsFor(p.lines, spans, levels);
      return lines ? { ...p, lines } : p;
    });
    return true;
  }

  async function measureStem(file: File) {
    if (!piece.lines.length) return;
    await work("levels", async () => {
      const stem = await decodeSong(file);
      const channels = Array.from({ length: stem.numberOfChannels }, (_, c) => stem.getChannelData(c));
      const spans = wordSpans(piece.lines);
      const levels = wordLevels({ samples: monoOf(channels), sampleRate: stem.sampleRate }, spans);
      if (!keepLevels(spans, levels)) return;
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

