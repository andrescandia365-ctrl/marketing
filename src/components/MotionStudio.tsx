// Motion-graphics explainers (software or one product): the AI writes a script of scenes from templates; the person
// edits them, adds voice and music, previews with sound and renders. Follows the studio's rules: frames are a pure
// function of time, something new every 2 to 4 seconds (a check that blocks rendering), hits on the beat grid,
// -14 LUFS.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DURATIONS,
  MOTION_MOODS,
  MOTION_MOOD_LABEL,
  MOTION_TEMPLATES,
  MOTION_TEMPLATE_LABEL,
  blankScene,
  elementTimes,
  newMotionPiece,
  quietGaps,
  revealTimes,
  sceneElements,
  snapScenes,
  timeScenes,
  tweakScene,
  type MotionPiece,
  type MotionScene,
  type MotionScript,
} from "../../shared/motion.ts";
import type { Brief, SeriesInfo } from "../../shared/schema.ts";
import { api, libraryFileUrl, projectFileUrl, type MediaFileRecord, type MediaRecord } from "../lib/api.ts";
import { encodeFrames } from "../lib/encode.ts";
import { ensureFont } from "../lib/fonts.ts";
import { download, slug } from "../lib/markdown.ts";
import { beatGrid, drawMotionFrame, sceneAt, scriptDuration, type Box, type MotionAsset, type MotionWorld } from "../lib/motion.ts";
import { buildSound, onGrid, toWav, TARGET_LUFS, type SoundPlan } from "../lib/motionAudio.ts";
import { findBeats, type RenderResult } from "../lib/render.ts";
import { Recorder, audioDuration, type AudioFile } from "./Audio.tsx";
import { Inspector, MotionTimeline, type Selection } from "./MotionTimeline.tsx";
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
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
};

const VOICE_BASE = 100;
const LAYER_BASE = 200;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const smallInput = inputClass.replace("w-full", "");

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const asAsset = (img: HTMLImageElement, name: string): MotionAsset => ({ image: img, width: img.naturalWidth, height: img.naturalHeight, name });

function decode(blob: Blob): Promise<AudioBuffer> {
  return blob.arrayBuffer().then((b) => new OfflineAudioContext(2, 1, 48000).decodeAudioData(b));
}

function pieceMarkdown(piece: MotionPiece, scenes: MotionScene[]): string {
  const s = piece.script;
  if (!s) return "# Explicativo sin guion todavía\n";
  return `# ${s.problem}

**${s.title}** · ${scenes.reduce((n, x) => n + x.seconds, 0).toFixed(1)} s · música: ${piece.music === "synth" ? `sintetizada (${MOTION_MOOD_LABEL[s.music.mood]}, ${s.music.bpm} bpm)` : piece.music === "track" ? "tema propio" : "sin música"}

${timeScenes(scenes)
  .map(
    (x) =>
      `## ${x.index + 1}. ${MOTION_TEMPLATE_LABEL[x.template]} · ${x.start.toFixed(1)}–${x.end.toFixed(1)} s\n\n- **Título:** ${x.title}\n${x.text ? `- **Texto:** ${x.text}\n` : ""}${x.items.length ? `- **Elementos:** ${x.items.join(" · ")}\n` : ""}${x.asset ? `- **Imagen:** ${x.asset}${x.assetB ? ` → ${x.assetB}` : ""}\n` : ""}${x.voice ? `- **Voz** (${x.emotion}): “${x.voice}”\n` : ""}`,
  )
  .join("\n")}
