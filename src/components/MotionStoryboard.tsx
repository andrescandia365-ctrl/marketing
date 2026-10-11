// "Storyboard" of an explainer, inside MotionStudio (loaded only when opened): one panel per scene with its settled
// frame, drawn by the same path as the preview and the render, and what it says, sounds, how it enters and its
// camera. Downloads as Markdown and as one PNG sheet.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MotionPiece, MotionScene, MotionScript } from "../../shared/motion.ts";
import { download, slug } from "../lib/markdown.ts";
import type { MotionWorld } from "../lib/motion.ts";
import { PANEL_SIZE, drawPanelFrame, soundsLine, storyboardMarkdown, storyboardName, storyboardPanels, storyboardPng, type StoryboardPanel } from "../lib/motionStoryboard.ts";
import { VideoDeck, latestOnly, withOwnVideos } from "../lib/screenVideo.ts";
import { Button, Notice, Spinner } from "./ui.tsx";

type Props = {
  script: MotionScript;
  // The scenes as they play (arrangeScenes).
  scenes: MotionScene[];
  world: MotionWorld;
  format: MotionPiece["format"];
  music: MotionPiece["music"];
  effects: MotionPiece["effects"];
  voice: MotionPiece["voice"];
  onSeek: (t: number, sceneId: string) => void;
};

// One panel's frame. A screen's recording on screen is sought to the panel's frame first (the storyboard's own players,
// one panel at a time, and only the newest request draws).
function PanelFrame({ panel, script, world, format, queue }: { panel: StoryboardPanel; script: MotionScript; world: MotionWorld; format: MotionPiece["format"]; queue: SerialQueue }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, h] = PANEL_SIZE[format];
  const latest = useMemo(() => latestOnly(), []);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    void queue(() => latest(() => readyFor(world, script, panel.frameAt), () => drawPanelFrame(ctx, w, h, panel, script, world)));
  }, [panel, script, world, w, h, queue, latest]);
  return <canvas ref={ref} width={w} height={h} className="w-full rounded-md bg-black" aria-label={`Cuadro de la escena ${panel.number}`} />;
}

type SerialQueue = (job: () => Promise<unknown>) => Promise<void>;
const readyFor = (world: MotionWorld, script: MotionScript, t: number) => (world.videos instanceof VideoDeck && !world.videos.empty ? world.videos.ready(script, t) : Promise.resolve());

export function MotionStoryboard({ script, scenes, world: shared, format, music, effects, voice, onSeek }: Props) {
  const played = useMemo(() => ({ ...script, scenes }), [script, scenes]);
  // The storyboard's own players for the screens' recordings, so it never moves the preview's.
  const deck = useMemo(() => (shared.videos instanceof VideoDeck && !shared.videos.empty ? shared.videos.fork() : null), [shared.videos]);
  useEffect(() => () => deck?.dispose(), [deck]);
  const world = useMemo(() => (deck ? { ...shared, videos: deck } : shared), [shared, deck]);
  // The panels share those players, so each one seeks and draws in turn.
  const queue = useMemo<SerialQueue>(() => {
    let tail: Promise<unknown> = Promise.resolve();
    return (job) => {
      const next = tail.then(job, job);
      tail = next.catch(() => undefined);
      return next.then(() => undefined);
    };
  }, [deck]);
  const panels = useMemo(() => storyboardPanels(played, { music, effects, voice }), [played, music, effects, voice]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sheetName = storyboardName(script.title, format, "png", slug);

  async function downloadPng() {
    setBusy(true);
    setError("");
    try {
      const blob = await withOwnVideos(world, (own) => storyboardPng(played, own, panels, format, (t) => readyFor(own, played, t)));
      if (blob) download(blob, sheetName);
      else setError("No se pudo armar la hoja del storyboard.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            download(
              new Blob([storyboardMarkdown(played, panels, { format, music, sheetName })], { type: "text/markdown" }),
              storyboardName(script.title, format, "md", slug),
            )
          }
        >
          Descargar storyboard .md
        </Button>
        <Button variant="secondary" onClick={downloadPng} disabled={busy}>
          {busy ? <Spinner /> : null} Descargar hoja .png
        </Button>
      </div>
      <p className="text-xs text-muted">El .md apunta a la hoja .png: bajá las dos y guardalas juntas. Cada cuadro es la escena ya armada, como sale en el video.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <ol className={`grid gap-3 ${format === "vertical" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {panels.map((p) => (
          <li key={p.id} className="space-y-1.5 rounded-xl border border-line bg-white p-2 text-xs">
            <button type="button" className="block w-full" title="Ver esta escena en la vista previa" onClick={() => onSeek(p.frameAt, p.id)}>
              <PanelFrame panel={p} script={played} world={world} format={format} queue={queue} />
            </button>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-semibold">
                {p.number} · {p.start.toFixed(1)}–{p.end.toFixed(1)} s
              </span>
              {p.disclosure && <span className="rounded bg-neg-soft px-1.5 font-semibold text-neg">{p.disclosure}</span>}
            </div>
            <p className="font-semibold text-muted">{p.templateLabel}</p>
            <p>
              <b>Entra:</b> {p.entry.label}
            </p>
            <p>
              <b>Cámara:</b> {p.camera.label}
            </p>
            {p.recording && <p>{p.recording}</p>}
            {p.voice && (
              <p>
                <b>{p.voiceHeard ? "Se dice" : "Subtítulo (sin voz)"}:</b> “{p.voice}”
              </p>
            )}
            <p>
              <b>Suena:</b> {soundsLine(p) || "solo la música"}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
