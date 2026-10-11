// Motion-graphics explainers (software or one product): the AI writes a script of scenes from templates; the person
// edits them, adds voice and music, previews with sound and renders. Follows the studio's rules: frames are a pure
// function of time, something new every 2 to 4 seconds (a check that blocks rendering), hits on the beat grid,
// -14 LUFS.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  conceptIssues,
  flagBeyond,
  cutBlurOn,
  cutPush,
  elementTimes,
  figureIssues,
  figureKey,
  posterTime,
  pushWindows,
  readingIssues,
  readingKey,
  newMotionPiece,
  planCameras,
  quietGaps,
  revealTimes,
  timeScenes,
  tweakScene,
  type MotionPiece,
  type MotionScene,
  type MotionScript,
  voiceFitSeconds,
  voiceOverrun,
  SCENE_SECONDS,
  hostScenes,
} from "../../shared/motion.ts";
import { explainerHost } from "../../shared/series.ts";
import { generatedVoice, noteSummary } from "../../shared/motionNote.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { applyFixes, conceptsBlockRender, describeScenes, MAX_ROUNDS, passes, qualityKey, type QualityRound, type QualityState } from "../../shared/motionQuality.ts";
import { api, type FinalJob, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { encodeFrames } from "../lib/encode.ts";
import { ensureFont, fontBytes } from "../lib/fonts.ts";
import { CodeDeck, codeIssues, testCode } from "../lib/codeSandbox.ts";
import { MASCOT_ASSET, type MascotCode } from "../../shared/mascot.ts";
import { samplesSig } from "../../shared/codeScene.ts";
import { codePrompt } from "../../shared/codePrompt.ts";
import type { CodeTools } from "./CodeScenePanel.tsx";
import { MOTION_TEMPLATE_LABEL } from "../../shared/motion.ts";
import { safeRect } from "../../shared/safeZone.ts";
import { floorOf } from "../lib/motion.ts";
import { slug } from "../lib/markdown.ts";
import type { PuppetAsset } from "../lib/puppet.ts";
import type { ActorAsset } from "../lib/actor.ts";
import { drawMotionFrame, scriptDuration, type MotionAsset, type MotionWorld } from "../lib/motion.ts";
import { VideoDeck, drawReady, unreadableVideos, videoSources, withOwnVideos } from "../lib/screenVideo.ts";
import { videoAssetOf } from "../../shared/screenVideo.ts";
import { TARGET_LUFS } from "../lib/motionAudio.ts";
import { contactSheet, measureFacts, sheetJpeg, type SheetFormat } from "../lib/motionQuality.ts";
import {
  LAYER_BASE,
  POSTER_BASE,
  SHEET_BASE,
  VOICE_BASE,
  arrangeScenes,
  decodeAudio,
  layerAssets,
  loadImage,
  loadPieceMedia,
  loadSeriesImages,
  makeWorld,
  motionBeats,
  motionSound,
  pieceSubtitles,
  posterJpeg,
  speechLevels,
  usesAiImages,
  monoPcm,
  trackKicks,
  nextVoiceSlot,
} from "../lib/motionProject.ts";
import type { RenderResult } from "../lib/render.ts";
import { toSrt, wordByWordOn, wordTimesFresh } from "../../shared/subtitles.ts";
import { audioDuration, type AudioFile } from "./Audio.tsx";
import { Inspector, MotionTimeline, type Selection } from "./MotionTimeline.tsx";
import { MotionPreview, useMotionPreview } from "./MotionPreview.tsx";
import { useHeardWords } from "./useHeardWords.ts";
import { pieceMarkdown } from "../lib/motionMarkdown.ts";
import { Notice } from "./ui.tsx";
import { MotionChecks } from "./MotionChecks.tsx";
import { MotionSettings } from "./MotionSettings.tsx";
import { MotionOutputs } from "./MotionOutputs.tsx";
import { ExplainerToAds } from "./ExplainerToAds.tsx";
import { MotionSceneList } from "./MotionSceneList.tsx";
import { MotionScriptBar } from "./MotionScriptBar.tsx";
import { MotionToggles } from "./MotionToggles.tsx";
import { MotionStoryboardPanel } from "./MotionStoryboardPanel.tsx";

export type MotionOpen = { piece: MotionPiece; media: Record<string, MediaRecord>; music: MediaFileRecord | null };

type Props = {
  projectId: string | null;
  brief: Brief;
  series: SeriesInfo;
  initial: MotionOpen | null;
  voiceAvailable: boolean;
  defaultVoice: string;
  projectsDir: string;
  // The final render (render.mjs) needs ffmpeg on this computer.
  ffmpeg: boolean;
  // Demucs is installed on this computer (separates a track's drums for its beat clock).
  demucs: boolean;
  // OpenAI's transcription is set up: a whole narration is cut by its words, not only its pauses.
  autoSync: boolean;
  // A writer (an AI key) is set up: "Que la IA escriba la animación" for code scenes. Without one, copy and paste.
  aiReady?: boolean;
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));