`;
}

export function MotionStudio({ projectId, brief, series, initial, voiceAvailable, defaultVoice, projectsDir, onSaveStatus }: Props) {
  const [piece, setPiece] = useState<MotionPiece>(() =>
    initial ? { ...newMotionPiece(brief.format), ...initial.piece } : newMotionPiece(brief.format),
  );
  const [voices, setVoices] = useState<Record<string, AudioFile>>({});
  const [layers, setLayers] = useState<HTMLImageElement[]>([]);
  const [track, setTrack] = useState<{ file: AudioFile; buffer: AudioBuffer } | null>(null);
  const [castImages, setCastImages] = useState<Record<string, MotionAsset>>({});
  const [logo, setLogo] = useState<MotionAsset | null>(null);
  const [busy, setBusy] = useState<null | "write" | "sound" | "render" | "voice" | "upload">(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [soundUrl, setSoundUrl] = useState<string | null>(null);
  const [soundInfo, setSoundInfo] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<(RenderResult & { url: string; format: string; saved: string })[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const urls = useRef<string[]>([]);
  // The preview's time when the sound is not playing (the player loses its place every time the sound is rebuilt).
  const timeRef = useRef(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  // Where each element of the scene on screen was drawn in the last preview frame, by "sceneId:key".
  const boxes = useRef(new Map<string, Box>());
  const canvasDrag = useRef<{ sceneId: string; key: string; x0: number; y0: number; dx0: number; dy0: number } | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [outside, setOutside] = useState(false);
  const outsideRef = useRef(false);
  // Undo: earlier scripts, newest last.
  const past = useRef<MotionScript[]>([]);
  const lastMark = useRef({ tag: "", at: 0 });
  const [undoCount, setUndoCount] = useState(0);
  const brand = series.brand;
  const script = piece.script;
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const set = (patch: Partial<MotionPiece>) => setPiece((p) => ({ ...p, ...patch }));
  const setScript = (next: MotionScript) => set({ script: next });

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
    if (previous) setPiece((p) => ({ ...p, script: previous }));
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

  function seek(t: number) {
    timeRef.current = Math.max(0, t);
    const audio = audioRef.current;
    if (audio && audio.currentSrc) audio.currentTime = timeRef.current;
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
    Promise.all(
      series.cast
        .filter((m) => m.image)
        .map(async (m) => [m.id, await loadImage(libraryFileUrl(series.id, m.image))] as const),
    ).then((list) => {
      if (!alive) return;
      setCastImages(Object.fromEntries(list.filter(([, img]) => img).map(([id, img]) => [id, asAsset(img!, id)])));
    });
    if (brand.logo) loadImage(libraryFileUrl(series.id, brand.logo)).then((img) => alive && setLogo(img ? asAsset(img, "logo") : null));
    return () => {
      alive = false;
    };
  }, [series, brand.logo]);

  // A saved piece brings back its voices, layers and track.
  useEffect(() => {
    if (!projectId || !initial) return;
    for (const [sceneId, slot] of Object.entries(initial.piece.voiceSlots ?? {})) {
      const rec = initial.media[VOICE_BASE + slot]?.voice;
      if (!rec) continue;
      fetch(projectFileUrl(projectId, rec.file))
        .then((r) => r.blob())
        .then((blob) => setVoices((v) => ({ ...v, [sceneId]: { url: objectUrl(blob), blob, name: rec.name, duration: rec.duration } })))
        .catch(() => undefined);
    }
    Promise.all(
      Array.from({ length: initial.piece.layers ?? 0 }, (_, k) => {
        const file = initial.media[LAYER_BASE + k]?.image;
        return file ? loadImage(projectFileUrl(projectId, file)) : Promise.resolve(null);
      }),
    ).then((imgs) => setLayers(imgs.filter((x): x is HTMLImageElement => Boolean(x))));
    if (initial.music) {
      const m = initial.music;
      fetch(projectFileUrl(projectId, m.file))
        .then((r) => r.blob())
        .then(async (blob) => setTrack({ file: { url: objectUrl(blob), blob, name: m.name, duration: m.duration }, buffer: await decode(blob) }))
        .catch(() => undefined);
    }
    // Only when the piece is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The beat grid: the synthesized score's, or the track's measured beats. Scene changes snap onto it.
  const duration = scriptDuration(script);
  const beats = useMemo(() => {
    if (!script) return [];
    if (piece.music === "track" && track) return findBeats(track.buffer);
    if (piece.music === "none") return [];
    return beatGrid(duration + 2, script.music.bpm);
  }, [script, piece.music, track, duration]);
  const snap = piece.snap !== false;
  const scenes = useMemo(() => (script ? (snap ? snapScenes(script.scenes, beats) : script.scenes) : []), [script, beats, snap]);
  const snapped: MotionScript | null = script ? { ...script, scenes } : null;
  const total = scenes.reduce((n, s) => n + s.seconds, 0);

  const assets: Record<string, MotionAsset> = useMemo(
    () => ({ ...castImages, ...Object.fromEntries(layers.map((img, k) => [`layer:${k}`, asAsset(img, `layer:${k}`)])) }),
    [castImages, layers],
  );
  const usesAi = scenes.some((s) => [s.asset, s.assetB].some((a) => a.startsWith("layer:") || series.cast.find((m) => m.id === a && m.kind !== "screen")));
  const world: MotionWorld = useMemo(
    () => ({ brand, assets, logo, beats, seed: 20261003, disclosure: piece.disclosure && usesAi ? "Algunas imágenes están hechas con IA" : "" }),
    [brand, assets, logo, beats, piece.disclosure, usesAi],
  );

  const gaps = quietGaps(scenes);
  const key = (g: { from: number; to: number }) => `${g.from.toFixed(1)}-${g.to.toFixed(1)}`;
  const openGaps = gaps.filter((g) => !piece.dismissed.includes(key(g)));

  // Autosave.
  useEffect(() => {
    if (!projectId) return;
    onSaveStatus("saving");
    const timer = setTimeout(() => {
      api
        .saveProject(projectId, { version: 1, kind: "motion", step: "motion", pieceBrief: brief, motion: piece }, pieceMarkdown(piece, scenes))
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
    timeScenes(scenes).map((s) => [s.start, s.template, revealTimes(s), elementTimes(s).voice ?? null]),
  );
  useEffect(() => setSoundUrl(null), [soundKey, voices, piece.music, piece.voice, track]);

  // Live preview: frame t follows the player while it plays, else the timeline's time. The selected element gets a
  // dashed outline (the editor's, never in the video).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const audio = audioRef.current;
      if (audio && !audio.paused) timeRef.current = audio.currentTime;
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
    audioRef.current?.pause();
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
      const blob = await api.speak(scene.voice, piece.ttsVoice || defaultVoice, brief.language);
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
      const buffer = await decode(file);
      const duration = buffer.duration;
      setTrack({ file: { url: objectUrl(file), blob: file, name: file.name, duration }, buffer });
      set({ music: "track" });
      if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
    });
  }

  // The plan of the sound: voices at their scenes, whooshes on the cuts and pops on new elements, on the grid.
  function soundPlan(): { plan: Omit<SoundPlan, "voices">; voiceBlobs: { at: number; blob: Blob }[] } | null {
    if (!snapped) return null;
    const timed = timeScenes(snapped.scenes);
    const hits: SoundPlan["hits"] = [];
    for (const s of timed) {
      if (s.index > 0) hits.push({ at: s.start, kind: "whoosh" });
      revealTimes(s)
        .filter((r) => r > 0.05 && r < s.seconds && ["callouts", "steps", "product", "logo"].includes(s.template))
        .forEach((r) => hits.push({ at: onGrid(s.start + r, beats), kind: "pop" }));
    }
    const voiceBlobs =
      piece.voice === "none"
        ? []
        : timed.flatMap((s) => (voices[s.id] ? [{ at: s.start + (elementTimes(s).voice ?? 0.25), blob: voices[s.id].blob }] : []));
    return {
      plan: {
        duration: total,
        music: piece.music === "track" && !track ? "none" : piece.music,
        mood: snapped.music.mood,
        bpm: snapped.music.bpm,
        track: track?.buffer ?? null,
        hits,
      },
      voiceBlobs,
    };
  }

  async function makeSound(): Promise<AudioBuffer | null> {
    const made = soundPlan();
    if (!made) return null;
    const voicesDecoded = await Promise.all(made.voiceBlobs.map(async (v) => ({ at: v.at, buffer: await decode(v.blob) })));
    const { buffer, lufs } = await buildSound({ ...made.plan, voices: voicesDecoded });
    setSoundInfo(`Sonido: ${Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS (objetivo ${TARGET_LUFS})` : "sin sonido"} · ${beats.length ? `${beats.length} beats en la grilla` : "sin grilla"}.`);
    return buffer;
  }

  async function play() {
    if (!soundUrl) {
      const buffer = await work("sound", makeSound);
      if (!buffer) return;
      const url = objectUrl(toWav(buffer));
      setSoundUrl(url);
      setTimeout(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = timeRef.current < total - 0.1 ? timeRef.current : 0;
        audio.play().catch(() => undefined);
      }, 50);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (Math.abs(audio.currentTime - timeRef.current) > 0.05) audio.currentTime = timeRef.current < total - 0.1 ? timeRef.current : 0;
    audio.play().catch(() => undefined);
  }

  async function render(formats: ("vertical" | "horizontal")[]) {
    if (!snapped) return;
    setError("");
    setBusy("render");
    setResults([]);
    setProgress(0);
    try {
      await Promise.all([ensureFont(brand.displayFont), ensureFont(brand.uiFont)]);
      const sound = await makeSound();
      for (const [n, format] of formats.entries()) {
        const [w, h] = format === "vertical" ? [1080, 1920] : [1920, 1080];
        const out = await encodeFrames({
          width: w,
          height: h,
          duration: total,
          audio: sound,
          draw: (ctx, t) => drawMotionFrame(ctx, w, h, t, snapped, world),
          onProgress: (f) => setProgress((n + f) / formats.length),
        });
        let saved = "";
        if (projectId) saved = `${projectsDir}/${projectId}/${(await api.saveVideo(projectId, out.blob, format)).file}`;
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
      .filter((m) => m.kind !== "character" || m.image)
      .map((m) => ({ value: m.id, label: `${m.name} (${m.kind === "screen" ? "pantalla" : m.kind === "product" ? "producto" : m.kind === "place" ? "lugar" : "personaje"})${m.image ? "" : " · sin imagen"}` })),
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
              <Button variant="secondary" onClick={play} disabled={busy !== null}>
                {busy === "sound" ? <Spinner /> : "▶"} Reproducir con sonido
              </Button>
              <audio
                ref={audioRef}
                src={soundUrl ?? undefined}
                controls
                className="h-9 min-w-0 flex-1"
                onSeeked={(e) => {
                  if (e.currentTarget.currentSrc) timeRef.current = e.currentTarget.currentTime;
                }}
              />
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

            <Field label="Música" group hint="Sintetizada en código, o tu tema (los cortes caen en sus beats).">
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
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => render([piece.format])} disabled={busy !== null || openGaps.length > 0}>
                {busy === "render" ? (
                  <>
                    <Spinner /> Generando…
                  </>
                ) : (
                  `Generar ${vertical ? "9:16" : "16:9"}`
                )}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => render(["vertical", "horizontal"])} disabled={busy !== null || openGaps.length > 0}>
                Los dos formatos
              </Button>
            </div>
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
                    <select className={`${smallInput} py-1 text-xs`} value={raw.template} aria-label="Plantilla" onChange={(e) => updateScene(s.id, { template: e.target.value as MotionScene["template"] })}>
                      {MOTION_TEMPLATES.map((t) => (
                        <option key={t} value={t}>
                          {MOTION_TEMPLATE_LABEL[t]}
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
                      {voice && voice.duration > s.seconds - 0.3 && <span className="text-neg">La voz dura {voice.duration.toFixed(1)} s y la escena {s.seconds.toFixed(1)} s.</span>}
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
