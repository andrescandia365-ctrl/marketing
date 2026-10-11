// "Storyboard" of an explainer, inside MotionStudio (loaded only when opened): one panel per scene with its settled
// frame, drawn by the same path as the preview and the render, and what it says, sounds, how it enters and its
// camera. Downloads as Markdown and as one PNG sheet.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MotionPiece, MotionScene, MotionScript } from "../../shared/motion.ts";
import { download, slug } from "../lib/markdown.ts";
import type { MotionWorld } from "../lib/motion.ts";
import { PANEL_SIZE, drawPanelFrame, soundsLine, storyboardMarkdown, storyboardName, storyboardPanels, storyboardPng, type StoryboardPanel } from "../lib/motionStoryboard.ts";
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

function PanelFrame({ panel, script, world, format }: { panel: StoryboardPanel; script: MotionScript; world: MotionWorld; format: MotionPiece["format"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, h] = PANEL_SIZE[format];
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawPanelFrame(ctx, w, h, panel, script, world);
  }, [panel, script, world, w, h]);
  return <canvas ref={ref} width={w} height={h} className="w-full rounded-md bg-black" aria-label={`Cuadro de la escena ${panel.number}`} />;
}

export function MotionStoryboard({ script, scenes, world, format, music, effects, voice, onSeek }: Props) {
  const played = useMemo(() => ({ ...script, scenes }), [script, scenes]);
  const panels = useMemo(() => storyboardPanels(played, { music, effects, voice }), [played, music, effects, voice]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sheetName = storyboardName(script.title, format, "png", slug);

  async function downloadPng() {
    setBusy(true);
    setError("");
    try {
      const blob = await storyboardPng(played, world, panels, format);
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
              <PanelFrame panel={p} script={played} world={world} format={format} />
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
