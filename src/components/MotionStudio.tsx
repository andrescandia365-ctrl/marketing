// Motion-graphics explainers (software or one product): the AI writes a script of scenes from templates; the person
// edits them, adds voice and music, previews with sound and renders. Follows the studio's rules: frames are a pure
// function of time, something new every 2 to 4 seconds (a check that blocks rendering), hits on the beat grid,
// -14 LUFS.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DURATIONS,
  MOTION_CAMERAS,
  MOTION_CAMERA_LABEL,
  SCENE_ENTRIES,
  SCENE_ENTRY_LABEL,
  BEFORE_AFTER_REVEALS,
  BEFORE_AFTER_REVEAL_LABEL,
  MOTION_GESTURES,
  MOTION_GESTURE_LABEL, MOTION_MOVES, MOTION_MOVE_LABEL,
  MOTION_MOODS,
  MOTION_MOOD_LABEL,
  MOTION_TEMPLATES,
  MOTION_TEMPLATE_LABEL,
  MOTION_TONES,
  MOTION_TONE_LABEL,
  DISCLOSURE_TAG,
  SCENE_DISCLOSURES,
  SCENE_DISCLOSURE_LABEL,
  blankScene,
  beyondNow,
  conceptIssues,
  conceptKey,
  flagBeyond,
  labelled,
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
  sceneElements,
  timeScenes,
  tweakScene,
  type MotionGesture,
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
import { applyFixes, describeScenes, MAX_ROUNDS, passes, qualityKey, type QualityRound, type QualityState } from "../../shared/motionQuality.ts";
import { api, projectFileUrl, type FinalJob, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { encodeFrames } from "../lib/encode.ts";
import { ensureFont } from "../lib/fonts.ts";
import { download, slug } from "../lib/markdown.ts";
import type { PuppetAsset } from "../lib/puppet.ts";
import type { ActorAsset } from "../lib/actor.ts";
import { drawMotionFrame, drawPhoneGuides, sceneAt, scriptDuration, type Box, type MotionAsset, type MotionWorld } from "../lib/motion.ts";
import { TARGET_LUFS } from "../lib/motionAudio.ts";
import { MixPlayer } from "../lib/playClock.ts";
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
  posterJpeg,
  speechLevels,
  usesAiImages,
  monoPcm,
  trackKicks,
} from "../lib/motionProject.ts";
import type { RenderResult } from "../lib/render.ts";
import { CopyButton } from "./ScriptView.tsx";
import { NarrationImport } from "./NarrationImport.tsx";
import { Recorder, audioDuration, type AudioFile } from "./Audio.tsx";
import { Inspector, MotionTimeline, type Selection } from "./MotionTimeline.tsx";
import { QualityPanel } from "./QualityPanel.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

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
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const smallInput = inputClass.replace("w-full", "");

function pieceMarkdown(piece: MotionPiece, scenes: MotionScene[]): string {
  const s = piece.script;
  if (!s) return "# Explicativo sin guion todavía\n";
  return `# ${s.problem}

**${s.title}** · ${scenes.reduce((n, x) => n + x.seconds, 0).toFixed(1)} s · música: ${piece.music === "synth" ? `sintetizada (${MOTION_MOOD_LABEL[s.music.mood]}, ${s.music.bpm} bpm)` : piece.music === "track" ? "tema propio" : "sin música"}

${s.caption ? `**Texto para publicar:** ${s.caption}

` : ""}**Tono:** ${MOTION_TONE_LABEL[s.tone ?? "warm"]}

${timeScenes(scenes)
  .map(
    (x) =>
      `## ${x.index + 1}. ${MOTION_TEMPLATE_LABEL[x.template]} · ${x.start.toFixed(1)}–${x.end.toFixed(1)} s${labelled(x) ? ` · **${DISCLOSURE_TAG[x.disclosure as "concept" | "simulation"]}**` : ""}\n\n${beyondNow(x) ? `- **No está en «Lo que existe hoy»:** ${x.beyond!.what}\n` : ""}- **Título:** ${x.title}\n${x.text ? `- **Texto:** ${x.text}\n` : ""}${x.items.length ? `- **Elementos:** ${x.items.join(" · ")}\n` : ""}${x.asset ? `- **Imagen:** ${x.asset}${x.assetB ? ` → ${x.assetB}` : ""}\n` : ""}${x.voice ? `- **Voz** (${x.emotion}): “${x.voice}”\n` : ""}`,
  )
  .join("\n")}
