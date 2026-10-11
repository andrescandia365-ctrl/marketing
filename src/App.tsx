import { lazy, useEffect, useRef, useState } from "react";
import { DEFAULT_AUDIO, voiceModeOf, type AudioSettings } from "../shared/audio.ts";
import { boardProblems, fixNote, storyProblems, type Problem } from "../shared/checks.ts";
import { SKETCH_BASE } from "../shared/prompt.ts";
import { EMPTY_BRIEF, EXAMPLE_BRIEF } from "../shared/example.ts";
import { migrateBoard, migrateStory, type Board, type Brief, type HookVariant, type Menu, type Status, type Story, type TopicIdea } from "../shared/schema.ts";
import { DEFAULT_TEXT_STYLE, type CastMember } from "../shared/series.ts";
import { shotFrames } from "../shared/transformScreen.ts";
import type { SetupIdentityEdit } from "../shared/setupEdit.ts";
import { BriefForm } from "./components/BriefForm.tsx";
import { MenuPicker } from "./components/MenuPicker.tsx";
import type { LyricOpen } from "./components/LyricStudio.tsx";
import type { MotionOpen } from "./components/MotionStudio.tsx";
import { ProjectsPanel } from "./components/ProjectsPanel.tsx";
import { DirectionLog, StoryNotes, type LibraryEntry } from "./components/ScriptView.tsx";
import { StoryView } from "./components/StoryView.tsx";
import { WritersRoom } from "./components/WritersRoom.tsx";
import { HookVariants } from "./components/HookVariants.tsx";
import { CorrespondentOffer } from "./components/CorrespondentOffer.tsx";
import { MOVE_LABEL } from "../shared/moves.ts";
import type { RoomCard } from "../shared/room.ts";
import { Button, Lazy, Notice, Spinner } from "./components/ui.tsx";
import { ProductionView } from "./components/ProductionView.tsx";
import { AdsSection } from "./components/AdsSection.tsx";
import { AppHeader, type Section } from "./components/AppHeader.tsx";
import { useProject } from "./useProject.ts";
import { toolsRefCap } from "../shared/castRefs.ts";
import { ads as adsApi, api, libraryFileUrl, type ProjectSummary } from "./lib/api.ts";
import { pictureForReview, readImageFile } from "./lib/files.ts";
import { download, pieceToMarkdown, slug, storyToMarkdown, type LogEntry } from "./lib/markdown.ts";

