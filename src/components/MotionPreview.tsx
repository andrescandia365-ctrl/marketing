// The explainer studio's preview: the canvas, its clock and the playback. The mix plays through Web Audio, whose clock
// drives frame t while it plays (see playClock.ts); stopped, t is the timeline's. Touching an element on the canvas
// selects it and dragging moves it (the editor's outline and the phone guides are never in the video).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { sceneElements, timeScenes, tweakScene, type MotionScene, type MotionScript } from "../../shared/motion.ts";
import { drawMotionFrame, drawPhoneGuides, sceneAt, scriptDuration, type Box, type MotionWorld } from "../lib/motion.ts";
import { MixPlayer } from "../lib/playClock.ts";
import { VideoDeck } from "../lib/screenVideo.ts";
import type { Selection } from "./MotionTimeline.tsx";
import { Button, Spinner } from "./ui.tsx";

type PreviewOptions = {
  // The script as it plays (scenes arranged on the beat grid) and the world it is drawn with.
  snapped: MotionScript | null;
  world: MotionWorld;
  scenes: MotionScene[];
  total: number;
  selected: Selection | null;
  setSelected: (selection: Selection | null) => void;
  // Where things sit is kept per format (their layouts differ).
  fmt: "v" | "h";
  // When the mix changes: the timing (soundKey) and what else goes into it.
  soundKey: string;
  soundDeps: unknown[];
  // Builds the mix of the piece as it is now (the newest render's), and the same behind the studio's busy state.
  makeSound: () => Promise<AudioBuffer | null>;
  buildSound: () => Promise<AudioBuffer | null>;
  onError: (e: unknown) => void;
  remember: (tag: string) => void;
  begin: () => void;
  tweak: (sceneId: string, key: string, patch: Parameters<typeof tweakScene>[2]) => void;
};

export function useMotionPreview(o: PreviewOptions) {
  const { snapped, world, scenes, total, selected, setSelected, fmt } = o;
  // soundFresh: the loaded mix matches the piece as it is now.
  const playerRef = useRef<MixPlayer | null>(null);
  const player = () => (playerRef.current ??= new MixPlayer());
  const [playing, setPlaying] = useState(false);
  const soundFresh = useRef(false);
  const soundSeq = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The preview's time when the sound is not playing.
  const timeRef = useRef(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  // Where each element of the scene on screen was drawn in the last preview frame, by "sceneId:key".
  const boxes = useRef(new Map<string, Box>());
  const canvasDrag = useRef<{ sceneId: string; key: string; x0: number; y0: number; dx0: number; dy0: number } | null>(null);
  const [outside, setOutside] = useState(false);
  const outsideRef = useRef(false);
  // The phone's own interface drawn over the 9:16 preview (editor only).
  const [guides, setGuides] = useState(true);
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  // The newest render's makeSound, for mixes built after an await or a timer.
  const makeSoundRef = useRef(o.makeSound);
  makeSoundRef.current = o.makeSound;
  const onErrorRef = useRef(o.onError);
  onErrorRef.current = o.onError;

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

  useEffect(() => () => playerRef.current?.close(), []);

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
  }, [o.soundKey, ...o.soundDeps]);

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
      .catch((e) => onErrorRef.current(e));
  }

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
        // A screen's recording follows the mix's clock while it plays, and is sought to frame t when stopped.
        if (world.videos instanceof VideoDeck) world.videos.follow(snapped, t, Boolean(mix?.playing));
        // A code scene's sandbox paints frame t when it is free; the preview shows the latest frame it has.
        world.code?.follow?.(snapped, t, world, { w: canvas.width, h: canvas.height });
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

  // On the preview: touch an element to select it and drag it where it goes. The move is a share of the frame's
  // short side, so it lands in the same place at 1080 px.
  function canvasPoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  }

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
    o.begin();
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
    o.tweak(d.sceneId, d.key, { [fmt]: { dx: round(d.dx0 + (point.x - d.x0) / unit), dy: round(d.dy0 + (point.y - d.y0) / unit) } });
  }

  function canvasUp() {
    canvasDrag.current = null;
  }

  function canvasKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (!dir || !selected?.key) return;
    const scene = scenes.find((x) => x.id === selected.sceneId);
    if (!scene || !sceneElements(scene).find((x) => x.key === selected.key)?.move) return;
    e.preventDefault();
    o.remember(`nudge-${selected.sceneId}-${selected.key}`);
    const step = e.shiftKey ? 0.025 : 0.005;
    const spot = scene.tweaks?.[selected.key]?.[fmt];
    const round = (x: number) => Math.round(x * 1000) / 1000;
    o.tweak(selected.sceneId, selected.key, { [fmt]: { dx: round((spot?.dx ?? 0) + dir[0] * step), dy: round((spot?.dy ?? 0) + dir[1] * step) } });
  }

  // ▶ / ❚❚: builds the mix when the loaded one is stale, then plays from the preview's second.
  async function togglePlay() {
    const p = player();
    if (p.playing) return pause();
    if (!soundFresh.current || !p.ready) {
      const seq = soundSeq.current;
      const buffer = await o.buildSound();
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

  return { canvasRef, timeRef, playheadRef, clockRef, playing, outside, guides, setGuides, seek, togglePlay, canvasDown, canvasMove, canvasUp, canvasKey };
}

export type MotionPreviewState = ReturnType<typeof useMotionPreview>;

// The canvas and the play bar under it.
export function MotionPreview({ preview, vertical, busy, soundInfo }: { preview: MotionPreviewState; vertical: boolean; busy: string | null; soundInfo: string }) {
  const { canvasRef, clockRef, playing } = preview;
  return (
    <>
      <div className="flex justify-center rounded-xl bg-black/90 p-3">
        <canvas
          ref={canvasRef}
          width={vertical ? 360 : 640}
          height={vertical ? 640 : 360}
          tabIndex={0}
          aria-label="Vista previa del explicativo: tocá un elemento y arrastralo para moverlo"
          className={`touch-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-touch ${vertical ? "h-[640px] max-h-[70vh] w-auto" : "w-full"}`}
          onPointerDown={preview.canvasDown}
          onPointerMove={preview.canvasMove}
          onPointerUp={preview.canvasUp}
          onPointerCancel={preview.canvasUp}
          onKeyDown={preview.canvasKey}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={preview.togglePlay} disabled={busy !== null && !playing}>
          {busy === "sound" ? <Spinner /> : playing ? "❚❚" : "▶"} {playing ? "Pausa" : "Reproducir con sonido"}
        </Button>
        <span className="min-w-0 flex-1 text-xs text-muted">Para ir a otro segundo, tocá la regla de la línea de tiempo.</span>
        <span ref={clockRef} className="w-14 text-right font-mono text-xs text-muted">
          0.0 s
        </span>
      </div>
      {soundInfo && <p className="text-xs text-muted">{soundInfo}</p>}
    </>
  );
}
