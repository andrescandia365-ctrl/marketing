// Lyric videos: the live preview. It follows the song player through a smooth clock, plays the background clips one
// after the other and draws each frame with the same painter as the render (drawLyricFrame, a pure function of t).
import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricPiece } from "../../shared/lyrics.ts";
import type { LyricPulse } from "../../shared/lyricPulse.ts";
import type { MotionAsset } from "../lib/motion.ts";
import { drawLyricFrame, loadLyricFonts, type Backdrop, type ElementGlyph } from "../lib/lyricRender.ts";
import { mediaClock } from "../lib/playClock.ts";
import type { BgClip } from "./LyricVideoTab.tsx";

export function LyricPreview({
  piece,
  audio,
  beats,
  cuts,
  bgImage,
  bgClips,
  layers,
  elementImages,
}: {
  piece: LyricPiece;
  audio: React.RefObject<HTMLAudioElement | null>;
  beats: LyricPulse;
  cuts: number[];
  bgImage: HTMLImageElement | null;
  bgClips: BgClip[];
  layers: HTMLImageElement[];
  elementImages: Record<number, HTMLImageElement>;
}) {
  const layerAssets: MotionAsset[] = useMemo(
    () => layers.map((img, k) => ({ image: img, width: img.naturalWidth, height: img.naturalHeight, name: `layer:${k}` })),
    [layers],
  );
  const glyphs: Record<number, ElementGlyph> = useMemo(() => {
    const out: Record<number, ElementGlyph> = {};
    for (const [slot, img] of Object.entries(elementImages)) {
      if (img.naturalWidth) out[Number(slot)] = { source: img, width: img.naturalWidth, height: img.naturalHeight };
    }
    return out;
  }, [elementImages]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pieceRef = useRef(piece);
  pieceRef.current = piece;
  // The preview plays the background clips one after the other.
  const [clipIndex, setClipIndex] = useState(0);
  const clip = bgClips.length ? bgClips[clipIndex % bgClips.length] : null;
  const vertical = piece.format === "vertical";
  const [pw, ph] = vertical ? [360, 640] : [640, 360];

  useEffect(() => {
    loadLyricFonts(piece).catch(() => undefined);
    // Fonts only depend on the words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.lines]);

  // The live preview follows the song player, through a smooth clock: the player's own time moves in steps.
  useEffect(() => {
    let frame = 0;
    const clock = mediaClock();
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const t = clock(audio.current);
        const video = videoRef.current;
        let bg: Backdrop = null;
        if (video && video.readyState >= 2) bg = { source: video, width: video.videoWidth, height: video.videoHeight };
        else if (bgImage) bg = { source: bgImage, width: bgImage.naturalWidth, height: bgImage.naturalHeight };
        drawLyricFrame(ctx, canvas.width, canvas.height, t, pieceRef.current, bg, beats, layerAssets, glyphs, cuts);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [audio, bgImage, beats, cuts, layerAssets, glyphs]);

  return (
    <div className="space-y-3">
      <div className="flex justify-center rounded-xl bg-black/90 p-3">
        <canvas
          ref={canvasRef}
          width={pw}
          height={ph}
          className={vertical ? "h-[640px] max-h-[70vh] w-auto" : "w-full"}
          aria-label="Vista previa"
        />
      </div>
      {clip && (
        <video
          ref={videoRef}
          key={clip.url}
          src={clip.url}
          muted
          loop={bgClips.length === 1}
          autoPlay
          playsInline
          onEnded={() => setClipIndex((i) => i + 1)}
          className="hidden"
        />
      )}
      <p className="text-center text-xs text-muted">La vista previa sigue al reproductor de arriba: dale play.</p>
    </div>
  );
}