// The studios, the storyboard and the panels behind a button load the first time they are opened (the video panel too,
// from ProductionView), so the brief (the first screen) does not wait for the video, audio and 3D code.
const BoardView = lazy(() => import("./components/BoardView.tsx").then((m) => ({ default: m.BoardView })));
const MotionStudio = lazy(() => import("./components/MotionStudio.tsx").then((m) => ({ default: m.MotionStudio })));
const LyricStudio = lazy(() => import("./components/LyricStudio.tsx").then((m) => ({ default: m.LyricStudio })));
const SeriesEditor = lazy(() => import("./components/SeriesEditor.tsx").then((m) => ({ default: m.SeriesEditor })));
const EpisodesPanel = lazy(() => import("./components/EpisodesPanel.tsx").then((m) => ({ default: m.EpisodesPanel })));
const ModelsPanel = lazy(() => import("./components/ModelsPanel.tsx").then((m) => ({ default: m.ModelsPanel })));

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

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
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
  // The last setup description carried into the shots, kept to undo it.
  const [setupUndo, setSetupUndo] = useState<{ edit: SetupIdentityEdit; member: CastMember | null } | null>(null);
  const [boardRound, setBoardRound] = useState(1);
  const [boardApproved, setBoardApproved] = useState(false);
  const [demo, setDemo] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO);
  const logStart = useRef(Date.now());
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  // The writers' room: other pieces of this series, and the note this piece will pick up.
  const [room, setRoom] = useState<RoomCard[]>([]);
  const [roomNotes, setRoomNotes] = useState<string[]>([]);
  const [seed, setSeed] = useState<{ id: number; text: string; on: boolean } | null>(null);
  // Bumped when an approved image is replaced, so the browser shows the new file under the same name.
  const [libraryVersion, setLibraryVersion] = useState(Date.now());

  const pieceTool = status?.tools.find((t) => t.id === pieceBrief.tool);
  const toolName = pieceTool?.name ?? "la herramienta";
  const pieceSeries = status?.series.find((s) => s.id === pieceBrief.series);
  const library: Record<string, LibraryEntry> = Object.fromEntries(
    (pieceSeries?.cast ?? []).map((m) => [
      m.id,
      {
        ...m,
        url: m.image ? libraryFileUrl(pieceSeries!.id, m.image, libraryVersion) : undefined,
        ...(m.video && { videoUrl: libraryFileUrl(pieceSeries!.id, m.video.file) }),
      },
    ]),
  );
  const currentSeries = status?.series.find((s) => s.id === brief.series);
  const needsProduct = Boolean(currentSeries?.productPerEpisode) && !brief.product.trim();

  // The project folder: the autosave (lyric videos and explainers save themselves) and each shot's media.
  const castKindsKey = JSON.stringify(Object.fromEntries((pieceSeries?.cast ?? []).map((m) => [m.id, m.kind])));
  const files = useProject({
    studios: [lyric, motion],
    snapshot: (sketchUploads) => {
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
        story && board
          ? pieceToMarkdown(pieceBrief, story, board, toolName, log, audio, { uploaded: sketchUploads })
          : story
            ? storyToMarkdown(story)
            : undefined;
      return { state, markdown };
    },
    saveDeps: [step, pieceBrief, menu, demo, story, storyRound, board, boardRound, boardApproved, log, dismissed, audio, hookVariants],
    board,
    format: pieceBrief.format,
    castKindsKey,
    projectsDir: status?.projectsDir ?? "proyectos",
    addLog,
    setError,
    setAudio,
    review: reviewMedia,
  });
  const { projectId, setProjectId, saveStatus, setSaveStatus, media, setMedia, setShotMedia, keep, removeMedia } = files;

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


  function addLog(entry: Omit<LogEntry, "at">) {
    setLog((l) => [...l, { ...entry, at: Date.now() - logStart.current }]);
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
    files.clearMedia();
    setMenu(null);
    setStory(null);
    setStoryRound(1);
    setBoard(null);
    setSetupUndo(null);
    setBoardRound(1);
    setBoardApproved(false);
    setLog([]);
    setDismissed([]);
    setAudio(DEFAULT_AUDIO);
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
    setSetupUndo(null);
    setBoardRound(st.boardRound ?? 1);
    setBoardApproved(st.boardApproved ?? false);
    setLog(st.log ?? []);
    setDismissed(st.dismissed ?? []);
    setAudio({ ...DEFAULT_AUDIO, ...(st.audio ?? {}) });
    setHookVariants(st.hookVariants ?? null);
    logStart.current = st.startedAt ?? Date.now();
    setProjectId(id);
    setStep(st.step ?? "brief");
    files.loadMedia(id, project);
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
    setSetupUndo(null);
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
    setSetupUndo(null);
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
    setSetupUndo(null);
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

  // A real-screen shot shows the series' screenshot unless the person uploaded another image for it.
  // What the video plays per shot. A real-screen shot shows the series' screenshot unless the person uploaded
  // another image; a voice file is used only when the shot's line is set to a generated or recorded voice.
  const modes = (board?.shots ?? []).map((shot, i) => voiceModeOf(audio, shot, i));
  const renderMedia = Object.fromEntries(
    (board?.shots ?? []).map((shot, i) => [
      i,
      {
        image: media[i]?.image ?? (shotFrames(shot).start.from === "screen" ? library[shot.screen]?.url : undefined),
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
      <AppHeader
        section={section}
        setSection={setSection}
        status={status}
        projectId={projectId}
        saveStatus={saveStatus}
        newPiece={newPiece}
        setShowEpisodes={setShowEpisodes}
        setShowModels={setShowModels}
      />

      {showEpisodes && (
        <Lazy>
          <EpisodesPanel onClose={() => setShowEpisodes(false)} onModels={() => (setShowEpisodes(false), setShowModels(true))} />
        </Lazy>
      )}

      {showModels && (
        <Lazy>
        <ModelsPanel
          onClose={() => setShowModels(false)}
          onChanged={() =>
            api
              .status()
              .then((s) => setStatus((old) => (old ? { ...old, writer: s.writer, voice: s.voice, lyrics: s.lyrics, imageProviders: s.imageProviders, render: s.render } : s)))
              .catch(() => undefined)
          }
        />
        </Lazy>
      )}

      {section === "ads" && (
        <AdsSection
          brief={brief}
          setBrief={setBrief}
          status={status}
          currentSeries={currentSeries}
          setSection={setSection}
          setStep={setStep}
          setShowModels={setShowModels}
        />
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
          <Lazy>
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
            maxRefs={toolsRefCap(status?.tools ?? [])}
            aiReady={Boolean(status?.writer)}
          />
          </Lazy>
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
              onImported={() => refreshProjects()}
            />
          </section>
        )}

        {step === "motion" && motion && pieceSeries && (
          <Lazy>
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
          </Lazy>
        )}

        {step === "lyrics" && lyric && pieceSeries && (
          <Lazy>
          <LyricStudio
            key={lyric.key}
            projectId={projectId}
            brief={pieceBrief}
            series={pieceSeries}
            initial={lyric.initial}
            autoSync={status?.lyrics.autoSync ?? false}
            demucs={status?.render?.demucs ?? false}
            projectsDir={status?.projectsDir ?? "proyectos"}
            onSaveStatus={setSaveStatus}
            onSeries={(series) => setStatus((s) => (s ? { ...s, series } : s))}
          />
          </Lazy>
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
              <CorrespondentOffer story={story} brief={pieceBrief} series={pieceSeries} onSeries={(series) => setStatus((s) => (s ? { ...s, series } : s))} />
              <DirectionLog log={log} />
              <StoryNotes story={story} />
            </aside>
          </section>
          </div>
        )}

        {step === "board" && story && board && (
          <div className="space-y-6">
            {roomEl}
          <Lazy>
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
              await keep(SKETCH_BASE + index, async (id) => {
                const { file: saved } = await api.uploadMedia(id, SKETCH_BASE + index, "image", file);
                setShotMedia(SKETCH_BASE + index, { imageFile: saved });
              });
            }}
            onSketchRemove={(index) => void removeMedia(SKETCH_BASE + index, "image")}
            onRevise={(note, shotNotes) => reviseBoard(note, shotNotes)}
            onFix={() => reviseBoard(fixNote(boardIssues.filter(open)), [], "fixBoard")}
            onDismiss={dismiss}
            onApprove={approveBoard}
          />
          </Lazy>
          </div>
        )}

        {step === "production" && story && board && (
          <ProductionView
            pieceBrief={pieceBrief}
            story={story}
            board={board}
            status={status}
            setStatus={setStatus}
            pieceSeries={pieceSeries}
            pieceTool={pieceTool}
            toolName={toolName}
            library={library}
            libraryVersion={libraryVersion}
            setLibraryVersion={setLibraryVersion}
            log={log}
            addLog={addLog}
            audio={audio}
            setAudio={setAudio}
            provider={provider}
            setProvider={setProvider}
            project={files}
            renderMedia={renderMedia}
            modes={modes}
            setBoard={setBoard}
            setupUndo={setupUndo}
            setSetupUndo={setSetupUndo}
            setError={setError}
            reviewMedia={reviewMedia}
            sent={sent}
            sendToAds={sendToAds}
          />
        )}
      </div>
      </>
      )}
    </div>
  );
}