export function MotionStudio({ projectId, brief, series, initial, voiceAvailable, defaultVoice, projectsDir, ffmpeg, demucs, autoSync, aiReady = false, onSaveStatus }: Props) {
  const [piece, setPiece] = useState<MotionPiece>(() =>
    initial
      ? { ...newMotionPiece(brief.format), ...initial.piece }
      : // Without a narrator the piece starts with no voice.
        { ...newMotionPiece(brief.format), ...(brief.narrator === "without" && { voice: "none" as const }) },
  );
  const [voices, setVoices] = useState<Record<string, AudioFile>>({});
  const [layers, setLayers] = useState<HTMLImageElement[]>([]);
  const [track, setTrack] = useState<{ file: AudioFile; buffer: AudioBuffer } | null>(null);
  // "Storyboard": open or closed (closed by default, so its code loads only when asked for).
  const [boardOpen, setBoardOpen] = useState(false);
  // Demucs is splitting the track (minutes the first time).
  const [separating, setSeparating] = useState(false);
  const [castImages, setCastImages] = useState<Record<string, MotionAsset>>({});
  const [logo, setLogo] = useState<MotionAsset | null>(null);
  const [puppets, setPuppets] = useState<Record<string, PuppetAsset>>({});
  const [actors, setActors] = useState<Record<string, ActorAsset>>({});
  const [speech, setSpeech] = useState<MotionWorld["speech"]>(undefined);
  const [busy, setBusy] = useState<null | "write" | "note" | "sound" | "render" | "voice" | "upload" | "review" | "final">(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // "Nota del director": what to change in the script, the rest stays.
  const [directorNote, setDirectorNote] = useState("");
  const [soundInfo, setSoundInfo] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<(RenderResult & { url: string; format: "vertical" | "horizontal"; saved: string; srt: string })[]>([]);
  const urls = useRef<string[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  // The series' "Lo que existe hoy" and "Cómo se trabaja hoy" (null until they load): the numbers on screen must come
  // from them or the brief.
  const [seriesFacts, setSeriesFacts] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .seriesFields(series.id)
      .then(({ fields }) => live && setSeriesFacts([...fields.worksToday, ...fields.practices]))
      .catch(() => live && setSeriesFacts([]));
    return () => {
      live = false;
    };
  }, [series.id]);
  // Undo: earlier scripts, newest last.
  const past = useRef<MotionScript[]>([]);
  const lastMark = useRef({ tag: "", at: 0 });
  const [undoCount, setUndoCount] = useState(0);
  // The voices a director's note took off, by the script they belonged to: undoing that script brings them back.
  const voiceUndo = useRef(new Map<MotionScript, { voices: Record<string, AudioFile>; slots: Record<string, number> }>());
  const [reviewing, setReviewing] = useState("");
  const [sheets, setSheets] = useState<{ format: string; url: string }[]>([]);
  const [finalJob, setFinalJob] = useState<FinalJob | null>(null);
  const brand = series.brand;
  // "Personaje de los explicativos": the character a scene gets when it becomes a character scene (none: as before).
  // "Mascota en código": with no drawable host character, the series' code mascot hosts the character scenes.
  const hasMascot = Boolean(series.mascot);
  const host = explainerHost(series)?.id ?? (hasMascot ? MASCOT_ASSET : null);
  const castCharacters = useMemo(() => [...series.cast.filter((m) => m.kind === "character").map((m) => m.id), ...(hasMascot ? [MASCOT_ASSET] : [])], [series.cast, hasMascot]);
  // Its code, loaded from the series library (null until it comes, or when the series has none).
  const [mascotCode, setMascotCode] = useState<MascotCode | null>(null);
  useEffect(() => {
    let live = true;
    if (!series.mascot) {
      setMascotCode(null);
      return;
    }
    api
      .mascot(series.id)
      .then(({ mascot }) => live && setMascotCode(mascot ? { source: mascot.source, name: mascot.name, description: mascot.description } : null))
      .catch(() => live && setMascotCode(null));
    return () => {
      live = false;
    };
  }, [series.id, series.mascot?.sig]);
  // The code scenes are tested with the mascot their sandbox will carry (none until its code is here).
  const mascotTag = series.mascot?.sig || undefined;
  const mascotReady = !series.mascot || Boolean(mascotCode);
  const script = piece.script;
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const set = (patch: Partial<MotionPiece>) => setPiece((p) => ({ ...p, ...patch }));
  // Every edit keeps the writer's cameras within the rules (planCameras); the ones the person picked never change.
  const setScript = (next: MotionScript) => set({ script: { ...next, scenes: planCameras(next.scenes, next.tone) } });

  // Keeps the script as it was before an edit. Edits with the same tag close together (typing in one field, one
  // drag) undo in one step.
  const remember = useCallback((tag: string) => {
    const now = Date.now();
    const same = lastMark.current.tag === tag && now - lastMark.current.at < 1500;
    lastMark.current = { tag, at: now };
    if (same || !scriptRef.current) return;
    past.current = [...past.current.slice(-49), scriptRef.current];
    setUndoCount(past.current.length);
  }, []);
  const gestures = useRef(0);
  const begin = () => remember(`gesture-${++gestures.current}`);

  function undo() {
    const previous = past.current.pop();
    setUndoCount(past.current.length);
    lastMark.current = { tag: "", at: 0 };
    if (!previous) return;
    const kept = voiceUndo.current.get(previous);
    voiceUndo.current.delete(previous);
    if (kept) setVoices((v) => ({ ...v, ...kept.voices }));
    setPiece((p) => ({ ...p, script: previous, ...(kept && { voiceSlots: { ...p.voiceSlots, ...kept.slots } }) }));
  }

  // Changes the scenes from the newest state (drags call it many times a second).
  const editScenes = (fn: (scenes: MotionScene[]) => MotionScene[]) =>
    setPiece((p) => (p.script ? { ...p, script: { ...p.script, scenes: fn(p.script.scenes) } } : p));
  const tweak = (sceneId: string, key: string, patch: Parameters<typeof tweakScene>[2]) =>
    editScenes((list) => list.map((x) => (x.id === sceneId ? tweakScene(x, key, patch) : x)));
  const clearTweak = (sceneId: string, key: string) => {
    remember(`clear-${Date.now()}`);
    tweak(sceneId, key, { at: undefined, v: undefined, h: undefined });
  };
  const clearScene = (sceneId: string) => {
    remember(`clear-${Date.now()}`);
    editScenes((list) => list.map((x) => (x.id === sceneId ? { ...x, tweaks: {} } : x)));
  };
  const setSeconds = (sceneId: string, seconds: number) => editScenes((list) => list.map((x) => (x.id === sceneId ? { ...x, seconds } : x)));

  // "Ajustar al largo de la voz": the scene lasts its voice plus 0.4 s, its cut on a beat when the cuts follow the
  // beats. Checked against the arrangement (a cut into the product or the logo can move to a strong hit), a quarter
  // second more at a time, up to 8 s.
  function fitVoice(sceneId: string) {
    const v = voices[sceneId];
    if (!script || !v) return;
    let seconds = voiceFitSeconds(script.scenes, scenes, sceneId, v.duration, snap ? beats : []);
    if (seconds === null) return;
    for (let k = 0; k < 16 && seconds < SCENE_SECONDS.max; k++) {
      const next = seconds;
      const trial = { ...script, scenes: script.scenes.map((x) => (x.id === sceneId ? { ...x, seconds: next } : x)) };
      const grid = motionBeats(trial, piece.music, piece.kickGrid);
      const played = timeScenes(arrangeScenes(trial, grid, snap, piece.music, piece.kickGrid)).find((x) => x.id === sceneId);
      if (!played || voiceOverrun(played, v.duration) <= 0) break;
      seconds = Math.min(SCENE_SECONDS.max, Math.round((seconds + 0.25) * 1000) / 1000);
    }
    remember(`voz-${sceneId}-${Date.now()}`);
    setSeconds(sceneId, seconds);
  }

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const objectUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };

  // Brand fonts, the cast's approved images and the logo.
  useEffect(() => {
    ensureFont(brand.displayFont);
    ensureFont(brand.uiFont);
  }, [brand.displayFont, brand.uiFont]);
  useEffect(() => {
    let alive = true;
    loadSeriesImages(series).then(({ cast, logo, puppets, actors }) => {
      if (!alive) return;
      setCastImages(cast);
      setLogo(logo);
      setPuppets(puppets);
      setActors(actors);
    });
    return () => {
      alive = false;
    };
  }, [series]);

  // A saved piece brings back its voices, layers and track.
  useEffect(() => {
    if (!projectId || !initial) return;
    loadPieceMedia(projectId, { ...newMotionPiece(brief.format), ...initial.piece }, initial.media, initial.music)
      .then((loaded) => {
        setVoices(Object.fromEntries(Object.entries(loaded.voices).map(([id, v]) => [id, { ...v, url: objectUrl(v.blob) }])));
        setLayers(loaded.layers);
        if (loaded.track) setTrack({ file: { url: objectUrl(loaded.track.blob), blob: loaded.track.blob, name: loaded.track.name, duration: loaded.track.duration }, buffer: loaded.track.buffer });
      })
      .catch(() => undefined);
    // Only when the piece is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The beat grid: the synthesized score's, or the track's measured beats. Scene changes snap onto it.
  const duration = scriptDuration(script);
  const beats = useMemo(
    () => motionBeats(script, piece.music, piece.kickGrid),
    // The grid changes with the length and the tempo, not with every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [script?.music.bpm, piece.music, piece.kickGrid, duration, Boolean(script)],
  );
  const snap = piece.snap !== false;
  const scenes = useMemo(() => arrangeScenes(script, beats, snap, piece.music, piece.kickGrid), [script, beats, snap, piece.music, piece.kickGrid]);
  const snapped: MotionScript | null = script ? { ...script, scenes } : null;
  const total = scenes.reduce((n, s) => n + s.seconds, 0);

  const assets: Record<string, MotionAsset> = useMemo(() => ({ ...castImages, ...layerAssets(layers) }), [castImages, layers]);
  // "Videos de la app funcionando": one player per scene for the screens' recordings (the preview's; every capture
  // forks its own).
  const deck = useMemo(() => new VideoDeck(videoSources(castImages)), [castImages]);
  useEffect(() => () => deck.dispose(), [deck]);
  // "Escena de código": the preview's sandboxes (every render forks its own, strict).
  const codeDeck = useMemo(() => new CodeDeck({ fonts: fontBytes, format: piece.format }), [piece.format]);
  useEffect(() => () => codeDeck.dispose(), [codeDeck]);
  useEffect(() => codeDeck.setMascot(mascotCode), [codeDeck, mascotCode]);
  const usesAi = usesAiImages(scenes, series);
  // "Desenfoque en los cortes": the preview, the contact sheet, the poster and every render read it from the world.
  const cutBlur = cutBlurOn(piece);
  // The subtitles (word by word unless turned off): the preview, the contact sheet, the renders and the .srt read them.
  const subtitles = useMemo(() => pieceSubtitles(scenes, piece, voices), [scenes, piece.voice, piece.wordByWord, piece.wordTimes, voices]);
  const world: MotionWorld = useMemo(
    () => makeWorld(brand, assets, logo, beats, piece.disclosure && usesAi, { puppets, actors, speech, cutBlur, subtitles, videos: deck, code: codeDeck }),
    [brand, assets, logo, beats, piece.disclosure, usesAi, puppets, actors, speech, cutBlur, subtitles, deck, codeDeck],
  );

  // Word times for the subtitles, heard in each scene's voice (or estimated).
  const heardNote = useHeardWords(autoSync, piece, voices, brief.language, setPiece);
  const voiced = scenes.filter((s) => s.voice.trim());
  const heardCount = voiced.filter((s) => piece.voice !== "none" && wordTimesFresh(piece.wordTimes?.[s.id], s.voice, voices[s.id]?.duration)).length;
  const srtName = (format: "vertical" | "horizontal") => `${slug(script?.title ?? "") || "explicativo"}-${format === "vertical" ? "9x16" : "16x9"}.srt`;

  // How long each scene slides in over the one before (the tone's cut); the checks wait for it.
  const push = cutPush(script?.tone);
  // A dry piece with no camera journey only has hard cuts: nothing to blur.
  const pushes = pushWindows(scenes, push).length > 0;
  const gaps = quietGaps(scenes, push);
  const key = (g: { from: number; to: number }) => `${g.from.toFixed(1)}-${g.to.toFixed(1)}`;
  const openGaps = gaps.filter((g) => !piece.dismissed.includes(key(g)));
  // Lines on screen too briefly to read (about 0.3 s per word once fully in, more when the words are long).
  const openReading = readingIssues(scenes, push).filter((r) => !(piece.readingOk ?? []).includes(readingKey(r)));
  // Numbers on screen without a source in "Lo que existe hoy" or the brief, and "[VERIFY]" left on screen.
  const figureSources = useMemo(
    () => [...(seriesFacts ?? []), brief.product, brief.angle, brief.notes].join("\n"),
    [seriesFacts, brief.product, brief.angle, brief.notes],
  );
  const openFigures =
    seriesFacts === null ? [] : figureIssues(scenes, figureSources).filter((i) => i.verify || !(piece.figuresOk ?? []).includes(figureKey(i)));
  // Scenes the writer or the reviewer flagged as beyond "Lo que existe hoy" with no CONCEPTO / SIMULACIÓN label.
  const openConcepts = conceptIssues(scenes, piece.conceptsOk ?? []);
  // "Escena de código": a code scene with no code, a failed test, or a text out of the safe zone stops the render.
  const codeSig = (s: MotionScene) => samplesSig(s, piece.format, script?.tone, mascotTag);
  const openCode = codeIssues(timeScenes(scenes), piece.format, Boolean(world.disclosure), codeSig);
  const blocked = openGaps.length > 0 || openReading.length > 0 || openFigures.length > 0 || openConcepts.length > 0 || openCode.length > 0;
  // The thumbnail: frame 0 of every render.
  const posterT = posterTime(scenes, piece.poster, push);
  const posterRef = useRef<HTMLCanvasElement>(null);
  // What the poster canvas last showed, so a recording is sought again only when something it shows changed.
  const posterDrawn = useRef<{ c: HTMLCanvasElement; t: number; scenes: MotionScene[]; world: MotionWorld } | null>(null);
  useEffect(() => {
    const c = posterRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !snapped) return;
    const deck = world.videos instanceof VideoDeck ? world.videos : null;
    if (!deck || !deck.plan(snapped, posterT).length) {
      drawMotionFrame(ctx, c.width, c.height, posterT, snapped, world);
      return;
    }
    const last = posterDrawn.current;
    if (last && last.c === c && last.t === posterT && last.scenes === scenes && last.world === world) return;
    posterDrawn.current = { c, t: posterT, scenes, world };
    // A recording on screen is sought to the poster's frame first (its own players).
    void withOwnVideos(world, (own) => drawReady(own, snapped, posterT, () => drawMotionFrame(ctx, c.width, c.height, posterT, snapped, own)));
  });

  const savedState = (p: MotionPiece) => ({ version: 1, kind: "motion", step: "motion", pieceBrief: brief, motion: p });

  // Autosave.
  useEffect(() => {
    if (!projectId) return;
    onSaveStatus("saving");
    const timer = setTimeout(() => {
      api
        .saveProject(projectId, savedState(piece), pieceMarkdown(piece, scenes))
        .then(() => onSaveStatus("saved"))
        .catch((e) => {
          onSaveStatus("error");
          setError(`No se pudo guardar el proyecto: ${message(e)}`);
        });
    }, 800);
    return () => clearTimeout(timer);
    // scenes follow piece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, piece]);

  // The sound is rebuilt when anything it depends on changes: the timing, not where things sit on screen.
  const soundKey = JSON.stringify(
    timeScenes(scenes).map((s) => [s.start, s.template, s.carryIn ? "match" : s.entry ?? "cut", revealTimes(s), elementTimes(s).voice ?? null]),
  );
  // Where things sit is kept per format (their layouts differ); when they enter is shared.
  const fmt = piece.format === "vertical" ? "v" : "h";
  const preview = useMotionPreview({
    snapped,
    world,
    scenes,
    total,
    selected,
    setSelected,
    fmt,
    soundKey,
    soundDeps: [voices, piece.music, piece.voice, piece.effects, track],
    makeSound: () => makeSound(),
    buildSound: () => work("sound", makeSound),
    onError: (e) => setError(message(e)),
    remember,
    begin,
    tweak,
  });
  const { seek, timeRef, playheadRef, outside, guides, setGuides } = preview;

  // How loud each voice is over time, so the characters' mouths follow it.
  useEffect(() => {
    let alive = true;
    if (!snapped) return;
    speechLevels(snapped, piece, voices)
      .then((levels) => alive && setSpeech(levels))
      .catch(() => alive && setSpeech(undefined));
    return () => {
      alive = false;
    };
    // The timing (soundKey) and the voices decide it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundKey, voices, piece.voice]);

  // Ctrl/Cmd+Z undoes the last edit, outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  async function writeScript() {
    const result = await work("write", () => api.motion(brief, piece.durationMode === "manual" ? piece.target : null, layers.length));
    if (!result) return;
    remember(`write-${Date.now()}`);
    setSelected(null);
    set({ script: result.script, dismissed: [] });
    setNote([result.script.durationNote, result.script.note].filter(Boolean).join(" "));
  }

  // "Nota del director": the writer changes only what the note asks (mergeNote keeps the rest: ids, hand tweaks,
  // voices). A generated voice whose line changed is taken off (kept for undo); the person's own voice stays.
  async function applyNote() {
    const text = directorNote.trim();
    if (!script || !text) return;
    const result = await work("note", () => api.motionRevise(brief, script, text, layers.length));
    if (!result) return;
    if (result.demo) {
      setNote("Modo de muestra: sin una clave de IA la nota no puede cambiar nada del guion. Cargá una clave en «Modelos» y volvé a aplicarla.");
      return;
    }
    const dropped = result.voiceChanged.filter((id) => voices[id] && generatedVoice(id, voices[id].name));
    const recorded = result.voiceChanged.filter((id) => voices[id] && !generatedVoice(id, voices[id].name));
    remember(`nota-${Date.now()}`);
    if (dropped.length && scriptRef.current) {
      voiceUndo.current.set(scriptRef.current, {
        voices: Object.fromEntries(dropped.map((id) => [id, voices[id]])),
        slots: Object.fromEntries(dropped.filter((id) => piece.voiceSlots[id] !== undefined).map((id) => [id, piece.voiceSlots[id]])),
      });
      setVoices((v) => Object.fromEntries(Object.entries(v).filter(([id]) => !dropped.includes(id))));
    }
    if (selected && !result.script.scenes.some((x) => x.id === selected.sceneId)) setSelected(null);
    // A new voice for that scene goes to a new slot, so undo can still find the old file.
    setPiece((p) => ({
      ...p,
      script: { ...result.script, scenes: planCameras(result.script.scenes, result.script.tone) },
      voiceSlots: Object.fromEntries(Object.entries(p.voiceSlots).filter(([id]) => !dropped.includes(id))),
    }));
    setNote([noteSummary(result, { dropped, recorded }), result.script.note].filter(Boolean).join(" "));
    setDirectorNote("");
  }

  function fitToTarget() {
    if (!script) return;
    const k = piece.target / scriptDuration(script);
    remember(`fit-${Date.now()}`);
    setScript({ ...script, scenes: script.scenes.map((s) => ({ ...s, seconds: Math.max(2, Math.round(s.seconds * k * 2) / 2) })) });
  }

  function updateScene(id: string, patch: Partial<MotionScene>) {
    if (!script) return;
    remember(`scene-${id}-${Object.keys(patch).join(",")}`);
    setScript({ ...script, scenes: script.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function moveScene(id: string, by: number) {
    if (!script) return;
    const list = [...script.scenes];
    const i = list.findIndex((s) => s.id === id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    remember(`order-${Date.now()}`);
    setScript({ ...script, scenes: list });
  }

  async function keepVoice(sceneId: string, blob: Blob, name: string) {
    const duration = await audioDuration(blob);
    setVoices((v) => ({ ...v, [sceneId]: { url: objectUrl(blob), blob, name, duration } }));
    let slot = piece.voiceSlots[sceneId];
    if (slot === undefined) {
      // Past the slots an undo can still restore (a voice a note dropped keeps its file there).
      slot = nextVoiceSlot(piece.voiceSlots, [...voiceUndo.current.values()].map((u) => u.slots));
      setPiece((p) => ({ ...p, voiceSlots: { ...p.voiceSlots, [sceneId]: slot } }));
    }
    if (projectId) await api.uploadMedia(projectId, VOICE_BASE + slot, "voice", blob, { name, duration });
  }

  async function generateVoice(scene: MotionScene) {
    await work("voice", async () => {
      const blob = await api.speak(scene.voice, piece.ttsVoice || defaultVoice, brief.language, scene.emotion);
      await keepVoice(scene.id, blob, `voz-${scene.id}.mp3`);
    });
  }

  async function generateAllVoices() {
    for (const s of script?.scenes ?? []) if (s.voice.trim() && !voices[s.id]) await generateVoice(s);
  }

  async function addLayers(files: File[]) {
    await work("upload", async () => {
      const imgs = await Promise.all(files.filter((f) => f.type.startsWith("image/")).map((f) => loadImage(objectUrl(f))));
      const start = layers.length;
      const ok = imgs.filter((x): x is HTMLImageElement => Boolean(x)).slice(0, 12 - start);
      setLayers((l) => [...l, ...ok]);
      set({ layers: start + ok.length });
      if (projectId) for (let k = 0; k < ok.length; k++) await api.uploadMedia(projectId, LAYER_BASE + start + k, "image", files[k]);
    });
  }

  async function addTrack(file: File) {
    await work("upload", async () => {
      const buffer = await decodeAudio(file);
      const duration = buffer.duration;
      setTrack({ file: { url: objectUrl(file), blob: file, name: file.name, duration }, buffer });
      // A new track needs its own drums stem: the old grid belonged to the old one.
      set({ music: "track", kickGrid: null });
      if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
    });
  }

  // The track's beat clock, from a drums stem the person exported from the song (the kicks are measured there, never in
  // the track itself).
  async function addDrums(file: File) {
    await work("upload", async () => {
      const buffer = await decodeAudio(file);
      const grid = trackKicks(monoPcm(buffer), "stem", file.name);
      set({ kickGrid: grid });
      if (track && Math.abs(buffer.duration - track.buffer.duration) > 1) {
        setNote(`La pista de batería dura ${buffer.duration.toFixed(1)} s y el tema ${track.buffer.duration.toFixed(1)} s: fijate que sea del mismo tema y que empiece en el mismo lugar.`);
      }
    });
  }

  // The same with Demucs on this computer: the server separates the track's drums (the file as uploaded, so a song
  // split before comes from the cache) and measures the kicks there.
  async function separateDrums() {
    if (!track) return;
    setSeparating(true);
    try {
      await work("upload", async () => {
        const { kicks, cached } = await api.trackKicks(track.file.blob);
        set({ kickGrid: { ...kicks, source: "demucs", name: track.file.name } });
        if (cached) setNote("Este tema ya estaba separado: la grilla sale de la separación guardada.");
      });
    } finally {
      setSeparating(false);
    }
  }

  async function makeSound(played = snapped, grid = beats): Promise<AudioBuffer | null> {
    if (!played) return null;
    const { buffer, lufs } = await motionSound(played, piece, voices, track?.buffer ?? null);
    setSoundInfo(`Sonido: ${Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS (objetivo ${TARGET_LUFS})` : "sin sonido"} · ${grid.length ? `${grid.length} beats en la grilla` : "sin grilla"}.`);
    return buffer;
  }

  // ── Quality loop (the studio's rule: no full render before it) ──────────────────────────────────────────────
  // A brand that did not choose how it moves hashes as before, so reviews saved before that choice existed still count.
  const { motion: brandMotion, ...brandLook } = brand;
  const qualityExtra = JSON.stringify([
    brandMotion && brandMotion !== "even" ? brand : brandLook,
    piece.disclosure,
    piece.music,
    track?.file.name ?? "",
    Object.keys(voices).sort(),
  ]);
  const keyNow = script ? qualityKey(scenes, script, qualityExtra) : "";
  const quality = piece.quality ?? null;
  const reviewed = (formats: SheetFormat[]) => Boolean(quality && quality.key === keyNow && formats.every((f) => quality.formats.includes(f)));
  const reviewOk = (formats: SheetFormat[]) => reviewed(formats) && Boolean(quality!.passed || quality!.accepted);

  // Runs the rounds; returns the script as it ended (with the fixes) and the result, or null on an error.
  async function runQuality(formats: SheetFormat[]): Promise<{ script: MotionScript; quality: QualityState; poster?: MotionPiece["poster"] } | null> {
    if (!script) return null;
    setError("");
    const rounds: QualityRound[] = [];
    let working = script;
    let passed = false;
    const earlier: string[] = [];
    let lastSheets: { format: SheetFormat; blob: Blob | null }[] = [];
    let poster: MotionPiece["poster"] | undefined;
    const voiceLengths = Object.fromEntries(Object.entries(voices).map(([id, v]) => [id, v.duration]));
    const music =
      piece.music === "synth"
        ? `synthesized, ${script.music.mood}, ${script.music.bpm} bpm`
        : piece.music === "track" && track
          ? piece.kickGrid
            ? `the person's own track, its beat grid measured on its drums stem (${piece.kickGrid.kicks.length} kicks, ${Math.round(piece.kickGrid.bpm)} bpm)`
            : "the person's own track, with no beat grid (no drums stem yet, so the cuts are not on the beat)"
          : "none";
    try {
      await Promise.all([ensureFont(brand.displayFont), ensureFont(brand.uiFont)]);
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        setReviewing(`Ronda ${round} de ${MAX_ROUNDS}: armando la hoja de contactos…`);
        const roundBeats = motionBeats(working, piece.music, piece.kickGrid);
        const roundScenes = arrangeScenes(working, roundBeats, snap, piece.music, piece.kickGrid);
        const played = { ...working, scenes: roundScenes };
        const roundWorld = makeWorld(brand, assets, logo, roundBeats, piece.disclosure && usesAiImages(roundScenes, series), {
          puppets,
          actors,
          speech,
          cutBlur,
          subtitles: pieceSubtitles(roundScenes, piece, voices),
          videos: deck,
          code: codeDeck,
        });
        const made = [];
        for (const format of formats) made.push({ format, ...(await contactSheet(played, roundWorld, format)) });
        const blobs = await Promise.all(made.map((m) => new Promise<Blob | null>((done) => m.canvas.toBlob(done, "image/jpeg", 0.85))));
        setSheets(made.map((m, k) => ({ format: m.format, url: blobs[k] ? objectUrl(blobs[k]!) : "" })));
        lastSheets = made.map((m, k) => ({ format: m.format, blob: blobs[k] }));
        const facts = measureFacts(
          played,
          roundBeats,
          music,
          voiceLengths,
          made.flatMap((m) => m.outside),
          made.flatMap((m) => m.zoned),
          made.flatMap((m) => m.overlaps),
          roundWorld.brand,
          roundWorld.cutBlur === true,
          { wordByWord: wordByWordOn(piece), heard: heardCount, voiced: voiced.length },
        );
        setReviewing(`Ronda ${round} de ${MAX_ROUNDS}: la IA mira los cuadros…`);
        const { review, demo } = await api.motionReview(
          brief,
          describeScenes(roundScenes),
          facts,
          made.map((m) => ({ format: m.format, jpeg: sheetJpeg(m.canvas) })),
          round,
          earlier.join("\n"),
        );
        passed = passes(review.scores);
        // What the reviewer saw beyond "Lo que existe hoy" stays on its scene until the person labels, changes or
        // confirms it (the render waits for that).
        const flagged = flagBeyond(working, review.beyond ?? []);
        if (flagged !== working) {
          working = flagged;
          setPiece((p) => ({ ...p, script: flagged }));
        }
        // The AI picks the thumbnail unless the person already did.
        if (review.poster !== null && piece.poster?.by !== "vos") {
          poster = { t: review.poster, by: "ia" };
          const chosen = poster;
          setPiece((p) => (p.poster?.by === "vos" ? p : { ...p, poster: chosen }));
        }
        let applied: string[] = [];
        if (!passed && round < MAX_ROUNDS) {
          const fixed = applyFixes(working, review.fixes, formats);
          applied = fixed.applied;
          if (applied.length) {
            remember(`quality-${Date.now()}`);
            // A scene the reviewer turned into a character scene gets the series' character.
            working = { ...fixed.script, scenes: hostScenes(fixed.script.scenes, host, castCharacters, true) };
            const next = working;
            setPiece((p) => ({ ...p, script: next }));
          }
        }
        const pending = !passed && !applied.length ? review.fixes.map((f) => `Escena ${Math.round(f.scene)}: ${f.problem}`) : [];
        rounds.push({ round, scores: review.scores, summary: review.summary, applied, pending, demo });
        earlier.push(...applied);
        // Nothing left to change: another round would see the same thing.
        if (passed || !applied.length) break;
      }
      // The last contact sheets stay in the project's folder.
      if (projectId) {
        for (const { format, blob } of lastSheets) {
          if (blob) await api.uploadMedia(projectId, SHEET_BASE + (format === "vertical" ? 0 : 1), "image", blob).catch(() => undefined);
        }
      }
    } catch (e) {
      setError(message(e));
      setReviewing("");
      return null;
    }
    const finalBeats = motionBeats(working, piece.music, piece.kickGrid);
    const state: QualityState = {
      key: qualityKey(arrangeScenes(working, finalBeats, snap, piece.music, piece.kickGrid), working, qualityExtra),
      formats,
      passed,
      accepted: false,
      rounds,
    };
    setPiece((p) => ({ ...p, quality: state }));
    setReviewing("");
    return { script: working, quality: state, poster };
  }

  // Before any full render: the loop, unless this exact piece already passed it (or the person chose to go ahead).
  // Returns the script to render (the loop may have fixed it), or null when it should not render.
  async function ensureReviewed(
    formats: SheetFormat[],
  ): Promise<{ script: MotionScript; quality: QualityState | null; poster?: MotionPiece["poster"] } | null> {
    if (!script) return null;
    if (reviewOk(formats)) return { script, quality };
    if (reviewed(formats)) {
      // Already reviewed as it is, with scores left under 8: the panel says what; no new round until it changes.
      setError("La revisión de calidad dejó notas por debajo de 8. Arreglalo (o tocá Otra vuelta), o elegí Generar igual.");
      return null;
    }
    const result = await runQuality(formats);
    if (!result || !result.quality.passed) return null;
    // The review may have flagged a scene beyond "Lo que existe hoy" in this very run: this render waits for it too.
    const concepts = conceptsBlockRender(result.script, piece.conceptsOk ?? []);
    if (concepts) {
      setError(concepts);
      return null;
    }
    return result;
  }

  // The scenes, beats and world for a script that may be newer than this render's state.
  function playable(next: MotionScript) {
    const b = motionBeats(next, piece.music, piece.kickGrid);
    const sc = arrangeScenes(next, b, snap, piece.music, piece.kickGrid);
    const subs = pieceSubtitles(sc, piece, voices);
    return {
      played: { ...next, scenes: sc },
      beats: b,
      subtitles: subs,
      world: makeWorld(brand, assets, logo, b, piece.disclosure && usesAiImages(sc, series), { puppets, actors, speech, cutBlur, subtitles: subs, videos: deck, code: codeDeck }),
    };
  }

  async function finalRender(formats: SheetFormat[]) {
    if (!projectId) return;
    const ok = await ensureReviewed(formats);
    if (!ok) return;
    setError("");
    try {
      // The render reads the saved project: save it as it is now first.
      const saving = { ...piece, script: ok.script, quality: ok.quality ?? piece.quality, ...(ok.poster !== undefined && { poster: ok.poster }) };
      await api.saveProject(projectId, savedState(saving), pieceMarkdown(saving, playable(ok.script).played.scenes));
      const { job } = await api.startFinal(projectId, formats, location.origin);
      setFinalJob(job);
      let current = job;
      while (!current.done) {
        await new Promise((r) => setTimeout(r, 1000));
        current = (await api.finalJob(job.id)).job;
        setFinalJob(current);
      }
      if (current.error) setError(`El render final falló: ${current.error}`);
    } catch (e) {
      setError(message(e));
    }
  }

  async function render(formats: ("vertical" | "horizontal")[]) {
    const ok = await ensureReviewed(formats);
    if (!ok) return;
    const { played, beats: playedBeats, world: playedWorld, subtitles: playedSubs } = playable(ok.script);
    const cover = posterTime(played.scenes, ok.poster !== undefined ? ok.poster : piece.poster, cutPush(played.tone));
    setError("");
    setBusy("render");
    setResults([]);
    setProgress(0);
    try {
      await Promise.all([ensureFont(brand.displayFont), ensureFont(brand.uiFont)]);
      const sound = await makeSound(played, playedBeats);
      for (const [n, format] of formats.entries()) {
        const [w, h] = format === "vertical" ? [1080, 1920] : [1920, 1080];
        // A recording that cannot be read stops the render (never a still in its place in a finished video).
        const own = playedWorld.videos instanceof VideoDeck ? playedWorld.videos.fork() : null;
        const used = new Set(played.scenes.flatMap((sc) => (sc.recording ? [videoAssetOf(sc)?.id ?? ""] : [])));
        const broken = own && used.size ? await own.check(used) : [];
        if (broken.length) {
          own?.dispose();
          throw new Error(unreadableVideos(broken, series));
        }
        // The code scenes in sandboxes of their own; one that fails stops the render (never a placeholder in a video).
        const ownCode = codeDeck.fork(true);
        const failing = await ownCode.check(played, playedWorld, { w, h });
        if (failing.length) {
          ownCode.dispose();
          own?.dispose();
          throw new Error(failing.map((f) => `Escena ${f.index + 1} (código): ${f.problem}`).join(" "));
        }
        const out = await encodeFrames({
          width: w,
          height: h,
          duration: scriptDuration(played),
          audio: sound,
          // Frame 0 is the thumbnail (platforms show the first frame); every other frame is the piece as it plays. A
          // recording on screen is sought to the frame's second before it is drawn.
          draw: (ctx, t) => drawReady({ ...playedWorld, videos: own ?? undefined, code: ownCode }, played, t === 0 ? cover : t, () => drawMotionFrame(ctx, w, h, t === 0 ? cover : t, played, { ...playedWorld, videos: own ?? undefined, code: ownCode }), { w, h }),
          onProgress: (f) => setProgress((n + f) / formats.length),
        }).finally(() => {
          own?.dispose();
          ownCode.dispose();
        });
        let saved = "";
        if (projectId) {
          const file = (await api.saveVideo(projectId, out.blob, format)).file;
          saved = `${projectsDir}/${projectId}/${file}`;
          // The subtitles next to it, with its base name and the same cues.
          await api.saveSubtitles(projectId, file, toSrt(playedSubs)).catch(() => undefined);
          const poster = await posterJpeg(w, h, cover, played, playedWorld);
          if (poster) await api.uploadMedia(projectId, POSTER_BASE + (format === "vertical" ? 0 : 1), "image", poster).catch(() => undefined);
        }
        setResults((r) => [...r, { ...out, url: objectUrl(out.blob), format, saved, srt: toSrt(playedSubs) }]);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setProgress(null);
      setBusy(null);
    }
  }

  // ── "Escena de código" ───────────────────────────────────────────────────────────────────────────────────────
  const codeFormat = piece.format;
  function scenePrompt(sceneId: string, picked: string[], wish: string): string {
    const timed = timeScenes(scenes);
    const s = timed.find((x) => x.id === sceneId);
    if (!s || !script) return "";
    const [w, h] = codeFormat === "vertical" ? [1080, 1920] : [1920, 1080];
    const around = (x: (typeof timed)[number] | undefined) =>
      x ? `${MOTION_TEMPLATE_LABEL[x.template]}${x.title.trim() ? `, "${x.title.trim()}"` : ""}${x.voice.trim() ? ` (voice: "${x.voice.trim()}")` : ""}` : undefined;
    return codePrompt({
      piece: { title: script.title, problem: script.problem, tone: script.tone },
      scene: { index: s.index, count: timed.length, seconds: s.seconds, title: s.title, text: s.text, voice: s.voice, emotion: s.emotion, disclosure: s.disclosure },
      format: codeFormat,
      width: w,
      height: h,
      fps: 30,
      brand: { bg: brand.bg, text: brand.text, accent: brand.accent, displayFont: brand.displayFont, uiFont: brand.uiFont, ...(brand.motion && { motion: brand.motion }) },
      assets: picked.flatMap((id) => {
        const a = assets[id];
        if (!a) return [];
        const m = series.cast.find((c) => c.id === id);
        const kind = m ? (m.kind === "screen" ? "real screen of the app (a screenshot)" : m.kind === "product" ? "the real product (a photo or cut-out)" : m.kind) : "uploaded layer";
        return [{ name: id, kind, what: (m?.identity ?? "").slice(0, 160), width: a.video?.width ?? a.width, height: a.video?.height ?? a.height }];
      }),
      words: (subtitles ?? []).filter((c) => c.sceneId === s.id).flatMap((c) => c.words).map((x) => ({ text: x.text, start: x.start - s.start, end: x.end - s.start })),
      safe: safeRect(w, h),
      floor: floorOf(s, w, h, Boolean(world.disclosure)),
      before: around(timed[s.index - 1]),
      after: around(timed[s.index + 1]),
      current: s.code?.source,
      note: wish,
      ...(series.mascot && { mascot: { name: series.mascot.name, description: series.mascot.description } }),
    });
  }

  // Tests code in a fresh sandbox at the scene as it plays (its arranged length) and saves it with the scene.
  async function testAndSave(sceneId: string, source: string, picked: string[], quiet = false) {
    const s = timeScenes(scenes).find((x) => x.id === sceneId);
    if (!s) return { problems: [{ message: "Esa escena ya no está.", fatal: true }], saved: false, texts: 0, slowest: 0 };
    const trial = { ...s, code: { source, assets: picked } };
    const sig = samplesSig(trial, codeFormat, script?.tone, mascotTag);
    await Promise.all([ensureFont(brand.displayFont), ensureFont(brand.uiFont)]);
    const result = await testCode(source, trial, codeFormat, world, script?.tone, fontBytes, sig, undefined, mascotCode);
    const fatal = result.problems.find((p) => p.fatal);
    const saved = !fatal && Boolean(result.samples);
    if (saved) {
      if (!quiet) remember(`code-${sceneId}-${Date.now()}`);
      editScenes((list) => list.map((x) => (x.id === sceneId ? { ...x, code: { source, assets: picked, samples: result.samples! } } : x)));
    } else if (quiet && fatal) {
      // A saved code that stopped working (its scene got longer, the format changed): it stays, marked as failing.
      editScenes((list) => list.map((x) => (x.id === sceneId && x.code ? { ...x, code: { ...x.code, error: fatal.message.slice(0, 300) } } : x)));
    }
    const texts = new Set((result.samples?.frames ?? []).flat().map((t) => t.text.trim())).size;
    return { problems: result.problems, saved, texts, slowest: result.slowest };
  }

  const codeTools: CodeTools = {
    prompt: scenePrompt,
    testAndSave: (id, source, picked) => testAndSave(id, source, picked),
    ai: aiReady
      ? async (prompt) => {
          const reply = await api.sceneCode(prompt);
          if (reply.demo) throw new Error("Modo de muestra: sin una clave de IA no se escribe código. Copiá el prompt y pedíselo a Opus en claude.ai.");
          return reply.code;
        }
      : null,
  };

  // A saved code scene whose samples no longer match how it plays (its length, words or the format changed) is tested
  // again by itself, one at a time.
  const retesting = useRef(new Set<string>());
  const triedCode = useRef(new Set<string>());
  const staleKey = openCode.filter((i) => i.stale).map((i) => i.sceneId).join(",");
  useEffect(() => {
    if (!staleKey || !mascotReady) return;
    const timer = setTimeout(() => {
      for (const id of staleKey.split(",")) {
        const s = scenes.find((x) => x.id === id);
        if (!s?.code?.source || retesting.current.has(id)) continue;
        // Each scene is tested once per way it plays (never back and forth when its length settles on the beats).
        const tried = `${id}:${codeSig(s)}`;
        if (triedCode.current.has(tried)) continue;
        triedCode.current.add(tried);
        retesting.current.add(id);
        void testAndSave(id, s.code.source, s.code.assets, true).finally(() => retesting.current.delete(id));
      }
    }, 700);
    return () => clearTimeout(timer);
    // The stale scenes decide it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleKey, scenes, mascotReady]);

  const vertical = piece.format === "vertical";
  return (
    <section className="space-y-5">
      <MotionScriptBar
        series={series}
        script={script}
        total={total}
        piece={piece}
        set={set}
        busy={busy}
        writeScript={writeScript}
        fitToTarget={fitToTarget}
        directorNote={directorNote}
        setDirectorNote={setDirectorNote}
        applyNote={applyNote}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}

      {script && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            <MotionPreview preview={preview} vertical={vertical} busy={busy} soundInfo={soundInfo} />

            <MotionTimeline
              scenes={timeScenes(scenes)}
              total={total}
              beats={beats}
              gaps={openGaps}
              rawSeconds={Object.fromEntries(script.scenes.map((x) => [x.id, x.seconds]))}
              voiceLengths={Object.fromEntries(Object.entries(voices).map(([id, v]) => [id, v.duration]))}
              selected={selected}
              playheadRef={playheadRef}
              poster={posterT}
              onSeek={seek}
              onSelect={setSelected}
              onBegin={begin}
              onSceneSeconds={setSeconds}
              onElementAt={(sceneId, key, at) => tweak(sceneId, key, { at })}
            />
            <div className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-white p-3">
              <div className="min-w-0 flex-1">
                <Inspector
                  scene={timeScenes(scenes).find((x) => x.id === selected?.sceneId)}
                  selected={selected}
                  rawSeconds={script.scenes.find((x) => x.id === selected?.sceneId)?.seconds ?? 0}
                  outside={outside}
                  format={fmt}
                  onBegin={remember}
                  onTweak={(key, patch) => selected && tweak(selected.sceneId, key, patch)}
                  onClearTweak={(key) => selected && clearTweak(selected.sceneId, key)}
                  onClearScene={() => selected && clearScene(selected.sceneId)}
                  onSeconds={(seconds) => selected && setSeconds(selected.sceneId, seconds)}
                  voiceLength={selected ? voices[selected.sceneId]?.duration : undefined}
                  onFitVoice={() => selected && fitVoice(selected.sceneId)}
                />
              </div>
              <MotionToggles
                undoCount={undoCount}
                undo={undo}
                snap={snap}
                set={set}
                pushes={pushes}
                cutBlur={cutBlur}
                voiced={voiced}
                heardCount={heardCount}
                autoSync={autoSync}
                piece={piece}
                vertical={vertical}
                guides={guides}
                setGuides={setGuides}
              />
            </div>

            <MotionChecks
              scenes={scenes}
              piece={piece}
              set={set}
              seek={seek}
              setSelected={setSelected}
              updateScene={updateScene}
              openReading={openReading}
              openFigures={openFigures}
              openConcepts={openConcepts}
              openGaps={openGaps}
              gapKey={key}
              posterRef={posterRef}
              posterT={posterT}
              timeRef={timeRef}
              vertical={vertical}
              openCode={openCode}
            />
          </div>

          <div className="space-y-5">
            <MotionSettings
              piece={piece}
              set={set}
              script={script}
              setScript={setScript}
              scenes={scenes}
              brief={brief}
              autoSync={autoSync}
              demucs={demucs}
              voiceAvailable={voiceAvailable}
              busy={busy}
              generateAllVoices={generateAllVoices}
              keepVoice={keepVoice}
              track={track}
              addTrack={addTrack}
              addDrums={addDrums}
              separateDrums={separateDrums}
              separating={separating}
              addLayers={addLayers}
              layers={layers}
            />
            <MotionOutputs
              piece={piece}
              set={set}
              script={script}
              quality={quality}
              keyNow={keyNow}
              reviewing={reviewing}
              sheets={sheets}
              busy={busy}
              setBusy={setBusy}
              runQuality={runQuality}
              render={render}
              finalRender={finalRender}
              blocked={blocked}
              subtitles={subtitles}
              srtName={srtName}
              voiced={voiced}
              heardCount={heardCount}
              heardNote={heardNote}
              ffmpeg={ffmpeg}
              projectId={projectId}
              projectsDir={projectsDir}
              finalJob={finalJob}
              progress={progress}
              results={results}
              vertical={vertical}
            />
            <ExplainerToAds
              series={series.id}
              projectId={projectId}
              format={piece.format}
              spans={timeScenes(scenes).map((x) => ({ start: x.start, end: x.end, voice: x.voice }))}
              version={`${finalJob?.done ? finalJob.id : ""}-${results.length}`}
            />
          </div>
        </div>
      )}

      {script && (
        <MotionStoryboardPanel
          boardOpen={boardOpen}
          setBoardOpen={setBoardOpen}
          script={script}
          scenes={scenes}
          world={world}
          piece={piece}
          track={track}
          seek={seek}
          setSelected={setSelected}
        />
      )}

      {script && (
        <MotionSceneList
          script={script}
          scenes={scenes}
          selected={selected}
          setSelected={setSelected}
          seek={seek}
          voices={voices}
          piece={piece}
          actors={actors}
          puppets={puppets}
          series={series}
          layers={layers}
          host={host}
          castCharacters={castCharacters}
          remember={remember}
          setScript={setScript}
          updateScene={updateScene}
          moveScene={moveScene}
          fitVoice={fitVoice}
          generateVoice={generateVoice}
          keepVoice={keepVoice}
          voiceAvailable={voiceAvailable}
          busy={busy}
          codeTools={codeTools}
        />
      )}
    </section>
  );
}
