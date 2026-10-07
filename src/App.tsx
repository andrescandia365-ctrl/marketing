import { useEffect, useRef, useState } from "react";
import { DEFAULT_AUDIO, voiceModeOf, type AudioSettings, type CharacterVoice, type VoiceMode } from "../shared/audio.ts";
import { boardProblems, fixNote, storyProblems, type Problem } from "../shared/checks.ts";
import { SKETCH_BASE, buildCopyPrompt } from "../shared/prompt.ts";
import { EMPTY_BRIEF, EXAMPLE_BRIEF } from "../shared/example.ts";
import { migrateBoard, migrateStory, type Board, type Brief, type HookVariant, type Menu, type Setup, type Shot, type Status, type Story, type TopicIdea } from "../shared/schema.ts";
import { DEFAULT_TEXT_STYLE, castRef, hasLook, seriesId, type CastMember, type TextStyle } from "../shared/series.ts";
import { BEAT_INFO, formatTime, timeShots } from "../shared/template.ts";
import { VoicesPanel, audioDuration, type AudioFile } from "./components/Audio.tsx";
import { BoardView } from "./components/BoardView.tsx";
import { BriefForm } from "./components/BriefForm.tsx";
import { MenuPicker } from "./components/MenuPicker.tsx";
import { LyricStudio, type LyricOpen } from "./components/LyricStudio.tsx";
import { ModelsPanel } from "./components/ModelsPanel.tsx";
import { MotionStudio, type MotionOpen } from "./components/MotionStudio.tsx";
import { NarrationImport } from "./components/NarrationImport.tsx";
import { ProductPanel } from "./components/ProductPanel.tsx";
import { ProjectsPanel } from "./components/ProjectsPanel.tsx";
import { SeriesEditor } from "./components/SeriesEditor.tsx";
import {
  CopyButton,
  DirectionLog,
  ScriptView,
  SetupsPanel,
  StoryNotes,
  Timeline,
  type ClipFile,
  type LibraryEntry,
  type MediaState,
} from "./components/ScriptView.tsx";
import { StoryView } from "./components/StoryView.tsx";
import { WritersRoom } from "./components/WritersRoom.tsx";
import { HookVariants } from "./components/HookVariants.tsx";
import { MOVE_LABEL } from "../shared/moves.ts";
import { AdsStudio } from "./components/ads/AdsStudio.tsx";
import type { RoomCard } from "../shared/room.ts";
import { VideoPanel } from "./components/VideoPanel.tsx";
import { Button, Notice, PieceTitle, Spinner } from "./components/ui.tsx";
import { ads as adsApi, api, libraryFileUrl, projectFileUrl, type ProjectSummary } from "./lib/api.ts";
import { blobToDataUrl, pictureForReview, readImageFile } from "./lib/files.ts";
import { download, pieceToMarkdown, slug, storyToMarkdown, type LogEntry } from "./lib/markdown.ts";

// "lyrics": a lyric video (series of type music), with its own steps inside.
// "motion": a motion-graphics explainer (software or one product).
type Step = "brief" | "menu" | "story" | "board" | "production" | "lyrics" | "motion";

// What a project folder's project.json holds (media files are tracked by the server).
type SavedState = {
  version: 1;
  step: Step;
  pieceBrief: Brief;
  menu: Menu | null;
  demo: boolean;
  story: Story | null;
  storyRound: number;
  board: Board | null;
  boardRound: number;
  boardApproved: boolean;
  log: LogEntry[];
  startedAt: number;
  // Check problems the person marked "no es un problema".
  dismissed: string[];
  audio: AudioSettings;
  // The last five hook variants (PLAYBOOK §3), if any were written.
  hookVariants?: HookVariant[] | null;
};

const BRIEF_KEY = "playbook-studio.brief.v2";
// The two sections of the app: Playbook (organic content with a story) and Publicidad (paid ads, Método 50-5-3).
type Section = "playbook" | "ads";
const SECTION_KEY = "playbook-studio.section";
function loadSection(): Section {
  try {
    return localStorage.getItem(SECTION_KEY) === "ads" ? "ads" : "playbook";
  } catch {
    return "playbook";
  }
}

function loadBrief(): Brief {
  try {
    const saved = localStorage.getItem(BRIEF_KEY);
    if (saved) return { ...EMPTY_BRIEF, ...JSON.parse(saved) };
  } catch {
    // Storage unavailable (private window): start empty.
  }
  return EMPTY_BRIEF;
}

function clipDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("No se pudo leer ese video. Probá con un .mp4."));
    video.src = url;
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [section, setSection] = useState<Section>(loadSection);
  const [hookVariants, setHookVariants] = useState<HookVariant[] | null>(null);
  const [writingHooks, setWritingHooks] = useState(false);
  const [sent, setSent] = useState("");
  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState<Brief>(loadBrief);
  // The brief the current piece was written from; later steps use it even if the form changes.
  const [pieceBrief, setPieceBrief] = useState<Brief>(brief);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [storyRound, setStoryRound] = useState(1);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardRound, setBoardRound] = useState(1);
  const [boardApproved, setBoardApproved] = useState(false);
  const [demo, setDemo] = useState(false);
  const [media, setMedia] = useState<Record<number, MediaState>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO);
  const [music, setMusic] = useState<AudioFile | null>(null);
  const logStart = useRef(Date.now());
  const clipUrls = useRef<string[]>([]);
  const [provider, setProvider] = useState("placeholder");
  const [busy, setBusy] = useState<
    null | "menu" | "story" | "revise" | "fixStory" | "board" | "reviseBoard" | "fixBoard" | "open"
  >(null);
  const [error, setError] = useState("");
  // undefined: not editing; null: a new series; a string: that series.
  // Kept for this tab, so a reload while a puppet upload is in flight comes back to Editar serie.
  const [editingSeries, setEditingSeries] = useState<string | null | undefined>(() => {
    try {
      const saved = sessionStorage.getItem("playbook-editing-series");
      if (saved === null) return undefined;
      return saved === "" ? null : saved;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    try {
      if (editingSeries === undefined) sessionStorage.removeItem("playbook-editing-series");
      else sessionStorage.setItem("playbook-editing-series", editingSeries ?? "");
    } catch {
      // The tab can refuse storage. The editor still works for this visit.
    }
  }, [editingSeries]);

  // The open lyric video, if this piece is one; `key` remounts it for another piece.
  const [lyric, setLyric] = useState<{ key: string; initial: LyricOpen | null } | null>(null);
  const [motion, setMotion] = useState<{ key: string; initial: MotionOpen | null } | null>(null);
  // The project folder this piece autosaves into.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  // The writers' room: other pieces of this series, and the note this piece will pick up.
  const [room, setRoom] = useState<RoomCard[]>([]);
  const [roomNotes, setRoomNotes] = useState<string[]>([]);
  const [seed, setSeed] = useState<{ id: number; text: string; on: boolean } | null>(null);
  // Bumped when an approved image is replaced, so the browser shows the new file under the same name.
  const [libraryVersion, setLibraryVersion] = useState(Date.now());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const unsaved = useRef(false);
  const uploads = useRef(0);
  const saveSeq = useRef(0);

  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        const real = s.imageProviders.find((p) => p.available && p.id !== "placeholder");
        if (real) setProvider(real.id);
        // A saved brief may name a tool or series whose file was removed.
        setBrief((b) => ({
          ...b,
          tool: s.tools.some((t) => t.id === b.tool) ? b.tool : (s.tools[0]?.id ?? b.tool),
          series: s.series.some((x) => x.id === b.series) ? b.series : (s.series[0]?.id ?? b.series),
        }));
      })
      .catch((e) => setError(message(e)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
    } catch {
      // Not critical.
    }
  }, [brief]);

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_KEY, section);
    } catch {
      // Not critical.
    }
  }, [section]);

  // PLAYBOOK §3: five hook variants for the story, each with its move and the viewer's awareness level.
  async function writeHookVariants() {
    if (!story) return;
    setError("");
    setWritingHooks(true);
    try {
      const result = await api.storyHooks(pieceBrief, story);
      setHookVariants(result.variants);
      addLog({ text: "5 variantes de gancho", outcome: result.demo ? "de muestra (sin clave de IA)" : result.variants.map((v) => MOVE_LABEL[v.move]).join(" · ") });
    } catch (e) {
      setError(message(e));
    } finally {
      setWritingHooks(false);
    }
  }

  function pickHookVariant(variant: HookVariant) {
    if (!story) return;
    addLog({ text: `Gancho cambiado: “${story.title}” → “${variant.title}”`, outcome: `${MOVE_LABEL[variant.move]}, N${variant.level}` });
    setStory({ ...story, title: variant.title });
  }

  // The five go to Publicidad as pending hooks, each with its awareness level and its move in the note.
  async function sendHookVariants(variants: HookVariant[]): Promise<number> {
    setError("");
    let sentCount = 0;
    for (const v of variants) {
      try {
        await adsApi.organicHook(pieceBrief.series, v.title, v.level, 15, `Variante de gancho del Playbook · ${MOVE_LABEL[v.move]} · ${story?.problem || "historia"}`);
        sentCount++;
      } catch (e) {
        setError(`Se mandaron ${sentCount} de ${variants.length} a Publicidad: ${message(e)}`);
        break;
      }
    }
    if (sentCount) addLog({ text: `${sentCount} variantes de gancho enviadas a Publicidad` });
    return sentCount;
  }

  // "Enviar a Publicidad": the story's hook title (and its problem) go to the series' hook catalogue, pending approval.
  async function sendToAds() {
    if (!story) return;
    setError("");
    try {
      await adsApi.organicHook(pieceBrief.series, story.title, 2, 15, `Del Playbook: ${story.problem || "historia"}`);
      setSent(story.title);
      addLog({ text: `Enviado a Publicidad como hook: “${story.title}”` });
    } catch (e) {
      setError(message(e));
    }
  }

  useEffect(() => () => clipUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const refreshProjects = () =>
    api
      .projects()
      .then((r) => setProjects(r.projects))
      .catch(() => undefined);

  useEffect(() => {
    if (step === "brief") refreshProjects();
  }, [step]);

  // The board reads the other saved pieces of the series. The open piece stays off it.
  useEffect(() => {
    const seriesId = step === "brief" ? brief.series : pieceBrief.series;
    const info = status?.series.find((s) => s.id === seriesId);
    const visible =
      !!info &&
      info.type !== "music" &&
      !lyric &&
      !motion &&
      (step === "menu" || step === "story" || step === "board" || (step === "brief" && brief.piece === "story" && editingSeries === undefined));
    if (!visible) return;
    let cancel = false;
    api
      .room(seriesId, projectId ?? "")
      .then((r) => {
        if (!cancel) setRoom(r.cards);
      })
      .catch(() => {
        if (!cancel) setRoom([]);
      });
    return () => {
      cancel = true;
    };
  }, [step, brief.series, brief.piece, pieceBrief.series, projectId, lyric, motion, status, editingSeries]);

  // Warn before closing the tab while a save or an upload is still on its way.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (unsaved.current || uploads.current > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const toolName = status?.tools.find((t) => t.id === pieceBrief.tool)?.name ?? "la herramienta";
  const pieceSeries = status?.series.find((s) => s.id === pieceBrief.series);
  const library: Record<string, LibraryEntry> = Object.fromEntries(
    (pieceSeries?.cast ?? []).map((m) => [
      m.id,
      { ...m, url: m.image ? libraryFileUrl(pieceSeries!.id, m.image, libraryVersion) : undefined },
    ]),
  );
  const currentSeries = status?.series.find((s) => s.id === brief.series);
  const needsProduct = Boolean(currentSeries?.productPerEpisode) && !brief.product.trim();

  // Autosave: a short pause after any change writes the state (and pieza.md) into the project folder.
  useEffect(() => {
    // Lyric videos and explainers save themselves.
    if (!projectId || lyric || motion) return;
    unsaved.current = true;
    setSaveStatus("saving");
    const seq = ++saveSeq.current;
    const timer = setTimeout(async () => {
      const state: SavedState = {
        version: 1,
        step,
        pieceBrief,
        menu,
        demo,
        story,
        storyRound,
        board,
        boardRound,
        boardApproved,
        log,
        startedAt: logStart.current,
        dismissed,
        audio,
        hookVariants,
      };
      const markdown =
        story && board ? pieceToMarkdown(pieceBrief, story, board, toolName, log, audio) : story ? storyToMarkdown(story) : undefined;
      try {
        await api.saveProject(projectId, state, markdown);
        if (seq === saveSeq.current) {
          unsaved.current = false;
          setSaveStatus("saved");
        }
      } catch (e) {
        if (seq === saveSeq.current) {
          setSaveStatus("error");
          setError(`No se pudo guardar el proyecto: ${message(e)}`);
        }
      }
    }, 800);
    return () => clearTimeout(timer);
    // toolName only changes with the brief or the status, which are covered.
  }, [projectId, lyric, motion, step, pieceBrief, menu, demo, story, storyRound, board, boardRound, boardApproved, log, dismissed, audio, hookVariants]);

  function addLog(entry: Omit<LogEntry, "at">) {
    setLog((l) => [...l, { ...entry, at: Date.now() - logStart.current }]);
  }

  function setShotMedia(index: number, patch: Partial<MediaState>) {
    setMedia((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  // Sends a file to the project folder; the shot shows an error if it could not be saved.
  async function keep(index: number, work: (id: string) => Promise<unknown>) {
    if (!projectId) return;
    uploads.current++;
    try {
      await work(projectId);
    } catch (e) {
      setShotMedia(index, { error: `No se guardó en el proyecto: ${message(e)}` });
    } finally {
      uploads.current--;
    }
  }

  async function run<T>(kind: NonNullable<typeof busy>, work: () => Promise<T>): Promise<T | null> {
    setError("");
    setBusy(kind);
    try {
      return await work();
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  function resetPiece() {
    clipUrls.current.forEach((u) => URL.revokeObjectURL(u));
    clipUrls.current = [];
    setMenu(null);
    setStory(null);
    setStoryRound(1);
    setBoard(null);
    setBoardRound(1);
    setBoardApproved(false);
    setMedia({});
    setLog([]);
    setDismissed([]);
    setAudio(DEFAULT_AUDIO);
    setMusic(null);
    setLyric(null);
    setMotion(null);
    setRoomNotes([]);
    setSeed(null);
    setHookVariants(null);
    logStart.current = Date.now();
  }

  function newPiece() {
    resetPiece();
    setProjectId(null);
    setSaveStatus("idle");
    setStep("brief");
  }

  async function openProject(id: string) {
    const project = await run("open", () => api.project(id));
    if (!project) return;
    const st = project.state as Partial<SavedState> & { kind?: string; lyrics?: LyricOpen["piece"]; motion?: MotionOpen["piece"] };
    resetPiece();
    const pb = { ...EMPTY_BRIEF, ...(st.pieceBrief ?? brief) };
    setBrief(pb);
    setPieceBrief(pb);
    if (st.kind === "motion" && st.motion) {
      setProjectId(id);
      setMotion({ key: id, initial: { piece: st.motion, media: project.media, music: project.music } });
      setStep("motion");
      return;
    }
    if (st.kind === "lyrics" && st.lyrics) {
      setProjectId(id);
      setLyric({ key: id, initial: { piece: st.lyrics, music: project.music, media: project.media } });
      setStep("lyrics");
      return;
    }
    setMenu(st.menu ?? null);
    setDemo(st.demo ?? false);
    setStory(st.story ? migrateStory(st.story) : null);
    setStoryRound(st.storyRound ?? 1);
    setBoard(st.board ? migrateBoard(st.board) : null);
    setBoardRound(st.boardRound ?? 1);
    setBoardApproved(st.boardApproved ?? false);
    setLog(st.log ?? []);
    setDismissed(st.dismissed ?? []);
    setAudio({ ...DEFAULT_AUDIO, ...(st.audio ?? {}) });
    setHookVariants(st.hookVariants ?? null);
    logStart.current = st.startedAt ?? Date.now();
    setProjectId(id);
    setStep(st.step ?? "brief");
    // Images and clips come back from the folder.
    for (const [key, record] of Object.entries(project.media)) {
      const index = Number(key);
      if (record.image) {
        fetch(projectFileUrl(id, record.image))
          .then((r) => r.blob())
          .then(blobToDataUrl)
          .then((image) => setShotMedia(index, { image }))
          .catch(() => setShotMedia(index, { error: "No se pudo leer la imagen guardada." }));
      }
      for (const kind of ["clip", "voice", "sfx"] as const) {
        const saved = record[kind];
        if (!saved) continue;
        fetch(projectFileUrl(id, saved.file))
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            clipUrls.current.push(url);
            setShotMedia(index, { [kind]: { url, blob, name: saved.name, duration: saved.duration } });
          })
          .catch(() => setShotMedia(index, { error: "No se pudo leer un archivo guardado de esta toma." }));
      }
    }
    if (project.music) {
      const { file, name, duration } = project.music;
      fetch(projectFileUrl(id, file))
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          clipUrls.current.push(url);
          setMusic({ url, blob, name, duration });
        })
        .catch(() => setError("No se pudo leer la música guardada."));
    }
  }

  async function removeProject(project: ProjectSummary) {
    if (!confirm(`¿Borrar "${project.title}" y su carpeta (imágenes, clips, video)? No se puede deshacer.`)) return;
    try {
      await api.deleteProject(project.id);
      if (project.id === projectId) newPiece();
      refreshProjects();
    } catch (e) {
      setError(message(e));
    }
  }

  // A lyric video or an explainer: its own project folder, then its studio.
  async function startStudio(kind: "lyrics" | "motion") {
    resetPiece();
    setError("");
    setPieceBrief(brief);
    let id: string | null = null;
    try {
      id = (await api.createProject(brief.series)).id;
    } catch (e) {
      setError(`Se puede seguir, pero no se pudo crear la carpeta del proyecto: ${message(e)}`);
    }
    setProjectId(id);
    const open = { key: id ?? String(Date.now()), initial: null };
    if (kind === "lyrics") setLyric(open);
    else setMotion(open);
    setStep(kind);
  }

  // Step 1 → menu. A new piece gets its own project folder.
  async function openMenu() {
    const result = await run("menu", () => api.menu(brief));
    if (!result) return;
    const reuse = projectId && !story ? projectId : null;
    resetPiece();
    setPieceBrief(brief);
    setMenu(result);
    setDemo(result.demo);
    setStep("menu");
    if (reuse) return;
    try {
      const { id } = await api.createProject(brief.series);
      setProjectId(id);
    } catch (e) {
      setProjectId(null);
      setError(`Se puede seguir, pero no se pudo crear la carpeta del proyecto: ${message(e)}`);
    }
  }

  // Step 2 → story
  function retake(text: string) {
    const has = roomNotes.includes(text);
    setRoomNotes(has ? roomNotes.filter((n) => n !== text) : [...roomNotes, text]);
    if (step === "story") setSeed({ id: Date.now(), text, on: !has });
  }

  async function writeStory(topics: TopicIdea[]) {
    const note = roomNotes.join("\n");
    const result = await run("story", () => api.story(pieceBrief, topics, note, projectId ?? ""));
    if (!result) return;
    setStory(result.story);
    setStoryRound(1);
    setBoard(null);
    setBoardApproved(false);
    setDemo(result.demo);
    addLog({
      text: `Temas elegidos: ${topics.map((t) => `“${t.title}”`).join(", ")}`,
      outcome: note ? `historia, ronda 1 · la sala: “${note.slice(0, 160)}”` : "historia, ronda 1",
    });
    setSeed(note ? { id: Date.now(), text: note, on: true } : null);
    setStep("story");
  }

  async function reviseStory(note: string, kind: "revise" | "fixStory" = "revise"): Promise<boolean> {
    if (!story) return false;
    const result = await run(kind, () => api.reviseStory(pieceBrief, story, note, projectId ?? ""));
    if (!result) return false;
    setSeed(null);
    setRoomNotes([]);
    setStory(result.story);
    setStoryRound((r) => r + 1);
    addLog({
      text: kind === "fixStory" ? `Historia, ronda ${storyRound}: Arreglalo (check)` : `Historia, ronda ${storyRound}: “${note}”`,
      outcome: result.demo ? "modo de muestra: sin cambios" : `historia, ronda ${storyRound + 1}`,
    });
    return true;
  }

  function dismiss(problem: Problem) {
    setDismissed((d) => [...d, problem.id]);
    addLog({ shot: problem.shot, text: `Check: “${problem.label}” marcado como no es un problema`, outcome: problem.detail });
  }

  // Step 3 → storyboard
  async function makeBoard() {
    if (!story) return;
    const result = await run("board", () => api.board(pieceBrief, story));
    if (!result) return;
    setBoard(result.board);
    setBoardRound(1);
    setBoardApproved(false);
    setMedia({});
    if (projectId) api.clearMedia(projectId).catch(() => undefined);
    addLog({ text: `Historia aprobada en la ronda ${storyRound}`, outcome: "storyboard, ronda 1" });
    setStep("board");
  }

  async function reviseBoard(
    note: string,
    shotNotes: { index: number; note: string }[],
    kind: "reviseBoard" | "fixBoard" = "reviseBoard",
  ): Promise<boolean> {
    if (!story || !board) return false;
    const result = await run(kind, () => api.reviseBoard(pieceBrief, story, board, note, shotNotes));
    if (!result) return false;
    setBoard(result.board);
    setBoardRound((r) => r + 1);
    const notes = [note && `“${note}”`, ...shotNotes.map((n) => `toma ${n.index + 1}: “${n.note}”`)].filter(Boolean);
    addLog({
      text: kind === "fixBoard" ? `Storyboard, ronda ${boardRound}: Arreglalo (check)` : `Storyboard, ronda ${boardRound}: ${notes.join(" · ")}`,
      outcome: result.demo ? "modo de muestra: sin cambios" : `storyboard, ronda ${boardRound + 1}`,
    });
    return true;
  }

  function approveBoard() {
    addLog({ text: `Storyboard aprobado en la ronda ${boardRound}` });
    setBoardApproved(true);
    setStep("production");
  }

  // Step 4 → production
  async function generateImage(index: number) {
    if (!board) return;
    const shot = board.shots[index];
    setShotMedia(index, { loading: true, error: undefined });
    try {
      const { dataUrl } = await api.image(provider, shot.visualPrompt, board.style, pieceBrief.format, shot.beat);
      setShotMedia(index, { image: dataUrl, loading: false });
      const blob = await (await fetch(dataUrl)).blob();
      await keep(index, (id) => api.uploadMedia(id, index, "image", blob));
    } catch (e) {
      setShotMedia(index, { loading: false, error: message(e) });
    }
  }

  async function generateAll() {
    if (!board) return;
    const queue = board.shots.map((_, i) => i);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) await generateImage(i);
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // Checks an uploaded picture: its format here, and, when a writer is set, the AI's look against the shot.
  async function reviewMedia(index: number, what: "image" | "clip", source: string | Blob) {
    if (!board) return;
    const shot = board.shots[index];
    setShotMedia(index, { review: { what, loading: true } });
    try {
      const picture = await pictureForReview(source);
      const expected = pieceBrief.format === "vertical" ? 9 / 16 : 16 / 9;
      const format =
        Math.abs(picture.width / picture.height - expected) / expected > 0.04
          ? `${what === "clip" ? "El clip" : "La imagen"} mide ${picture.width}×${picture.height} y el video es ${pieceBrief.format === "vertical" ? "9:16" : "16:9"}: se va a ver con bandas o recortado.`
          : undefined;
      if (!status?.writer) {
        setShotMedia(index, { review: { what, loading: false, format } });
        return;
      }
      const inFrame = shot.setups.map((id) => board.setups.find((x) => x.id === id)).filter((x) => x !== undefined);
      const refs = await Promise.all(
        inFrame
          .map((x) => (x.castId ? library[x.castId] : undefined))
          .filter((e) => e?.url)
          .slice(0, 3)
          .map(async (e) => ({ label: `Approved reference image of ${e!.name} (${e!.identity}):`, jpeg: (await pictureForReview(e!.url!, 512)).jpeg })),
      );
      const result = await api.review(
        pieceBrief,
        { title: shot.title, action: shot.action, prompt: what === "clip" ? shot.videoPrompt : shot.visualPrompt, what },
        inFrame.map((x) => ({ name: x.name, identity: x.identity })),
        picture.jpeg,
        refs,
      );
      setShotMedia(index, { review: { what, loading: false, format, result } });
      const failed = result.checks.filter((c) => !c.pass).length;
      if (!result.demo) addLog({ shot: index, text: `Revisión de la IA (${what === "clip" ? "clip" : "imagen"})`, outcome: failed ? `${failed} problema(s)` : "sin problemas" });
    } catch (e) {
      setShotMedia(index, { review: { what, loading: false, error: message(e) } });
    }
  }

  async function uploadImage(index: number, file: File) {
    try {
      const image = await readImageFile(file);
      setShotMedia(index, { image, error: undefined });
      addLog({ shot: index, text: `Imagen subida: ${file.name}` });
      reviewMedia(index, "image", image);
      await keep(index, (id) => api.uploadMedia(id, index, "image", file));
    } catch (e) {
      setShotMedia(index, { error: message(e) });
    }
  }

  async function uploadClip(index: number, file: File) {
    if (!file.type.startsWith("video/")) {
      setShotMedia(index, { error: "Ese archivo no es un video." });
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const duration = await clipDuration(url);
      clipUrls.current.push(url);
      const clip: ClipFile = { url, blob: file, name: file.name, duration };
      setShotMedia(index, { clip, error: undefined });
      addLog({ shot: index, text: `Clip subido: ${file.name}, ${duration.toFixed(1)} s` });
      reviewMedia(index, "clip", file);
      await keep(index, (id) => api.uploadMedia(id, index, "clip", file, { name: file.name, duration }));
    } catch (e) {
      URL.revokeObjectURL(url);
      setShotMedia(index, { error: message(e) });
    }
  }

  async function removeMedia(index: number, kind: "image" | "clip" | "voice" | "sfx") {
    setMedia((prev) => {
      const next = { ...prev[index] };
      delete next[kind];
      if (kind === "image" || kind === "clip") delete next.review;
      return { ...prev, [index]: next };
    });
    const sketch = kind === "image" && index >= SKETCH_BASE;
    const what = sketch ? "Boceto quitado" : { image: "Imagen quitada", clip: "Clip quitado", voice: "Voz quitada", sfx: "Efecto quitado" }[kind];
    addLog({ shot: sketch ? index - SKETCH_BASE : index, text: what });
    await keep(index, (id) => api.removeMedia(id, index, kind));
  }

  // A voice (recorded, uploaded or generated) or a sound effect for one shot, kept in the project folder.
  async function addAudio(index: number, kind: "voice" | "sfx", blob: Blob, name: string) {
    const duration = await audioDuration(blob).catch(() => {
      throw new Error("No se pudo leer ese audio. Probá con un .mp3 o un .wav.");
    });
    const url = URL.createObjectURL(blob);
    clipUrls.current.push(url);
    setShotMedia(index, { [kind]: { url, blob, name, duration } });
    addLog({ shot: index, text: `${kind === "voice" ? "Voz" : "Efecto de sonido"}: ${name}, ${duration.toFixed(1)} s` });
    const type = blob.type || "audio/mpeg";
    const file = blob.type ? blob : new Blob([blob], { type });
    await keep(index, (id) => api.uploadMedia(id, index, kind, file, { name, duration }));
  }

  async function generateVoice(index: number) {
    const shot = board?.shots[index];
    if (!shot) return;
    const own = audio.characters[shot.speaker];
    const blob = await api.speak(shot.voiceover, own?.ttsVoice ?? "", pieceBrief.language);
    await addAudio(index, "voice", blob, `toma-${index + 1}-voz-generada.mp3`);
  }

  function setVoiceMode(index: number, mode: VoiceMode) {
    setAudio((a) => ({ ...a, shots: { ...a.shots, [index]: mode } }));
  }

  function setCharacterVoice(id: string, voice: CharacterVoice) {
    setAudio((a) => ({ ...a, characters: { ...a.characters, [id]: voice } }));
  }

  async function addMusic(file: File) {
    const duration = await audioDuration(file).catch(() => {
      throw new Error("No se pudo leer esa música. Probá con un .mp3 o un .wav.");
    });
    const url = URL.createObjectURL(file);
    clipUrls.current.push(url);
    setMusic({ url, blob: file, name: file.name, duration });
    addLog({ text: `Música: ${file.name}, ${duration.toFixed(0)} s` });
    if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
  }

  function removeMusic() {
    setMusic(null);
    addLog({ text: "Música quitada" });
    if (projectId) api.removeMusic(projectId).catch((e) => setError(message(e)));
  }

  async function rewriteShot(index: number, note: string): Promise<boolean> {
    if (!story || !board) return false;
    try {
      const result = await api.rewriteShot(pieceBrief, story, board, index, note);
      setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? result.shot : old)) } : b));
      addLog({
        shot: index,
        text: `“${note}”`,
        outcome: result.demo ? "modo de muestra: sin cambios (falta la clave de la IA)" : "toma reescrita",
      });
      return true;
    } catch (e) {
      addLog({ shot: index, text: `“${note}”`, outcome: `no se pudo: ${message(e)}` });
      return false;
    }
  }

  function updateShot(index: number, shot: Shot) {
    setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? shot : old)) } : b));
  }

  // Fixes a setup into the series' cast: creates the cast member if the setup has none, links the setup to it
  // and, when an image is given, makes it the approved image.
  async function fixSetup(setup: Setup, kind: CastMember["kind"], image: Blob | null) {
    const seriesKey = pieceBrief.series;
    const cast = pieceSeries?.cast ?? [];
    let castId = setup.castId;
    if (!castId || !cast.some((m) => m.id === castId)) {
      const base = seriesId(setup.name);
      castId = base;
      for (let n = 2; cast.some((m) => m.id === castId); n++) castId = `${base}-${n}`;
      let ref = castRef(setup.name);
      const taken = new Set(cast.map((m) => m.ref.toLowerCase()));
      for (let n = 2; taken.has(ref.toLowerCase()); n++) ref = `${castRef(setup.name)}${n}`;
      const { series } = await api.upsertCast(seriesKey, {
        id: castId,
        name: setup.name.slice(0, 60),
        ref,
        kind,
        identity: setup.identity,
        note: "",
        image: "",
        sheet: "",
        puppet: { layers: [] },
        rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
      });
      setStatus((s) => (s ? { ...s, series } : s));
      const linked = castId;
      setBoard((b) => (b ? { ...b, setups: b.setups.map((x) => (x.id === setup.id ? { ...x, castId: linked } : x)) } : b));
      addLog({ text: `Setup ${setup.name} guardado en el elenco fijo de la serie` });
    }
    if (image) {
      const { series } = await api.uploadCastImage(seriesKey, castId, image);
      setStatus((s) => (s ? { ...s, series } : s));
      setLibraryVersion((v) => v + 1);
      addLog({ text: `Imagen fija de ${setup.name} actualizada` });
    }
  }

  async function saveStyle(style: TextStyle) {
    const { series } = await api.saveSeriesStyle(pieceBrief.series, style);
    setStatus((s) => (s ? { ...s, series } : s));
  }

  async function keepVideo(video: Blob): Promise<string | null> {
    if (!projectId) return null;
    try {
      const { file } = await api.saveVideo(projectId, video);
      return `${status?.projectsDir ?? "proyectos"}/${projectId}/${file}`;
    } catch (e) {
      setError(`El video se generó pero no se guardó en el proyecto: ${message(e)}`);
      return null;
    }
  }

  const allPrompts = (kind: "image" | "video") =>
    board
      ? timeShots(board.shots)
          .map(
            (s) =>
              `Toma ${s.index + 1} · ${s.title} · ${formatTime(s.start)}–${formatTime(s.end)} · ${BEAT_INFO[s.beat].label} · ${s.toolSettings}\n` +
              (kind === "video"
                ? s.videoPrompt
                : s.kind === "screen"
                  ? `(Pantalla real: ${library[s.screen]?.name ?? s.screen}, no se genera)`
                  : s.kind === "transform"
                    ? [
                        `Inicial: ${buildCopyPrompt(s.visualPrompt, pieceBrief.format)}`,
                        s.middlePrompt && `Intermedia: ${buildCopyPrompt(s.middlePrompt, pieceBrief.format)}`,
                        `Final: ${buildCopyPrompt(s.endPrompt, pieceBrief.format)}`,
                      ]
                        .filter(Boolean)
                        .join("\n")
                    : buildCopyPrompt(s.visualPrompt, pieceBrief.format)),
          )
          .join("\n\n")
      : "";

  // A real-screen shot shows the series' screenshot unless the person uploaded another image for it.
  // What the video plays per shot. A real-screen shot shows the series' screenshot unless the person uploaded
  // another image; a voice file is used only when the shot's line is set to a generated or recorded voice.
  const modes = (board?.shots ?? []).map((shot, i) => voiceModeOf(audio, shot, i));
  const renderMedia = Object.fromEntries(
    (board?.shots ?? []).map((shot, i) => [
      i,
      {
        image: media[i]?.image ?? (shot.kind === "screen" ? library[shot.screen]?.url : undefined),
        clip: media[i]?.clip?.blob,
        voice: modes[i] === "generated" || modes[i] === "recorded" ? media[i]?.voice?.blob : undefined,
        sfx: media[i]?.sfx?.blob,
      },
    ]),
  );
  // What each storyboard frame shows: its picture so far, else the real screen or the main setup's approved image.
  const shotImages = Object.fromEntries(
    (board?.shots ?? []).map((shot, i) => {
      const castId = board?.setups.find((x) => x.id === shot.setups[0])?.castId;
      return [
        i,
        renderMedia[i]?.image ?? (castId ? library[castId]?.url : undefined),
      ];
    }),
  );
  const spoken = modes.map((m, i) => (m === "grok" ? true : m !== "subtitles" && Boolean(renderMedia[i]?.voice)));
  const generating = Object.values(media).some((m) => m.loading);
  const realProviders = status?.imageProviders.filter((p) => p.available && p.id !== "placeholder") ?? [];
  const maxTopics = pieceBrief.length === "short" ? 1 : 4;
  const open = (p: Problem) => !dismissed.includes(p.id);
  const usedRunners = room.flatMap((c) => (c.runner ? [{ bit: c.runner, problem: c.problem }] : []));
  const storyIssues = story ? storyProblems(story, pieceBrief, usedRunners) : [];
  const boardIssues = board ? boardProblems(board, Object.fromEntries((pieceSeries?.cast ?? []).map((m) => [m.id, m.kind]))) : [];
  const roomSeriesId = step === "brief" ? brief.series : pieceBrief.series;
  const roomSeriesInfo = status?.series.find((s) => s.id === roomSeriesId);
  const showRoom =
    !!roomSeriesInfo &&
    roomSeriesInfo.type !== "music" &&
    !lyric &&
    !motion &&
    (step === "menu" || step === "story" || step === "board" || (step === "brief" && brief.piece === "story" && editingSeries === undefined));
  const roomEl = showRoom ? (
    <WritersRoom
      seriesName={roomSeriesInfo.name}
      cards={room}
      notes={roomNotes}
      showBanner={step === "brief" || step === "menu"}
      busy={busy !== null}
      onRetake={step === "board" ? undefined : retake}
      onClear={() => setRoomNotes([])}
    />
  ) : null;

  const steps: { id: Step; label: string; enabled: boolean }[] = lyric
    ? [
        { id: "brief", label: "1 · Brief", enabled: true },
        { id: "lyrics", label: "2 · Video de letra", enabled: true },
      ]
    : motion
      ? [
          { id: "brief", label: "1 · Brief", enabled: true },
          { id: "motion", label: "2 · Explicativo", enabled: true },
        ]
      : [
          { id: "brief", label: "1 · Brief", enabled: true },
          { id: "menu", label: "2 · Menú", enabled: menu !== null },
          { id: "story", label: "3 · Historia", enabled: story !== null },
          { id: "board", label: "4 · Storyboard", enabled: board !== null },
          { id: "production", label: "5 · Producción", enabled: board !== null && (boardApproved || step === "production") },
        ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Playbook Studio</h1>
            <p className="text-sm text-muted">
              {section === "playbook"
                ? "Contenido con historia: el Bueno contra el Malo, temas, puentes, callbacks y la pizarra de la serie."
                : "Publicidad · Método 50-5-3: hooks × meats × CTAs, de 150 a 750 anuncios por semana sin armarlos uno por uno."}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            {(["playbook", "ads"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${section === s ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {s === "playbook" ? "Playbook" : "Publicidad"}
              </button>
            ))}
          </div>
        </div>
        {status && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {projectId && (
              <span
                className={`rounded-full border px-2.5 py-1 font-medium ${
                  saveStatus === "error" ? "border-neg/40 bg-neg-soft text-neg" : "border-line bg-white text-muted"
                }`}
                title={`${status.projectsDir}/${projectId}`}
              >
                {saveStatus === "saving" ? "Guardando…" : saveStatus === "error" ? "No se pudo guardar" : "Guardado ✓"}
              </span>
            )}
            {projectId && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={newPiece}>
                + Nueva pieza
              </Button>
            )}
            <button
              type="button"
              onClick={() => setShowModels(true)}
              title="Modelos: quién escribe y las claves"
              className={`rounded-full border px-2.5 py-1 font-medium hover:border-ink ${status.writer ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
            >
              {status.writer ? `${status.writer.label} · ${status.writer.model}` : "IA sin conectar"} · Modelos
            </button>
            {realProviders.map((p) => (
              <span key={p.id} className="rounded-full border border-good/40 bg-good-soft px-2.5 py-1 font-medium text-good">
                {p.label}
              </span>
            ))}
          </div>
        )}
      </header>

      {showModels && (
        <ModelsPanel
          onClose={() => setShowModels(false)}
          onChanged={() =>
            api
              .status()
              .then((s) => setStatus((old) => (old ? { ...old, writer: s.writer, voice: s.voice, lyrics: s.lyrics, imageProviders: s.imageProviders } : s)))
              .catch(() => undefined)
          }
        />
      )}

      {section === "ads" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="font-semibold">Serie</span>
              <select
                className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                value={brief.series}
                onChange={(e) => setBrief({ ...brief, series: e.target.value })}
              >
                {(status?.series ?? []).filter((x) => x.type !== "music").map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-muted">La misma serie (biblia, elenco, estilo de texto) que Playbook; el perfil de oferta se guarda por serie.</span>
          </div>
          {status && !status.writer && (
            <Notice tone="warn">
              <b>Modo de muestra.</b> Sin clave de IA, los hooks, meats y CTAs son ejemplos fijos y la revisión solo mira largo y repetidos. Cargá una clave en{" "}
              <button type="button" className="font-semibold underline" onClick={() => setShowModels(true)}>
                Modelos
              </button>
              .
            </Notice>
          )}
          {status && currentSeries && currentSeries.type !== "music" ? (
            <AdsStudio
              key={currentSeries.id}
              series={currentSeries}
              tools={status.tools}
              imageProviders={status.imageProviders}
              writer={Boolean(status.writer)}
              voice={status.voice}
              onToPlaybook={(text) => {
                setBrief((b) => ({ ...b, angle: text }));
                setSection("playbook");
                setStep("brief");
              }}
            />
          ) : (
            status && <Notice tone="info">Elegí una serie de tipo software o e-commerce: las series de música hacen videos de letra, no anuncios.</Notice>
          )}
        </div>
      )}

      {section === "playbook" && (
      <>
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.enabled}
            onClick={() => setStep(s.id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
              step === s.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink disabled:opacity-40"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {status && !status.writer && !lyric && !motion && (
          <Notice tone="warn">
            <b>Modo de muestra.</b> No hay clave de IA: el menú, la historia y el storyboard son un ejemplo fijo de
            IMAN, y las revisiones no cambian nada. Cargá una clave en{" "}
            <button type="button" className="font-semibold underline" onClick={() => setShowModels(true)}>
              Modelos
            </button>{" "}
            (Claude, Kimi, NVIDIA u OpenRouter) para escribir los de verdad.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {step === "brief" && editingSeries !== undefined && (
          <SeriesEditor
            key={editingSeries ?? "new"}
            id={editingSeries}
            onSaved={(series, id) => {
              setStatus((s) => (s ? { ...s, series } : s));
              setBrief((b) => ({ ...b, series: id }));
              setEditingSeries(undefined);
            }}
            onLogoSaved={(series) => setStatus((s) => (s ? { ...s, series } : s))}
            onDeleted={(series) => {
              setStatus((s) => (s ? { ...s, series } : s));
              setBrief((b) => ({ ...b, series: series[0]?.id ?? "" }));
              setEditingSeries(undefined);
            }}
            onClose={() => setEditingSeries(undefined)}
          />
        )}

        {step === "brief" && editingSeries === undefined && (
          <section className="space-y-6">
            {roomEl}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setBrief({ ...EXAMPLE_BRIEF, tool: brief.tool, series: brief.series })}
              >
                Cargar ejemplo
              </Button>
              <Button variant="ghost" onClick={() => setBrief({ ...EMPTY_BRIEF, tool: brief.tool, series: brief.series })}>
                Borrar
              </Button>
            </div>
            <BriefForm
              brief={brief}
              series={status?.series ?? []}
              tools={status?.tools ?? []}
              onChange={setBrief}
              onEditSeries={(id) => setEditingSeries(id)}
              onNewSeries={() => setEditingSeries(null)}
            />
            {currentSeries?.type === "music" ? (
              <div className="flex items-center gap-3 border-t border-line pt-5">
                <Button onClick={() => startStudio("lyrics")} disabled={busy !== null}>
                  Empezar un video de letra
                </Button>
                {lyric && (
                  <Button variant="secondary" onClick={() => setStep("lyrics")}>
                    Volver al video abierto
                  </Button>
                )}
              </div>
            ) : brief.piece === "explainer" ? (
              <div className="flex items-center gap-3 border-t border-line pt-5">
                <Button onClick={() => startStudio("motion")} disabled={busy !== null || needsProduct}>
                  Empezar un explicativo
                </Button>
                {motion && (
                  <Button variant="secondary" onClick={() => setStep("motion")}>
                    Volver al explicativo abierto
                  </Button>
                )}
                {needsProduct && <span className="text-sm text-muted">Para {currentSeries?.name}, escribí el producto del episodio.</span>}
              </div>
            ) : (
              <div className="flex items-center gap-3 border-t border-line pt-5">
                <Button onClick={openMenu} disabled={busy !== null || needsProduct}>
                  {busy === "menu" ? (
                    <>
                      <Spinner /> Armando el menú…
                    </>
                  ) : (
                    "Ver el menú de temas"
                  )}
                </Button>
                {needsProduct && (
                  <span className="text-sm text-muted">Para {currentSeries?.name}, escribí el producto del episodio.</span>
                )}
              </div>
            )}
            <ProjectsPanel
              projects={projects}
              series={status?.series ?? []}
              current={projectId}
              folder={status?.projectsDir ?? "proyectos"}
              onOpen={openProject}
              onDelete={removeProject}
            />
          </section>
        )}

        {step === "motion" && motion && pieceSeries && (
          <MotionStudio
            key={motion.key}
            projectId={projectId}
            brief={pieceBrief}
            series={pieceSeries}
            initial={motion.initial}
            voiceAvailable={status?.voice.available ?? false}
            defaultVoice={status?.voice.defaultVoice ?? ""}
            projectsDir={status?.projectsDir ?? "proyectos"}
            ffmpeg={status?.render?.ffmpeg ?? false}
            demucs={status?.render?.demucs ?? false}
            autoSync={status?.lyrics.autoSync ?? false}
            onSaveStatus={setSaveStatus}
          />
        )}

        {step === "lyrics" && lyric && pieceSeries && (
          <LyricStudio
            key={lyric.key}
            projectId={projectId}
            brief={pieceBrief}
            series={pieceSeries}
            initial={lyric.initial}
            autoSync={status?.lyrics.autoSync ?? false}
            projectsDir={status?.projectsDir ?? "proyectos"}
            onSaveStatus={setSaveStatus}
            onSeries={(series) => setStatus((s) => (s ? { ...s, series } : s))}
          />
        )}

        {step === "menu" && menu && (
          <section className="space-y-6">
            {roomEl}
            {demo && <p className="mb-2 text-sm text-muted">(Menú de muestra.)</p>}
            <MenuPicker
              ideas={menu.ideas}
              questions={menu.questions}
              max={maxTopics}
              busy={busy === "story"}
              onWrite={writeStory}
            />
          </section>
        )}

        {step === "story" && story && (
          <div className="space-y-6">
            {roomEl}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <StoryView
              story={story}
              round={storyRound}
              length={pieceBrief.length}
              busy={busy === "revise" ? "revise" : busy === "fixStory" ? "fix" : busy === "board" ? "board" : null}
              problems={storyIssues.filter(open)}
              dismissed={storyIssues.length - storyIssues.filter(open).length}
              seed={seed}
              usedRunners={usedRunners}
              onRevise={(note) => reviseStory(note)}
              onFix={() => reviseStory(fixNote(storyIssues.filter(open)), "fixStory")}
              onDismiss={dismiss}
              onApprove={makeBoard}
            />
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => download(new Blob([storyToMarkdown(story)], { type: "text/markdown" }), `${slug(story.problem || story.title)}-historia.md`)}
              >
                Descargar historia .md
              </Button>
              <Button variant="ghost" className="w-full" onClick={sendToAds} disabled={sent === story.title}>
                {sent === story.title ? "Enviado a Publicidad ✓" : "Enviar a Publicidad (hook)"}
              </Button>
              <HookVariants
                variants={hookVariants}
                current={story.title}
                busy={writingHooks || busy !== null}
                onWrite={writeHookVariants}
                onUse={pickHookVariant}
                onSend={sendHookVariants}
              />
              <DirectionLog log={log} />
              <StoryNotes story={story} />
            </aside>
          </section>
          </div>
        )}

        {step === "board" && story && board && (
          <div className="space-y-6">
            {roomEl}
          <BoardView
            story={story}
            board={board}
            round={boardRound}
            busy={busy === "reviseBoard" ? "revise" : busy === "fixBoard" ? "fix" : null}
            problems={boardIssues.filter(open)}
            dismissed={boardIssues.length - boardIssues.filter(open).length}
            look={{
              format: pieceBrief.format,
              style: pieceSeries?.textStyle ?? DEFAULT_TEXT_STYLE,
              images: shotImages,
              sketches: Object.fromEntries(board.shots.map((_, i) => [i, media[SKETCH_BASE + i]?.image])),
              castKinds: Object.fromEntries((pieceSeries?.cast ?? []).map((m) => [m.id, m.kind])),
            }}
            onSketch={async (index, file) => {
              const image = await readImageFile(file);
              setShotMedia(SKETCH_BASE + index, { image, error: undefined });
              addLog({ shot: index, text: `Boceto subido: ${file.name}` });
              await keep(SKETCH_BASE + index, (id) => api.uploadMedia(id, SKETCH_BASE + index, "image", file));
            }}
            onSketchRemove={(index) => void removeMedia(SKETCH_BASE + index, "image")}
            onRevise={(note, shotNotes) => reviseBoard(note, shotNotes)}
            onFix={() => reviseBoard(fixNote(boardIssues.filter(open)), [], "fixBoard")}
            onDismiss={dismiss}
            onApprove={approveBoard}
          />
          </div>
        )}

        {step === "production" && story && board && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <div>
                <p className="font-mono text-xs text-muted">{pieceSeries?.name ?? ""}</p>
                <PieceTitle problem={story.problem} title={story.title} />
                <p className="text-sm text-muted">{story.logline}</p>
              </div>
              <Timeline board={board} />
              {pieceSeries?.type === "ecommerce" && (
                <ProductPanel
                  toolName={toolName}
                  setups={board.setups}
                  products={Object.values(library).filter((m) => m.kind === "product")}
                  onWrite={async () => {
                    setError("");
                    try {
                      return await api.productShot(pieceBrief);
                    } catch (e) {
                      setError(message(e));
                      return null;
                    }
                  }}
                  onSave={async (setup, image) => {
                    await fixSetup(setup, "product", image);
                    addLog({ text: `Producto recortado: ${setup.name}` });
                  }}
                />
              )}

              <div className="space-y-3 rounded-xl border border-line bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={allPrompts("image")} idle="Copiar todos los prompts de imagen" />
                  <CopyButton text={allPrompts("video")} idle="Copiar todos los prompts de video" variant="secondary" />
                  <span className="text-sm text-muted">
                    Pegalos en {toolName} y después soltá cada imagen y cada clip en su toma.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">O generar con</span>
                    <select
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {status?.imageProviders.map((p) => (
                        <option key={p.id} value={p.id} disabled={!p.available}>
                          {p.label}
                          {p.available ? "" : " (sin conectar)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" onClick={generateAll} disabled={generating}>
                    {generating ? (
                      <>
                        <Spinner /> Generando…
                      </>
                    ) : (
                      "Generar todas"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() =>
                      download(
                        new Blob([pieceToMarkdown(pieceBrief, story, board, toolName, log, audio)], { type: "text/markdown" }),
                        `${slug(story.problem || story.title)}.md`,
                      )
                    }
                  >
                    Descargar todo .md
                  </Button>
                </div>
              </div>

              <Notice tone="warn">
                <b>En {toolName}, cada vez:</b> elegí el largo del clip (6, 10 o 15 s) y la forma en sus propios
                controles; el prompt solo lo recuerda. Primero la imagen, después animala.
              </Notice>

              <NarrationImport
                lines={board.shots.flatMap((s, i) =>
                  s.voiceover.trim()
                    ? [
                        {
                          key: String(i),
                          label: `Toma ${i + 1}`,
                          speaker: story.characters.find((c) => c.id === s.speaker)?.name ?? s.speaker,
                          text: s.voiceover,
                          // The story line's emotion (a continuous take: its first spoken beat's).
                          emotion:
                            story.topics.flatMap((t) => t.lines).find((l) => l.text.trim() === s.voiceover.trim())?.emotion ??
                            s.timeline?.find((b) => b.line.trim())?.emotion ??
                            "",
                        },
                      ]
                    : [],
                )}
                narratorKeys={board.shots.flatMap((s, i) =>
                  story.characters.find((c) => c.id === s.speaker)?.role === "narrator" && s.voiceover.trim() ? [String(i)] : [],
                )}
                language={pieceBrief.language}
                autoSync={status?.lyrics.autoSync ?? false}
                room={Object.fromEntries(board.shots.map((s, i) => [String(i), s.seconds]))}
                onParts={async (parts) => {
                  for (const p of parts) {
                    const i = Number(p.key);
                    await addAudio(i, "voice", p.blob, `toma-${i + 1}-narracion.wav`);
                    setVoiceMode(i, "recorded");
                  }
                  addLog({ text: `Narración en un archivo: ${parts.length} partes repartidas en sus tomas.` });
                }}
              />

              <ScriptView
                brief={pieceBrief}
                story={story}
                board={board}
                media={media}
                toolName={toolName}
                onShotChange={updateShot}
                onGenerate={generateImage}
                onUploadImage={uploadImage}
                onUploadClip={uploadClip}
                onRemoveMedia={removeMedia}
                onRewrite={rewriteShot}
                strictLook={pieceSeries ? hasLook(pieceSeries.look) : false}
                onSegment={async (index, note) => {
                  const result = await api.segmentEdit(pieceBrief, board.shots[index], note);
                  addLog({ shot: index, text: `Segmento: “${note}”`, outcome: result.select });
                  return result;
                }}
                onReview={
                  status?.writer
                    ? (index) => {
                        const m = media[index];
                        const source = m?.clip?.blob ?? m?.image;
                        if (source) reviewMedia(index, m?.clip ? "clip" : "image", source);
                      }
                    : null
                }
                library={library}
                voice={{
                  language: pieceBrief.language,
                  audio,
                  voiceAvailable: status?.voice.available ?? false,
                  onMode: setVoiceMode,
                  onVoice: (i, blob, name) => addAudio(i, "voice", blob, name),
                  onGenerate: generateVoice,
                  onRemove: (i, kind) => removeMedia(i, kind),
                  onSfx: (i, blob, name) => addAudio(i, "sfx", blob, name),
                  onClipSound: (i, sound) => setAudio((a) => ({ ...a, clipSound: { ...a.clipSound, [i]: sound } })),
                  onClipLevel: (i, level) => setAudio((a) => ({ ...a, clipLevel: { ...a.clipLevel, [i]: level } })),
                  onSeconds: (i, seconds) => {
                    const shot = board.shots[i];
                    updateShot(i, { ...shot, seconds, toolSettings: shot.toolSettings.replace(/\d+(\.\d+)?\s*s\b/, `${seconds} s`) });
                  },
                }}
              />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
              <VideoPanel
                brief={pieceBrief}
                story={story}
                board={board}
                media={renderMedia}
                watermarked={pieceBrief.tool === "grok-imagine"}
                seriesName={pieceSeries?.name ?? ""}
                seriesStyle={pieceSeries?.textStyle ?? DEFAULT_TEXT_STYLE}
                onSaveStyle={saveStyle}
                onRendered={keepVideo}
                audio={audio}
                onAudio={(patch) => setAudio((a) => ({ ...a, ...patch }))}
                spoken={spoken}
                music={music}
                onMusic={addMusic}
                onRemoveMusic={removeMusic}
              />
              <VoicesPanel
                characters={story.characters}
                audio={audio}
                defaultTtsVoice={status?.voice.defaultVoice ?? ""}
                onChange={setCharacterVoice}
              />
              <SetupsPanel
                board={board}
                media={media}
                toolName={toolName}
                seriesName={pieceSeries?.name ?? ""}
                library={library}
                onFix={fixSetup}
              />
              <Button variant="ghost" className="w-full" onClick={sendToAds} disabled={sent === story.title}>
                {sent === story.title ? "Enviado a Publicidad ✓" : "Enviar a Publicidad (hook)"}
              </Button>
              <DirectionLog log={log} />
              <StoryNotes story={story} />
            </aside>
          </section>
        )}
      </div>
      </>
      )}
    </div>
  );
}