`;
}

export function MotionStudio({ projectId, brief, series, initial, voiceAvailable, defaultVoice, projectsDir, ffmpeg, demucs, autoSync, onSaveStatus }: Props) {
  const [piece, setPiece] = useState<MotionPiece>(() =>
    initial
      ? { ...newMotionPiece(brief.format), ...initial.piece }
      : // Without a narrator the piece starts with no voice.
        { ...newMotionPiece(brief.format), ...(brief.narrator === "without" && { voice: "none" as const }) },
  );
  const [voices, setVoices] = useState<Record<string, AudioFile>>({});
  const [layers, setLayers] = useState<HTMLImageElement[]>([]);
  const [track, setTrack] = useState<{ file: AudioFile; buffer: AudioBuffer } | null>(null);
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
  // The mix plays through Web Audio, whose clock drives the preview (see playClock.ts). soundFresh: the loaded mix
  // matches the piece as it is now.
  const playerRef = useRef<MixPlayer | null>(null);
  const player = () => (playerRef.current ??= new MixPlayer());
  const [playing, setPlaying] = useState(false);
  const soundFresh = useRef(false);
  const soundSeq = useRef(0);
  const [soundInfo, setSoundInfo] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<(RenderResult & { url: string; format: string; saved: string })[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const urls = useRef<string[]>([]);
  // The preview's time when the sound is not playing.
  const timeRef = useRef(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  // Where each element of the scene on screen was drawn in the last preview frame, by "sceneId:key".
  const boxes = useRef(new Map<string, Box>());
  const canvasDrag = useRef<{ sceneId: string; key: string; x0: number; y0: number; dx0: number; dy0: number } | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [outside, setOutside] = useState(false);
  const outsideRef = useRef(false);
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
  // The phone's own interface drawn over the 9:16 preview (editor only).
  const [guides, setGuides] = useState(true);
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
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
  const host = explainerHost(series)?.id ?? null;
  const castCharacters = useMemo(() => series.cast.filter((m) => m.kind === "character").map((m) => m.id), [series.cast]);
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

  function seek(t: number) {
    timeRef.current = Math.max(0, t);
    playerRef.current?.seek(timeRef.current);
  }

  function pause() {
    const p = playerRef.current;
    if (p?.playing) {
      p.pause();
      timeRef.current = p.time();
    }
    setPlaying(false);
  }

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => () => playerRef.current?.close(), []);
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
  const usesAi = usesAiImages(scenes, series);
  // "Desenfoque en los cortes": the preview, the contact sheet, the poster and every render read it from the world.
  const cutBlur = cutBlurOn(piece);
  const world: MotionWorld = useMemo(
    () => makeWorld(brand, assets, logo, beats, piece.disclosure && usesAi, { puppets, actors, speech, cutBlur }),
    [brand, assets, logo, beats, piece.disclosure, usesAi, puppets, actors, speech, cutBlur],
  );

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
  const blocked = openGaps.length > 0 || openReading.length > 0 || openFigures.length > 0 || openConcepts.length > 0;
  // The thumbnail: frame 0 of every render.
  const posterT = posterTime(scenes, piece.poster, push);
  const posterRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = posterRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx && snapped) drawMotionFrame(ctx, c.width, c.height, posterT, snapped, world);
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
    timeScenes(scenes).map((s) => [s.start, s.template, s.entry ?? "cut", revealTimes(s), elementTimes(s).voice ?? null]),
  );
  // A change makes the loaded mix stale. While it plays, a new mix is built after a short pause in the edits and
  // carries on from the same second; stopped, the next ▶ builds it.
  useEffect(() => {
    soundFresh.current = false;
    ++soundSeq.current;
    if (!playerRef.current?.playing) {
      playerRef.current?.setBuffer(null);
      return;
    }
    const timer = setTimeout(refreshMix, 450);
    return () => clearTimeout(timer);
    // The keys below say when the mix changes; refreshMix reads the newest piece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundKey, voices, piece.music, piece.voice, piece.effects, track]);

  // Builds the mix of the piece as it is now and swaps it in while playing (same second). A newer change wins.
  function refreshMix() {
    const seq = soundSeq.current;
    makeSoundRef
      .current()
      .then((buffer) => {
        if (seq !== soundSeq.current || !buffer) return;
        soundFresh.current = true;
        playerRef.current?.setBuffer(buffer);
      })
      .catch((e) => setError(message(e)));
  }

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

  // Live preview: frame t follows the player while it plays, else the timeline's time. The selected element gets a
  // dashed outline (the editor's, never in the video).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const mix = playerRef.current;
      if (mix?.playing) timeRef.current = mix.time();
      const t = timeRef.current;
      if (canvas && ctx && snapped) {
        const found = new Map<string, Box>();
        drawMotionFrame(ctx, canvas.width, canvas.height, t, snapped, world, (sceneId, key, box) => found.set(`${sceneId}:${key}`, box));
        boxes.current = found;
        const sel = selectedRef.current;
        const box = sel?.key ? found.get(`${sel.sceneId}:${sel.key}`) : undefined;
        const out = Boolean(box && (box.x < -1 || box.y < -1 || box.x + box.w > canvas.width + 1 || box.y + box.h > canvas.height + 1));
        if (out !== outsideRef.current) {
          outsideRef.current = out;
          setOutside(out);
        }
        if (guidesRef.current) drawPhoneGuides(ctx, canvas.width, canvas.height);
        if (box) {
          ctx.save();
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
          ctx.lineDashOffset = 5;
          ctx.strokeStyle = "#5b49c9";
          ctx.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
          ctx.restore();
        }
      }
      const total = snapped ? scriptDuration(snapped) : 0;
      if (playheadRef.current) playheadRef.current.style.left = `${total ? Math.min(100, (t / total) * 100) : 0}%`;
      if (clockRef.current) clockRef.current.textContent = `${t.toFixed(1)} s`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [snapped, world]);

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

  // On the preview: touch an element to select it and drag it where it goes. The move is a share of the frame's
  // short side, so it lands in the same place at 1080 px.
  function canvasPoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  }

  // Where things sit is kept per format (their layouts differ); when they enter is shared.
  const fmt = piece.format === "vertical" ? "v" : "h";

  function canvasDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    pause();
    const point = canvasPoint(e);
    const hits = [...boxes.current.entries()].filter(([, b]) => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
    // The last drawn is on top; the smallest wins among overlapping ones.
    const hit = hits.reverse().sort((a, b) => a[1].w * a[1].h - b[1].w * b[1].h)[0];
    if (!hit) {
      const timed = timeScenes(scenes);
      const s = timed[sceneAt(timed, timeRef.current)];
      if (s) setSelected({ sceneId: s.id, key: null });
      return;
    }
    const [id, key] = hit[0].split(":");
    setSelected({ sceneId: id, key });
    const scene = scenes.find((x) => x.id === id);
    const el = scene && sceneElements(scene).find((x) => x.key === key);
    if (!el?.move) return;
    begin();
    e.currentTarget.setPointerCapture(e.pointerId);
    const spot = scene!.tweaks?.[key]?.[fmt];
    canvasDrag.current = { sceneId: id, key, x0: point.x, y0: point.y, dx0: spot?.dx ?? 0, dy0: spot?.dy ?? 0 };
  }

  function canvasMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const d = canvasDrag.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const point = canvasPoint(e);
    const unit = Math.min(canvas.width, canvas.height);
    const round = (x: number) => Math.round(x * 1000) / 1000;
    tweak(d.sceneId, d.key, { [fmt]: { dx: round(d.dx0 + (point.x - d.x0) / unit), dy: round(d.dy0 + (point.y - d.y0) / unit) } });
  }

  function canvasKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (!dir || !selected?.key) return;
    const scene = scenes.find((x) => x.id === selected.sceneId);
    if (!scene || !sceneElements(scene).find((x) => x.key === selected.key)?.move) return;
    e.preventDefault();
    remember(`nudge-${selected.sceneId}-${selected.key}`);
    const step = e.shiftKey ? 0.025 : 0.005;
    const spot = scene.tweaks?.[selected.key]?.[fmt];
    const round = (x: number) => Math.round(x * 1000) / 1000;
    tweak(selected.sceneId, selected.key, { [fmt]: { dx: round((spot?.dx ?? 0) + dir[0] * step), dy: round((spot?.dy ?? 0) + dir[1] * step) } });
  }

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
      slot = Object.values(piece.voiceSlots).reduce((n, x) => Math.max(n, x + 1), 0);
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
  // The newest render's makeSound, for mixes built after an await or a timer.
  const makeSoundRef = useRef(makeSound);
  makeSoundRef.current = makeSound;

  // ▶ / ❚❚: builds the mix when the loaded one is stale, then plays from the preview's second.
  async function togglePlay() {
    const p = player();
    if (p.playing) return pause();
    if (!soundFresh.current || !p.ready) {
      const seq = soundSeq.current;
      const buffer = await work("sound", makeSound);
      if (!buffer) return;
      // The piece changed while the mix was being built: the next ▶ builds it again.
      soundFresh.current = seq === soundSeq.current;
      p.setBuffer(buffer);
    }
    p.onEnd = () => {
      timeRef.current = p.time();
      setPlaying(false);
    };
    await p.play(timeRef.current < total - 0.1 ? timeRef.current : 0);
    setPlaying(true);
    // Something changed while the mix was being built: the newest one replaces it as it plays.
    if (!soundFresh.current) refreshMix();
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
        const roundWorld = makeWorld(brand, assets, logo, roundBeats, piece.disclosure && usesAiImages(roundScenes, series), { puppets, actors, speech, cutBlur });
        const made = formats.map((format) => ({ format, ...contactSheet(played, roundWorld, format) }));
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
    return result && result.quality.passed ? result : null;
  }

  // The scenes, beats and world for a script that may be newer than this render's state.
  function playable(next: MotionScript) {
    const b = motionBeats(next, piece.music, piece.kickGrid);
    const sc = arrangeScenes(next, b, snap, piece.music, piece.kickGrid);
    return { played: { ...next, scenes: sc }, beats: b, world: makeWorld(brand, assets, logo, b, piece.disclosure && usesAiImages(sc, series), { puppets, actors, speech, cutBlur }) };
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
    const { played, beats: playedBeats, world: playedWorld } = playable(ok.script);
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
        const out = await encodeFrames({
          width: w,
          height: h,
          duration: scriptDuration(played),
          audio: sound,
          // Frame 0 is the thumbnail (platforms show the first frame); every other frame is the piece as it plays.
          draw: (ctx, t) => drawMotionFrame(ctx, w, h, t === 0 ? cover : t, played, playedWorld),
          onProgress: (f) => setProgress((n + f) / formats.length),
        });
        let saved = "";
        if (projectId) {
          saved = `${projectsDir}/${projectId}/${(await api.saveVideo(projectId, out.blob, format)).file}`;
          const poster = await posterJpeg(w, h, cover, played, playedWorld);
          if (poster) await api.uploadMedia(projectId, POSTER_BASE + (format === "vertical" ? 0 : 1), "image", poster).catch(() => undefined);
        }
        setResults((r) => [...r, { ...out, url: objectUrl(out.blob), format, saved }]);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setProgress(null);
      setBusy(null);
    }
  }

  const vertical = piece.format === "vertical";
  const assetOptions = [
    ...series.cast
      .filter((m) => m.kind !== "character" || m.image || m.puppet?.layers.length || m.rig?.file)
      .map((m) => ({
        value: m.id,
        label: `${m.name} (${m.kind === "screen" ? "pantalla" : m.kind === "product" ? "producto" : m.kind === "place" ? "lugar" : m.rig?.file ? "personaje · camina" : m.puppet?.layers.length ? "personaje · títere 3D" : "personaje"})${m.image || m.puppet?.layers.length || m.rig?.file ? "" : " · sin imagen"}`,
      })),
    ...layers.map((_, k) => ({ value: `layer:${k}`, label: `Capa ${k + 1} (Grok)` })),
  ];

  return (
    <section className="space-y-5">
      <div>
        <p className="font-mono text-xs text-muted">{series.name} · explicativo (motion graphics)</p>
        <h2 className="text-xl font-bold tracking-tight">{script?.problem || "Explicativo sin guion todavía"}</h2>
        {script && <p className="text-sm text-muted">{script.title} · {total.toFixed(1)} s</p>}
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-white p-4">
        <Field label="Duración" group hint="Automática: la IA la elige según el tema. A mano: elegís los segundos.">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={piece.durationMode}
              onChange={(durationMode) => set({ durationMode })}
              options={[
                { value: "auto", label: "Automática" },
                { value: "manual", label: "A mano" },
              ]}
            />
            {piece.durationMode === "manual" && (
              <Segmented
                value={String(piece.target)}
                onChange={(v) => set({ target: Number(v) })}
                options={DURATIONS.map((d) => ({ value: String(d), label: `${d} s` }))}
              />
            )}
          </div>
        </Field>
        <Button onClick={writeScript} disabled={busy !== null}>
          {busy === "write" ? (
            <>
              <Spinner /> Escribiendo…
            </>
          ) : script ? (
            "Escribir otro guion"
          ) : (
            "Escribir el explicativo"
          )}
        </Button>
        {script && piece.durationMode === "manual" && Math.abs(total - piece.target) > 1 && (
          <Button variant="secondary" onClick={fitToTarget}>
            Ajustar a {piece.target} s
          </Button>
        )}
      </div>

      {script && (
        <div className="space-y-2 rounded-xl border border-line bg-white p-4">
          <label className="block">
            <span className="text-sm font-semibold">Nota del director</span>
            <span className="block text-xs text-muted">Qué cambiar. La IA toca solo eso y deja el resto como está, con tus ajustes y tus voces.</span>
            <textarea
              className={`${inputClass} mt-1.5 text-sm`}
              rows={2}
              value={directorNote}
              placeholder="ej. el gancho tarda mucho; en la escena 3 mostrá la pantalla de pedidos; sacá la estadística"
              onChange={(e) => setDirectorNote(e.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={applyNote} disabled={!directorNote.trim() || busy !== null}>
            {busy === "note" ? (
              <>
                <Spinner /> Aplicando la nota…
              </>
            ) : (
              "Aplicar la nota"
            )}
          </Button>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}

      {script && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            <div className="flex justify-center rounded-xl bg-black/90 p-3">
              <canvas
                ref={canvasRef}
                width={vertical ? 360 : 640}
                height={vertical ? 640 : 360}
                tabIndex={0}
                aria-label="Vista previa del explicativo: tocá un elemento y arrastralo para moverlo"
                className={`touch-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-touch ${vertical ? "h-[640px] max-h-[70vh] w-auto" : "w-full"}`}
                onPointerDown={canvasDown}
                onPointerMove={canvasMove}
                onPointerUp={() => (canvasDrag.current = null)}
                onPointerCancel={() => (canvasDrag.current = null)}
                onKeyDown={canvasKey}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={togglePlay} disabled={busy !== null && !playing}>
                {busy === "sound" ? <Spinner /> : playing ? "❚❚" : "▶"} {playing ? "Pausa" : "Reproducir con sonido"}
              </Button>
              <span className="min-w-0 flex-1 text-xs text-muted">Para ir a otro segundo, tocá la regla de la línea de tiempo.</span>
              <span ref={clockRef} className="w-14 text-right font-mono text-xs text-muted">
                0.0 s
              </span>
            </div>
            {soundInfo && <p className="text-xs text-muted">{soundInfo}</p>}

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
              <div className="flex shrink-0 flex-col items-end gap-2 text-xs">
                <Button variant="secondary" className="px-2 py-1 text-xs" disabled={undoCount === 0} onClick={undo} title="Ctrl+Z">
                  ↶ Deshacer
                </Button>
                <label className="flex items-center gap-1.5" title="Los cortes de escena caen en los beats de la música">
                  <input type="checkbox" checked={snap} onChange={(e) => set({ snap: e.target.checked })} />
                  Cortes en los beats
                </label>
                <label
                  className={`flex items-center gap-1.5 ${pushes ? "" : "text-muted"}`}
                  title={
                    pushes
                      ? "Mientras una escena entra empujando a la anterior, lo que se mueve deja un rastro, como con una cámara. Fuera de los cortes no cambia nada."
                      : "Este guion corta seco: no hay empuje entre escenas para desenfocar."
                  }
                >
                  <input type="checkbox" checked={cutBlur} disabled={!pushes} onChange={(e) => set({ cutBlur: e.target.checked })} />
                  Desenfoque en los cortes
                </label>
                {vertical && (
                  <label
                    className="flex items-center gap-1.5"
                    title="Dónde Reels, TikTok y Shorts ponen su barra, su texto y sus botones (medidas aproximadas). Solo se ve acá, nunca en el video."
                  >
                    <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
                    Ver lo que tapa la app
                  </label>
                )}
              </div>
            </div>

            <div className={`rounded-xl border p-3 text-sm ${openReading.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
              {openReading.length ? (
                <>
                  <p className="font-semibold text-neg">Se lee: {openReading.length} texto(s) no llegan a leerse. No se puede generar hasta arreglarlo.</p>
                  <ul className="mt-1 space-y-1">
                    {openReading.map((r) => (
                      <li key={readingKey(r)} className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => {
                            const at = timeScenes(scenes).find((x) => x.id === r.sceneId);
                            if (at) seek(at.end - 0.1);
                            setSelected({ sceneId: r.sceneId, key: r.key === "voice" ? null : r.key });
                          }}
                        >
                          Escena {r.index + 1} · {r.label} (“{r.text.length > 40 ? `${r.text.slice(0, 40)}…` : r.text}”): queda quieto {r.has.toFixed(1)} s y necesita {r.needs.toFixed(1)} s. Hacelo entrar antes, acortalo o alargá la escena.
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-muted hover:text-ink"
                          onClick={() => set({ readingOk: [...(piece.readingOk ?? []), readingKey(r)] })}
                        >
                          No es un problema
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="font-semibold text-good">✓ Cada texto se queda lo suficiente para leerlo.</p>
              )}
            </div>

            <div className={`rounded-xl border p-3 text-sm ${openFigures.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
              {openFigures.length ? (
                <>
                  <p className="font-semibold text-neg">
                    Cifras con fuente: {openFigures.length} sin fuente o con [VERIFY]. No se puede generar hasta arreglarlo.
                  </p>
                  <ul className="mt-1 space-y-1">
                    {openFigures.map((i) => (
                      <li key={figureKey(i)} className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => {
                            const at = timeScenes(scenes).find((x) => x.id === i.sceneId);
                            if (at) seek(at.end - 0.1);
                            setSelected({ sceneId: i.sceneId, key: i.key === "voice" ? null : i.key });
                          }}
                        >
                          {i.verify
                            ? `Escena ${i.index + 1} · ${i.label} lleva [VERIFY]: confirmalo y sacá la marca, o cambiá el texto.`
                            : `Escena ${i.index + 1} · ${i.label}: “${i.figure}” no está en la serie («Lo que existe hoy», «Cómo se trabaja hoy») ni en el brief. Sumalo a la serie si es real, o cambialo.`}
                        </button>
                        {!i.verify && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-muted hover:text-ink"
                            title="Es real, o es claramente un ejemplo (una hora, un paso)"
                            onClick={() => set({ figuresOk: [...(piece.figuresOk ?? []), figureKey(i)] })}
                          >
                            Lo confirmo
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="font-semibold text-good">✓ Cada número tiene fuente.</p>
              )}
            </div>

            {openConcepts.length > 0 && (
              <div className="rounded-xl border border-neg/40 bg-neg-soft p-3 text-sm">
                <p className="font-semibold text-neg">
                  Lo que existe hoy: {openConcepts.length} escena(s) muestran algo que no está en la serie y se ven como reales. No se puede generar hasta
                  arreglarlo.
                </p>
                <ul className="mt-1 space-y-1">
                  {openConcepts.map((i) => (
                    <li key={conceptKey(i)} className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => {
                          const at = timeScenes(scenes).find((x) => x.id === i.sceneId);
                          if (at) seek(at.start + Math.min(1, at.seconds / 2));
                          setSelected({ sceneId: i.sceneId, key: null });
                        }}
                      >
                        Escena {i.index + 1}: “{i.what}” no está en «Lo que existe hoy» (lo marcó {i.by === "ia" ? "la IA al escribir" : "la revisión"}). Marcala como
                        concepto o simulación, o cambiá la escena.
                      </button>
                      <span className="flex gap-2">
                        <button type="button" className="text-xs font-semibold text-ink hover:underline" onClick={() => updateScene(i.sceneId, { disclosure: "concept" })}>
                          Concepto
                        </button>
                        <button type="button" className="text-xs font-semibold text-ink hover:underline" onClick={() => updateScene(i.sceneId, { disclosure: "simulation" })}>
                          Simulación
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-muted hover:text-ink"
                          title="Existe hoy: sumalo también a «Lo que existe hoy» de la serie"
                          onClick={() => set({ conceptsOk: [...(piece.conceptsOk ?? []), conceptKey(i)] })}
                        >
                          Lo confirmo
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
              <canvas
                ref={posterRef}
                width={vertical ? 108 : 192}
                height={vertical ? 192 : 108}
                aria-label="Portada"
                className="rounded border border-line"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-semibold">Portada (el primer cuadro del video)</p>
                <p className="text-xs text-muted">
                  X, Slack y Discord muestran el primer cuadro como miniatura. Ahora: {posterT.toFixed(1)} s ·{" "}
                  {piece.poster?.by === "vos" ? "la elegiste vos" : piece.poster?.by === "ia" ? "la eligió la IA" : "automática (el gancho entero)"}
                  {piece.poster && Math.abs(posterT - piece.poster.t) > 0.01 ? " (se corrió para no caer en un corte)" : ""}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => set({ poster: { t: Math.round(timeRef.current * 100) / 100, by: "vos" } })}>
                    Usar el cuadro de ahora
                  </Button>
                  {piece.poster && (
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => set({ poster: null })}>
                      Automática
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className={`rounded-xl border p-3 text-sm ${openGaps.length ? "border-neg/40 bg-neg-soft" : "border-good/30 bg-good-soft"}`}>
              {openGaps.length ? (
                <>
                  <p className="font-semibold text-neg">Algo nuevo cada 2 a 4 s: {openGaps.length} tramo(s) quieto(s). No se puede generar hasta arreglarlo.</p>
                  <ul className="mt-1 space-y-1">
                    {openGaps.map((g) => (
                      <li key={key(g)} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Entre {g.from.toFixed(1)} y {g.to.toFixed(1)} s no aparece nada nuevo. Partí la escena, sumá un elemento o acortala.
                        </span>
                        <button type="button" className="text-xs font-semibold text-muted hover:text-ink" onClick={() => set({ dismissed: [...piece.dismissed, key(g)] })}>
                          No es un problema
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="font-semibold text-good">✓ Algo nuevo cada 2 a 4 s.</p>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <Field label="Voz" group>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={piece.voice}
                  onChange={(voice) => set({ voice })}
                  options={[
                    { value: "generated", label: "Generada" },
                    { value: "recorded", label: "Grabada o subida" },
                    { value: "none", label: "Sin voz" },
                  ]}
                />
                {piece.voice === "generated" && (
                  <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!voiceAvailable || busy !== null} onClick={generateAllVoices}>
                    Generar todas
                  </Button>
                )}
              </div>
              {piece.voice === "generated" && !voiceAvailable && <p className="mt-1 text-xs text-muted">La voz generada necesita OPENAI_API_KEY.</p>}
            </Field>

            {piece.voice !== "none" && (
              <NarrationImport
                lines={timeScenes(scenes).flatMap((s) =>
                  s.voice.trim() ? [{ key: s.id, label: `Escena ${s.index + 1}`, speaker: "", text: s.voice, emotion: s.emotion }] : [],
                )}
                narratorKeys={[]}
                language={brief.language}
                autoSync={autoSync}
                room={Object.fromEntries(scenes.map((s) => [s.id, s.seconds]))}
                onParts={async (parts) => {
                  for (const p of parts) await keepVoice(p.key, p.blob, `voz-${p.key}.wav`);
                  set({ voice: "recorded" });
                }}
              />
            )}

            <Field label="Tono" group hint="Sale de la voz del brief. Seco: cortes secos y casi sin efectos. Cálido: pasa de escena con un empuje suave. Absurdo: cortes rápidos y más efectos.">
              <Segmented
                value={script.tone ?? "warm"}
                onChange={(tone) => setScript({ ...script, tone })}
                options={MOTION_TONES.map((t) => ({ value: t, label: MOTION_TONE_LABEL[t] }))}
              />
            </Field>

            <Field
              label="Texto para publicar"
              hint="De 1 a 3 frases para pegar en X, LinkedIn o Instagram, en el tono de la pieza. Lo que no esté confirmado va con [VERIFY]."
            >
              <textarea
                className={`${inputClass} text-sm`}
                rows={3}
                aria-label="Texto para publicar"
                value={script.caption ?? ""}
                onChange={(e) => setScript({ ...script, caption: e.target.value })}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <CopyButton text={script.caption ?? ""} idle="Copiar el texto" variant="secondary" />
                {/\[VERIFY\]/.test(script.caption ?? "") && <span className="text-xs text-neg">Tiene datos sin confirmar: sacá el [VERIFY] solo cuando lo confirmes.</span>}
              </div>
            </Field>

            <Field label="Efectos de sonido" group hint="La biblioteca libre (dominio público, Kenney y teclas) o sintetizados. Suenan al empezar cada movimiento.">
              <Segmented
                value={piece.effects ?? "library"}
                onChange={(effects) => set({ effects })}
                options={[
                  { value: "library", label: "Biblioteca libre" },
                  { value: "synth", label: "Sintetizados" },
                  { value: "none", label: "Sin efectos" },
                ]}
              />
            </Field>

            <Field label="Música" group hint="Sintetizada en código, o tu tema: los cortes caen en sus beats, y el producto y el logo en los golpes más fuertes.">
              <div className="space-y-2">
                <Segmented
                  value={piece.music}
                  onChange={(music) => set({ music })}
                  options={[
                    { value: "synth", label: "Sintetizada" },
                    { value: "track", label: "Tema propio" },
                    { value: "none", label: "Sin música" },
                  ]}
                />
                {piece.music === "synth" && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      className={`${smallInput} py-1 text-xs`}
                      value={script.music.mood}
                      aria-label="Clima de la música"
                      onChange={(e) => setScript({ ...script, music: { ...script.music, mood: e.target.value as MotionScript["music"]["mood"] } })}
                    >
                      {MOTION_MOODS.map((m) => (
                        <option key={m} value={m}>
                          {MOTION_MOOD_LABEL[m]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1">
                      <input
                        type="number"
                        min={80}
                        max={130}
                        className={`${smallInput} w-16 px-2 py-1 text-xs`}
                        value={script.music.bpm}
                        onChange={(e) => setScript({ ...script, music: { ...script.music, bpm: Math.max(80, Math.min(130, Number(e.target.value) || 100)) } })}
                      />
                      bpm
                    </label>
                  </div>
                )}
                {piece.music === "track" && (
                  <input type="file" accept="audio/*" aria-label="Subir el tema" className="text-sm" onChange={(e) => e.target.files?.[0] && addTrack(e.target.files[0])} />
                )}
                {piece.music === "track" && track && (
                  <div className="space-y-1.5 rounded-lg border border-line p-2 text-xs">
                    {piece.kickGrid ? (
                      <p className="text-good">
                        Grilla del tema: {piece.kickGrid.kicks.length} bombos, {Math.round(piece.kickGrid.bpm)} bpm, {piece.kickGrid.downbeats.length} primeros tiempos, de{" "}
                        {piece.kickGrid.source === "demucs" ? "Demucs" : piece.kickGrid.name} (error mediano {piece.kickGrid.medianErrorMs} ms)
                        {piece.kickGrid.usable ? "" : ". El tempo cambia: los cortes van a los bombos que hay"}.
                      </p>
                    ) : (
                      <p className="text-neg">
                        Sin grilla: los cortes no se pegan al tema. La app mide el beat solo en la pista de batería, nunca en el tema entero.
                      </p>
                    )}
                    <label className="block">
                      <span className="text-muted">Pista de batería del mismo tema (la exporta tu programa de música o un separador de pistas):</span>
                      <input type="file" accept="audio/*" aria-label="Subir la pista de batería" className="mt-1 block text-xs" onChange={(e) => e.target.files?.[0] && addDrums(e.target.files[0])} />
                    </label>
                    {demucs ? (
                      <div className="space-y-1">
                        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={separateDrums}>
                          {separating ? (
                            <>
                              <Spinner /> Separando con Demucs…
                            </>
                          ) : (
                            "Separar la batería con Demucs"
                          )}
                        </Button>
                        {!piece.kickGrid && <p className="text-muted">Unos minutos la primera vez; después el tema queda separado.</p>}
                      </div>
                    ) : (
                      !piece.kickGrid && (
                        <p className="text-muted">
                          ¿No tenés la pista de batería? Con Demucs instalado en esta compu, la app la separa sola (Modelos → Demucs).
                        </p>
                      )
                    )}
                  </div>
                )}
                {piece.music === "track" && track && <p className="text-xs text-muted">{track.file.name}</p>}
              </div>
            </Field>

            <Field label="Capas de Grok" group hint="Las capas que separa Grok (Segmentos → Descargar todo). Quedan para usar en las escenas.">
              <input
                type="file"
                accept="image/png,image/webp,image/*"
                multiple
                aria-label="Subir capas"
                className="text-sm"
                onChange={(e) => {
                  if (e.target.files?.length) addLayers([...e.target.files]);
                  e.target.value = "";
                }}
              />
              {layers.length > 0 && <p className="mt-1 text-xs text-muted">{layers.length} capa(s).</p>}
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={piece.disclosure} onChange={(e) => set({ disclosure: e.target.checked })} />
              <span>
                <b>Aviso de IA</b>
                <span className="block text-xs text-muted">Si alguna imagen la hizo una IA (capas, personajes, producto), una línea chica al pie.</span>
              </span>
            </label>

            <Field label="Video" group>
              <Segmented
                value={piece.format}
                onChange={(format) => set({ format })}
                options={[
                  { value: "vertical", label: "Vertical 9:16" },
                  { value: "horizontal", label: "Horizontal 16:9" },
                ]}
              />
            </Field>
            <QualityPanel
              quality={quality}
              current={Boolean(quality && quality.key === keyNow)}
              running={reviewing}
              sheets={sheets}
              disabled={busy !== null || Boolean(reviewing)}
              onRun={async () => {
                setBusy("review");
                await runQuality(quality?.key === keyNow && quality.formats.length > 1 ? quality.formats : [piece.format]);
                setBusy(null);
              }}
              onAccept={() => quality && set({ quality: { ...quality, accepted: true } })}
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => render([piece.format])} disabled={busy !== null || Boolean(reviewing) || blocked}>
                {busy === "render" ? (
                  <>
                    <Spinner /> Generando…
                  </>
                ) : (
                  `Generar ${vertical ? "9:16" : "16:9"}`
                )}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => render(["vertical", "horizontal"])} disabled={busy !== null || Boolean(reviewing) || blocked}>
                Los dos formatos
              </Button>
            </div>
            <p className="text-xs text-muted">Generar arma el video en el navegador. El render final lo hace ffmpeg en tu compu: H.264, CRF 16, la mejor calidad.</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={async () => {
                  setBusy("final");
                  await finalRender([piece.format]);
                  setBusy(null);
                }}
                disabled={!ffmpeg || !projectId || busy !== null || Boolean(reviewing) || blocked}
              >
                {busy === "final" ? (
                  <>
                    <Spinner /> Render final…
                  </>
                ) : (
                  `Render final ${vertical ? "9:16" : "16:9"}`
                )}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={async () => {
                  setBusy("final");
                  await finalRender(["vertical", "horizontal"]);
                  setBusy(null);
                }}
                disabled={!ffmpeg || !projectId || busy !== null || Boolean(reviewing) || blocked}
              >
                Render final de los dos
              </Button>
            </div>
            {!ffmpeg && <p className="text-xs text-neg">Para el render final hace falta ffmpeg. En la Mac: <code>brew install ffmpeg</code>, o volvé a correr <code>bash iniciar.sh</code>.</p>}
            {finalJob && (
              <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-xs">
                {!finalJob.done ? (
                  <>
                    <p>
                      Render final ({finalJob.current === "vertical" ? "9:16" : "16:9"}): {Math.round(finalJob.progress * 100)}%. Cada cuadro sale de <code>seek(t)</code> y va sin pérdida a ffmpeg.
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full bg-good transition-all" style={{ width: `${finalJob.progress * 100}%` }} />
                    </div>
                  </>
                ) : finalJob.error ? (
                  <p className="text-neg">El render final no terminó.</p>
                ) : (
                  finalJob.files.map((file) => (
                    <div key={file} className="space-y-1">
                      <video
                        src={`${projectFileUrl(finalJob.project, file)}?v=${finalJob.id}`}
                        controls
                        playsInline
                        className={`mx-auto w-full rounded-lg bg-black ${file.includes("vertical") ? "max-h-[70vh] w-auto" : ""}`}
                      />
                      <p className="text-good">
                        Render final (H.264, CRF 16): {projectsDir}/{finalJob.project}/{file}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
            {progress !== null && (
              <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
            {results.map((r) => (
              <div key={r.format} className="space-y-2">
                <video src={r.url} controls playsInline className={`mx-auto w-full rounded-lg bg-black ${r.format === "vertical" ? "max-h-[70vh] w-auto" : ""}`} />
                <Button variant="secondary" className="w-full" onClick={() => download(r.blob, `${slug(script.title) || "explicativo"}-${r.format === "vertical" ? "9x16" : "16x9"}.${r.extension}`)}>
                  Descargar {r.format === "vertical" ? "9:16" : "16:9"} .{r.extension}
                </Button>
                {r.saved && <p className="text-xs text-good">Guardado en el proyecto: {r.saved}</p>}
                {r.notes.map((n) => (
                  <p key={n} className="text-xs text-muted">
                    {n}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {script && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Escenas</h3>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => {
                remember(`add-${Date.now()}`);
                setScript({ ...script, scenes: [...script.scenes, blankScene()] });
              }}
            >
              + Escena
            </Button>
          </div>
          <ol className="space-y-2">
            {timeScenes(scenes).map((s) => {
              const raw = script.scenes.find((x) => x.id === s.id)!;
              const voice = voices[s.id];
              return (
                <li key={s.id} className={`rounded-xl border bg-white p-3 ${selected?.sceneId === s.id ? "border-touch" : "border-line"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="font-mono text-xs text-muted hover:text-ink"
                      title="Ver esta escena en la vista previa"
                      onClick={() => {
                        seek(s.start + 0.6);
                        setSelected({ sceneId: s.id, key: null });
                      }}
                    >
                      {s.index + 1} · {s.start.toFixed(1)}–{s.end.toFixed(1)} s
                    </button>
                    <select
                      className={`${smallInput} py-1 text-xs`}
                      value={raw.template}
                      aria-label="Plantilla"
                      onChange={(e) => {
                        // A new character scene gets the series' explainer character.
                        const template = e.target.value as MotionScene["template"];
                        const [hosted] = hostScenes([{ ...raw, template }], host, castCharacters, true);
                        updateScene(s.id, hosted.asset === raw.asset ? { template } : { template, asset: hosted.asset, assetB: hosted.assetB });
                      }}
                    >
                      {MOTION_TEMPLATES.map((t) => (
                        <option key={t} value={t}>
                          {MOTION_TEMPLATE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <select
                      className={`${smallInput} py-1 text-xs`}
                      value={raw.camera ?? "hold"}
                      aria-label="Cámara"
                      title={raw.cameraBy === "ai" ? "La eligió la IA según lo que muestra la escena. Si la cambiás, queda la tuya." : undefined}
                      onChange={(e) => updateScene(s.id, { camera: e.target.value as (typeof MOTION_CAMERAS)[number], cameraBy: undefined })}
                    >
                      {MOTION_CAMERAS.map((c) => (
                        <option key={c} value={c}>
                          Cámara{raw.cameraBy === "ai" && c === (raw.camera ?? "hold") ? " (IA)" : ""}: {MOTION_CAMERA_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    {s.index > 0 && (
                      <select
                        className={`${smallInput} py-1 text-xs`}
                        value={raw.entry ?? "cut"}
                        aria-label="Entrada"
                        title="Pasar a través: la cámara se mete en lo principal de la escena anterior (la pantalla, el producto, el número) y esta escena se abre desde adentro."
                        onChange={(e) => updateScene(s.id, { entry: e.target.value === "through" ? "through" : undefined })}
                      >
                        {SCENE_ENTRIES.map((c) => (
                          <option key={c} value={c}>
                            Entrada: {SCENE_ENTRY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      className={`${smallInput} py-1 text-xs ${labelled(raw) ? "border-neg/50 font-semibold" : ""}`}
                      value={raw.disclosure ?? "real"}
                      aria-label="Qué muestra"
                      title="Solo lo que está en «Lo que existe hoy» se muestra como real. Concepto o Simulación pone el rótulo en pantalla mientras dura la escena."
                      onChange={(e) => updateScene(s.id, { disclosure: e.target.value === "real" ? undefined : (e.target.value as MotionScene["disclosure"]) })}
                    >
                      {SCENE_DISCLOSURES.map((c) => (
                        <option key={c} value={c}>
                          {SCENE_DISCLOSURE_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="number"
                        min={2}
                        max={8}
                        step={0.5}
                        className={`${smallInput} w-16 px-2 py-1 text-xs`}
                        value={raw.seconds}
                        aria-label="Segundos"
                        onChange={(e) => updateScene(s.id, { seconds: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })}
                      />
                      s
                    </label>
                    <span className="ml-auto flex gap-1">
                      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => moveScene(s.id, -1)} aria-label="Subir">
                        ↑
                      </Button>
                      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => moveScene(s.id, 1)} aria-label="Bajar">
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-0.5 text-xs text-neg"
                        onClick={() => {
                          remember(`remove-${Date.now()}`);
                          setScript({ ...script, scenes: script.scenes.filter((x) => x.id !== s.id) });
                        }}
                      >
                        Sacar
                      </Button>
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input className={`${inputClass} py-1.5`} value={raw.title} placeholder="Título (hasta 6 palabras)" aria-label="Título" onChange={(e) => updateScene(s.id, { title: e.target.value })} />
                    <input className={`${inputClass} py-1.5`} value={raw.text} placeholder="Texto de apoyo" aria-label="Texto" onChange={(e) => updateScene(s.id, { text: e.target.value })} />
                    <textarea
                      className={`${inputClass} py-1.5 text-xs`}
                      rows={2}
                      value={raw.items.join("\n")}
                      placeholder="Rótulos, pasos, precio o llamado (uno por línea)"
                      aria-label="Elementos"
                      onChange={(e) => updateScene(s.id, { items: e.target.value.split("\n").slice(0, 5) })}
                    />
                    <div className="space-y-1.5">
                      <select className={`${inputClass} py-1 text-xs`} value={raw.asset} aria-label="Imagen" onChange={(e) => updateScene(s.id, { asset: e.target.value })}>
                        <option value="">Sin imagen</option>
                        {assetOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {raw.template === "beforeAfter" && (
                        <select className={`${inputClass} py-1 text-xs`} value={raw.assetB} aria-label="Imagen de después" onChange={(e) => updateScene(s.id, { assetB: e.target.value })}>
                          <option value="">Después: sin imagen</option>
                          {assetOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              Después: {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {raw.template === "character" && (
                        <>
                          <select className={`${inputClass} py-1 text-xs`} value={raw.assetB} aria-label="Lo que muestra" onChange={(e) => updateScene(s.id, { assetB: e.target.value })}>
                            <option value="">No muestra nada (el personaje solo)</option>
                            {assetOptions
                              .filter((o) => o.value !== raw.asset)
                              .map((o) => (
                                <option key={o.value} value={o.value}>
                                  Muestra: {o.label}
                                </option>
                              ))}
                          </select>
                          {actors[raw.asset] ? (
                            <select
                              className={`${inputClass} py-1 text-xs`}
                              value={raw.move ?? "walk"}
                              aria-label="Tramo"
                              onChange={(e) => updateScene(s.id, { move: e.target.value as (typeof MOTION_MOVES)[number] })}
                            >
                              {MOTION_MOVES.map((g) => (
                                <option key={g} value={g}>
                                  Tramo: {MOTION_MOVE_LABEL[g]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              className={`${inputClass} py-1 text-xs`}
                              value={raw.gesture ?? "present"}
                              aria-label="Gesto"
                              onChange={(e) => updateScene(s.id, { gesture: e.target.value as MotionGesture })}
                            >
                              {MOTION_GESTURES.map((g) => (
                                <option key={g} value={g}>
                                  Gesto: {MOTION_GESTURE_LABEL[g]}
                                </option>
                              ))}
                            </select>
                          )}
                          {raw.asset && actors[raw.asset] && raw.move && actors[raw.asset].root[raw.move] === false && (
                            <p className="text-[11px] text-muted">Ese clip no trae root motion: el personaje se desplaza, pero no es el paso del clip.</p>
                          )}
                          {raw.asset && !puppets[raw.asset] && !actors[raw.asset] && (
                            <p className="text-[11px] text-neg">Este personaje no tiene imagen, títere ni GLB: subilos en Editar serie.</p>
                          )}
                        </>
                      )}
                      {raw.template === "beforeAfter" && (
                        <div className="space-y-1">
                          <select
                            className={`${inputClass} py-1 text-xs`}
                            value={raw.reveal ?? "wipe"}
                            aria-label="Cómo cambia"
                            onChange={(e) => updateScene(s.id, { reveal: e.target.value === "iris" ? "iris" : undefined })}
                          >
                            {BEFORE_AFTER_REVEALS.map((r) => (
                              <option key={r} value={r}>
                                Cómo cambia: {BEFORE_AFTER_REVEAL_LABEL[r]}
                              </option>
                            ))}
                          </select>
                          {raw.reveal === "iris" && (
                            <div className="grid grid-cols-2 gap-1 text-[11px] text-muted">
                              {(["focusX", "focusY"] as const).map((k) => (
                                <label key={k} className="block">
                                  {k === "focusX" ? "Desde: horizontal" : "Desde: vertical"}
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    className="block w-full"
                                    value={raw[k]}
                                    onChange={(e) => updateScene(s.id, { [k]: Number(e.target.value) })}
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {raw.template === "zoom" && (
                        <div className="grid grid-cols-3 gap-1 text-[11px] text-muted">
                          {(["focusX", "focusY", "zoom"] as const).map((k) => (
                            <label key={k} className="block">
                              {k === "focusX" ? "Horizontal" : k === "focusY" ? "Vertical" : "Zoom"}
                              <input
                                type="range"
                                min={k === "zoom" ? 1.2 : 0}
                                max={k === "zoom" ? 4 : 1}
                                step={0.01}
                                className="block w-full"
                                value={raw[k]}
                                onChange={(e) => updateScene(s.id, { [k]: Number(e.target.value) })}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputClass} min-w-0 flex-1 py-1.5 text-sm`}
                      value={raw.voice}
                      placeholder="Lo que dice la voz"
                      aria-label="Voz"
                      onChange={(e) => updateScene(s.id, { voice: e.target.value })}
                    />
                    <input className={`${smallInput} w-32 py-1.5 text-xs`} value={raw.emotion} placeholder="Emoción" aria-label="Emoción" onChange={(e) => updateScene(s.id, { emotion: e.target.value })} />
                  </div>
                  {piece.voice !== "none" && raw.voice.trim() && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {voice && <audio src={voice.url} controls className="h-8" />}
                      {voice && voiceOverrun(s, voice.duration) > 0 && (
                        <>
                          <span className="text-neg">
                            La voz dura {voice.duration.toFixed(1)} s, entra a los {(elementTimes(s).voice ?? 0.25).toFixed(2)} s y la escena dura {s.seconds.toFixed(1)} s: se corta con un fundido en el corte.
                          </span>
                          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => fitVoice(s.id)}>
                            Ajustar al largo de la voz
                          </Button>
                        </>
                      )}
                      {piece.voice === "generated" ? (
                        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={!voiceAvailable || busy !== null} onClick={() => generateVoice(raw)}>
                          {voice ? "Generar de nuevo" : "Generar voz"}
                        </Button>
                      ) : (
                        <>
                          <Recorder line={raw.voice} onDone={(blob) => keepVoice(s.id, blob, `voz-${s.id}.webm`)} />
                          <input type="file" accept="audio/*" aria-label="Subir voz" className="text-xs" onChange={(e) => e.target.files?.[0] && keepVoice(s.id, e.target.files[0], e.target.files[0].name)} />
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
