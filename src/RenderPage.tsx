// The page render.mjs opens (/?render=<project>&format=vertical|horizontal): it loads the explainer with its images,
// fonts, voices and track, then exposes window.seek(t), which paints frame t at full size, and the finished mix.
// Nothing here moves on its own: every frame comes from seek(t).
import { useEffect, useRef, useState } from "react";
import { cutBlurOn, cutPush, newMotionPiece, posterTime, type MotionPiece } from "../shared/motion.ts";
import type { Brief } from "../shared/schema.ts";
import { api } from "./lib/api.ts";
import { ensureFont, fontLoaded } from "./lib/fonts.ts";
import { drawMotionFrame, scriptDuration } from "./lib/motion.ts";
import { toWav } from "./lib/motionAudio.ts";
import { arrangeScenes, layerAssets, loadPieceMedia, loadSeriesImages, makeWorld, motionBeats, motionSound, speechLevels, usesAiImages } from "./lib/motionProject.ts";

export type MotionRender = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  notice: string;
  // The thumbnail's second: render.mjs paints it as frame 0.
  poster: number;
  seek: (t: number) => void;
  // The mix (music, hits and voices, as the preview plays it) as a WAV file, base64.
  sound: () => Promise<string>;
};

declare global {
  interface Window {
    motionRender?: MotionRender;
    motionRenderError?: string;
    seek?: (t: number) => void;
  }
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function RenderPage({ projectId, format }: { projectId: string; format: "vertical" | "horizontal" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState("Cargando la pieza…");
  const [w, h] = format === "vertical" ? [1080, 1920] : [1920, 1080];

  useEffect(() => {
    (async () => {
      const [status, project] = await Promise.all([api.status(), api.project(projectId)]);
      const st = project.state as { kind?: string; motion?: Partial<MotionPiece>; pieceBrief?: Brief };
      if (st.kind !== "motion" || !st.motion?.script || !st.pieceBrief) throw new Error("Esta pieza no es un explicativo con guion.");
      const piece: MotionPiece = { ...newMotionPiece(st.pieceBrief.format), ...st.motion };
      const series = status.series.find((s) => s.id === st.pieceBrief!.series);
      if (!series) throw new Error(`No existe la serie "${st.pieceBrief.series}".`);
      await Promise.all([ensureFont(series.brand.displayFont), ensureFont(series.brand.uiFont)]);
      await document.fonts.ready;
      // The final render never goes out in a fallback face: it stops and says which font did not load.
      const missing = [...new Set([series.brand.displayFont, series.brand.uiFont])].filter((family) => !fontLoaded(family));
      if (missing.length)
        throw new Error(
          `No cargó la fuente ${missing.map((f) => `«${f}»`).join(" ni ")} de la marca, así que el render se frena para no salir con otra letra. Revisá la conexión a internet, o elegí otra fuente en Editar serie.`,
        );
      const [images, media] = await Promise.all([loadSeriesImages(series), loadPieceMedia(projectId, piece, project.media, project.music)]);
      const script = piece.script!;
      const beats = motionBeats(script, piece.music, piece.kickGrid);
      const scenes = arrangeScenes(script, beats, piece.snap !== false, piece.music, piece.kickGrid);
      const snapped = { ...script, scenes };
      const notice = piece.disclosure && usesAiImages(scenes, series);
      const speech = await speechLevels(snapped, piece, media.voices);
      const world = makeWorld(series.brand, { ...images.cast, ...layerAssets(media.layers) }, images.logo, beats, notice, {
        puppets: images.puppets,
        actors: images.actors,
        speech,
        cutBlur: cutBlurOn(piece),
      });
      const ctx = canvasRef.current!.getContext("2d")!;
      const seek = (t: number) => drawMotionFrame(ctx, w, h, t, snapped, world);
      seek(0);
      window.seek = seek;
      window.motionRender = {
        width: w,
        height: h,
        fps: 30,
        duration: scriptDuration(snapped),
        notice: notice ? world.disclosure : "",
        poster: posterTime(scenes, piece.poster, cutPush(script.tone)),
        seek,
        sound: async () => {
          const { buffer } = await motionSound(snapped, piece, media.voices, media.track?.buffer ?? null);
          return base64(toWav(buffer));
        },
      };
      setState("");
    })().catch((e: unknown) => {
      const text = e instanceof Error ? e.message : String(e);
      window.motionRenderError = text;
      setState(text);
    });
  }, [projectId, format, w, h]);

  return (
    <div style={{ margin: 0, background: "#000" }}>
      <canvas ref={canvasRef} width={w} height={h} style={{ display: "block", width: w, height: h }} aria-label="Cuadro del render" />
      {state && <p style={{ position: "fixed", top: 8, left: 8, color: "#fff", font: "14px system-ui" }}>{state}</p>}
    </div>
  );
}
